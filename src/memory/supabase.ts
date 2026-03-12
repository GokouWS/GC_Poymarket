import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

// ── Client ──────────────────────────────────────────────────────────

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

// ── Types ───────────────────────────────────────────────────────────

export interface TelemetryEvent {
    id?: string;
    event_type: "conversation_started" | "message_received" | "message_sent" | "tool_used" | "error" | "daily_heartbeat";
    chat_id: number;
    metadata: Record<string, any>;
    created_at?: string;
}

// ── Telemetry API ───────────────────────────────────────────────────

/**
 * Log a telemetry event (Tier 3 Analytical Memory)
 * This runs completely detached from the core conversational flow.
 */
export async function logTelemetry(
    eventType: TelemetryEvent["event_type"],
    chatId: number,
    metadata: Record<string, any> = {}
): Promise<void> {
    try {
        const { error } = await supabase
            .from("telemetry_events")
            .insert({
                event_type: eventType,
                chat_id: chatId,
                metadata,
            });

        if (error) {
            console.error(`[Telemetry Error] Failed to log ${eventType}:`, error.message);
        }
    } catch (err) {
        console.error(`[Telemetry Exception] Failed to log ${eventType}:`, err);
    }
}
