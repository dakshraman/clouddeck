"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  CronAllResponse,
  CronJob,
  CronRunResult,
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
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { shortDateTime } from "@/components/format";
import { CronTable } from "@/components/cron/cron-table";
import { CronJobModal } from "@/components/cron/cron-job-modal";
import { CronRunModal } from "@/components/cron/cron-run-modal";
import { CronHistoryModal } from "@/components/cron/cron-history-modal";
import { Clock, Plus, History, Trash2, Layers } from "lucide-react";

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
          <CardTitle className="font-mono text-sm">{domain}</CardTitle>
          <CardDescription>
            Site-specific cron fragment in <code className="text-xs font-mono">/etc/cron.d/clouddeck-{domain.replace(/\./g, "-")}</code>.
          </CardDescription>
        </div>
        <Badge variant={jobs.length > 0 ? "indigo" : "neutral"}>{countLabel}</Badge>
      </CardHeader>

      {jobs.length === 0 ? (
        <CardBody>
          <p className="text-sm text-muted-foreground">No site-specific cron jobs for this site.</p>
        </CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Schedule</th>
                <th className="px-5 py-3 text-left font-medium">Command</th>
                <th className="px-5 py-3 text-left font-medium">Run as</th>
                <th className="px-5 py-3 text-left font-medium">Created</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => {
                const key = `${domain}:${job.id}`;
                const deleting = pendingDelete === key;
                const rowError = rowErrors[key];
                return (
                  <tr key={key} className="hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <span className="whitespace-pre font-mono text-foreground">{job.schedule}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="block max-w-[20rem] truncate font-mono text-muted-foreground"
                        title={job.command}
                      >
                        {job.command}
                      </span>
                      {job.comment ? (
                        <span
                          className="mt-0.5 block max-w-[20rem] truncate text-xs text-muted-foreground"
                          title={job.comment}
                        >
                          {job.comment}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="neutral">{job.runAs || "root"}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{shortDateTime(job.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end">
                        {deleting ? (
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Spinner size={14} className="text-muted-foreground" />
                            deleting…
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
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
                          className="mt-1 max-w-64 truncate text-right text-xs text-red-600 dark:text-red-400 font-medium"
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
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [sitesCron, setSitesCron] = useState<SiteCronEntry[]>([]);
  const [sites, setSites] = useState<Site[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyJob, setHistoryJob] = useState<CronJob | null>(null);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [runResult, setRunResult] = useState<CronRunResult | null>(null);

  // Per-site cron deletion
  const [pendingDeleteSiteCron, setPendingDeleteSiteCron] = useState<string | null>(null);
  const [siteRowErrors, setSiteRowErrors] = useState<Record<string, string>>({});

  const [activeTab, setActiveTab] = useState<"system" | "sites">("system");

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

    const data = cronResult.value;
    setJobs(data.jobs || []);
    setSitesCron(data.sites || []);
    setState("ready");

    if (sitesResult.status === "fulfilled") {
      setSites(sitesResult.value.sites);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  // Open modal to create
  function handleOpenCreate() {
    setEditingJob(null);
    setModalOpen(true);
  }

  // Open modal to edit
  function handleOpenEdit(job: CronJob) {
    setEditingJob(job);
    setModalOpen(true);
  }

  // Save (create or update)
  async function handleSaveJob(payload: {
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
  }) {
    if (editingJob) {
      await apiFetch(`/api/cron/${encodeURIComponent(editingJob.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await apiPost("/api/cron", payload);
    }
    refresh();
  }

  // Delete system job
  async function handleDeleteJob(id: string) {
    await apiFetch(`/api/cron/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    refresh();
  }

  // Toggle active/inactive
  async function handleToggleJob(id: string, enabled: boolean) {
    await apiFetch(`/api/cron/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
    refresh();
  }

  // Run now test button
  async function handleRunNow(job: CronJob) {
    try {
      const result = await apiPost<CronRunResult>(
        `/api/cron/${encodeURIComponent(job.id)}/run`,
        {},
      );
      setRunResult(result);
      setRunModalOpen(true);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to execute cron job");
    }
  }

  // View history
  function handleViewHistory(job?: CronJob) {
    setHistoryJob(job || null);
    setHistoryOpen(true);
  }

  // Delete site cron
  async function handleDeleteSiteCron(domain: string, id: string) {
    const key = `${domain}:${id}`;
    setPendingDeleteSiteCron(key);
    setSiteRowErrors((prev) => {
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
      setSiteRowErrors((prev) => ({
        ...prev,
        [key]: error instanceof Error ? error.message : "Failed to delete the cron job",
      }));
    } finally {
      setPendingDeleteSiteCron(null);
    }
  }

  const siteCronCount = sitesCron.reduce((acc, curr) => acc + curr.jobs.length, 0);

  return (
    <>
      <PageHeader
        title="Cron Jobs & Scheduled Tasks"
        description="Automated system tasks, recurring maintenance scripts, and per-site cron fragments."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleViewHistory()}
              title="View all execution history"
            >
              <History size={15} className="mr-1.5" />
              History
            </Button>
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus size={15} className="mr-1.5" />
              Add Scheduled Task
            </Button>
          </div>
        }
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

      {/* Tabs navigation */}
      <div className="flex items-center gap-2 border-b border-border mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("system")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === "system"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Clock size={16} />
          System Tasks
          <Badge variant={jobs.length > 0 ? "indigo" : "neutral"} className="ml-1 text-[11px] px-1.5 py-0">
            {jobs.length}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sites")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === "sites"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers size={16} />
          Site Cron Fragments
          <Badge variant={siteCronCount > 0 ? "indigo" : "neutral"} className="ml-1 text-[11px] px-1.5 py-0">
            {siteCronCount}
          </Badge>
        </button>
      </div>

      {/* Tab 1: System Cron Manager */}
      {activeTab === "system" ? (
        <div className="space-y-6">
          <CronTable
            jobs={jobs}
            loading={state === "loading"}
            onEdit={handleOpenEdit}
            onDelete={handleDeleteJob}
            onToggle={handleToggleJob}
            onRunNow={handleRunNow}
            onViewHistory={handleViewHistory}
          />
        </div>
      ) : null}

      {/* Tab 2: Site Cron Fragments */}
      {activeTab === "sites" ? (
        <div className="space-y-6">
          {sitesCron.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No site cron fragments"
              description="Per-site cron fragments are configured within each hosted site settings."
              action={
                <Link href="/sites" className={buttonClass("secondary", "md")}>
                  Manage Sites
                </Link>
              }
            />
          ) : (
            sitesCron.map((entry) => (
              <SiteCronSection
                key={entry.domain}
                entry={entry}
                busy={pendingDeleteSiteCron !== null}
                pendingDelete={pendingDeleteSiteCron}
                rowErrors={siteRowErrors}
                onDelete={handleDeleteSiteCron}
              />
            ))
          )}
        </div>
      ) : null}

      {/* Modals */}
      <CronJobModal
        job={editingJob}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveJob}
      />

      <CronRunModal
        result={runResult}
        open={runModalOpen}
        onClose={() => setRunModalOpen(false)}
      />

      <CronHistoryModal
        jobId={historyJob?.id}
        jobTitle={historyJob?.title || historyJob?.comment}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
}
