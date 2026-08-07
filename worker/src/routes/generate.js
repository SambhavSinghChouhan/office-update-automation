export async function generate(request, env) {
  const { conversation } = await request.json();

  const prompt = `
You are an assistant that creates office updates.

Based on the following conversation, generate ONLY valid JSON.

Return exactly this format:

{
  "ytb": {
    "yesterday": "...",
    "today": "...",
    "blocker": "No blockers"
  },
  "realm": {
    "todayUpdate": "...",
    "ticket": "..."
  }
}

Conversation:

${JSON.stringify(conversation, null, 2)}
`;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    }
  );

  const data = await response.json();

if (!response.ok) {
  return Response.json(data, { status: response.status });
}

const text = data.candidates[0].content.parts[0].text;

return Response.json(JSON.parse(text));
}