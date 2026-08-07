
import { getTodayConversation } from "../services/database";
export async function generateToday(request, env) {
  const conversation = await getTodayConversation(env);

if (!conversation.length) {
    return Response.json(
        {
            error: "No conversation found for today"
        },
        {
            status: 404
        }
    );
}

  const history = conversation
    .map(msg => `${msg.role.toUpperCase()}: ${msg.text}`)
    .join("\n");

  const prompt = `
You are helping an Associate DevOps Engineer create his daily work update.

Below is today's conversation/work log.

${history}

Generate ONLY valid JSON.

Rules:
- Write in professional English.
- Do NOT invent technologies that were never mentioned.
- Summarize all work into 2–4 detailed paragraphs.
- Mention investigations, deployments, troubleshooting, validations, testing, configuration changes, documentation or meetings only if they were actually discussed.
- Do NOT include markdown.
- Do NOT include explanation.
- Return ONLY JSON.

Format:

{
  "todayUpdate":"paragraph1\\n\\nparagraph2\\n\\nparagraph3"
}
`;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    }
  );

  const data = await response.json();

const text =
  data.candidates?.[0]?.content?.parts?.[0]?.text;

if (!text) {
  return Response.json(
    {
      error: "No response from Gemini",
      raw: data
    },
    { status: 500 }
  );
}

try {
  return Response.json(JSON.parse(text));
} catch {
  return Response.json(
    {
      error: "Gemini returned invalid JSON",
      raw: text
    },
    { status: 500 }
  );
}
}