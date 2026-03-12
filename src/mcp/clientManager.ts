import fs from "fs";
import os from "os";
import path from "path";
import { EventSource } from "eventsource";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { type FunctionDeclaration, Type, type Schema } from "@google/genai";

// @ts-ignore - Patch global for SSEClientTransport
global.EventSource = EventSource as any;

export interface MCPToolDef {
    serverName: string;
    tool: FunctionDeclaration;
    originalName: string; // The name the MCP server expects
}

function mapMcpSchemaToGemini(mcpSchema: any): Schema {
    if (!mcpSchema) return { type: Type.OBJECT, properties: {} } as Schema;

    const geminiSchema: any = { ...mcpSchema };

    // Convert JSON schema types to Gemini Enum
    if (mcpSchema.type) {
        if (typeof mcpSchema.type === "string") {
            geminiSchema.type = mcpSchema.type.toUpperCase();
        } else if (Array.isArray(mcpSchema.type)) {
            const mainType = mcpSchema.type.find((t: any) => t !== "null");
            if (mainType && typeof mainType === "string") {
                geminiSchema.type = mainType.toUpperCase();
            } else {
                geminiSchema.type = Type.OBJECT;
            }
        }
    }

    // Recursively map properties
    if (mcpSchema.properties) {
        geminiSchema.properties = {};
        for (const [key, val] of Object.entries(mcpSchema.properties)) {
            geminiSchema.properties[key] = mapMcpSchemaToGemini(val);
        }
    }

    if (mcpSchema.items) {
        geminiSchema.items = mapMcpSchemaToGemini(mcpSchema.items);
    }

    return geminiSchema as Schema;
}

class MCPClientManager {
    private clients: Map<string, Client> = new Map();
    private transports: Map<string, StdioClientTransport | SSEClientTransport> = new Map();
    private availableTools: MCPToolDef[] = [];

    /**
     * Reads ~/.gemini/antigravity/mcp_config.json and connects to all servers.
     */
    async connectAll(): Promise<void> {
        const localConfigPath = path.join(process.cwd(), "mcp_config.json");
        const homeConfigPath = path.join(os.homedir(), ".gemini", "antigravity", "mcp_config.json");
        let config: any;

        if (process.env.MCP_CONFIG) {
            try {
                config = JSON.parse(process.env.MCP_CONFIG);
                console.log(`[MCP] Loaded MCP configuration from MCP_CONFIG environment variable.`);
            } catch (e) {
                console.error(`[MCP] Failed to parse MCP_CONFIG environment variable:`, e);
                return;
            }
        } else if (fs.existsSync(localConfigPath)) {
            try {
                config = JSON.parse(fs.readFileSync(localConfigPath, "utf-8"));
                console.log(`[MCP] Loaded MCP configuration from ${localConfigPath}.`);
            } catch (e) {
                console.error(`[MCP] Failed to parse config at ${localConfigPath}:`, e);
                return;
            }
        } else if (fs.existsSync(homeConfigPath)) {
            try {
                config = JSON.parse(fs.readFileSync(homeConfigPath, "utf-8"));
                console.log(`[MCP] Loaded MCP configuration from ${homeConfigPath}.`);
            } catch (e) {
                console.error(`[MCP] Failed to parse config at ${homeConfigPath}:`, e);
                return;
            }
        } else {
            console.log(`[MCP] No config found at ${localConfigPath} or ${homeConfigPath} and no MCP_CONFIG env var set. Skipping MCP connections.`);
            return;
        }

        const mcpServers = config.mcpServers || {};
        const connectionPromises = [];

        for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
            connectionPromises.push(this.connectToServer(serverName, serverConfig));
        }

        await Promise.allSettled(connectionPromises);
        await this.refreshAllTools();
    }

    private async connectToServer(serverName: string, config: any): Promise<void> {
        try {
            let transport: StdioClientTransport | SSEClientTransport;

            if (config.type === "sse" && config.url) {
                console.log(`[MCP] Connecting to SSE server '${serverName}' at ${config.url}`);
                // We supply EventSource to ensure node compatibility
                transport = new SSEClientTransport(new URL(config.url), {
                    eventSourceInit: {
                        // Some servers might need custom headers, we could passthrough config.env if needed
                    }
                });
            } else if (config.command) {
                console.log(`[MCP] Connecting to Stdio server '${serverName}' (command: ${config.command})`);
                transport = new StdioClientTransport({
                    command: config.command,
                    args: config.args || [],
                    env: { ...process.env, ...(config.env || {}) },
                });
            } else {
                throw new Error("Invalid MCP server configuration. Must have 'command' or 'type: sse'");
            }

            const client = new Client(
                {
                    name: "gravity-claw",
                    version: "1.0.0",
                },
                {
                    capabilities: {},
                }
            );

            await client.connect(transport);

            this.clients.set(serverName, client);
            this.transports.set(serverName, transport);
            console.log(`[MCP] ✅ Connected to '${serverName}'`);

        } catch (error) {
            console.error(`[MCP] ❌ Failed to connect to '${serverName}':`, error);
        }
    }

    async refreshAllTools(): Promise<void> {
        this.availableTools = [];

        for (const [serverName, client] of this.clients.entries()) {
            try {
                const response = await client.listTools();
                const tools = response.tools || [];

                for (const t of tools) {
                    // Add a prefix to avoid collisions between MCP servers and internal tools
                    const safeName = `mcp_${serverName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${t.name}`;

                    this.availableTools.push({
                        serverName,
                        originalName: t.name,
                        tool: {
                            name: safeName,
                            description: t.description || `[From MCP Server: ${serverName}]`,
                            parameters: mapMcpSchemaToGemini(t.inputSchema),
                        },
                    });
                }
            } catch (error) {
                console.error(`[MCP] Failed to list tools for '${serverName}':`, error);
            }
        }
    }

    /**
     * Returns all MCP tools reformatted for Gemini API
     */
    getTools(): FunctionDeclaration[] {
        return this.availableTools.map(t => t.tool);
    }

    /**
     * Check if a tool name is registered via an MCP server
     */
    isMCPTool(toolName: string): boolean {
        return this.availableTools.some(t => t.tool.name === toolName);
    }

    /**
     * Execute a tool on the target MCP server
     */
    async executeTool(toolName: string, args: any): Promise<string> {
        const toolDef = this.availableTools.find(t => t.tool.name === toolName);
        if (!toolDef) {
            throw new Error(`MCP Tool ${toolName} not found`);
        }

        const client = this.clients.get(toolDef.serverName);
        if (!client) {
            throw new Error(`Client for MCP Server ${toolDef.serverName} not connected`);
        }

        try {
            const result = await client.callTool({
                name: toolDef.originalName,
                arguments: args,
            });

            // Format response text to string constraint
            if (result.isError) {
                return `Error from MCP Tool: ${JSON.stringify(result.content)}`;
            }

            if (Array.isArray(result.content)) {
                const textParts = result.content
                    .filter((c: any) => c.type === "text")
                    .map((c: any) => c.text);

                return textParts.join("\n") || JSON.stringify(result.content);
            }

            return JSON.stringify(result.content);
        } catch (error) {
            console.error(`[MCP] Error executing tool ${toolName}:`, error);
            throw error;
        }
    }

    async disconnectAll(): Promise<void> {
        for (const [serverName, client] of this.clients.entries()) {
            try {
                await client.close();
                console.log(`[MCP] Closed connection to '${serverName}'`);
            } catch (e) {
                console.error(`[MCP] Error closing '${serverName}':`, e);
            }
        }
        this.clients.clear();
        this.transports.clear();
    }
}

export const mcpManager = new MCPClientManager();
