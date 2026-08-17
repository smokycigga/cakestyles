import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Upload, Download, Copy, Archive, Search } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { inr, fmtDate } from "../../lib/format";
import { PageHeader, Spinner, Badge, Th, Td, TableWrap, EmptyState, Button, inputCls, Modal, Field } from "../../components/admin/ui";
import { useAuth } from "../../store/AuthContext";

const STATUS_META = {
  published: "bg-emerald-100 text-emerald-800",
  draft: "bg-gray-200 text-gray-600",
  scheduled: "bg-violet-100 text-violet-800",
  archived: "bg-gray-100 text-gray-500",
};
const AVAIL_META = {
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-100 text-amber-800",
  sold_out: "bg-rose-100 text-rose-800",
};

export default function Products() {
  const { can } = useAuth();
  const [products, setProducts] = useState(null);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState("publish");
  const [priceChange, setPriceChange] = useState({ type: "percent", value: "" });
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const fileRef = useRef(null);

  const load = () => api.get("/products/admin", { params: search ? { search } : {} }).then((r) => setProducts(r.data.products));
  useEffect(() => {
    api.get("/categories?all=1").then((r) => setCategories(r.data.categories)).catch(() => {});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === products.length ? new Set() : new Set(products.map((p) => p._id))));

  const runBulk = async () => {
    try {
      const { data } = await api.post("/products/bulk", {
        ids: [...selected],
        action: bulkAction,
        ...(bulkAction === "price" ? { priceChange: { type: priceChange.type, value: Number(priceChange.value) } } : {}),
      });
      toast.success(`Updated ${data.updated} product(s)`);
      setBulkOpen(false);
      setSelected(new Set());
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const duplicate = async (id) => {
    try {
      await api.post(`/products/${id}/duplicate`);
      toast.success("Duplicated as draft");
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const archive = async (id) => {
    if (!confirm("Archive this product? It disappears from the menu but past orders keep their history.")) return;
    try {
      await api.post(`/products/${id}/archive`);
      toast.success("Archived");
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const parseCsv = (text) => {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cells = line.match(/("([^"]|"")*"|[^,]*)/g)?.filter((_, i) => i % 2 === 0) || line.split(",");
      const row = {};
      headers.forEach((h, i) => (row[h] = (cells[i] || "").trim().replace(/^"|"$/g, "")));
      return row;
    });
  };

  const doImport = async () => {
    try {
      const rows = parseCsv(importText);
      if (!rows.length) return toast.error("No rows found — paste CSV with a header row");
      const { data } = await api.post("/products/import", { rows });
      toast.success(`Imported: ${data.created} created, ${data.updated} updated${data.errors.length ? `, ${data.errors.length} errors` : ""}`);
      if (data.errors.length) console.warn(data.errors);
      setImportOpen(false);
      setImportText("");
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const download = (path) => window.open(`/api${path}`, "_blank");

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={products ? `${products.length} product(s)` : ""}
        actions={
          can("catalog:write") && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4" /> Import CSV</Button>
              <Button variant="outline" onClick={() => download("/products/export.csv")}><Download className="w-4 h-4" /> Export</Button>
              <Link to="/admin/products/new" className="inline-flex items-center gap-1.5 bg-wine-700 hover:bg-wine-800 text-white font-medium text-sm px-4 py-2 rounded-xl transition-colors">
                <Plus className="w-4 h-4" /> Add Product
              </Link>
            </>
          )
        }
      />

      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cocoa-400" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setTimeout(load, 200); }} placeholder="Search name or SKU…" className={`${inputCls} pl-10`} />
      </div>

      {selected.size > 0 && can("catalog:write") && (
        <div className="flex items-center gap-3 bg-wine-700 text-white rounded-xl px-4 py-2.5 mb-4 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Button variant="ghost" className="!text-white hover:!bg-wine-600" onClick={() => setBulkOpen(true)}>Bulk action…</Button>
          <Button variant="ghost" className="!text-white hover:!bg-wine-600" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {!products ? (
        <Spinner />
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-wine-100">
          <EmptyState title="No products yet" hint="Add your first product or import a CSV." />
        </div>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              {can("catalog:write") && (
                <Th><input type="checkbox" checked={selected.size === products.length} onChange={toggleAll} className="accent-wine-600" /></Th>
              )}
              <Th>Product</Th>
              <Th>Category</Th>
              <Th>Price</Th>
              <Th>Status</Th>
              <Th>Availability</Th>
              <Th>Updated</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p._id} className="hover:bg-wine-50/50">
                {can("catalog:write") && (
                  <Td><input type="checkbox" checked={selected.has(p._id)} onChange={() => toggle(p._id)} className="accent-wine-600" /></Td>
                )}
                <Td>
                  {can("catalog:write") ? (
                    <Link to={`/admin/products/${p._id}`} className="font-medium text-cocoa-800 hover:text-wine-700 hover:underline">{p.name}</Link>
                  ) : (
                    <span className="font-medium text-cocoa-800">{p.name}</span>
                  )}
                  {p.sku && <div className="text-xs text-cocoa-400">{p.sku}</div>}
                </Td>
                <Td className="text-cocoa-500 text-xs">{p.category?.name}</Td>
                <Td className="font-medium">
                  {inr(p.basePrice)}
                  {p.variants?.length > 0 && <span className="text-xs text-cocoa-400 ml-1">+{p.variants.length} var.</span>}
                </Td>
                <Td><Badge className={STATUS_META[p.status]}>{p.status}</Badge></Td>
                <Td><Badge className={AVAIL_META[p.availability]}>{p.availability.replace("_", " ")}</Badge></Td>
                <Td className="text-xs text-cocoa-400">{fmtDate(p.updatedAt)}</Td>
                {can("catalog:write") && (
                  <Td>
                    <div className="flex gap-1">
                      <button onClick={() => duplicate(p._id)} title="Duplicate" className="p-1.5 rounded-lg hover:bg-wine-50 text-cocoa-400 hover:text-wine-600">
                        <Copy className="w-4 h-4" />
                      </button>
                      {p.status !== "archived" && (
                        <button onClick={() => archive(p._id)} title="Archive" className="p-1.5 rounded-lg hover:bg-rose-50 text-cocoa-400 hover:text-rose-600">
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {/* Bulk modal */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title={`Bulk update ${selected.size} product(s)`}>
        <div className="space-y-4">
          <Field label="Action">
            <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)} className={inputCls}>
              <option value="publish">Publish</option>
              <option value="unpublish">Move to draft</option>
              <option value="activate">Set available</option>
              <option value="pause">Pause</option>
              <option value="sold_out">Mark sold out</option>
              <option value="price">Update price</option>
            </select>
          </Field>
          {bulkAction === "price" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select value={priceChange.type} onChange={(e) => setPriceChange({ ...priceChange, type: e.target.value })} className={inputCls}>
                  <option value="percent">Percent (±)</option>
                  <option value="flat">Flat ₹ (±)</option>
                </select>
              </Field>
              <Field label="Value">
                <input type="number" step="0.01" value={priceChange.value} onChange={(e) => setPriceChange({ ...priceChange, value: e.target.value })} className={inputCls} placeholder="e.g. 10 or -20" />
              </Field>
            </div>
          )}
          <Button onClick={runBulk} className="w-full">Apply to {selected.size} product(s)</Button>
        </div>
      </Modal>

      {/* Import modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import products from CSV" wide>
        <div className="space-y-4">
          <p className="text-sm text-cocoa-500">
            Columns: <code className="text-xs bg-cream-100 px-1.5 py-0.5 rounded">name, category, sku, basePrice, shortDescription, description, availability, orderability, status, featured, tags, variants, addOns, prepTimeHours, taxRate</code>.
            Tags/variants/addOns use <code className="text-xs">a|b|c</code>; variants as <code className="text-xs">0.5 kg=750|1 kg=1400</code>. Rows matching an existing product name are updated.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = () => setImportText(String(reader.result));
                reader.readAsText(file);
              }
            }}
            className="text-sm"
          />
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={8}
            placeholder="…or paste CSV here"
            className="w-full font-mono text-xs border border-wine-100 rounded-xl p-3 focus:outline-none focus:border-wine-400"
          />
          <Button onClick={doImport} className="w-full">Import</Button>
        </div>
      </Modal>
    </div>
  );
}
