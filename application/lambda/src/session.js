import { DeleteScheduleCommand, CreateScheduleCommand, UpdateScheduleCommand } from "@aws-sdk/client-scheduler";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createHash } from "node:crypto";
import { db, keyFor, scheduleNameFor, scheduler, tableName, timezone } from "./aws.js";
import { response, principal, bodyOf, publicError } from "./http.js";
import { parseLocalDateTime, displayLocal } from "./domain/time.js";
import { validateSession } from "./domain/validation.js";

const groupName = process.env.SCHEDULE_GROUP_NAME;
const schedulerRoleArn = process.env.SCHEDULER_ROLE_ARN;
const processorArn = process.env.REPORT_PROCESSOR_ARN;
const retentionDays = Number(process.env.SESSION_RETENTION_DAYS || 365);
const dueKey = (status) => `STATUS#${status}`;
const dueSort = (date, sub) => `${date}#${sub}`;

function publicSession(item) {
  if (!item) return null;
  return {
    sessionId: item.workDate, workDate: item.workDate,
    ticketReference: item.ticketReference || "",
    conversationUrl: item.conversationUrl, conversationText: item.conversationText || "",
    clockIn: item.clockInLocal, clockOut: item.clockOutLocal || "",
    effectiveClockOut: item.effectiveClockOut || "", clockOutOrigin: item.clockOutOrigin || "",
    timezone: item.timezone || timezone, scheduledExecutionTime: item.scheduledExecutionTime || "",
    sprintEnabled: Boolean(item.sprintEnabled), sprintClockIn: item.sprintClockInLocal || "",
    sprintClockOut: item.sprintClockOutLocal || "", workMinutes: item.workMinutes ?? null,
    sprintMinutes: item.sprintMinutes ?? null, status: item.status,
    generationStatus: item.generationStatus || "PENDING", deliveryStatus: item.deliveryStatus || "PENDING",
    attemptCount: item.attemptCount || 0, lastErrorCategory: item.lastErrorCategory || "",
    lastErrorAt: item.lastErrorAt || "", scheduleError: item.scheduleError || "",
    createdAt: item.createdAt, updatedAt: item.updatedAt, completedAt: item.completedAt || ""
  };
}

async function replaceClockoutSchedule(sub, session) {
  const name = scheduleNameFor(sub, session.workDate);
  if (!session.clockOut) {
    try { await scheduler.send(new DeleteScheduleCommand({ Name: name, GroupName: groupName })); }
    catch (error) { if (error.name !== "ResourceNotFoundException") throw error; }
    return;
  }
  const scheduleAt = session.scheduledExecutionTime || (Date.parse(session.clockOut) <= Date.now() ? new Date(Date.now() + 60_000).toISOString() : session.clockOut);
  const local = displayLocal(scheduleAt, timezone);
  const scheduleExpression = `at(${local}:00)`;
  const input = JSON.stringify({ trigger: "clockout", userSub: sub, workDate: session.workDate, scheduleVersion: session.scheduleVersion });
  const request = {
    Name: name, GroupName: groupName, Description: `Clock-out processing for ${session.workDate}`, ActionAfterCompletion: "DELETE",
    ScheduleExpression: scheduleExpression, ScheduleExpressionTimezone: timezone, State: "ENABLED",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: { Arn: processorArn, RoleArn: schedulerRoleArn, Input: input }
  };
  try { await scheduler.send(new UpdateScheduleCommand(request)); }
  catch (error) {
    if (error.name !== "ResourceNotFoundException") throw error;
    await scheduler.send(new CreateScheduleCommand(request));
  }
}

function idempotency(sub, date) { return createHash("sha256").update(`${sub}#${date}`).digest("hex"); }

async function list(sub) {
  const result = await db.send(new QueryCommand({ TableName: tableName, KeyConditionExpression: "PK = :pk AND begins_with(SK, :session)",
    ExpressionAttributeValues: { ":pk": `USER#${sub}`, ":session": "SESSION#" }, ScanIndexForward: false }));
  return (result.Items || []).map(publicSession);
}

async function get(sub, date) {
  const result = await db.send(new GetCommand({ TableName: tableName, Key: keyFor(sub, date), ConsistentRead: true }));
  return result.Item;
}

