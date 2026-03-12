import type { ToolHandler } from "./index.js";
import { Type } from "@google/genai";

const getCurrentTime: ToolHandler = {
    definition: {
        name: "get_current_time",
        description:
            "Get the current date and time. Optionally specify a timezone in IANA format (e.g. 'America/New_York', 'Asia/Tokyo').",
        parameters: {
            type: Type.OBJECT,
            properties: {
                timezone: {
                    type: Type.STRING,
                    description:
                        "IANA timezone identifier (e.g. 'Europe/London', 'US/Pacific'). Defaults to the system timezone if omitted.",
                },
            },
            required: [],
        },
    },

    async execute(input, _context) {
        const tz = (input.timezone as string) || undefined;
        const now = new Date();

        try {
            const formatted = now.toLocaleString("en-US", {
                timeZone: tz,
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZoneName: "long",
            });

            return JSON.stringify({
                iso: now.toISOString(),
                formatted,
                timezone: tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
        } catch {
            return JSON.stringify({
                error: `Invalid timezone: "${tz}". Use IANA format like "America/New_York".`,
            });
        }
    },
};

export default getCurrentTime;
