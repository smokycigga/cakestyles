import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, PackageSearch, Clock3, MapPin } from "lucide-react";
import api from "../lib/api";
import { inr, fmtDay } from "../lib/format";
import { useCart } from "../store/CartContext";

export default function OrderConfirmation() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const { clearCart } = useCart();

  useEffect(() => {
    document.title = "Order Confirmed — Cakestyles";
    clearCart();
    api
      .get(`/orders/track/${orderNumber}?phone=${new URLSearchParams(window.location.search).get("phone") || ""}`)
      .then((r) => setOrder(r.data.order))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <div className="w-20 h-20 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-5">
        <CheckCircle2 className="w-10 h-10 text-emerald-600" />
      </div>
      <h1 className="font-display text-3xl font-semibold text-wine-800">Thank you! Order received.</h1>
      <p className="text-sm text-cocoa-500 mt-2">
        Keep this number handy — you can track your order with it anytime.
      </p>

      <div className="mt-6 bg-white rounded-2xl border border-wine-100 p-6">
        <div className="text-xs uppercase tracking-widest text-cocoa-400">Order Number</div>
        <div className="font-display text-3xl font-semibold text-wine-700 mt-1">{orderNumber}</div>

        {order && (
          <div className="mt-5 pt-4 border-t border-wine-100 space-y-2.5 text-sm text-left">
            <div className="flex items-center gap-2.5 text-cocoa-600">
              <Clock3 className="w-4 h-4 text-wine-500" />
              {fmtDay(order.fulfilment?.date)} · {order.fulfilment?.slot || "any time"}
            </div>
            <div className="flex items-center gap-2.5 text-cocoa-600">
              <MapPin className="w-4 h-4 text-wine-500" />
              {order.fulfilment?.type === "delivery" ? "Delivery to your address" : "Store pickup"}
            </div>
            <div className="flex items-center gap-2.5 text-cocoa-600">
              <PackageSearch className="w-4 h-4 text-wine-500" />
              {order.items?.length} item(s) · <span className="font-semibold text-wine-700">{inr(order.grandTotal)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/track" className="bg-wine-700 hover:bg-wine-800 text-white font-medium px-6 py-3 rounded-full text-sm">
          Track This Order
        </Link>
        <Link to="/menu" className="border border-wine-200 hover:bg-wine-50 text-wine-700 font-medium px-6 py-3 rounded-full text-sm">
          Order Something Else
        </Link>
      </div>
    </div>
  );
}
