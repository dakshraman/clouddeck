"use client";

import { useCallback, useEffect, useState } from "react";
import type { SiteStats } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/components/format";

const DAY_OPTIONS = [7, 30, 90] as const;

export function StatsCard({ domain }: { domain: string }) {
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(7);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<SiteStats>(
        `/api/sites/${encodeURIComponent(domain)}/stats?days=${days}`,
      );
      setStats(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [domain, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxRequests =
    stats === null ? 1 : Math.max(1, ...stats.perDay.map((day) => day.requests));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Traffic stats</CardTitle>
          <CardDescription>
            Requests and bytes parsed from the site&apos;s combined access log.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor="stats-days">Days</Label>
          <div className="w-24">
            <Select
              id="stats-days"
              value={String(days)}
              onChange={(event) =>
                setDays(Number(event.target.value) as (typeof DAY_OPTIONS)[number])
              }
              disabled={loading}
            >
              {DAY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardBody className="grid gap-5">
        {loadError ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : loading || stats === null ? (
          <div className="grid gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Requests</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
                  {stats.requests.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Data served</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
                  {formatBytes(stats.bytes)}
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Per day
              </h3>
              {stats.perDay.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No traffic recorded in this period.</p>
              ) : (
                <div className="mt-3 grid gap-2.5">
                  {stats.perDay.map((day) => (
                    <div key={day.date}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-mono text-slate-500">{day.date}</span>
                        <span className="text-slate-400">
                          {day.requests.toLocaleString()} req · {formatBytes(day.bytes)}
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${(day.requests / maxRequests) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Top paths
              </h3>
              {stats.topPaths.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No path data for this period.</p>
              ) : (
                <ol className="mt-3 grid gap-2">
                  {stats.topPaths.map((entry, index) => (
                    <li
                      key={`${entry.path}-${index}`}
                      className="flex items-start justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 text-slate-400">
                        <span className="mr-2 font-mono text-xs text-slate-600">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="break-all font-mono text-xs text-slate-300">
                          {entry.path}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-400">
                        {entry.requests.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
