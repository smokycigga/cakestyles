// Lazy facade around the invoice rendering engine.
// jsPDF (and its parser deps) are heavy, so they are only fetched when a PDF or
// PNG is actually downloaded — not when an invoice page merely loads.
export function fetchStoreInfo() {
  return import("./invoiceRenderImpl.js").then((m) => m.fetchStoreInfo());
}

export function downloadInvoicePdf(invoice) {
  return import("./invoiceRenderImpl.js").then((m) => m.downloadInvoicePdf(invoice));
}

export function downloadInvoicePng(invoice) {
  return import("./invoiceRenderImpl.js").then((m) => m.downloadInvoicePng(invoice));
}
