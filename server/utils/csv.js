const escapeCell = (value) => {
  if (value == null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Minimal RFC-4180 CSV serializer for report exports.
export const toCSV = (rows, columns) => {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCell(typeof c.get === "function" ? c.get(row) : row[c.key])).join(",")
  );
  return [header, ...lines].join("\r\n");
};

export const sendCSV = (res, filename, rows, columns) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(toCSV(rows, columns));
};

