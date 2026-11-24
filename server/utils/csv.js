// Excel and Sheets evaluate a cell that begins with = + - @ (or a leading tab or
// carriage return) as a formula. These exports carry customer-supplied text —
// names, notes, delivery addresses — so a customer called
// "=HYPERLINK("http://evil","click")" would run in the owner's spreadsheet.
// A leading apostrophe is the spreadsheet convention for "this is literal text".
const FORMULA_LEAD = /^[=+\-@\t\r]/;

const escapeCell = (value) => {
  if (value == null) return "";
  // Numbers are numbers: -500 must stay a number, not become '−500 text.
  if (typeof value === "number") return String(value);
  let s = String(value);
  if (FORMULA_LEAD.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

