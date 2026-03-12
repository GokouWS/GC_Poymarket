import { config } from "./config.js";
import { bot } from "./bot.js";
import { loadTools } from "./tools/index.js";
import { mcpManager } from "./mcp/clientManager.js";
import { startHeartbeat } from "./heartbeat.js";
import { monitorService } from "./services/polymarket-monitor-service.js";

// ── Startup ─────────────────────────────────────────────────────────

async function main() {
    console.log("🦀 Gravity Claw — Level 1 Foundation");
    console.log("─".repeat(40));

    // Register all tools before starting the bot
    await loadTools();

    // Start background services
    monitorService.start();

    // Log safe startup info (never tokens/keys)
    const me = await bot.api.getMe();
    console.log(`🤖 Bot: @${me.username}`);
    console.log(`🔒 Allowed users: ${config.allowedUserIds.size} user(s)`);
    console.log(`🧠 Model: ${config.model}`);
    console.log(`🔁 Max iterations: ${config.maxIterations}`);
    console.log("─".repeat(40));
    console.log("✅ Listening for messages via long-polling...\n");

    // Start long-polling (no webhook, no HTTP server)
    bot.start({
        onStart: () => { },
        allowed_updates: ["message"],
    });

    // Start the proactive heartbeat scheduler
    startHeartbeat();
}

// ── Graceful Shutdown ───────────────────────────────────────────────

function shutdown(signal: string) {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    bot.stop();
    mcpManager.disconnectAll().finally(() => {
        process.exit(0);
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ── Run ─────────────────────────────────────────────────────────────

main().catch((error) => {
    console.error("💀 Fatal error:", error);
    process.exit(1);
});
