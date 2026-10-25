import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { db, keyFor, secrets, tableName, timezone } from "./aws.js";
import { localParts, minutesBetween, zonedMidnight } from "./domain/time.js";

const secretCache = new Map();
const LEASE_SECONDS = 300;
const RETENTION_DAYS = Number(process.env.SESSION_RETENTION_DAYS || 365);
const retentionEpoch = () => Math.floor(Date.now() / 1000) + RETENTION_DAYS * 86400;

async function secretValue(arn) {
  const cached = secretCache.get(arn);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const result = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!result.SecretString) throw new Error("Required integration secret is empty.");
  let value = result.SecretString;
  try { const parsed = JSON.parse(value); value = parsed.apiKey || parsed.webhookUrl || parsed.value || value; } catch { /* plain text secret */ }
  secretCache.set(arn, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
  return value;
}

const key = (session) => keyFor(session.userSub, session.workDate);
function safeLog(event, session, extra = {}) {
  console.log(JSON.stringify({ event, sessionId: session.workDate, userId: session.userSub, ...extra }));
}

async function readSession(userSub, workDate) {
  const result = await db.send(new GetCommand({ TableName: tableName, Key: keyFor(userSub, workDate), ConsistentRead: true }));
  return result.Item ? { ...result.Item, userSub } : undefined;
}

async function queryStatus(status) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await db.send(new QueryCommand({ TableName: tableName, IndexName: "status-due-index",
      KeyConditionExpression: "GSI1PK = :status", ExpressionAttributeValues: { ":status": `STATUS#${status}` },
      ExclusiveStartKey }));
    items.push(...(result.Items || [])); ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function eligibleFallbackSessions() {
  const now = Date.now();
  const p = localParts(now, timezone);
  const today = `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}`;
  const candidates = [...await queryStatus("READY"), ...await queryStatus("SCHEDULED"), ...await queryStatus("RETRY_PENDING"), ...await queryStatus("FAILED")];
  return candidates.filter((s) => s.workDate < today && s.clockIn && s.deliveryStatus !== "DELIVERED"
    && s.deliveryStatus !== "DELIVERY_UNKNOWN" && (s.attemptCount || 0) < 3
    && (!s.clockOut || Date.parse(s.clockOut) <= now))
    .map((s) => ({ ...s, userSub: s.userSub || s.PK.slice("USER#".length) }));
}

async function acquire(session, expectedScheduleVersion) {
  const now = new Date(); const leaseUntil = new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString();
  const names = { "#status": "status" };
  const values = { ":processing": "PROCESSING", ":lease": leaseUntil, ":now": now.toISOString(), ":one": 1,
    ":ready": "READY", ":scheduled": "SCHEDULED", ":retry": "RETRY_PENDING", ":failed": "FAILED", ":delivered": "DELIVERED", ":unknown": "DELIVERY_UNKNOWN", ":expectedVersion": session.version };
  let condition = "( #status = :ready OR #status = :scheduled OR #status = :retry OR #status = :failed OR ((#status = :processing OR #status = :delivering) AND leaseUntil < :now) ) AND (attribute_not_exists(deliveryStatus) OR (deliveryStatus <> :delivered AND deliveryStatus <> :unknown)) AND version = :expectedVersion";
  if (expectedScheduleVersion !== undefined) { condition += " AND scheduleVersion = :scheduleVersion"; values[":scheduleVersion"] = expectedScheduleVersion; }
  try {
    const result = await db.send(new UpdateCommand({ TableName: tableName, Key: key(session),
      UpdateExpression: "SET #status = :processing, GSI1PK = :statusIndex, leaseUntil = :lease, updatedAt = :now REMOVE expiresAt ADD attemptCount :one",
      ConditionExpression: condition, ExpressionAttributeNames: names,
      ExpressionAttributeValues: { ...values, ":statusIndex": "STATUS#PROCESSING" }, ReturnValues: "ALL_NEW" }));
    return result.Attributes;
  } catch (error) { if (error.name === "ConditionalCheckFailedException") return null; throw error; }
}

async function patchSession(session, updateExpression, values, names = {}) {
  await db.send(new UpdateCommand({ TableName: tableName, Key: key(session), UpdateExpression: updateExpression,
    ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}), ExpressionAttributeValues: values,
    ConditionExpression: "version = :version", }));
}

async function markFailure(session, status, category) {
  try {
    await patchSession(session, "SET #status = :status, GSI1PK = :gsi, lastErrorCategory = :category, lastErrorAt = :now, updatedAt = :now, expiresAt = :expires REMOVE leaseUntil",
      { ":status": status, ":gsi": `STATUS#${status}`, ":category": category, ":now": new Date().toISOString(), ":expires": retentionEpoch(), ":version": session.version }, { "#status": "status" });
  } catch (error) { safeLog("failure_state_write_failed", session, { errorName: error.name }); }
}

