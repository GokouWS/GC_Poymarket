import OpenAI from "openai";
import { config } from "./config.js";

// ── OpenAI Client (Whisper only) ────────────────────────────────────

const openai = new OpenAI({ apiKey: config.openaiApiKey });

// ── Transcribe ──────────────────────────────────────────────────────

/**
 * Download a voice file from Telegram and transcribe it using
 * OpenAI Whisper. Returns the transcribed text.
 */
export async function transcribeVoice(fileUrl: string): Promise<string> {
    // 1. Download the OGG voice file from Telegram's file server
    const response = await fetch(fileUrl);

    if (!response.ok) {
        throw new Error(`Failed to download voice file: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Create a File object for the OpenAI SDK
    const file = new File([buffer], "voice.ogg", { type: "audio/ogg" });

    // 3. Send to Whisper for transcription
    const transcription = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file,
        response_format: "text",
    });

    return (transcription as unknown as string).trim();
}
