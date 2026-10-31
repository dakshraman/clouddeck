"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { BackupSchedule } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { shortDateTime } from "@/components/format";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type LoadState = "loading" | "ready" | "error";

export function BackupScheduleCard() {
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<BackupSchedule["frequency"]>("daily");
  const [time, setTime] = useState("03:00");
  const [weekday, setWeekday] = useState(0);
  const [keep, setKeep] = useState("7");
  const [includeDatabases, setIncludeDatabases] = useState(false);

  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applySchedule = useCallback((data: BackupSchedule) => {
    setSchedule(data);
    setEnabled(data.enabled === true);
    setFrequency(data.frequency === "weekly" ? "weekly" : "daily");
    setTime(typeof data.time === "string" && data.time !== "" ? data.time : "03:00");
    setWeekday(typeof data.weekday === "number" ? data.weekday : 0);
    setKeep(Number.isFinite(data.keep) ? String(data.keep) : "7");
    setIncludeDatabases(data.includeDatabases === true);
  }, []);

  const load = useCallback(async () => {
    setState("loading");
    setLoadError(null);
    try {
      applySchedule(await apiFetch<BackupSchedule>("/api/backups/schedule"));
      setState("ready");
    } catch (error) {
      setState("error");
      setLoadError(error instanceof Error ? error.message : "Failed to load the schedule");
    }
  }, [applySchedule]);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = saving || running;

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keepValue = Number.parseInt(keep, 10);
    if (!Number.isInteger(keepValue) || keepValue < 1 || keepValue > 365) {
      setFormError("Keep must be a whole number between 1 and 365.");
      return;
    }

    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const updated = await apiFetch<BackupSchedule>("/api/backups/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          frequency,
          time,
          weekday,
          keep: keepValue,
          includeDatabases,
          uploads: [],
        }),
      });
      applySchedule(updated);
      setNotice("Schedule saved.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to save the schedule");
    } finally {
      setSaving(false);
    }
  }

  async function onRunNow() {
    setRunning(true);
    setFormError(null);
    setNotice(null);
    try {
      const { started } = await apiFetch<{ started: number }>("/api/backups/schedule/run", {
        method: "POST",
      });
      setNotice(`${started} backup${started === 1 ? "" : "s"} started.`);
      // Refresh the run timestamps without touching the form the user may be
      // editing.
      try {
        setSchedule(await apiFetch<BackupSchedule>("/api/backups/schedule"));
      } catch {
        // The run itself succeeded; a stale status line is acceptable.
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to start the run");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>
            Recurring backups of every site (and optionally every database). Older scheduled
            archives beyond the keep count are pruned automatically; manual backups are never
            pruned.
          </CardDescription>
        </div>
        {schedule ? (
          <Badge variant={schedule.enabled ? "green" : "neutral"}>
            {schedule.enabled ? "Enabled" : "Disabled"}
          </Badge>
        ) : null}
      </CardHeader>

      <CardBody className="grid gap-5">
        {state === "loading" ? (
          <div className="grid gap-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : state === "error" ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError ?? "Failed to load the schedule"}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : (
          <form onSubmit={onSave} className="grid gap-5 sm:max-w-xl">
            <label className="flex items-start gap-2 text-sm text-foreground/80">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
              />
              <span>
                Enable scheduled backups
                <span className="block text-xs text-muted-foreground">
                  When due, the agent starts one backup task per site and optionally per database.
                </span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="schedule-frequency">Frequency</Label>
                <Select
                  id="schedule-frequency"
                  value={frequency}
                  onChange={(event) =>
                    setFrequency(event.target.value === "weekly" ? "weekly" : "daily")
                  }
                  disabled={busy}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="schedule-time">Time (server local)</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  disabled={busy}
                  className="font-mono"
                />
              </div>

              {frequency === "weekly" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="schedule-weekday">Weekday</Label>
                  <Select
                    id="schedule-weekday"
                    value={String(weekday)}
                    onChange={(event) => setWeekday(Number(event.target.value))}
                    disabled={busy}
                  >
                    {WEEKDAYS.map((name, index) => (
                      <option key={name} value={index}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}

              <div className="grid gap-1.5">
                <Label htmlFor="schedule-keep">Keep per source</Label>
                <Input
                  id="schedule-keep"
                  type="number"
                  min={1}
                  max={365}
                  value={keep}
                  onChange={(event) => setKeep(event.target.value)}
                  disabled={busy}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Scheduled archives kept per site or database (1–365).
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground/80">
              <input
                type="checkbox"
                checked={includeDatabases}
                onChange={(event) => setIncludeDatabases(event.target.checked)}
                disabled={busy}
                className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
              />
              Include databases
            </label>

            {formError ? <Alert variant="error">{formError}</Alert> : null}
            {notice ? <Alert variant="success">{notice}</Alert> : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={saving} disabled={busy}>
                Save schedule
              </Button>
              <Button
                variant="secondary"
                onClick={() => void onRunNow()}
                loading={running}
                disabled={busy}
              >
                Run now
              </Button>
              <p className="text-xs text-muted-foreground">
                Run now uses the saved schedule and does not change the next run.
              </p>
            </div>

            <div className="grid gap-1 border-t border-border pt-4 text-xs text-muted-foreground">
              <span>
                Last run:{" "}
                {schedule?.lastRunAt ? shortDateTime(schedule.lastRunAt) : "never"}
              </span>
              <span>
                Next run:{" "}
                {enabled
                  ? schedule?.nextRunAt
                    ? shortDateTime(schedule.nextRunAt)
                    : "—"
                  : "disabled"}
              </span>
              {schedule?.lastError ? (
                <span className="text-red-600 dark:text-red-400">Last error: {schedule.lastError}</span>
              ) : null}
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
