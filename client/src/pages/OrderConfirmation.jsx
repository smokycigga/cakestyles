import { useEffect, useState } from "react";
import { useLocation, useParams, Link } from "react-router-dom";
import { CheckCircle2, Clock3, MapPin, PackageSearch } from "lucide-react";
import api from "../lib/api";
import { inr, fmtDay } from "../lib/format";

export default function OrderConfirmation() {
  const { orderNumber } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(location.state?.order || null);
  const phone = new URLSearchParams(location.search).get("phone") || "";

  useEffect(() => {
    document.title = "Order Confirmed — Cakestyles";
    if (order || !phone) return;
    api.get(`/orders/track/${orderNumber}?phone=${encodeURIComponent(phone)}`).then((response) => setOrder(response.data.order)).catch(() => {});
  }, [order, orderNumber, phone]);

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50"><CheckCircle2 className="h-10 w-10 text-emerald-600" /></span>
      <h1 className="mt-5 font-display text-3xl font-semibold text-wine-800">Thank you! Order received.</h1>
      <p className="mt-2 text-sm text-cocoa-500">Keep your order number handy so you can track every update.</p>
      <div className="mt-6 rounded-3xl border border-wine-100 bg-white p-6 shadow-sm"><p className="text-xs uppercase tracking-[0.22em] text-cocoa-400">Order number</p><p className="mt-1 font-display text-3xl font-semibold text-wine-700">{orderNumber}</p>{order && <div className="mt-5 space-y-3 border-t border-wine-100 pt-5 text-left text-sm text-cocoa-600"><p className="flex items-center gap-2.5"><Clock3 className="h-4 w-4 text-wine-500" />{fmtDay(order.fulfilment?.date)} · {order.fulfilment?.slot || "Any time"}</p><p className="flex items-center gap-2.5"><MapPin className="h-4 w-4 text-wine-500" />{order.fulfilment?.type === "delivery" ? "Delivery to your address" : "Store pickup"}</p><p className="flex items-center gap-2.5"><PackageSearch className="h-4 w-4 text-wine-500" />{order.items?.length} item(s) · <span className="font-semibold text-wine-700">{inr(order.grandTotal)}</span></p></div>}</div>
      <div className="mt-8 flex flex-wrap justify-center gap-3"><Link to="/track" className="rounded-full bg-wine-700 px-6 py-3 text-sm font-medium text-white">Track this order</Link><Link to="/menu" className="rounded-full border border-wine-200 px-6 py-3 text-sm font-medium text-wine-700">Order something else</Link></div>
    </div>
  );
}
