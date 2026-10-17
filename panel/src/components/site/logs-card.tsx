"use client";

import { useCallback, useEffect, useState } from "react";
import type { SiteLogsResponse } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, ScrollText } from "lucide-react";

const KIND_OPTIONS = ["access", "error"] as const;
const LINE_OPTIONS = [200, 500, 1000] as const;

type LogKind = (typeof KIND_OPTIONS)[number];
type LogLines = (typeof LINE_OPTIONS)[number];

export function LogsCard({ domain }: { domain: string }) {
  const [kind, setKind] = useState<LogKind>("access");
  const [lines, setLines] = useState<LogLines>(200);
  const [data, setData] = useState<SiteLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const query = new URLSearchParams({ kind, lines: String(lines) });
      const response = await apiFetch<SiteLogsResponse>(
        `/api/sites/${encodeURIComponent(domain)}/logs?${query.toString()}`,
      );
      setData(response);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [domain, kind, lines]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Logs</CardTitle>
          <CardDescription>
            Tail of the nginx {kind} log for this site{" "}
            <span className="font-mono">
              ({domain}.{kind}.log)
            </span>
            .
          </CardDescription>
        </div>
        <ScrollText size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
      </CardHeader>
      <CardBody className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="log-kind">Log</Label>
            <div className="w-32">
              <Select
                id="log-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as LogKind)}
                disabled={loading}
              >
                <option value="access">Access</option>
                <option value="error">Error</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="log-lines">Lines</Label>
            <div className="w-28">
              <Select
                id="log-lines"
                value={String(lines)}
                onChange={(event) => setLines(Number(event.target.value) as LogLines)}
                disabled={loading}
              >
                {LINE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Button variant="secondary" onClick={() => void load()} loading={loading}>
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </Button>
          {data !== null && !loading ? (
            <span className="pb-2 text-xs text-slate-500">
              {data.lines.length.toLocaleString()} {data.lines.length === 1 ? "line" : "lines"}
            </span>
          ) : null}
        </div>

        {loadError ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : loading || data === null ? (
          <Skeleton className="h-64" />
        ) : data.lines.length === 0 ? (
          <p className="text-sm text-slate-500">No log entries</p>
        ) : (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-800 bg-slate-950/60 p-4 font-mono text-xs leading-5 text-slate-300">
            {data.lines.join("\n")}
          </pre>
        )}
      </CardBody>
    </Card>
  );
}
