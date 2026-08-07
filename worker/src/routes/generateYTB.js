import { ytbPrompt } from "../prompts/ytbPrompt";
import { getTodayConversation } from "../services/database";

export async function generateYTB(request, env) {

    const conversation = await getTodayConversation(env);

    if (!conversation.length) {
        return Response.json(
            { error: "No conversation found for today" },
            { status: 404 }
        );
    }

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
                        role: "user",
                        parts: [
                            {
                                text:
                                    ytbPrompt +
                                    "\n\nConversation:\n" +
                                    JSON.stringify(conversation)
                            }
                        ]
                    }
                ]
            })
        }
    );

    const data = await response.json();

    let text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Remove markdown fences if Gemini returns them
    text = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

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

    const result = JSON.parse(text);

    result.blocker = "No blockers";

    return Response.json(result);
}