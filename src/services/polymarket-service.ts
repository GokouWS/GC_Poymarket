import axios from "axios";

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
}

export class PolymarketService {
    private gammaUrl = "https://gamma-api.polymarket.com";
    private clobUrl = "https://clob.polymarket.com";
    private dataUrl = "https://data-api.polymarket.com";

    /**
     * Search for markets on Polymarket
     */
    async searchMarkets(query: string): Promise<PolymarketMarket[]> {
        try {
            const response = await axios.get(`${this.gammaUrl}/markets`, {
                params: {
                    query,
                    active: true,
                    closed: false,
                    limit: 10
                }
            });
            return this._parseMarkets(response.data as PolymarketMarket[]);
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
}

export const polymarketService = new PolymarketService();
