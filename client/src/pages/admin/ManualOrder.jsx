import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { inr, daysFromNow } from "../../lib/format";
import { SOURCE_LABELS, PAYMENT_METHOD_LABELS } from "../../lib/meta";
import { orderTotalsPreview } from "../../lib/invoiceTotals";
import { PageHeader, Button, Field, inputCls, Badge } from "../../components/admin/ui";
import { useSettings } from "../../store/SettingsContext";

const MANUAL_SOURCES = ["instagram", "whatsapp", "phone", "walk_in", "repeat", "bni", "jbn", "other"];

export default function ManualOrder() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  const [mode, setMode] = useState("existing"); // existing | new
  const [customerId, setCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", email: "" });
  const [customerSearch, setCustomerSearch] = useState("");

  const [source, setSource] = useState("instagram");
  const [lines, setLines] = useState([]); // {productId?, name, variantName, unitPrice, quantity, isCustom, useB2bPrice?, notes}
  const [fulfilment, setFulfilment] = useState({ type: "pickup", date: daysFromNow(2), slot: "" });
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("");
  const [deposit, setDeposit] = useState({ amount: "", method: "upi", ref: "" });
  const [submitting, setSubmitting] = useState(false);
  // B2B (wholesale) mode: catalogue items are priced at their internal B2B
  // rate instead of the customer-facing price. The rates never reach the
  // public storefront — the server strips them from public endpoints.
  const [b2bMode, setB2bMode] = useState(false);
  const settings = useSettings();

  useEffect(() => {
    api.get("/customers").then((r) => setCustomers(r.data.customers)).catch(() => {});
    api.get("/products/admin").then((r) => setProducts(r.data.products)).catch(() => {});
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 8);
  }, [customers, customerSearch]);


  // B2B pricing mirrors the server: a variant's b2bPrice wins, falling back
  // to the product-level b2bPrice. No price configured → not a B2B item.
  const b2bPriceOf = (p, variantName) => {
    const variant = variantName ? (p?.variants || []).find((v) => v.name === variantName) : null;
    if (variant && variant.b2bPrice != null) return variant.b2bPrice;
    return p?.b2bPrice ?? null;
  };

  // Cheapest B2B rate a product can be bought at, for the picker label.
  const b2bFromPrice = (p) => {
    const rates = (p?.variants || []).length
      ? p.variants.map((v) => (v.b2bPrice != null ? v.b2bPrice : p.b2bPrice)).filter((r) => r != null)
      : [p?.b2bPrice].filter((r) => r != null);
    return rates.length ? Math.min(...rates) : null;
  };

  const b2bProducts = products.filter(
    (p) => p.b2bPrice != null || (p.variants || []).some((v) => v.b2bPrice != null),
  );

  const addProduct = (productId) => {
    const p = products.find((x) => x._id === productId);
    if (!p) return;
    const variantName = p.variants?.[0]?.name || "";
    if (b2bMode) {
      const price = b2bPriceOf(p, variantName);
      if (price == null) return toast.error(`${p.name} has no B2B price set — add one on the product first`);
      setLines((prev) => [
        ...prev,
        {
          productId: p._id,
          name: p.name,
          variantName,
          unitPrice: price,
          variants: p.variants || [],
          quantity: 1,
          isCustom: false,
          useB2bPrice: true,
          notes: "",
        },
      ]);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        productId: p._id,
        name: p.name,
        variantName,
        unitPrice: p.variants?.[0]?.price ?? p.basePrice,
        variants: p.variants || [],
        quantity: 1,
        isCustom: false,
        notes: "",
      },
    ]);
  };

  const updateLine = (i, patch) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const addCustom = () =>
    setLines((prev) => [...prev, { name: "", unitPrice: "", quantity: 1, isCustom: true, notes: "" }]);

  const subtotal = lines.reduce((s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.quantity) || 0), 0);

  // Quote the figure the order will actually be stored with — staff were reading
  // a total that excluded tax. One implementation, shared with the enquiry
  // convert modal and pinned against the server engine by pricing.test.js.
  const tax = settings?.tax || {};
  const { discount: discountAmount, taxRate, taxTotal: taxAmount, grandTotal: total } = orderTotalsPreview({
    subtotal,
    discount: Number(discount) || 0,
    taxRate: tax.enabled ? tax.rate : 0,
    taxInclusive: tax.inclusive,
  });

  const submit = async (e) => {
    e.preventDefault();
    if (mode === "existing" && !customerId) return toast.error("Select a customer");
    if (mode === "new" && (!newCustomer.name || newCustomer.phone.replace(/\D/g, "").length < 8)) {
      return toast.error("Enter new customer name and phone");
    }
    if (lines.length === 0) return toast.error("Add at least one item");

    const items = lines.map((l) =>
      l.isCustom
        ? { name: l.name, unitPrice: Number(l.unitPrice), quantity: Number(l.quantity), notes: l.notes || undefined }
        : {
            productId: l.productId,
            variantName: l.variantName || undefined,
            quantity: Number(l.quantity),
            notes: l.notes || undefined,
            ...(l.useB2bPrice ? { useB2bPrice: true } : {}),
          }
    );

    setSubmitting(true);
    try {
      const { data } = await api.post("/orders/manual", {
        ...(mode === "existing" ? { customerId } : { newCustomer }),
        source,
        items,
        fulfilment: {
          type: fulfilment.type,
          date: fulfilment.date,
          slot: fulfilment.slot || undefined,
          ...(fulfilment.type === "delivery" && fulfilment.line1
            ? { address: { line1: fulfilment.line1, city: fulfilment.city, pincode: fulfilment.pincode } }
            : {}),
        },
        specialInstructions: specialInstructions || undefined,
        ...(discount ? { discount: Number(discount) } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(deposit.amount ? { deposit: { amount: Number(deposit.amount), method: deposit.method, ref: deposit.ref || undefined } } : {}),
      });
      toast.success(`Order ${data.order.orderNumber} created`);
      navigate(`/admin/orders/${data.order._id}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Link to="/admin/orders" className="inline-flex items-center gap-1 text-sm text-cocoa-400 hover:text-wine-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> All orders
      </Link>
      <PageHeader title="New Manual Order" subtitle="Instagram / WhatsApp / phone / walk-in — same records as website orders" />

      <form onSubmit={submit} className="space-y-5 max-w-4xl">
        {/* Customer */}
        <section className="bg-white rounded-2xl border border-wine-100 p-5">
          <div className="flex gap-2 mb-4">
            {["existing", "new"].map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  mode === m ? "border-wine-600 bg-wine-50 text-wine-800" : "border-wine-100"
                }`}
              >
                {m === "existing" ? "Existing Customer" : "New Customer"}
              </button>
            ))}
          </div>

          {mode === "existing" ? (
            <div className="space-y-2">
              <input
                placeholder="Search by name or phone…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className={inputCls}
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredCustomers.map((c) => (
                  <button
                    type="button"
                    key={c._id}
                    onClick={() => setCustomerId(c._id)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-left text-sm transition-colors ${
                      customerId === c._id ? "border-wine-600 bg-wine-50" : "border-wine-100 hover:border-wine-300"
                    }`}
                  >
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-cocoa-400 ml-2">{c.phone}</span>
                    </span>
                    <span className="text-xs text-cocoa-400">{c.orderCount || 0} orders</span>
                  </button>
                ))}
                {filteredCustomers.length === 0 && (
                  <p className="text-sm text-cocoa-400 py-2">No match — switch to "New Customer".</p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Name *">
                <input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Phone *">
                <input value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Email">
                <input value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className={inputCls} />
              </Field>
            </div>
          )}
        </section>

        {/* Source + fulfilment */}
        <section className="bg-white rounded-2xl border border-wine-100 p-5 grid sm:grid-cols-4 gap-3">
          <Field label="Order source *">
            <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
              {MANUAL_SOURCES.map((s) => (
                <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Fulfilment">
            <select value={fulfilment.type} onChange={(e) => setFulfilment({ ...fulfilment, type: e.target.value })} className={inputCls}>
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </Field>
          <Field label="Date *">
            <input type="date" min={daysFromNow(0)} value={fulfilment.date} onChange={(e) => setFulfilment({ ...fulfilment, date: e.target.value })} className={inputCls} required />
          </Field>
          <Field label="Slot">
            <input value={fulfilment.slot} onChange={(e) => setFulfilment({ ...fulfilment, slot: e.target.value })} placeholder="e.g. 5–7 PM" className={inputCls} />
          </Field>
          {fulfilment.type === "delivery" && (
            <>
              <Field label="Address line 1" span={2}>
                <input value={fulfilment.line1 || ""} onChange={(e) => setFulfilment({ ...fulfilment, line1: e.target.value })} className={inputCls} />
              </Field>
              <Field label="City">
                <input value={fulfilment.city || ""} onChange={(e) => setFulfilment({ ...fulfilment, city: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Pincode">
                <input value={fulfilment.pincode || ""} onChange={(e) => setFulfilment({ ...fulfilment, pincode: e.target.value })} className={inputCls} />
              </Field>
            </>
          )}
        </section>

        {/* Items */}
        <section className="bg-white rounded-2xl border border-wine-100 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-semibold text-cocoa-900">Items</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <label
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer transition-colors ${
                  b2bMode ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-wine-100 text-cocoa-500"
                }`}
                title="Wholesale pricing — B2B rates are internal and never shown to customers"
              >
                <input type="checkbox" checked={b2bMode} onChange={(e) => setB2bMode(e.target.checked)} className="accent-indigo-600" />
                B2B (wholesale)
              </label>
              <select value="" onChange={(e) => e.target.value && addProduct(e.target.value)} className="border border-wine-100 rounded-xl px-3 py-2 text-sm bg-white">
                <option value="">{b2bMode ? "+ B2B product…" : "+ Catalogue product…"}</option>
                {(b2bMode ? b2bProducts : products).map((p) => (
                  <option key={p._id} value={p._id}>
                    {b2bMode
                      ? `${p.name} (B2B ${b2bFromPrice(p) != null ? inr(b2bFromPrice(p)) : "—"}${(p.variants || []).length > 1 ? "+" : ""})`
                      : `${p.name} (${inr(p.basePrice)}+)`}
                  </option>
                ))}
                {b2bMode && b2bProducts.length === 0 && (
                  <option value="" disabled>No products have a B2B price set</option>
                )}
              </select>
              <Button type="button" variant="outline" onClick={addCustom}>
                <Plus className="w-4 h-4" /> Custom item
              </Button>
            </div>
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-cocoa-400 py-4 text-center">
              {b2bMode
                ? "Pick B2B products at their wholesale rate — customers never see these prices."
                : "Add catalogue products or a custom line item for bespoke cakes."}
            </p>
          ) : (
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid sm:grid-cols-12 gap-2 items-end border border-wine-50 rounded-xl p-3">
                  <div className="sm:col-span-4">
                    <span className="text-[11px] text-cocoa-400">Item</span>
                    {l.isCustom ? (
                      <input value={l.name} onChange={(e) => updateLine(i, { name: e.target.value })} placeholder="e.g. Custom 2-tier cake" className={inputCls} />
                    ) : (
                      <div className="text-sm font-medium text-cocoa-800 px-1 py-2">
                        {l.name}
                        {l.useB2bPrice && (
                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700" title="Wholesale price — not shown to customers">
                            B2B
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {!l.isCustom && (l.variants || []).length > 0 && (
                    <div className="sm:col-span-2">
                      <span className="text-[11px] text-cocoa-400">Variant</span>
                      <select
                        value={l.variantName}
                        onChange={(e) => {
                          if (l.useB2bPrice) {
                            const p = products.find((x) => x._id === l.productId);
                            updateLine(i, { variantName: e.target.value, unitPrice: b2bPriceOf(p, e.target.value) ?? l.unitPrice });
                          } else {
                            const v = l.variants.find((x) => x.name === e.target.value);
                            updateLine(i, { variantName: e.target.value, unitPrice: v ? v.price : l.unitPrice });
                          }
                        }}
                        className={inputCls}
                      >
                        {l.variants.map((v) => (
                          <option key={v.name} value={v.name}>{v.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <span className="text-[11px] text-cocoa-400">Unit price</span>
                    {l.isCustom ? (
                      <input type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} className={inputCls} />
                    ) : (
                      <div className="text-sm px-1 py-2">{inr(l.unitPrice)}</div>
                    )}
                  </div>
                  <div className="sm:col-span-1">
                    <span className="text-[11px] text-cocoa-400">Qty</span>
                    <input type="number" min="1" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[11px] text-cocoa-400">Line total</span>
                    <div className="text-sm font-semibold px-1 py-2">{inr((Number(l.unitPrice) || 0) * (Number(l.quantity) || 0))}</div>
                  </div>
                  <div className="sm:col-span-1">
                    <button type="button" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="p-2 rounded-lg hover:bg-rose-50 text-cocoa-400 hover:text-rose-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="sm:col-span-12">
                    <input value={l.notes || ""} onChange={(e) => updateLine(i, { notes: e.target.value })} placeholder="Notes (cake message, flavour…)" className={inputCls} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-wine-100 space-y-1">
            <div className="flex justify-between items-center text-sm text-cocoa-500">
              <span>{lines.length} item(s)</span>
              <span>Subtotal: {inr(subtotal)}</span>
            </div>
            {taxAmount > 0 && (
              <div className="flex justify-between items-center text-sm text-cocoa-500">
                <span>{tax.label || "Tax"} ({taxRate}%){tax.inclusive ? " incl." : ""}</span>
                <span>{inr(taxAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm text-cocoa-500">
              <span>Discount (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                className="w-32 border border-wine-100 rounded-lg px-2 py-1 text-right bg-white"
              />
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between items-center text-sm text-emerald-700">
                <span>Discount</span>
                <span>- {inr(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-cocoa-500">Order total</span>
              <span className="font-semibold text-wine-700">{inr(total)}</span>
            </div>
          </div>
        </section>

        {/* Payment + notes */}
        <section className="bg-white rounded-2xl border border-wine-100 p-5 grid sm:grid-cols-2 gap-3">
          <Field label="Deposit / advance (₹)" hint="Optional — recorded as first payment">
            <input type="number" min="0" step="0.01" value={deposit.amount} onChange={(e) => setDeposit({ ...deposit, amount: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Deposit method">
            <select value={deposit.method} onChange={(e) => setDeposit({ ...deposit, method: e.target.value })} className={inputCls}>
              {Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => k !== "razorpay").map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Balance due date">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Order notes">
            <input value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} className={inputCls} />
          </Field>
        </section>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={submitting} className="px-8">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Create Order
          </Button>
          <Badge className="bg-cream-100 text-cocoa-500">{inr(total)} total</Badge>
        </div>
      </form>
    </div>
  );
}
