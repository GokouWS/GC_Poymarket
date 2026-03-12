import { config } from "./config.js";

// ── ElevenLabs TTS ──────────────────────────────────────────────────

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// Default voice — "Rachel" (clear, natural female voice).
// You can change this to any ElevenLabs voice ID.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/**
 * Convert text to speech using ElevenLabs and return a raw audio Buffer (mp3).
 */
export async function textToSpeech(
    text: string,
    voiceId: string = DEFAULT_VOICE_ID,
): Promise<Buffer> {
    const response = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
            "xi-api-key": config.elevenlabsApiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
        },
        body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
            },
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => "unknown");
        throw new Error(`ElevenLabs API error ${response.status}: ${errorBody}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
