import { useEffect, useState } from "react";
import { Plus, Download, Trash2, Search } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { compressImage } from "../../lib/imageCompress";
import { inr, fmtDate, todayStr } from "../../lib/format";
import { EXPENSE_CATEGORIES, PAYMENT_METHOD_LABELS } from "../../lib/meta";
import { PageHeader, Spinner, Th, Td, TableWrap, EmptyState, Badge, Button, Field, inputCls, Modal, StatCard } from "../../components/admin/ui";
import { useAuth } from "../../store/AuthContext";

const EMPTY = {
  date: todayStr(),
  category: "ingredients",
  description: "",
  amount: "",
  vendor: "",
  paymentMethod: "",
  notes: "",
  recurring: false,
  frequency: "monthly",
  attachment: "",
};

export default function Expenses() {
  const { can } = useAuth();
  const [expenses, setExpenses] = useState(null);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({ category: "", from: "", to: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    api.get("/expenses", { params }).then((r) => setExpenses(r.data)).catch(() => setExpenses({ expenses: [] }));
    api.get("/expenses/summary", { params }).then((r) => setSummary(r.data)).catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const set = (k) => (e) => {
    const v = e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (exp) => {
    setEditId(exp._id);
    setForm({
      date: exp.date,
      category: exp.category,
      description: exp.description,
      amount: String(exp.amount),
      vendor: exp.vendor || "",
      paymentMethod: exp.paymentMethod || "",
      notes: exp.notes || "",
      recurring: !!exp.recurring?.isRecurring,
      frequency: exp.recurring?.frequency || "monthly",
      attachment: exp.attachment || "",
    });
    setModalOpen(true);
  };

  const uploadReceipt = async (file) => {
    try {
      const dataUrl = await compressImage(file, 1600, 0.7);
      const { data } = await api.post("/media", { dataUrl, alt: "expense receipt" });
      setForm((f) => ({ ...f, attachment: data.url }));
      toast.success("Receipt attached");
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const body = {
      date: form.date,
      category: form.category,
      description: form.description,
      amount: Number(form.amount),
      vendor: form.vendor || undefined,
      paymentMethod: form.paymentMethod || undefined,
      notes: form.notes || undefined,
      recurring: { isRecurring: form.recurring, frequency: form.recurring ? form.frequency : "" },
      attachment: form.attachment || undefined,
    };
    try {
      if (editId) await api.put(`/expenses/${editId}`, body);
      else await api.post("/expenses", body);
      toast.success(editId ? "Expense updated" : "Expense recorded");
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this expense?")) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle={summary ? `Total in view: ${inr(summary.total)}` : ""}
        actions={
          <>
            <Button variant="outline" onClick={() => window.open("/api/expenses/export.csv", "_blank")}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            {can("expenses:write") && (
              <Button onClick={openCreate}><Plus className="w-4 h-4" /> Add Expense</Button>
            )}
          </>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <StatCard label="Total" value={inr(summary.total)} tone="wine" />
          {Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, amt]) => (
            <StatCard key={cat} label={cat} value={inr(amt)} />
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-2 mb-5">
        <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className={inputCls}>
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={inputCls} title="From" />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={inputCls} title="To" />
      </div>

      {!expenses ? (
        <Spinner />
      ) : expenses.expenses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-wine-100">
          <EmptyState icon="💰" title="No expenses recorded" hint="Track ingredient, packaging, rent and other costs to see true profitability." />
        </div>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Description</Th>
              <Th>Category</Th>
              <Th>Vendor</Th>
              <Th>Method</Th>
              <Th>Amount</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {expenses.expenses.map((exp) => (
              <tr key={exp._id} className="hover:bg-wine-50/50">
                <Td className="text-xs text-cocoa-400 whitespace-nowrap">{fmtDate(exp.date)}</Td>
                <Td>
                  <span className="font-medium text-cocoa-800">{exp.description}</span>
                  {exp.recurring?.isRecurring && <Badge className="bg-violet-50 text-violet-600 ml-2">{exp.recurring.frequency}</Badge>}
                  {exp.attachment && (
                    <a href={exp.attachment} target="_blank" rel="noreferrer" className="text-xs text-wine-600 hover:underline ml-2">receipt</a>
                  )}
                </Td>
                <Td><Badge className="bg-cream-100 text-cocoa-600">{exp.category}</Badge></Td>
                <Td className="text-xs text-cocoa-400">{exp.vendor || "—"}</Td>
                <Td className="text-xs text-cocoa-400">{exp.paymentMethod ? (PAYMENT_METHOD_LABELS[exp.paymentMethod] || exp.paymentMethod) : "—"}</Td>
                <Td className="font-semibold text-rose-700">-{inr(exp.amount)}</Td>
                {can("expenses:write") && (
                  <Td>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(exp)} className="text-xs text-wine-600 hover:underline px-1">Edit</button>
                      <button onClick={() => remove(exp._id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-cocoa-400 hover:text-rose-600" aria-label="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Edit expense" : "Record expense"}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *">
              <input type="date" value={form.date} onChange={set("date")} className={inputCls} required />
            </Field>
            <Field label="Category *">
              <select value={form.category} onChange={set("category")} className={inputCls}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Description *">
            <input value={form.description} onChange={set("description")} className={inputCls} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹) *">
              <input type="number" min="0" step="0.01" value={form.amount} onChange={set("amount")} className={inputCls} required />
            </Field>
            <Field label="Vendor">
              <input value={form.vendor} onChange={set("vendor")} className={inputCls} />
            </Field>
            <Field label="Payment method">
              <select value={form.paymentMethod} onChange={set("paymentMethod")} className={inputCls}>
                <option value="">—</option>
                {Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => k !== "razorpay").map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Receipt (photo)">
              <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadReceipt(e.target.files[0])} className="text-sm" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-cocoa-700">
            <input type="checkbox" checked={form.recurring} onChange={set("recurring")} className="accent-wine-600" />
            Recurring
          </label>
          {form.recurring && (
            <Field label="Frequency">
              <select value={form.frequency} onChange={set("frequency")} className={inputCls}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </Field>
          )}
          <Field label="Notes">
            <input value={form.notes} onChange={set("notes")} className={inputCls} />
          </Field>
          <Button type="submit" className="w-full">{editId ? "Save" : "Record Expense"}</Button>
        </form>
      </Modal>
    </div>
  );
}
