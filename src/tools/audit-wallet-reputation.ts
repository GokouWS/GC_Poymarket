import { Type } from "@google/genai";
import { polymarketService } from "../services/polymarket-service.js";
import { getTrackedWallet, upsertTrackedWallet } from "../memory/sqlite.js";
import type { ToolContext } from "./index.js";

export const auditWalletReputationDefinition = {
    name: "audit_wallet_reputation",
    description: "Perform a deep-dive audit on a Polymarket wallet address to identify insider behavior, historical success, and niche expertise.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            address: {
                type: Type.STRING,
                description: "The EOA or Proxy Wallet address to audit (0x...)"
            }
        },
        required: ["address"]
    }
};

export async function audit_wallet_reputation(input: Record<string, unknown>, context: ToolContext): Promise<string> {
    const address = input.address as string;
    if (!address) return "Error: Missing address parameter.";
    const addr = address.toLowerCase();

    try {
        console.log(`🔍 Deep auditing wallet: ${addr}...`);
        
        // 1. Fetch all data points in parallel
        const [positions, ageData, statistics, proximity, tracked] = await Promise.all([
            polymarketService.getUserPositions(addr),
            polymarketService.getWalletAgeAndFunding(addr),
            polymarketService.getWalletHistoricalStats(addr),
            polymarketService.getWalletTopicProximity(addr),
            Promise.resolve(getTrackedWallet(addr))
        ]);

        const firstTx = ageData.firstTxDate ? ageData.firstTxDate.toISOString().split('T')[0] : "Unknown";
        const ageDays = ageData.firstTxDate ? Math.round((Date.now() - ageData.firstTxDate.getTime()) / (1000 * 60 * 60 * 24)) : "Unknown";
        
        const activeCount = Array.isArray(positions) ? positions.length : 0;
        const totalVolume = statistics.totalVolume;
        const tradeCount = statistics.tradeCount;

        // 2. Identify Niche Concentration
        const niches = Object.entries(proximity)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([cat, pct]) => `${cat} (${pct}%)`)
            .join(", ");

        // 3. Update Database
        upsertTrackedWallet(addr, {
            total_pnl_usd: totalVolume, // Using total volume as stats proxy for now
            tags: JSON.stringify(Object.keys(proximity)),
            notes: `Deep audited on ${new Date().toISOString()}. niches: ${niches}`
        });

        // 4. Construct Report
        const report = `
=== DEEP AUDIT REPORT for ${addr} ===
📅 First Transaction: ${firstTx} (${ageDays} days ago)
💰 Funding Source: ${ageData.fundingSource || "Direct / CEX"}
📦 Active Positions: ${activeCount}
📊 Historical Stats: $${totalVolume.toLocaleString()} volume across ${tradeCount} trades
🎯 Top Niches: ${niches || "None / General"}

🛡️ MONITOR REPUTATION:
- Confidence Score: ${tracked?.insider_confidence_score || 0}/10
- First Detected: ${tracked?.first_detected_at || "Never"}
- Recent Notes: ${tracked?.notes || "No prior monitor activity."}
-----------------------------------
SIGNATURE ANALYSIS:
${tracked && totalVolume === 0 ? "⚠️ DISCREPANCY DETECTED: This wallet triggered a monitor alert recently, but the Data API hasn't indexed the trade yet. It is NOT a 'ghost town'—it's a fresh mover." : ""}
${ageDays !== "Unknown" && ageDays < 7 && activeCount < 3 ? "- 🚨 FRESH BURNER SIGNATURE: Extremely young wallet with low position count." : ""}
${Object.values(proximity).some(pct => pct > 70) ? "- ⚠️ SPECIALIST SIGNATURE: High concentration in a specific category." : ""}
${totalVolume > 100000 ? "- 🔥 RE-ACTIVATED WHALE: High historical volume but low current positions." : ""}
${activeCount === 0 && totalVolume === 0 ? "- ⚪ NEW WALLET: No prior trade history detected." : ""}
        `;

        return report.trim();
    } catch (error: any) {
        return `Error auditing wallet ${address}: ${error.message}`;
    }
}
