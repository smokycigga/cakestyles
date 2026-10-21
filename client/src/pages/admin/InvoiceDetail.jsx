import { useEffect, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, FileImage, Pencil, Plus } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { inr, fmtDate } from "../../lib/format";
import { validLines } from "../../lib/invoiceTotals";
import { downloadInvoicePdf, downloadInvoicePng } from "../../lib/invoiceRender";
import { INVOICE_STATUS_META, PAYMENT_METHOD_LABELS } from "../../lib/meta";
import { PageHeader, Spinner, Badge, Button, Field, inputCls, Modal } from "../../components/admin/ui";
import InvoiceLinesEditor from "../../components/admin/InvoiceLinesEditor";
import CakeStylesLogo from "../../components/public/CakeStylesLogo";
import { useAuth } from "../../store/AuthContext";
import { useSettings } from "../../store/SettingsContext";

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useAuth();
  const settings = useSettings();
  const store = settings?.store || {};
  const [invoice, setInvoice] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: "", method: "upi", ref: "", date: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ lines: [], discount: "", taxRate: "", dueDate: "", notes: "" });
  const [products, setProducts] = useState([]);
  const [storeTax, setStoreTax] = useState({ enabled: false, rate: 0, label: "Tax" });
  // Orders this invoice could be attached to, sent by the server only when it
  // is unlinked. An unlinked invoice never reports its payments to the order it
  // bills, so repairing the link matters more than it looks.
  const [linkable, setLinkable] = useState([]);
  const [linkTo, setLinkTo] = useState("");

  const load = () => api.get(`/invoices/${id}`)
    .then((r) => {
      setInvoice(r.data.invoice);
      setLinkable(r.data.linkableOrders || []);
    })
    .catch(() => navigate("/admin/invoices"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Any non-cancelled invoice can now be edited, including paid ones.
  const editable = !!invoice && can("finance:write") && invoice.status !== "cancelled";

  // Arriving from the list "Edit" icon opens the editor immediately.
  useEffect(() => {
    if (searchParams.get("edit") === "1" && editable) {
      openEdit();
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?._id, editable]);

  if (!invoice) return <Spinner />;

  function openEdit() {
    setEdit({
      lines: (invoice.lines || []).map((l) => ({ ...l })),
      discount: String(invoice.discount ?? ""),
      taxRate: invoice.tax?.rate != null ? String(invoice.tax.rate) : "",
      dueDate: invoice.dueDate || "",
      notes: invoice.notes || "",
    });
    api.get("/products/admin").then((r) => setProducts(r.data.products)).catch(() => {});
    api.get("/settings/public").then((r) => setStoreTax(r.data.tax || { enabled: false, rate: 0, label: "Tax" })).catch(() => {});
    setEditOpen(true);
  }

  const onLinesChange = (patch) => {
    setEdit((prev) => ({
      ...prev,
      ...(patch.lines ? { lines: patch.lines } : {}),
      ...(patch.discount !== undefined ? { discount: patch.discount } : {}),
      ...(patch.taxRate !== undefined ? { taxRate: patch.taxRate } : {}),
    }));
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const lines = validLines(edit.lines);
    if (lines.length === 0) return toast.error("Add at least one line with a description and price");
    try {
      await api.put(`/invoices/${invoice._id}`, {
        lines,
        discount: edit.discount === "" ? 0 : Number(edit.discount),
        taxRate: edit.taxRate === "" ? null : Number(edit.taxRate),
        dueDate: edit.dueDate || null,
        notes: edit.notes || "",
      });
      toast.success("Invoice updated");
      setEditOpen(false);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

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

  // Linking moves no money, so it stays available even on a locked invoice —
  // the ones that have taken a payment are exactly the ones worth repairing.
  const attachOrder = async () => {
    if (!linkTo) return;
    try {
      const { data } = await api.put(`/invoices/${invoice._id}/order`, { orderId: linkTo });
      toast.success(data.note || "Order linked");
      setLinkTo("");
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

  const deleteInvoice = async () => {
    if (!confirm(`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`)) return;
    try {
      await api.delete(`/invoices/${invoice._id}`);
      toast.success("Invoice deleted");
      navigate("/admin/invoices");
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
            {editable && (
              <Button variant="outline" onClick={openEdit}>
                <Pencil className="w-4 h-4" /> Edit
              </Button>
            )}
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
          <div className="bg-white rounded-2xl border border-wine-100 p-6 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 pb-5 border-b border-wine-100">
              <div className="min-w-0 max-w-[20rem]">
                <CakeStylesLogo className="h-9 w-auto text-wine-800" />
                {store.tagline && <p className="text-[11px] text-cocoa-500 mt-2 leading-snug">{store.tagline}</p>}
                {[store.address?.line1, store.address?.city, store.address?.pincode].filter(Boolean).length > 0 && (
                  <p className="text-[11px] text-cocoa-500 mt-1 break-words">
                    {[store.address?.line1, store.address?.city, store.address?.pincode].filter(Boolean).join(", ")}
                  </p>
                )}
                {store.phone && <p className="text-[11px] text-cocoa-500 mt-1">{store.phone}</p>}
                {store.email && <p className="text-[11px] text-cocoa-500 break-all">{store.email}</p>}
              </div>
              <div className="sm:text-right shrink-0">
                <div className="text-xs font-semibold tracking-[0.18em] text-cocoa-400">INVOICE</div>
                <div className="font-display text-xl font-semibold text-wine-800 mt-0.5">{invoice.invoiceNumber}</div>
                <div className="text-[11px] text-cocoa-500 mt-1">Date: {fmtDate(invoice.createdAt)}</div>
                {invoice.dueDate && <div className="text-[11px] text-cocoa-500">Due: {fmtDate(invoice.dueDate)}</div>}
                <div className="mt-2"><Badge className={INVOICE_STATUS_META[invoice.status]?.color}>{INVOICE_STATUS_META[invoice.status]?.label}</Badge></div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 py-5">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold tracking-wider text-cocoa-400">BILLED TO</div>
                <div className="font-medium text-cocoa-900 mt-1">{invoice.customerSnapshot?.name}</div>
                {invoice.customerSnapshot?.phone && <div className="text-sm text-cocoa-500 mt-0.5">{invoice.customerSnapshot.phone}</div>}
                {invoice.customerSnapshot?.email && <div className="text-sm text-cocoa-500 break-all">{invoice.customerSnapshot.email}</div>}
              </div>
              {invoice.order?.orderNumber && (
                <div className="sm:text-right text-sm text-cocoa-500">Order {invoice.order.orderNumber}</div>
              )}
            </div>

            <div className="table-card overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-cream-100 text-left text-[11px] uppercase tracking-wider text-cocoa-500">
                    <th className="font-semibold py-2.5 pl-3 pr-4">Description</th>
                    <th className="font-semibold py-2.5 px-3 w-14">Qty</th>
                    <th className="font-semibold py-2.5 px-3 w-24">Rate</th>
                    <th className="font-semibold py-2.5 pr-3 pl-3 w-28 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((l, i) => (
                    <tr key={i} className="border-b border-wine-50 align-top">
                      <td className="py-2.5 pl-3 pr-4 min-w-0" data-label="Description">
                        <span className="font-medium text-cocoa-800 break-words">{l.description}</span>
                        {l.isCustom && <Badge className="bg-indigo-50 text-indigo-600 ml-2">custom</Badge>}
                      </td>
                      <td className="py-2.5 px-3 text-cocoa-600 whitespace-nowrap" data-label="Qty">{l.quantity}</td>
                      <td className="py-2.5 px-3 text-cocoa-600 whitespace-nowrap" data-label="Rate">{inr(l.unitPrice)}</td>
                      <td className="py-2.5 pr-3 pl-3 text-right font-medium text-cocoa-900 whitespace-nowrap" data-label="Amount">{inr(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-1 text-sm ml-auto max-w-[16rem]">
              <div className="flex justify-between gap-6 text-cocoa-500"><span>Subtotal</span><span>{inr(invoice.subtotal)}</span></div>
              {invoice.discount > 0 && <div className="flex justify-between gap-6 text-cocoa-500"><span>Discount</span><span>- {inr(invoice.discount)}</span></div>}
              {invoice.tax?.amount > 0 && (
                <div className="flex justify-between gap-6 text-cocoa-500">
                  <span>{invoice.tax.label} ({invoice.tax.rate}%){invoice.tax.inclusive ? " incl." : ""}</span>
                  <span>{inr(invoice.tax.amount)}</span>
                </div>
              )}
              <div className="flex justify-between gap-6 font-semibold text-base pt-1"><span>Total</span><span className="text-wine-700">{inr(invoice.total)}</span></div>
              <div className="flex justify-between gap-6 text-cocoa-500"><span>Paid</span><span className="text-emerald-700">{inr(invoice.amountPaid)}</span></div>
              <div className="flex justify-between gap-6 font-semibold"><span>Balance Due</span><span className={invoice.balanceDue > 0 ? "text-rose-700" : "text-emerald-700"}>{inr(invoice.balanceDue)}</span></div>
            </div>

            {invoice.notes && (
              <div className="mt-5 pt-4 border-t border-wine-50">
                <div className="text-[10px] font-semibold tracking-wider text-cocoa-400">NOTES</div>
                <p className="text-sm text-cocoa-600 mt-1 whitespace-pre-wrap break-words">{invoice.notes}</p>
              </div>
            )}
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

        <div className="space-y-5 min-w-0">
          <div className="bg-white rounded-2xl border border-wine-100 p-5 overflow-hidden">
            <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Customer</h3>
            {invoice.customer ? (
              <Link to={`/admin/customers/${invoice.customer._id}`} className="font-medium text-wine-700 hover:underline break-words">
                {invoice.customerSnapshot.name}
              </Link>
            ) : (
              <div className="font-medium text-cocoa-900 break-words">{invoice.customerSnapshot.name}</div>
            )}
            <div className="text-sm text-cocoa-500 mt-1">{invoice.customerSnapshot.phone}</div>
            {invoice.customerSnapshot.email && <div className="text-sm text-cocoa-500 break-all">{invoice.customerSnapshot.email}</div>}
            {invoice.order ? (
              <Link to={`/admin/orders/${invoice.order._id}`} className="block text-xs text-wine-600 hover:underline mt-3">
                ↳ From order {invoice.order.orderNumber}
              </Link>
            ) : can("finance:write") && linkable.length > 0 ? (
              <div className="mt-4 pt-3 border-t border-wine-50">
                <p className="text-[11px] text-cocoa-500 mb-2">
                  Not linked to an order. Payments recorded here will not reach the order, and it can still be
                  invoiced again.
                </p>
                <select value={linkTo} onChange={(e) => setLinkTo(e.target.value)} className={inputCls}>
                  <option value="">Link to an order…</option>
                  {linkable.map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.orderNumber} — {inr(o.grandTotal)} · {fmtDate(o.fulfilment?.date || o.createdAt)}
                    </option>
                  ))}
                </select>
                <Button variant="outline" className="w-full mt-2" disabled={!linkTo} onClick={attachOrder}>
                  Link Order
                </Button>
              </div>
            ) : null}
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
                <Button variant="danger" onClick={deleteInvoice}>Delete Invoice</Button>
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

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${invoice.invoiceNumber}`} wide>
        <form onSubmit={saveEdit} className="space-y-4">
          <p className="text-xs text-cocoa-400 bg-cream-50 rounded-xl px-3 py-2">
            Totals are recalculated on save.
          </p>
          <InvoiceLinesEditor
            lines={edit.lines}
            discount={edit.discount}
            taxRate={edit.taxRate}
            onChange={onLinesChange}
            products={products}
            taxLabel={storeTax.label || "Tax"}
            taxPlaceholder={storeTax.enabled ? storeTax.rate : null}
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Due date">
              <input type="date" value={edit.dueDate} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Notes">
              <input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className={inputCls} maxLength={1000} />
            </Field>
          </div>
          <Button type="submit" className="w-full">Save Changes</Button>
        </form>
      </Modal>
    </div>
  );
}
