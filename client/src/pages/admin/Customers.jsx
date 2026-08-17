import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Search } from "lucide-react";
import api from "../../lib/api";
import { inr, fmtDate } from "../../lib/format";
import { PageHeader, Spinner, Th, Td, TableWrap, EmptyState, Badge, Button, inputCls } from "../../components/admin/ui";

export default function Customers() {
  const [customers, setCustomers] = useState(null);
  const [search, setSearch] = useState("");

  const load = (q = "") =>
    api.get("/customers", { params: q ? { search: q } : {} }).then((r) => setCustomers(r.data.customers)).catch(() => setCustomers([]));

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={customers ? `${customers.length} customer(s)` : ""}
        actions={
          <Button variant="outline" onClick={() => window.open("/api/customers/export.csv", "_blank")}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        }
      />

      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cocoa-400" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setTimeout(() => load(e.target.value), 250);
          }}
          placeholder="Search name, phone, email…"
          className={`${inputCls} pl-10`}
        />
      </div>

      {!customers ? (
        <Spinner />
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-wine-100">
          <EmptyState icon="👥" title="No customers yet" hint="Customers appear automatically when orders come in." />
        </div>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Tags</Th>
              <Th>Source</Th>
              <Th>Orders</Th>
              <Th>Lifetime Value</Th>
              <Th>Outstanding</Th>
              <Th>Last Order</Th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c._id} className="hover:bg-wine-50/50">
                <Td>
                  <Link to={`/admin/customers/${c._id}`} className="font-medium text-wine-700 hover:underline">{c.name}</Link>
                  <div className="text-xs text-cocoa-400">{c.phone}{c.email ? ` · ${c.email}` : ""}</div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {(c.tags || []).slice(0, 3).map((t) => (
                      <Badge key={t} className="bg-wine-50 text-wine-700">{t}</Badge>
                    ))}
                  </div>
                </Td>
                <Td className="text-xs text-cocoa-400 capitalize">{c.leadSource || "—"}</Td>
                <Td className="font-medium">{c.orderCount}</Td>
                <Td className="font-medium">{inr(c.lifetimeValue)}</Td>
                <Td className={c.outstanding > 0 ? "text-rose-700 font-medium" : "text-cocoa-400"}>
                  {c.outstanding > 0 ? inr(c.outstanding) : "—"}
                </Td>
                <Td className="text-xs text-cocoa-400">{c.lastOrderAt ? fmtDate(c.lastOrderAt) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
