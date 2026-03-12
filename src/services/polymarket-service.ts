import axios from "axios";
import { config } from "../config.js";

export interface PolymarketMarket {
    id: string;
    question: string;
    description: string;
    outcomes: string[];
    outcomePrices: string[];
    volume: string;
    active: boolean;
    closed: boolean;
    clobTokenIds: string[];
    category?: string;
}

export class PolymarketService {
    private gammaUrl = "https://gamma-api.polymarket.com";
    private clobUrl = "https://clob.polymarket.com";
    private dataUrl = "https://data-api.polymarket.com";

    /**
     * Search for markets on Polymarket
     */
    async searchMarkets(query: string, seriousOnly: boolean = false): Promise<PolymarketMarket[]> {
        try {
            const response = await axios.get(`${this.gammaUrl}/markets`, {
                params: {
                    query,
                    active: true,
                    closed: false,
                    limit: seriousOnly ? 40 : 10
                }
            });
            
            let markets = response.data as any[];
            
            if (seriousOnly) {
                const noiseKeywords = ["gta vi", "gta 6", "video game", "memecoin", "celebrity", "pop culture", "movie", "film"];
                markets = markets.filter(m => {
                    const content = `${m.question} ${m.description || ""}`.toLowerCase();
                    return !noiseKeywords.some(noise => content.includes(noise));
                });
                
                // Prioritize high volume serious markets
                markets.sort((a, b) => parseFloat(b.volume || "0") - parseFloat(a.volume || "0"));
                markets = markets.slice(0, 10);
            }

            return this._parseMarkets(markets);
        } catch (error) {
            console.error("Polymarket searchMarkets error:", error);
            throw error;
        }
    }

    /**
     * Get top trending/high volume markets
     */
    async getTopMarkets(limit: number = 10): Promise<PolymarketMarket[]> {
        try {
            const response = await axios.get(`${this.gammaUrl}/markets`, {
                params: {
                    active: true,
                    closed: false,
                    limit: limit,
                    order: "volume",
                    ascending: false
                }
            });
            return this._parseMarkets(response.data as PolymarketMarket[]);
        } catch (error) {
            console.error("Polymarket getTopMarkets error:", error);
            throw error;
        }
    }

    private _parseMarkets(markets: any[]): PolymarketMarket[] {
        return markets.map(m => {
            if (typeof m.outcomePrices === "string") {
                try {
                    m.outcomePrices = JSON.parse(m.outcomePrices);
                } catch (e) {
                    m.outcomePrices = [];
                }
            }
            if (typeof m.outcomes === "string") {
                try {
                    m.outcomes = JSON.parse(m.outcomes);
                } catch (e) {
                    m.outcomes = [];
                }
            }
            return m;
        });
    }

    /**
     * Get detailed information for a specific market
     */
    async getMarketDetails(marketId: string): Promise<PolymarketMarket> {
        try {
            const response = await axios.get(`${this.gammaUrl}/markets/${marketId}`);
            const data = response.data;
            
            // Gamma API sometimes returns outcomePrices as a string "[...]"
            if (typeof data.outcomePrices === "string") {
                try {
                    data.outcomePrices = JSON.parse(data.outcomePrices);
                } catch (e) {
                    console.warn(`Failed to parse outcomePrices for market ${marketId}`);
                    data.outcomePrices = [];
                }
            }

            if (typeof data.outcomes === "string") {
                try {
                    data.outcomes = JSON.parse(data.outcomes);
                } catch (e) {
                    console.warn(`Failed to parse outcomes for market ${marketId}`);
                    data.outcomes = [];
                }
            }
            
            return data;
        } catch (error) {
            console.error("Polymarket getMarketDetails error:", error);
            throw error;
        }
    }

    /**
     * Get user positions for a wallet address
     */
    async getUserPositions(userAddress: string): Promise<any> {
        try {
            const response = await axios.get(`${this.dataUrl}/positions`, {
                params: {
                    user: userAddress
                }
            });
            return response.data;
        } catch (error) {
            console.error("Polymarket getUserPositions error:", error);
            throw error;
        }
    }

