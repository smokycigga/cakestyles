import { useEffect, useId, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { useFulfilment } from "../../store/FulfilmentContext";
import { useSettings } from "../../store/SettingsContext";

const toLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normaliseSlot = (slot) => {
  if (typeof slot === "string") return { value: slot, label: slot };
  if (!slot || typeof slot !== "object") return null;

  const value = String(slot.value ?? slot.id ?? slot.label ?? slot.time ?? "");
  if (!value) return null;
  return { value, label: String(slot.label ?? slot.time ?? value) };
};

export default function SlotPicker({
  className = "",
  date: dateOverride,
  fulfilmentType,
  onDateChange,
  onSlotChange,
  preparationHours,
  preparationTimeHours,
  prepTimeHours,
  slot: slotOverride,
  slots: slotsOverride,
}) {
  const settings = useSettings();
  const {
    date: storedDate,
    setDate,
    setSlot,
    slot: storedSlot,
    type: storedType,
  } = useFulfilment();
  const dateId = useId();
  const slotId = useId();
  const [now] = useState(() => Date.now());
  const type = fulfilmentType ?? storedType ?? "pickup";
  const date = dateOverride ?? storedDate;
  const slot = slotOverride ?? storedSlot;

  const configuredHours = Number(settings?.[type]?.cutoffHours ?? settings?.pickup?.cutoffHours);
  const requestedHours = preparationHours ?? preparationTimeHours ?? prepTimeHours;
  const productHours = Number(requestedHours);
  const minimumHours = Math.max(
    0,
    Number.isFinite(configuredHours) ? configuredHours : 0,
    Number.isFinite(productHours) ? productHours : 0,
  );
  const minDate = toLocalDate(new Date(now + minimumHours * 60 * 60 * 1000));
  const selectedDate = date && date >= minDate ? date : minDate;

  const configuredSlots = settings?.[type]?.slots ?? settings?.pickup?.slots ?? [];
  const slotSource = Array.isArray(slotsOverride)
    ? slotsOverride
    : Array.isArray(configuredSlots)
      ? configuredSlots
      : [];
  const slots = slotSource.map(normaliseSlot).filter(Boolean);
  const selectedSlot = slots.some((availableSlot) => availableSlot.value === slot) ? slot : "";
  const wording = type === "delivery" ? "delivery" : "pickup";
  const inputClass =
    "mt-1.5 w-full rounded-xl border border-wine-100 bg-white px-4 py-3 text-sm text-cocoa-900 outline-none transition focus:border-wine-400 focus:ring-2 focus:ring-wine-100 disabled:cursor-not-allowed disabled:bg-cream-100 disabled:text-cocoa-500";

  useEffect(() => {
    if (date === selectedDate) return;
    if (onDateChange) onDateChange(selectedDate);
    else setDate(selectedDate);
  }, [date, onDateChange, selectedDate, setDate]);

  const changeDate = (nextDate) => {
    if (onDateChange) onDateChange(nextDate);
    else setDate(nextDate);
  };

  const changeSlot = (nextSlot) => {
    if (onSlotChange) onSlotChange(nextSlot);
    else setSlot(nextSlot);
  };

  return (
    <fieldset className={`grid gap-4 sm:grid-cols-2 ${className}`}>
      <legend className="sr-only">Choose your {wording} date and time</legend>
      <div>
        <label htmlFor={dateId} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cocoa-500">
          <CalendarDays className="h-4 w-4 text-wine-500" aria-hidden="true" />
          {wording} date
        </label>
        <input
          id={dateId}
          type="date"
          min={minDate}
          value={selectedDate}
          onChange={(event) => changeDate(event.target.value)}
          aria-describedby={minimumHours > 0 ? `${dateId}-hint` : undefined}
          className={inputClass}
        />
        {minimumHours > 0 && (
          <span id={`${dateId}-hint`} className="mt-1.5 block text-[11px] leading-relaxed text-cocoa-500">
            Please allow at least {minimumHours} preparation {minimumHours === 1 ? "hour" : "hours"}.
          </span>
        )}
      </div>

      <div>
        <label htmlFor={slotId} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cocoa-500">
          <Clock3 className="h-4 w-4 text-wine-500" aria-hidden="true" />
          {wording} time
        </label>
        <select
          id={slotId}
          value={selectedSlot}
          onChange={(event) => changeSlot(event.target.value)}
          className={inputClass}
          disabled={slots.length === 0}
          aria-describedby={`${slotId}-status`}
        >
          <option value="">{slots.length ? `Choose a ${wording} slot` : `No ${wording} slots configured`}</option>
          {slots.map((availableSlot) => (
            <option key={availableSlot.value} value={availableSlot.value}>
              {availableSlot.label}
            </option>
          ))}
        </select>
        <span id={`${slotId}-status`} className="sr-only" aria-live="polite">
          {slots.length ? `${slots.length} ${wording} slots available` : `No ${wording} slots are currently available`}
        </span>
      </div>
    </fieldset>
  );
}
