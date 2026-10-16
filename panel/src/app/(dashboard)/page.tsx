"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { SystemInfo, Task, TaskListResponse } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import {
  formatBytes,
  percentOf,
  relativeTime,
  taskStatusVariant,
  taskTypeLabel,
  titleCase,
  usageTone,
} from "@/components/format";
import { Activity, Cpu, HardDrive, MemoryStick, Plus, Server } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

export default function DashboardPage() {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);
    setTasksError(null);

    const [systemResult, tasksResult] = await Promise.allSettled([
      apiFetch<SystemInfo>("/api/system"),
      apiFetch<TaskListResponse>("/api/tasks"),
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const memoryPercent = system ? percentOf(system.memory.usedBytes, system.memory.totalBytes) : 0;
  const diskPercent = system ? percentOf(system.disk.usedBytes, system.disk.totalBytes) : 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your server and recent agent activity."
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {state === "loading" ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : null}

        {state === "ready" && system ? (
          <>
            <StatCard
              label="CPU"
              value={`${Math.round(system.cpu.usagePercent)}%`}
              sub={`${system.cpu.cores} ${system.cpu.cores === 1 ? "core" : "cores"}`}
              icon={Cpu}
              progress={system.cpu.usagePercent}
              tone={usageTone(system.cpu.usagePercent)}
            />
            <StatCard
              label="Memory"
              value={formatBytes(system.memory.usedBytes)}
              sub={`of ${formatBytes(system.memory.totalBytes)} · ${Math.round(memoryPercent)}% used`}
              icon={MemoryStick}
              progress={memoryPercent}
              tone={usageTone(memoryPercent)}
            />
            <StatCard
              label="Disk"
              value={formatBytes(system.disk.usedBytes)}
              sub={`of ${formatBytes(system.disk.totalBytes)} · ${system.disk.mount}`}
              icon={HardDrive}
              progress={diskPercent}
              tone={usageTone(diskPercent)}
            />
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Agent</p>
                <Server size={16} className="shrink-0 text-slate-500" aria-hidden="true" />
              </div>
              <p className="mt-3 truncate font-mono text-lg font-semibold text-slate-100">
                {system.hostname}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {system.os}
                {system.agentVersion ? ` · v${system.agentVersion}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="green">Online</Badge>
                {system.dryRun ? <Badge variant="amber">Dry run</Badge> : null}
              </div>
            </Card>
          </>
        ) : null}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>Recent tasks</CardTitle>
            <CardDescription>Latest operations handled by the agent.</CardDescription>
          </div>
          <Activity size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
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

        {tasks && tasks.length > 0 ? (
          <ul className="divide-y divide-slate-800 px-5 pb-2 pt-1">
            {tasks.slice(0, 10).map((task) => {
              const lastLog = task.logs.length > 0 ? task.logs[task.logs.length - 1].message : null;
              const failureLine = task.status === "failed" ? task.error ?? lastLog : null;
              return (
                <li key={task.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-slate-200">{taskTypeLabel(task.type)}</span>
                      {task.site ? (
                        <span className="truncate font-mono text-xs text-slate-500">{task.site}</span>
                      ) : null}
                    </div>
                    {failureLine ? (
                      <p className="mt-1 truncate font-mono text-xs text-red-400" title={failureLine}>
                        {failureLine}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-slate-500">{relativeTime(task.createdAt)}</span>
                    <Badge variant={taskStatusVariant(task.status)}>{titleCase(task.status)}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
