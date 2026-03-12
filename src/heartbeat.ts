import cron from "node-cron";
import { config } from "./config.js";
import { runProactiveAgentLoop } from "./agent.js";
import { bot } from "./bot.js";

const MARKET_BRIEFING_PROMPT = `
You are providing the daily "Polymarket Morning Intelligence" briefing. 
Your goal is to give the user a high-signal overview of what happened while they were asleep.

Instructions:
1. Use your tools to find the top trending markets on Polymarket.
2. Summarize any "Whale" or "Critical" signals detected by the background monitor in the last 24 hours (check recent history).
3. Identify one "Outlier" market — something obscure with unusual volume or a significant odds shift.
4. Keep the tone sharp, professional, and signal-heavy. Mirror the "Prediction Market Savant" persona from soul.md.
5. Use bullet points for readability. Be concise.
`;

export function startHeartbeat() {
    console.log("⏱️  Starting proactive daily heartbeat (Scheduled for 7:00 AM daily)");

    // Run every day at 7:00 AM
    cron.schedule("0 7 * * *", async () => {
        console.log("⏰ Heartbeat triggered! Running proactive loop for all allowed users.");
        await executeHeartbeat();
    });
}

export async function executeHeartbeat() {
    for (const userId of config.allowedUserIds) {
        try {
            console.log(`🤖 Generating market briefing for user ${userId}...`);
            const message = await runProactiveAgentLoop(MARKET_BRIEFING_PROMPT, userId);

            console.log(`📡 Sending market briefing to ${userId}...`);
            await bot.api.sendMessage(userId, message);
        } catch (error) {
            console.error(`❌ Failed to send market briefing to ${userId}:`, error);
        }
    }
}
