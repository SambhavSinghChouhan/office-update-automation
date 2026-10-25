const formatterCache = new Map();

function formatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }));
  }
  return formatterCache.get(timeZone);
}

export function localParts(epochMs, timeZone) {
  return Object.fromEntries(formatter(timeZone).formatToParts(new Date(epochMs))
    .filter(({ type }) => type !== "literal").map(({ type, value }) => [type, Number(value)]));
}

// Parse a browser datetime-local value as a wall-clock time in the selected IANA zone.
export function parseLocalDateTime(value, timeZone) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("Use a full date and time in YYYY-MM-DDTHH:mm format.");
  }
  const [date, clock] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = clock.split(":").map(Number);
  const nominal = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(nominal).toISOString().slice(0, 16) !== value) throw new Error("Invalid date or time.");
  let candidate = nominal;
  for (let i = 0; i < 4; i++) {
    const p = localParts(candidate, timeZone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = desired - represented;
    candidate += delta;
    if (!delta) break;
  }
  const verified = localParts(candidate, timeZone);
  if (verified.year !== year || verified.month !== month || verified.day !== day || verified.hour !== hour || verified.minute !== minute) {
    throw new Error("This local time does not exist in the selected timezone because of a clock change.");
  }
  return new Date(candidate).toISOString();
}

export function zonedMidnight(workDate, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) throw new Error("Invalid work date.");
  const next = new Date(`${workDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDate = next.toISOString().slice(0, 10);
  return parseLocalDateTime(`${nextDate}T00:00`, timeZone);
}

export function minutesBetween(start, end) {
  const elapsed = (Date.parse(end) - Date.parse(start)) / 60000;
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error("End time must be after start time.");
  return Math.round(elapsed);
}

export function displayLocal(iso, timeZone) {
  if (!iso) return "";
  const p = localParts(Date.parse(iso), timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
