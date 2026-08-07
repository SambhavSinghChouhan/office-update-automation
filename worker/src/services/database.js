export async function getTodayConversation(env) {
  const result = await env.DB.prepare(`
    SELECT role, text
    FROM conversations
    WHERE DATE(created_at) = DATE('now','localtime')
    ORDER BY id ASC
  `).all();

  return result.results;
}