    /**
     * Get order book for a specific token
     */
    async getOrderBook(tokenId: string): Promise<any> {
        try {
            const response = await axios.get(`${this.clobUrl}/book`, {
                params: {
                    token_id: tokenId
                }
            });
            return response.data;
        } catch (error) {
            console.error("Polymarket getOrderBook error:", error);
            throw error;
        }
    }

    /**
     * Get the first transaction date and funding source using Polygonscan
     */
    async getWalletAgeAndFunding(address: string): Promise<{ firstTxDate: Date | null, fundingSource: string | null }> {
        if (!config.polygonscanApiKey) {
            return { firstTxDate: null, fundingSource: null };
        }

        try {
            const response = await axios.get("https://api.polygonscan.com/api", {
                params: {
                    module: "account",
                    action: "txlist",
                    address: address,
                    startblock: 0,
                    endblock: 99999999,
                    page: 1,
                    offset: 10, // Get first 10 to identify funding
                    sort: "asc",
                    apikey: config.polygonscanApiKey
                }
            });

            if (response.data.status !== "1" || !response.data.result.length) {
                return { firstTxDate: null, fundingSource: null };
            }

            const firstTx = response.data.result[0];
            const firstTxDate = new Date(parseInt(firstTx.timeStamp) * 1000);
            
            // Try to identify if funding is from a CEX (common ones have labels usually, or we look at the sender)
            const fundingSource = firstTx.from.toLowerCase() === address.toLowerCase() ? "self" : firstTx.from;

            return { firstTxDate, fundingSource };
        } catch (error) {
            console.error("Polygonscan getWalletAgeAndFunding error:", error);
            return { firstTxDate: null, fundingSource: null };
        }
    }

    /**
     * Get total historical volume and trade count from Polymarket Data API
     */
    async getWalletHistoricalStats(address: string): Promise<{ totalVolume: number, tradeCount: number }> {
        try {
            // Polymarket Data API history
            const response = await axios.get(`${this.dataUrl}/history`, {
                params: {
                    user: address
                }
            });

            const trades = response.data || [];
            let totalVolume = 0;
            
            for (const trade of trades) {
                totalVolume += Math.abs(parseFloat(trade.usdValue || "0"));
            }

            return {
                totalVolume,
                tradeCount: trades.length
            };
        } catch (error) {
            console.error("Polymarket getWalletHistoricalStats error:", error);
            return { totalVolume: 0, tradeCount: 0 };
        }
    }

    /**
     * Analyze topic proximity (category concentration) for a wallet
     */
    async getWalletTopicProximity(address: string): Promise<Record<string, number>> {
        try {
            const response = await axios.get(`${this.dataUrl}/history`, {
                params: { user: address, limit: 50 }
            });

            const trades = response.data || [];
            const categoryCounts: Record<string, number> = {};
            
            // Limit deep category fetching to optimize performance
            const sampleTrades = trades.slice(0, 20);
            
            for (const trade of sampleTrades) {
                // Some trades might have a markerAddress or marketId
                const marketId = trade.marketId || trade.asset;
                if (!marketId) continue;

                try {
                    // This is intensive; in production we should cache market categories
                    const market = await this.getMarketDetails(marketId);
                    const category = market.category || "General";
                    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
                } catch (e) {
                    // Skip if market details fail
                }
            }

            // Convert to percentages
            const total = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
            if (total === 0) return {};

            const proximity: Record<string, number> = {};
            for (const [cat, count] of Object.entries(categoryCounts)) {
                proximity[cat] = Math.round((count / total) * 100);
            }

            return proximity;
        } catch (error) {
            console.error("Polymarket getWalletTopicProximity error:", error);
            return {};
        }
    }
}

export const polymarketService = new PolymarketService();
