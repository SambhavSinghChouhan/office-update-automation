import { json } from "../utils/response";

export async function getToday(env) {

    const today = new Date().toISOString().split("T")[0];

    const result = await env.DB.prepare(`
        SELECT *
        FROM daily_updates
        WHERE work_date=?
        LIMIT 1
    `)
    .bind(today)
    .first();

    return json(result || {});
}