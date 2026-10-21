import { useEffect, useState } from "react";
import { Download, Mail, Pencil, Plus, RefreshCw, Send, UsersRound } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  inputCls,
  Modal,
  PageHeader,
  Spinner,
  TableWrap,
  Td,
  Th,
} from "../../components/admin/ui";

const EMPTY_CAMPAIGN = {
  name: "",
  channel: "manual",
  description: "",
  content: "",
  segment: "all",
  tags: "",
  leadSources: "",
  marketingConsentOnly: true,
};

const CAMPAIGN_STATUS = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-600" },
  ready: { label: "Ready", color: "bg-sky-100 text-sky-700" },
  in_progress: { label: "In progress", color: "bg-violet-100 text-violet-700" },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700" },
  archived: { label: "Archived", color: "bg-slate-100 text-slate-500" },
};

const RECIPIENT_STATUS = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700" },
  contacted: { label: "Contacted", color: "bg-sky-100 text-sky-700" },
  converted: { label: "Converted", color: "bg-emerald-100 text-emerald-700" },
  skipped: { label: "Skipped", color: "bg-slate-100 text-slate-500" },
};

const campaignList = (data) => (Array.isArray(data) ? data : data?.campaigns || []);
const campaignRecipients = (campaign) => campaign?.recipients || [];
const displayStatus = (value, meta) => meta[value]?.label || String(value || "draft").replaceAll("_", " ");

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_CAMPAIGN);
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);
  const [updatingRecipient, setUpdatingRecipient] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = () => api.get("/campaigns")
    .then(({ data }) => {
      const list = campaignList(data);
      setCampaigns(list);
      setSelectedId((current) => (list.some((campaign) => campaign._id === current) ? current : list[0]?._id || ""));
    })
    .catch((err) => {
      setCampaigns([]);
      toast.error(errMsg(err));
    });

  useEffect(() => {
    load();
  }, []);

  const selected = campaigns?.find((campaign) => campaign._id === selectedId) || null;
  const recipients = campaignRecipients(selected);
  const completedCount = recipients.filter((recipient) => ["contacted", "converted"].includes(recipient.status)).length;
  const progress = recipients.length ? Math.round((completedCount / recipients.length) * 100) : 0;

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_CAMPAIGN);
    setModalOpen(true);
  };

  const openEdit = (campaign) => {
    setEditId(campaign._id);
    setForm({
      name: campaign.name || "",
      channel: campaign.channel || "manual",
      description: campaign.description || "",
      content: campaign.content || "",
      segment: campaign.audience?.segment || "all",
      tags: (campaign.audience?.tags || []).join(", "),
      leadSources: (campaign.audience?.leadSources || []).join(", "),
      marketingConsentOnly: !!campaign.audience?.marketingConsentOnly,
    });
    setModalOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    const splitValues = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);
    const body = {
      name: form.name.trim(),
      channel: form.channel,
      description: form.description.trim(),
      content: form.content.trim(),
      audience: {
        segment: form.segment.trim() || "all",
        tags: splitValues(form.tags),
        leadSources: splitValues(form.leadSources),
        marketingConsentOnly: form.marketingConsentOnly,
      },
    };
    try {
      if (editId) await api.put(`/campaigns/${editId}`, body);
      else await api.post("/campaigns", body);
      toast.success(editId ? "Campaign updated" : "Campaign draft created");
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const buildRecipients = async () => {
    if (!selected) return;
    setBuilding(true);
    try {
      const { data } = await api.post(`/campaigns/${selected._id}/build-recipients`);
      const count = data.count ?? data.campaign?.recipientSummary?.total ?? data.campaign?.recipients?.length;
      toast.success(count == null ? "Recipient list rebuilt" : `${count} recipient(s) ready`);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBuilding(false);
    }
  };

  const updateRecipient = async (recipientId, status) => {
    setUpdatingRecipient(recipientId);
    try {
      await api.put(`/campaigns/${selected._id}/recipients/${recipientId}`, { status });
      setCampaigns((current) => current.map((campaign) => campaign._id !== selected._id ? campaign : {
        ...campaign,
        recipients: campaignRecipients(campaign).map((recipient) => recipient._id === recipientId ? { ...recipient, status } : recipient),
      }));
      toast.success("Recipient updated");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setUpdatingRecipient("");
    }
  };

  const exportCsv = async () => {
    if (!selected) return;
    setExporting(true);
    try {
      const { data } = await api.get(`/campaigns/${selected._id}/export.csv`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selected.name || "campaign"}-recipients.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Build targeted customer lists and track every follow-up"
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4" /> New Campaign</Button>}
      />

      {!campaigns ? (
        <Spinner />
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-wine-100 bg-white">
          <EmptyState icon="📣" title="No campaigns yet" hint="Create a draft to start planning your next customer outreach." />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="space-y-2">
            {campaigns.map((campaign) => {
              const meta = CAMPAIGN_STATUS[campaign.status] || CAMPAIGN_STATUS.draft;
              const count = campaignRecipients(campaign).length || campaign.recipientCount || 0;
              return (
                <button
                  key={campaign._id}
                  type="button"
                  onClick={() => setSelectedId(campaign._id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedId === campaign._id ? "border-wine-400 bg-white shadow-sm" : "border-wine-100 bg-white/70 hover:border-wine-200"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-cocoa-800">{campaign.name}</div>
                      <div className="mt-1 flex items-center gap-1 text-xs capitalize text-cocoa-400"><Mail className="h-3.5 w-3.5" />{campaign.channel || "email"}</div>
                    </div>
                    <Badge className={meta.color}>{meta.label}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-wine-50 pt-2 text-xs text-cocoa-400">
                    <span>{count} recipient{count === 1 ? "" : "s"}</span>
                    <span>{fmtDate(campaign.updatedAt || campaign.createdAt)}</span>
                  </div>
                </button>
              );
            })}
          </aside>

          {selected && (
            <section className="min-w-0 space-y-4">
              <div className="rounded-2xl border border-wine-100 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl font-semibold text-cocoa-900">{selected.name}</h2>
                      <Badge className={(CAMPAIGN_STATUS[selected.status] || CAMPAIGN_STATUS.draft).color}>{displayStatus(selected.status, CAMPAIGN_STATUS)}</Badge>
                    </div>
                    {selected.description && <p className="mt-1 text-sm font-medium text-cocoa-600">{selected.description}</p>}
                    {selected.content && <p className="mt-1 max-w-2xl whitespace-pre-line text-sm text-cocoa-400">{selected.content}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => openEdit(selected)}><Pencil className="h-4 w-4" /> Edit</Button>
                    <Button variant="outline" disabled={exporting || recipients.length === 0} onClick={exportCsv}><Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export CSV"}</Button>
                    <Button disabled={building} onClick={buildRecipients}><RefreshCw className={`h-4 w-4 ${building ? "animate-spin" : ""}`} /> {building ? "Building…" : recipients.length ? "Rebuild recipients" : "Build recipients"}</Button>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-[10rem_1fr] sm:items-end">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-cocoa-400">Recipient progress</div>
                    <div className="mt-1 text-2xl font-semibold text-cocoa-900">{completedCount}<span className="text-base font-normal text-cocoa-400"> / {recipients.length}</span></div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs text-cocoa-400"><span>Outreach progress</span><span>{progress}%</span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-wine-50">
                      <div className="h-full rounded-full bg-wine-600 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {recipients.length === 0 ? (
                <div className="rounded-2xl border border-wine-100 bg-white">
                  <EmptyState icon="👥" title="No recipients built" hint="Build recipients from the latest eligible customer list." />
                </div>
              ) : (
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Recipient</Th>
                      <Th>Contact</Th>
                      <Th>Status</Th>
                      <Th>Updated</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((recipient) => {
                      const customer = recipient.customer || recipient.customerSnapshot || {};
                      const status = recipient.status || "pending";
                      const meta = RECIPIENT_STATUS[status] || RECIPIENT_STATUS.pending;
                      return (
                        <tr key={recipient._id} className="hover:bg-wine-50/50">
                          <Td label="Recipient">
                            <div className="flex items-center gap-2">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wine-50 text-wine-600"><UsersRound className="h-4 w-4" /></span>
                              <div>
                                <div className="font-medium text-cocoa-800">{recipient.name || customer.name || "Customer"}</div>
                                {recipient.segment && <div className="text-xs text-cocoa-400">{recipient.segment}</div>}
                              </div>
                            </div>
                          </Td>
                          <Td className="text-xs text-cocoa-500" label="Contact">
                            <div>{recipient.email || customer.email || "—"}</div>
                            {(recipient.phone || customer.phone) && <div>{recipient.phone || customer.phone}</div>}
                          </Td>
                          <Td label="Status">
                            <div className="flex items-center gap-2">
                              <Badge className={meta.color}>{meta.label}</Badge>
                              <select
                                value={status}
                                disabled={updatingRecipient === recipient._id}
                                onChange={(event) => updateRecipient(recipient._id, event.target.value)}
                                className="rounded-lg border border-wine-100 bg-white px-2 py-1 text-xs text-cocoa-600 focus:border-wine-400 focus:outline-none disabled:opacity-50"
                                aria-label={`Update status for ${recipient.name || customer.name || "recipient"}`}
                              >
                                {Object.entries(RECIPIENT_STATUS).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
                              </select>
                            </div>
                          </Td>
                          <Td className="whitespace-nowrap text-xs text-cocoa-400" label="Updated">{fmtDate(recipient.updatedAt || recipient.contactedAt)}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
              )}
            </section>
          )}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => !saving && setModalOpen(false)} title={editId ? "Edit campaign draft" : "Create campaign draft"}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-[1fr_9rem] gap-3">
            <Field label="Campaign name *">
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputCls} maxLength={200} required autoFocus />
            </Field>
            <Field label="Workflow">
              <select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })} className={inputCls}>
                <option value="manual">Manual</option>
                <option value="export">CSV export</option>
              </select>
            </Field>
          </div>
          <Field label="Description">
            <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputCls} maxLength={2000} placeholder="Purpose or offer for the team" />
          </Field>
          <Field label="Message or call notes">
            <textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} className={inputCls} rows={4} maxLength={10000} placeholder="Add the outreach copy or talking points…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer segment">
              <input value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value })} className={inputCls} placeholder="all" />
            </Field>
            <Field label="Tags" hint="Comma-separated">
              <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className={inputCls} placeholder="vip, birthday" />
            </Field>
          </div>
          <Field label="Lead sources" hint="Optional, comma-separated">
            <input value={form.leadSources} onChange={(event) => setForm({ ...form, leadSources: event.target.value })} className={inputCls} placeholder="instagram, referral" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-cocoa-600">
            <input type="checkbox" checked={form.marketingConsentOnly} onChange={(event) => setForm({ ...form, marketingConsentOnly: event.target.checked })} className="accent-wine-600" />
            Include only customers with marketing consent
          </label>
          <div className="rounded-xl bg-wine-50 p-3 text-xs text-cocoa-500">
            <Send className="mr-1 inline h-3.5 w-3.5 text-wine-600" /> Saving creates a draft only; it does not send messages.
          </div>
          <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving…" : editId ? "Save Draft" : "Create Draft"}</Button>
        </form>
      </Modal>
    </div>
  );
}
