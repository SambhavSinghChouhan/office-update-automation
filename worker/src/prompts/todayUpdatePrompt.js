import { commonRules } from "./commonRules";

export function createTodayPrompt(conversation) {
    return `
${commonRules}

Generate today's office update.

Write it professionally.

write it in 3 paragraphs

Return exactly:

{
   "todayUpdate":""
}

Conversation:

${conversation}
`;
}