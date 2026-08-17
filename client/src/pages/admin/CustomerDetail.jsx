import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, Cake, Receipt, FileText, StickyNote, Phone, Mail } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { inr, fmtDate, fmtDateTime } from "../../lib/format";
import { ORDER_STATUS_META, INVOICE_STATUS_META, ENQUIRY_STATUS_META, PAYMENT_STATUS_META } from "../../lib/meta";
import { PageHeader, Spinner, Badge, Button, Field, inputCls, Modal, StatCard } from "../../components/admin/ui";

const TIMELINE_ICONS = { order: Cake, invoice: Receipt, enquiry: FileText, note: StickyNote };

export default function CustomerDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [tagInput, setTagInput] = useState("");

  const load = () => api.get(`/customers/${id}`).then((r) => setData(r.data)).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!data) return <Spinner />;
  const { customer, metrics, timeline } = data;

  const addNote = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/customers/${id}/notes`, { text: note });
      toast.success("Note added");
      setNote("");
      setNoteOpen(false);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const addTag = async () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || customer.tags.includes(t)) return;
    try {
      await api.put(`/customers/${id}`, { tags: [...customer.tags, t] });
      setTagInput("");
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const removeTag = async (t) => {
    try {
      await api.put(`/customers/${id}`, { tags: customer.tags.filter((x) => x !== t) });
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <div>
      <Link to="/admin/customers" className="inline-flex items-center gap-1 text-sm text-cocoa-400 hover:text-wine-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> All customers
      </Link>

      <PageHeader
        title={customer.name}
        subtitle={`${customer.phone}${customer.email ? ` · ${customer.email}` : ""}`}
        actions={<Button variant="outline" onClick={() => setNoteOpen(true)}><Plus className="w-4 h-4" /> Add Note</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Orders" value={metrics.orderCount} />
        <StatCard label="Lifetime Value" value={inr(metrics.lifetimeValue)} tone="wine" />
        <StatCard label="Outstanding" value={inr(metrics.outstanding)} tone={metrics.outstanding > 0 ? "warn" : "default"} />
        <StatCard label="Last Order" value={metrics.lastOrderAt ? fmtDate(metrics.lastOrderAt) : "—"} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Profile column */}
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-wine-100 p-5">
            <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Tags</h3>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {customer.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 bg-wine-50 border border-wine-100 text-wine-700 rounded-full px-3 py-1 text-xs font-medium">
                  {t}
                  <button onClick={() => removeTag(t)} className="text-wine-400 hover:text-rose-600">×</button>
                </span>
              ))}
              {customer.tags.length === 0 && <span className="text-xs text-cocoa-400">No tags yet</span>}
            </div>
            <div className="flex gap-2">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="vip, wedding, corporate…" className={inputCls} />
              <Button variant="outline" onClick={addTag}>Add</Button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-wine-100 p-5">
            <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-cocoa-600"><Phone className="w-3.5 h-3.5 text-wine-400" /> {customer.phone}</div>
              {customer.email && <div className="flex items-center gap-2 text-cocoa-600"><Mail className="w-3.5 h-3.5 text-wine-400" /> {customer.email}</div>}
              <div className="text-xs text-cocoa-400">Lead source: <span className="capitalize">{customer.leadSource || "—"}</span></div>
              <div className="text-xs text-cocoa-400">Marketing consent: {customer.marketingConsent ? "Yes" : "No"}</div>
              {(customer.importantDates || []).length > 0 && (
                <div className="pt-2 border-t border-wine-50">
                  {customer.importantDates.map((d, i) => (
                    <div key={i} className="text-xs text-cocoa-500">{d.label}: {d.date}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {(customer.addresses || []).length > 0 && (
            <div className="bg-white rounded-2xl border border-wine-100 p-5">
              <h3 className="text-sm font-semibold text-cocoa-900 mb-3">Saved Addresses</h3>
              <div className="space-y-3">
                {customer.addresses.map((a, i) => (
                  <div key={i} className="text-sm text-cocoa-600 border-b border-wine-50 pb-2 last:border-0">
                    {a.label && <span className="text-xs font-medium text-wine-600">{a.label}: </span>}
                    {[a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(", ")}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-wine-100 p-5">
            <h3 className="text-sm font-semibold text-cocoa-900 mb-4">Timeline</h3>
            <div className="space-y-4">
              {timeline.length === 0 && <p className="text-sm text-cocoa-400">No activity yet.</p>}
              {timeline.map((t, i) => {
                const Icon = TIMELINE_ICONS[t.type];
                const r = t.ref;
                return (
                  <div key={i} className="flex gap-3">
                    <div className="w-9 h-9 rounded-full bg-wine-50 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-wine-600" />
                    </div>
                    <div className="flex-1 min-w-0 border-b border-wine-50 pb-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-sm">
                          {t.type === "order" && (
                            <Link to={`/admin/orders/${r._id}`} className="font-medium text-wine-700 hover:underline">
                              {r.orderNumber}
                            </Link>
                          )}
                          {t.type === "invoice" && <span className="font-medium text-cocoa-800">Invoice {r.invoiceNumber}</span>}
                          {t.type === "enquiry" && <span className="font-medium text-cocoa-800">Custom cake enquiry ({fmtDate(r.eventDate)})</span>}
                          {t.type === "note" && <span className="font-medium text-cocoa-800">Note by {r.by?.name || "staff"}</span>}
                          <span className="text-cocoa-400 text-xs ml-2">{fmtDateTime(t.at)}</span>
                        </div>
                        <div className="flex gap-1.5">
                          {t.type === "order" && (
                            <>
                              <Badge className={ORDER_STATUS_META[r.status]?.color}>{ORDER_STATUS_META[r.status]?.label}</Badge>
                              <Badge className="bg-cream-100 text-cocoa-600">{inr(r.grandTotal)}</Badge>
                            </>
                          )}
                          {t.type === "invoice" && (
                            <Badge className={INVOICE_STATUS_META[r.status]?.color}>{INVOICE_STATUS_META[r.status]?.label}</Badge>
                          )}
                          {t.type === "enquiry" && (
                            <Badge className={ENQUIRY_STATUS_META[r.status]?.color}>{ENQUIRY_STATUS_META[r.status]?.label}</Badge>
                          )}
                        </div>
                      </div>
                      {t.type === "note" && <p className="text-sm text-cocoa-600 mt-1">{r.text}</p>}
                      {t.type === "order" && r.payment?.status && (
                        <span className="text-xs text-cocoa-400">Payment: {PAYMENT_STATUS_META[r.payment.status]?.label}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Add customer note">
        <form onSubmit={addNote} className="space-y-4">
          <Field label="Note (preferences, allergies, service history…)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className={inputCls} required autoFocus />
          </Field>
          <Button type="submit" className="w-full">Save Note</Button>
        </form>
      </Modal>
    </div>
  );
}
