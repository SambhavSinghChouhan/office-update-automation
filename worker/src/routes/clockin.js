import { json } from "../utils/response";
import { sendTeamsMessage } from "../services/teams";

export async function clockIn(request, env) {

    const body = await request.json();

    const today = new Date().toISOString().split("T")[0];

    const settings = await env.DB.prepare(`
        SELECT ticket_name
        FROM settings
        LIMIT 1
    `).first();

    const existing = await env.DB.prepare(`
        SELECT id
        FROM daily_updates
        WHERE work_date=?
    `)
        .bind(today)
        .first();

    if (existing) {
        return json({
            success: false,
            message: "Already clocked in today."
        });
    }
    await env.DB.prepare(`
DELETE FROM conversations
`).run();

    await env.DB.prepare(`
        INSERT INTO daily_updates(
            work_date,
            clock_in,
            ticket_name,
            status
        )
        VALUES(?,?,?,?)
    `)
        .bind(
            today,
            body.clock_in,
            settings.ticket_name,
            "pending"
        )
        .run();

        await sendTeamsMessage(
    env,
    `Elephant Clock In ${body.clock_in}`
);

    return json({
        success: true,
        work_date: today
    });
}