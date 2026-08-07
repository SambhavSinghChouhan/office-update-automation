import { json } from "../utils/response";

export async function clockOut(request, env) {
    const body = await request.json();

    const today = new Date().toISOString().split("T")[0];

    const existing = await env.DB.prepare(`
        SELECT id
        FROM daily_updates
        WHERE work_date = ?
    `)
        .bind(today)
        .first();

    if (!existing) {
        return json({
            success: false,
            message: "You have not clocked in today."
        });
    }

    await env.DB.prepare(`
        UPDATE daily_updates
        SET
            clock_out = ?,
            status = 'scheduled'
        WHERE work_date = ?
    `)
        .bind(
            body.clock_out,
            today
        )
        .run();

    return json({
        success: true,
        clock_out: body.clock_out
    });
}