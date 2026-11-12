// Edge caching for the anonymous storefront reads.
//
// Every product, category and settings read is identical for every visitor, yet
// each one used to cost a serverless invocation plus a round trip to Atlas. The
// CDN can hold those responses instead, so a menu view that used to wait for
// the database is served from the edge in a few milliseconds.
//
// `stale-while-revalidate` is the important half: when the entry expires the
// edge still answers instantly with the old copy and refreshes it in the
// background, so nobody ever waits for the revalidation.
//
// Authenticated requests are deliberately left uncached: the admin screens hit
// the same URLs with an Authorization header and expect to see their own edits
// immediately (e.g. GET /categories?all=1, which includes hidden categories).
const cacheValue = (seconds) =>
  `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 10}`;

export const publicCache = (seconds = 30) => (req, res, next) => {
  if (req.method !== "GET" || req.headers.authorization) return next();

  const value = cacheValue(seconds);
  res.set("Cache-Control", value);
  // Vercel reads CDN-Cache-Control first, then Vercel-CDN-Cache-Control; setting
  // both keeps the behaviour identical behind any other proxy in front of it.
  res.set("CDN-Cache-Control", value);
  res.set("Vercel-CDN-Cache-Control", value);
  next();
};

export default publicCache;
