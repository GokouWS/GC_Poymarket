import { getRecentMessages, getAllFacts } from "./sqlite.js";
import { searchConversations } from "./pinecone.js";
import { getEmbedding } from "./embeddings.js";

export interface ContextPayload {
    factsString: string;
    recentHistoryString: string;
    semanticMatchesString: string | null;
}

/**
 * Build the full context payload for the agent before it responds.
 * 
 * 1. Load all core facts (Tier 2).
 * 2. Load the recent explicit history (Tier 1).
 * 3. (Optional) If there is a semantic shift or explicit recall request, perform semantic search (Tier 3).
 *    For simplicity in Level 2, we just run semantic search on the latest user message.
 */
export async function buildMemoryContext(
    conversationId: string,
    latestUserMessage: string
): Promise<ContextPayload> {
    // 1. Core Facts
    const facts = getAllFacts();
    const factsString = facts.length > 0
        ? facts.map(f => `- [${f.category}] ${f.fact}`).join("\n")
        : "No core facts known yet.";

    // 2. Recent History (Tier 1)
    // We grab the last 20 messages, so Claude has immediate contextual continuity
    const recentMessages = getRecentMessages(conversationId, 20);
    const recentHistoryString = recentMessages
        .map(m => `[${new Date(m.created_at).toLocaleTimeString()}] ${m.role.toUpperCase()}: ${m.content}`)
        .join("\n\n");

    // 3. Semantic Search (Tier 2/3)
    // We embed the latest message to see if it implicitly mentions anything from long ago
    let semanticMatchesString: string | null = null;
    try {
        const qEmbed = await getEmbedding(latestUserMessage);

        // We search across past messages in Pinecone
        const messageMatches = await searchConversations(qEmbed, 3);

        if (messageMatches.length > 0) {
            semanticMatchesString = messageMatches
                .map((m: any) => `(Past context, score ${(m.score * 100).toFixed(1)}%) ${m.metadata.text}`)
                .join("\n\n");
        }
    } catch (err) {
        console.error("Semantic search context gathering failed", err);
    }

    return {
        factsString,
        recentHistoryString,
        semanticMatchesString
    };
}
