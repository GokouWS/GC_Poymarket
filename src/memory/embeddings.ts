import OpenAI from "openai";
import { config } from "../config.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

/**
 * Generate a vector embedding for a given text using OpenAI's small embedding model.
 */
export async function getEmbedding(text: string): Promise<number[]> {
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text,
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error("Failed to generate embedding:", error);
        throw error;
    }
}

/**
 * Generate vector embeddings for multiple texts in a single batch request.
 */
export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: texts,
        });

        // Ensure the ordering matches the input
        const ordered = new Array(texts.length);
        for (const item of response.data) {
            ordered[item.index] = item.embedding;
        }
        return ordered;
    } catch (error) {
        console.error("Failed to generate batch embeddings:", error);
        throw error;
    }
}
