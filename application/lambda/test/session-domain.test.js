import test from "node:test";
import assert from "node:assert/strict";
import { minutesBetween, parseLocalDateTime, zonedMidnight } from "../src/domain/time.js";
import { validateSession } from "../src/domain/validation.js";

test("calculates a nine hour session in Asia/Kolkata", () => {
  const start = parseLocalDateTime("2026-10-25T14:00", "Asia/Kolkata");
  const end = parseLocalDateTime("2026-10-25T23:00", "Asia/Kolkata");
  assert.equal(minutesBetween(start, end), 540);
});

test("uses midnight at the end of the work date for fallback", () => {
  const end = zonedMidnight("2026-10-25", "Asia/Kolkata");
  assert.equal(end, "2026-10-25T18:30:00.000Z");
  const start = parseLocalDateTime("2026-10-25T14:00", "Asia/Kolkata");
  assert.equal(minutesBetween(start, end), 600);
});

test("does not report fallback hours as final before fallback processing", () => {
  const result = validateSession({ workDate: "2026-10-25", conversationUrl: "https://chatgpt.com/share/test", clockIn: "2026-10-25T14:00" }, "Asia/Kolkata");
  assert.equal(result.workMinutes, null);
  assert.equal(result.clockOutOrigin, "PENDING_FALLBACK");
});

test("rejects clock out earlier on the same date rather than guessing overnight", () => {
  assert.throws(() => validateSession({ workDate: "2026-10-25", conversationUrl: "https://chatgpt.com/share/test", clockIn: "2026-10-25T22:00", clockOut: "2026-10-25T00:30" }, "Asia/Kolkata"), /after clock-in/);
});

test("requires sprint dates and validates independent sprint duration", () => {
  assert.throws(() => validateSession({ workDate: "2026-10-25", conversationUrl: "https://chatgpt.com/share/test", clockIn: "2026-10-25T14:00", sprintEnabled: true }, "Asia/Kolkata"), /Sprint start and end/);
  const result = validateSession({ workDate: "2026-10-25", conversationUrl: "https://chatgpt.com/share/test", clockIn: "2026-10-25T14:00", clockOut: "2026-10-25T23:00", sprintEnabled: true, sprintClockIn: "2026-10-25T16:00", sprintClockOut: "2026-10-25T18:30" }, "Asia/Kolkata");
  assert.equal(result.sprintMinutes, 150);
});

test("requires clock-in date to match selected work date", () => {
  assert.throws(() => validateSession({ workDate: "2026-10-25", conversationUrl: "https://chatgpt.com/share/test", clockIn: "2026-10-26T00:30" }, "Asia/Kolkata"), /must match/);
});
