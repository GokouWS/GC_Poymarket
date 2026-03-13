import { GoogleGenAI, type Content, type Part } from "@google/genai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getOrCreateConversation, saveMessage, countMessages, getAllMessages, pruneMessagesExceptNewest, updateConversationSummary } from "./memory/sqlite.js";
import { upsertConversationExchange } from "./memory/pinecone.js";
import { getEmbedding } from "./memory/embeddings.js";
import { buildMemoryContext } from "./memory/context-builder.js";
import { logTelemetry } from "./memory/supabase.js";
import { extractAndStoreFacts } from "./memory/fact-extractor.js";
import { config } from "./config.js";
import { getToolDefinitions, executeTool } from "./tools/index.js";
import type { ToolContext } from "./tools/index.js";

// ── Gemini Client ───────────────────────────────────────────────────

const ai = new GoogleGenAI({
    apiKey: config.geminiApiKey,
});

const SYSTEM_PROMPT = `You are Gravity Claw, a personal AI assistant running on your owner's machine via Telegram.

Core traits:
- Concise and helpful — respect the chat medium, keep replies short unless asked for detail.
- **Supportive Partner:** Your goal is to help the user find alpha. Never be dismissive, rude, or sarcastic about the user's research or the platform's data. 
- **Professional Insight:** If data is low-quality, state it objectively and suggest a better alternative. Do not complain or ask "if we are done for today."
- You have access to tools. Use them when they'd give a better answer.
- Never reveal API keys, tokens, or secrets in your responses.`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOUL_PROMPT = fs.readFileSync(path.join(__dirname, "soul.md"), "utf-8");

// ── Agentic Loop ────────────────────────────────────────────────────

export async function runAgentLoop(userMessage: string, chatId: number): Promise<string> {
    const tools = getToolDefinitions();
    const toolContext: ToolContext = { chatId };

    // ── 1. Init Memory & Context ──────────────────────────────────────
    const conv = getOrCreateConversation(chatId);

    // Save user message immediately so it's in the DB
    saveMessage(conv.id, "user", userMessage);
    logTelemetry("message_received", chatId, { text_length: userMessage.length, conversation_id: conv.id });

    const memCtx = await buildMemoryContext(conv.id, userMessage);

    const dynamicSystemPrompt = `${SYSTEM_PROMPT}

=== SOUL & PERSONALITY ===
${SOUL_PROMPT}
==========================

=== MEMORY CONTEXT ===
Core Facts about User:
${memCtx.factsString}

Recent Conversation History:
${memCtx.recentHistoryString}

${memCtx.semanticMatchesString ? `Relevant Past Memories:\n${memCtx.semanticMatchesString}` : ""}
======================`;

    // ── Generate Loop ───────────────────────────────────────────────

    // Convert to Gemini format
    const contents: Content[] = [{
        role: "user",
        parts: [{ text: userMessage }]
    }];

    for (let iteration = 0; iteration < config.maxIterations; iteration++) {
        const response = await ai.models.generateContent({
            model: config.model,
            contents,
            config: {
                systemInstruction: {
                    role: "system",
                    parts: [{ text: dynamicSystemPrompt }]
                },
                tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
                temperature: 0.7,
            }
        });

        const textPart = response.text;
        const functionCalls = response.functionCalls || [];

        // ── 2. Handle Tool Use ──────────────────────────────────────

        if (functionCalls.length > 0) {
            // Include assistant's tool call invocation in history (preserve all parts including thought_signature)
            const assistantParts = response.candidates?.[0]?.content?.parts || [];
            contents.push({ role: "model", parts: assistantParts });

            // Execute the tools
            const functionResponses: Part[] = [];

            for (const fc of functionCalls) {
                if (!fc.name) continue;
                console.log(`  🔧 Tool call: ${fc.name}(${JSON.stringify(fc.args)})`);

                try {
                    const result = await executeTool(
                        fc.name,
                        fc.args as Record<string, unknown>,
                        toolContext
                    );

                    console.log(`  ✅ Result: ${result.slice(0, 200)}${result.length > 200 ? "…" : ""}`);
                    logTelemetry("tool_used", chatId, { tool_name: fc.name, error: false });

                    functionResponses.push({
                        functionResponse: {
                            name: fc.name,
                            response: { result }
                        }
                    });
                } catch (e: any) {
                    logTelemetry("tool_used", chatId, { tool_name: fc.name, error: true, error_message: e.message });
                    functionResponses.push({
                        functionResponse: {
                            name: fc.name,
                            response: { error: e.message }
                        }
                    });
                }
            }

            // Push function results as user reply
            contents.push({ role: "user", parts: functionResponses });
            continue; // Loop again so Gemini sees the results
        }

        // ── 3. Final Response ────────────────────────────────────────

        const finalResponse = textPart || "(No response from Gemini)";

        try {
            saveMessage(conv.id, "assistant", finalResponse);
            logTelemetry("message_sent", chatId, { text_length: finalResponse.length, conversation_id: conv.id });

            // Background async extraction, compaction, and vector semantic storage
            extractAndStoreFacts([
                { role: "user", content: userMessage },
                { role: "assistant", content: finalResponse },
            ]).catch((err) => console.error("Fact extraction background error:", err));

            runCompactionIfNeeded(conv.id);

            // Background semantic embedding (Pinecone)
            const exchangeText = `User: ${userMessage}\nAssistant: ${finalResponse}`;
            getEmbedding(exchangeText).then(embedding => {
                const exchangeId = `${conv.id}-${Date.now()}`;
                return upsertConversationExchange(exchangeId, exchangeText, embedding, { conversationId: conv.id });
            }).catch((err: any) => console.error("Pinecone embedding upstert background error:", err));
        } catch (err) {
            console.error("Failed to save assistant message or trigger extraction:", err);
        }

        return finalResponse;
    }

    return "⚠️ I hit my thinking limit for this request. Please try rephrasing or breaking it into smaller questions.";
}

