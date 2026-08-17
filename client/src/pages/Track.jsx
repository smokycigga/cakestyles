import { useEffect, useState } from "react";
import { PackageSearch, Loader2 } from "lucide-react";
import api, { errMsg } from "../lib/api";
import { inr, fmtDateTime, titleize } from "../lib/format";
import { ORDER_STATUS_META, PAYMENT_STATUS_META } from "../lib/meta";

const STEPS = ["confirmed", "in_preparation", "ready", "out_for_delivery", "completed"];

export default function Track() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Track Order — Cakestyles";
  }, []);

  const search = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOrder(null);
    try {
      const { data } = await api.get(`/orders/track/${orderNumber.trim().toUpperCase()}?phone=${encodeURIComponent(phone.trim())}`);
      setOrder(data.order);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const currentStep = order ? STEPS.indexOf(order.status) : -1;

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <div className="w-14 h-14 mx-auto rounded-full bg-wine-50 flex items-center justify-center mb-3">
          <PackageSearch className="w-6 h-6 text-wine-600" />
        </div>
        <h1 className="font-display text-3xl font-semibold text-wine-800">Track your order</h1>
        <p className="text-sm text-cocoa-500 mt-1">Enter your order number and phone number.</p>
      </div>

      <form onSubmit={search} className="bg-white rounded-2xl border border-wine-100 p-5 space-y-3">
        <input
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder="Order number (e.g. CS-2026-0001)"
          className="w-full border border-wine-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-wine-400"
          required
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number used for the order"
          className="w-full border border-wine-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-wine-400"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 bg-wine-700 hover:bg-wine-800 disabled:opacity-60 text-white font-medium px-6 py-3 rounded-xl transition-colors"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Find Order
        </button>
        {error && <p className="text-sm text-rose-600 text-center">{error}</p>}
      </form>

      {order && (
        <div className="mt-6 bg-white rounded-2xl border border-wine-100 p-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="font-display text-2xl font-semibold text-wine-700">{order.orderNumber}</div>
              <div className="text-xs text-cocoa-400">Placed {fmtDateTime(order.createdAt)}</div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${ORDER_STATUS_META[order.status]?.color || ""}`}>
              {ORDER_STATUS_META[order.status]?.label || order.status}
            </span>
          </div>

          {order.status !== "cancelled" && order.status !== "refunded" && (
            <div className="mt-6 flex items-center">
              {STEPS.map((s, i) => (
                <div key={s} className="flex-1 flex flex-col items-center relative">
                  {i > 0 && (
                    <div className={`absolute top-2.5 right-1/2 left-[-50%] h-0.5 ${i <= currentStep ? "bg-wine-600" : "bg-wine-100"}`} />
                  )}
                  <div className={`w-5 h-5 rounded-full border-2 relative z-10 ${i <= currentStep ? "bg-wine-600 border-wine-600" : "bg-white border-wine-200"}`} />
                  <span className={`text-[10px] mt-1.5 text-center ${i <= currentStep ? "text-wine-700 font-medium" : "text-cocoa-400"}`}>
                    {titleize(s)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-wine-100 space-y-2">
            {order.items?.map((it, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-cocoa-600">{it.quantity}× {it.name}{it.variantName ? ` (${it.variantName})` : ""}</span>
                <span>{inr(it.lineTotal)}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold text-wine-700 pt-2 border-t border-wine-100">
              <span>Total</span>
              <span>{inr(order.grandTotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-cocoa-400">
              <span>Payment</span>
              <span className={`px-2 py-0.5 rounded-full ${PAYMENT_STATUS_META[order.payment?.status]?.color || ""}`}>
                {PAYMENT_STATUS_META[order.payment?.status]?.label || order.payment?.status}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
