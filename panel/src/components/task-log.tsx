"use client";

import { useEffect, useRef, useState } from "react";
import type { Task, TaskLogLevel } from "@/lib/types";
import { apiFetch, isAbortError } from "@/components/api";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/components/ui/cn";
import { shortTime, taskStatusVariant, taskTypeLabel, titleCase } from "@/components/format";

const levelClass: Record<TaskLogLevel, string> = {
  info: "text-foreground/80",
  warn: "text-amber-400",
  error: "text-red-400",
};

interface TaskLogProps {
  initial?: Task | null;
  taskId?: string;
  onComplete?: (task: Task) => void;
}

export function TaskLog({ initial = null, taskId, onComplete }: TaskLogProps) {
  const [task, setTask] = useState<Task | null>(initial);
  const [pollError, setPollError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef<string | null>(null);

  const id = taskId ?? initial?.id ?? null;
  const terminal = task !== null && (task.status === "succeeded" || task.status === "failed");
  const active = id !== null && !terminal;

  useEffect(() => {
    if (!id) return;
    const currentId = id;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function poll() {
      if (stopped) return;
      try {
        const next = await apiFetch<Task>(`/api/tasks/${encodeURIComponent(currentId)}`, {
          signal: controller.signal,
        });
        if (stopped) return;
        setTask(next);
        setPollError(null);
        if (next.status === "succeeded" || next.status === "failed") return;
      } catch (error) {
        if (stopped || isAbortError(error)) return;
        setPollError(error instanceof Error ? error.message : "Failed to load task");
      }
      timer = setTimeout(() => void poll(), 1000);
    }

    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!task || !onComplete) return;
    if (task.status !== "succeeded" && task.status !== "failed") return;
    if (completedRef.current === task.id) return;
    completedRef.current = task.id;
    onComplete(task);
  }, [task, onComplete]);

  const logCount = task?.logs.length ?? 0;

  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [logCount, task?.status]);

  if (!id) return null;

  const logs = task?.logs ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted/60">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="text-sm font-medium text-foreground">
            {task ? taskTypeLabel(task.type) : "Task"}
          </span>
          {task ? (
            <Badge variant={taskStatusVariant(task.status)}>{titleCase(task.status)}</Badge>
          ) : null}
          {active ? <Spinner size={14} className="text-brand" /> : null}
        </div>
        <span className="sr-only" aria-live="polite">
          {task ? `Task ${task.status}` : "Loading task"}
        </span>
        {task?.site ? <span className="truncate font-mono text-xs text-muted-foreground">{task.site}</span> : null}
      </div>

      <div
        ref={logRef}
        className="max-h-80 overflow-y-auto px-5 py-3 font-mono text-xs leading-5"
      >
        {logs.length === 0 ? (
          <p className="text-muted-foreground">{active ? "Waiting for output…" : "No output."}</p>
        ) : (
          logs.map((entry, index) => (
            <div key={index} className="flex gap-3">
              <span className="shrink-0 text-muted-foreground/60">{shortTime(entry.at)}</span>
              <span className={cn("min-w-0 break-words", levelClass[entry.level])}>{entry.message}</span>
            </div>
          ))
        )}

        {task?.status === "failed" ? (
          <div className="mt-2 flex gap-3 border-t border-red-500/20 pt-2">
            <span className="shrink-0 text-muted-foreground/60">error</span>
            <span className="min-w-0 break-words text-red-400">
              {task.error ?? "The task failed."}
            </span>
          </div>
        ) : null}

        {pollError ? (
          <p className="mt-2 text-amber-400">Lost connection to the panel, retrying… ({pollError})</p>
        ) : null}
      </div>
    </div>
  );
}
