import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, ShoppingBag } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../lib/api";
import { useCart } from "../store/CartContext";
import { useSettings } from "../store/SettingsContext";
import { inr, daysFromNow } from "../lib/format";

const METHOD_LABELS = {
  razorpay: "Pay Online (Razorpay)",
  upi: "UPI on pickup / delivery",
  cash: "Cash on pickup / delivery",
  bank_transfer: "Bank Transfer",
};

export default function Checkout() {
  const navigate = useNavigate();
  const { cart, totalPrice, clearCart } = useCart();
  const settings = useSettings();

  const [fulfilmentType, setFulfilmentType] = useState(() => {
    try {
      return localStorage.getItem("cs_fulfilment_pref") === "delivery" ? "delivery" : "pickup";
    } catch {
      return "pickup";
    }
  });
  const [date, setDate] = useState(daysFromNow(1));
  const [slot, setSlot] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", line1: "", line2: "", city: "", pincode: "" });
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Checkout — Cakestyles";
  }, []);

  useEffect(() => {
    if (!settings) return;
    if (fulfilmentType === "delivery" && !settings.delivery?.enabled) {
      setFulfilmentType("pickup");
      return;
    }
    if (fulfilmentType === "pickup") {
      setSlot(settings.pickup?.slots?.[0] || "");
    } else {
      setSlot("");
    }
  }, [settings, fulfilmentType]);

  const deliveryEnabled = settings?.delivery?.enabled;
  const deliveryFee = useMemo(() => {
    if (fulfilmentType !== "delivery" || !deliveryEnabled) return 0;
    const d = settings.delivery;
    if (d.freeOver > 0 && totalPrice >= d.freeOver) return 0;
    return d.fee || 0;
  }, [fulfilmentType, deliveryEnabled, settings, totalPrice]);

  const methods = useMemo(() => {
    const list = [];
    if (settings?.paymentMethods?.online?.enabled) list.push("razorpay");
    for (const m of settings?.paymentMethods?.offline || []) list.push(m);
    return list.length ? list : ["upi", "cash"];
  }, [settings]);

  useEffect(() => {
    if (!methods.includes(paymentMethod)) setPaymentMethod(methods[0]);
  }, [methods, paymentMethod]);

  if (cart.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-wine-50 flex items-center justify-center mb-4">
          <ShoppingBag className="w-7 h-7 text-wine-500" />
        </div>
        <h1 className="font-display text-2xl font-semibold text-wine-800">Nothing to check out</h1>
        <Link to="/menu" className="mt-6 inline-block bg-wine-700 hover:bg-wine-800 text-white font-medium px-6 py-3 rounded-full">
          Browse Menu
        </Link>
      </div>
    );
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim() || form.phone.replace(/\D/g, "").length < 8) {
      return toast.error("Please enter your name and a valid phone number");
    }
    if (fulfilmentType === "delivery" && (!form.line1.trim() || !form.city.trim() || !form.pincode.trim())) {
      return toast.error("Please enter the full delivery address");
    }

    setSubmitting(true);
    try {
      const body = {
        items: cart.map((i) => ({
          productId: i.productId,
          variantName: i.variantName || undefined,
          quantity: i.quantity,
          addOns: (i.addOns || []).map((a) => a.name),
          notes: i.notes || undefined,
        })),
        customer: { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() },
        fulfilment: {
          type: fulfilmentType,
          date,
          slot: slot || undefined,
          ...(fulfilmentType === "delivery"
            ? { address: { line1: form.line1, line2: form.line2, city: form.city, pincode: form.pincode } }
            : {}),
        },
        specialInstructions: specialInstructions || undefined,
        paymentMethod,
      };

      const { data } = await api.post("/orders", body);
      const order = data.order;

      if (paymentMethod === "razorpay") {
        const pay = await api.post("/payment/create-order", { orderId: order._id });
        await new Promise((resolve, reject) => {
          const rzp = new window.Razorpay({
            key: pay.data.keyId,
            amount: pay.data.amount,
            currency: "INR",
            name: settings?.store?.name || "Cakestyles",
            description: `Order ${order.orderNumber}`,
            order_id: pay.data.rpOrderId,
            prefill: { name: form.name, contact: form.phone, email: form.email },
            theme: { color: "#6d2141" },
            handler: async (resp) => {
              try {
                await api.post("/payment/verify", { orderId: order._id, ...resp });
                resolve();
              } catch (err) {
                reject(err);
              }
            },
            modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
          });
          rzp.open();
        });
      }

      clearCart();
      navigate(`/order-confirmed/${order.orderNumber}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full border border-wine-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-wine-400 focus:ring-2 focus:ring-wine-100";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-3xl font-semibold text-wine-800 mb-6">Checkout</h1>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-5">
          {/* Fulfilment */}
          <section className="bg-white rounded-2xl border border-wine-100 p-5">
            <h2 className="font-medium text-cocoa-900 mb-4">1 · Pickup or Delivery</h2>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => setFulfilmentType("pickup")}
                className={`px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                  fulfilmentType === "pickup" ? "border-wine-600 bg-wine-50 text-wine-800" : "border-wine-100 hover:border-wine-300"
                }`}
              >
                Store Pickup
              </button>
              <button
                onClick={() => deliveryEnabled ? setFulfilmentType("delivery") : toast.error("Delivery is currently unavailable")}
                className={`px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                  fulfilmentType === "delivery" ? "border-wine-600 bg-wine-50 text-wine-800" : "border-wine-100 hover:border-wine-300"
                } ${!deliveryEnabled ? "opacity-50" : ""}`}
              >
                Delivery {deliveryEnabled ? `(+${inr(settings.delivery.fee || 0)})` : "(unavailable)"}
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-cocoa-600">Date</span>
                <input type="date" min={daysFromNow(0)} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </label>
              {fulfilmentType === "pickup" && (settings?.pickup?.slots?.length || 0) > 0 && (
                <label className="block">
                  <span className="text-xs font-medium text-cocoa-600">Pickup Slot</span>
                  <select value={slot} onChange={(e) => setSlot(e.target.value)} className={inputCls}>
                    {settings.pickup.slots.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {fulfilmentType === "delivery" && (
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-cocoa-600">Address line 1</span>
                  <input value={form.line1} onChange={set("line1")} placeholder="Flat / house, street" className={inputCls} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-cocoa-600">Landmark (optional)</span>
                  <input value={form.line2} onChange={set("line2")} className={inputCls} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-cocoa-600">City</span>
                  <input value={form.city} onChange={set("city")} className={inputCls} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-cocoa-600">Pincode</span>
                  <input value={form.pincode} onChange={set("pincode")} className={inputCls} />
                  {settings?.delivery?.pincodes?.length > 0 && (
                    <span className="text-[11px] text-cocoa-400">We deliver to: {settings.delivery.pincodes.join(", ")}</span>
                  )}
                </label>
              </div>
            )}
          </section>

          {/* Contact */}
          <section className="bg-white rounded-2xl border border-wine-100 p-5">
            <h2 className="font-medium text-cocoa-900 mb-4">2 · Your Details</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-cocoa-600">Name *</span>
                <input value={form.name} onChange={set("name")} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-cocoa-600">Phone *</span>
                <input value={form.phone} onChange={set("phone")} placeholder="10-digit mobile" className={inputCls} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-cocoa-600">Email (optional)</span>
                <input value={form.email} onChange={set("email")} type="email" className={inputCls} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-cocoa-600">Special instructions</span>
                <textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} rows={2} className={inputCls} />
              </label>
            </div>
          </section>

          {/* Payment */}
          <section className="bg-white rounded-2xl border border-wine-100 p-5">
            <h2 className="font-medium text-cocoa-900 mb-4">3 · Payment</h2>
            <div className="space-y-2">
              {methods.map((m) => (
                <label
                  key={m}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer text-sm transition-colors ${
                    paymentMethod === m ? "border-wine-600 bg-wine-50" : "border-wine-100 hover:border-wine-300"
                  }`}
                >
                  <input type="radio" checked={paymentMethod === m} onChange={() => setPaymentMethod(m)} className="accent-wine-600" />
                  {METHOD_LABELS[m] || m}
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* Summary */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-wine-100 p-5 sticky top-24">
            <h2 className="font-medium text-cocoa-900 mb-4">Order Summary</h2>
            <div className="space-y-2 max-h-56 overflow-auto pr-1">
              {cart.map((i, idx) => (
                <div key={idx} className="flex justify-between text-sm gap-2">
                  <span className="text-cocoa-600 min-w-0 truncate">
                    {i.quantity}× {i.name}
                    {i.variantName ? ` (${i.variantName})` : ""}
                  </span>
                  <span className="text-cocoa-900 shrink-0">
                    {inr((i.unitPrice + (i.addOns || []).reduce((s, a) => s + a.price, 0)) * i.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-wine-100 space-y-1.5 text-sm">
              <div className="flex justify-between text-cocoa-500">
                <span>Subtotal</span>
                <span>{inr(totalPrice)}</span>
              </div>
              {fulfilmentType === "delivery" && (
                <div className="flex justify-between text-cocoa-500">
                  <span>Delivery</span>
                  <span>{deliveryFee > 0 ? inr(deliveryFee) : "Free"}</span>
                </div>
              )}
              {settings?.tax?.enabled && !settings.tax.inclusive && (
                <div className="flex justify-between text-cocoa-500">
                  <span>{settings.tax.label} ({settings.tax.rate}%)</span>
                  <span>{inr(((totalPrice) * settings.tax.rate) / 100)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-base pt-2">
                <span>Total</span>
                <span className="text-wine-700">{inr(totalPrice + deliveryFee + (settings?.tax?.enabled && !settings.tax.inclusive ? (totalPrice * settings.tax.rate) / 100 : 0))}</span>
              </div>
            </div>
            <button
              onClick={submit}
              disabled={submitting}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-wine-700 hover:bg-wine-800 disabled:opacity-60 text-white font-medium px-6 py-3 rounded-full transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {paymentMethod === "razorpay" ? "Pay & Place Order" : "Place Order"}
            </button>
            <p className="text-[11px] text-cocoa-400 text-center mt-3">
              You'll get an order number to track your order anytime.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
