const config = window.APP_CONFIG || {};

export async function apiRequest(path, options = {}) {
  if (!config.apiBaseUrl) throw new Error("The application API endpoint is not configured yet.");
  const idToken = sessionStorage.getItem("workUpdateIdToken");
  const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${idToken || ""}`, "content-type": "application/json", ...(options.headers || {}) }
  });
  let data = {};
  try { data = await response.json(); } catch { /* non-JSON gateway response */ }
  if (!response.ok) {
    if (response.status === 401) { sessionStorage.removeItem("workUpdateIdToken"); sessionStorage.removeItem("workUpdateTokenExpiry"); }
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}
