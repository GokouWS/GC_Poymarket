import WebSocket from "ws";
import { config } from "../config.js";
import { bot } from "../bot.js";
import { polymarketService } from "./polymarket-service.js";

export class PolymarketMonitorService {
    private ws: WebSocket | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private isRunning = false;
    private positionCache = new Map<string, { positions: any[], timestamp: number }>();
    private CACHE_TTL = 1000 * 60 * 10; // 10 minutes cache

    private cacheCleanupInterval: NodeJS.Timeout | null = null;

    constructor() {}

    /**
     * Start the background monitoring service
     */
    start() {
        if (!config.monitorEnabled) {
            console.log("ℹ️ Polymarket Monitor is disabled in config.");
            return;
        }

        if (this.isRunning) return;
        this.isRunning = true;
        console.log("🚀 Starting Polymarket Background Monitor...");
        this.connect();

        // Periodically clean up the cache to prevent memory leaks in long-running sessions
        this.cacheCleanupInterval = setInterval(() => this.cleanupCache(), 1000 * 60 * 60); // Every hour
    }

    private cleanupCache() {
        const now = Date.now();
        let removed = 0;
        for (const [address, entry] of this.positionCache.entries()) {
            if (now - entry.timestamp > this.CACHE_TTL) {
                this.positionCache.delete(address);
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`🧹 Cache cleanup: Removed ${removed} expired trader entries.`);
        }
    }

    /**
     * Stop the monitoring service
     */
    stop() {
        this.isRunning = false;
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }
        console.log("🛑 Polymarket Monitor stopped.");
    }

    private connect() {
        if (!this.isRunning) return;

        const wsUrl = "wss://ws-live-data.polymarket.com";
        this.ws = new WebSocket(wsUrl);

        this.ws.on("open", () => {
            console.log("✅ Connected to Polymarket RTDS WebSocket.");
            
            // Subscribe to activity topic for all trades
            const subscribeMsg = {
                action: "subscribe",
                subscriptions: [
                    {
                        topic: "activity",
                        type: "trades"
                    }
                ]
            };
            this.ws?.send(JSON.stringify(subscribeMsg));
        });

        this.ws.on("message", (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.topic === "activity" && message.type === "trades") {
                    this.handleMessage(message.payload);
                }
            } catch (err) {
                // Ignore parsing errors for heartbeat/system messages
            }
        });

        this.ws.on("close", () => {
            console.warn("⚠️ Polymarket WS closed. Reconnecting in 5s...");
            this.scheduleReconnect();
        });

        this.ws.on("error", (err) => {
            console.error("❌ Polymarket WS error:", err.message);
            this.ws?.terminate();
        });
    }

    private scheduleReconnect() {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
    }

    private async handleMessage(payload: any) {
        if (!payload) return;

        const price = payload.price;
        const size = payload.size;
        const tradeValue = price * size;

        // Skip small trades early
        if (tradeValue < config.monitorThresholdUsd) return;

        const title = payload.title || "Unknown Market";
        const traderAddress = payload.proxyWallet;

        console.log(`🔔 High-value trade detected: $${tradeValue.toFixed(2)} on "${title}"`);

        try {
            await this.analyzeAndNotify(payload, tradeValue);
        } catch (err) {
            console.error("Error in trade analysis:", err);
        }
    }

    private async analyzeAndNotify(payload: any, value: number) {
        const traderAddress = payload.proxyWallet;
        const title = payload.title || "Unknown Market";
        const outcome = payload.outcome || "Unknown";
        const side = payload.side || "TRADE";
        
        // Heuristic 1: Wallet Freshness Check (with caching)
        let isFreshWallet = false;
        try {
            const cached = this.positionCache.get(traderAddress);
            let positions;

            if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
                positions = cached.positions;
            } else {
                positions = await polymarketService.getUserPositions(traderAddress);
                this.positionCache.set(traderAddress, { positions, timestamp: Date.now() });
            }

            // If they have fewer than 3 active positions, consider them "Fresh"
            if (Array.isArray(positions) && positions.length < 3) {
                isFreshWallet = true;
            }
        } catch (e) {
            // Silently ignore position fetch errors
        }

        // Alert Construction
        let signalRating = "NORMAL";
        if (isFreshWallet && value >= 10000) {
            signalRating = "🚨 CRITICAL (Fresh Wallet + Whale)";
        } else if (isFreshWallet && value >= 2000) {
            signalRating = "⚠️ HIGH (Fresh Wallet)";
        } else if (value >= 50000) {
            signalRating = "🔥 WHALE (Large Accumulation)";
        }

        const message = `
🔔 *Polymarket Insider Alert*
---------------------------
🎯 *Market:* ${title}
🎲 *Trade:* ${side} ${outcome}
💰 *Value:* $${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
📊 *Signal Rating:* ${signalRating}

👤 *Trader:* \`${traderAddress}\`
🛡️ *Fresh Wallet:* ${isFreshWallet ? "Yes" : "No"}
📉 *Price:* ${payload.price.toFixed(4)}
📦 *Size:* ${payload.size.toFixed(2)}
🕒 *Time:* ${new Date().toLocaleTimeString()}

[View Market](https://polymarket.com/event/${payload.eventSlug || ""})
        `;

        // Notify all allowed users
        for (const userId of config.allowedUserIds) {
            await bot.api.sendMessage(userId, message, { 
                parse_mode: "Markdown",
                link_preview_options: { is_disabled: true }
            }).catch(err => {
                console.error(`Failed to send alert to ${userId}:`, err.message);
            });
        }
    }

}

export const monitorService = new PolymarketMonitorService();