function buildPrompt(session) {
  const durationHours = (session.workMinutes / 60).toFixed(2);
  const sprint = session.sprintEnabled && Number.isFinite(session.sprintMinutes)
    ? `Sprint time: ${(session.sprintMinutes / 60).toFixed(2)} hours.` : "Do not mention sprint time.";
  return `You are an expert DevOps work-update assistant. Create a concise professional update based only on verified work completed in the supplied transcript. Do not invent, imply unfinished work was completed, or include personal conversations, learning/theory, interview preparation, or unrelated discussion. Write exactly three paragraphs. Do not use the words today or yesterday. Do not add a blocker section when no blocker appears in the transcript. Do not use markdown. Include working duration (${durationHours} hours) and, only when provided, sprint duration. A ticket/work item reference may help identify context, but mention it only when its work is confirmed by the transcript. Return only JSON in the form {"todayUpdate":"paragraph 1\\n\\nparagraph 2\\n\\nparagraph 3"}.\n\n${sprint}\n\nTicket/work item: ${session.ticketReference || "not supplied"}\n\nTranscript:\n${session.conversationText}`;
}

async function generateReport(session) {
  const apiKey = await secretValue(process.env.GEMINI_SECRET_ARN);
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 45000);
    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", signal: controller.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(session) }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } })
      });
    } catch (error) {
      clearTimeout(timer);
      if (attempt < 2 && (error.name === "AbortError" || error.cause?.code === "ECONNRESET")) { await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); continue; }
      throw Object.assign(new Error("Gemini request failed."), { category: "GEMINI_NETWORK" });
    }
    clearTimeout(timer);
    if (!response.ok) {
      const retry = response.status === 429 || response.status >= 500;
      if (retry && attempt < 2) { await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); continue; }
      throw Object.assign(new Error(`Gemini request rejected (${response.status}).`), { category: response.status === 429 ? "GEMINI_RATE_LIMIT" : "GEMINI_API" });
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) throw Object.assign(new Error("Gemini returned an empty response."), { category: "GEMINI_EMPTY" });
    let parsed; try { parsed = JSON.parse(text); } catch { throw Object.assign(new Error("Gemini returned invalid JSON."), { category: "GEMINI_INVALID_RESPONSE" }); }
    const report = parsed.todayUpdate;
    if (typeof report !== "string" || !report.trim()) throw Object.assign(new Error("Gemini returned empty report content."), { category: "GEMINI_EMPTY" });
    const cleanReport = report.trim();
    const paragraphs = cleanReport.split(/\n\s*\n/).filter(Boolean);
    if (paragraphs.length !== 3 || /\b(today|yesterday)\b/i.test(cleanReport)) {
      throw Object.assign(new Error("Gemini response did not follow the reporting format."), { category: "GEMINI_INVALID_REPORT" });
    }
    return cleanReport;
  }
  throw Object.assign(new Error("Gemini retries exhausted."), { category: "GEMINI_RETRIES" });
}

async function deliver(session, report) {
  const webhook = await secretValue(process.env.TEAMS_SECRET_ARN);
  const attemptId = randomUUID();
  // Persist uncertainty before the external side effect. If invocation state is lost after Teams accepts,
  // automatic recovery sees DELIVERY_UNKNOWN and never blindly sends a duplicate.
  await patchSession(session, "SET deliveryStatus = :unknown, deliveryAttemptId = :attempt, reportId = :reportId, updatedAt = :now",
    { ":unknown": "DELIVERY_UNKNOWN", ":attempt": attemptId, ":reportId": session.idempotencyKey, ":now": new Date().toISOString(), ":version": session.version });
  let result;
  try {
    result = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: report }), signal: AbortSignal.timeout(20000) });
  } catch (error) {
    throw Object.assign(new Error("Teams delivery outcome is unknown; automatic retry is disabled."), { category: "TEAMS_DELIVERY_UNKNOWN" });
  }
  if (!result.ok) {
    const category = result.status >= 500 || result.status === 429 ? "TEAMS_DELIVERY_UNKNOWN" : "TEAMS_REJECTED";
    throw Object.assign(new Error(`Teams delivery returned HTTP ${result.status}.`), { category });
  }
  await patchSession(session, "SET deliveryStatus = :delivered, #status = :completed, GSI1PK = :gsi, completedAt = :now, updatedAt = :now, expiresAt = :expires REMOVE leaseUntil, lastErrorCategory, lastErrorAt",
    { ":delivered": "DELIVERED", ":completed": "COMPLETED", ":gsi": "STATUS#COMPLETED", ":now": new Date().toISOString(), ":expires": retentionEpoch(), ":version": session.version }, { "#status": "status" });
}

