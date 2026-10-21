import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download, Plus, Search } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg, downloadFile } from "../../lib/api";
import { inr, fmtDate } from "../../lib/format";
import { SOURCE_LABELS } from "../../lib/meta";
import { PageHeader, Spinner, Th, Td, TableWrap, EmptyState, Badge, Button, Field, Modal, inputCls } from "../../components/admin/ui";
import { useAuth } from "../../store/AuthContext";

export default function Customers() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [customers, setCustomers] = useState(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", leadSource: "", tags: "" });

  const closeCreate = () => {
    setCreateOpen(false);
    setSubmitting(false);
    setForm({ name: "", phone: "", email: "", leadSource: "", tags: "" });
  };

  const createCustomer = async (e) => {
    e.preventDefault();
    if (!form.name || form.phone.replace(/\D/g, "").length < 8) {
      return toast.error("Enter a name and a valid phone number");
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/customers", {
        name: form.name.trim(),
        phone: form.phone,
        email: form.email.trim() || undefined,
        leadSource: form.leadSource || undefined,
        tags: form.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      });
      toast.success(`Customer ${data.customer.name} added`);
      closeCreate();
      load();
      navigate(`/admin/customers/${data.customer._id}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  };

  const load = (q = "") =>
    api.get("/customers", { params: q ? { search: q } : {} }).then((r) => setCustomers(r.data.customers)).catch(() => setCustomers([]));

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={customers ? `${customers.length} customer(s)` : ""}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadFile("/customers/export.csv", "cakestyles-customers.csv").catch((error) =>
                  toast.error(errMsg(error)),
                )
              }
            >
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            {can("customers:write") && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" /> New Customer
              </Button>
            )}
          </>
        }
      />

      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cocoa-400" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setTimeout(() => load(e.target.value), 250);
          }}
          placeholder="Search name, phone, email…"
          className={`${inputCls} pl-10`}
        />
      </div>

      {!customers ? (
        <Spinner />
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-wine-100">
          <EmptyState icon="👥" title="No customers yet" hint="Customers appear automatically when orders come in." />
        </div>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Tags</Th>
              <Th>Source</Th>
              <Th>Orders</Th>
              <Th>Lifetime Value</Th>
              <Th>Outstanding</Th>
              <Th>Last Order</Th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c._id} className="hover:bg-wine-50/50">
                <Td label="Customer">
                  <Link to={`/admin/customers/${c._id}`} className="font-medium text-wine-700 hover:underline">{c.name}</Link>
                  <div className="text-xs text-cocoa-400">{c.phone}{c.email ? ` · ${c.email}` : ""}</div>
                </Td>
                <Td label="Tags">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags || []).slice(0, 3).map((t) => (
                      <Badge key={t} className="bg-wine-50 text-wine-700">{t}</Badge>
                    ))}
                  </div>
                </Td>
                <Td className="text-xs text-cocoa-400 capitalize" label="Source">{c.leadSource || "—"}</Td>
                <Td className="font-medium" label="Orders">{c.orderCount}</Td>
                <Td className="font-medium" label="Lifetime Value">{inr(c.lifetimeValue)}</Td>
                <Td className={c.outstanding > 0 ? "text-rose-700 font-medium" : "text-cocoa-400"} label="Outstanding">
                  {c.outstanding > 0 ? inr(c.outstanding) : "—"}
                </Td>
                <Td className="text-xs text-cocoa-400" label="Last Order">{c.lastOrderAt ? fmtDate(c.lastOrderAt) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal open={createOpen} onClose={closeCreate} title="Add customer">
        <form onSubmit={createCustomer} className="space-y-4">
          <Field label="Name *">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required autoFocus />
          </Field>
          <Field label="Phone *">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 98765 43210" className={inputCls} required />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Lead source">
            <select value={form.leadSource} onChange={(e) => setForm({ ...form, leadSource: e.target.value })} className={inputCls}>
              <option value="">Select…</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Tags" hint="Comma-separated, e.g. vip, wedding">
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, wedding, corporate" className={inputCls} />
          </Field>
          <Button type="submit" disabled={submitting} className="w-full">Add Customer</Button>
        </form>
      </Modal>
    </div>
  );
}
