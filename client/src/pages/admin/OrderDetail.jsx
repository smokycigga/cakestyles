import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Receipt, Plus } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { inr, fmtDate, fmtDateTime } from "../../lib/format";
import { ORDER_STATUS_META, PAYMENT_STATUS_META, PAYMENT_METHOD_LABELS, SOURCE_LABELS } from "../../lib/meta";
import { PageHeader, Spinner, Badge, Button, Field, inputCls, Modal } from "../../components/admin/ui";
import { useAuth } from "../../store/AuthContext";

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [order, setOrder] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: "", method: "upi", ref: "", note: "" });

  const load = () => api.get(`/orders/${id}`).then((r) => setOrder(r.data.order)).catch(() => navigate("/admin/orders"));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!order) return <Spinner />;

  const changeStatus = async (status) => {
    try {
      const { data } = await api.put(`/orders/${order._id}/status`, { status });
      toast.success(`Status → ${ORDER_STATUS_META[status].label}`);
      // Cancelling closes the linked invoice, or reports that it holds money and
      // needs a refund decision. Either way staff have to hear about it.
      if (data.invoiceNote) toast(data.invoiceNote, { duration: 8000, icon: "🧾" });
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const recordPayment = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/orders/${order._id}/payments`, {
        amount: Number(pay.amount),
        method: pay.method,
        ref: pay.ref || undefined,
        note: pay.note || undefined,
      });
      toast.success("Payment recorded");
      setPayOpen(false);
      setPay({ amount: "", method: "upi", ref: "", note: "" });
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const makeInvoice = async () => {
    try {
      const { data } = await api.post(`/invoices/from-order/${order._id}`);
      toast.success(`Invoice ${data.invoice.invoiceNumber} created`);
      navigate(`/admin/invoices/${data.invoice._id}`);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const deleteOrder = async () => {
    if (!confirm(`Delete order ${order.orderNumber}? This also deletes its linked invoice (if any) and cannot be undone.`)) return;
    try {
      await api.delete(`/orders/${order._id}`);
      toast.success("Order deleted");
      navigate("/admin/orders");
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const balance = order.grandTotal - order.amountPaid;

  return (
    <div>
      <Link to="/admin/orders" className="inline-flex items-center gap-1 text-sm text-cocoa-400 hover:text-wine-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> All orders
      </Link>

      <PageHeader
        title={order.orderNumber}
        subtitle={`${SOURCE_LABELS[order.source] || order.source} · placed ${fmtDateTime(order.createdAt)}`}
        actions={
          <>
            {can("finance:write") && (
              <Button variant="outline" onClick={makeInvoice} disabled={!!order.invoice}>
                <Receipt className="w-4 h-4" /> {order.invoice ? `Invoice ${order.invoice.invoiceNumber}` : "Generate Invoice"}
              </Button>
            )}
            {can("finance:write") && balance > 0.001 && (
              <Button onClick={() => setPayOpen(true)}>
                <Plus className="w-4 h-4" /> Record Payment
              </Button>
            )}
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Items */}
          <div className="bg-white rounded-2xl border border-wine-100 p-5">
            <h3 className="text-sm font-semibold text-cocoa-900 mb-4">Items</h3>
            <div className="space-y-3">
              {order.items.map((it, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-sm border-b border-wine-50 pb-3 last:border-0 last:pb-0">
                  <div>
                    <div className="font-medium text-cocoa-800">
                      {it.quantity}× {it.name} {it.variantName && <span className="text-cocoa-400">({it.variantName})</span>}
                      {it.isCustom && <Badge className="bg-indigo-100 text-indigo-700 ml-2">Custom</Badge>}
                    </div>
                    <div className="text-xs text-cocoa-400 mt-0.5">
                      @{inr(it.unitPrice)}
                      {(it.addOns || []).length > 0 && ` + ${it.addOns.map((a) => `${a.name} (${inr(a.price)})`).join(", ")}`}
                    </div>
                    {it.notes && <div className="text-xs italic text-wine-600 mt-0.5">"{it.notes}"</div>}
                  </div>
                  <div className="font-medium">{inr(it.lineTotal)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-wine-100 space-y-1 text-sm">
              <div className="flex justify-between text-cocoa-500"><span>Subtotal</span><span>{inr(order.subtotal)}</span></div>
              {order.deliveryFee > 0 && <div className="flex justify-between text-cocoa-500"><span>Delivery</span><span>{inr(order.deliveryFee)}</span></div>}
              {order.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span>- {inr(order.discount)}</span></div>}
              {order.taxTotal > 0 && <div className="flex justify-between text-cocoa-500"><span>Tax</span><span>{inr(order.taxTotal)}</span></div>}
              <div className="flex justify-between font-semibold text-base pt-1"><span>Total</span><span className="text-wine-700">{inr(order.grandTotal)}</span></div>
              <div className="flex justify-between text-cocoa-500"><span>Paid</span><span className="text-emerald-700">{inr(order.amountPaid)}</span></div>
              {balance > 0.001 && <div className="flex justify-between text-cocoa-500"><span>Balance due</span><span className="text-rose-700 font-medium">{inr(balance)}</span></div>}
            </div>
            {order.specialInstructions && (
              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-900">
                <span className="font-medium">Instructions:</span> {order.specialInstructions}
              </div>
            )}
          </div>

          {/* Payments */}
          <div className="bg-white rounded-2xl border border-wine-100 p-5">
            <h3 className="text-sm font-semibold text-cocoa-900 mb-4">Payments</h3>
            {(order.payment?.payments || []).length === 0 ? (
              <p className="text-sm text-cocoa-400">No payments recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {order.payment.payments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-wine-50 pb-2 last:border-0">
                    <div>
                      <span className="font-medium">{inr(p.amount)}</span>
                      <span className="text-cocoa-400 text-xs ml-2">via {PAYMENT_METHOD_LABELS[p.method] || p.method}</span>
                      {p.ref && <span className="text-xs text-cocoa-400 ml-2">ref {p.ref}</span>}
                    </div>
                    <span className="text-xs text-cocoa-400">{fmtDateTime(p.paidAt)} · {p.recordedBy?.name || ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-wine-100 p-5">
            <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Status</h3>
            <div className="flex gap-2 mb-4">
              <Badge className={ORDER_STATUS_META[order.status]?.color}>{ORDER_STATUS_META[order.status]?.label}</Badge>
              <Badge className={PAYMENT_STATUS_META[order.payment?.status]?.color}>{PAYMENT_STATUS_META[order.payment?.status]?.label}</Badge>
            </div>
            {can("orders:write") && (
              <select
                value={order.status}
                onChange={(e) => changeStatus(e.target.value)}
                className={inputCls}
              >
                {Object.entries(ORDER_STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            )}

            <div className="mt-5 space-y-3">
              <h4 className="text-xs font-semibold text-cocoa-400 uppercase tracking-wide">History</h4>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {[...order.statusHistory].reverse().map((h, i) => (
                  <div key={i} className="flex gap-3 text-xs">
                    <div className="w-2 h-2 rounded-full bg-wine-400 mt-1 shrink-0" />
                    <div>
                      <div className="font-medium text-cocoa-700">{ORDER_STATUS_META[h.status]?.label || h.status}</div>
                      <div className="text-cocoa-400">{fmtDateTime(h.at)} · {h.by?.name || "system"}</div>
                      {h.note && <div className="text-cocoa-500 italic mt-0.5">{h.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {can("orders:write") && (
            <div className="bg-white rounded-2xl border border-rose-100 p-5">
              <h3 className="text-sm font-semibold text-rose-700 mb-3">Danger zone</h3>
              <Button variant="danger" onClick={deleteOrder}>Delete Order</Button>
              <p className="text-[11px] text-cocoa-400 mt-3">
                Deletes this order and its linked invoice (if any). This cannot be undone.
              </p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-wine-100 p-5">
            <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Customer</h3>
            {order.customer ? (
              <>
                <Link to={`/admin/customers/${order.customer._id}`} className="font-medium text-wine-700 hover:underline">
                  {order.customerSnapshot.name}
                </Link>
                <div className="text-sm text-cocoa-500 mt-1">{order.customerSnapshot.phone}</div>
                {order.customerSnapshot.email && <div className="text-sm text-cocoa-500">{order.customerSnapshot.email}</div>}
                {(order.customer?.tags || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {order.customer.tags.map((t) => (
                      <Badge key={t} className="bg-wine-50 text-wine-700">{t}</Badge>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-cocoa-600">
                {order.customerSnapshot.name} · {order.customerSnapshot.phone}
              </div>
            )}

            <h4 className="text-xs font-semibold text-cocoa-400 uppercase tracking-wide mt-5 mb-2">Fulfilment</h4>
            <div className="text-sm text-cocoa-600">
              {order.fulfilment.type === "delivery" ? "🛵 Delivery" : "🏬 Pickup"} · {fmtDate(order.fulfilment.date)}
              {order.fulfilment.slot && <div className="text-xs text-cocoa-400">{order.fulfilment.slot}</div>}
              {order.fulfilment.address && (
                <div className="text-xs text-cocoa-400 mt-1">
                  {[order.fulfilment.address.line1, order.fulfilment.address.line2, order.fulfilment.address.city, order.fulfilment.address.pincode].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Record payment modal */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={`Record payment — ${order.orderNumber}`}>
        <form onSubmit={recordPayment} className="space-y-4">
          <div className="bg-cream-100 rounded-xl p-3 text-sm">
            Balance due: <span className="font-semibold text-wine-700">{inr(balance)}</span>
          </div>
          <Field label="Amount (₹) *">
            <input type="number" step="0.01" min="0.01" max={balance} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className={inputCls} required autoFocus />
          </Field>
          <Field label="Method *">
            <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} className={inputCls}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Reference (UPI / transaction ID)">
            <input value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Note">
            <input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} className={inputCls} />
          </Field>
          <Button type="submit" className="w-full">Record Payment</Button>
        </form>
      </Modal>
    </div>
  );
}
