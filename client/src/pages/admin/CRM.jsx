import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarHeart, ClipboardCheck, Gift, RefreshCw, UsersRound } from "lucide-react";
import api, { errMsg } from "../../lib/api";
import { fmtDate, inr } from "../../lib/format";
import { Badge, Button, EmptyState, PageHeader, Spinner, StatCard, TableWrap, Td, Th } from "../../components/admin/ui";
import toast from "react-hot-toast";

const SEGMENTS = [
  ["vip", "VIP"],
  ["repeat", "Repeat"],
  ["new", "New"],
  ["at_risk", "At risk"],
  ["dormant", "Dormant"],
  ["outstanding", "Outstanding"],
  ["birthday_upcoming", "Upcoming birthdays"],
];

export default function CRM() {
  const [overview, setOverview] = useState(null);
  const [segments, setSegments] = useState(null);
  const [dates, setDates] = useState(null);
  const [activeSegment, setActiveSegment] = useState("vip");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/crm/overview"),
      api.get("/crm/segments"),
      api.get("/crm/important-dates", { params: { days: 60 } }),
    ])
      .then(([overviewResponse, segmentsResponse, datesResponse]) => {
        setOverview(overviewResponse.data.overview);
        setSegments(segmentsResponse.data.segments);
        setDates(datesResponse.data.dates);
      })
      .catch((error) => toast.error(errMsg(error)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    Promise.all([
      api.get("/crm/overview"),
      api.get("/crm/segments"),
      api.get("/crm/important-dates", { params: { days: 60 } }),
    ])
      .then(([overviewResponse, segmentsResponse, datesResponse]) => {
        setOverview(overviewResponse.data.overview);
        setSegments(segmentsResponse.data.segments);
        setDates(datesResponse.data.dates);
      })
      .catch((error) => toast.error(errMsg(error)))
      .finally(() => setLoading(false));
  }, []);

  if (loading && !overview) return <Spinner />;
  const customers = segments?.[activeSegment] || [];

  return (
    <div>
      <PageHeader
        title="CRM Overview"
        subtitle="Segments, follow-ups, important dates and customer health"
        actions={<Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Customers" value={overview?.customers || 0} tone="wine" />
        <StatCard label="Open Tasks" value={overview?.tasksOpen || 0} />
        <StatCard label="Overdue Tasks" value={overview?.tasksOverdue || 0} tone={overview?.tasksOverdue ? "warn" : "default"} />
        <StatCard label="Outstanding" value={inr(overview?.outstandingBalance || 0)} tone={overview?.outstandingBalance ? "warn" : "default"} />
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-[1fr_22rem]">
        <section className="rounded-2xl border border-wine-100 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="font-display text-xl font-semibold text-cocoa-900">Customer segments</h2><p className="text-xs text-cocoa-400">Calculated automatically from orders and invoices</p></div>
            <UsersRound className="h-5 w-5 text-wine-500" />
          </div>
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {SEGMENTS.map(([value, label]) => (
              <button key={value} onClick={() => setActiveSegment(value)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${activeSegment === value ? "bg-wine-700 text-white" : "border border-wine-100 bg-white text-cocoa-600"}`}>
                {label} <span className="opacity-70">{segments?.[value]?.length || 0}</span>
              </button>
            ))}
          </div>
          {customers.length === 0 ? (
            <EmptyState icon="👥" title="No customers in this segment" hint="Segments update automatically as customer activity changes." />
          ) : (
            <TableWrap>
              <thead><tr><Th>Customer</Th><Th>Orders</Th><Th>Spend</Th><Th>Last order</Th><Th>Outstanding</Th></tr></thead>
              <tbody>{customers.slice(0, 50).map((customer) => (
                <tr key={customer._id}>
                  <Td><Link to={`/admin/customers/${customer._id}`} className="font-medium text-wine-700 hover:underline">{customer.name}</Link><div className="text-xs text-cocoa-400">{customer.phone}</div></Td>
                  <Td>{customer.orderCount}</Td>
                  <Td>{inr(customer.totalSpend)}</Td>
                  <Td className="text-xs text-cocoa-400">{customer.lastOrderAt ? fmtDate(customer.lastOrderAt) : "—"}</Td>
                  <Td>{customer.outstandingBalance > 0 ? <Badge className="bg-rose-100 text-rose-700">{inr(customer.outstandingBalance)}</Badge> : "—"}</Td>
                </tr>
              ))}</tbody>
            </TableWrap>
          )}
        </section>

        <section className="rounded-2xl border border-wine-100 bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-xl font-semibold text-cocoa-900">Important dates</h2><p className="text-xs text-cocoa-400">Next 60 days</p></div><CalendarHeart className="h-5 w-5 text-wine-500" /></div>
          <div className="space-y-3">
            {(dates || []).slice(0, 12).map((entry) => (
              <Link key={`${entry.customer._id}-${entry.label}-${entry.nextOccurrence}`} to={`/admin/customers/${entry.customer._id}`} className="block rounded-xl border border-wine-50 p-3 transition hover:border-wine-200 hover:bg-wine-50/40">
                <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-medium text-cocoa-800">{entry.customer.name}</p><p className="text-xs text-cocoa-400">{entry.label} · {fmtDate(entry.nextOccurrence)}</p></div><Badge className="bg-blush-100 text-wine-700">{entry.daysUntil === 0 ? "Today" : `${entry.daysUntil}d`}</Badge></div>
              </Link>
            ))}
            {(dates || []).length === 0 && <p className="py-8 text-center text-sm text-cocoa-400">No upcoming dates recorded.</p>}
          </div>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/admin/tasks" className="rounded-2xl border border-wine-100 bg-white p-5 transition hover:border-wine-300"><ClipboardCheck className="h-5 w-5 text-wine-600" /><h3 className="mt-3 font-medium text-cocoa-900">Follow-up queue</h3><p className="mt-1 text-xs text-cocoa-400">Manage team tasks, calls and due dates.</p></Link>
        <Link to="/admin/campaigns" className="rounded-2xl border border-wine-100 bg-white p-5 transition hover:border-wine-300"><UsersRound className="h-5 w-5 text-wine-600" /><h3 className="mt-3 font-medium text-cocoa-900">Campaign lists</h3><p className="mt-1 text-xs text-cocoa-400">Build targeted lists and track manual outreach.</p></Link>
        <Link to="/admin/customers" className="rounded-2xl border border-wine-100 bg-white p-5 transition hover:border-wine-300"><Gift className="h-5 w-5 text-wine-600" /><h3 className="mt-3 font-medium text-cocoa-900">Loyalty rewards</h3><p className="mt-1 text-xs text-cocoa-400">Open a customer to manage points and rewards.</p></Link>
      </div>
    </div>
  );
}
