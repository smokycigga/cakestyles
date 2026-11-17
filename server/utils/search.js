// Product search that behaves the way people type.
//
// The old implementation built one substring regex from the whole query, so
// "chocolate truffle" only matched when those two words appeared adjacent and
// in that order, and "cat" matched nothing at all — substring matching looks
// for "cat" *inside* a word, never at the start of one.
//
// So: split the query into words, match each word at the start of a word, and
// require every word to land somewhere. Order stops mattering, extra words stop
// mattering, and typing a prefix ("cat", "choc", "truf") finds the full name.

/** Escape a literal string for use inside a RegExp. */
export const escapeSearchRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Cap the number of words we honour. Six is already far past anything a person
// types into a bakery search box, and it bounds the size of the generated query.
const MAX_TOKENS = 6;

/**
 * Split a query into lowercase word tokens. Anything that isn't a letter or a
 * digit is a separator, so "chocolate-truffle", "chocolate_truffle" and
 * "chocolate, truffle" all behave the same.
 */
export const searchTokens = (value) =>
  String(value ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
    .slice(0, MAX_TOKENS);

/**
 * Regex matching `token` at the start of any word.
 *
 * \b is a zero-width assertion, so /\btruf/ matches "Truffle" and "truffle" but
 * not "untruffled". Applied to an array field (tags) Mongo tests every element.
 */
export const prefixPattern = (token) => new RegExp(`\\b${escapeSearchRegex(token)}`, "i");

/** True when `text` contains a word starting with `token` (case-insensitive). */
export const hasWordStartingWith = (text, token) => {
  const haystack = String(text ?? "").toLowerCase();
  if (!haystack || !token) return false;
  let index = haystack.indexOf(token);
  while (index !== -1) {
    if (index === 0 || !/[\p{L}\p{N}]/u.test(haystack[index - 1])) return true;
    index = haystack.indexOf(token, index + 1);
  }
  return false;
};

// ---------------------------------------------------------------------------
// Typo tolerance
//
// Prefix matching fixes "truf" -> "Truffle" but not a mistyped one, and the
// shopkeeper's own example — "cat" should reach "Cakes" — is one keystroke away
// from the real word rather than a prefix of it. So the last resort is a
// one-edit comparison against the start of each word: "cat" vs "cak" is a
// single substitution, "trufel" vs "truffl" likewise.
//
// One edit, not two: at two edits every short token matches half the catalogue
// and the results stop meaning anything.
// ---------------------------------------------------------------------------

const words = (text) =>
  String(text ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Levenshtein distance, capped: returns 2 as soon as it cannot be 0 or 1. */
const editDistanceAtMostOne = (a, b) => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;

  // Classic two-row DP, but bail out once the cheapest cell exceeds one.
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }
    if (rowMin > 1) return 2;
    previous = current;
  }
  return previous[b.length] > 1 ? 2 : previous[b.length];
};

/** Minimum token length for the typo pass — shorter words match too much. */
export const MIN_FUZZY_LENGTH = 3;

/**
 * True when `text` has a word that is one typo away from `token`.
 *
 * Two comparisons, because the two common mistakes look different:
 *   - against the word's first `token.length` characters, which is what makes
 *     "cat" reach "Cakes" (one substitution, "cak")
 *   - against the whole word, which is what makes "choclate" reach
 *     "Chocolate" (one transposition — the prefix comparison drifts out of
 *     alignment and scores it as four edits instead of one)
 */
export const fuzzyWordMatch = (text, token) => {
  if (token.length < MIN_FUZZY_LENGTH) return false;
  return words(text).some(
    (word) =>
      editDistanceAtMostOne(token, word.slice(0, token.length)) <= 1 ||
      editDistanceAtMostOne(token, word) <= 1,
  );
};

/** Every token must land on at least one of the values. */
export const fuzzyValuesMatch = (values, tokens) =>
  tokens.every((token) => values.some((value) => fuzzyWordMatch(value, token)));


/**
 * Build the search clause for a set of product fields.
 *
 * Returns `{ strict, relaxed }` or null when the query has no words:
 *   strict  — every word must appear (in any order, any field)
 *   relaxed — any word may appear
 *
 * Callers try strict first and fall back to relaxed, so "chocolate truffle"
 * narrows when it can and still surfaces the truffle cakes when the catalogue
 * has no chocolate-truffle entry.
 *
 * `extraFor(token)` lets a caller add non-field branches per word — the
 * category name is the useful one, since "cat" should reach the Cakes shelf
 * even though the word "cat" appears in no product name.
 */
export const buildSearch = (query, fields, extraFor) => {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return null;

  const branches = tokens.map((token) => {
    const pattern = prefixPattern(token);
    const clause = { $or: fields.map((field) => ({ [field]: pattern })) };
    const extra = extraFor?.(token, pattern) || [];
    if (extra.length > 0) clause.$or.push(...extra);
    return clause;
  });

  return { tokens, strict: { $and: branches }, relaxed: { $or: branches } };
};

/**
 * Run a search with the strict → relaxed → typo-tolerant strategy.
 *
 * `exec(filter)` must return a promise of an array. Each later pass only runs
 * when the one before it found nothing, so the common case stays one query.
 *
 * `fuzzyExec(tokens)` is optional and does the last pass in memory — that is
 * the only way to tolerate a mistyped word, since MongoDB cannot index "close
 * enough". Callers should keep the set it scans small.
 */
export const searchWithFallback = async (buildFilter, query, fields, exec, extraFor, fuzzyExec) => {
  const search = buildSearch(query, fields, extraFor);
  if (!search) return exec(buildFilter(null));

  const strict = await exec(buildFilter(search.strict));
  if (strict.length > 0) return strict;

  const relaxed = await exec(buildFilter(search.relaxed));
  if (relaxed.length > 0 || !fuzzyExec) return relaxed;

  return fuzzyExec(search.tokens);
};

