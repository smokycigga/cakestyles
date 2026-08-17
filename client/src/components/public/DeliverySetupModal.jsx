import { useEffect, useId, useState } from "react";
import { ArrowLeft, Clock3, MapPin, Navigation, Route, Truck, X } from "lucide-react";
import { useFulfilment } from "../../store/FulfilmentContext";
import { useSettings } from "../../store/SettingsContext";

const EMPTY_ADDRESS = { line1: "", line2: "", city: "", pincode: "" };
const inputClass =
  "mt-1.5 w-full rounded-xl border border-wine-100 bg-white px-4 py-3 text-sm text-cocoa-900 outline-none transition placeholder:text-cocoa-500/45 focus:border-wine-400 focus:ring-2 focus:ring-wine-100";

function MapPlaceholder() {
  return (
    <div className="relative h-44 overflow-hidden rounded-2xl border border-wine-100 bg-cream-100" aria-label="Decorative delivery area preview">
      <div className="absolute -left-10 top-7 h-3 w-64 -rotate-12 rounded-full bg-white/90 shadow-sm" />
      <div className="absolute -right-12 top-24 h-3 w-72 rotate-12 rounded-full bg-white/90 shadow-sm" />
      <div className="absolute left-[28%] -top-10 h-64 w-3 rotate-6 rounded-full bg-white/90 shadow-sm" />
      <div className="absolute right-[22%] -top-12 h-72 w-2 -rotate-6 rounded-full bg-blush-200/70" />
      <div className="absolute left-7 top-7 h-14 w-20 rounded-xl border border-blush-200 bg-blush-100/80" />
      <div className="absolute bottom-5 right-7 h-16 w-24 rounded-xl border border-wine-100 bg-wine-50/90" />
      <div className="absolute left-[68%] top-5 h-9 w-12 rounded-lg border border-cream-300 bg-white/70" />
      <div className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-wine-700 text-white shadow-lg shadow-wine-700/25 ring-8 ring-white/75">
        <MapPin className="h-5 w-5" aria-hidden="true" />
      </div>
      <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-wine-700 shadow-sm backdrop-blur">
        Your delivery area
      </span>
    </div>
  );
}

