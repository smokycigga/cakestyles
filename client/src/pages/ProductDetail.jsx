import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Minus, Plus, ShoppingBag, ArrowLeft, Clock3 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api";
import { inr } from "../lib/format";
import { useCart } from "../store/CartContext";
import { Placeholder } from "../components/public/ProductCard";

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [variant, setVariant] = useState("");
  const [addOns, setAddOns] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .get(`/products/slug/${slug}`)
      .then((r) => {
        const p = r.data.product;
        setProduct(p);
        setVariant(p.variants?.[0]?.name || "");
        document.title = `${p.name} — Cakestyles`;
      })
      .catch(() => navigate("/menu"))
      .finally(() => setLoading(false));
  }, [slug, navigate]);

  const selectedVariant = useMemo(
    () => product?.variants?.find((v) => v.name === variant) || null,
    [product, variant]
  );

  const unitPrice = selectedVariant ? selectedVariant.price : product?.basePrice || 0;
  const addOnTotal = useMemo(
    () => product?.addOns?.filter((a) => addOns.includes(a.name)).reduce((s, a) => s + a.price, 0) || 0,
    [product, addOns]
  );
  const lineTotal = (unitPrice + addOnTotal) * quantity;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid lg:grid-cols-2 gap-10">
        <div className="aspect-square rounded-3xl bg-wine-50 animate-pulse" />
        <div className="space-y-4">
          <div className="h-8 w-2/3 rounded bg-wine-50 animate-pulse" />
          <div className="h-4 w-full rounded bg-wine-50 animate-pulse" />
          <div className="h-4 w-3/4 rounded bg-wine-50 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!product) return null;

  const soldOut = product.availability === "sold_out";
  const paused = product.availability === "paused";
  const browseOnly = product.orderability === "browse_only";
  const orderable = !soldOut && !paused && !browseOnly;

  const handleAdd = () => {
    addToCart({
      productId: product._id,
      slug: product.slug,
      name: product.name,
      image: product.images?.[0] || "",
      variantName: variant,
      unitPrice,
      quantity,
      addOns: product.addOns.filter((a) => addOns.includes(a.name)).map((a) => ({ name: a.name, price: a.price })),
      notes,
    });
    toast.success(`${product.name} added to cart`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/menu" className="inline-flex items-center gap-1 text-sm text-cocoa-500 hover:text-wine-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to menu
      </Link>

      <div className="grid lg:grid-cols-2 gap-8 lg:gap-14">
        {/* Images */}
        <div className="space-y-3">
          {product.images?.[0] ? (
            <img src={product.images[0]} alt={product.name} className="w-full aspect-square object-cover rounded-3xl border border-wine-100" />
          ) : (
            <Placeholder name={product.name} className="w-full aspect-square rounded-3xl border border-wine-100" />
          )}
        </div>

        {/* Details */}
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            {(product.tags || []).map((t) => (
              <span key={t} className="px-2.5 py-0.5 rounded-full bg-wine-50 border border-wine-100 text-[11px] font-semibold uppercase tracking-wide text-wine-700">
                {t}
              </span>
            ))}
            {product.category?.name && (
              <span className="px-2.5 py-0.5 rounded-full bg-cream-100 text-[11px] font-medium text-cocoa-500">
                {product.category.name}
              </span>
            )}
          </div>

          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-wine-800">{product.name}</h1>
          <p className="text-cocoa-500 mt-3 leading-relaxed">{product.description}</p>

          {product.prepTimeHours > 0 && (
            <div className="inline-flex items-center gap-2 text-xs text-cocoa-500 bg-cream-100 rounded-full px-3 py-1.5 mt-4">
              <Clock3 className="w-3.5 h-3.5" />
              Needs {product.prepTimeHours >= 24 ? `${Math.round(product.prepTimeHours / 24)} day(s)` : `${product.prepTimeHours}h`} notice
            </div>
          )}

          {/* Variants */}
          {product.variants?.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-cocoa-900 mb-2">Size</h3>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => setVariant(v.name)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      variant === v.name
                        ? "border-wine-600 bg-wine-50 text-wine-800"
                        : "border-wine-100 bg-white text-cocoa-600 hover:border-wine-300"
                    }`}
                  >
                    {v.name} · {inr(v.price)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add-ons */}
          {product.addOns?.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-cocoa-900 mb-2">Add-ons</h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {product.addOns.map((a) => (
                  <label
                    key={a.name}
                    className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border cursor-pointer text-sm transition-colors ${
                      addOns.includes(a.name) ? "border-wine-600 bg-wine-50" : "border-wine-100 bg-white hover:border-wine-300"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={addOns.includes(a.name)}
                        onChange={(e) =>
                          setAddOns((prev) => (e.target.checked ? [...prev, a.name] : prev.filter((n) => n !== a.name)))
                        }
                        className="accent-wine-600"
                      />
                      {a.name}
                    </span>
                    <span className="text-wine-700 font-medium">+{inr(a.price)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Special instructions */}
          {orderable && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-cocoa-900 mb-2">Cake message / special instructions</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder='e.g. Write "Happy Birthday Aarav" on top'
                className="w-full border border-wine-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-wine-400 focus:ring-2 focus:ring-wine-100"
              />
            </div>
          )}

          {/* Quantity + price + CTA */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {orderable ? (
              <>
                <div className="inline-flex items-center border border-wine-200 rounded-full">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-2.5 hover:bg-wine-50 rounded-l-full" aria-label="Decrease">
                    <Minus className="w-4 h-4 text-wine-700" />
                  </button>
                  <span className="w-10 text-center font-medium">{quantity}</span>
                  <button onClick={() => setQuantity(Math.min(99, quantity + 1))} className="p-2.5 hover:bg-wine-50 rounded-r-full" aria-label="Increase">
                    <Plus className="w-4 h-4 text-wine-700" />
                  </button>
                </div>
                <button
                  onClick={handleAdd}
                  className="flex-1 min-w-48 inline-flex items-center justify-center gap-2 bg-wine-700 hover:bg-wine-800 text-white font-medium px-6 py-3 rounded-full transition-colors"
                >
                  <ShoppingBag className="w-4 h-4" /> Add to Cart · {inr(lineTotal)}
                </button>
              </>
            ) : browseOnly ? (
              <Link
                to="/custom-cakes"
                className="flex-1 min-w-48 inline-flex items-center justify-center gap-2 bg-wine-700 hover:bg-wine-800 text-white font-medium px-6 py-3 rounded-full transition-colors"
              >
                Enquire for Custom Order
              </Link>
            ) : (
              <div className="w-full text-center bg-cream-100 text-cocoa-600 rounded-full py-3 text-sm font-medium">
                {soldOut ? "Sold out right now — check back soon" : "Temporarily unavailable"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Structured data */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: product.shortDescription || product.description,
          offers: {
            "@type": "Offer",
            priceCurrency: "INR",
            price: unitPrice,
            availability: soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
          },
        })}
      </script>
    </div>
  );
}