async function save(sub, input, existing) {
  let values;
  try { values = validateSession(input, timezone, existing || {}); }
  catch (error) { error.statusCode = error.statusCode || 400; throw error; }
  const now = new Date().toISOString();
  if (existing?.deliveryStatus === "DELIVERED" || existing?.status === "COMPLETED") {
    throw Object.assign(new Error("This report was delivered and is locked. Corrections require a separate correction workflow."), { statusCode: 409 });
  }
  if (existing?.deliveryStatus === "DELIVERY_UNKNOWN") {
    throw Object.assign(new Error("Teams may have accepted this report. Resolve its delivery status before editing or retrying to avoid a duplicate."), { statusCode: 409 });
  }
  const version = (existing?.version || 0) + 1;
  const scheduleVersion = (existing?.scheduleVersion || 0) + 1;
  const status = values.clockOut ? "SCHEDULED" : "READY";
  const scheduledExecutionTime = values.clockOut
    ? (Date.parse(values.clockOut) <= Date.now() ? new Date(Date.now() + 60_000).toISOString() : values.clockOut)
    : "";
  const item = {
    ...(existing || {}), ...keyFor(sub, values.workDate),
    userSub: sub,
    GSI1PK: dueKey(status), GSI1SK: dueSort(values.workDate, sub),
    ...values, status, scheduleVersion, version, timezone, scheduledExecutionTime,
    attemptCount: existing?.status === "FAILED" ? 0 : (existing?.attemptCount || 0),
    idempotencyKey: existing?.idempotencyKey || idempotency(sub, values.workDate),
    generationStatus: "PENDING", deliveryStatus: "PENDING",
    createdAt: existing?.createdAt || now, updatedAt: now,
    lastError: "", lastErrorCategory: "", scheduleError: "", completedAt: ""
  };
  delete item.generatedReport;
  delete item.leaseUntil;
  delete item.expiresAt;
  const condition = existing ? "attribute_exists(PK) AND #version = :oldVersion" : "attribute_not_exists(PK)";
  await db.send(new PutCommand({ TableName: tableName, Item: item,
    ConditionExpression: condition,
    ExpressionAttributeNames: existing ? { "#version": "version" } : undefined,
    ExpressionAttributeValues: existing ? { ":oldVersion": existing.version } : undefined }));
  try { await replaceClockoutSchedule(sub, item); }
  catch (error) {
    await db.send(new UpdateCommand({ TableName: tableName, Key: keyFor(sub, values.workDate),
      UpdateExpression: "SET scheduleError = :err, updatedAt = :now",
      ConditionExpression: "scheduleVersion = :version",
      ExpressionAttributeValues: { ":err": "Unable to update scheduled execution.", ":now": new Date().toISOString(), ":version": scheduleVersion } }));
    console.error(JSON.stringify({ event: "schedule_update_failed", sessionId: values.workDate, errorName: error.name }));
    throw Object.assign(new Error("Session saved, but scheduling failed. Save again or contact support."), { statusCode: 503 });
  }
  return item;
}

