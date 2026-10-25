import { minutesBetween, parseLocalDateTime, zonedMidnight } from "./time.js";

export function validateSession(input, timezone, existing = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Request body must be a JSON object.");
  const workDate = input.workDate ?? existing.workDate;
  if (typeof workDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) throw new Error("workDate is required in YYYY-MM-DD format.");
  const conversationUrl = input.conversationUrl ?? existing.conversationUrl ?? "";
  if (!conversationUrl) throw new Error("ChatGPT conversation URL is required.");
  if (conversationUrl) {
    let url;
    try { url = new URL(conversationUrl); } catch { throw new Error("Conversation URL must be a valid HTTPS URL."); }
    if (url.protocol !== "https:" || !["chatgpt.com", "chat.openai.com"].includes(url.hostname)) throw new Error("Conversation URL must be an HTTPS ChatGPT URL.");
  }
  const conversationText = input.conversationText ?? existing.conversationText ?? "";
  if (typeof conversationText !== "string" || conversationText.length > 100000 || Buffer.byteLength(conversationText, "utf8") > 250000) throw new Error("Transcript must be text under 100,000 characters and 250 KB.");
  const ticketReference = input.ticketReference ?? existing.ticketReference ?? "";
  if (typeof ticketReference !== "string" || ticketReference.length > 200) throw new Error("Ticket or work item must be text under 200 characters.");
  const clockIn = parseLocalDateTime(input.clockIn ?? existing.clockInLocal, timezone);
  const clockInLocal = input.clockIn ?? existing.clockInLocal;
  if (clockInLocal.slice(0, 10) !== workDate) throw new Error("Clock-in date must match the selected work date.");
  const clockOutLocal = input.clockOut === undefined ? (existing.clockOutLocal ?? "") : input.clockOut;
  const clockOut = clockOutLocal ? parseLocalDateTime(clockOutLocal, timezone) : "";
  if (clockOut && Date.parse(clockOut) <= Date.parse(clockIn)) throw new Error("Clock-out must be after clock-in; select the correct calendar date for overnight work.");
  const effectiveClockOut = clockOut || zonedMidnight(workDate, timezone);
  const sprintEnabled = input.sprintEnabled === undefined ? Boolean(existing.sprintEnabled) : input.sprintEnabled === true;
  let sprintClockIn = "", sprintClockOut = "", sprintMinutes = null;
  if (sprintEnabled) {
    const si = input.sprintClockIn ?? existing.sprintClockInLocal;
    const so = input.sprintClockOut ?? existing.sprintClockOutLocal;
    if (!si || !so) throw new Error("Sprint start and end are required when sprint tracking is enabled.");
    sprintClockIn = parseLocalDateTime(si, timezone);
    sprintClockOut = parseLocalDateTime(so, timezone);
    if (Date.parse(sprintClockIn) < Date.parse(clockIn) || Date.parse(sprintClockOut) > Date.parse(effectiveClockOut)) throw new Error("Sprint times must be within the work session.");
    sprintMinutes = minutesBetween(sprintClockIn, sprintClockOut);
  }
  const workMinutes = clockOut ? minutesBetween(clockIn, clockOut) : null;
  return {
    workDate, conversationUrl, conversationText, ticketReference: ticketReference.trim(), clockIn, clockInLocal,
    clockOut, clockOutLocal, effectiveClockOut: clockOut ? clockOut : "", clockOutOrigin: clockOut ? "USER" : "PENDING_FALLBACK",
    sprintEnabled, sprintClockIn, sprintClockInLocal: sprintEnabled ? (input.sprintClockIn ?? existing.sprintClockInLocal) : "",
    sprintClockOut, sprintClockOutLocal: sprintEnabled ? (input.sprintClockOut ?? existing.sprintClockOutLocal) : "",
    workMinutes, sprintMinutes
  };
}
