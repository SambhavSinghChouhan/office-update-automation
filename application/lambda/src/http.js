export function response(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(body) };
}

export function principal(event) {
  const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (!sub) throw Object.assign(new Error("Authentication required."), { statusCode: 401 });
  return sub;
}

export function bodyOf(event) {
  try { return JSON.parse(event.body || "{}"); } catch { throw Object.assign(new Error("Request body must contain valid JSON."), { statusCode: 400 }); }
}

export function publicError(error) {
  const statusCode = error.statusCode || (error.name === "ConditionalCheckFailedException" ? 409 : 500);
  return response(statusCode, { error: statusCode >= 500 ? "Request failed." : error.message });
}
