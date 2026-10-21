import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, MapPin, ShoppingBag, Store, Truck } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../lib/api";
import { useCart } from "../store/CartContext";
import { useSettings } from "../store/SettingsContext";
import { useFulfilment } from "../store/FulfilmentContext";
import { inr } from "../lib/format";

const METHOD_LABELS = { razorpay: "Pay online with Razorpay", upi: "UPI on pickup / delivery", cash: "Cash on pickup / delivery", bank_transfer: "Bank transfer", card: "Card" };
const inputClass = "mt-1.5 w-full rounded-xl border border-wine-100 bg-white px-4 py-3 text-sm outline-none transition focus:border-wine-400 focus:ring-2 focus:ring-wine-100";
const prettyDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Checkout() {
  const navigate = useNavigate();
  const { cart, totalPrice, clearCart } = useCart();
  const settings = useSettings();
  const { type, date, slot, address, confirmed, updateAddress } = useFulfilment();
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [instructions, setInstructions] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [submitting, setSubmitting] = useState(false);

  const methods = useMemo(() => {
    const available = [];
    if (settings?.paymentMethods?.online?.enabled) available.push("razorpay");
    available.push(...(settings?.paymentMethods?.offline || ["upi", "cash"]));
    return [...new Set(available)];
  }, [settings]);
  const selectedPayment = methods.includes(paymentMethod) ? paymentMethod : methods[0] || "upi";
  const deliveryFee = type === "delivery" && settings?.delivery?.enabled
    ? Math.ceil(Number(address.distanceKm) || 0) * 18
    : 0;
  const tax = settings?.tax?.enabled && !settings.tax.inclusive ? (totalPrice * settings.tax.rate) / 100 : 0;
  const total = totalPrice + deliveryFee + tax;

  if (cart.length === 0) return <div className="mx-auto max-w-xl px-4 py-24 text-center"><ShoppingBag className="mx-auto h-10 w-10 text-wine-500" /><h1 className="mt-4 font-display text-3xl font-semibold text-wine-800">Nothing to check out</h1><Link to="/menu" className="mt-6 inline-block rounded-full bg-wine-700 px-6 py-3 text-sm font-semibold text-white">Browse menu</Link></div>;

  const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = async () => {
    const phone = form.phone.replace(/\D/g, "");
    if (!confirmed || !date || !slot) return toast.error("Please confirm your order slot from the cart");
    if (!form.name.trim() || phone.length < 8) return toast.error("Enter your name and a valid mobile number");
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return toast.error("Enter a valid email address");
    if (type === "delivery" && (!address.line1.trim() || !address.city.trim() || !address.pincode.trim())) return toast.error("Enter the full delivery address");

    setSubmitting(true);
    try {
      const body = {
        items: cart.map((item) => ({ productId: item.productId, variantName: item.variantName || undefined, quantity: item.quantity, addOns: (item.addOns || []).map((addOn) => addOn.name), notes: item.notes || undefined })),
        customer: { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() },
        fulfilment: { type, date, slot, ...(type === "delivery" ? { address } : {}) },
        specialInstructions: instructions || undefined,
        paymentMethod: selectedPayment,
      };
      const { data } = await api.post("/orders", body);
      const order = data.order;

      if (selectedPayment === "razorpay") {
        if (!window.Razorpay) throw new Error("Razorpay checkout could not be loaded");
        const payment = await api.post("/payment/create-order", { orderId: order._id, checkoutToken: data.checkoutToken });
        await new Promise((resolve, reject) => {
          const razorpay = new window.Razorpay({
            key: payment.data.keyId,
            amount: payment.data.amount,
            currency: "INR",
            name: settings?.store?.name || "Cakestyles",
            description: `Order ${order.orderNumber}`,
            order_id: payment.data.rpOrderId,
            prefill: { name: form.name, contact: form.phone, email: form.email },
            theme: { color: "#6d2141" },
            handler: async (response) => {
              try { await api.post("/payment/verify", { orderId: order._id, checkoutToken: data.checkoutToken, ...response }); resolve(); }
              catch (error) { reject(error); }
            },
            modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
          });
          razorpay.open();
        });
      }

      clearCart();
      navigate(`/order-confirmed/${order.orderNumber}?phone=${encodeURIComponent(form.phone.trim())}`, { state: { order } });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-8 pt-5 sm:px-6">
      <div className="mb-8 flex items-center gap-4"><button onClick={() => navigate(-1)} className="rounded-full border border-wine-100 bg-white p-2.5 text-wine-700"><ArrowLeft className="h-5 w-5" /></button><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-wine-500">Final step</p><h1 className="font-display text-3xl font-semibold text-wine-800">Checkout</h1></div></div>

      <section className="space-y-5">
        <label className="block"><span className="text-sm font-medium text-cocoa-700">Name *</span><input value={form.name} onChange={setField("name")} autoComplete="name" className={inputClass} /></label>
        <label className="block"><span className="text-sm font-medium text-cocoa-700">Email</span><input value={form.email} onChange={setField("email")} type="email" autoComplete="email" className={inputClass} /></label>
        <label className="block"><span className="text-sm font-medium text-cocoa-700">Mobile number for order notifications *</span><div className="mt-1.5 flex rounded-xl border border-wine-100 bg-white focus-within:border-wine-400 focus-within:ring-2 focus-within:ring-wine-100"><span className="border-r border-wine-100 px-4 py-3 text-sm text-cocoa-500">+91</span><input value={form.phone} onChange={setField("phone")} inputMode="tel" autoComplete="tel" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none" /></div></label>
      </section>

      <section className="mt-6 border-y border-wine-100 py-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-wine-50 text-wine-700">{type === "delivery" ? <Truck className="h-4 w-4" /> : <Store className="h-4 w-4" />}</span><div><p className="text-xs font-semibold uppercase tracking-wide text-wine-600">Your order slot</p><p className="mt-1 text-sm font-medium text-cocoa-900">{prettyDate(date)}, {slot}</p><p className="text-xs text-cocoa-400">Based on items in your cart.</p></div></div></section>

      {type === "delivery" && <section className="border-b border-wine-100 py-5"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-cocoa-900"><MapPin className="h-4 w-4 text-wine-600" /> Delivery address</div><div className="grid gap-3"><input value={address.line1} onChange={(event) => updateAddress("line1", event.target.value)} placeholder="Address line" className={inputClass} /><input value={address.line2} onChange={(event) => updateAddress("line2", event.target.value)} placeholder="Landmark or area" className={inputClass} /><div className="grid grid-cols-2 gap-3"><input value={address.city} onChange={(event) => updateAddress("city", event.target.value)} placeholder="City" className={inputClass} /><input value={address.pincode} onChange={(event) => updateAddress("pincode", event.target.value)} placeholder="Pincode" inputMode="numeric" className={inputClass} /></div></div></section>}

      <section className="border-b border-wine-100 py-5"><label className="text-sm font-medium text-cocoa-700">Add more instructions</label><textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={2} className={inputClass} placeholder="Optional" /></section>

      <section className="py-5"><h2 className="mb-3 text-sm font-semibold text-cocoa-900">Payment method</h2><div className="space-y-2">{methods.map((method) => <label key={method} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${selectedPayment === method ? "border-wine-600 bg-wine-50" : "border-wine-100 bg-white"}`}><input type="radio" checked={selectedPayment === method} onChange={() => setPaymentMethod(method)} className="accent-wine-700" />{METHOD_LABELS[method] || method}</label>)}</div></section>

      <section className="mt-8 border-t border-wine-100 pt-5"><div className="space-y-2 text-sm text-cocoa-500"><div className="flex justify-between"><span>Items</span><span>{inr(totalPrice)}</span></div>{tax > 0 && <div className="flex justify-between"><span>{settings.tax.label}</span><span>{inr(tax)}</span></div>}{type === "delivery" && <div className="flex justify-between"><span>Delivery</span><span>{deliveryFee ? inr(deliveryFee) : "Free"}</span></div>}</div><div className="mt-4 flex justify-between text-xl font-semibold text-cocoa-900"><span>To pay</span><span>{inr(total)}</span></div><button onClick={submit} disabled={submitting} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-60">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}{selectedPayment === "razorpay" ? "Pay now" : "Place order"}</button></section>
    </div>
  );
}
