import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { inr } from "../../lib/format";
import { productImage } from "../../lib/productImage";

const TAG_STYLES = {
  bestseller: "bg-wine-700 text-white",
  new: "bg-emerald-600 text-white",
  eggless: "bg-cream-200 text-cocoa-700",
  veg: "bg-emerald-50 text-emerald-700",
  seasonal: "bg-amber-500 text-white",
  custom: "bg-indigo-600 text-white",
};

export const Placeholder = ({ name, className = "" }) => {
  const initial = String(name || "C").trim()[0]?.toUpperCase() || "C";
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-wine-100 to-blush-200 ${className}`}>
      <span className="font-display text-4xl text-wine-700/60">{initial}</span>
    </div>
  );
};

export default function ProductCard({ product, layout = "grid" }) {
  const image = productImage(product);
  const priceFrom = product.variants?.length
    ? Math.min(...product.variants.map((variant) => variant.price))
    : product.basePrice;
  const browseOnly = product.orderability === "browse_only";
  const unavailable = product.availability === "sold_out" || product.availability === "paused";
  const list = layout === "list";

  return (
    <Link
      to={`/menu/product/${product.slug}`}
      className={`group overflow-hidden border border-wine-100 bg-white transition-all hover:border-wine-300 hover:shadow-xl hover:shadow-wine-900/8 ${
        list ? "grid min-h-44 grid-cols-[42%_1fr] rounded-2xl" : "block rounded-2xl"
      }`}
    >
      <div className={`relative overflow-hidden ${list ? "h-full min-h-44" : "aspect-square"}`}>
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <Placeholder name={product.name} className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {product.salesRank && (
            <span className="rounded-full bg-wine-800 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
              #{product.salesRank} bestseller
            </span>
          )}
          {(product.tags || []).slice(0, 2).map((tag) => (
            <span key={tag} className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${TAG_STYLES[tag] || "bg-white/90 text-cocoa-700"}`}>
              {tag}
            </span>
          ))}
        </div>
        {unavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/65 backdrop-blur-[1px]">
            <span className="rounded-full bg-cocoa-900/85 px-3 py-1.5 text-xs font-medium text-white">
              {product.availability === "sold_out" ? "Sold out" : "Back soon"}
            </span>
          </div>
        )}
      </div>

      <div className={`flex min-w-0 flex-col ${list ? "p-4" : "p-4"}`}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="font-medium leading-snug text-cocoa-900 transition-colors group-hover:text-wine-700">{product.name}</h3>
          <span className="mt-0.5 h-3 w-3 shrink-0 border border-emerald-500 p-0.5" aria-label="Vegetarian">
            <span className="block h-full w-full rounded-full bg-emerald-500" />
          </span>
        </div>
        {product.shortDescription && (
          <p className={`text-xs leading-relaxed text-cocoa-500 ${list ? "line-clamp-3" : "line-clamp-2"}`}>{product.shortDescription}</p>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <span className="text-sm font-semibold text-cocoa-900">
            {browseOnly ? "On request" : `${product.variants?.length ? "From " : ""}${inr(priceFrom)}`}
          </span>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${browseOnly || unavailable ? "text-cocoa-400" : "text-emerald-700"}`}>
            {browseOnly ? "Enquire" : unavailable ? "Unavailable" : "Add"}
            {!browseOnly && !unavailable && <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />}
          </span>
        </div>
      </div>
    </Link>
  );
}