function ModalContent({
  className = "",
  initialAddress,
  onAddressChange,
  onBack,
  onClose,
  onConfirm,
}) {
  const titleId = useId();
  const settings = useSettings();
  const { address: storedAddress, confirmFulfilment } = useFulfilment();
  const [step, setStep] = useState("note");
  const [address, setAddress] = useState(() => ({ ...EMPTY_ADDRESS, ...storedAddress, ...initialAddress }));
  const allowedPincodes = settings?.delivery?.pincodes ?? [];
  const addressComplete = Boolean(address.line1.trim() && address.city.trim() && address.pincode.trim());
  const pincodeSupported = allowedPincodes.length === 0 || allowedPincodes.includes(address.pincode.trim());

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const changeAddress = (field, value) => {
    const next = { ...address, [field]: value };
    setAddress(next);
    onAddressChange?.(next);
  };

  const goBack = () => {
    if (step === "address") {
      setStep("note");
    } else if (onBack) {
      onBack();
    } else {
      onClose();
    }
  };

  const submitAddress = (event) => {
    event.preventDefault();
    if (!addressComplete || !pincodeSupported) return;
    confirmFulfilment({ type: "delivery", address });
    onConfirm?.(address);
  };

  return (
    <div
      className={`fixed inset-0 z-80 flex items-end justify-center bg-wine-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6 ${className}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-white/60 bg-cream-50 shadow-2xl sm:max-w-xl sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-wine-100 bg-cream-50/95 px-5 py-4 backdrop-blur sm:px-7">
          <button type="button" onClick={goBack} className="rounded-full p-2 text-wine-700 transition hover:bg-wine-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine-500" aria-label={step === "address" ? "Back to delivery note" : "Back"}>
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-wine-500">Local delivery · {step === "note" ? "1" : "2"} of 2</span>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-wine-700 transition hover:bg-wine-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine-500" aria-label="Close delivery setup">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="px-5 py-7 sm:px-8 sm:py-8">
          {step === "note" ? (
            <div>
              <div className="mx-auto max-w-md text-center">
                <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blush-100 text-wine-700 ring-8 ring-blush-50">
                  <Truck className="h-7 w-7" aria-hidden="true" />
                </span>
                <h2 id={titleId} className="font-display text-3xl font-semibold text-wine-800">A little delivery note</h2>
                <p className="mt-3 text-sm leading-6 text-cocoa-500">
                  {settings?.delivery?.notes || "Our cakes travel best locally. Add your address next so we can make sure your order is within our delivery area."}
                </p>
              </div>

              <div className="my-7 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-wine-100 bg-white p-4">
                  <Clock3 className="mb-2 h-5 w-5 text-wine-600" aria-hidden="true" />
                  <p className="text-xs font-semibold text-cocoa-900">Made to order</p>
                  <p className="mt-1 text-[11px] leading-5 text-cocoa-500">Your chosen date allows time to bake and finish every detail.</p>
                </div>
                <div className="rounded-2xl border border-wine-100 bg-white p-4">
                  <Route className="mb-2 h-5 w-5 text-wine-600" aria-hidden="true" />
                  <p className="text-xs font-semibold text-cocoa-900">Handled with care</p>
                  <p className="mt-1 text-[11px] leading-5 text-cocoa-500">Local routes help your cake arrive celebration-ready.</p>
                </div>
              </div>

              <button type="button" onClick={() => setStep("address")} className="flex w-full items-center justify-center gap-2 rounded-full bg-wine-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-wine-700/15 transition hover:bg-wine-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine-500 focus-visible:ring-offset-2">
                Continue to address <Navigation className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <form onSubmit={submitAddress}>
              <div className="mb-5">
                <h2 id={titleId} className="font-display text-3xl font-semibold text-wine-800">Where should we deliver?</h2>
                <p className="mt-2 text-sm leading-6 text-cocoa-500">Enter the address where someone can receive your order.</p>
              </div>

              <MapPlaceholder />

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold text-cocoa-700">Address line *</span>
                  <input value={address.line1} onChange={(event) => changeAddress("line1", event.target.value)} placeholder="Flat / house number and street" autoComplete="street-address" required className={inputClass} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold text-cocoa-700">Landmark or area</span>
                  <input value={address.line2} onChange={(event) => changeAddress("line2", event.target.value)} placeholder="Optional" autoComplete="address-line2" className={inputClass} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-cocoa-700">City *</span>
                  <input value={address.city} onChange={(event) => changeAddress("city", event.target.value)} autoComplete="address-level2" required className={inputClass} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-cocoa-700">Pincode *</span>
                  <input value={address.pincode} onChange={(event) => changeAddress("pincode", event.target.value)} inputMode="numeric" autoComplete="postal-code" required className={inputClass} />
                </label>
              </div>

              {address.pincode && !pincodeSupported && <p className="mt-3 text-xs font-medium text-wine-700" role="alert">We don’t deliver to this pincode yet. Please try another address or choose pickup.</p>}
              {allowedPincodes.length > 0 && <p className="mt-2 text-[11px] leading-5 text-cocoa-500">Currently delivering to: {allowedPincodes.join(", ")}</p>}

              <button type="submit" disabled={!addressComplete || !pincodeSupported} className="mt-6 w-full rounded-full bg-wine-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-wine-700/15 transition enabled:hover:bg-wine-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">
                Use this delivery address
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

export default function DeliverySetupModal({ open, isOpen, onClose = () => {}, ...props }) {
  const visible = open ?? isOpen ?? false;
  return visible ? <ModalContent {...props} onClose={onClose} /> : null;
}
