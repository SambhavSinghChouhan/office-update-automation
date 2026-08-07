import { json } from "../utils/response";

export async function getConfig(env) {

    const result = await env.DB.prepare(`
        SELECT
            ticket_name,
            email_status,
            default_clock_out
        FROM settings
        LIMIT 1
    `).first();

    return json(result || {});
}