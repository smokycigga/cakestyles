import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "../../components/admin/ui";
import { useAuth } from "../../store/AuthContext";

const REPORTS = [
  { key: "sales", label: "Sales Report", desc: "Every order with customer, channel, status, payment and totals.", perm: "analytics:read" },
  { key: "products", label: "Product Sales", desc: "Revenue, units, orders and average price by product.", perm: "analytics:read" },
  { key: "customers", label: "Customer Report", desc: "All customers with tags, source and consent status.", perm: "customers:read" },
  { key: "outstanding", label: "Outstanding Invoices", desc: "Unpaid and partially paid invoices with balances.", perm: "finance:read" },
  { key: "expenses", label: "Expense Report", desc: "All expenses with category, vendor and method.", perm: "expenses:read" },
  { key: "profitability", label: "Profitability Summary", desc: "Sales less recorded expenses for the period.", perm: "analytics:read" },
];

const RANGES = [
  ["30d", "Last 30 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["this_quarter", "This quarter"],
  ["custom", "Custom range"],
];

export default function Reports() {
  const { can } = useAuth();
  const [range, setRange] = useState("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const url = (key) => {
    const params = new URLSearchParams();
    if (range === "custom" && from && to) {
      params.set("from", from);
      params.set("to", to);
    } else if (range !== "custom") {
      params.set("range", range);
    }
    return `/api/reports/${key}.csv?${params}`;
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="CSV exports with date filters — open in Excel or Google Sheets"
        actions={
          <>
            <select value={range} onChange={(e) => setRange(e.target.value)} className="border border-wine-100 rounded-xl px-3 py-2 text-sm bg-white">
              {RANGES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            {range === "custom" && (
              <>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-wine-100 rounded-xl px-3 py-2 text-sm bg-white" />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-wine-100 rounded-xl px-3 py-2 text-sm bg-white" />
              </>
            )}
          </>
        }
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.filter((r) => can(r.perm) || r.perm === "customers:read").map((r) => (
          <div key={r.key} className="bg-white rounded-2xl border border-wine-100 p-5 flex flex-col">
            <h3 className="font-medium text-cocoa-900">{r.label}</h3>
            <p className="text-sm text-cocoa-500 mt-1.5 leading-relaxed flex-1">{r.desc}</p>
            <a
              href={url(r.key)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center justify-center gap-2 bg-wine-700 hover:bg-wine-800 text-white font-medium text-sm px-4 py-2.5 rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" /> Download CSV
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
