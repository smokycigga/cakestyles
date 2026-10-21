// Pure helpers that shape catalog API data for the storefront.
// Deliberately free of React so the mapping rules can be unit tested.

const DEFAULT_DESCRIPTION =
  "Handcrafted fresh daily with pure Belgian couverture & fresh dairy cream.";

/**
 * Derive the badge shown on a homepage product card.
 * With real sales data the rank is meaningful; on the Featured fallback it
 * is not, so everything is tagged SIGNATURE rather than inventing a rank.
 */
export const bestsellerTag = (product, source = "sales") => {
  if (source === "sales" && product.salesRank) {
    if (product.salesRank === 1) return "BESTSELLER";
    if (product.salesRank <= 3) return "TOP SELLER";
    return "POPULAR";
  }
  return "SIGNATURE";
};

/** Map a public API product to the flat shape the homepage carousel needs. */
export const toBestsellerCard = (product, image, source = "sales") => ({
  id: product._id || product.id,
  slug: product.slug,
  name: product.name,
  category: product.category?.name || "Patisserie",
  tag: bestsellerTag(product, source),
  price: product.basePrice ?? 0,
  image,
  description: product.shortDescription || product.description || DEFAULT_DESCRIPTION,
  variants: product.variants || [],
  salesRank: product.salesRank || 0,
  unitsSold: product.unitsSold || 0,
});

/**
 * Group products into sections following the category order set in
 * Admin > Menu. Categories without products are dropped so the menu never
 * renders an empty section.
 */
export const groupByCategoryOrder = (products, categories) => {
  const known = new Set(categories.map((category) => category.slug));
  const buckets = new Map(categories.map((category) => [category.slug, []]));
  const orphans = [];

  for (const product of products) {
    const slug = product.category?.slug;
    if (slug && known.has(slug)) buckets.get(slug).push(product);
    else orphans.push(product);
  }

  const sections = categories
    .filter((category) => buckets.get(category.slug).length > 0)
    .map((category) => ({ slug: category.slug, name: category.name, products: buckets.get(category.slug) }));

  // A product whose category is missing from the list still deserves a home
  // rather than silently vanishing from the page.
  for (const product of orphans) {
    const slug = product.category?.slug || "other";
    const existing = sections.find((section) => section.slug === slug);
    if (existing) existing.products.push(product);
    else sections.push({ slug, name: product.category?.name || "More", products: [product] });
  }

  return sections;
};

/**
 * Categories to show as filter chips: only the ones that actually have a
 * product behind them, in the admin-defined order.
 */
export const categoryChips = (categories, products) => {
  const counts = new Map();
  for (const product of products) {
    const slug = product.category?.slug;
    if (slug) counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  return categories.filter((category) => (counts.get(category.slug) || 0) > 0);
};
