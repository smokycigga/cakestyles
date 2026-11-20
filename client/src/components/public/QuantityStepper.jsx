import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { QUANTITY_STEP, roundQuantity } from "../../store/CartContext";

/**
 * Quantity control that accepts fractions.
 *
 * A cake is not always bought in whole units — half a kilo, one and a half
 * cakes — so the buttons move in half steps and the number itself is editable
 * for anything odd (0.75 kg, a third of a tray).
 *
 * The text field keeps its own draft while typing: committing on every
 * keystroke would turn "1.5" into 1 the moment the "." arrived.
 */
export default function QuantityStepper({
  value,
  onChange,
  min = QUANTITY_STEP,
  step = QUANTITY_STEP,
  compact = false,
  className = "",
}) {
  const [draft, setDraft] = useState(String(value));

  // Follow the outside value whenever it changes (add-to-cart resets, etc.),
  // but not while the user is mid-edit with a half-typed number.
  useEffect(() => {
    setDraft(String(roundQuantity(value)));
  }, [value]);

  const commit = (raw) => {
    const parsed = roundQuantity(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(String(roundQuantity(value)));
      return;
    }
    onChange(Math.max(min, parsed));
  };

  const bump = (direction) => {
    const next = Math.max(min, roundQuantity(roundQuantity(value) + direction * step));
    onChange(next);
  };

  const button = compact ? "p-2" : "p-3";
  const icon = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div className={`flex items-center rounded-xl border border-wine-200 bg-white ${className}`}>
      <button type="button" onClick={() => bump(-1)} className={button} aria-label="Decrease quantity">
        <Minus className={icon} />
      </button>
      <input
        type="number"
        inputMode="decimal"
        // The buttons move in `step`; the field itself takes any positive
        // number. `step={step}` made 0.75 "invalid" (min 0.5 + 0.5n), which
        // contradicts the whole point of the editable field.
        step="any"
        min={min}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(event.currentTarget.value);
            event.currentTarget.blur();
          }
        }}
        aria-label="Quantity"
        className={`min-w-10 bg-transparent px-1 text-center text-sm font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
          compact ? "w-12" : "w-14"
        }`}
      />
      <button type="button" onClick={() => bump(1)} className={button} aria-label="Increase quantity">
        <Plus className={icon} />
      </button>
    </div>
  );
}
