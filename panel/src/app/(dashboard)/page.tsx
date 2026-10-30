"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Site, SiteListResponse, SystemInfo, Task, TaskListResponse } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardToolbox } from "@/components/dashboard-toolbox";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  formatBytes,
  percentOf,
  relativeTime,
  taskStatusVariant,
  taskTypeLabel,
  titleCase,
  usageTone,
} from "@/components/format";
import { Activity, AlertCircle, CheckCircle, Cpu, HardDrive, MemoryStick, Plus, X } from "lucide-react";
import { cn } from "@/components/ui/cn";

type LoadState = "loading" | "ready" | "error";

const toneBar: Record<string, string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  indigo: "bg-brand",
  green: "bg-emerald-500",
};

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] text-card-foreground">{children}</dd>
    </div>
  );
}

function MeterRow({
  label,
  used,
  total,
  icon: Icon,
}: {
  label: string;
  used: number;
  total: number;
  icon: typeof Cpu;
}) {
  const percent = percentOf(used, total);
  const tone = usageTone(percent);
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon size={13} className="text-muted-foreground/80" aria-hidden="true" />
          {label}
        </span>
        <span className="tabular text-[13px] font-medium text-card-foreground">
          {Math.round(percent)}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", toneBar[tone])}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      <p className="tabular mt-1 text-[11px] text-muted-foreground">
        {formatBytes(used)} of {formatBytes(total)}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [sites, setSites] = useState<Site[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);
    setTasksError(null);

    const [systemResult, tasksResult, sitesResult] = await Promise.allSettled([
      apiFetch<SystemInfo>("/api/system"),
      apiFetch<TaskListResponse>("/api/tasks"),
      apiFetch<SiteListResponse>("/api/sites"),
    ]);

    if (systemResult.status === "fulfilled") {
      setSystem(systemResult.value);
      setState("ready");
    } else {
      setSystem(null);
      setState("error");
      setErrorMessage(
        systemResult.reason instanceof Error
          ? systemResult.reason.message
          : "Cannot reach the CloudDeck agent",
      );
    }

    if (tasksResult.status === "fulfilled") {
      setTasks(tasksResult.value.tasks);
    } else {
      setTasks(null);
      setTasksError(
        tasksResult.reason instanceof Error ? tasksResult.reason.message : "Failed to load tasks",
      );
    }

    if (sitesResult.status === "fulfilled") {
      setSites(sitesResult.value.sites);
    } else {
      setSites(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [taskFilter, setTaskFilter] = useState<"all" | "failed" | "succeeded">("all");
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [dismissedFailedTaskIds, setDismissedFailedTaskIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("clouddeck_dismissed_failed_tasks");
      if (stored) {
        setDismissedFailedTaskIds(JSON.parse(stored));
      }
    } catch {}
  }, []);

  const dismissFailedTasks = () => {
    if (!tasks) return;
    const failedIds = tasks.filter((t) => t.status === "failed").map((t) => t.id);
    const updated = Array.from(new Set([...dismissedFailedTaskIds, ...failedIds]));
    setDismissedFailedTaskIds(updated);
    try {
      localStorage.setItem("clouddeck_dismissed_failed_tasks", JSON.stringify(updated));
    } catch {}
  };

  const loading = state === "loading";
  const failedTasks = tasks?.filter((task) => task.status === "failed") ?? [];
  const succeededTasks = tasks?.filter((task) => task.status === "succeeded") ?? [];
  const unacknowledgedFailedTasks =
    tasks?.filter((task) => task.status === "failed" && !dismissedFailedTaskIds.includes(task.id)) ?? [];
  const expiringCertificates =
    sites?.filter((site) => {
      if (!site.ssl.enabled || !site.ssl.expiresAt) return false;
      const expiry = Date.parse(site.ssl.expiresAt);
      return Number.isFinite(expiry) && expiry - Date.now() <= 30 * 24 * 60 * 60 * 1000;
    }) ?? [];

  const filteredTasks = (tasks ?? []).filter((task) => {
    if (taskFilter === "failed") return task.status === "failed";
    if (taskFilter === "succeeded") return task.status === "succeeded";
    return true;
  });

  const visibleTasks = showAllTasks ? filteredTasks : filteredTasks.slice(0, 8);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Manage your sites, data, and server services from one place."
        actions={
          <Link href="/sites/new" className={buttonClass("primary", "md")}>
            <Plus size={16} aria-hidden="true" />
            New site
          </Link>
        }
      />

      {state === "error" ? (
        <Alert variant="error" className="mb-6">
          {errorMessage ?? "Cannot reach the CloudDeck agent"}
        </Alert>
      ) : null}
      {unacknowledgedFailedTasks.length > 0 ? (
        <Alert variant="warning" className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>
              {unacknowledgedFailedTasks.length === 1
                ? "The latest agent operation failed. Review Recent tasks for details."
                : `${unacknowledgedFailedTasks.length} recent agent operations failed. Review Recent tasks for details.`}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setTaskFilter("failed");
                document.getElementById("recent-tasks")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="text-xs font-semibold text-amber-500 dark:text-amber-300 underline underline-offset-2 hover:opacity-80"
            >
              View failed tasks ({unacknowledgedFailedTasks.length})
            </button>
            <button
              type="button"
              onClick={dismissFailedTasks}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              title="Dismiss warning"
            >
              <X size={13} aria-hidden="true" />
              Dismiss
            </button>
          </div>
        </Alert>
      ) : null}
      {expiringCertificates.length > 0 ? (
        <Alert variant="warning" className="mb-6">
          {expiringCertificates.length === 1
            ? `SSL certificate for ${expiringCertificates[0].domain} expires within 30 days.`
            : `${expiringCertificates.length} SSL certificates expire within 30 days.`}{" "}
          Review the affected site before renewal.
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <DashboardToolbox />

          <Card id="recent-tasks">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle>Recent tasks</CardTitle>
                <CardDescription>Latest operations handled by the agent.</CardDescription>
              </div>
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTaskFilter("all")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    taskFilter === "all"
                      ? "bg-secondary text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                >
                  All ({tasks?.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilter("failed")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    taskFilter === "failed"
                      ? "bg-red-500/20 text-red-500 dark:text-red-400 font-semibold shadow-sm"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                >
                  Failed
                  {failedTasks.length > 0 ? (
                    <span className="rounded-full bg-red-500/20 px-1.5 py-0.2 text-[10px] font-bold text-red-600 dark:text-red-400">
                      {failedTasks.length}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilter("succeeded")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    taskFilter === "succeeded"
                      ? "bg-secondary text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                >
                  Succeeded ({succeededTasks.length})
                </button>
              </div>
            </CardHeader>

            {tasks === null && !tasksError ? (
              <CardBody className="grid gap-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </CardBody>
            ) : null}

            {tasksError ? (
              <CardBody>
                <Alert variant="error">{tasksError}</Alert>
              </CardBody>
            ) : null}

            {tasks && tasks.length === 0 ? (
              <CardBody>
                <EmptyState
                  icon={Activity}
                  title="No tasks yet"
                  description="Site and SSL operations will appear here as the agent runs them."
                />
              </CardBody>
            ) : null}

            {tasks && taskFilter === "failed" && failedTasks.length === 0 ? (
              <CardBody className="py-8 text-center text-xs text-muted-foreground">
                No failed operations recorded. All tasks completed successfully.
              </CardBody>
            ) : null}

            {tasks && visibleTasks.length > 0 ? (
              <>
                <ul className="divide-y divide-border px-5 pb-2 pt-1">
                  {visibleTasks.map((task) => {
                    const lastLog = task.logs.length > 0 ? task.logs[task.logs.length - 1].message : null;
                    const failureLine = task.status === "failed" ? task.error ?? lastLog : null;
                    return (
                      <li key={task.id} className="flex items-start justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] text-card-foreground">{taskTypeLabel(task.type)}</span>
                            {task.site ? (
                              <span className="truncate font-mono text-xs text-muted-foreground">
                                {task.site}
                              </span>
                            ) : null}
                          </div>
                          {failureLine ? (
                            <p className="mt-1 truncate font-mono text-xs text-red-500 dark:text-red-400" title={failureLine}>
                              {failureLine}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-xs text-muted-foreground">{relativeTime(task.createdAt)}</span>
                          <Badge variant={taskStatusVariant(task.status)}>{titleCase(task.status)}</Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {filteredTasks.length > 8 ? (
                  <div className="border-t border-border px-5 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => setShowAllTasks(!showAllTasks)}
                      className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showAllTasks ? "Show fewer tasks" : `Show all ${filteredTasks.length} tasks`}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20">
          <Card>
            <CardHeader>
              <CardTitle>Server information</CardTitle>
              {system ? (
                <Badge variant={system.dryRun ? "amber" : "green"}>
                  {system.dryRun ? "Dry run" : "Live"}
                </Badge>
              ) : null}
            </CardHeader>
            <div className="px-5 pb-4">
              {loading ? (
                <div className="grid gap-2.5 py-2">
                  <Skeleton className="h-5" />
                  <Skeleton className="h-5" />
                  <Skeleton className="h-5" />
                  <Skeleton className="h-5" />
                </div>
              ) : system ? (
                <dl className="divide-y divide-border/70">
                  <InfoRow label="Hostname">
                    <span className="font-mono text-xs">{system.hostname}</span>
                  </InfoRow>
                  <InfoRow label="Operating system">{system.os}</InfoRow>
                  <InfoRow label="Agent version">
                    {system.agentVersion ? `v${system.agentVersion}` : "unknown"}
                  </InfoRow>
                  <InfoRow label="CPU cores">{system.cpu.cores}</InfoRow>
                  <InfoRow label="Disk mount">
                    <span className="font-mono text-xs">{system.disk.mount}</span>
                  </InfoRow>
                </dl>
              ) : (
                <p className="py-2 text-xs text-muted-foreground">
                  Agent unreachable — server details are unavailable.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Server health</CardTitle>
            </CardHeader>
            <div className="px-5 pb-4">
              {loading ? (
                <div className="grid gap-2.5 py-2">
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                </div>
              ) : system ? (
                <div className="divide-y divide-border/70">
                  <MeterRow
                    label="CPU usage"
                    used={system.cpu.usagePercent}
                    total={100}
                    icon={Cpu}
                  />
                  <MeterRow
                    label="Memory"
                    used={system.memory.usedBytes}
                    total={system.memory.totalBytes}
                    icon={MemoryStick}
                  />
                  <MeterRow
                    label="Disk"
                    used={system.disk.usedBytes}
                    total={system.disk.totalBytes}
                    icon={HardDrive}
                  />
                </div>
              ) : (
                <p className="py-2 text-xs text-muted-foreground">No metrics available.</p>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
