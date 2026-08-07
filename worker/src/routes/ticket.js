import { json } from "../utils/response";

export async function saveTicket(request, env) {

    const body = await request.json();

    await env.DB.prepare(`
        UPDATE settings
        SET
            ticket_name=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=1
    `)
        .bind(body.ticket_name)
        .run();

    return json({
        success: true
    });
}