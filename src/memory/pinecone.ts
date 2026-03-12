import { Pinecone } from '@pinecone-database/pinecone';
import { config } from '../config.js';

// ── Client ──────────────────────────────────────────────────────────

export const pinecone = new Pinecone({
    apiKey: config.pineconeApiKey,
});

export const getIndex = () => pinecone.index(config.pineconeIndexName);

// ── Namespaces ──────────────────────────────────────────────────────

export const NAMESPACES = {
    CONVERSATIONS: 'conversations',
    KNOWLEDGE: 'knowledge'
} as const;

// ── API ─────────────────────────────────────────────────────────────

/**
 * Upsert an exchange (User + Assistant message) into the Conversations namespace.
 */
export async function upsertConversationExchange(
    id: string,
    text: string,
    embedding: number[],
    metadata: Record<string, any> = {}
) {
    const index = getIndex();

    await index.namespace(NAMESPACES.CONVERSATIONS).upsert({
        records: [
            {
                id,
                values: embedding,
                metadata: {
                    text,
                    ...metadata,
                    timestamp: new Date().toISOString()
                }
            }
        ]
    });
}

/**
 * Perform a semantic search across the Conversations namespace.
 */
export async function searchConversations(queryEmbedding: number[], limit: number = 5) {
    const index = getIndex();

    const results = await index.namespace(NAMESPACES.CONVERSATIONS).query({
        vector: queryEmbedding,
        topK: limit,
        includeMetadata: true
    });

    return results.matches.filter(m => (m.score ?? 0) >= 0.3);
}

/**
 * Upsert a chunk of text into the Knowledge namespace.
 */
export async function upsertKnowledge(
    id: string,
    text: string,
    embedding: number[],
    metadata: Record<string, any> = {}
) {
    const index = getIndex();

    await index.namespace(NAMESPACES.KNOWLEDGE).upsert({
        records: [
            {
                id,
                values: embedding,
                metadata: {
                    text,
                    ...metadata,
                    timestamp: new Date().toISOString()
                }
            }
        ]
    });
}

/**
 * Perform a semantic search across the Knowledge namespace.
 */
export async function searchKnowledge(queryEmbedding: number[], limit: number = 3) {
    const index = getIndex();

    const results = await index.namespace(NAMESPACES.KNOWLEDGE).query({
        vector: queryEmbedding,
        topK: limit,
        includeMetadata: true
    });

    return results.matches.filter(m => (m.score ?? 0) >= 0.3);
}
