import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { PageHeader, Spinner, Button, Field, inputCls } from "../../components/admin/ui";
import { useAuth } from "../../store/AuthContext";

export default function Settings() {
  const { can, user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(r.data.settings)).catch(() => {});
  }, []);

  if (!settings) return <Spinner />;

  const set = (path, value) => {
    setSettings((s) => {
      const next = JSON.parse(JSON.stringify(s));
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const getVal = (path) => path.split(".").reduce((o, k) => o?.[k], settings);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings", {
        store: settings.store,
        tax: settings.tax,
        delivery: settings.delivery,
        pickup: settings.pickup,
        paymentMethods: settings.paymentMethods,
        invoice: settings.invoice,
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const editable = can("settings:write");

  const hoursRow = (i) => (
    <div className="grid grid-cols-3 gap-2" key={i}>
      <input disabled={!editable} value={getVal(`store.hours.${i}.days`)} onChange={(e) => set(`store.hours.${i}.days`, e.target.value)} placeholder="Mon – Sat" className={inputCls} />
      <input disabled={!editable} value={getVal(`store.hours.${i}.open`)} onChange={(e) => set(`store.hours.${i}.open`, e.target.value)} placeholder="10:00" className={inputCls} />
      <input disabled={!editable} value={getVal(`store.hours.${i}.close`)} onChange={(e) => set(`store.hours.${i}.close`, e.target.value)} placeholder="20:00" className={inputCls} />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Store profile, checkout rules, taxes and invoicing"
        actions={editable && <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Settings"}</Button>}
      />

      <div className="grid lg:grid-cols-2 gap-5 max-w-5xl">
        {/* Store */}
        <section className="bg-white rounded-2xl border border-wine-100 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-cocoa-900">Store Profile</h3>
          <Field label="Name">
            <input disabled={!editable} value={getVal("store.name") || ""} onChange={(e) => set("store.name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Tagline">
            <input disabled={!editable} value={getVal("store.tagline") || ""} onChange={(e) => set("store.tagline", e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input disabled={!editable} value={getVal("store.phone") || ""} onChange={(e) => set("store.phone", e.target.value)} className={inputCls} />
            </Field>
            <Field label="WhatsApp">
              <input disabled={!editable} value={getVal("store.whatsapp") || ""} onChange={(e) => set("store.whatsapp", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Email">
              <input disabled={!editable} value={getVal("store.email") || ""} onChange={(e) => set("store.email", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Instagram handle">
              <input disabled={!editable} value={getVal("store.instagram") || ""} onChange={(e) => set("store.instagram", e.target.value)} placeholder="@cakestyles" className={inputCls} />
            </Field>
            <Field label="Address line">
              <input disabled={!editable} value={getVal("store.address.line1") || ""} onChange={(e) => set("store.address.line1", e.target.value)} className={inputCls} />
            </Field>
            <Field label="City">
              <input disabled={!editable} value={getVal("store.address.city") || ""} onChange={(e) => set("store.address.city", e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div>
            <span className="text-xs font-medium text-cocoa-600">Opening hours</span>
            <div className="space-y-2 mt-1">
              {(getVal("store.hours") || []).map((_, i) => hoursRow(i))}
              {editable && (
                <Button variant="outline" onClick={() => set("store.hours", [...(getVal("store.hours") || []), { days: "", open: "", close: "" }])}>
                  + Add hours row
                </Button>
              )}
            </div>
          </div>
        </section>

        <div className="space-y-5">
          {/* Tax */}
          <section className="bg-white rounded-2xl border border-wine-100 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-cocoa-900">Tax</h3>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!editable} checked={!!getVal("tax.enabled")} onChange={(e) => set("tax.enabled", e.target.checked)} className="accent-wine-600" />
              Enable tax on checkout & invoices
            </label>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Label">
                <input disabled={!editable} value={getVal("tax.label") || ""} onChange={(e) => set("tax.label", e.target.value)} placeholder="GST" className={inputCls} />
              </Field>
              <Field label="Rate %">
                <input disabled={!editable} type="number" min="0" max="100" step="0.01" value={getVal("tax.rate") ?? 0} onChange={(e) => set("tax.rate", Number(e.target.value))} className={inputCls} />
              </Field>
              <Field label="Mode">
                <select disabled={!editable} value={getVal("tax.inclusive") ? "inclusive" : "exclusive"} onChange={(e) => set("tax.inclusive", e.target.value === "inclusive")} className={inputCls}>
                  <option value="exclusive">Added on top</option>
                  <option value="inclusive">Included in prices</option>
                </select>
              </Field>
            </div>
            <p className="text-[11px] text-cocoa-400">Leave disabled if not registered — nothing is hardcoded either way.</p>
          </section>

          {/* Delivery & pickup */}
          <section className="bg-white rounded-2xl border border-wine-100 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-cocoa-900">Delivery & Pickup</h3>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!editable} checked={!!getVal("delivery.enabled")} onChange={(e) => set("delivery.enabled", e.target.checked)} className="accent-wine-600" />
              Offer delivery
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Delivery fee (₹)">
                <input disabled={!editable} type="number" min="0" value={getVal("delivery.fee") ?? 0} onChange={(e) => set("delivery.fee", Number(e.target.value))} className={inputCls} />
              </Field>
              <Field label="Free over (₹, 0 = never)">
                <input disabled={!editable} type="number" min="0" value={getVal("delivery.freeOver") ?? 0} onChange={(e) => set("delivery.freeOver", Number(e.target.value))} className={inputCls} />
              </Field>
            </div>
            <Field label="Delivery pincodes (comma-separated, blank = all)" span={2}>
              <input disabled={!editable} value={(getVal("delivery.pincodes") || []).join(", ")} onChange={(e) => set("delivery.pincodes", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} className={inputCls} />
            </Field>
            <Field label="Pickup slots (one per line)">
              <textarea
                disabled={!editable}
                rows={3}
                value={(getVal("pickup.slots") || []).join("\n")}
                onChange={(e) => set("pickup.slots", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
                className={inputCls}
              />
            </Field>
            <Field label="Same-day order cutoff (hours before slot)">
              <input disabled={!editable} type="number" min="0" value={getVal("pickup.cutoffHours") ?? 12} onChange={(e) => set("pickup.cutoffHours", Number(e.target.value))} className={inputCls} />
            </Field>
          </section>

          {/* Payments & invoicing */}
          <section className="bg-white rounded-2xl border border-wine-100 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-cocoa-900">Payments & Invoicing</h3>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!editable} checked={!!getVal("paymentMethods.online.enabled")} onChange={(e) => set("paymentMethods.online.enabled", e.target.checked)} className="accent-wine-600" />
              Online payment (Razorpay) at checkout
            </label>
            <Field label="Offline methods allowed at checkout (comma-separated)">
              <input
                disabled={!editable}
                value={(getVal("paymentMethods.offline") || []).join(", ")}
                onChange={(e) => set("paymentMethods.offline", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                placeholder="upi, cash, bank_transfer"
                className={inputCls}
              />
            </Field>
            <Field label="Invoice number prefix">
              <input disabled={!editable} value={getVal("invoice.prefix") || "INV"} onChange={(e) => set("invoice.prefix", e.target.value.toUpperCase())} className={inputCls} />
            </Field>
            <p className="text-[11px] text-cocoa-400">
              Online payments also need Razorpay test/live keys set in the server environment.
            </p>
          </section>
        </div>
      </div>
      {!editable && (
        <p className="text-sm text-cocoa-400 mt-4">You have read-only access to settings ({user?.role}).</p>
      )}
    </div>
  );
}
