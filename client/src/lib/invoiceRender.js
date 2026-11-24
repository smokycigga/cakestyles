// Lazy facade around the invoice rendering engine.
// jsPDF (and its parser deps) are heavy, so they are only fetched when a PDF or
// PNG is actually downloaded — not when an invoice page merely loads.
//
// The engine lives in its own hashed chunk. That chunk is the fragile part:
// after a deploy the old filename stops existing, so a browser still holding the
// previous index.html asks for a file that now 404s and the download silently
// does nothing. Every click retried the same doomed import and raised another
// "Failed to fetch dynamically imported module" toast, which is why five clicks
// produced five identical errors.
//
// So: load the module once and share the promise, turn a chunk failure into a
// message a shopkeeper can act on, and let the page warm the chunk up front.

const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

let modulePromise = null;

const loadRenderer = () => {
  if (!modulePromise) {
    modulePromise = import("./invoiceRenderImpl.js").catch((error) => {
      // Let a later attempt try again rather than caching the failure forever.
      modulePromise = null;

      if (CHUNK_ERROR.test(error?.message || "")) {
        const friendly = new Error(
          "The invoice tool didn't load. The site was probably updated — reload the page and try again."
        );
        friendly.code = "RENDERER_UNAVAILABLE";
        friendly.cause = error;
        throw friendly;
      }
      throw error;
    });
  }
  return modulePromise;
};

/** True when the failure is "this page is stale / offline", not a rendering bug. */
export const isRendererUnavailable = (error) => error?.code === "RENDERER_UNAVAILABLE";

/**
 * Fetch the engine ahead of time. Call this when an invoice screen mounts so the
 * chunk is already in memory by the time anyone clicks Download — and so a
 * failure is discovered on load, where it can be shown as a banner, instead of
 * being swallowed in a toast that disappears after four seconds.
 *
 * Resolves true if the engine is ready, false if it could not be fetched.
 */
export const preloadInvoiceRenderer = () =>
  loadRenderer().then(
    () => true,
    () => false
  );

/**
 * Warm the engine only once the page is idle.
 *
 * The engine plus its jsPDF / canvas dependencies is roughly 280 kB gzipped.
 * Fetching that on mount put it in a straight race with the invoice list
 * request, so on a phone the list — the only thing the screen is for — arrived
 * last, behind a megabyte of PDF code nobody had asked to use yet. Idle
 * warming keeps the "already loaded when you click Download" benefit without
 * paying for it in the critical path. A click still loads it on demand.
 */
export const preloadInvoiceRendererWhenIdle = () =>
  new Promise((resolve) => {
    const warm = () => preloadInvoiceRenderer().then(resolve);
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(warm, { timeout: 6000 });
    } else {
      setTimeout(warm, 2000);
    }
  });

export function fetchStoreInfo() {
  return loadRenderer().then((m) => m.fetchStoreInfo());
}

export function downloadInvoicePdf(invoice) {
  return loadRenderer().then((m) => m.downloadInvoicePdf(invoice));
}

export function downloadInvoicePng(invoice) {
  return loadRenderer().then((m) => m.downloadInvoicePng(invoice));
}
