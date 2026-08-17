import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Download, Search } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { inr, fmtDate } from "../../lib/format";
import { INVOICE_STATUS_META } from "../../lib/meta";
import { PageHeader, Spinner, Th, Td, TableWrap, EmptyState, Badge, Button, inputCls, Modal, Field, StatCard } from "../../components/admin/ui";
import { useAuth } from "../../store/AuthContext";

export default function Invoices() {
  const { can } = useAuth();
  const [invoices, setInvoices] = useState(null);
  const [status, setStatus] = useState("");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ customerId: "", dueDate: "", taxRate: "", discount: "", notes: "" });
  const [lines, setLines] = useState([{ description: "", quantity: 1, unitPrice: "" }]);

  const load = () => {
    const params = {};
    if (status) params.status = status;
    if (outstandingOnly) params.outstanding = "1";
    if (search) params.search = search;
    api.get("/invoices", { params }).then((r) => setInvoices(r.data.invoices)).catch(() => setInvoices([]));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, outstandingOnly]);

  const total = invoices?.reduce((s, i) => s + i.total, 0) || 0;
  const outstanding = invoices?.filter((i) => !["paid", "cancelled", "draft"].includes(i.status)).reduce((s, i) => s + i.balanceDue, 0) || 0;

  const createStandalone = async (e) => {
    e.preventDefault();
    try {
      const validLines = lines
        .filter((l) => l.description && l.unitPrice !== "")
        .map((l) => ({ description: l.description, quantity: Number(l.quantity) || 1, unitPrice: Number(l.unitPrice) }));
      if (!form.customerId || validLines.length === 0) return toast.error("Pick a customer and add at least one line");
      const { data } = await api.post("/invoices", {
        customerId: form.customerId,
        lines: validLines,
        dueDate: form.dueDate || undefined,
        taxRate: form.taxRate === "" ? null : Number(form.taxRate),
        discount: form.discount ? Number(form.discount) : 0,
        notes: form.notes || undefined,
      });
      toast.success(`Invoice ${data.invoice.invoiceNumber} created`);
      setCreateOpen(false);
      window.location.href = `/admin/invoices/${data.invoice._id}`;
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const lineTotal = lines.reduce((s, l) => s + ((Number(l.unitPrice) || 0) * (Number(l.quantity) || 0)), 0);

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={invoices ? `${invoices.length} invoice(s)` : ""}
        actions={
          <>
            <Button variant="outline" onClick={() => window.open("/api/invoices/export.csv", "_blank")}>
              <Download className="w-4 h-4" /> Export
            </Button>
            {can("finance:write") && (
              <Button
                onClick={() => {
                  api.get("/customers").then((r) => setCustomers(r.data.customers));
                  setCreateOpen(true);
                }}
              >
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
          <input value={search} onChange={(e) => { setSearch(e.target.value); setTimeout(load, 250); }} placeholder="Invoice #, customer, phone…" className={`${inputCls} pl-10`} />
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
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv._id} className="hover:bg-wine-50/50">
                <Td>
                  <Link to={`/admin/invoices/${inv._id}`} className="font-medium text-wine-700 hover:underline">{inv.invoiceNumber}</Link>
                  {inv.order && <div className="text-xs text-cocoa-400">↳ order</div>}
                </Td>
                <Td>{inv.customerSnapshot?.name}</Td>
                <Td className="text-xs text-cocoa-400">{fmtDate(inv.createdAt)}</Td>
                <Td className="text-xs text-cocoa-400">{inv.dueDate || "—"}</Td>
                <Td className="font-medium">{inr(inv.total)}</Td>
                <Td className="text-emerald-700">{inr(inv.amountPaid)}</Td>
                <Td className={inv.balanceDue > 0 ? "text-rose-700 font-medium" : "text-cocoa-400"}>{inv.balanceDue > 0 ? inr(inv.balanceDue) : "—"}</Td>
                <Td><Badge className={INVOICE_STATUS_META[inv.status]?.color}>{INVOICE_STATUS_META[inv.status]?.label}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {/* Standalone invoice modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New standalone invoice" wide>
        <form onSubmit={createStandalone} className="space-y-4">
          <div className="grid sm:grid-cols-4 gap-3">
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
            <Field label="Tax rate % (blank = none)">
              <input type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} className={inputCls} />
            </Field>
          </div>

          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6">
                  <span className="text-[11px] text-cocoa-400">Description</span>
                  <input value={l.description} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)))} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <span className="text-[11px] text-cocoa-400">Qty</span>
                  <input type="number" min="1" value={l.quantity} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))} className={inputCls} />
                </div>
                <div className="col-span-3">
                  <span className="text-[11px] text-cocoa-400">Unit price ₹</span>
                  <input type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, unitPrice: e.target.value } : x)))} className={inputCls} />
                </div>
                <div className="col-span-1">
                  <button type="button" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="w-full py-2 text-cocoa-400 hover:text-rose-600">×</button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setLines([...lines, { description: "", quantity: 1, unitPrice: "" }])}>
              <Plus className="w-4 h-4" /> Add line
            </Button>
          </div>

          <div className="flex justify-between items-center text-sm bg-cream-50 rounded-xl px-4 py-3">
            <span className="text-cocoa-500">Lines total</span>
            <span className="font-semibold text-wine-700">{inr(lineTotal)}</span>
          </div>

          <Field label="Notes">
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </Field>
          <Button type="submit" className="w-full">Create Invoice</Button>
        </form>
      </Modal>
    </div>
  );
}
