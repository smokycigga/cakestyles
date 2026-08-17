// All reporting boundaries use Asia/Kolkata regardless of server timezone (PRD §22.9).
const IST = "Asia/Kolkata";

export const istDateString = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    typeof date === "string" ? new Date(date) : date
  );

// Convert an IST calendar date "YYYY-MM-DD" + optional time to a UTC instant.
export const istToUtc = (dateStr, time = "00:00") => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  // IST is UTC+5:30 with no DST.
  return new Date(Date.UTC(y, m - 1, d, hh - 5, mm - 30, 0));
};

export const startOfIstDay = (dateStr) => istToUtc(dateStr, "00:00");

export const endOfIstDay = (dateStr) => istToUtc(dateStr, "23:59");

// Adds N IST calendar days to a "YYYY-MM-DD" string.
export const addDaysIst = (dateStr, n) => {
  const base = istToUtc(dateStr, "12:00");
  base.setUTCDate(base.getUTCDate() + n);
  return istDateString(base);
};

// Resolves dashboard/report presets to an exact UTC range.
export const resolveRange = (query = {}) => {
  const today = istDateString();
  const startOfQuarter = () => {
    const [y, m] = today.split("-").map(Number);
    const qMonth = Math.floor((m - 1) / 3) * 3 + 1;
    return `${y}-${String(qMonth).padStart(2, "0")}-01`;
  };
  const startOfMonth = () => `${today.slice(0, 7)}-01`;
  const prevMonth = () => {
    const [y, m] = today.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return istDateString(d).slice(0, 7);
  };

  switch (query.range) {
    case "today":
      return { from: startOfIstDay(today), to: endOfIstDay(today) };
    case "yesterday": {
      const y = addDaysIst(today, -1);
      return { from: startOfIstDay(y), to: endOfIstDay(y) };
    }
    case "7d":
      return { from: startOfIstDay(addDaysIst(today, -6)), to: endOfIstDay(today) };
    case "30d":
      return { from: startOfIstDay(addDaysIst(today, -29)), to: endOfIstDay(today) };
    case "this_month":
      return { from: startOfIstDay(startOfMonth()), to: endOfIstDay(today) };
    case "last_month": {
      const pm = prevMonth();
      const [y, m] = pm.split("-").map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return { from: startOfIstDay(`${pm}-01`), to: endOfIstDay(`${pm}-${String(last).padStart(2, "0")}`) };
    }
    case "this_quarter":
      return { from: startOfIstDay(startOfQuarter()), to: endOfIstDay(today) };
    default:
      if (query.from && query.to) {
        return { from: startOfIstDay(query.from), to: endOfIstDay(query.to) };
      }
      return { from: startOfIstDay(addDaysIst(today, -29)), to: endOfIstDay(today) };
  }
};
