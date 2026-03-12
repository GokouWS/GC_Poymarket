import { Bot } from "grammy";
import { config } from "./config.js";
import { runAgentLoop } from "./agent.js";
import { transcribeVoice } from "./transcribe.js";

// ── Bot Instance ────────────────────────────────────────────────────

export const bot = new Bot(config.telegramBotToken);

// ── Security Middleware — User ID Whitelist ──────────────────────────
// This runs FIRST on every update. Non-whitelisted users are silently ignored.

bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;

    if (!userId || !config.allowedUserIds.has(userId)) {
        // 🔒 Silently drop — no response, no acknowledgment
        return;
    }

    await next();
});

// ── Message Handler ─────────────────────────────────────────────────

bot.on("message:text", async (ctx) => {
    const userMessage = ctx.message.text;
    console.log(`📩 Message from ${ctx.from.first_name} (${ctx.from.id}): ${userMessage.slice(0, 100)}`);

    // Show "typing..." indicator while processing
    await ctx.replyWithChatAction("typing");

    try {
        const response = await runAgentLoop(userMessage, ctx.chat.id);

        // Telegram has a 4096 character limit per message
        if (response.length <= 4096) {
            await ctx.reply(response, { parse_mode: "Markdown" }).catch(() =>
                // Fallback to plain text if Markdown parsing fails
                ctx.reply(response),
            );
        } else {
            // Split long responses into chunks
            const chunks = splitMessage(response, 4096);
            for (const chunk of chunks) {
                await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(() => ctx.reply(chunk));
            }
        }
    } catch (error) {
        console.error("❌ Agent error:", error);
        await ctx.reply("⚠️ Something went wrong processing your message. Check the console for details.");
    }
});

// ── Voice Message Handler ───────────────────────────────────────────

bot.on("message:voice", async (ctx) => {
    console.log(`🎤 Voice message from ${ctx.from.first_name} (${ctx.from.id}), duration: ${ctx.message.voice.duration}s`);

    await ctx.replyWithChatAction("typing");

    try {
        // 1. Get the file URL from Telegram
        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

        // 2. Transcribe the voice message
        const transcription = await transcribeVoice(fileUrl);

        if (!transcription) {
            await ctx.reply("🎙️ I couldn't make out any words in that voice message.");
            return;
        }

        // 3. Echo the transcription
        await ctx.reply(`🎙️ *You said:*\n_"${transcription}"_`, { parse_mode: "Markdown" }).catch(() =>
            ctx.reply(`🎙️ You said: "${transcription}"`),
        );

        // 4. Feed to Claude and reply
        await ctx.replyWithChatAction("typing");
        const response = await runAgentLoop(transcription, ctx.chat.id);

        if (response.length <= 4096) {
            await ctx.reply(response, { parse_mode: "Markdown" }).catch(() =>
                ctx.reply(response),
            );
        } else {
            const chunks = splitMessage(response, 4096);
            for (const chunk of chunks) {
                await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(() => ctx.reply(chunk));
            }
        }
    } catch (error) {
        console.error("❌ Voice processing error:", error);
        await ctx.reply("⚠️ Something went wrong processing your voice message. Check the console for details.");
    }
});

// ── Helper ──────────────────────────────────────────────────────────

function splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        // Try to split at a newline near the limit
        let splitIndex = remaining.lastIndexOf("\n", maxLength);
        if (splitIndex === -1 || splitIndex < maxLength / 2) {
            // Fallback: split at a space
            splitIndex = remaining.lastIndexOf(" ", maxLength);
        }
        if (splitIndex === -1 || splitIndex < maxLength / 2) {
            // Last resort: hard split
            splitIndex = maxLength;
        }

        chunks.push(remaining.slice(0, splitIndex));
        remaining = remaining.slice(splitIndex).trimStart();
    }

    return chunks;
}
