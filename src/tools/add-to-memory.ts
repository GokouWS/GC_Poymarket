import { ToolContext, ToolHandler } from "./index.js";
import { upsertKnowledge } from "../memory/pinecone.js";
import { getEmbedding } from "../memory/embeddings.js";
import { Type } from "@google/genai";

export const addToMemory: ToolHandler = {
    definition: {
        name: "add_to_memory",
        description: "Add an arbitrary piece of knowledge, note, or document text to your semantic vector memory (Tier 2). Use this when there is long-form or unstructured information that you need to be able to recall later, but that doesn't fit neatly into a single line core fact.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                text: {
                    type: Type.STRING,
                    description: "The knowledge or document text to embed and memorize.",
                },
                source: {
                    type: Type.STRING,
                    description: "Optional description of where this knowledge came from (e.g. 'article', 'user explanation', 'brainstorming session')",
                }
            },
            required: ["text"],
        },
    },
    async execute({ text, source }, _context: ToolContext): Promise<string> {
        const t = String(text);

        try {
            const embedding = await getEmbedding(t);
            const id = `knowledge-${Date.now()}`;
            await upsertKnowledge(id, t, embedding, { source: source ? String(source) : 'unknown' });
            return `Knowledge saved successfully to semantic memory.`;
        } catch (error) {
            console.error("Failed to add to memory:", error);
            return `Failed to save knowledge: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
    },
};
