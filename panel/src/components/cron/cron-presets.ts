export interface PresetOption {
  id: string;
  name: string;
  schedule: string;
  description: string;
}

export const CRON_PRESETS: PresetOption[] = [
  { id: "every_minute", name: "Every minute", schedule: "* * * * *", description: "Runs once every minute" },
  { id: "every_5_minutes", name: "Every 5 minutes", schedule: "*/5 * * * *", description: "Runs every 5 minutes" },
  { id: "every_15_minutes", name: "Every 15 minutes", schedule: "*/15 * * * *", description: "Runs every 15 minutes" },
  { id: "every_30_minutes", name: "Every 30 minutes", schedule: "*/30 * * * *", description: "Runs every 30 minutes" },
  { id: "hourly", name: "Hourly (at :00)", schedule: "0 * * * *", description: "Runs at the start of every hour" },
  { id: "daily", name: "Daily at midnight (00:00)", schedule: "0 0 * * *", description: "Runs once a day at 00:00" },
  { id: "daily_noon", name: "Daily at noon (12:00)", schedule: "0 12 * * *", description: "Runs once a day at 12:00" },
  { id: "weekly", name: "Weekly (Sunday at 00:00)", schedule: "0 0 * * 0", description: "Runs every Sunday at midnight" },
  { id: "monthly", name: "Monthly (1st at 00:00)", schedule: "0 0 1 * *", description: "Runs on the 1st of every month at midnight" },
  { id: "custom", name: "Custom cron expression", schedule: "", description: "Enter custom 5-field expression" },
];

/**
 * Returns a human-friendly description of standard cron expressions.
 */
export function describeCron(schedule: string): string {
  const trimmed = schedule.trim();
  if (!trimmed) return "No schedule defined";

  for (const preset of CRON_PRESETS) {
    if (preset.schedule === trimmed) {
      return preset.description;
    }
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) {
    return "Invalid expression: must have 5 fields (minute, hour, day, month, weekday)";
  }

  const [min, hr, day, mo, wd] = parts;

  // Simple heuristics for readable English
  if (min === "*/5" && hr === "*" && day === "*" && mo === "*" && wd === "*") return "Every 5 minutes";
  if (min === "*/10" && hr === "*" && day === "*" && mo === "*" && wd === "*") return "Every 10 minutes";
  if (min === "*/15" && hr === "*" && day === "*" && mo === "*" && wd === "*") return "Every 15 minutes";
  if (min === "*/30" && hr === "*" && day === "*" && mo === "*" && wd === "*") return "Every 30 minutes";
  if (min === "0" && hr === "*" && day === "*" && mo === "*" && wd === "*") return "Every hour at minute 0";
  if (min === "0" && hr !== "*" && !hr.includes("/") && day === "*" && mo === "*" && wd === "*") {
    return `Daily at ${hr.padStart(2, "0")}:00`;
  }
  if (!min.includes("/") && !min.includes("*") && hr !== "*" && !hr.includes("/") && day === "*" && mo === "*" && wd === "*") {
    return `Daily at ${hr.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }

  return `Custom: Minute ${min}, Hour ${hr}, Day ${day}, Month ${mo}, Weekday ${wd}`;
}
