const EXACT_MATCHES = {
  // Brownies
  "assorted-4-brownies": "/images/menu-items/assorted_4.png",
  "assortment-of-6-brownies": "/images/menu-items/assortment_6_brownies.png",
  "biscoff-brownie": "/images/menu-items/biscoff_brownie.png",
  "fudge-brownie": "/images/menu-items/fudge_brownie.png",
  "nutella-brownie": "/images/menu-items/nutella_brownie.png",

  // Cheesecakes
  "biscoff-cheesecake-slice": "/images/menu-items/biscoff_cheesecake_slice.png",
  "blueberry-cheesecake-slice": "/images/menu-items/blueberry_cheesecake.png",
  "nutella-cheesecake-slice": "/images/menu-items/nutella_cheesecake_slice.png",

  // Pastries
  "biscoff-pastry": "/images/menu-items/biscoff_pastry.png",
  "butterscotch-pastry": "/images/menu-items/butterscotch.png",

  // Cakes
  "black-forest-cake-500-g": "/images/menu-items/black-forest.png",
  "choco-vanilla-bento-cake-250-g": "/images/menu-items/choco-vanilla-bento.png",
  "chocolate-mousse-bento-cake-250-g": "/images/menu-items/chocolate-mousse-bento.png",
  "ferreiro-rocher-cake-500gms": "/images/menu-items/forerro_rocher.png",
  "ferrero-rocher-cake-500gms": "/images/menu-items/forerro_rocher.png",

  // Cookies, Buns, Tubs
  "chocolate-chip-cookie-small": "/images/menu-items/chocolate_chip_cookie.png",
  "korean-bun": "/images/menu-items/korean_bun.png",
  "tiramisu-tub": "/images/menu-items/tiramisu_tub.png",
};

const IMAGE_RULES = [
  // Exact / specific keyword rules to menu-items
  [/assorted.*4/i, "/images/menu-items/assorted_4.png"],
  [/assortment.*6/i, "/images/menu-items/assortment_6_brownies.png"],
  [/biscoff.*brownie/i, "/images/menu-items/biscoff_brownie.png"],
  [/nutella.*brownie/i, "/images/menu-items/nutella_brownie.png"],
  [/fudge.*brownie|brownie/i, "/images/menu-items/fudge_brownie.png"],

  [/blueberry.*cheesecake/i, "/images/menu-items/blueberry_cheesecake.png"],
  [/biscoff.*cheesecake/i, "/images/menu-items/biscoff_cheesecake_slice.png"],
  [/nutella.*cheesecake/i, "/images/menu-items/nutella_cheesecake_slice.png"],

  [/butterscotch/i, "/images/menu-items/butterscotch.png"],
  [/biscoff.*pastry/i, "/images/menu-items/biscoff_pastry.png"],
  [/biscoff.*bento/i, "/images/menu-items/biscoff_pastry.png"],

  [/black forest/i, "/images/menu-items/black-forest.png"],
  [/choco.*vanilla/i, "/images/menu-items/choco-vanilla-bento.png"],
  [/chocolate.*mousse.*bento/i, "/images/menu-items/chocolate-mousse-bento.png"],
  [/chocolate.*mousse/i, "/images/menu-items/chocolate-mousse-bento.png"],
  [/ferreiro|ferrero/i, "/images/menu-items/forerro_rocher.png"],

  [/chocolate chip.*cookie|cookie/i, "/images/menu-items/chocolate_chip_cookie.png"],
  [/korean bun|bun/i, "/images/menu-items/korean_bun.png"],
  [/tiramisu/i, "/images/menu-items/tiramisu_tub.png"],

  // Fallback category rules
  [/blueberry/i, "/images/menu-items/blueberry_cheesecake.png"],
  [/biscoff|lotus/i, "/images/menu-items/biscoff_pastry.png"],
  [/red velvet/i, "/images/products/redvelvet.webp"],
  [/caramel/i, "/images/products/caramel.webp"],
  [/strawberry/i, "/images/products/strawberry.webp"],
  [/lemon/i, "/images/products/lemon.webp"],
  [/oreo/i, "/images/products/oreo.webp"],
  [/vanilla/i, "/images/products/vanilla.webp"],
  [/raspberry/i, "/images/products/raspberry.webp"],
  [/chocolate|truffle/i, "/images/products/chocolate.webp"],
];

export const productImage = (product) => {
  const uploaded = product?.images?.find(Boolean);
  if (uploaded) return uploaded;

  const slug = product?.slug || "";
  if (slug && EXACT_MATCHES[slug]) {
    return EXACT_MATCHES[slug];
  }

  const label = `${product?.name || ""} ${product?.category?.name || ""} ${slug}`;
  const matched = IMAGE_RULES.find(([pattern]) => pattern.test(label));
  if (matched) return matched[1];

  // Nothing matched. Return null so the UI can render a neutral placeholder —
  // guessing a photo of a different product is worse than showing none.
  return null;
};

export const getProductImage = productImage;
export default productImage;

