import { getTodayConversation } from "../services/database";
import { createTodayPrompt } from "../prompts/todayUpdatePrompt";
import { ytbPrompt } from "../prompts/ytbPrompt";

export async function generateAll(request, env) {
    const conversation = await getTodayConversation(env);

    if (!conversation.length) {
        return Response.json(
            { error: "No conversation found for today" },
            { status: 404 }
        );
    }

    const history = conversation
        .map(msg => `${msg.role.toUpperCase()}: ${msg.text}`)
        .join("\n");

    // Generate Today's Update
    const todayResponse = await fetch(
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
                                text: createTodayPrompt(history)
                            }
                        ]
                    }
                ]
            })
        }
    );

    const todayData = await todayResponse.json();

    const todayResult = JSON.parse(
        todayData.candidates[0].content.parts[0].text
    );

    // Generate YTB
    const ytbResponse = await fetch(
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

    const ytbData = await ytbResponse.json();

    const ytbResult = JSON.parse(
        ytbData.candidates[0].content.parts[0].text
    );

    ytbResult.blocker = "No blockers";

    return Response.json({
        todayUpdate: todayResult.todayUpdate,
        ytb: ytbResult
    });
}