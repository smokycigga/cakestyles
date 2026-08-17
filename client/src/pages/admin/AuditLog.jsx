import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import api from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { PageHeader, Spinner, Th, Td, TableWrap, EmptyState, Badge, inputCls } from "../../components/admin/ui";

const diff = (changes) =>
  (changes || [])
    .map((c) => `${c.field}: ${JSON.stringify(c.old)} → ${JSON.stringify(c.new)}`)
    .join(" · ");

export default function AuditLog() {
  const [logs, setLogs] = useState(null);
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("");

  const load = () => {
    const params = {};
    if (entity) params.entity = entity;
    if (search) params.search = search;
    api.get("/audit", { params }).then((r) => setLogs(r.data.logs)).catch(() => setLogs([]));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Who changed what, when — for financially meaningful actions" />

      <div className="grid sm:grid-cols-2 gap-2 mb-5">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cocoa-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setTimeout(load, 250); }} placeholder="Search action or actor…" className={`${inputCls} pl-10`} />
        </div>
        <select value={entity} onChange={(e) => setEntity(e.target.value)} className={inputCls}>
          <option value="">All entities</option>
          {["Product", "Order", "Invoice", "Expense", "Enquiry", "User", "Setting", "Category"].map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
      </div>

      {!logs ? (
        <Spinner />
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-wine-100">
          <EmptyState icon="🔍" title="No audit entries" />
        </div>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Entity</Th>
              <Th>Changes</Th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log._id} className="hover:bg-wine-50/50">
                <Td className="text-xs text-cocoa-400 whitespace-nowrap">{fmtDateTime(log.createdAt)}</Td>
                <Td className="text-sm font-medium">{log.actor?.name || "system"}</Td>
                <Td><Badge className="bg-wine-50 text-wine-700">{log.action}</Badge></Td>
                <Td className="text-xs text-cocoa-500">{log.entity}</Td>
                <Td className="text-xs text-cocoa-500 max-w-md">
                  {diff(log.changes) || log.meta || "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