async function processOne(candidate, trigger, expectedVersion) {
  const current = await readSession(candidate.userSub, candidate.workDate);
  if (!current) return;
  if (trigger === "clockout" && current.scheduleVersion !== expectedVersion) { safeLog("stale_schedule_ignored", current); return; }
  if (current.deliveryStatus === "DELIVERED" || current.deliveryStatus === "DELIVERY_UNKNOWN") { safeLog("delivery_already_resolved_or_ambiguous", current); return; }
  if (!current.clockIn) { safeLog("missing_clock_in_skipped", current); return; }
  const end = current.clockOut || zonedMidnight(current.workDate, timezone);
  if (Date.parse(end) > Date.now()) { safeLog("not_due_yet", current); return; }
  if (!current.conversationText?.trim()) {
    await markFailure(current, "FAILED", "CONVERSATION_CONTENT_REQUIRED");
    safeLog("transcript_required", current); return;
  }
  const locked = await acquire(current, trigger === "clockout" ? expectedVersion : undefined);
  if (!locked) { safeLog("session_lock_not_acquired", current); return; }
  const workMinutes = minutesBetween(locked.clockIn, end);
  const effective = { ...locked, effectiveClockOut: end, clockOutOrigin: locked.clockOut ? "USER" : "FALLBACK_MIDNIGHT", workMinutes,
    userSub: candidate.userSub, workDate: candidate.workDate };
  try {
    await db.send(new UpdateCommand({ TableName: tableName, Key: key(effective),
      UpdateExpression: "SET effectiveClockOut = :end, clockOutOrigin = :origin, workMinutes = :work, generationStatus = :generating, updatedAt = :now",
      ConditionExpression: "version = :version AND #status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":end": end, ":origin": effective.clockOutOrigin, ":work": workMinutes, ":generating": "GENERATING", ":now": new Date().toISOString(), ":version": locked.version, ":status": "PROCESSING" } }));
    const report = locked.generatedReport || await generateReport(effective);
    if (!locked.generatedReport) await patchSession(effective, "SET generatedReport = :report, generationStatus = :generated, updatedAt = :now",
      { ":report": report, ":generated": "GENERATED", ":now": new Date().toISOString(), ":version": locked.version });
    await patchSession(effective, "SET generationStatus = :generated, #status = :delivering, updatedAt = :now",
      { ":generated": "GENERATED", ":delivering": "DELIVERING", ":now": new Date().toISOString(), ":version": locked.version }, { "#status": "status" });
    await deliver(effective, report);
    safeLog("session_completed", effective, { attemptCount: locked.attemptCount });
  } catch (error) {
    const category = error.category || "PROCESSING_ERROR";
    const state = category === "TEAMS_DELIVERY_UNKNOWN" ? "DELIVERY_UNKNOWN" : "FAILED";
    if (category === "TEAMS_REJECTED") {
      try { await patchSession(effective, "SET deliveryStatus = :failed, #status = :status, GSI1PK = :gsi, lastErrorCategory = :category, lastErrorAt = :now, updatedAt = :now, expiresAt = :expires REMOVE leaseUntil",
        { ":failed": "FAILED", ":status": "FAILED", ":gsi": "STATUS#FAILED", ":category": category, ":now": new Date().toISOString(), ":expires": retentionEpoch(), ":version": effective.version }, { "#status": "status" }); }
      catch (stateError) { safeLog("failure_state_write_failed", effective, { errorName: stateError.name }); }
    }
    else if (category !== "TEAMS_DELIVERY_UNKNOWN") await markFailure(effective, state, category);
    else {
      try { await patchSession(effective, "SET deliveryStatus = :unknown, #status = :failed, GSI1PK = :gsi, lastErrorCategory = :category, lastErrorAt = :now, updatedAt = :now REMOVE leaseUntil",
        { ":unknown": "DELIVERY_UNKNOWN", ":failed": "FAILED", ":gsi": "STATUS#FAILED", ":category": category, ":now": new Date().toISOString(), ":version": effective.version }, { "#status": "status" }); }
      catch (stateError) { safeLog("ambiguous_delivery_state_write_failed", effective, { errorName: stateError.name }); }
    }
    safeLog("session_processing_failed", effective, { category, errorName: error.name || "Error" });
  }
}

export async function handler(event) {
  const trigger = event?.trigger;
  if (trigger === "fallback") {
    for (const session of await eligibleFallbackSessions()) await processOne(session, "fallback");
    return { processed: true };
  }
  if (!event?.userSub || !event?.workDate) {
    console.error(JSON.stringify({ event: "invalid_processor_event" }));
    return { processed: false, reason: "invalid_event" };
  }
  const session = await readSession(event.userSub, event.workDate);
  if (!session) return { processed: false, reason: "missing_session" };
  await processOne({ ...session, userSub: event.userSub }, trigger, event.scheduleVersion);
  return { processed: true };
}
