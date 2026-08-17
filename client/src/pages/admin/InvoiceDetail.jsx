import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Download, FileImage, Plus } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { inr, fmtDate } from "../../lib/format";
import { downloadInvoicePdf, downloadInvoicePng } from "../../lib/invoiceRender";
import { INVOICE_STATUS_META, PAYMENT_METHOD_LABELS } from "../../lib/meta";
import { PageHeader, Spinner, Badge, Button, Field, inputCls, Modal } from "../../components/admin/ui";
import { useAuth } from "../../store/AuthContext";

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: "", method: "upi", ref: "", date: "" });

  const load = () => api.get(`/invoices/${id}`).then((r) => setInvoice(r.data.invoice)).catch(() => navigate("/admin/invoices"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!invoice) return <Spinner />;

  const recordPayment = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/invoices/${invoice._id}/payments`, {
        amount: Number(pay.amount),
        method: pay.method,
        ref: pay.ref || undefined,
        date: pay.date || undefined,
      });
      toast.success("Payment recorded");
      setPayOpen(false);
      setPay({ amount: "", method: "upi", ref: "", date: "" });
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const setStatus = async (status) => {
    try {
      await api.put(`/invoices/${invoice._id}/status`, { status });
      toast.success(`Marked ${INVOICE_STATUS_META[status]?.label}`);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  // PDF + PNG generated client-side via the shared renderer (works on Vercel too).
  const download = async (kind) => {
    try {
      if (kind === "pdf") await downloadInvoicePdf(invoice);
      else await downloadInvoicePng(invoice);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <div>
      <Link to="/admin/invoices" className="inline-flex items-center gap-1 text-sm text-cocoa-400 hover:text-wine-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> All invoices
      </Link>

      <PageHeader
        title={invoice.invoiceNumber}
        subtitle={`${invoice.customerSnapshot?.name} · ${fmtDate(invoice.createdAt)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => download("pdf")}>
              <Download className="w-4 h-4" /> PDF
            </Button>
            <Button variant="outline" onClick={() => download("png")}>
              <FileImage className="w-4 h-4" /> Image
            </Button>
            {can("finance:write") && invoice.balanceDue > 0.001 && invoice.status !== "cancelled" && (
              <Button onClick={() => setPayOpen(true)}>
                <Plus className="w-4 h-4" /> Record Payment
              </Button>
            )}
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-wine-100 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg font-semibold text-wine-800">Invoice</h3>
              <Badge className={INVOICE_STATUS_META[invoice.status]?.color}>{INVOICE_STATUS_META[invoice.status]?.label}</Badge>
            </div>

            <div className="space-y-2">
              {invoice.lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-wine-50 pb-2">
                  <div>
                    <span className="font-medium text-cocoa-800">{l.description}</span>
                    {l.isCustom && <Badge className="bg-indigo-50 text-indigo-600 ml-2">custom</Badge>}
                  </div>
                  <div className="text-cocoa-600">
                    {l.quantity} × {inr(l.unitPrice)} = <span className="font-medium text-cocoa-900">{inr(l.amount)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-wine-100 space-y-1 text-sm ml-auto max-w-xs">
              <div className="flex justify-between text-cocoa-500"><span>Subtotal</span><span>{inr(invoice.subtotal)}</span></div>
              {invoice.discount > 0 && <div className="flex justify-between text-cocoa-500"><span>Discount</span><span>- {inr(invoice.discount)}</span></div>}
              {invoice.tax?.amount > 0 && (
                <div className="flex justify-between text-cocoa-500"><span>{invoice.tax.label} ({invoice.tax.rate}%)</span><span>{inr(invoice.tax.amount)}</span></div>
              )}
              <div className="flex justify-between font-semibold text-base pt-1"><span>Total</span><span className="text-wine-700">{inr(invoice.total)}</span></div>
              <div className="flex justify-between text-cocoa-500"><span>Paid</span><span className="text-emerald-700">{inr(invoice.amountPaid)}</span></div>
              <div className="flex justify-between font-semibold"><span>Balance</span><span className={invoice.balanceDue > 0 ? "text-rose-700" : "text-emerald-700"}>{inr(invoice.balanceDue)}</span></div>
            </div>
          </div>

          {(invoice.payments || []).length > 0 && (
            <div className="bg-white rounded-2xl border border-wine-100 p-5">
              <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Payments</h3>
              <div className="space-y-2">
                {invoice.payments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-wine-50 pb-2 last:border-0">
                    <span>
                      <span className="font-medium">{inr(p.amount)}</span>
                      <span className="text-cocoa-400 text-xs ml-2">{PAYMENT_METHOD_LABELS[p.method] || p.method}{p.ref ? ` · ${p.ref}` : ""}</span>
                    </span>
                    <span className="text-xs text-cocoa-400">{fmtDate(p.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-wine-100 p-5">
            <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Customer</h3>
            {invoice.customer && (
              <Link to={`/admin/customers/${invoice.customer._id}`} className="font-medium text-wine-700 hover:underline">
                {invoice.customerSnapshot.name}
              </Link>
            )}
            <div className="text-sm text-cocoa-500 mt-1">{invoice.customerSnapshot.phone}</div>
            {invoice.customerSnapshot.email && <div className="text-sm text-cocoa-500">{invoice.customerSnapshot.email}</div>}
            {invoice.order && (
              <Link to={`/admin/orders/${invoice.order._id}`} className="block text-xs text-wine-600 hover:underline mt-3">
                ↳ From order {invoice.order.orderNumber}
              </Link>
            )}
          </div>

          {can("finance:write") && (
            <div className="bg-white rounded-2xl border border-wine-100 p-5">
              <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Actions</h3>
              <div className="flex flex-wrap gap-2">
                {invoice.status !== "paid" && (
                  <Button variant="outline" onClick={() => setStatus("paid")}>Mark Paid</Button>
                )}
                {invoice.status === "draft" && (
                  <Button variant="outline" onClick={() => setStatus("issued")}>Issue</Button>
                )}
                {invoice.status !== "cancelled" && (
                  <Button variant="danger" onClick={() => confirm("Cancel this invoice?") && setStatus("cancelled")}>Cancel Invoice</Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={`Record payment — ${invoice.invoiceNumber}`}>
        <form onSubmit={recordPayment} className="space-y-4">
          <div className="bg-cream-100 rounded-xl p-3 text-sm">
            Balance due: <span className="font-semibold text-wine-700">{inr(invoice.balanceDue)}</span>
          </div>
          <Field label="Amount (₹) *">
            <input type="number" step="0.01" min="0.01" max={invoice.balanceDue} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className={inputCls} required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method *">
              <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} className={inputCls}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Field label="Reference">
            <input value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} className={inputCls} />
          </Field>
          <Button type="submit" className="w-full">Record Payment</Button>
        </form>
      </Modal>
    </div>
  );
}
