import { GoogleGenAI, Type } from "@google/genai";
import { config } from "../config.js";
import { getAllFacts, upsertFact, deleteFact } from "./sqlite.js";

const ai = new GoogleGenAI({
    apiKey: config.geminiApiKey,
});

const EXTRACTOR_SYSTEM_PROMPT = `You are a background fact-extraction agent for Gravity Claw.
Your job is to read the latest turns in a conversation and update the user's Core Facts database.

Core facts are persistent, semantic knowledge about the user. Examples:
- "User works as a software engineer"
- "User's favorite color is blue"
- "User is currently building a project named Gravity Claw"
- "User has a dog named Max"

You will be provided with:
1. The currently known facts about the user.
2. The recent conversation history.

Rules:
1. Identify any NEW facts revealed in the recent conversation.
2. Identify if any existing facts need to be UPDATED or DELETED (e.g., if the user says "I don't like coffee anymore", remove the old fact about liking coffee).
3. Do NOT extract ephemeral context (e.g. "User asked for the time").
4. Output your changes as an array of operations.
If there are no new facts to add, update, or delete, return an empty array.`;

export interface FactExtractionMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export async function extractAndStoreFacts(
    recentMessages: FactExtractionMessage[]
): Promise<void> {
    const userMessages = recentMessages.filter((m) => m.role === "user");
    if (userMessages.length === 0) return;

    const currentFacts = getAllFacts();
    let factsContext = currentFacts.length > 0
        ? "CURRENT FACTS:\n" + currentFacts.map(f => `[${f.id}] ${f.category}: ${f.fact}`).join("\n")
        : "CURRENT FACTS: None yet.";

    const transcript = recentMessages
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n\n");

    const prompt = `${factsContext}\n\nRECENT CONVERSATION:\n${transcript}\n\nReturn JSON operations:`;

    try {
        const response = await ai.models.generateContent({
            model: config.model,
            contents: prompt,
            config: {
                systemInstruction: {
                    role: "system",
                    parts: [{ text: EXTRACTOR_SYSTEM_PROMPT }]
                },
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            op: { type: Type.STRING, description: "Must be 'add' or 'delete'" },
                            category: { type: Type.STRING },
                            fact: { type: Type.STRING },
                            id: { type: Type.STRING, description: "Required if op is 'delete'" }
                        },
                        required: ["op"]
                    }
                },
                temperature: 0.1,
            }
        });

        const text = response.text;
        if (!text) return;

        const operations = JSON.parse(text);
        if (!Array.isArray(operations) || operations.length === 0) return;

        for (const op of operations) {
            if (op.op === "add" && op.fact && op.category) {
                console.log(`🧠 Learning fact: [${op.category}] ${op.fact}`);
                upsertFact(op.category, op.fact);
            } else if (op.op === "delete" && op.id) {
                console.log(`🗑️ Forgetting fact ID: ${op.id}`);
                deleteFact(op.id);
            }
        }
    } catch (error) {
        console.error("Fact extraction failed:", error);
    }
}
