import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, LayoutGrid, List, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { inr, fmtDate } from "../../lib/format";
import { ORDER_STATUS_META, PAYMENT_STATUS_META, SOURCE_LABELS } from "../../lib/meta";
import { PageHeader, Spinner, Badge, Th, Td, TableWrap, EmptyState, Button, inputCls } from "../../components/admin/ui";
import { useAuth } from "../../store/AuthContext";

const STATUS_KEYS = ["pending_payment", "confirmed", "in_preparation", "ready", "out_for_delivery", "completed"];

export default function Orders() {
  const { can } = useAuth();
  const [orders, setOrders] = useState(null);
  const [view, setView] = useState("table");
  const [filters, setFilters] = useState({ status: "", source: "", paymentStatus: "", search: "" });

  const load = (f = filters) => {
    const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    api.get("/orders", { params }).then((r) => setOrders(r.data.orders)).catch(() => setOrders([]));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => {
    const next = { ...filters, [k]: e.target.value };
    setFilters(next);
    load(next);
  };

  const canDelete = () => true;

  const deleteOrder = async (o) => {
    if (!confirm(`Delete order ${o.orderNumber}? This also deletes its linked invoice (if any) and cannot be undone.`)) return;
    try {
      await api.delete(`/orders/${o._id}`);
      toast.success(`Order ${o.orderNumber} deleted`);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={orders ? `${orders.length} order(s)` : ""}
        actions={
          <>
            <Button variant="outline" onClick={() => setView(view === "table" ? "board" : "table")}>
              {view === "table" ? <><LayoutGrid className="w-4 h-4" /> Status Board</> : <><List className="w-4 h-4" /> Table</>}
            </Button>
            <Link to="/admin/orders/new" className="inline-flex items-center gap-1.5 bg-wine-700 hover:bg-wine-800 text-white font-medium text-sm px-4 py-2 rounded-xl transition-colors">
              <Plus className="w-4 h-4" /> Manual Order
            </Link>
          </>
        }
      />

      {/* Filters */}
      <div className="grid sm:grid-cols-4 gap-2 mb-5">
        <input value={filters.search} onChange={set("search")} placeholder="Search number, name, phone…" className={inputCls} />
        <select value={filters.status} onChange={set("status")} className={inputCls}>
          <option value="">All statuses</option>
          {Object.entries(ORDER_STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={filters.source} onChange={set("source")} className={inputCls}>
          <option value="">All channels</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={filters.paymentStatus} onChange={set("paymentStatus")} className={inputCls}>
          <option value="">All payments</option>
          {Object.entries(PAYMENT_STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {!orders ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-wine-100">
          <EmptyState title="No orders match these filters" />
        </div>
      ) : view === "table" ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Channel</Th>
              <Th>Fulfilment</Th>
              <Th>Total</Th>
              <Th>Payment</Th>
              <Th>Invoice</Th>
              <Th>Status</Th>
              <Th>Date</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o._id} className="hover:bg-wine-50/50">
                <Td label="Order">
                  <Link to={`/admin/orders/${o._id}`} className="font-medium text-wine-700 hover:underline">{o.orderNumber}</Link>
                </Td>
                <Td label="Customer">
                  <div className="font-medium text-cocoa-800">{o.customerSnapshot?.name}</div>
                  <div className="text-xs text-cocoa-400">{o.customerSnapshot?.phone}</div>
                </Td>
                <Td className="text-cocoa-500 text-xs" label="Channel">{SOURCE_LABELS[o.source] || o.source}</Td>
                <Td className="text-xs text-cocoa-500" label="Fulfilment">
                  {o.fulfilment?.type === "delivery" ? "🛵 Delivery" : "🏬 Pickup"} · {o.fulfilment?.date}
                </Td>
                <Td className="font-medium" label="Total">{inr(o.grandTotal)}</Td>
                <Td label="Payment">
                  <Badge className={PAYMENT_STATUS_META[o.payment?.status]?.color}>
                    {PAYMENT_STATUS_META[o.payment?.status]?.label || o.payment?.status}
                  </Badge>
                </Td>
                {/* An un-invoiced order is invisible otherwise, which is how a
                    second order ends up billed by a hand-typed invoice. */}
                <Td className="text-xs" label="Invoice">
                  {o.invoice ? (
                    <Link to={`/admin/invoices/${o.invoice._id}`} className="text-wine-700 hover:underline">
                      {o.invoice.invoiceNumber}
                    </Link>
                  ) : (
                    <span className="text-cocoa-400">Not invoiced</span>
                  )}
                </Td>
                <Td label="Status">
                  <Badge className={ORDER_STATUS_META[o.status]?.color}>{ORDER_STATUS_META[o.status]?.label}</Badge>
                </Td>
                <Td className="text-xs text-cocoa-400" label="Date">{fmtDate(o.createdAt)}</Td>
                <Td label="Actions">
                  {can("orders:write") && canDelete(o) && (
                    <button
                      type="button"
                      title="Delete order"
                      onClick={() => deleteOrder(o)}
                      className="text-cocoa-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
          {STATUS_KEYS.map((status) => {
            const list = orders.filter((o) => o.status === status);
            return (
              <div key={status} className="bg-wine-50/60 rounded-2xl p-3 min-h-32">
                <div className="flex items-center justify-between mb-3">
                  <Badge className={ORDER_STATUS_META[status]?.color}>{ORDER_STATUS_META[status]?.label}</Badge>
                  <span className="text-xs text-cocoa-400">{list.length}</span>
                </div>
                <div className="space-y-2">
                  {list.map((o) => (
                    <Link
                      key={o._id}
                      to={`/admin/orders/${o._id}`}
                      className="block bg-white rounded-xl border border-wine-100 p-3 hover:border-wine-300 transition-colors"
                    >
                      <div className="text-xs font-semibold text-wine-700">{o.orderNumber}</div>
                      <div className="text-xs text-cocoa-600 truncate">{o.customerSnapshot?.name}</div>
                      <div className="text-xs font-medium mt-1">{inr(o.grandTotal)}</div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
