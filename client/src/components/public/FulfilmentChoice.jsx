import { ArrowRight, Store, Truck } from "lucide-react";

const cardClass =
  "group relative overflow-hidden rounded-3xl border bg-white p-6 text-left shadow-sm transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine-500 focus-visible:ring-offset-2";

export default function FulfilmentChoice({
  className = "",
  deliveryDisabled = false,
  deliveryDisabledMessage = "Delivery is currently unavailable.",
  onPickup = () => {},
  onDelivery = () => {},
  selectedType,
  title = "How would you like your cake?",
  description = "Collect from our studio or let us bring your order to the celebration.",
}) {
  return (
    <section className={`rounded-[2rem] bg-cream-100 px-5 py-8 sm:px-8 sm:py-10 ${className}`} aria-labelledby="fulfilment-choice-title">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-wine-500">Freshly made for you</p>
        <h2 id="fulfilment-choice-title" className="mt-2 font-display text-3xl font-semibold text-wine-800 sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-cocoa-500">{description}</p>
      </div>

      <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onPickup}
          aria-pressed={selectedType === "pickup"}
          className={`${cardClass} ${selectedType === "pickup" ? "border-wine-500 ring-1 ring-wine-300" : "border-wine-100 hover:-translate-y-1 hover:border-wine-300 hover:shadow-lg"}`}
        >
          <span className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-wine-50 transition-transform duration-300 group-hover:scale-125" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-wine-700 text-white shadow-md shadow-wine-700/20">
            <Store className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="relative mt-5 block font-display text-xl font-semibold text-wine-800">Store pickup</span>
          <span className="relative mt-1.5 block text-xs leading-5 text-cocoa-500">Choose a convenient date and collect from our cake studio.</span>
          <span className="relative mt-5 flex items-center gap-2 text-xs font-semibold text-wine-600">
            Choose pickup <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </span>
        </button>

        <button
          type="button"
          onClick={onDelivery}
          disabled={deliveryDisabled}
          aria-pressed={selectedType === "delivery"}
          aria-describedby={deliveryDisabled ? "delivery-disabled-message" : undefined}
          className={`${cardClass} ${selectedType === "delivery" ? "border-wine-500 ring-1 ring-wine-300" : "border-wine-100 enabled:hover:-translate-y-1 enabled:hover:border-wine-300 enabled:hover:shadow-lg"} disabled:cursor-not-allowed disabled:opacity-55`}
        >
          <span className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blush-100 transition-transform duration-300 group-enabled:group-hover:scale-125" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-blush-100 text-wine-700">
            <Truck className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="relative mt-5 block font-display text-xl font-semibold text-wine-800">Local delivery</span>
          <span id={deliveryDisabled ? "delivery-disabled-message" : undefined} className="relative mt-1.5 block text-xs leading-5 text-cocoa-500">
            {deliveryDisabled ? deliveryDisabledMessage : "Share your address and we’ll bring your cake with care."}
          </span>
          {!deliveryDisabled && (
            <span className="relative mt-5 flex items-center gap-2 text-xs font-semibold text-wine-600">
              Set up delivery <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </span>
          )}
        </button>
      </div>
    </section>
  );
}
