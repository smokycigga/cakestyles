const IMAGE_RULES = [
  [/blueberry/i, "/images/products/blueberry.png"],
  [/biscoff|lotus/i, "/images/products/lotus.png"],
  [/black forest|red velvet/i, "/images/products/redvelvet.png"],
  [/butterscotch|caramel|korean bun/i, "/images/products/caramel.png"],
  [/tiramisu|coffee/i, "/images/products/coffee.png"],
  [/strawberry/i, "/images/products/strawberry.png"],
  [/lemon/i, "/images/products/lemon.png"],
  [/oreo|cookie/i, "/images/products/oreo.png"],
  [/vanilla/i, "/images/products/vanilla.png"],
  [/raspberry/i, "/images/products/raspberry.png"],
];

const FALLBACKS = [
  "/images/products/chocolate.png",
  "/images/products/lotus.png",
  "/images/products/caramel.png",
  "/images/products/coffee.png",
];

export const productImage = (product) => {
  const uploaded = product?.images?.find(Boolean);
  if (uploaded) return uploaded;

  const label = `${product?.name || ""} ${product?.category?.name || ""}`;
  const matched = IMAGE_RULES.find(([pattern]) => pattern.test(label));
  if (matched) return matched[1];

  const key = product?.slug || product?.name || "cake";
  const hash = [...key].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return FALLBACKS[hash % FALLBACKS.length];
};
