import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Minus, Plus, ShoppingCart, ArrowLeft, Clock3, Store, Truck } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api";
import { inr } from "../lib/format";
import { productImage } from "../lib/productImage";
import { useCart } from "../store/CartContext";
import { useFulfilment } from "../store/FulfilmentContext";
import SlotPicker from "../components/public/SlotPicker";

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { type, date, slot, address } = useFulfilment();
  const [loaded, setLoaded] = useState({ slug: "", product: null, error: "" });
  const [variant, setVariant] = useState("");
  const [addOns, setAddOns] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    api
      .get(`/products/slug/${slug}`)
      .then((response) => {
        const nextProduct = response.data.product;
        setLoaded({ slug, product: nextProduct, error: "" });
        setVariant(nextProduct.variants?.[0]?.name || "");
        setAddOns([]);
        setQuantity(1);
        setNotes("");
        setAdded(false);
        document.title = `${nextProduct.name} — Cakestyles`;
      })
      .catch(() => setLoaded({ slug, product: null, error: "This item is no longer available." }));
  }, [slug]);

  const product = loaded.slug === slug ? loaded.product : null;
  const loading = loaded.slug !== slug;
  const selectedVariant = useMemo(() => product?.variants?.find((item) => item.name === variant) || null, [product, variant]);
  const unitPrice = selectedVariant ? selectedVariant.price : product?.basePrice || 0;
  const selectedAddOns = useMemo(() => product?.addOns?.filter((addOn) => addOns.includes(addOn.name)) || [], [addOns, product]);
  const addOnTotal = selectedAddOns.reduce((sum, addOn) => sum + addOn.price, 0);
  const lineTotal = (unitPrice + addOnTotal) * quantity;

  if (loading) return <div className="mx-auto max-w-xl px-4 py-8"><div className="aspect-square animate-pulse rounded-3xl bg-wine-50" /><div className="mt-5 h-8 w-2/3 animate-pulse rounded bg-wine-50" /></div>;
  if (!product) return <div className="mx-auto max-w-xl px-4 py-20 text-center"><p className="text-cocoa-500">{loaded.error}</p><Link to="/menu" className="mt-5 inline-block rounded-full bg-wine-700 px-5 py-2.5 text-sm font-semibold text-white">Back to menu</Link></div>;

  const unavailable = product.availability !== "active" || product.orderability !== "online";
  const toggleAddOn = (name) => {
    setAdded(false);
    setAddOns((current) => {
      if (current.includes(name)) return current.filter((item) => item !== name);
      if (current.length >= 2) {
        toast.error("Choose up to 2 add-ons");
        return current;
      }
      return [...current, name];
    });
  };

  const handlePrimary = () => {
    if (added) return navigate("/cart");
    if (!date || !slot) return toast.error(`Please choose a ${type} date and slot`);
    if (type === "delivery" && (!address.line1 || !address.city || !address.pincode)) return toast.error("Please add a delivery address from the menu");

    addToCart({
      productId: product._id,
      slug: product.slug,
      name: product.name,
      image: productImage(product),
      variantName: variant,
      unitPrice,
      quantity,
      addOns: selectedAddOns.map((addOn) => ({ name: addOn.name, price: addOn.price })),
      notes,
      prepTimeHours: product.prepTimeHours || 0,
    });
    setAdded(true);
    toast.success(`${product.name} added to cart`);
  };

  return (
    <div className="mx-auto max-w-xl px-4 pb-28 pt-5 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/menu" className="rounded-full border border-wine-100 bg-white p-2.5 text-wine-700" aria-label="Back to menu"><ArrowLeft className="h-5 w-5" /></Link>
        <Link to="/cart" className="rounded-full border border-wine-100 bg-white p-2.5 text-wine-700" aria-label="Cart"><ShoppingCart className="h-5 w-5" /></Link>
      </div>

      <img src={productImage(product)} alt={product.name} className="aspect-square w-full rounded-3xl object-cover shadow-xl shadow-wine-900/10" />

      <div className="mt-5 border-b border-wine-100 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-2 h-3 w-3 shrink-0 border border-emerald-500 p-0.5"><span className="block h-full w-full rounded-full bg-emerald-500" /></span>
            <h1 className="font-display text-2xl font-semibold text-wine-800">{product.name}</h1>
          </div>
          <span className="shrink-0 text-lg font-semibold text-cocoa-900">{inr(unitPrice)}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-cocoa-500">{product.description}</p>
        {product.prepTimeHours > 0 && <p className="mt-3 inline-flex items-center gap-2 text-xs text-wine-600"><Clock3 className="h-4 w-4" /> Requires {product.prepTimeHours}h preparation</p>}
      </div>

      {product.variants?.length > 0 && (
        <section className="border-b border-wine-100 py-5">
          <h2 className="mb-3 text-sm font-semibold text-cocoa-900">Choose size</h2>
          <div className="flex flex-wrap gap-2">{product.variants.map((item) => <button key={item.name} onClick={() => { setVariant(item.name); setAdded(false); }} className={`rounded-full border px-4 py-2 text-xs font-semibold ${variant === item.name ? "border-wine-700 bg-wine-700 text-white" : "border-wine-100 bg-white text-cocoa-600"}`}>{item.name} · {inr(item.price)}</button>)}</div>
        </section>
      )}

      <section className="border-b border-wine-100 py-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-cocoa-900">{type === "delivery" ? "Delivery slot" : "Pick-up slot"}</h2><span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-wine-500">{type === "delivery" ? <Truck className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}{type}</span></div>
        <SlotPicker prepTimeHours={product.prepTimeHours || 0} />
      </section>

      {product.addOns?.length > 0 && (
        <section className="border-b border-wine-100 py-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-cocoa-900">Add-ons</h2><span className="text-xs text-cocoa-400">({addOns.length}/2)</span></div>
          <div className="space-y-1">{product.addOns.map((addOn) => {
            const selected = addOns.includes(addOn.name);
            return <button key={addOn.name} onClick={() => toggleAddOn(addOn.name)} className="flex w-full items-center justify-between rounded-xl px-2 py-3 text-left transition hover:bg-wine-50"><span className="text-sm text-cocoa-600">{addOn.name}</span><span className="text-right"><span className="block text-xs text-cocoa-500">+{inr(addOn.price)}</span><span className={`text-xs font-semibold ${selected ? "text-wine-700" : "text-emerald-700"}`}>{selected ? "REMOVE" : "ADD"}</span></span></button>;
          })}</div>
        </section>
      )}

      <section className="py-5"><label className="text-sm font-semibold text-cocoa-900">Cake message or instructions</label><textarea value={notes} onChange={(event) => { setNotes(event.target.value); setAdded(false); }} rows={2} maxLength={300} placeholder="Optional instructions for the kitchen" className="mt-2 w-full rounded-xl border border-wine-100 bg-white px-4 py-3 text-sm outline-none focus:border-wine-400 focus:ring-2 focus:ring-wine-100" /></section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-wine-100 bg-cream-50/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-3">
          <div className="flex items-center rounded-xl border border-wine-200 bg-white"><button onClick={() => { setQuantity(Math.max(1, quantity - 1)); setAdded(false); }} className="p-3" aria-label="Decrease"><Minus className="h-4 w-4" /></button><span className="w-8 text-center text-sm font-semibold">{quantity}</span><button onClick={() => { setQuantity(Math.min(99, quantity + 1)); setAdded(false); }} className="p-3" aria-label="Increase"><Plus className="h-4 w-4" /></button></div>
          <button onClick={handlePrimary} disabled={unavailable} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:bg-cocoa-400">
            <ShoppingCart className="h-4 w-4" /> {unavailable ? "Unavailable" : added ? "Go to cart" : `Add to cart · ${inr(lineTotal)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
