import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { ROLE_LABELS } from "../../lib/meta";
import { PageHeader, Spinner, Th, Td, TableWrap, Badge, Button, Field, inputCls, Modal } from "../../components/admin/ui";

export default function Users() {
  const [users, setUsers] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" });

  const load = () => api.get("/users").then((r) => setUsers(r.data.users)).catch(() => setUsers([]));
  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/users", form);
      toast.success("User created");
      setAddOpen(false);
      setForm({ name: "", email: "", password: "", role: "staff" });
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const updateUser = async (id, patch) => {
    try {
      await api.put(`/users/${id}`, patch);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        subtitle="Owner has full access. Roles are enforced by the server."
        actions={<Button onClick={() => setAddOpen(true)}><Plus className="w-4 h-4" /> Add User</Button>}
      />

      {!users ? (
        <Spinner />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} className="hover:bg-wine-50/50">
                <Td>
                  <div className="font-medium text-cocoa-800">{u.name}</div>
                  <div className="text-xs text-cocoa-400">{u.email}</div>
                </Td>
                <Td>
                  <select
                    value={u.role}
                    disabled={u.role === "owner"}
                    onChange={(e) => updateUser(u._id, { role: e.target.value })}
                    className="border border-wine-100 rounded-lg px-2 py-1 text-sm bg-white disabled:opacity-60"
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </Td>
                <Td>
                  <Badge className={u.active ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}>
                    {u.active ? "Active" : "Deactivated"}
                  </Badge>
                </Td>
                <Td className="text-xs text-cocoa-400">{fmtDate(u.createdAt)}</Td>
                <Td>
                  {u.role !== "owner" && (
                    <button
                      onClick={() => updateUser(u._id, { active: !u.active })}
                      className="text-xs text-wine-600 hover:underline"
                    >
                      {u.active ? "Deactivate" : "Reactivate"}
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <div className="bg-white rounded-2xl border border-wine-100 p-5 mt-6 max-w-2xl">
        <h3 className="text-sm font-semibold text-cocoa-900 mb-3">What each role can do</h3>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-cocoa-500">
          <div><span className="font-medium text-cocoa-800">Owner</span> — everything: settings, users, audit log, finances.</div>
          <div><span className="font-medium text-cocoa-800">Manager</span> — catalog, menu, orders, customers, invoices, analytics.</div>
          <div><span className="font-medium text-cocoa-800">Staff</span> — order processing, status updates, customer lookup.</div>
          <div><span className="font-medium text-cocoa-800">Accounts</span> — invoices, payments, expenses, exports, reports.</div>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add user">
        <form onSubmit={create} className="space-y-4">
          <Field label="Name *">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required autoFocus />
          </Field>
          <Field label="Email *">
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} required />
          </Field>
          <Field label="Password *" hint="Minimum 8 characters — share it securely, they can change it after login.">
            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} required minLength={8} />
          </Field>
          <Field label="Role *">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
              {Object.entries(ROLE_LABELS).filter(([k]) => k !== "owner").map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Button type="submit" className="w-full">Create User</Button>
        </form>
      </Modal>
    </div>
  );
}