export async function handler(event) {
  try {
    const sub = principal(event);
    const method = event.requestContext?.http?.method || event.httpMethod;
    const path = event.rawPath || event.path || "";
    const sessionId = event.pathParameters?.sessionId;
    if (method === "GET" && path.endsWith("/sessions")) return response(200, { sessions: await list(sub), timezone });
    if (method === "POST" && path.endsWith("/sessions")) {
      const input = bodyOf(event); const existing = await get(sub, input.workDate);
      return response(existing ? 200 : 201, { session: publicSession(await save(sub, input, existing)), timezone });
    }
    if (method === "GET" && sessionId) return response(200, { session: publicSession(await get(sub, sessionId)), timezone });
    if (method === "PUT" && sessionId) {
      const existing = await get(sub, sessionId);
      if (!existing) return response(404, { error: "Session not found." });
      const input = { ...bodyOf(event), workDate: sessionId };
      return response(200, { session: publicSession(await save(sub, input, existing)), timezone });
    }
    if (method === "POST" && sessionId && path.endsWith("/confirm-delivered")) {
      const existing = await get(sub, sessionId);
      if (!existing) return response(404, { error: "Session not found." });
      if (existing.deliveryStatus === "DELIVERED") return response(200, { session: publicSession(existing), message: "Delivery was already recorded." });
      if (existing.deliveryStatus !== "DELIVERY_UNKNOWN") return response(409, { error: "This session does not have an ambiguous delivery to resolve." });
      const confirmation = bodyOf(event);
      if (confirmation.confirmDelivered !== true) return response(400, { error: "Confirm that you verified the Teams message before recording delivery." });
      const now = new Date().toISOString();
      const result = await db.send(new UpdateCommand({ TableName: tableName, Key: keyFor(sub, sessionId),
        UpdateExpression: "SET #status = :completed, GSI1PK = :gsi, deliveryStatus = :delivered, completedAt = :now, updatedAt = :now, expiresAt = :expires, version = :version REMOVE leaseUntil, lastErrorCategory, lastErrorAt",
        ConditionExpression: "version = :oldVersion AND deliveryStatus = :unknown",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":completed": "COMPLETED", ":gsi": dueKey("COMPLETED"), ":delivered": "DELIVERED", ":now": now, ":expires": Math.floor(Date.now() / 1000) + retentionDays * 86400, ":version": existing.version + 1, ":oldVersion": existing.version, ":unknown": "DELIVERY_UNKNOWN" }, ReturnValues: "ALL_NEW" }));
      return response(200, { session: publicSession(result.Attributes), message: "Delivery marked completed after your confirmation." });
    }
    if (method === "POST" && sessionId && path.endsWith("/retry")) {
      const existing = await get(sub, sessionId);
      if (!existing) return response(404, { error: "Session not found." });
      if (existing.deliveryStatus === "DELIVERED") return response(409, { error: "This report was already delivered." });
      const retryInput = bodyOf(event);
      const ambiguous = existing.deliveryStatus === "DELIVERY_UNKNOWN";
      if (ambiguous && retryInput.confirmPossibleDuplicate !== true) return response(409, { error: "Teams may already have accepted this report. Confirm that you accept a possible duplicate before retrying." });
      if (!ambiguous && existing.status !== "FAILED") return response(409, { error: "Only a failed session can be manually retried." });
      if (!existing.conversationText) return response(409, { error: "Paste the conversation transcript before retrying." });
      const version = existing.version + 1;
      const scheduledExecutionTime = new Date(Date.now() + 60000).toISOString();
      const updated = await db.send(new UpdateCommand({ TableName: tableName, Key: keyFor(sub, sessionId),
        UpdateExpression: "SET #status = :status, GSI1PK = :gsi, deliveryStatus = :pending, scheduledExecutionTime = :scheduledAt, version = :version, scheduleVersion = scheduleVersion + :one, updatedAt = :now REMOVE lastErrorCategory, lastErrorAt, leaseUntil, scheduleError",
        ConditionExpression: ambiguous ? "#status = :failed AND deliveryStatus = :unknown AND version = :old" : "#status = :failed AND deliveryStatus <> :delivered AND deliveryStatus <> :unknown AND version = :old",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": "READY", ":gsi": dueKey("READY"), ":pending": "PENDING", ":scheduledAt": scheduledExecutionTime, ":version": version, ":one": 1, ":now": new Date().toISOString(), ":failed": "FAILED", ":delivered": "DELIVERED", ":unknown": "DELIVERY_UNKNOWN", ":old": existing.version }, ReturnValues: "ALL_NEW" }));
      const item = updated.Attributes;
      try { await replaceClockoutSchedule(sub, { ...item, clockOut: scheduledExecutionTime, scheduledExecutionTime }); }
      catch (error) {
        await db.send(new UpdateCommand({ TableName: tableName, Key: keyFor(sub, sessionId),
          UpdateExpression: "SET scheduleError = :err, updatedAt = :now",
          ConditionExpression: "version = :version",
          ExpressionAttributeValues: { ":err": "Unable to update retry schedule.", ":now": new Date().toISOString(), ":version": version } }));
        console.error(JSON.stringify({ event: "retry_schedule_failed", sessionId, errorName: error.name }));
        throw Object.assign(new Error("Retry was recorded, but its schedule could not be created. Retry again later."), { statusCode: 503 });
      }
      return response(202, { session: publicSession(item), message: ambiguous ? "Explicit retry scheduled; a duplicate Teams post is possible." : "Retry scheduled." });
    }
    return response(404, { error: "Route not found." });
  } catch (error) {
    console.error(JSON.stringify({ event: "session_api_error", errorName: error.name || "Error", statusCode: error.statusCode || 500 }));
    return publicError(error);
  }
}
