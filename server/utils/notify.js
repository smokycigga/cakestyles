// Pluggable notification transport (PRD §17). MVP logs to console; wire a
// real provider (email/WhatsApp) here later without touching call sites.
const notify = async (event, payload) => {
  console.log(`[notify] ${event}`, JSON.stringify(payload));
};

export const notifyOrderPlaced = (order) => notify("order.placed", { orderNumber: order.orderNumber, total: order.grandTotal, customer: order.customerSnapshot.name });
export const notifyOrderStatus = (order, status) => notify("order.status", { orderNumber: order.orderNumber, status });
export const notifyInvoiceIssued = (invoice) => notify("invoice.issued", { invoiceNumber: invoice.invoiceNumber, total: invoice.total });
export const notifyEnquiryReceived = (enquiry) => notify("enquiry.received", { name: enquiry.customerSnapshot.name, eventDate: enquiry.eventDate });

