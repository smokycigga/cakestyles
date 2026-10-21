import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import toast from "react-hot-toast";
import api, { downloadFile, errMsg } from "../../lib/api";
import { Button, PageHeader, inputCls } from "../../components/admin/ui";
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
  ["all", "All time"],
  ["custom", "Custom range"],
];

// Same slug the server uses for Content-Disposition, so the file a browser
// saves under (the client's download attribute wins) still names the customer.
const slugify = (text) =>
  String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "customer";

export default function Reports() {
  const { can } = useAuth();
  const [range, setRange] = useState("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState("");
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [busyStatement, setBusyStatement] = useState(false);

  // Only read for the statement card, which needs analytics:read to download —
  // always a permission held alongside customers:read, so this never 403s.
  useEffect(() => {
    api.get("/customers").then((r) => setCustomers(r.data.customers)).catch(() => {});
  }, []);

  const query = () => {
    const params = new URLSearchParams();
    if (range === "custom" && from && to) {
      params.set("from", from);
      params.set("to", to);
    } else if (range !== "custom") {
      params.set("range", range);
    }
    return params.toString();
  };

  // A plain <a href> cannot carry the Authorization header, so every one of
  // these buttons used to open a tab reading {"message":"Not authenticated"}.
  // downloadFile pulls the CSV through the authenticated client instead.
  const download = async (key) => {
    setBusy(key);
    try {
      await downloadFile(`/reports/${key}.csv?${query()}`, `cakestyles-${key}.csv`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy("");
    }
  };

  const downloadStatement = async () => {
    const customer = customers.find((c) => c._id === customerId);
    const params = new URLSearchParams(query());
    params.set("customerId", customerId);

    setBusyStatement(true);
    try {
      await downloadFile(
        `/reports/customer-statement.csv?${params.toString()}`,
        `cakestyles-statement-${slugify(customer?.name)}.csv`
      );
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusyStatement(false);
    }
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
        {REPORTS.filter((r) => can(r.perm)).map((r) => (
          <div key={r.key} className="bg-white rounded-2xl border border-wine-100 p-5 flex flex-col">
            <h3 className="font-medium text-cocoa-900">{r.label}</h3>
            <p className="text-sm text-cocoa-500 mt-1.5 leading-relaxed flex-1">{r.desc}</p>
            <Button className="mt-4 py-2.5" disabled={busy === r.key} onClick={() => download(r.key)}>
              <Download className="w-4 h-4" /> {busy === r.key ? "Preparing…" : "Download CSV"}
            </Button>
          </div>
        ))}

        {/* Asking for "the excel for one customer" is a different question from
            the all-customers export, so it gets its own picker instead of
            filtering a list someone then has to scroll. */}
        {can("analytics:read") && (
          <div className="bg-white rounded-2xl border border-wine-100 p-5 flex flex-col">
            <h3 className="font-medium text-cocoa-900">Customer Statement</h3>
            <p className="text-sm text-cocoa-500 mt-1.5 leading-relaxed flex-1">
              One customer's orders and standalone invoices, oldest first — with what they paid and what is still due.
            </p>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className={`${inputCls} mt-3`}
            >
              <option value="">Choose a customer…</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>{c.name} · {c.phone}</option>
              ))}
            </select>
            <Button className="mt-4 py-2.5" disabled={!customerId || busyStatement} onClick={downloadStatement}>
              <Download className="w-4 h-4" /> {busyStatement ? "Preparing…" : "Download statement"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
