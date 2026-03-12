import { ToolContext, ToolHandler } from "./index.js";
import { deleteFact } from "../memory/sqlite.js";
import { Type } from "@google/genai";

export const forget: ToolHandler = {
    definition: {
        name: "forget",
        description: "Delete a core fact from Tier 2 memory using its ID. Only use this if the user explicitly asks you to forget something specific, or to correct a fact ID you just retrieved that is wrong.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                fact_id: {
                    type: Type.STRING,
                    description: "The UUID of the fact to delete.",
                },
            },
            required: ["fact_id"],
        },
    },
    async execute({ fact_id }, _context: ToolContext): Promise<string> {
        const id = String(fact_id);

        try {
            deleteFact(id);
            return `Fact ${id} deleted successfully.`;
        } catch (error) {
            console.error("Failed to delete fact:", error);
            return `Failed to delete fact: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
    },
};
