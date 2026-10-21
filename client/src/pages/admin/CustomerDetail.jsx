import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, CalendarClock, Cake, ClipboardCheck, Coins, Download, FileText, Gift, Mail, Phone, PhoneCall, Plus, Receipt, StickyNote } from "lucide-react";
import toast from "react-hot-toast";
import api, { downloadFile, errMsg } from "../../lib/api";
import { inr, fmtDate, fmtDateTime } from "../../lib/format";
import { ORDER_STATUS_META, INVOICE_STATUS_META, ENQUIRY_STATUS_META, PAYMENT_STATUS_META } from "../../lib/meta";
import { Badge, Button, Field, inputCls, Modal, PageHeader, Spinner, StatCard } from "../../components/admin/ui";
import { useAuth } from "../../store/AuthContext";

const TIMELINE_ICONS = { order: Cake, invoice: Receipt, enquiry: FileText, note: StickyNote, activity: PhoneCall, task: ClipboardCheck, loyalty: Gift };
const EMPTY_ACTIVITY = { type: "call", summary: "", details: "", outcome: "", occurredAt: "", nextFollowUpAt: "" };
const EMPTY_TASK = { title: "", description: "", dueAt: "", priority: "medium", type: "follow_up" };

export default function CustomerDetail() {
  const { id } = useParams();
  const { user, can } = useAuth();
  const [data, setData] = useState(null);
  const [loyalty, setLoyalty] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [loyaltyMode, setLoyaltyMode] = useState("adjust");
  const [note, setNote] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [activity, setActivity] = useState(EMPTY_ACTIVITY);
  const [task, setTask] = useState(EMPTY_TASK);
  const [points, setPoints] = useState("");
  const [pointsNote, setPointsNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => Promise.all([
    api.get(`/customers/${id}`),
    api.get(`/loyalty/${id}`).catch(() => ({ data: { loyalty: null } })),
  ]).then(([customerResponse, loyaltyResponse]) => {
    setData(customerResponse.data);
    setLoyalty(loyaltyResponse.data.loyalty);
  }).catch(() => {}), [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Spinner />;
  const { customer, metrics, timeline } = data;

  // The whole relationship with this customer, so it deliberately ignores the
  // range selector on the Reports page and always exports the full history.
  const exportStatement = async () => {
    setExporting(true);
    try {
      const slug = customer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "customer";
      await downloadFile(`/reports/customer-statement.csv?customerId=${id}&range=all`, `cakestyles-statement-${slug}.csv`);
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setExporting(false);
    }
  };

  const run = async (operation, success) => {
    setSaving(true);
    try {
      await operation();
      toast.success(success);
      await load();
      return true;
    } catch (error) {
      toast.error(errMsg(error));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addNote = async (event) => {
    event.preventDefault();
    const ok = await run(() => api.post(`/customers/${id}/notes`, { text: note }), "Note added");
    if (ok) { setNote(""); setNoteOpen(false); }
  };

  const saveActivity = async (event) => {
    event.preventDefault();
    const body = {
      customer: id,
      type: activity.type,
      summary: activity.summary,
      details: activity.details || undefined,
      outcome: activity.outcome || undefined,
      occurredAt: activity.occurredAt || undefined,
      nextFollowUpAt: activity.nextFollowUpAt || undefined,
    };
    const ok = await run(async () => {
      await api.post("/activities", body);
      if (activity.nextFollowUpAt && user?._id) {
        await api.post("/tasks", {
          title: `Follow up: ${activity.summary}`,
          description: activity.outcome || activity.details || undefined,
          type: "follow_up",
          priority: "medium",
          dueAt: activity.nextFollowUpAt,
          assignedTo: user._id,
          customer: id,
        });
      }
    }, activity.nextFollowUpAt ? "Activity and follow-up saved" : "Activity saved");
    if (ok) { setActivity(EMPTY_ACTIVITY); setActivityOpen(false); }
  };

  const saveTask = async (event) => {
    event.preventDefault();
    const ok = await run(() => api.post("/tasks", { ...task, customer: id, assignedTo: user._id }), "Follow-up task created");
    if (ok) { setTask(EMPTY_TASK); setTaskOpen(false); }
  };

  const saveLoyalty = async (event) => {
    event.preventDefault();
    const numericPoints = Number(points);
    const operation = loyaltyMode === "redeem"
      ? () => api.post(`/loyalty/${id}/redeem`, { points: numericPoints, note: pointsNote || undefined })
      : () => api.post(`/loyalty/${id}/adjust`, { points: numericPoints, note: pointsNote });
    const ok = await run(operation, loyaltyMode === "redeem" ? "Points redeemed" : "Points adjusted");
    if (ok) { setPoints(""); setPointsNote(""); setLoyaltyOpen(false); }
  };

  const addTag = async () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag || customer.tags.includes(tag)) return;
    const ok = await run(() => api.put(`/customers/${id}`, { tags: [...customer.tags, tag] }), "Tag added");
    if (ok) setTagInput("");
  };

  const removeTag = (tag) => run(() => api.put(`/customers/${id}`, { tags: customer.tags.filter((item) => item !== tag) }), "Tag removed");

  return (
    <div>
      <Link to="/admin/customers" className="mb-4 inline-flex items-center gap-1 text-sm text-cocoa-400 hover:text-wine-700"><ArrowLeft className="h-4 w-4" /> All customers</Link>
      <PageHeader
        title={customer.name}
        subtitle={`${customer.phone}${customer.email ? ` · ${customer.email}` : ""}`}
        actions={<>{can("analytics:read") && <Button variant="outline" disabled={exporting} onClick={exportStatement}><Download className="h-4 w-4" /> {exporting ? "Preparing…" : "Export Statement"}</Button>}{can("customers:write") && <><Button variant="outline" onClick={() => setActivityOpen(true)}><PhoneCall className="h-4 w-4" /> Log Activity</Button><Button variant="outline" onClick={() => setTaskOpen(true)}><CalendarClock className="h-4 w-4" /> Follow Up</Button><Button onClick={() => setNoteOpen(true)}><Plus className="h-4 w-4" /> Note</Button></>}</>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="Orders" value={metrics.orderCount} />
        <StatCard label="Lifetime Value" value={inr(metrics.lifetimeValue)} tone="wine" />
        <StatCard label="Outstanding" value={inr(metrics.outstanding)} tone={metrics.outstanding > 0 ? "warn" : "default"} />
        <StatCard label="Loyalty Points" value={metrics.pointsBalance || 0} />
        <StatCard label="Tier" value={String(metrics.tier || "bronze").toUpperCase()} />
        <StatCard label="Open Tasks" value={metrics.openTasks || 0} tone={metrics.openTasks ? "warn" : "default"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <section className="rounded-2xl border border-wine-100 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-cocoa-900">Tags</h3>
            <div className="mb-3 flex flex-wrap gap-1.5">{customer.tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-wine-100 bg-wine-50 px-3 py-1 text-xs font-medium text-wine-700">{tag}{can("customers:write") && <button onClick={() => removeTag(tag)}>×</button>}</span>)}{customer.tags.length === 0 && <span className="text-xs text-cocoa-400">No tags yet</span>}</div>
            {can("customers:write") && <div className="flex gap-2"><input value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addTag())} placeholder="vip, wedding, corporate…" className={inputCls} /><Button variant="outline" onClick={addTag}>Add</Button></div>}
          </section>

          <section className="rounded-2xl border border-wine-100 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-cocoa-900">Customer details</h3>
            <div className="space-y-2 text-sm"><p className="flex items-center gap-2 text-cocoa-600"><Phone className="h-3.5 w-3.5 text-wine-400" /> {customer.phone}</p>{customer.email && <p className="flex items-center gap-2 text-cocoa-600"><Mail className="h-3.5 w-3.5 text-wine-400" /> {customer.email}</p>}<p className="text-xs text-cocoa-400">Lead source: <span className="capitalize">{customer.leadSource || "—"}</span></p><p className="text-xs text-cocoa-400">Marketing consent: {customer.marketingConsent ? "Yes" : "No"}</p>{(customer.importantDates || []).map((date, index) => <p key={index} className="border-t border-wine-50 pt-2 text-xs text-cocoa-500">{date.label}: {date.date}</p>)}</div>
          </section>

          <section className="rounded-2xl border border-wine-100 bg-white p-5">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-cocoa-900">Loyalty rewards</h3><p className="mt-1 text-xs text-cocoa-400">{loyalty?.enabled ? `${loyalty.customer?.pointsBalance || 0} points · ${inr(loyalty.redeemableValue || 0)} redeemable` : "Rewards are disabled"}</p></div><Coins className="h-5 w-5 text-wine-500" /></div>
            {can("customers:write") && loyalty?.enabled && <div className="mt-4 flex gap-2"><Button variant="outline" onClick={() => { setLoyaltyMode("adjust"); setLoyaltyOpen(true); }}>Adjust</Button><Button onClick={() => { setLoyaltyMode("redeem"); setLoyaltyOpen(true); }}>Redeem</Button></div>}
          </section>
        </div>

        <section className="rounded-2xl border border-wine-100 bg-white p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-cocoa-900">Customer timeline</h3>
          <div className="space-y-4">
            {timeline.length === 0 && <p className="text-sm text-cocoa-400">No activity yet.</p>}
            {timeline.map((entry, index) => {
              const Icon = TIMELINE_ICONS[entry.type] || StickyNote;
              const ref = entry.ref;
              return <div key={`${entry.type}-${ref._id || index}`} className="flex gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wine-50"><Icon className="h-4 w-4 text-wine-600" /></div><div className="min-w-0 flex-1 border-b border-wine-50 pb-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm">
                {entry.type === "order" && <Link to={`/admin/orders/${ref._id}`} className="font-medium text-wine-700 hover:underline">{ref.orderNumber}</Link>}
                {entry.type === "invoice" && <span className="font-medium text-cocoa-800">Invoice {ref.invoiceNumber}</span>}
                {entry.type === "enquiry" && <span className="font-medium text-cocoa-800">Custom cake enquiry</span>}
                {entry.type === "note" && <span className="font-medium text-cocoa-800">Note by {ref.by?.name || "staff"}</span>}
                {entry.type === "activity" && <span className="font-medium capitalize text-cocoa-800">{ref.type}: {ref.summary}</span>}
                {entry.type === "task" && <span className="font-medium text-cocoa-800">Task: {ref.title}</span>}
                {entry.type === "loyalty" && <span className="font-medium text-cocoa-800">{ref.points > 0 ? "+" : ""}{ref.points} loyalty points</span>}
                <span className="ml-2 text-xs text-cocoa-400">{fmtDateTime(entry.at)}</span></div><div className="flex gap-1.5">
                  {entry.type === "order" && <><Badge className={ORDER_STATUS_META[ref.status]?.color}>{ORDER_STATUS_META[ref.status]?.label}</Badge><Badge className="bg-cream-100 text-cocoa-600">{inr(ref.grandTotal)}</Badge></>}
                  {entry.type === "invoice" && <Badge className={INVOICE_STATUS_META[ref.status]?.color}>{INVOICE_STATUS_META[ref.status]?.label}</Badge>}
                  {entry.type === "enquiry" && <Badge className={ENQUIRY_STATUS_META[ref.status]?.color}>{ENQUIRY_STATUS_META[ref.status]?.label}</Badge>}
                  {entry.type === "task" && <Badge className={ref.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>{ref.status}</Badge>}
                </div></div>
                {entry.type === "note" && <p className="mt-1 text-sm text-cocoa-600">{ref.text}</p>}
                {entry.type === "activity" && <><p className="mt-1 text-sm text-cocoa-600">{ref.details || ref.outcome}</p>{ref.nextFollowUpAt && <p className="mt-1 text-xs text-wine-600">Follow up: {fmtDate(ref.nextFollowUpAt)}</p>}</>}
                {entry.type === "task" && <p className="mt-1 text-xs text-cocoa-500">Due {fmtDate(ref.dueAt)} · {ref.assignedTo?.name || "Unassigned"}</p>}
                {entry.type === "loyalty" && <p className="mt-1 text-xs text-cocoa-500">Balance after: {ref.balanceAfter} · {ref.note}</p>}
                {entry.type === "order" && ref.payment?.status && <span className="text-xs text-cocoa-400">Payment: {PAYMENT_STATUS_META[ref.payment.status]?.label}</span>}
              </div></div>;
            })}
          </div>
        </section>
      </div>

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Add customer note"><form onSubmit={addNote} className="space-y-4"><Field label="Note"><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} className={inputCls} required autoFocus /></Field><Button type="submit" disabled={saving} className="w-full">Save note</Button></form></Modal>
      <Modal open={activityOpen} onClose={() => setActivityOpen(false)} title="Log customer activity"><form onSubmit={saveActivity} className="space-y-4"><div className="grid grid-cols-2 gap-3"><Field label="Activity type"><select value={activity.type} onChange={(event) => setActivity({ ...activity, type: event.target.value })} className={inputCls}><option value="call">Call</option><option value="meeting">Meeting</option><option value="visit">Visit</option><option value="note">Note</option><option value="status">Status update</option></select></Field><Field label="Occurred at"><input type="datetime-local" value={activity.occurredAt} onChange={(event) => setActivity({ ...activity, occurredAt: event.target.value })} className={inputCls} /></Field></div><Field label="Summary *"><input value={activity.summary} onChange={(event) => setActivity({ ...activity, summary: event.target.value })} className={inputCls} required /></Field><Field label="Details"><textarea value={activity.details} onChange={(event) => setActivity({ ...activity, details: event.target.value })} className={inputCls} rows={3} /></Field><Field label="Outcome"><input value={activity.outcome} onChange={(event) => setActivity({ ...activity, outcome: event.target.value })} className={inputCls} /></Field><Field label="Next follow-up"><input type="datetime-local" value={activity.nextFollowUpAt} onChange={(event) => setActivity({ ...activity, nextFollowUpAt: event.target.value })} className={inputCls} /></Field><Button type="submit" disabled={saving} className="w-full">Save activity</Button></form></Modal>
      <Modal open={taskOpen} onClose={() => setTaskOpen(false)} title="Create follow-up"><form onSubmit={saveTask} className="space-y-4"><Field label="Task *"><input value={task.title} onChange={(event) => setTask({ ...task, title: event.target.value })} className={inputCls} required /></Field><Field label="Details"><textarea value={task.description} onChange={(event) => setTask({ ...task, description: event.target.value })} className={inputCls} rows={3} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Due *"><input type="datetime-local" value={task.dueAt} onChange={(event) => setTask({ ...task, dueAt: event.target.value })} className={inputCls} required /></Field><Field label="Priority"><select value={task.priority} onChange={(event) => setTask({ ...task, priority: event.target.value })} className={inputCls}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field></div><Button type="submit" disabled={saving || !user?._id} className="w-full">Create task</Button></form></Modal>
      <Modal open={loyaltyOpen} onClose={() => setLoyaltyOpen(false)} title={loyaltyMode === "redeem" ? "Redeem points" : "Adjust points"}><form onSubmit={saveLoyalty} className="space-y-4"><Field label={loyaltyMode === "redeem" ? `Points to redeem (minimum ${loyalty?.minRedeem || 0})` : "Points adjustment (+ or -)"}><input type="number" step="1" min={loyaltyMode === "redeem" ? 1 : undefined} value={points} onChange={(event) => setPoints(event.target.value)} className={inputCls} required /></Field><Field label="Reason *"><textarea value={pointsNote} onChange={(event) => setPointsNote(event.target.value)} className={inputCls} rows={3} required={loyaltyMode === "adjust"} /></Field><Button type="submit" disabled={saving} className="w-full">{loyaltyMode === "redeem" ? "Redeem points" : "Apply adjustment"}</Button></form></Modal>
    </div>
  );
}
