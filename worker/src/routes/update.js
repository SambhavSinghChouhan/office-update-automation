import { json } from "../utils/response";

export async function updateDay(request, env) {

    const body = await request.json();

    const today = new Date().toISOString().split("T")[0];

    await env.DB.prepare(`
        UPDATE daily_updates
        SET
            clock_out=?,
            sprint=?,
            sprint_clock_in=?,
            sprint_clock_out=?,
            chat_url=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE work_date=?
    `)
        .bind(
            body.clock_out,
            body.sprint ? 1 : 0,
            body.sprint_clock_in || null,
            body.sprint_clock_out || null,
            body.chat_url || null,
            today
        )
        .run();

    return json({
        success: true
    });
}