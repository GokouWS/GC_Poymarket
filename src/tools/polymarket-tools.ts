import { Type } from "@google/genai";
import type { ToolHandler } from "./index.js";
import { polymarketService } from "../services/polymarket-service.js";

/**
 * Tool to search for markets on Polymarket
 */
export const searchPolymarketMarkets: ToolHandler = {
    definition: {
        name: "search_polymarket_markets",
        description: "Search for prediction markets on Polymarket by query string. Returns a list of matching markets.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: {
                    type: Type.STRING,
                    description: "The search query (e.g., 'Bitcoin', 'Trump', 'SpaceX')"
                },
                seriousOnly: {
                    type: Type.BOOLEAN,
                    description: "Filter out meme-based or speculative pop-culture noise (e.g. GTA VI comparisons). Default: true"
                }
            },
            required: ["query"]
        }
    },
    execute: async (input) => {
        const query = input.query as string;
        const seriousOnly = input.seriousOnly !== false; // Default to true
        try {
            const markets = await polymarketService.searchMarkets(query, seriousOnly);
            if (markets.length === 0) {
                return `No markets found for query: "${query}"`;
            }

            const results = markets.map(m => {
                return `- **${m.question}**\n  - ID: ${m.id}\n  - Outcomes: ${m.outcomes.join(", ")}\n  - Prices: ${m.outcomePrices.join(", ")}\n  - Volume: $${m.volume}`;
            }).join("\n\n");

            return `Found ${markets.length} markets for "${query}":\n\n${results}`;
        } catch (error) {
            return `Error searching Polymarket markets: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
};

/**
 * Tool to get detailed information for a specific Polymarket market
 */
export const getPolymarketMarketDetails: ToolHandler = {
    definition: {
        name: "get_polymarket_market_details",
        description: "Get detailed information for a specific Polymarket market using its ID.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                marketId: {
                    type: Type.STRING,
                    description: "The unique ID of the market"
                }
            },
            required: ["marketId"]
        }
    },
    execute: async (input) => {
        const marketId = input.marketId as string;
        try {
            const market = await polymarketService.getMarketDetails(marketId);
            
            let details = `## 🎯 ${market.question}\n\n`;
            details += `> ${market.description || "No description provided."}\n\n`;
            
            details += `**📁 Category:** ${market.category || "General"}\n`;
            details += `**📊 Volume:** $${Number(market.volume).toLocaleString()}\n`;
            details += `**🚦 Status:** ${market.active ? "🟢 Active" : "🔴 Closed"}\n\n`;

            details += `### 🎲 Outcomes & Prices\n`;
            market.outcomes.forEach((outcome, i) => {
                const price = market.outcomePrices[i] || "N/A";
                details += `- **${outcome}:** \`${price}\`\n`;
            });

            if (market.clobTokenIds && market.clobTokenIds.length > 0) {
                details += `\n**🔗 Market IDs:**\n- Market ID: \`${market.id}\`\n- CLOB Tokens: \`${market.clobTokenIds.join(", ")}\`\n`;
            }

            details += `\n🔗 [View on Polymarket](https://polymarket.com/event/${marketId})`;

            return details;
        } catch (error) {
            return `Error fetching market details for "${marketId}": ${error instanceof Error ? error.message : String(error)}`;
        }
    }
};

/**
 * Tool to get the order book (liquidity) for a specific token
 */
export const getPolymarketOrderBook: ToolHandler = {
    definition: {
        name: "get_polymarket_order_book",
        description: "Fetch the current buy/sell order book depth for a specific Polymarket token. Helps gauge market liquidity and slip.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                tokenId: {
                    type: Type.STRING,
                    description: "The CLOB token ID (found in market details)"
                }
            },
            required: ["tokenId"]
        }
    },
    execute: async (input) => {
        const tokenId = input.tokenId as string;
        try {
            const book = await polymarketService.getOrderBook(tokenId);
            
            let details = `### 📚 Order Book for \`${tokenId}\`\n\n`;
            
            const bids = book.bids || [];
            const asks = book.asks || [];

            details += `**🟢 Top Bids (Buys):**\n`;
            bids.slice(0, 5).forEach((b: any) => {
                details += `- Price: \`${b.price}\` | Size: \`${b.size}\`\n`;
            });

            details += `\n**🔴 Top Asks (Sells):**\n`;
            asks.slice(0, 5).forEach((a: any) => {
                details += `- Price: \`${a.price}\` | Size: \`${a.size}\`\n`;
            });

            if (bids.length > 0 && asks.length > 0) {
                const spread = (parseFloat(asks[0].price) - parseFloat(bids[0].price)).toFixed(4);
                details += `\n**⚖️ Spread:** \`${spread}\``;
            }

            return details;
        } catch (error) {
            return `Error fetching order book for "${tokenId}": ${error instanceof Error ? error.message : String(error)}`;
        }
    }
};

/**
 * Tool to get user positions on Polymarket
 */
