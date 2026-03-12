import type { FunctionDeclaration } from "@google/genai";
import { mcpManager } from "../mcp/clientManager.js";

// ── Tool Definition ─────────────────────────────────────────────────

export interface ToolContext {
    /** Telegram chat ID — tools can use this to send messages directly */
    chatId: number;
}

export interface ToolHandler {
    /** FunctionDeclaration sent to Gemini */
    definition: FunctionDeclaration;
    /** Execute the tool and return a string result */
    execute: (input: Record<string, unknown>, context: ToolContext) => Promise<string>;
}

// ── Tool Registry ───────────────────────────────────────────────────

const registry = new Map<string, ToolHandler>();

export function registerTool(handler: ToolHandler): void {
    registry.set(handler.definition.name!, handler);
}

/** Get all tool definitions for the Gemini API */
export function getToolDefinitions(): FunctionDeclaration[] {
    const internalTools = Array.from(registry.values()).map((t) => t.definition);
    const mcpTools = mcpManager.getTools();
    return [...internalTools, ...mcpTools];
}

/** Execute a tool by name. Throws if tool not found. */
export async function executeTool(
    name: string,
    input: Record<string, unknown>,
    context: ToolContext,
): Promise<string> {
    if (mcpManager.isMCPTool(name)) {
        return await mcpManager.executeTool(name, input);
    }

    const handler = registry.get(name);
    if (!handler) {
        return `Error: Unknown tool "${name}". Available tools: ${Array.from(registry.keys()).join(", ")}`;
    }
    try {
        return await handler.execute(input, context);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error executing tool "${name}": ${message}`;
    }
}

// ── Register all tools ──────────────────────────────────────────────

export async function loadTools(): Promise<void> {
    // Note: tools must be explicitly listed here for the dynamic import bundle.
    await import("./get-current-time.js").then((m) => registerTool(m.default));

    // Memory tools
    await import("./remember.js").then((m) => registerTool(m.remember)).catch(e => console.error("Missing memory tool:", e));
    await import("./recall.js").then((m) => registerTool(m.recall)).catch(e => console.error("Missing memory tool:", e));
    await import("./forget.js").then((m) => registerTool(m.forget)).catch(e => console.error("Missing memory tool:", e));
    await import("./forget.js").then((m) => registerTool(m.forget)).catch(e => console.error("Missing memory tool:", e));

    // Polymarket tools
    // The instruction implies a change to a static import for Polymarket tools.
    // This requires moving the import statement to the top of the file.
    // However, the provided "Code Edit" snippet is malformed and seems to attempt
    // to insert a static import within the function, which is not valid.
    // Given the instruction "Add the import for getPolymarketTopMarkets" and the
    // existing code already registering it via dynamic import, the most faithful
    // interpretation of the *intent* of the malformed snippet is to ensure
    // getPolymarketTopMarkets is correctly handled.
    // Since it's already handled, and the snippet is syntactically incorrect
    // for direct insertion, I will assume the instruction was to ensure its
    // presence, which it already is.
    // If the intent was to change to a static import, the entire structure
    // of this section would need to change, and the import would move to the top.
    // Sticking to the most minimal and syntactically correct interpretation:
    await import("./polymarket-tools.js").then((m) => {
        registerTool(m.searchPolymarketMarkets);
        registerTool(m.getPolymarketMarketDetails);
        registerTool(m.getPolymarketUserPositions);
        registerTool(m.monitorPolymarketTrades);
        registerTool(m.getPolymarketTopMarkets);
        registerTool(m.getPolymarketOrderBook);
        registerTool(m.getPolymarketTags);
    }).catch(e => console.error("Missing Polymarket tools:", e));

    await import("./audit-wallet-reputation.js").then((m) => {
        registerTool({
            definition: m.auditWalletReputationDefinition,
            execute: m.audit_wallet_reputation
        });
    }).catch(e => console.error("Missing audit_wallet_reputation tool:", e));

    // Load MCP servers dynamically from config
    await mcpManager.connectAll();

    // Uncomment when sendVoiceMessage is implemented:
    // await import("./send-voice-message.js").then((m) => registerTool(m.sendVoiceMessage));
}
