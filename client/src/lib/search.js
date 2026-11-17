// Client-side twin of server/utils/search.js — same rules, so the storefront
// menu and the admin pickers agree with the API about what a query matches.
//
// Rules: split the query into words, match each word at the start of a word in
// any searchable field, and require every word to land somewhere. So
// "chocolate truffle" and "truffle chocolate" behave identically, and "cat"
// finds "Cakes" without also finding "Bobcat".

const MAX_TOKENS = 6;

export const tokenize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
    .slice(0, MAX_TOKENS);

/** True when `text` has a word beginning with `token` (case-insensitive). */
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

/** Every searchable string on a product, including the shelf it sits on. */
export const productSearchValues = (product) =>
  [
    product?.name,
    product?.shortDescription,
    product?.sku,
    product?.category?.name,
    ...(product?.tags || []),
  ]
    .filter(Boolean)
    .map(String);

const matchesEveryToken = (values, tokens) =>
  tokens.every((token) => values.some((value) => hasWordStartingWith(value, token)));

const matchesAnyToken = (values, tokens) =>
  tokens.some((token) => values.some((value) => hasWordStartingWith(value, token)));

// --- typo tolerance -------------------------------------------------------
// Mirrors server/utils/search.js: compare the token against the first
// `token.length` characters of each word and accept one edit. This is what
// turns "cat" into a match for "Cakes" — a keystroke away, not a prefix of it.

const words = (text) =>
  String(text ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const withinOneEdit = (a, b) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }
    if (rowMin > 1) return false;
    previous = current;
  }
  return previous[b.length] <= 1;
};

export const MIN_FUZZY_LENGTH = 3;

/**
 * One typo away, by either of the two routes that matter:
 * the word's first `token.length` characters ("cat" -> "cak" in "Cakes"), or
 * the whole word ("choclate" -> "chocolate").
 */
export const fuzzyWordMatch = (text, token) => {
  if (token.length < MIN_FUZZY_LENGTH) return false;
  return words(text).some(
    (word) => withinOneEdit(token, word.slice(0, token.length)) || withinOneEdit(token, word),
  );
};

const matchesFuzzy = (values, tokens) =>
  tokens.every((token) => values.some((value) => fuzzyWordMatch(value, token)));

/**
 * Filter a list by a query string.
 *
 * Three passes, each only running when the previous found nothing:
 *   1. every word matches at a word start (precise)
 *   2. any word matches at a word start (over-specific query)
 *   3. every word is within one typo of a word start (mistyped query)
 */
export const filterBySearch = (items, query, valuesOf = productSearchValues) => {
  const tokens = tokenize(query);
  if (tokens.length === 0) return items;

  const scored = items.map((item) => ({ item, values: valuesOf(item) }));

  const strict = scored.filter((entry) => matchesEveryToken(entry.values, tokens));
  if (strict.length > 0) return strict.map((entry) => entry.item);

  const relaxed = scored.filter((entry) => matchesAnyToken(entry.values, tokens));
  if (relaxed.length > 0) return relaxed.map((entry) => entry.item);

  return scored.filter((entry) => matchesFuzzy(entry.values, tokens)).map((entry) => entry.item);
};

