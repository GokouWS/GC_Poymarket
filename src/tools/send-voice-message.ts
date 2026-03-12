import { InputFile } from "grammy";
import { bot } from "../bot.js";
import { textToSpeech } from "../tts.js";
import fs from "fs";
import { ToolContext, ToolHandler } from "./index.js";
import { Type } from "@google/genai";

const sendVoiceMessage: ToolHandler = {
    definition: {
        name: "send_voice_message",
        description:
            "Send a voice message to the user. Use this when the user asks you to reply with audio, " +
            "speak to them, or when a voice response would be more natural or engaging. " +
            "Provide the text you want to say — it will be converted to speech and sent as a Telegram voice message.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                text: {
                    type: Type.STRING,
                    description:
                        "The text to be spoken in the voice message. Use a conversational, natural tone.",
                },
                voiceId: {
                    type: Type.STRING,
                    description:
                        "Optional: ElevenLabs voice ID to use. Defaults to the Rachel voice if not provided.",
                },
            },
            required: ["text"],
        },
    },

    async execute(input, context) {
        const text = input.text as string;

        if (!text || text.trim().length === 0) {
            return "Error: No text provided for voice message.";
        }

        console.log(`  🔊 Generating voice for: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`);

        // 1. Generate audio via ElevenLabs
        const audioBuffer = await textToSpeech(text);

        // 2. Send as voice message via Telegram
        await bot.api.sendVoice(
            context.chatId,
            new InputFile(audioBuffer, "voice.mp3"),
        );

        return `Voice message sent successfully (${audioBuffer.length} bytes). The user has heard your message.`;
    },
};

export default sendVoiceMessage;
