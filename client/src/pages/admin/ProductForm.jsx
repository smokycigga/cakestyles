import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, X, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { compressImage } from "../../lib/imageCompress";
import { PageHeader, Button, Field, inputCls } from "../../components/admin/ui";

const EMPTY = {
  name: "",
  sku: "",
  category: "",
  shortDescription: "",
  description: "",
  images: [],
  basePrice: "",
  variants: [],
  addOns: [],
  availability: "active",
  orderability: "online",
  featured: false,
  tags: [],
  prepTimeHours: 24,
  taxRate: "",
  costPrice: "",
  internalNotes: "",
  status: "draft",
  publishAt: "",
};

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const [form, setForm] = useState(EMPTY);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [variantDraft, setVariantDraft] = useState({ name: "", price: "" });
  const [addOnDraft, setAddOnDraft] = useState({ name: "", price: "" });

  useEffect(() => {
    api.get("/categories?all=1").then((r) => setCategories(r.data.categories));
    if (!isNew) {
      api.get(`/products/admin/${id}`).then((r) => {
        const p = r.data.product;
        setForm({
          ...EMPTY,
          ...p,
          category: p.category?._id || p.category,
          basePrice: String(p.basePrice),
          taxRate: p.taxRate == null ? "" : String(p.taxRate),
          costPrice: p.costPrice == null ? "" : String(p.costPrice),
          prepTimeHours: p.prepTimeHours ?? 24,
          publishAt: p.publishAt ? String(p.publishAt).slice(0, 10) : "",
        });
      });
    }
  }, [id, isNew]);

  const set = (k) => (e) => {
    const v = e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const uploadImage = async (file) => {
    setUploading(true);
    try {
      const dataUrl = await compressImage(file);
      const { data } = await api.post("/media", { dataUrl, alt: form.name });
      setForm((f) => ({ ...f, images: [...f.images, data.url] }));
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setUploading(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name || !form.category || !form.description) {
      return toast.error("Name, category and description are required");
    }
    if (Number(form.basePrice) < 0 || form.basePrice === "") {
      return toast.error("Enter a valid base price");
    }

    const body = {
      name: form.name,
      sku: form.sku,
      category: form.category,
      shortDescription: form.shortDescription,
      description: form.description,
      images: form.images,
      basePrice: Number(form.basePrice),
      variants: form.variants.map((v) => ({ name: v.name, price: Number(v.price) })),
      addOns: form.addOns.map((a) => ({ name: a.name, price: Number(a.price) })),
      availability: form.availability,
      orderability: form.orderability,
      featured: form.featured,
      tags: form.tags,
      prepTimeHours: Number(form.prepTimeHours) || 0,
      taxRate: form.taxRate === "" ? null : Number(form.taxRate),
      costPrice: form.costPrice === "" ? null : Number(form.costPrice),
      internalNotes: form.internalNotes,
      status: form.status,
      publishAt: form.status === "scheduled" && form.publishAt ? new Date(form.publishAt).toISOString() : null,
    };

    setSaving(true);
    try {
      if (isNew) {
        const { data } = await api.post("/products", body);
        toast.success("Product created");
        navigate(`/admin/products/${data.product._id}`);
      } else {
        await api.put(`/products/${id}`, body);
        toast.success("Saved");
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link to="/admin/products" className="inline-flex items-center gap-1 text-sm text-cocoa-400 hover:text-wine-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> All products
      </Link>
      <PageHeader title={isNew ? "Add Product" : `Edit: ${form.name || ""}`} />

      <form onSubmit={save} className="space-y-5 max-w-4xl">
        {/* Basics */}
        <section className="bg-white rounded-2xl border border-wine-100 p-5 grid sm:grid-cols-2 gap-3">
          <Field label="Product name *">
            <input value={form.name} onChange={set("name")} className={inputCls} required />
          </Field>
          <Field label="SKU / internal code">
            <input value={form.sku} onChange={set("sku")} className={inputCls} />
          </Field>
          <Field label="Category *">
            <select value={form.category} onChange={set("category")} className={inputCls} required>
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Base price (₹) *">
            <input type="number" min="0" step="0.01" value={form.basePrice} onChange={set("basePrice")} className={inputCls} required />
          </Field>
          <Field label="Short description" span={2} hint="One line shown on menu cards">
            <input value={form.shortDescription} onChange={set("shortDescription")} className={inputCls} />
          </Field>
          <Field label="Full description *" span={2}>
            <textarea value={form.description} onChange={set("description")} rows={3} className={inputCls} required />
          </Field>
        </section>

        {/* Images */}
        <section className="bg-white rounded-2xl border border-wine-100 p-5">
          <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Images</h3>
          <div className="flex flex-wrap gap-3">
            {form.images.map((url, i) => (
              <div key={i} className="relative w-24 h-24 group">
                <img src={url} alt="" className="w-24 h-24 rounded-xl object-cover border border-wine-100" />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }))}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow"
                  aria-label="Remove image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <label className="w-24 h-24 rounded-xl border-2 border-dashed border-wine-200 flex flex-col items-center justify-center cursor-pointer hover:border-wine-400 text-cocoa-400">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              <span className="text-[10px] mt-1">Upload</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
              />
            </label>
          </div>
          <p className="text-[11px] text-cocoa-400 mt-2">Images are compressed automatically and stored in the database — no external service needed.</p>
        </section>

        {/* Variants & add-ons */}
        <section className="bg-white rounded-2xl border border-wine-100 p-5 grid sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Variants / sizes</h3>
            <div className="space-y-2 mb-3">
              {form.variants.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 bg-cream-50 rounded-lg px-3 py-1.5">{v.name}</span>
                  <span className="w-20 bg-cream-50 rounded-lg px-3 py-1.5">₹{v.price}</span>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }))} className="p-1 text-cocoa-400 hover:text-rose-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input placeholder="e.g. 1 kg" value={variantDraft.name} onChange={(e) => setVariantDraft({ ...variantDraft, name: e.target.value })} className={inputCls} />
              <input placeholder="₹" type="number" min="0" value={variantDraft.price} onChange={(e) => setVariantDraft({ ...variantDraft, price: e.target.value })} className={`${inputCls} w-24`} />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!variantDraft.name || variantDraft.price === "") return;
                  setForm((f) => ({ ...f, variants: [...f.variants, { name: variantDraft.name, price: variantDraft.price }] }));
                  setVariantDraft({ name: "", price: "" });
                }}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Add-ons</h3>
            <div className="space-y-2 mb-3">
              {form.addOns.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 bg-cream-50 rounded-lg px-3 py-1.5">{a.name}</span>
                  <span className="w-20 bg-cream-50 rounded-lg px-3 py-1.5">₹{a.price}</span>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, addOns: f.addOns.filter((_, idx) => idx !== i) }))} className="p-1 text-cocoa-400 hover:text-rose-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input placeholder="e.g. candles" value={addOnDraft.name} onChange={(e) => setAddOnDraft({ ...addOnDraft, name: e.target.value })} className={inputCls} />
              <input placeholder="₹" type="number" min="0" value={addOnDraft.price} onChange={(e) => setAddOnDraft({ ...addOnDraft, price: e.target.value })} className={`${inputCls} w-24`} />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!addOnDraft.name || addOnDraft.price === "") return;
                  setForm((f) => ({ ...f, addOns: [...f.addOns, { name: addOnDraft.name, price: addOnDraft.price }] }));
                  setAddOnDraft({ name: "", price: "" });
                }}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </section>

        {/* Shop rules */}
        <section className="bg-white rounded-2xl border border-wine-100 p-5 grid sm:grid-cols-3 gap-3">
          <Field label="Availability">
            <select value={form.availability} onChange={set("availability")} className={inputCls}>
              <option value="active">Active</option>
              <option value="paused">Paused (back soon)</option>
              <option value="sold_out">Sold out</option>
            </select>
          </Field>
          <Field label="Orderability">
            <select value={form.orderability} onChange={set("orderability")} className={inputCls}>
              <option value="online">Orderable online</option>
              <option value="browse_only">Browse only (enquire)</option>
            </select>
          </Field>
          <Field label="Publishing status">
            <select value={form.status} onChange={set("status")} className={inputCls}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          {form.status === "scheduled" && (
            <Field label="Publish date">
              <input type="date" value={form.publishAt} onChange={set("publishAt")} className={inputCls} />
            </Field>
          )}
          <Field label="Prep time (hours notice)">
            <input type="number" min="0" value={form.prepTimeHours} onChange={set("prepTimeHours")} className={inputCls} />
          </Field>
          <Field label="Tax rate % (blank = store default)">
            <input type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={set("taxRate")} className={inputCls} />
          </Field>
          <Field label="Cost price ₹ (optional, for margin)">
            <input type="number" min="0" step="0.01" value={form.costPrice} onChange={set("costPrice")} className={inputCls} />
          </Field>
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 text-sm text-cocoa-700 cursor-pointer">
              <input type="checkbox" checked={form.featured} onChange={set("featured")} className="accent-wine-600 w-4 h-4" />
              Featured on homepage
            </label>
          </div>
        </section>

        {/* Tags */}
        <section className="bg-white rounded-2xl border border-wine-100 p-5">
          <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Tags / badges</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {form.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 bg-wine-50 border border-wine-100 text-wine-700 rounded-full px-3 py-1 text-xs font-medium">
                {t}
                <button type="button" onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {["bestseller", "new", "eggless", "seasonal"].map((preset) => (
              <button
                type="button"
                key={preset}
                onClick={() => !form.tags.includes(preset) && setForm((f) => ({ ...f, tags: [...f.tags, preset] }))}
                className="text-xs border border-wine-100 rounded-full px-3 py-1 text-cocoa-500 hover:border-wine-300"
              >
                + {preset}
              </button>
            ))}
            <div className="flex gap-1">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="custom tag" className={`${inputCls} !w-36`} />
              <Button type="button" variant="outline" onClick={() => {
                if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
                  setForm((f) => ({ ...f, tags: [...f.tags, tagInput.trim()] }));
                }
                setTagInput("");
              }}><Plus className="w-4 h-4" /></Button>
            </div>
          </div>
        </section>

        {/* Internal */}
        <section className="bg-white rounded-2xl border border-wine-100 p-5">
          <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Internal notes <span className="text-cocoa-400 font-normal">(never shown to customers)</span></h3>
          <textarea value={form.internalNotes} onChange={set("internalNotes")} rows={2} className={inputCls} />
        </section>

        <div className="flex items-center gap-3 pb-8">
          <Button type="submit" disabled={saving || uploading} className="px-8">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {isNew ? "Create Product" : "Save Changes"}
          </Button>
          <Link to="/admin/products" className="text-sm text-cocoa-400 hover:text-wine-700">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
