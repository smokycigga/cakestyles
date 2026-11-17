import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { RefreshCw } from "lucide-react";
import api from "../../lib/api";
import { inr } from "../../lib/format";
import { ORDER_STATUS_META, SOURCE_LABELS } from "../../lib/meta";
import { PageHeader, StatCard, Spinner, Badge, Th, Td, TableWrap, Button } from "../../components/admin/ui";

const RANGES = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["this_quarter", "This quarter"],
];

const CHANNEL_COLORS = ["#6d2141", "#a44a6f", "#bd6c8c", "#d69cb2", "#e9c6d3", "#f5e3ea", "#c9a227"];
const EXPENSE_COLORS = ["#8c3559", "#bd6c8c", "#c9a227", "#4a7c59", "#3d5a80", "#9e2a2b", "#7a6c5d", "#5e548e", "#ca6702", "#94a3b8", "#6b4a3a"];

const MONTH_WINDOWS = [
  [6, "Last 6 months"],
  [12, "Last 12 months"],
  [24, "Last 24 months"],
];

// A percentage change is only meaningful against a non-zero baseline, so a
// missing figure renders as "—" rather than a misleading 0% or an infinity.
const Delta = ({ pct, label }) => {
  if (pct == null) {
    return (
      <span className="text-xs text-cocoa-400">
        {label} <span className="font-medium">—</span>
      </span>
    );
  }
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  return (
    <span className="text-xs text-cocoa-400">
      {label}{" "}
      <span className={`font-semibold ${flat ? "text-cocoa-500" : up ? "text-emerald-700" : "text-rose-600"}`}>
        {flat ? "no change" : `${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`}
      </span>
    </span>
  );
};

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [range, setRange] = useState("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(true);

  const load = (r = range, f = from, t = to, m = months) => {
    setLoading(true);
    const params = r === "custom" && f && t ? { from: f, to: t, months: m } : { range: r, months: m };
    api
      .get("/dashboard", { params })
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api
      .get("/dashboard", { params: { range: "30d", months: 6 } })
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const k = data?.kpis;
  const mc = data?.monthComparison;
  const monthly = data?.monthly || [];
  // How far into the current month we are — the comparison is only fair over
  // the same stretch of last month.
  const daysElapsed = mc ? Number(mc.current.to.slice(8, 10)) : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={data ? `${data.range.from} → ${data.range.to}` : "Business overview"}
        actions={
          <>
            <select
              value={range}
              onChange={(e) => {
                setRange(e.target.value);
                load(e.target.value);
              }}
              className="border border-wine-100 rounded-xl px-3 py-2 text-sm bg-white"
            >
              {RANGES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
              <option value="custom">Custom range</option>
            </select>
            {range === "custom" && (
              <>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-wine-100 rounded-xl px-3 py-2 text-sm bg-white" />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-wine-100 rounded-xl px-3 py-2 text-sm bg-white" />
                <Button variant="outline" onClick={() => from && to && load("custom")}>Apply</Button>
              </>
            )}
            <Button variant="outline" onClick={() => load()}>
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
          </>
        }
      />

      {loading || !data ? (
        <Spinner />
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard tone="wine" label="Gross Sales" value={inr(k.grossSales)} sub={k.growthPct != null ? `${k.growthPct > 0 ? "▲" : "▼"} ${Math.abs(k.growthPct)}% vs prev period` : undefined} />
            <StatCard label="Orders" value={k.orderCount} sub={`AOV ${inr(k.aov)}`} />
            <StatCard label="Customers" value={`${k.newCustomers} new / ${k.repeatCustomers} repeat`} />
            <StatCard label="Outstanding" value={inr(k.outstanding)} tone={k.outstanding > 0 ? "warn" : "default"} />
            <StatCard label="Expenses" value={inr(k.expenses)} />
            <StatCard label="Contribution" value={inr(k.grossProfit)} tone={k.grossProfit >= 0 ? "good" : "bad"} sub="Sales − expenses" />
            <StatCard label="Refunds" value={inr(k.refunds)} />
            <StatCard label="Net Sales" value={inr(k.netSales)} sub="After refunds" />
          </div>

          {/* Month by month */}
          <div className="mt-6 bg-white rounded-2xl border border-wine-100 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-cocoa-900">Month by month</h3>
                <p className="text-xs text-cocoa-400 mt-0.5">
                  {mc
                    ? `${mc.current.label} so far, against the same ${daysElapsed} day${daysElapsed === 1 ? "" : "s"} of ${mc.previousSamePeriod.label}`
                    : "Loading…"}
                </p>
              </div>
              <select
                value={months}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setMonths(next);
                  load(range, from, to, next);
                }}
                className="border border-wine-100 rounded-xl px-3 py-2 text-sm bg-white"
              >
                {MONTH_WINDOWS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {mc && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                {[
                  { key: "revenue", label: "Revenue", current: inr(mc.current.revenue), previous: inr(mc.previousSamePeriod.revenue) },
                  { key: "orders", label: "Orders", current: mc.current.orders, previous: mc.previousSamePeriod.orders },
                  { key: "aov", label: "Avg order value", current: inr(mc.current.aov), previous: inr(mc.previousSamePeriod.aov) },
                ].map((tile) => (
                  <div key={tile.key} className="rounded-xl border border-wine-100 bg-wine-50/40 px-4 py-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-cocoa-400">{tile.label}</div>
                    <div className="mt-1 text-xl font-semibold text-cocoa-900">{tile.current}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2">
                      <Delta pct={mc.delta[`${tile.key}Pct`]} label="vs last month" />
                    </div>
                    <div className="mt-0.5 text-[11px] text-cocoa-400">
                      {mc.previousSamePeriod.label} same period: {tile.previous}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {monthly.length === 0 ? (
              <p className="text-sm text-cocoa-400 py-8 text-center">No orders recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5e3ea" vertical={false} />
                  <XAxis dataKey="shortLabel" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                  <Tooltip
                    formatter={(value, name) => [inr(value), name]}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload;
                      if (!row) return "";
                      return `${row.label}${row.partial ? " (so far)" : ""} · ${row.orders} order${row.orders === 1 ? "" : "s"}`;
                    }}
                  />
                  {/* The running month is drawn lighter: it is not a finished
                      month, and comparing its height to a full one is unfair. */}
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]} name="Revenue">
                    {monthly.map((row) => (
                      <Cell key={row.month} fill={row.partial ? "#d69cb2" : "#6d2141"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            {monthly.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-cocoa-400">
                      <th className="py-2 pr-3 font-medium">Month</th>
                      <th className="py-2 pr-3 font-medium text-right">Revenue</th>
                      <th className="py-2 pr-3 font-medium text-right">Orders</th>
                      <th className="py-2 pr-3 font-medium text-right">Avg order</th>
                      <th className="py-2 pr-3 font-medium text-right">New customers</th>
                      <th className="py-2 font-medium">Best seller</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...monthly].reverse().map((row) => (
                      <tr key={row.month} className="border-t border-wine-50">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <span className="text-cocoa-900">{row.label}</span>
                          {row.partial && <span className="ml-2 text-[10px] uppercase tracking-wide text-wine-500">so far</span>}
                        </td>
                        <td className="py-2 pr-3 text-right font-medium">{inr(row.revenue)}</td>
                        <td className="py-2 pr-3 text-right text-cocoa-600">{row.orders}</td>
                        <td className="py-2 pr-3 text-right text-cocoa-600">{inr(row.aov)}</td>
                        <td className="py-2 pr-3 text-right text-cocoa-600">{row.newCustomers}</td>
                        <td className="py-2 text-cocoa-600 truncate max-w-[16rem]">
                          {row.topProduct ? `${row.topProduct.name} · ${inr(row.topProduct.revenue)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {mc && mc.previousFull && (
              <p className="mt-3 text-[11px] text-cocoa-400">
                {mc.previousFull.label} in full: {inr(mc.previousFull.revenue)} from {mc.previousFull.orders} order
                {mc.previousFull.orders === 1 ? "" : "s"}. The comparison above deliberately stops at day {daysElapsed} so a
                part-finished month is not measured against a complete one.
              </p>
            )}
          </div>

          {/* Charts */}
          <div className="grid lg:grid-cols-3 gap-4 mt-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-wine-100 p-5">
              <h3 className="text-sm font-semibold text-cocoa-900 mb-4">Sales trend</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.series}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a44a6f" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#a44a6f" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5e3ea" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => inr(v)} labelStyle={{ color: "#4a3126" }} />
                  <Area type="monotone" dataKey="revenue" stroke="#6d2141" strokeWidth={2} fill="url(#rev)" name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl border border-wine-100 p-5">
              <h3 className="text-sm font-semibold text-cocoa-900 mb-4">Orders by channel</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={Object.entries(data.channels).map(([name, v]) => ({ name: SOURCE_LABELS[name] || name, value: v.revenue }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {Object.entries(data.channels).map((_, i) => (
                      <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => inr(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mt-4">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-wine-100 p-5">
              <h3 className="text-sm font-semibold text-cocoa-900 mb-4">Top products</h3>
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-cocoa-400 py-8 text-center">No sales in this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(220, data.topProducts.length * 34)}>
                  <BarChart data={data.topProducts} layout="vertical" margin={{ left: 40 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} />
                    <Tooltip formatter={(v) => inr(v)} />
                    <Bar dataKey="revenue" fill="#a44a6f" radius={[0, 6, 6, 0]} name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-wine-100 p-5">
              <h3 className="text-sm font-semibold text-cocoa-900 mb-4">Expenses by category</h3>
              {Object.keys(data.expensesByCategory).length === 0 ? (
                <p className="text-sm text-cocoa-400 py-8 text-center">No expenses recorded.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {Object.entries(data.expensesByCategory)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, amt], i) => (
                        <div key={cat} className="flex items-center gap-2 text-sm">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
                          <span className="capitalize text-cocoa-600 flex-1">{cat}</span>
                          <span className="font-medium">{inr(amt)}</span>
                        </div>
                      ))}
                  </div>
                </>
              )}
              <Link to="/admin/expenses" className="block text-xs text-wine-600 hover:underline mt-4">
                Manage expenses →
              </Link>
            </div>
          </div>

          {/* Recent orders */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-cocoa-900">Recent orders</h3>
              <Link to="/admin/orders" className="text-xs text-wine-600 hover:underline">View all →</Link>
            </div>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Customer</Th>
                  <Th>Channel</Th>
                  <Th>Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((o) => (
                  <tr key={o.orderNumber} className="hover:bg-wine-50/50">
                    <Td label="Order">
                      <Link to={`/admin/orders/${o._id}`} className="font-medium text-wine-700 hover:underline">{o.orderNumber}</Link>
                    </Td>
                    <Td label="Customer">{o.customer}</Td>
                    <Td className="text-cocoa-500" label="Channel">{SOURCE_LABELS[o.source] || o.source}</Td>
                    <Td className="font-medium" label="Total">{inr(o.total)}</Td>
                    <Td label="Status">
                      <Badge className={ORDER_STATUS_META[o.status]?.color}>{ORDER_STATUS_META[o.status]?.label || o.status}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </>
      )}
    </div>
  );
}
