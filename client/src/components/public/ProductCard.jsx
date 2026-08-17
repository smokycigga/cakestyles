import { Link } from "react-router-dom";
import { inr } from "../../lib/format";

const TAG_STYLES = {
  bestseller: "bg-wine-600 text-white",
  new: "bg-emerald-600 text-white",
  eggless: "bg-cream-200 text-cocoa-700",
  seasonal: "bg-amber-500 text-white",
  custom: "bg-indigo-600 text-white",
};

export const Placeholder = ({ name, className = "" }) => {
  const palette = [
    "from-wine-200 to-blush-200",
    "from-blush-200 to-cream-200",
    "from-wine-100 to-wine-300",
    "from-cream-200 to-blush-100",
  ];
  const idx = String(name || "?").length % palette.length;
  const initial = String(name || "?").trim()[0]?.toUpperCase() || "C";
  return (
    <div className={`bg-gradient-to-br ${palette[idx]} flex items-center justify-center ${className}`}>
      <span className="font-display text-4xl text-wine-700/60">{initial}</span>
    </div>
  );
};

export default function ProductCard({ product }) {
  const image = product.images?.[0];
  const priceFrom = product.variants?.length
    ? Math.min(...product.variants.map((v) => v.price))
    : product.basePrice;
  const browseOnly = product.orderability === "browse_only";
  const soldOut = product.availability === "sold_out";

  return (
    <Link
      to={`/menu/product/${product.slug}`}
      className="group bg-white rounded-2xl overflow-hidden border border-wine-100 hover:border-wine-300 hover:shadow-lg hover:shadow-wine-100 transition-all"
    >
      <div className="relative aspect-square overflow-hidden">
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <Placeholder name={product.name} className="w-full h-full" />
        )}
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
          {(product.tags || []).slice(0, 2).map((t) => (
            <span
              key={t}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${TAG_STYLES[t] || "bg-white/90 text-cocoa-700"}`}
            >
              {t}
            </span>
          ))}
        </div>
        {soldOut && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="px-4 py-2 rounded-full bg-cocoa-900/80 text-white text-sm font-medium">Sold Out</span>
          </div>
        )}
        {!soldOut && product.availability === "paused" && (
          <div className="absolute bottom-2 left-2">
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-semibold uppercase">
              Back Soon
            </span>
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-medium text-cocoa-900 group-hover:text-wine-700 transition-colors leading-snug">
          {product.name}
        </h3>
        {product.shortDescription && (
          <p className="text-xs text-cocoa-500 mt-1 line-clamp-2">{product.shortDescription}</p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-wine-700">
            {browseOnly ? "On Request" : priceFrom > 0 ? `${product.variants?.length ? "From " : ""}${inr(priceFrom)}` : "Free"}
          </span>
          <span
            className={`text-xs font-medium px-3 py-1.5 rounded-full ${
              browseOnly || soldOut
                ? "bg-cream-100 text-cocoa-500"
                : "bg-wine-600 text-white group-hover:bg-wine-700"
            }`}
          >
            {browseOnly ? "Enquire" : soldOut ? "Unavailable" : "Add to Cart"}
          </span>
        </div>
      </div>
    </Link>
  );
}