// ── Proactive Loop ──────────────────────────────────────────────────

/**
 * Runs the agent loop without a triggering user message.
 * Used for system-initiated actions like daily heartbeats.
 */
export async function runProactiveAgentLoop(instruction: string, chatId: number): Promise<string> {
    const tools = getToolDefinitions();
    const toolContext: ToolContext = { chatId };

    const conv = getOrCreateConversation(chatId);
    const memCtx = await buildMemoryContext(conv.id, instruction); // Use instruction to fetch semantic memories

    const dynamicSystemPrompt = `${SYSTEM_PROMPT}

=== SOUL & PERSONALITY ===
${SOUL_PROMPT}
==========================

=== MEMORY CONTEXT ===
Core Facts about User:
${memCtx.factsString}

Recent Conversation History:
${memCtx.recentHistoryString}

${memCtx.semanticMatchesString ? `Relevant Past Memories:\n${memCtx.semanticMatchesString}` : ""}
======================

=== PROACTIVE SYSTEM INSTRUCTION ===
${instruction}
====================================`;

    const contents: Content[] = [{
        role: "user",
        // We simulate a user prompt to kick off the Gemini loop, since it expects a user turn
        parts: [{ text: "EXECUTE PROACTIVE INSTRUCTION" }]
    }];

    for (let iteration = 0; iteration < config.maxIterations; iteration++) {
        const response = await ai.models.generateContent({
            model: config.model,
            contents,
            config: {
                systemInstruction: {
                    role: "system",
                    parts: [{ text: dynamicSystemPrompt }]
                },
                tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
                temperature: 0.7,
            }
        });

        const textPart = response.text;
        const functionCalls = response.functionCalls || [];

        if (functionCalls.length > 0) {
            const assistantParts = response.candidates?.[0]?.content?.parts || [];
            contents.push({ role: "model", parts: assistantParts });

            const functionResponses: Part[] = [];
            for (const fc of functionCalls) {
                if (!fc.name) continue;
                console.log(`  🔧 Proactive Tool call: ${fc.name}(${JSON.stringify(fc.args)})`);
                try {
                    const result = await executeTool(fc.name, fc.args as Record<string, unknown>, toolContext);
                    console.log(`  ✅ Result: ${result.slice(0, 200)}${result.length > 200 ? "…" : ""}`);
                    functionResponses.push({ functionResponse: { name: fc.name, response: { result } } });
                } catch (e: any) {
                    functionResponses.push({ functionResponse: { name: fc.name, response: { error: e.message } } });
                }
            }
            contents.push({ role: "user", parts: functionResponses });
            continue;
        }

        const finalResponse = textPart || "(No response from Gemini)";

        try {
            // We save this as an assistant message so the user sees it in the history
            saveMessage(conv.id, "assistant", finalResponse);
            logTelemetry("message_sent", chatId, { text_length: finalResponse.length, conversation_id: conv.id, proactive: true });
            runCompactionIfNeeded(conv.id);
        } catch (err) {
            console.error("Failed to save proactive message:", err);
        }

        return finalResponse;
    }

    return "⚠️ I hit my thinking limit for proactive reasoning.";
}

// ── Compaction ───────────────────────────────────────────────────────

async function runCompactionIfNeeded(conversationId: string) {
    try {
        const msgCount = countMessages(conversationId);
        if (msgCount > 30) {
            console.log(`[Memory] Compacting conversation ${conversationId} (Count: ${msgCount})...`);

            const allMsgs = getAllMessages(conversationId);
            const convText = allMsgs.map(m => `${m.role}: ${m.content}`).join("\n\n");

            const summaryPrompt = `Please concisely summarize the following conversation history. Focus on the main topics discussed, decisions made, and any context needed to continue the conversation in the future.\n\n${convText}`;

            const response = await ai.models.generateContent({
                model: config.model,
                contents: [{ role: "user", parts: [{ text: summaryPrompt }] }],
                config: { temperature: 0.3 }
            });

            if (response.text) {
                updateConversationSummary(conversationId, response.text);
                pruneMessagesExceptNewest(conversationId, 10);
                console.log(`[Memory] Compaction complete for ${conversationId}.`);
            }
        }
    } catch (error) {
        console.error("Failed to run compaction:", error);
    }
}
