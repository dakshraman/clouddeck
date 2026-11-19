"use client";

import { useState } from "react";
import type { CronJob } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { shortDateTime } from "@/components/format";
import { describeCron } from "./cron-presets";
import {
  Play,
  Pencil,
  Trash2,
  Clock,
  History,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

interface CronTableProps {
  jobs: CronJob[];
  loading: boolean;
  onEdit: (job: CronJob) => void;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onRunNow: (job: CronJob) => Promise<void>;
  onViewHistory: (job: CronJob) => void;
}

export function CronTable({
  jobs,
  loading,
  onEdit,
  onDelete,
  onToggle,
  onRunNow,
  onViewHistory,
}: CronTableProps) {
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [togglingJobId, setTogglingJobId] = useState<string | null>(null);

  async function handleRun(job: CronJob) {
    setRunningJobId(job.id);
    try {
      await onRunNow(job);
    } finally {
      setRunningJobId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this scheduled task?")) {
      return;
    }
    setDeletingJobId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingJobId(null);
    }
  }

  async function handleToggle(id: string, current: boolean) {
    setTogglingJobId(id);
    try {
      await onToggle(id, !current);
    } finally {
      setTogglingJobId(null);
    }
  }

  if (loading && jobs.length === 0) {
    return (
      <Card>
        <CardBody className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Spinner size={24} />
          <p className="text-sm">Loading scheduled tasks...</p>
        </CardBody>
      </Card>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card>
        <CardBody className="py-12 text-center space-y-2">
          <Clock size={36} className="mx-auto text-muted-foreground/60" />
          <h4 className="text-base font-semibold text-foreground">No scheduled tasks configured</h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Create automated recurring cron jobs like backups, queue workers, SSL renewals, or database cleanup.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>System &amp; Server Cron Jobs</CardTitle>
          <CardDescription>
            Cron tasks written to <code className="text-xs font-mono">/etc/cron.d/clouddeck-cron</code>.
          </CardDescription>
        </div>
        <Badge variant={jobs.length > 0 ? "indigo" : "neutral"}>
          {jobs.length} {jobs.length === 1 ? "task" : "tasks"}
        </Badge>
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 text-left font-medium">Status</th>
              <th className="px-5 py-3 text-left font-medium">Task / Command</th>
              <th className="px-5 py-3 text-left font-medium">Schedule</th>
              <th className="px-5 py-3 text-left font-medium">User</th>
              <th className="px-5 py-3 text-left font-medium">Last Run</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {jobs.map((job) => {
              const isRunning = runningJobId === job.id;
              const isDeleting = deletingJobId === job.id;
              const isToggling = togglingJobId === job.id;

              return (
                <tr key={job.id} className="hover:bg-muted/40 transition-colors">
                  {/* Status Toggle */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleToggle(job.id, job.enabled)}
                      disabled={isToggling}
                      className="cursor-pointer"
                      title={job.enabled ? "Click to disable task" : "Click to enable task"}
                    >
                      <Badge variant={job.enabled ? "green" : "neutral"}>
                        {isToggling ? "Saving…" : job.enabled ? "Active" : "Disabled"}
                      </Badge>
                    </button>
                  </td>

                  {/* Task & Command */}
                  <td className="px-5 py-3.5 max-w-xs sm:max-w-md">
                    <div className="font-medium text-foreground">
                      {job.title || job.comment || <span className="italic text-muted-foreground">Untitled Task</span>}
                    </div>
                    <div
                      className="mt-0.5 font-mono text-xs text-muted-foreground truncate"
                      title={job.command}
                    >
                      {job.command}
                    </div>
                  </td>

                  {/* Schedule */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground border border-border">
                        {job.schedule}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-44" title={describeCron(job.schedule)}>
                      {describeCron(job.schedule)}
                    </div>
                  </td>

                  {/* User */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <Badge variant="neutral">{job.user || "root"}</Badge>
                  </td>

                  {/* Last Run */}
                  <td className="px-5 py-3.5 whitespace-nowrap text-xs text-muted-foreground">
                    {job.last_run ? (
                      <div>
                        <div className="flex items-center gap-1 font-medium text-foreground">
                          {job.last_status === "success" ? (
                            <CheckCircle2 size={13} className="text-emerald-500" />
                          ) : job.last_status === "failed" ? (
                            <AlertCircle size={13} className="text-red-500" />
                          ) : (
                            <HelpCircle size={13} className="text-muted-foreground" />
                          )}
                          <span>{shortDateTime(job.last_run)}</span>
                        </div>
                        {job.last_duration_ms !== undefined ? (
                          <div className="text-[11px] text-muted-foreground">
                            Took {job.last_duration_ms}ms
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60 italic">Never run</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Run Now Test Button */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRun(job)}
                        disabled={isRunning || isDeleting}
                        title="Run now to test execution"
                      >
                        {isRunning ? (
                          <Spinner size={13} className="mr-1 text-primary" />
                        ) : (
                          <Play size={13} className="mr-1 text-emerald-500 fill-emerald-500/20" />
                        )}
                        {isRunning ? "Running…" : "Run now"}
                      </Button>

                      {/* Execution History */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewHistory(job)}
                        title="View past execution history"
                      >
                        <History size={14} />
                      </Button>

                      {/* Edit */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(job)}
                        title="Edit schedule and settings"
                      >
                        <Pencil size={14} />
                      </Button>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                        onClick={() => handleDelete(job.id)}
                        disabled={isDeleting}
                        title="Delete task"
                      >
                        {isDeleting ? <Spinner size={14} /> : <Trash2 size={14} />}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
