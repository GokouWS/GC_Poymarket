import { ToolContext, ToolHandler } from "./index.js";
import { upsertFact } from "../memory/sqlite.js";
import { Type } from "@google/genai";

export const remember: ToolHandler = {
    definition: {
        name: "remember",
        description: "Explicitly force a fact into the core memory (Tier 2). Use this when the user explicitly asks you to remember something, or when a very important piece of information is revealed that you want to ensure is immediately available in the system prompt.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                category: {
                    type: Type.STRING,
                    description: "A short category name classifying the fact (e.g., 'preference', 'personal', 'project', 'relationship', 'system')",
                },
                fact: {
                    type: Type.STRING,
                    description: "The piece of information to remember. Write it clearly and objectively.",
                },
            },
            // Note: `required` expects an array of strings in the `Schema` type.
            // But looking at the docs, you can just pass them as an array.
            required: ["category", "fact"],
        },
    },
    async execute({ category, fact }, _context: ToolContext): Promise<string> {
        const cat = String(category);
        const f = String(fact);

        try {
            const savedFact = upsertFact(cat, f);
            return `Fact saved successfully. ID: ${savedFact.id}`;
        } catch (error) {
            console.error("Failed to remember fact:", error);
            return `Failed to save fact: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
    },
};
