import type { ProcessListResponse } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/ui/cn";
import { formatBytes, shortTime } from "@/components/format";

export type ProcessSort = "cpu" | "mem";

interface ProcessesCardProps {
  data: ProcessListResponse | null;
  error: string | null;
  loading: boolean;
  sort: ProcessSort;
  onSortChange: (sort: ProcessSort) => void;
  onRetry: () => void;
}

function toneClass(percent: number): string {
  if (percent >= 90) return "text-red-400";
  if (percent >= 70) return "text-amber-400";
  return "text-foreground";
}

export function ProcessesCard({
  data,
  error,
  loading,
  sort,
  onSortChange,
  onRetry,
}: ProcessesCardProps) {
  const countLabel = data
    ? data.totalProcesses > data.processes.length
      ? `Top ${data.processes.length} of ${data.totalProcesses} processes`
      : `${data.totalProcesses} ${data.totalProcesses === 1 ? "process" : "processes"}`
    : "Live process resource use";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-wrap items-center gap-3 pb-4">
        <div className="min-w-0">
          <CardTitle>Top processes</CardTitle>
          <CardDescription>
            {countLabel}
            {data ? ` · updated ${shortTime(data.sampledAt)}` : " · refreshed every 5 seconds"}
          </CardDescription>
        </div>
        <div
          className="inline-flex shrink-0 items-center rounded-full border border-border bg-background/50 p-0.5"
          role="group"
          aria-label="Sort processes"
        >
          {(["cpu", "mem"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => onSortChange(value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                sort === value
                  ? "bg-secondary text-secondary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "cpu" ? "CPU" : "Memory"}
            </button>
          ))}
        </div>
      </CardHeader>

      {error ? (
        <div className="px-5 pb-4">
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Retry
              </Button>
            </div>
          </Alert>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="border-t border-border px-5 py-4">
          <div className="space-y-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </div>
      ) : null}

      {data ? (
        <div className="overflow-x-auto border-t border-border">
          <table aria-label="Top processes" className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="w-20 px-5 py-3 font-medium">
                  PID
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Command
                </th>
                <th scope="col" className="w-36 px-3 py-3 font-medium">
                  User
                </th>
                <th scope="col" className="w-24 px-3 py-3 text-right font-medium">
                  <span className="block">CPU</span>
                  <span className="block text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                    per core
                  </span>
                </th>
                <th scope="col" className="w-36 px-5 py-3 text-right font-medium">
                  <span className="block">Memory</span>
                  <span className="block text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                    of host
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.processes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No processes reported.
                  </td>
                </tr>
              ) : (
                data.processes.map((process) => (
                  <tr
                    key={process.pid}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">
                      {process.pid}
                    </td>
                    <td className="max-w-[420px] px-3 py-2.5">
                      <p
                        className="truncate font-mono text-xs text-foreground"
                        title={process.command}
                      >
                        {process.command}
                      </p>
                    </td>
                    <td className="truncate px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {process.user}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-mono text-xs font-medium tabular-nums",
                        toneClass(process.cpuPercent),
                      )}
                    >
                      {process.cpuPercent.toFixed(1)}%
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex items-baseline justify-end gap-2">
                        <span
                          className={cn(
                            "font-mono text-xs font-medium tabular-nums",
                            toneClass(process.memoryPercent),
                          )}
                        >
                          {process.memoryPercent.toFixed(1)}%
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatBytes(process.rssBytes)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && loading ? (
        <div className="border-t border-border px-5 py-2 text-xs text-muted-foreground">
          Refreshing…
        </div>
      ) : null}
    </Card>
  );
}
