import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Plus, Trash2, ExternalLink, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { PageHeader, Spinner, Th, Td, TableWrap, Button, Field, inputCls, Modal, EmptyState, Badge } from "../../components/admin/ui";
import { useAuth } from "../../store/AuthContext";

export default function MenuManager() {
  const { can } = useAuth();
  const [categories, setCategories] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newCat, setNewCat] = useState({ name: "", description: "", image: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [editCat, setEditCat] = useState(null);

  const load = () => api.get("/categories?all=1").then((r) => setCategories(r.data.categories));
  useEffect(() => {
    load();
  }, []);

  const move = async (cat, dir) => {
    const sorted = [...categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const idx = sorted.findIndex((c) => c._id === cat._id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    try {
      await Promise.all(sorted.map((c, i) => api.put(`/categories/${c._id}`, { order: i })));
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/categories", newCat);
      toast.success("Category added");
      setAddOpen(false);
      setNewCat({ name: "", description: "", image: "" });
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const openEdit = (cat) => {
    setEditCat({ ...cat });
    setEditOpen(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      // The slug is deliberately left out: renaming a category must not break
      // links already shared as /menu?category=<slug>.
      await api.put(`/categories/${editCat._id}`, {
        name: editCat.name,
        description: editCat.description || "",
        image: editCat.image || "",
      });
      toast.success("Category updated");
      setEditOpen(false);
      setEditCat(null);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const toggleActive = async (cat) => {
    try {
      await api.put(`/categories/${cat._id}`, { active: !cat.active });
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const remove = async (cat) => {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await api.delete(`/categories/${cat._id}`);
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const sorted = categories ? [...categories].sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name)) : [];

  return (
    <div>
      <PageHeader
        title="Menu"
        subtitle="Categories, ordering and the public share link"
        actions={
          can("catalog:write") && (
            <Button onClick={() => setAddOpen(true)}><Plus className="w-4 h-4" /> Add Category</Button>
          )
        }
      />

      <div className="bg-wine-700 text-white rounded-2xl p-5 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-blush-200">Public menu URL</div>
          <div className="font-mono text-sm mt-1">{`${window.location.origin}/menu`}</div>
          <div className="text-xs text-blush-200/70 mt-1">Share this link on Instagram/WhatsApp — the QR from the menu page always opens it.</div>
        </div>
        <a
          href="/menu"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 bg-blush-300 hover:bg-blush-400 text-wine-900 font-medium text-sm px-5 py-2.5 rounded-xl transition-colors"
        >
          Preview Menu <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {!categories ? (
        <Spinner />
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-wine-100">
          <EmptyState title="No categories yet" hint="Create your first menu category." />
        </div>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Category</Th>
              <Th>Slug</Th>
              <Th>Visible</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr key={c._id} className="hover:bg-wine-50/50">
                <Td label="Order">
                  <div className="flex gap-1">
                    <button disabled={i === 0} onClick={() => move(c, "up")} className="p-1 rounded hover:bg-wine-100 disabled:opacity-30" aria-label="Move up">
                      <ArrowUp className="w-4 h-4 text-cocoa-500" />
                    </button>
                    <button disabled={i === sorted.length - 1} onClick={() => move(c, "down")} className="p-1 rounded hover:bg-wine-100 disabled:opacity-30" aria-label="Move down">
                      <ArrowDown className="w-4 h-4 text-cocoa-500" />
                    </button>
                  </div>
                </Td>
                <Td label="Category">
                  <div className="font-medium text-cocoa-800">{c.name}</div>
                  {c.description && <div className="text-xs text-cocoa-400">{c.description}</div>}
                </Td>
                <Td className="text-xs text-cocoa-400 font-mono" label="Slug">{c.slug}</Td>
                <Td label="Visible">
                  <button onClick={() => toggleActive(c)}>
                    <Badge className={c.active ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}>
                      {c.active ? "Visible" : "Hidden"}
                    </Badge>
                  </button>
                </Td>
                {can("catalog:write") && (
                  <Td label="Actions">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-wine-50 text-cocoa-400 hover:text-wine-700" aria-label="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(c)} className="p-1.5 rounded-lg hover:bg-rose-50 text-cocoa-400 hover:text-rose-600" aria-label="Delete">
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

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New category">
        <form onSubmit={create} className="space-y-4">
          <Field label="Name *">
            <input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} className={inputCls} required autoFocus />
          </Field>
          <Field label="Description">
            <input value={newCat.description} onChange={(e) => setNewCat({ ...newCat, description: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Image URL">
            <input value={newCat.image} onChange={(e) => setNewCat({ ...newCat, image: e.target.value })} placeholder="/images/menu-items/…" className={inputCls} />
          </Field>
          <Button type="submit" className="w-full">Add Category</Button>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit category">
        {editCat && (
          <form onSubmit={saveEdit} className="space-y-4">
            <Field label="Name *">
              <input value={editCat.name} onChange={(e) => setEditCat({ ...editCat, name: e.target.value })} className={inputCls} required autoFocus />
            </Field>
            <Field label="Description">
              <input value={editCat.description || ""} onChange={(e) => setEditCat({ ...editCat, description: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Image URL">
              <input value={editCat.image || ""} onChange={(e) => setEditCat({ ...editCat, image: e.target.value })} placeholder="/images/menu-items/…" className={inputCls} />
            </Field>
            <p className="text-[11px] text-cocoa-400">
              Slug stays <span className="font-mono">{editCat.slug}</span> so shared menu links keep working.
            </p>
            <Button type="submit" className="w-full">Save Changes</Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
