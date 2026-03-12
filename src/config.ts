import "dotenv/config";

// ── Required environment variables ──────────────────────────────────

interface Config {
    /** Telegram bot token from @BotFather */
    telegramBotToken: string;
    /** Google Gemini API key */
    geminiApiKey: string;
    /** OpenAI API key (for Whisper transcription) */
    openaiApiKey: string;
    /** ElevenLabs API key (for TTS voice messages) */
    elevenlabsApiKey: string;
    /** Supabase URL */
    supabaseUrl: string;
    /** Supabase Anon Key */
    supabaseAnonKey: string;
    /** Pinecone API Key */
    pineconeApiKey: string;
    /** Pinecone Index Name */
    pineconeIndexName: string;
    /** Set of allowed Telegram user IDs */
    allowedUserIds: Set<number>;
    /** Gemini model to use */
    model: string;
    /** Max agent loop iterations (safety limit) */
    maxIterations: number;
    /** USD threshold for automated background alerts */
    monitorThresholdUsd: number;
    /** Enable/disable the background monitor */
    monitorEnabled: boolean;
    /** Polygonscan API key for wallet age checks */
    polygonscanApiKey?: string;
}

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        console.error(`❌ Missing required environment variable: ${name}`);
        console.error(`   Copy .env.example to .env and fill in your values.`);
        process.exit(1);
    }
    return value;
}

function parseUserIds(raw: string): Set<number> {
    const ids = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);

    if (ids.length === 0 || ids.some(isNaN)) {
        console.error(`❌ ALLOWED_USER_IDS must be comma-separated numeric Telegram user IDs.`);
        process.exit(1);
    }

    return new Set(ids);
}

export const config: Config = {
    telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
    geminiApiKey: requireEnv("GEMINI_API_KEY"),
    openaiApiKey: requireEnv("OPENAI_API_KEY"),
    elevenlabsApiKey: requireEnv("ELEVENLABS_API_KEY"),
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseAnonKey: requireEnv("SUPABASE_ANON_KEY"),
    pineconeApiKey: requireEnv("PINECONE_API_KEY"),
    pineconeIndexName: requireEnv("PINECONE_INDEX_NAME"),
    allowedUserIds: parseUserIds(requireEnv("ALLOWED_USER_IDS")),
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
    maxIterations: Number(process.env.MAX_ITERATIONS) || 10,
    monitorThresholdUsd: Number(process.env.MONITOR_THRESHOLD_USD ?? "2000"),
    monitorEnabled: (process.env.MONITOR_ENABLED === "true"),
    polygonscanApiKey: process.env.POLYGONSCAN_API_KEY,
};
