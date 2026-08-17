import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock3, MapPin, Minus, Plus, ShoppingBag, Store, Tag, Trash2, Truck, X } from "lucide-react";
import toast from "react-hot-toast";
import { useCart } from "../store/CartContext";
import { useSettings } from "../store/SettingsContext";
import { useFulfilment } from "../store/FulfilmentContext";
import { inr } from "../lib/format";
import SlotPicker from "../components/public/SlotPicker";

const prettyDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Choose date";

export default function Cart() {
  const { cart, setQuantity, removeItem, totalPrice, itemKey } = useCart();
  const settings = useSettings();
  const { type, date, slot, address, confirmed, confirmFulfilment } = useFulfilment();
  const navigate = useNavigate();
  const [slotOpen, setSlotOpen] = useState(false);
  const maxPrepHours = cart.reduce((max, item) => Math.max(max, item.prepTimeHours || 0), 0);
  const deliveryFee = type === "delivery" && settings?.delivery?.enabled && !(settings.delivery.freeOver > 0 && totalPrice >= settings.delivery.freeOver) ? settings.delivery.fee || 0 : 0;
  const tax = settings?.tax?.enabled && !settings.tax.inclusive ? (totalPrice * settings.tax.rate) / 100 : 0;
  const total = totalPrice + deliveryFee + tax;

  if (cart.length === 0) return <div className="mx-auto max-w-xl px-4 py-24 text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-wine-50 text-wine-600"><ShoppingBag className="h-7 w-7" /></span><h1 className="mt-5 font-display text-3xl font-semibold text-wine-800">Your cart is empty</h1><p className="mt-2 text-sm text-cocoa-500">Something sweet is waiting on the menu.</p><Link to="/menu" className="mt-6 inline-block rounded-full bg-wine-700 px-6 py-3 text-sm font-semibold text-white">Browse menu</Link></div>;

  const continueCheckout = () => {
    if (!slot) return toast.error(`Choose a ${type} slot`);
    if (type === "delivery" && (!address.line1 || !address.city || !address.pincode)) return toast.error("Add a complete delivery address");
    confirmFulfilment();
    setSlotOpen(false);
    navigate("/checkout");
  };

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-8 pt-5 sm:px-6">
      <div className="mb-8 flex items-center gap-4"><Link to="/menu" className="rounded-full border border-wine-100 bg-white p-2.5 text-wine-700"><ArrowLeft className="h-5 w-5" /></Link><div><h1 className="font-display text-3xl font-semibold text-wine-800">Your order</h1><p className="text-xs text-cocoa-400">from Cakestyles</p></div></div>

      <div className="divide-y divide-wine-100 border-y border-wine-100">
        {cart.map((item) => {
          const itemId = itemKey(item);
          const addOnSum = (item.addOns || []).reduce((sum, addOn) => sum + addOn.price, 0);
          return <article key={itemId} className="py-5"><div className="flex gap-4"><img src={item.image} alt={item.name} className="h-20 w-20 rounded-xl object-cover" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="font-medium text-cocoa-900">{item.name}</h2><p className="mt-1 text-xs text-cocoa-400">{prettyDate(date)}, {slot || "slot not selected"}</p>{item.addOns?.length > 0 && <p className="mt-1 text-xs text-wine-600">+ {item.addOns.map((addOn) => addOn.name).join(", ")}</p>}</div><button onClick={() => removeItem(itemId)} className="p-1.5 text-cocoa-400 hover:text-wine-700" aria-label="Remove"><Trash2 className="h-4 w-4" /></button></div><div className="mt-4 flex items-center justify-between"><div className="flex items-center border border-wine-200 bg-white"><button onClick={() => setQuantity(itemId, item.quantity - 1)} className="p-2"><Minus className="h-3.5 w-3.5" /></button><span className="w-8 text-center text-sm">{item.quantity}</span><button onClick={() => setQuantity(itemId, item.quantity + 1)} className="p-2"><Plus className="h-3.5 w-3.5" /></button></div><span className="font-semibold text-cocoa-900">{inr((item.unitPrice + addOnSum) * item.quantity)}</span></div></div></div></article>;
        })}
      </div>

      <button onClick={() => setSlotOpen(true)} className="mt-5 flex w-full items-center justify-between rounded-2xl border border-wine-100 bg-white p-4 text-left shadow-sm"><span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-wine-50 text-wine-700">{type === "delivery" ? <Truck className="h-4 w-4" /> : <Store className="h-4 w-4" />}</span><span><span className="block text-xs font-semibold uppercase tracking-wide text-wine-600">{type === "delivery" ? "Delivery" : "Pickup"} slot</span><span className="block text-xs text-cocoa-500">{prettyDate(date)} · {slot || "Select a time"}</span></span></span><span className="text-xs font-semibold text-wine-700">Change</span></button>

      <div className="mt-10 border-y border-wine-100 py-4"><button className="flex w-full items-center justify-between text-sm text-cocoa-700"><span className="inline-flex items-center gap-2"><Tag className="h-4 w-4" /> Apply coupon</span><span>›</span></button></div>

      <div className="space-y-2 py-5 text-sm"><div className="flex justify-between text-cocoa-500"><span>Item subtotal</span><span>{inr(totalPrice)}</span></div>{settings?.tax?.enabled && <div className="flex justify-between text-cocoa-500"><span>{settings.tax.label} {settings.tax.rate ? `(${settings.tax.rate}%)` : ""}</span><span>{settings.tax.inclusive ? "Included" : inr(tax)}</span></div>}{type === "delivery" && <div className="flex justify-between text-cocoa-500"><span>Delivery charges</span><span>{deliveryFee ? inr(deliveryFee) : "Free"}</span></div>}<div className="flex justify-between border-t border-wine-100 pt-3 text-xl font-semibold text-cocoa-900"><span>To pay</span><span>{inr(total)}</span></div></div>
      <button onClick={() => setSlotOpen(true)} className="w-full rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-800">Proceed</button>
      {confirmed && <p className="mt-2 text-center text-[11px] text-cocoa-400">Your selected slot is confirmed for this checkout.</p>}

      {slotOpen && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-cocoa-900/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setSlotOpen(false); }}><section className="w-full rounded-t-3xl bg-cream-50 p-6 shadow-2xl sm:max-w-lg sm:rounded-3xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-wine-500">Your order slot</p><h2 className="mt-1 font-display text-2xl font-semibold text-wine-800">Confirm {type} time</h2></div><button onClick={() => setSlotOpen(false)} className="rounded-full p-2 text-cocoa-500"><X className="h-5 w-5" /></button></div><p className="mt-3 text-sm text-cocoa-500">Based on the preparation time of the items in your cart.</p><SlotPicker className="mt-6" prepTimeHours={maxPrepHours} /><div className="mt-5 flex items-start gap-3 rounded-2xl bg-amber-100 px-4 py-3 text-amber-900"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><p className="text-xs leading-5">{prettyDate(date)} · {slot || "Choose a time above"}{type === "delivery" && address.line1 ? <><br /><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{address.line1}</span></> : null}</p></div><button onClick={continueCheckout} className="mt-5 w-full rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-semibold text-white">Confirm slot</button></section></div>}
    </div>
  );
}
