"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CronJob } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CRON_PRESETS, describeCron } from "./cron-presets";
import { X, Clock, Terminal } from "lucide-react";

interface CronJobModalProps {
  job: CronJob | null; // null when creating
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    command: string;
    schedule: string;
    preset?: string;
    minute?: string;
    hour?: string;
    day?: string;
    month?: string;
    weekday?: string;
    title?: string;
    comment?: string;
    user: string;
    enabled: boolean;
  }) => Promise<void>;
}

export function CronJobModal({ job, open, onClose, onSave }: CronJobModalProps) {
  const isEditing = job !== null;

  const [preset, setPreset] = useState("every_5_minutes");
  const [schedule, setSchedule] = useState("*/5 * * * *");
  const [minute, setMinute] = useState("*/5");
  const [hour, setHour] = useState("*");
  const [day, setDay] = useState("*");
  const [month, setMonth] = useState("*");
  const [weekday, setWeekday] = useState("*");

  const [command, setCommand] = useState("");
  const [title, setTitle] = useState("");
  const [user, setUser] = useState("root");
  const [enabled, setEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when modal opens or job changes
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (job) {
      setTitle(job.title || job.comment || "");
      setCommand(job.command);
      setUser(job.user || "root");
      setEnabled(job.enabled !== false);
      setSchedule(job.schedule);
      setMinute(job.minute || "*");
      setHour(job.hour || "*");
      setDay(job.day || "*");
      setMonth(job.month || "*");
      setWeekday(job.weekday || "*");

      // Check if matches a preset
      const match = CRON_PRESETS.find((p) => p.schedule === job.schedule);
      setPreset(match ? match.id : "custom");
    } else {
      setTitle("");
      setCommand("");
      setUser("root");
      setEnabled(true);
      setPreset("every_5_minutes");
      setSchedule("*/5 * * * *");
      setMinute("*/5");
      setHour("*");
      setDay("*");
      setMonth("*");
      setWeekday("*");
    }
  }, [open, job]);

  if (!open) return null;

  function handlePresetChange(newPresetId: string) {
    setPreset(newPresetId);
    if (newPresetId !== "custom") {
      const found = CRON_PRESETS.find((p) => p.id === newPresetId);
      if (found && found.schedule) {
        setSchedule(found.schedule);
        const parts = found.schedule.split(" ");
        if (parts.length === 5) {
          setMinute(parts[0]);
          setHour(parts[1]);
          setDay(parts[2]);
          setMonth(parts[3]);
          setWeekday(parts[4]);
        }
      }
    }
  }

  function handleFieldChange(field: "min" | "hr" | "day" | "mo" | "wd", value: string) {
    setPreset("custom");
    const m = field === "min" ? value : minute;
    const h = field === "hr" ? value : hour;
    const d = field === "day" ? value : day;
    const mo = field === "mo" ? value : month;
    const w = field === "wd" ? value : weekday;

    if (field === "min") setMinute(value);
    if (field === "hr") setHour(value);
    if (field === "day") setDay(value);
    if (field === "mo") setMonth(value);
    if (field === "wd") setWeekday(value);

    setSchedule(`${m || "*"} ${h || "*"} ${d || "*"} ${mo || "*"} ${w || "*"}`);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!command.trim()) {
      setError("Command is required.");
      return;
    }
    const finalSchedule = schedule.trim();
    if (!finalSchedule || finalSchedule.split(/\s+/).length !== 5) {
      setError("Please provide a valid 5-field cron expression.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        command: command.trim(),
        schedule: finalSchedule,
        preset,
        minute: minute.trim() || "*",
        hour: hour.trim() || "*",
        day: day.trim() || "*",
        month: month.trim() || "*",
        weekday: weekday.trim() || "*",
        title: title.trim(),
        comment: title.trim(),
        user,
        enabled,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save scheduled task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Clock size={20} className="text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              {isEditing ? "Edit Scheduled Task" : "Add Scheduled Task"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground cursor-pointer rounded-md p-1"
            disabled={saving}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error ? <Alert variant="error">{error}</Alert> : null}

          {/* Title / Description */}
          <div className="grid gap-1.5">
            <Label htmlFor="cron-title">Task Name / Description</Label>
            <Input
              id="cron-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Nightly Database Backup or Cache Prune"
              disabled={saving}
            />
          </div>

          {/* Preset Selector */}
          <div className="grid gap-1.5">
            <Label htmlFor="cron-preset">Schedule Preset</Label>
            <Select
              id="cron-preset"
              value={preset}
              onChange={(e) => handlePresetChange(e.target.value)}
              disabled={saving}
            >
              {CRON_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.schedule ? `(${p.schedule})` : ""}
                </option>
              ))}
            </Select>
          </div>

          {/* Five Cron Expression Fields */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cron Expression
              </span>
              <span className="font-mono text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                {schedule}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2 pt-1 text-center">
              <div>
                <Label htmlFor="field-min" className="text-[11px] text-muted-foreground block truncate">
                  Min (0-59)
                </Label>
                <Input
                  id="field-min"
                  value={minute}
                  onChange={(e) => handleFieldChange("min", e.target.value)}
                  className="font-mono text-center text-xs mt-1 px-1 h-8"
                  placeholder="*"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="field-hr" className="text-[11px] text-muted-foreground block truncate">
                  Hour (0-23)
                </Label>
                <Input
                  id="field-hr"
                  value={hour}
                  onChange={(e) => handleFieldChange("hr", e.target.value)}
                  className="font-mono text-center text-xs mt-1 px-1 h-8"
                  placeholder="*"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="field-day" className="text-[11px] text-muted-foreground block truncate">
                  Day (1-31)
                </Label>
                <Input
                  id="field-day"
                  value={day}
                  onChange={(e) => handleFieldChange("day", e.target.value)}
                  className="font-mono text-center text-xs mt-1 px-1 h-8"
                  placeholder="*"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="field-month" className="text-[11px] text-muted-foreground block truncate">
                  Month (1-12)
                </Label>
                <Input
                  id="field-month"
                  value={month}
                  onChange={(e) => handleFieldChange("mo", e.target.value)}
                  className="font-mono text-center text-xs mt-1 px-1 h-8"
                  placeholder="*"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="field-weekday" className="text-[11px] text-muted-foreground block truncate">
                  Weekday (0-7)
                </Label>
                <Input
                  id="field-weekday"
                  value={weekday}
                  onChange={(e) => handleFieldChange("wd", e.target.value)}
                  className="font-mono text-center text-xs mt-1 px-1 h-8"
                  placeholder="*"
                  disabled={saving}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground pt-1 flex items-center gap-1.5">
              <span className="font-semibold text-foreground">Meaning:</span>
              <span>{describeCron(schedule)}</span>
            </p>
          </div>

          {/* Command to Run */}
          <div className="grid gap-1.5">
            <Label htmlFor="cron-cmd">Command to Execute</Label>
            <div className="relative">
              <Input
                id="cron-cmd"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="/usr/bin/php /var/www/site/artisan schedule:run"
                autoComplete="off"
                spellCheck={false}
                disabled={saving}
                className="font-mono text-xs pl-8"
              />
              <Terminal
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Standard shell command executed by cron daemon or test runner.
            </p>
          </div>

          {/* User & Enabled status */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="grid gap-1.5">
              <Label htmlFor="cron-user">Run As User</Label>
              <Select
                id="cron-user"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                disabled={saving}
              >
                <option value="root">root (superuser)</option>
                <option value="www-data">www-data (web user)</option>
                <option value="www">www</option>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Active Status</Label>
              <div className="flex items-center h-9">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    disabled={saving}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span>{enabled ? "Enabled" : "Disabled (paused)"}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {isEditing ? "Save Changes" : "Create Task"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