export const getPolymarketUserPositions: ToolHandler = {
    definition: {
        name: "get_polymarket_user_positions",
        description: "Fetch current positions for a specific wallet address on Polymarket.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                userAddress: {
                    type: Type.STRING,
                    description: "The Ethereum/Polygon wallet address to check"
                }
            },
            required: ["userAddress"]
        }
    },
    execute: async (input) => {
        const userAddress = input.userAddress as string;
        try {
            const positions = await polymarketService.getUserPositions(userAddress);
            if (!positions || positions.length === 0) {
                return `No active positions found for user: ${userAddress}`;
            }

            const results = positions.map((p: any) => {
                return `- **Token ID:** ${p.asset_id}\n  - Size: ${p.size}\n  - Average Price: ${p.avg_price}\n  - Total Value: $${(parseFloat(p.size) * parseFloat(p.avg_price)).toFixed(2)}`;
            }).join("\n\n");

            return `Positions for ${userAddress}:\n\n${results}`;
        } catch (error) {
            return `Error fetching user positions for "${userAddress}": ${error instanceof Error ? error.message : String(error)}`;
        }
    }
};

/**
 * Tool to monitor Polymarket trades in real-time via WebSocket
 */
export const monitorPolymarketTrades: ToolHandler = {
    definition: {
        name: "monitor_polymarket_trades",
        description: "Monitor real-time trades on Polymarket for a specified duration. Identify high-value trades over a threshold.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                durationSeconds: {
                    type: Type.NUMBER,
                    description: "Duration to monitor in seconds (max 60)"
                },
                thresholdUsd: {
                    type: Type.NUMBER,
                    description: "USD threshold for flagging large trades (default: 1000)"
                }
            },
            required: ["durationSeconds"]
        }
    },
    execute: async (input) => {
        const duration = Math.min(input.durationSeconds as number, 60);
        const threshold = (input.thresholdUsd as number) || 1000;
        
        const WS = (await import("ws")).default;

        return new Promise((resolve) => {
            const ws = new WS("wss://ws-live-data.polymarket.com");
            const largeTrades: any[] = [];
            let totalTrades = 0;

            const timeout = setTimeout(() => {
                ws.close();
                if (largeTrades.length === 0) {
                    resolve(`Monitoring complete (${duration}s). Observed ${totalTrades} trades. No trades exceeded $${threshold}.`);
                } else {
                    const results = largeTrades.map(t => `- **$${t.totalUsd.toLocaleString()}** on "${t.title}" (Outcome: ${t.outcome}, Trader: ${t.proxyWallet})`).join("\n");
                    resolve(`Monitoring complete (${duration}s). Observed ${totalTrades} trades. Detected ${largeTrades.length} large trades:\n\n${results}`);
                }
            }, duration * 1000);

            ws.on("open", () => {
                ws.send(JSON.stringify({
                    action: "subscribe",
                    subscriptions: [
                        {
                            topic: "activity",
                            type: "trades"
                        }
                    ]
                }));
            });

            ws.on("message", (msg: any) => {
                try {
                    const data = JSON.parse(msg.toString());
                    if (data.topic === "activity" && data.type === "trades") {
                        const item = data.payload;
                        if (item && item.price && item.size) {
                            totalTrades++;
                            const price = parseFloat(item.price);
                            const size = parseFloat(item.size);
                            const totalUsd = price * size;

                            if (totalUsd >= threshold) {
                                largeTrades.push({
                                    ...item,
                                    totalUsd
                                });
                            }
                        }
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            });

            ws.on("error", (err: any) => {
                clearTimeout(timeout);
                resolve(`WebSocket error during monitoring: ${err.message}`);
            });
        });
    }
};

/**
 * Tool to get top trending/high volume markets on Polymarket
 */
export const getPolymarketTopMarkets: ToolHandler = {
    definition: {
        name: "get_polymarket_top_markets",
        description: "Fetch the current top trending or highest volume markets on Polymarket. Useful for getting a general overview without a specific query.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                limit: {
                    type: Type.NUMBER,
                    description: "Number of top markets to return (default: 10, max: 20)"
                }
            }
        }
    },
    execute: async (input) => {
        const limit = Math.min((input.limit as number) || 10, 20);
        try {
            const markets = await polymarketService.getTopMarkets(limit);
            if (markets.length === 0) {
                return "No top markets found at the moment.";
            }

            const results = markets.map(m => {
                const outcomes = Array.isArray(m.outcomes) ? m.outcomes.join(", ") : "N/A";
                const prices = Array.isArray(m.outcomePrices) ? m.outcomePrices.join(", ") : "N/A";
                return `- **${m.question}**\n  - ID: ${m.id}\n  - Outcomes: ${outcomes}\n  - Prices: ${prices}\n  - Volume: $${Number(m.volume).toLocaleString()}`;
            }).join("\n\n");

            return `Current Top ${markets.length} Markets by Volume:\n\n${results}`;
        } catch (error) {
            return `Error fetching top markets: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
};


