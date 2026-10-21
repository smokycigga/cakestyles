import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Download, Search, Trash2, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg, downloadFile } from "../../lib/api";
import { inr, fmtDate } from "../../lib/format";
import { validLines } from "../../lib/invoiceTotals";
import { downloadInvoicePdf } from "../../lib/invoiceRender";
import { INVOICE_STATUS_META, ORDER_STATUS_META } from "../../lib/meta";
import { PageHeader, Spinner, Th, Td, TableWrap, EmptyState, Badge, Button, inputCls, Modal, Field, StatCard } from "../../components/admin/ui";
import InvoiceLinesEditor from "../../components/admin/InvoiceLinesEditor";
import { useAuth } from "../../store/AuthContext";

export default function Invoices() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [invoices, setInvoices] = useState(null);
  const [status, setStatus] = useState("");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [storeTax, setStoreTax] = useState({ enabled: false, rate: 0, label: "Tax" });
  const [form, setForm] = useState({ customerId: "", dueDate: "", taxRate: "", discount: "", notes: "" });
  const [lines, setLines] = useState([{ description: "", quantity: 1, unitPrice: "" }]);

  const openCreate = () => {
    api.get("/customers").then((r) => setCustomers(r.data.customers)).catch(() => {});
    api.get("/products/admin").then((r) => setProducts(r.data.products)).catch(() => {});
    api.get("/settings/public").then((r) => setStoreTax(r.data.tax || { enabled: false, rate: 0, label: "Tax" })).catch(() => {});
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setForm({ customerId: "", dueDate: "", taxRate: "", discount: "", notes: "" });
    setLines([{ description: "", quantity: 1, unitPrice: "" }]);
  };

  const onLinesChange = (patch) => {
    if (patch.lines) setLines(patch.lines);
    setForm((f) => ({
      ...f,
      ...(patch.discount !== undefined ? { discount: patch.discount } : {}),
      ...(patch.taxRate !== undefined ? { taxRate: patch.taxRate } : {}),
    }));
  };

  const load = () => {
    const params = {};
    if (status) params.status = status;
    if (outstandingOnly) params.outstanding = "1";
    if (search) params.search = search;
    api.get("/invoices", { params }).then((r) => setInvoices(r.data.invoices)).catch(() => setInvoices([]));
  };

  // Debounce on the raw inputs. Calling setTimeout(load, 250) from onChange
  // captured a stale closure and always searched one keystroke behind.
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, outstandingOnly]);

  // A cancelled invoice bills nothing, so it must not inflate "Invoiced" —
  // that was reading higher than the total the dashboard reports, which
  // already excludes cancelled (dashboardController).
  const total = invoices?.filter((i) => i.status !== "cancelled").reduce((s, i) => s + i.total, 0) || 0;
  const outstanding = invoices?.filter((i) => !["paid", "cancelled", "draft"].includes(i.status)).reduce((s, i) => s + i.balanceDue, 0) || 0;

  const createStandalone = async (e) => {
    e.preventDefault();
    try {
      const payload = validLines(lines);
      if (!form.customerId || payload.length === 0) return toast.error("Pick a customer and add at least one line");
      const body = {
        customerId: form.customerId,
        lines: payload,
        dueDate: form.dueDate || undefined,
        taxRate: form.taxRate === "" ? null : Number(form.taxRate),
        discount: form.discount ? Number(form.discount) : 0,
        notes: form.notes || undefined,
      };
      let data;
      try {
        ({ data } = await api.post("/invoices", body));
      } catch (err) {
        // A hand-typed invoice cannot be linked to an order, and an unlinked
        // invoice never reports its payments back to one. If the customer has
        // an un-invoiced order, that order is almost certainly what this is for.
        const conflict = err?.response?.status === 409 && err.response.data?.code === "UNBILLED_ORDERS_EXIST";
        if (!conflict) throw err;
        const orders = err.response.data.unbilledOrders || [];
        const summary = orders
          .map((o) => `  • ${o.orderNumber} — ${inr(o.grandTotal)} (${ORDER_STATUS_META[o.status]?.label || o.status}), ${fmtDate(o.fulfilment?.date || o.createdAt)}`)
          .join("\n");
        const proceed = confirm(
          `${err.response.data.message}\n\n${summary}\n\nOpen the order and use "Generate Invoice" to keep them linked.\n\nOK — create an unlinked invoice anyway\nCancel — go back`,
        );
        if (!proceed) return;
        ({ data } = await api.post("/invoices", { ...body, confirmUnlinked: true }));
      }
      toast.success(`Invoice ${data.invoice.invoiceNumber} created`);
      closeCreate();
      navigate(`/admin/invoices/${data.invoice._id}`);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  // List rows omit line items, so fetch the full invoice before rendering the PDF.
  const downloadPdf = async (inv) => {
    try {
      const { data } = await api.get(`/invoices/${inv._id}`);
      await downloadInvoicePdf(data.invoice);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const canDelete = () => true;

  const deleteInvoice = async (inv) => {
    if (!confirm(`Delete invoice ${inv.invoiceNumber}? This cannot be undone.`)) return;
    try {
      await api.delete(`/invoices/${inv._id}`);
      toast.success(`Invoice ${inv.invoiceNumber} deleted`);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={invoices ? `${invoices.length} invoice(s)` : ""}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadFile("/invoices/export.csv", "cakestyles-invoices.csv").catch((error) =>
                  toast.error(errMsg(error)),
                )
              }
            >
              <Download className="w-4 h-4" /> Export
            </Button>
            {can("finance:write") && (
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4" /> New Invoice
              </Button>
            )}
          </>
        }
      />

      {invoices && invoices.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          <StatCard label="Invoiced (list)" value={inr(total)} />
          <StatCard label="Outstanding (list)" value={inr(outstanding)} tone={outstanding > 0 ? "warn" : "default"} />
          <StatCard label="Filters applied" value={`${status || "any"}${outstandingOnly ? " + outstanding" : ""}`} />
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-2 mb-5">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cocoa-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice #, customer, phone…" className={`${inputCls} pl-10`} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="">All statuses</option>
          {Object.entries(INVOICE_STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <label className={`flex items-center justify-center gap-2 border rounded-xl px-3 py-2 text-sm cursor-pointer transition-colors ${outstandingOnly ? "border-wine-600 bg-wine-50 text-wine-800" : "border-wine-100 text-cocoa-500"}`}>
          <input type="checkbox" checked={outstandingOnly} onChange={(e) => setOutstandingOnly(e.target.checked)} className="accent-wine-600" />
          Outstanding only
        </label>
      </div>

      {!invoices ? (
        <Spinner />
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-wine-100">
          <EmptyState icon="🧾" title="No invoices match" hint="Generate invoices from orders, or create standalone ones." />
        </div>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Customer</Th>
              <Th>Date</Th>
              <Th>Due</Th>
              <Th>Total</Th>
              <Th>Paid</Th>
              <Th>Balance</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv._id} className="hover:bg-wine-50/50">
                <Td label="Invoice">
                  <Link to={`/admin/invoices/${inv._id}`} className="font-medium text-wine-700 hover:underline">{inv.invoiceNumber}</Link>
                  {inv.order ? (
                    <div className="text-xs text-cocoa-400">↳ order</div>
                  ) : (
                    <div className="text-xs text-amber-600">no order</div>
                  )}
                </Td>
                <Td label="Customer">{inv.customerSnapshot?.name}</Td>
                <Td className="text-xs text-cocoa-400" label="Date">{fmtDate(inv.createdAt)}</Td>
                <Td className="text-xs text-cocoa-400" label="Due">{inv.dueDate || "—"}</Td>
                <Td className="font-medium" label="Total">{inr(inv.total)}</Td>
                <Td className="text-emerald-700" label="Paid">{inr(inv.amountPaid)}</Td>
                <Td className={inv.balanceDue > 0 ? "text-rose-700 font-medium" : "text-cocoa-400"} label="Balance">{inv.balanceDue > 0 ? inr(inv.balanceDue) : "—"}</Td>
                <Td label="Status"><Badge className={INVOICE_STATUS_META[inv.status]?.color}>{INVOICE_STATUS_META[inv.status]?.label}</Badge></Td>
                <Td label="Actions">
                  <div className="flex items-center gap-1">
                    {can("finance:write") && inv.status !== "cancelled" && (
                      <Link
                        to={`/admin/invoices/${inv._id}?edit=1`}
                        title="Edit invoice"
                        className="text-cocoa-400 hover:text-wine-700 p-1 rounded-lg hover:bg-wine-50 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </Link>
                    )}
                    <button
                      type="button"
                      title="Download PDF"
                      onClick={() => downloadPdf(inv)}
                      className="text-cocoa-400 hover:text-wine-700 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {can("finance:write") && canDelete(inv) && (
                      <button
                        type="button"
                        title="Delete invoice"
                        onClick={() => deleteInvoice(inv)}
                        className="text-cocoa-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {/* Standalone invoice modal */}
      <Modal open={createOpen} onClose={closeCreate} title="New standalone invoice" wide>
        <form onSubmit={createStandalone} className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Customer *" span={2}>
              <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className={inputCls} required>
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>{c.name} ({c.phone})</option>
                ))}
              </select>
            </Field>
            <Field label="Due date">
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputCls} />
            </Field>
          </div>

          <InvoiceLinesEditor
            lines={lines}
            discount={form.discount}
            taxRate={form.taxRate}
            onChange={onLinesChange}
            products={products}
            taxLabel={storeTax.label || "Tax"}
            taxPlaceholder={storeTax.enabled ? storeTax.rate : null}
          />

          <Field label="Notes">
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </Field>
          <Button type="submit" className="w-full">Create Invoice</Button>
        </form>
      </Modal>
    </div>
  );
}
