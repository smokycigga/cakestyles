import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { inr, fmtDate, daysFromNow } from "../../lib/format";
import { ENQUIRY_STATUS_META } from "../../lib/meta";
import { PageHeader, Spinner, Badge, Button, Field, inputCls, Modal, EmptyState } from "../../components/admin/ui";

const PIPELINE = ["new", "contacted", "quote_sent", "awaiting_confirmation", "confirmed", "completed", "lost"];

export default function Enquiries() {
  const [enquiries, setEnquiries] = useState(null);
  const [detail, setDetail] = useState(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convert, setConvert] = useState({ amount: "", type: "pickup", date: daysFromNow(7), depositAmount: "", depositMethod: "upi", balanceDueDate: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [newEnq, setNewEnq] = useState({ name: "", phone: "", eventDate: daysFromNow(7), guestCount: "", size: "", flavours: "", designNotes: "", budgetRange: "", source: "instagram" });

  const load = () => api.get("/enquiries").then((r) => setEnquiries(r.data.enquiries)).catch(() => setEnquiries([]));
  useEffect(() => {
    load();
  }, []);

  const changeStatus = async (enq, status) => {
    try {
      await api.put(`/enquiries/${enq._id}/status`, { status });
      load();
      if (detail?._id === enq._id) setDetail({ ...enq, status });
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const openDetail = async (id) => {
    const { data } = await api.get(`/enquiries/${id}`);
    setDetail(data.enquiry);
  };

  const doConvert = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/enquiries/${detail._id}/convert`, {
        amount: Number(convert.amount),
        fulfilment: {
          type: convert.type,
          date: convert.date,
          ...(convert.type === "delivery" ? { address: { line1: detail.fulfilmentPref?.address || "As discussed", city: "", pincode: "" } } : {}),
        },
        ...(convert.depositAmount ? { deposit: { amount: Number(convert.depositAmount), method: convert.depositMethod } } : {}),
        ...(convert.balanceDueDate ? { balanceDueDate: convert.balanceDueDate } : {}),
      });
      toast.success(`Converted to order ${data.order.orderNumber}`);
      setConvertOpen(false);
      setDetail(null);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const createEnquiry = async (e) => {
    e.preventDefault();
    try {
      const body = {
        name: newEnq.name,
        phone: newEnq.phone,
        eventDate: newEnq.eventDate,
        source: newEnq.source,
        guestCount: newEnq.guestCount ? Number(newEnq.guestCount) : undefined,
      };
      if (newEnq.size) body.size = newEnq.size;
      if (newEnq.flavours) body.flavours = newEnq.flavours;
      if (newEnq.designNotes) body.designNotes = newEnq.designNotes;
      if (newEnq.budgetRange) body.budgetRange = newEnq.budgetRange;
      await api.post("/enquiries/admin", body);
      toast.success("Enquiry created");
      setCreateOpen(false);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Custom Cake Enquiries"
        subtitle={enquiries ? `${enquiries.length} enquiry(ies)` : ""}
        actions={<Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /> Log Enquiry</Button>}
      />

      {!enquiries ? (
        <Spinner />
      ) : enquiries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-wine-100">
          <EmptyState icon="🎂" title="No enquiries yet" hint="Website enquiry form submissions appear here." />
        </div>
      ) : (
        <div className="grid md:grid-cols-3 xl:grid-cols-4 gap-3">
          {PIPELINE.map((status) => {
            const list = enquiries.filter((e) => e.status === status);
            return (
              <div key={status} className="bg-wine-50/60 rounded-2xl p-3">
                <div className="flex items-center justify-between mb-3">
                  <Badge className={ENQUIRY_STATUS_META[status]?.color}>{ENQUIRY_STATUS_META[status]?.label}</Badge>
                  <span className="text-xs text-cocoa-400">{list.length}</span>
                </div>
                <div className="space-y-2">
                  {list.map((enq) => (
                    <button
                      key={enq._id}
                      onClick={() => openDetail(enq._id)}
                      className="w-full text-left bg-white rounded-xl border border-wine-100 p-3 hover:border-wine-300 transition-colors"
                    >
                      <div className="text-sm font-medium text-cocoa-800">{enq.customerSnapshot.name}</div>
                      <div className="text-xs text-cocoa-400">{enq.customerSnapshot.phone}</div>
                      <div className="text-xs text-wine-600 mt-1.5">Event: {fmtDate(enq.eventDate)}</div>
                      {enq.quotedAmount && <div className="text-xs font-medium mt-0.5">{inr(enq.quotedAmount)}</div>}
                      {enq.convertedOrder && (
                        <Badge className="bg-emerald-100 text-emerald-700 mt-1.5">Converted</Badge>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Enquiry — ${detail.customerSnapshot.name}` : ""} wide>
        {detail && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-cocoa-400 text-xs block">Phone</span>{detail.customerSnapshot.phone}</div>
              <div><span className="text-cocoa-400 text-xs block">Event date</span>{fmtDate(detail.eventDate)}</div>
              {detail.guestCount && <div><span className="text-cocoa-400 text-xs block">Guests</span>{detail.guestCount}</div>}
              {detail.size && <div><span className="text-cocoa-400 text-xs block">Size</span>{detail.size}</div>}
              {detail.flavours && <div><span className="text-cocoa-400 text-xs block">Flavours</span>{detail.flavours}</div>}
              {detail.budgetRange && <div><span className="text-cocoa-400 text-xs block">Budget</span>{detail.budgetRange}</div>}
              {detail.fulfilmentPref?.type && (
                <div><span className="text-cocoa-400 text-xs block">Fulfilment</span>{detail.fulfilmentPref.type}{detail.fulfilmentPref.address ? ` — ${detail.fulfilmentPref.address}` : ""}</div>
              )}
              {detail.designNotes && (
                <div className="sm:col-span-2"><span className="text-cocoa-400 text-xs block">Design notes</span>{detail.designNotes}</div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-cocoa-400">Move to:</span>
              {PIPELINE.map((s) => (
                <button
                  key={s}
                  onClick={() => changeStatus(detail, s)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    detail.status === s ? "border-wine-600 bg-wine-50 text-wine-700 font-medium" : "border-wine-100 text-cocoa-500 hover:border-wine-300"
                  }`}
                >
                  {ENQUIRY_STATUS_META[s]?.label}
                </button>
              ))}
            </div>

            {detail.convertedOrder ? (
              <Link to={`/admin/orders/${detail.convertedOrder._id}`} className="block text-sm text-wine-700 hover:underline">
                → View converted order {detail.convertedOrder.orderNumber}
              </Link>
            ) : (
              <Button onClick={() => setConvertOpen(true)}>Convert to Order…</Button>
            )}
          </div>
        )}
      </Modal>

      {/* Convert modal */}
      <Modal open={convertOpen} onClose={() => setConvertOpen(false)} title="Convert enquiry to order">
        <form onSubmit={doConvert} className="space-y-4">
          <Field label="Quoted amount (₹) *">
            <input type="number" min="1" step="0.01" value={convert.amount} onChange={(e) => setConvert({ ...convert, amount: e.target.value })} className={inputCls} required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fulfilment">
              <select value={convert.type} onChange={(e) => setConvert({ ...convert, type: e.target.value })} className={inputCls}>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </Field>
            <Field label="Date *">
              <input type="date" min={daysFromNow(0)} value={convert.date} onChange={(e) => setConvert({ ...convert, date: e.target.value })} className={inputCls} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Deposit (₹)">
              <input type="number" min="0" step="0.01" value={convert.depositAmount} onChange={(e) => setConvert({ ...convert, depositAmount: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Deposit method">
              <select value={convert.depositMethod} onChange={(e) => setConvert({ ...convert, depositMethod: e.target.value })} className={inputCls}>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </Field>
          </div>
          <Field label="Balance due date">
            <input type="date" value={convert.balanceDueDate} onChange={(e) => setConvert({ ...convert, balanceDueDate: e.target.value })} className={inputCls} />
          </Field>
          <Button type="submit" className="w-full">Create Order</Button>
        </form>
      </Modal>

      {/* Create enquiry modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Log enquiry">
        <form onSubmit={createEnquiry} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer name *">
              <input value={newEnq.name} onChange={(e) => setNewEnq({ ...newEnq, name: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="Phone *">
              <input value={newEnq.phone} onChange={(e) => setNewEnq({ ...newEnq, phone: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="Event date *">
              <input type="date" min={daysFromNow(0)} value={newEnq.eventDate} onChange={(e) => setNewEnq({ ...newEnq, eventDate: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="Source">
              <select value={newEnq.source} onChange={(e) => setNewEnq({ ...newEnq, source: e.target.value })} className={inputCls}>
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="phone">Phone</option>
                <option value="walk_in">Walk-in</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Guests">
              <input type="number" min="1" value={newEnq.guestCount} onChange={(e) => setNewEnq({ ...newEnq, guestCount: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Size">
              <input value={newEnq.size} onChange={(e) => setNewEnq({ ...newEnq, size: e.target.value })} placeholder="e.g. 2 tier" className={inputCls} />
            </Field>
          </div>
          <Field label="Design notes">
            <textarea value={newEnq.designNotes} onChange={(e) => setNewEnq({ ...newEnq, designNotes: e.target.value })} rows={2} className={inputCls} />
          </Field>
          <Button type="submit" className="w-full">Save Enquiry</Button>
        </form>
      </Modal>
    </div>
  );
}
