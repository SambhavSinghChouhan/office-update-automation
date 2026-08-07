export async function sendTeamsMessage(env, message) {
    const settings = await env.DB.prepare(`
        SELECT teams_url
        FROM settings
        LIMIT 1
    `).first();

    if (!settings?.teams_url) {
        throw new Error("Teams webhook URL not configured");
    }

    const response = await fetch(settings.teams_url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            text: message
        })
    });

    if (!response.ok) {
        throw new Error("Failed to send Teams message");
    }

    return true;
}