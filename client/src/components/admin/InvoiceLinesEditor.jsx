import { computeTotals } from "../../lib/invoiceTotals";
import { inr } from "../../lib/format";
import { Button, Field, inputCls } from "./ui";
import { Plus } from "lucide-react";

/**
 * Line-item editor shared by the standalone invoice modal and the invoice
 * edit modal, so both enforce the same rules and show the same live totals.
 * Purely presentational: the parent owns lines/discount/taxRate state and
 * receives every change through onChange.
 */
export default function InvoiceLinesEditor({
  lines,
  discount,
  taxRate,
  onChange,
  products = [],
  taxLabel = "Tax",
  taxPlaceholder = null,
  readOnly = false,
}) {
  const setLine = (index, patch) =>
    onChange({ lines: lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });

  // Choosing from the catalogue prefills the row so price and description
  // are never retyped by hand; it stays editable afterwards.
  const addProduct = (productId) => {
    const product = products.find((p) => p._id === productId);
    if (!product) return;
    onChange({
      lines: [
        ...lines,
        {
          product: product._id,
          description: product.name,
          quantity: 1,
          unitPrice: product.basePrice ?? 0,
          isCustom: false,
        },
      ],
    });
  };

  const addBlank = () =>
    onChange({ lines: [...lines, { description: "", quantity: 1, unitPrice: "", isCustom: true }] });

  // A blank rate means "use the store default" once saved, so the preview has
  // to use that same rate. Previewing 0% made the modal promise a total the
  // created invoice then contradicted.
  const effectiveTaxRate =
    taxRate === "" || taxRate == null ? Number(taxPlaceholder) || 0 : Number(taxRate) || 0;
  const usingStoreDefault = (taxRate === "" || taxRate == null) && effectiveTaxRate > 0;
  const totals = computeTotals({ lines, taxRate: effectiveTaxRate, discount });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-start sm:items-end">
            <div className="col-span-12 sm:col-span-6">
              {i === 0 && <span className="text-[11px] text-cocoa-400">Description</span>}
              <input
                value={line.description}
                disabled={readOnly}
                onChange={(e) => setLine(i, { description: e.target.value })}
                className={inputCls}
                placeholder="Line item"
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              {i === 0 && <span className="text-[11px] text-cocoa-400">Qty</span>}
              <input
                type="number"
                min="1"
                value={line.quantity}
                disabled={readOnly}
                onChange={(e) => setLine(i, { quantity: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="col-span-6 sm:col-span-3">
              {i === 0 && <span className="text-[11px] text-cocoa-400">Unit price ₹</span>}
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.unitPrice}
                disabled={readOnly}
                onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onChange({ lines: lines.filter((_, idx) => idx !== i) })}
                  disabled={lines.length === 1}
                  className="w-full py-2 text-cocoa-400 hover:text-rose-600 disabled:opacity-30"
                  aria-label="Remove line"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}

        {!readOnly && (
          <div className="flex flex-wrap gap-2 items-center pt-1">
            <Button type="button" variant="outline" onClick={addBlank}>
              <Plus className="w-4 h-4" /> Add line
            </Button>
            {products.length > 0 && (
              <span className="text-xs text-cocoa-400">or pick from catalogue:</span>
            )}
            {products.length > 0 && (
              <select
                value=""
                onChange={(e) => e.target.value && addProduct(e.target.value)}
                className={`${inputCls} w-auto min-w-[12rem]`}
              >
                <option value="">Add a product…</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({inr(p.basePrice)}+)
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Discount (₹)" hint={totals.discount > 0 && Number(discount) > totals.subtotal ? "Capped at the line total" : undefined}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={discount}
            disabled={readOnly}
            onChange={(e) => onChange({ discount: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label={`${taxLabel} rate %`} hint={taxPlaceholder != null ? `Blank uses store default (${taxPlaceholder}%)` : undefined}>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={taxRate}
            disabled={readOnly}
            onChange={(e) => onChange({ taxRate: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="space-y-1 text-sm bg-cream-50 rounded-xl px-4 py-3">
        <div className="flex justify-between text-cocoa-500">
          <span>Lines total</span>
          <span>{inr(totals.subtotal)}</span>
        </div>
        {Number(discount) > 0 && (
          <div className="flex justify-between text-cocoa-500">
            <span>Discount</span>
            <span>- {inr(totals.discount)}</span>
          </div>
        )}
        {effectiveTaxRate > 0 && (
          <div className="flex justify-between text-cocoa-500">
            <span>
              {taxLabel} ({effectiveTaxRate}%)
              {usingStoreDefault && <span className="text-cocoa-400"> · store default</span>}
            </span>
            <span>{inr(totals.tax)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-base pt-1 border-t border-wine-100">
          <span>Total</span>
          <span className="text-wine-700">{inr(totals.total)}</span>
        </div>
      </div>
    </div>
  );
}
