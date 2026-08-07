export async function addConversation(request, env) {
    const body = await request.json();

    const role = body.role ?? "user";
    const text = body.text?.trim();

    if (!text) {
        return Response.json(
            { error: "text is required" },
            { status: 400 }
        );
    }

    await env.DB.prepare(`
        INSERT INTO conversations (role, text)
        VALUES (?, ?)
    `)
    .bind(role, text)
    .run();

    return Response.json({
        success: true
    });
}

export async function getConversation(request, env) {
    const result = await env.DB.prepare(`
        SELECT role, text, created_at
        FROM conversations
        WHERE DATE(created_at)=DATE('now','localtime')
        ORDER BY id ASC
    `).all();

    return Response.json(result.results);
}

export async function clearConversation(request, env) {
    await env.DB.prepare(`
        DELETE FROM conversations
        WHERE DATE(created_at)=DATE('now','localtime')
    `).run();

    return Response.json({
        success: true
    });
}