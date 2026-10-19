"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SiteCronJob, SiteCronResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { shortDateTime } from "@/components/format";
import { Clock, Trash2 } from "lucide-react";

export function CronCard({ domain }: { domain: string }) {
  const base = `/api/sites/${encodeURIComponent(domain)}/cron`;

  const [jobs, setJobs] = useState<SiteCronJob[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState("");
  const [command, setCommand] = useState("");
  const [comment, setComment] = useState("");
  const [runAs, setRunAs] = useState("root");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<SiteCronResponse>(base);
      setJobs(data.cron);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load cron jobs");
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = submitting || pendingDelete !== null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (schedule.trim() === "") {
      setFormError('Enter a schedule, for example "0 3 * * *".');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const payload: { schedule: string; command: string; comment?: string; runAs: string } = {
        schedule: schedule.trim(),
        command: command.trim(),
        runAs,
      };
      if (comment.trim() !== "") payload.comment = comment.trim();
      const data = await apiPost<SiteCronResponse>(base, payload);
      setJobs(data.cron);
      setSchedule("");
      setCommand("");
      setComment("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to add the cron job");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    setPendingDelete(id);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const data = await apiFetch<SiteCronResponse>(`${base}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setJobs(data.cron);
    } catch (error) {
      setRowErrors((prev) => ({
        ...prev,
        [id]: error instanceof Error ? error.message : "Failed to delete the cron job",
      }));
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Cron jobs</CardTitle>
          <CardDescription>
            Scheduled commands for this site, written to a dedicated cron.d fragment and run as the
            selected user (root or www).
          </CardDescription>
        </div>
        <Clock size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
      </CardHeader>
      <CardBody className="grid gap-5">
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cron-schedule">Schedule</Label>
              <Input
                id="cron-schedule"
                value={schedule}
                onChange={(event) => setSchedule(event.target.value)}
                placeholder="0 3 * * *"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                className="font-mono"
              />
              <p className="text-xs text-slate-500">
                <span className="font-mono">0 3 * * *</span> = daily at 03:00 — five fields:
                minute, hour, day of month, month, weekday.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cron-command">Command</Label>
              <Input
                id="cron-command"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="/usr/bin/php /www/wwwroot/example.com/cron.php"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                className="font-mono"
              />
              <p className="text-xs text-slate-500">Runs as the user selected for the job.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="cron-comment">Comment (optional)</Label>
              <Input
                id="cron-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Nightly maintenance"
                autoComplete="off"
                disabled={busy}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cron-runas">Run as</Label>
              <Select
                id="cron-runas"
                value={runAs}
                onChange={(event) => setRunAs(event.target.value)}
                disabled={busy}
              >
                <option value="root">root</option>
                <option value="www">www</option>
              </Select>
              <p className="text-xs text-slate-500">root or the www web user.</p>
            </div>
          </div>

          {formError ? <Alert variant="error">{formError}</Alert> : null}

          <div>
            <Button type="submit" loading={submitting} disabled={busy}>
              Add cron job
            </Button>
          </div>
        </form>

        {loadError ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : jobs === null ? (
          <div className="grid gap-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-slate-500">No cron jobs yet.</p>
        ) : (
          <div className="overflow-x-auto border-t border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-5 text-left font-medium">Schedule</th>
                  <th className="py-3 pr-5 text-left font-medium">Command</th>
                  <th className="py-3 pr-5 text-left font-medium">Run as</th>
                  <th className="py-3 pr-5 text-left font-medium">Comment</th>
                  <th className="py-3 pr-5 text-left font-medium">Created</th>
                  <th className="py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const deleting = pendingDelete === job.id;
                  const rowError = rowErrors[job.id];
                  return (
                    <tr key={job.id} className="border-t border-slate-800">
                      <td className="py-3 pr-5">
                        <span className="whitespace-pre font-mono text-slate-200">
                          {job.schedule}
                        </span>
                      </td>
                      <td className="py-3 pr-5">
                        <span
                          className="block max-w-[18rem] truncate font-mono text-slate-400"
                          title={job.command}
                        >
                          {job.command}
                        </span>
                      </td>
                      <td className="py-3 pr-5">
                        <Badge variant="neutral">{job.runAs || "root"}</Badge>
                      </td>
                      <td className="py-3 pr-5 text-slate-400">{job.comment || "—"}</td>
                      <td className="py-3 pr-5 text-slate-400">{shortDateTime(job.createdAt)}</td>
                      <td className="py-3">
                        <div className="flex items-center justify-end">
                          {deleting ? (
                            <span className="flex items-center gap-2 text-xs text-slate-400">
                              <Spinner size={14} className="text-slate-400" />
                              deleting…
                            </span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-400 hover:text-red-400"
                              disabled={busy}
                              onClick={() => void onDelete(job.id)}
                              aria-label={`Delete cron job ${job.schedule}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              Delete
                            </Button>
                          )}
                        </div>
                        {rowError ? (
                          <p className="mt-1 max-w-64 text-right text-xs text-red-400" title={rowError}>
                            {rowError}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
