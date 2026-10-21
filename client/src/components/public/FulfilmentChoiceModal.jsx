import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  MapPin,
  Navigation,
  Store,
  Truck,
  X,
} from "lucide-react";
import { useFulfilment } from "../../store/FulfilmentContext";
import { useSettings } from "../../store/SettingsContext";
import DeliveryMapPicker from "./DeliveryMapPicker";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-wine-100 bg-white px-4 py-3 text-sm text-cocoa-900 outline-none transition placeholder:text-cocoa-500/50 focus:border-wine-400 focus:ring-2 focus:ring-wine-100";

function ModalContent({ onClose }) {
  const settings = useSettings();
  const { address, setType, updateAddress } = useFulfilment();
  const [step, setStep] = useState("choice");
  const deliveryEnabled = Boolean(settings?.delivery?.enabled);
  const addressComplete = Boolean(address.line1.trim() && address.city.trim() && address.pincode.trim());

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const choosePickup = () => {
    setType("pickup");
    onClose();
  };

  const confirmDelivery = () => {
    if (!addressComplete) return;
    setType("delivery");
    onClose();
  };

  const back = () => {
    setStep((current) => (current === "address" ? "delivery-note" : "choice"));
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-wine-900/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="fulfilment-modal-title"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-white/60 bg-cream-50 shadow-2xl sm:max-w-xl sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-wine-100 bg-cream-50/95 px-5 py-4 backdrop-blur sm:px-7">
          <button
            type="button"
            onClick={back}
            className={`rounded-full p-2 text-wine-700 transition hover:bg-wine-100 ${step === "choice" ? "invisible" : ""}`}
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-wine-500">
            {step === "choice" ? "How would you like it?" : "Local delivery"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-wine-700 transition hover:bg-wine-100"
            aria-label="Close fulfilment choices"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-6 sm:px-8 sm:py-8">
          {step === "choice" && (
            <>
              <div className="mb-7 text-center">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-wine-500">Freshly made for you</p>
                <h2 id="fulfilment-modal-title" className="font-display text-3xl font-semibold text-wine-800">
                  Choose fulfilment
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-cocoa-500">
                  Collect your order from our studio or have it brought to your door.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={choosePickup}
                  className="group rounded-2xl border border-wine-100 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-wine-300 hover:shadow-md"
                >
                  <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-wine-50 text-wine-700 transition group-hover:bg-wine-700 group-hover:text-white">
                    <Store className="h-6 w-6" />
                  </span>
                  <span className="block font-display text-xl font-semibold text-wine-800">Store pickup</span>
                  <span className="mt-1 block text-xs leading-5 text-cocoa-500">Collect at a time that suits you.</span>
                  <span className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-wine-600">
                    Select pickup <Check className="h-3.5 w-3.5" />
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!deliveryEnabled}
                  onClick={() => setStep("delivery-note")}
                  className="group rounded-2xl border border-wine-100 bg-white p-5 text-left shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:border-wine-300 enabled:hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blush-100 text-wine-700 transition group-enabled:group-hover:bg-wine-700 group-enabled:group-hover:text-white">
                    <Truck className="h-6 w-6" />
                  </span>
                  <span className="block font-display text-xl font-semibold text-wine-800">Delivery</span>
                  <span className="mt-1 block text-xs leading-5 text-cocoa-500">
                    {deliveryEnabled ? "Hand-delivered with care." : "Delivery is currently unavailable."}
                  </span>
                  {deliveryEnabled && (
                    <span className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-wine-600">
                      Check your address <Navigation className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              </div>
            </>
          )}

          {step === "delivery-note" && (
            <>
              <div className="mx-auto max-w-md text-center">
                <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blush-100 text-wine-700 ring-8 ring-blush-50">
                  <Truck className="h-7 w-7" />
                </span>
                <h2 id="fulfilment-modal-title" className="font-display text-3xl font-semibold text-wine-800">
                  A little delivery note
                </h2>
                <p className="mt-3 text-sm leading-6 text-cocoa-500">
                  Our cakes travel best within our local delivery area. Add your address next and we’ll use your pincode to confirm availability.
                </p>
              </div>

              <div className="my-7 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-wine-100 bg-white p-4">
                  <Clock3 className="mb-2 h-5 w-5 text-wine-600" />
                  <p className="text-xs font-semibold text-cocoa-900">Made to order</p>
                  <p className="mt-1 text-[11px] leading-5 text-cocoa-500">Choose your date and slot after confirming.</p>
                </div>
                <div className="rounded-2xl border border-wine-100 bg-white p-4">
                  <MapPin className="mb-2 h-5 w-5 text-wine-600" />
                  <p className="text-xs font-semibold text-cocoa-900">Local routes</p>
                  <p className="mt-1 text-[11px] leading-5 text-cocoa-500">Availability depends on your delivery pincode.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep("address")}
                className="w-full rounded-full bg-wine-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-wine-700/15 transition hover:bg-wine-800"
              >
                Continue to address
              </button>
            </>
          )}

          {step === "address" && (
            <>
              <div className="mb-5">
                <h2 id="fulfilment-modal-title" className="font-display text-3xl font-semibold text-wine-800">
                  Where should we deliver?
                </h2>
                <p className="mt-2 text-sm leading-6 text-cocoa-500">Enter the address where someone can receive your order.</p>
              </div>

              <DeliveryMapPicker value={address} onChange={(next) => {
                Object.entries(next).forEach(([field, value]) => updateAddress(field, value));
              }} />

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold text-cocoa-700">Address line *</span>
                  <input
                    value={address.line1}
                    onChange={(event) => updateAddress("line1", event.target.value)}
                    placeholder="Flat / house number and street"
                    autoComplete="street-address"
                    className={inputClass}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold text-cocoa-700">Landmark or area</span>
                  <input
                    value={address.line2}
                    onChange={(event) => updateAddress("line2", event.target.value)}
                    placeholder="Optional"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-cocoa-700">City *</span>
                  <input
                    value={address.city}
                    onChange={(event) => updateAddress("city", event.target.value)}
                    autoComplete="address-level2"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-cocoa-700">Pincode *</span>
                  <input
                    value={address.pincode}
                    onChange={(event) => updateAddress("pincode", event.target.value)}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    className={inputClass}
                  />
                </label>
              </div>

              {settings?.delivery?.pincodes?.length > 0 && (
                <p className="mt-3 text-[11px] leading-5 text-cocoa-500">
                  Currently delivering to: {settings.delivery.pincodes.join(", ")}
                </p>
              )}

              <button
                type="button"
                disabled={!addressComplete}
                onClick={confirmDelivery}
                className="mt-6 w-full rounded-full bg-wine-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-wine-700/15 transition enabled:hover:bg-wine-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Use this delivery address
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default function FulfilmentChoiceModal({ open, isOpen, onClose = () => {} }) {
  const visible = open ?? isOpen ?? false;
  return visible ? <ModalContent onClose={onClose} /> : null;
}
