import { useEffect, useState } from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../lib/api";
import { daysFromNow } from "../lib/format";

export default function CustomCakes() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    eventDate: daysFromNow(7),
    guestCount: "",
    size: "",
    flavours: "",
    designNotes: "",
    budgetRange: "",
    fulfilmentType: "pickup",
    address: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = "Custom Cakes — Cakestyles";
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.phone.replace(/\D/g, "").length < 8) {
      return toast.error("Please enter your name and a valid phone number");
    }
    setSubmitting(true);
    try {
      await api.post("/enquiries", {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        eventDate: form.eventDate,
        guestCount: form.guestCount ? Number(form.guestCount) : undefined,
        size: form.size || undefined,
        flavours: form.flavours || undefined,
        designNotes: form.designNotes || undefined,
        budgetRange: form.budgetRange || undefined,
        fulfilmentPref: { type: form.fulfilmentType, address: form.address || undefined },
      });
      setDone(true);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full border border-wine-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-wine-400 focus:ring-2 focus:ring-wine-100";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-wine-50 border border-wine-100 rounded-full px-4 py-1.5 text-xs font-medium text-wine-700 mb-4">
          <Sparkles className="w-3.5 h-3.5" /> Bespoke designs by our studio
        </div>
        <h1 className="font-display text-4xl font-semibold text-wine-800">Custom Cakes</h1>
        <p className="text-sm text-cocoa-500 mt-2 max-w-lg mx-auto leading-relaxed">
          Wedding tiers, birthday showstoppers, anniversary classics — tell us about your celebration
          and we'll design a cake around it. We'll call you back with a quote.
        </p>
      </div>

      {done ? (
        <div className="bg-white rounded-2xl border border-wine-100 p-10 text-center">
          <div className="text-4xl mb-3">🎂</div>
          <h2 className="font-display text-2xl font-semibold text-wine-800">Enquiry received!</h2>
          <p className="text-sm text-cocoa-500 mt-2">
            Thank you, {form.name.split(" ")[0]}. We'll reach out on {form.phone} within a few hours
            to discuss your cake.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="bg-white rounded-2xl border border-wine-100 p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-cocoa-600">Your Name *</span>
              <input value={form.name} onChange={set("name")} className={inputCls} required />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-cocoa-600">Phone / WhatsApp *</span>
              <input value={form.phone} onChange={set("phone")} className={inputCls} required />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-cocoa-600">Email (optional)</span>
              <input type="email" value={form.email} onChange={set("email")} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-cocoa-600">Event Date *</span>
              <input type="date" min={daysFromNow(0)} value={form.eventDate} onChange={set("eventDate")} className={inputCls} required />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-cocoa-600">Approx. guests</span>
              <input type="number" min="1" value={form.guestCount} onChange={set("guestCount")} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-cocoa-600">Cake size (if known)</span>
              <input value={form.size} onChange={set("size")} placeholder="e.g. 2 tier, 1.5 kg" className={inputCls} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-cocoa-600">Preferred flavours</span>
              <input value={form.flavours} onChange={set("flavours")} placeholder="e.g. Belgian chocolate + red velvet" className={inputCls} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-cocoa-600">Design notes / theme</span>
              <textarea value={form.designNotes} onChange={set("designNotes")} rows={3} placeholder="Colours, theme, topper ideas, reference you liked on our Instagram…" className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-cocoa-600">Budget range</span>
              <select value={form.budgetRange} onChange={set("budgetRange")} className={inputCls}>
                <option value="">Prefer not to say</option>
                <option>Under ₹2,000</option>
                <option>₹2,000 – ₹5,000</option>
                <option>₹5,000 – ₹10,000</option>
                <option>₹10,000 – ₹20,000</option>
                <option>₹20,000+</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-cocoa-600">Pickup or delivery?</span>
              <select value={form.fulfilmentType} onChange={set("fulfilmentType")} className={inputCls}>
                <option value="pickup">Store Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </label>
            {form.fulfilmentType === "delivery" && (
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-cocoa-600">Delivery area</span>
                <input value={form.address} onChange={set("address")} placeholder="Locality / venue" className={inputCls} />
              </label>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 bg-wine-700 hover:bg-wine-800 disabled:opacity-60 text-white font-medium px-6 py-3 rounded-full transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Enquiry
          </button>
        </form>
      )}
    </div>
  );
}
