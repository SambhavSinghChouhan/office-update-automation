import { apiRequest } from "./api.js";

const config = window.APP_CONFIG || {};
const tokenKey = "workUpdateIdToken";
const expiryKey = "workUpdateTokenExpiry";
const verifierKey = "workUpdatePkceVerifier";
const stateKey = "workUpdateOAuthState";
const $ = (id) => document.getElementById(id);

function showNotice(message, error = false) {
  const node = $("notice"); node.textContent = message; node.classList.remove("hidden", "error");
  if (error) node.classList.add("error");
}
function clearNotice() { $("notice").classList.add("hidden"); }
function token() {
  if (Number(sessionStorage.getItem(expiryKey) || 0) <= Date.now()) { sessionStorage.removeItem(tokenKey); return ""; }
  return sessionStorage.getItem(tokenKey) || "";
}
function base64url(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
async function sha256(value) { return base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
function redirectUri() { return `${location.origin}${location.pathname}`; }
function configured() { return Boolean(config.apiBaseUrl && config.cognitoClientId && config.cognitoDomain); }

async function signIn() {
  if (!configured()) { showNotice("AWS frontend settings are not configured yet. Deploy the API and Cognito resources, then publish their public outputs in js/config.js.", true); return; }
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  sessionStorage.setItem(verifierKey, verifier); sessionStorage.setItem(stateKey, state);
  const url = new URL(`${config.cognitoDomain.replace(/\/$/,"")}/oauth2/authorize`);
  url.search = new URLSearchParams({ client_id: config.cognitoClientId, response_type: "code", scope: "openid email profile", redirect_uri: redirectUri(), state, code_challenge: await sha256(verifier), code_challenge_method: "S256" });
  location.assign(url);
}

async function completeSignIn() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return;
  if (params.get("state") !== sessionStorage.getItem(stateKey)) throw new Error("Sign-in state validation failed. Please sign in again.");
  const body = new URLSearchParams({ grant_type: "authorization_code", client_id: config.cognitoClientId, code, redirect_uri: redirectUri(), code_verifier: sessionStorage.getItem(verifierKey) || "" });
  const result = await fetch(`${config.cognitoDomain.replace(/\/$/,"")}/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!result.ok) throw new Error("Cognito sign-in could not be completed. Please sign in again.");
  const auth = await result.json();
  sessionStorage.setItem(tokenKey, auth.id_token); sessionStorage.setItem(expiryKey, String(Date.now() + Math.max(0, auth.expires_in - 30) * 1000));
  sessionStorage.removeItem(stateKey); sessionStorage.removeItem(verifierKey);
  history.replaceState({}, document.title, redirectUri());
}

function signOut() {
  sessionStorage.removeItem(tokenKey); sessionStorage.removeItem(expiryKey);
  if (configured()) {
    const url = new URL(`${config.cognitoDomain.replace(/\/$/,"")}/logout`);
    url.search = new URLSearchParams({ client_id: config.cognitoClientId, logout_uri: redirectUri() });
    location.assign(url);
  } else location.reload();
}

function localDateNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone || "Asia/Kolkata", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type,x.value])); return `${p.year}-${p.month}-${p.day}`;
}
function nowForDate(date) {
  const formatted = new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone || "Asia/Kolkata", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).format(new Date());
  return `${date}T${formatted}`;
}

function statusText(session) {
  if (!session) return "No session saved";
  if (session.deliveryStatus === "DELIVERY_UNKNOWN") return "Teams delivery outcome unknown; automatic resend is blocked";
  if (session.lastErrorCategory === "CONVERSATION_CONTENT_REQUIRED") return "Transcript required before report generation";
  return session.status || "READY";
}
function formatScheduled(iso) {
  if (!iso) return "Fallback at 00:30";
  return new Intl.DateTimeFormat(undefined, { timeZone: config.timezone || "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
function renderStatus(session) {
  const status = session?.status || "DRAFT";
  $("sessionStatus").textContent = statusText(session);
  $("sessionStatus").dataset.state = status;
  $("sessionStatus").dataset.deliveryStatus = session?.deliveryStatus || "";
  $("retryBtn").classList.toggle("hidden", !session || (status !== "FAILED" && session.deliveryStatus !== "DELIVERY_UNKNOWN") || session.deliveryStatus === "DELIVERED");
  $("retryBtn").textContent = session?.deliveryStatus === "DELIVERY_UNKNOWN" ? "Retry anyway (may duplicate)" : "Retry processing";
  $("confirmDeliveredBtn").classList.toggle("hidden", session?.deliveryStatus !== "DELIVERY_UNKNOWN");
  const rows = [
    ["Status", statusText(session)], ["Clock-in", session?.clockIn || "—"],
    ["Clock-out", session?.clockOut || "Pending 00:30 fallback"], ["Scheduled", formatScheduled(session?.scheduledExecutionTime)],
    ["Report generation", session?.generationStatus || "Pending"], ["Teams delivery", session?.deliveryStatus || "Pending"],
    ["Work duration", Number.isFinite(session?.workMinutes) ? `${(session.workMinutes / 60).toFixed(2)} hours` : "Not calculated"],
    ["Sprint duration", session?.sprintEnabled && Number.isFinite(session?.sprintMinutes) ? `${(session.sprintMinutes / 60).toFixed(2)} hours` : "Not tracked"],
    ["Last issue", session?.lastErrorCategory || "—"], ["Completed", session?.completedAt || "—"]
  ];
  $("statusDetails").innerHTML = rows.map(([k,v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join("");
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

function setForm(session) {
  const date = session?.workDate || localDateNow();
  $("workDate").value = date;
  $("clockIn").value = session?.clockIn || `${date}T${nowForDate(date).slice(11)}`;
  $("clockOut").value = session?.clockOut || "";
  $("ticketReference").value = session?.ticketReference || "";
  $("conversationUrl").value = session?.conversationUrl || "";
  $("conversationText").value = session?.conversationText || "";
  $("sprintEnabled").checked = Boolean(session?.sprintEnabled);
  $("sprintIn").value = session?.sprintClockIn || "";
  $("sprintOut").value = session?.sprintClockOut || "";
  toggleSprint(); renderStatus(session);
}
function toggleSprint() {
  const visible = $("sprintEnabled").checked;
  $("sprintInWrap").classList.toggle("hidden", !visible); $("sprintOutWrap").classList.toggle("hidden", !visible);
  $("sprintIn").required = visible; $("sprintOut").required = visible;
}

async function loadSessions() {
  const date = $("workDate").value || localDateNow();
  const result = await apiRequest(`/sessions/${encodeURIComponent(date)}`);
  setForm(result.session); $("saveHint").textContent = `Timezone: ${result.timezone || config.timezone || "Asia/Kolkata"}`;
}
async function refreshStatus() {
  if (!token()) return;
  const date = $("workDate").value || localDateNow();
  const result = await apiRequest(`/sessions/${encodeURIComponent(date)}`);
  renderStatus(result.session);
}

async function save(event) {
  event.preventDefault(); clearNotice();
  const button = $("saveBtn"); button.disabled = true; button.textContent = "Saving…";
  try {
    const workDate = $("workDate").value;
    const body = { workDate, clockIn: $("clockIn").value, clockOut: $("clockOut").value, sprintEnabled: $("sprintEnabled").checked,
      sprintClockIn: $("sprintIn").value, sprintClockOut: $("sprintOut").value,
      ticketReference: $("ticketReference").value.trim(),
      conversationUrl: $("conversationUrl").value.trim(), conversationText: $("conversationText").value.trim() };
    const existing = await apiRequest(`/sessions/${encodeURIComponent(workDate)}`);
    const saved = Boolean(existing.session);
    const result = await apiRequest(saved ? `/sessions/${encodeURIComponent(workDate)}` : "/sessions", { method: saved ? "PUT" : "POST", body: JSON.stringify(body) });
    setForm(result.session); showNotice(result.session?.scheduleError ? "Saved, but the schedule needs attention. Save again to retry schedule setup." : "Session saved.");
  } catch (error) { showNotice(error.message || "Unable to save session.", true); }
  finally { button.disabled = false; button.textContent = "Save session"; }
}

async function render() {
  const isAuthenticated = Boolean(token());
  $("signInBtn").classList.toggle("hidden", isAuthenticated); $("signOutBtn").classList.toggle("hidden", !isAuthenticated);
  $("authPanel").classList.toggle("hidden", isAuthenticated); $("sessionForm").classList.toggle("hidden", !isAuthenticated);
  $("timezoneLabel").textContent = config.timezone || "Asia/Kolkata";
  if (isAuthenticated) {
    try { await loadSessions(); }
    catch (error) { showNotice(error.message || "Could not load your sessions.", true); }
  }
}

$("signInBtn").addEventListener("click", signIn);
$("authPanelSignIn").addEventListener("click", signIn);
$("signOutBtn").addEventListener("click", signOut);
$("sessionForm").addEventListener("submit", save);
$("retryBtn").addEventListener("click", async () => {
  const date = $("workDate").value; const button = $("retryBtn"); button.disabled = true; clearNotice();
  const ambiguous = $("sessionStatus").dataset.deliveryStatus === "DELIVERY_UNKNOWN";
  if (ambiguous && !confirm("Teams may already have accepted the previous message. Retrying can post a duplicate. Continue?")) { button.disabled = false; return; }
  try { const result = await apiRequest(`/sessions/${encodeURIComponent(date)}/retry`, { method: "POST", body: JSON.stringify({ confirmPossibleDuplicate: ambiguous }) }); setForm(result.session); showNotice(result.message || "Processing retry scheduled."); }
  catch (error) { showNotice(error.message || "Unable to schedule retry.", true); }
  finally { button.disabled = false; }
});
$("confirmDeliveredBtn").addEventListener("click", async () => {
  if (!confirm("Only continue if you checked the Teams channel and found this report. This will prevent any retry.")) return;
  const date = $("workDate").value; const button = $("confirmDeliveredBtn"); button.disabled = true; clearNotice();
  try {
    const result = await apiRequest(`/sessions/${encodeURIComponent(date)}/confirm-delivered`, { method: "POST", body: JSON.stringify({ confirmDelivered: true }) });
    renderStatus(result.session); showNotice(result.message || "Delivery status updated.");
  } catch (error) { showNotice(error.message || "Unable to confirm delivery.", true); }
  finally { button.disabled = false; }
});
$("sprintEnabled").addEventListener("change", toggleSprint);
$("workDate").addEventListener("change", async () => { try { await loadSessions(); } catch (error) { showNotice(error.message, true); } });
$("refreshBtn").addEventListener("click", async () => { try { await refreshStatus(); } catch (error) { showNotice(error.message, true); } });

try { await completeSignIn(); } catch (error) { showNotice(error.message, true); }
await render();
setInterval(() => { refreshStatus().catch(() => {}); }, 30000);
