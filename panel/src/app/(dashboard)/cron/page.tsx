"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type {
  CronAllResponse,
  Site,
  SiteCronEntry,
  SiteCronJob,
  SiteListResponse,
} from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { shortDateTime } from "@/components/format";
import { Clock, Trash2 } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

interface SiteCronSectionProps {
  entry: SiteCronEntry;
  busy: boolean;
  pendingDelete: string | null;
  rowErrors: Record<string, string>;
  onDelete: (domain: string, id: string) => void;
}

function SiteCronSection({ entry, busy, pendingDelete, rowErrors, onDelete }: SiteCronSectionProps) {
  const { domain, jobs } = entry;
  const countLabel = jobs.length === 1 ? "1 job" : `${jobs.length} jobs`;

  return (
    <Card className={jobs.length > 0 ? "overflow-hidden" : undefined}>
      <CardHeader>
        <div>
          <CardTitle className="font-mono">{domain}</CardTitle>
          <CardDescription>
            Cron jobs written to this site&apos;s dedicated cron.d fragment.
          </CardDescription>
        </div>
        <Badge variant={jobs.length > 0 ? "indigo" : "neutral"}>{countLabel}</Badge>
      </CardHeader>

      {jobs.length === 0 ? (
        <CardBody>
          <p className="text-sm text-slate-500">No cron jobs for this site yet.</p>
        </CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 text-left font-medium">Schedule</th>
                <th className="px-5 py-3 text-left font-medium">Command</th>
                <th className="px-5 py-3 text-left font-medium">Run as</th>
                <th className="px-5 py-3 text-left font-medium">Created</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const key = `${domain}:${job.id}`;
                const deleting = pendingDelete === key;
                const rowError = rowErrors[key];
                return (
                  <tr key={key} className="border-t border-slate-800 hover:bg-slate-800/40">
                    <td className="px-5 py-3">
                      <span className="whitespace-pre font-mono text-slate-200">
                        {job.schedule}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="block max-w-[20rem] truncate font-mono text-slate-400"
                        title={job.command}
                      >
                        {job.command}
                      </span>
                      {job.comment ? (
                        <span
                          className="mt-0.5 block max-w-[20rem] truncate text-xs text-slate-500"
                          title={job.comment}
                        >
                          {job.comment}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="neutral">{job.runAs || "root"}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-400">{shortDateTime(job.createdAt)}</td>
                    <td className="px-5 py-3">
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
                            onClick={() => onDelete(domain, job.id)}
                            aria-label={`Delete cron job ${job.schedule} on ${domain}`}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            Delete
                          </Button>
                        )}
                      </div>
                      {rowError ? (
                        <p
                          className="mt-1 max-w-64 truncate text-right text-xs text-red-400"
                          title={rowError}
                        >
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
    </Card>
  );
}

export default function CronPage() {
  const [cron, setCron] = useState<CronAllResponse | null>(null);
  const [sites, setSites] = useState<Site[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sitesError, setSitesError] = useState<string | null>(null);

  const [siteDomain, setSiteDomain] = useState("");
  const [schedule, setSchedule] = useState("");
  const [command, setCommand] = useState("");
  const [comment, setComment] = useState("");
  const [runAs, setRunAs] = useState("root");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setState("loading");
    setErrorMessage(null);

    const [cronResult, sitesResult] = await Promise.allSettled([
      apiFetch<CronAllResponse>("/api/cron"),
      apiFetch<SiteListResponse>("/api/sites"),
    ]);

    if (cronResult.status === "rejected") {
      setState("error");
      setErrorMessage(
        cronResult.reason instanceof Error ? cronResult.reason.message : "Failed to load cron jobs",
      );
      return;
    }

    setCron(cronResult.value);
    setState("ready");

    if (sitesResult.status === "fulfilled") {
      const loaded = sitesResult.value.sites;
      setSites(loaded);
      setSitesError(null);
      setSiteDomain((prev) => {
        if (prev !== "" && loaded.some((site) => site.domain === prev)) return prev;
        return loaded[0]?.domain ?? "";
      });
    } else {
      setSitesError(
        sitesResult.reason instanceof Error ? sitesResult.reason.message : "Failed to load sites",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  const busy = submitting || pendingDelete !== null;
  const sitesReady = sites !== null && sites.length > 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (siteDomain === "") {
      setFormError("Select a site for the new cron job.");
      return;
    }
    if (schedule.trim() === "") {
      setFormError('Enter a schedule, for example "0 3 * * *".');
      return;
    }
    if (command.trim() === "") {
      setFormError("Enter the command to run.");
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
      await apiPost<{ cron: SiteCronJob[] }>(
        `/api/sites/${encodeURIComponent(siteDomain)}/cron`,
        payload,
      );
      setSchedule("");
      setCommand("");
      setComment("");
      refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to add the cron job");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(domain: string, id: string) {
    const key = `${domain}:${id}`;
    setPendingDelete(key);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      await apiFetch<{ cron: SiteCronJob[] }>(
        `/api/sites/${encodeURIComponent(domain)}/cron/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      refresh();
    } catch (error) {
      setRowErrors((prev) => ({
        ...prev,
        [key]: error instanceof Error ? error.message : "Failed to delete the cron job",
      }));
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Cron jobs"
        description="Scheduled commands across all sites on this server."
      />

      {state === "error" ? (
        <Alert variant="error" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage ?? "Failed to load cron jobs"}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {state === "loading" ? (
        <>
          <Card className="p-5">
            <div className="grid gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </Card>
          <Card className="mt-6 p-5">
            <div className="grid gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </Card>
        </>
      ) : null}

      {state === "ready" ? (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Add cron job</CardTitle>
                <CardDescription>
                  The job is written to the selected site&apos;s dedicated cron.d fragment.
                </CardDescription>
              </div>
              <Clock size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
            </CardHeader>

            <form
              onSubmit={onSubmit}
              className="mx-5 mt-4 mb-5 grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 sm:max-w-md"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="cron-site">Site</Label>
                <Select
                  id="cron-site"
                  value={siteDomain}
                  onChange={(event) => setSiteDomain(event.target.value)}
                  disabled={busy || !sitesReady}
                >
                  {sites && sites.length > 0 ? (
                    sites.map((site) => (
                      <option key={site.domain} value={site.domain}>
                        {site.domain}
                      </option>
                    ))
                  ) : (
                    <option value="">No sites available</option>
                  )}
                </Select>
              </div>

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
              </div>

              <div className="grid gap-1.5">
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
                <p className="text-xs text-slate-500">
                  root runs as the system administrator; www runs as the web user.
                </p>
              </div>

              {sitesError ? <Alert variant="error">{sitesError}</Alert> : null}
              {formError ? <Alert variant="error">{formError}</Alert> : null}

              <div>
                <Button type="submit" loading={submitting} disabled={busy || !sitesReady}>
                  Add cron job
                </Button>
              </div>
            </form>
          </Card>

          {cron && cron.sites.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={Clock}
                title="No sites yet"
                description="Create a site first, then schedule commands for it here."
                action={
                  <Link href="/sites" className={buttonClass("secondary", "md")}>
                    Go to sites
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="mt-6 grid gap-6">
              {cron?.sites.map((entry) => (
                <SiteCronSection
                  key={entry.domain}
                  entry={entry}
                  busy={busy}
                  pendingDelete={pendingDelete}
                  rowErrors={rowErrors}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
