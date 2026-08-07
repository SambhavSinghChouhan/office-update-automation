import { createYTBPrompt } from "../prompts/ytbPrompt";
import { askGemini } from "../services/gemini";

export async function runYTBWorkflow(conversation, env) {

    const conversationText = conversation
        .map(msg => `${msg.role.toUpperCase()}: ${msg.text}`)
        .join("\n\n");

    const prompt = createYTBPrompt(conversationText);

    const result = await askGemini(prompt, env);

    return result;

}