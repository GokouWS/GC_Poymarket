import { ToolContext, ToolHandler } from "./index.js";
import { searchConversations, searchKnowledge } from "../memory/pinecone.js";
import { getEmbedding } from "../memory/embeddings.js";
import { Type } from "@google/genai";

export const recall: ToolHandler = {
    definition: {
        name: "recall",
        description: "Search deep memory (Tier 3) for past conversations or facts. Use this when the user asks about something you discussed weeks ago that isn't in your immediate recent history.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: {
                    type: Type.STRING,
                    description: "The search query to match against past memories.",
                },
            },
            required: ["query"],
        },
    },
    async execute({ query }, _context: ToolContext): Promise<string> {
        const q = String(query);

        try {
            const qEmbed = await getEmbedding(q);

            const factsPromise = searchKnowledge(qEmbed, 5);
            const msgsPromise = searchConversations(qEmbed, 10);

            const [facts, msgs] = await Promise.all([factsPromise, msgsPromise]);

            let result = `=== RECALL RESULTS FOR "${q}" ===\n\n`;

            if (facts.length > 0) {
                result += "KNOWLEDGE & FACTS:\n";
                result += facts.map((f: any) => `- (Match: ${(f.score * 100).toFixed(1)}%) ${f.metadata.text}`).join("\n");
                result += "\n\n";
            }

            if (msgs.length > 0) {
                result += "PAST CONVERSATIONS:\n";
                result += msgs.map((m: any) => `(Match: ${(m.score * 100).toFixed(1)}%) ${m.metadata.text}`).join("\n\n");
            }

            if (facts.length === 0 && msgs.length === 0) {
                result += "No matching memories found.";
            }

            return result;
        } catch (error) {
            console.error("Failed to recall memory:", error);
            return `Recall failed: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
    },
};
