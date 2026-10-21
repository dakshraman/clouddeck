"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppInfo, AppsResponse } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Cpu, Play, Square, Terminal } from "lucide-react";

function stateVariant(state: AppInfo["status"]["state"]): BadgeVariant {
  switch (state) {
    case "running":
      return "green";
    case "error":
      return "red";
    case "stopped":
      return "amber";
    default:
      return "neutral";
  }
}

export function SiteAppCard({ domain }: { domain: string }) {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<AppsResponse>(`/api/apps?site=${encodeURIComponent(domain)}`);
      setApps(data.apps);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications");
    }
  }, [domain]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(app: AppInfo, action: "start" | "stop") {
    setBusy(`${app.name}/${action}`);
    try {
      await apiFetch(
        `/api/sites/${encodeURIComponent(app.site)}/apps/${encodeURIComponent(app.name)}/${action}`,
        { method: "POST" },
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} the app`);
    } finally {
      setBusy(null);
    }
  }

  async function toggleLogs(app: AppInfo) {
    if (logsFor === app.name) {
      setLogsFor(null);
      setLogs(null);
      return;
    }
    setLogsFor(app.name);
    setLogs(null);
    try {
      const data = await apiFetch<{ lines: string[] }>(
        `/api/sites/${encodeURIComponent(app.site)}/apps/${encodeURIComponent(app.name)}/logs`,
      );
      setLogs(data.lines);
    } catch (err) {
      setLogs([err instanceof Error ? err.message : "Failed to load logs"]);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Applications</CardTitle>
          <CardDescription>
            Supervised app processes proxied by nginx for <span className="font-mono">{domain}</span>.
          </CardDescription>
        </div>
        <Cpu size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardBody className="grid gap-4">
        {error ? <Alert variant="error">{error}</Alert> : null}

        {apps === null && !error ? (
          <Skeleton className="h-12 w-full" />
        ) : apps && apps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No application runtime attached. Add one from the{" "}
            <span className="text-foreground/80">Applications</span> page to host Node.js, Python, Go or Ruby here.
          </p>
        ) : apps ? (
          apps.map((app) => (
            <div key={app.name} className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-foreground">{app.name}</span>
                <Badge variant="indigo">{app.kind}</Badge>
                <Badge variant={stateVariant(app.status.state)}>{app.status.state}</Badge>
                <span className="font-mono text-xs text-muted-foreground">127.0.0.1:{app.port}</span>
                {app.status.pid ? (
                  <span className="font-mono text-xs text-muted-foreground">pid {app.status.pid}</span>
                ) : null}
              </div>
              <code className="mt-2 block overflow-x-auto rounded-md border border-border bg-background/50 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                {app.command}
              </code>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === `${app.name}/start`}
                  disabled={app.status.state === "running" || busy !== null}
                  onClick={() => void act(app, "start")}
                >
                  <Play size={12} aria-hidden="true" />
                  Start
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === `${app.name}/stop`}
                  disabled={app.status.state !== "running" || busy !== null}
                  onClick={() => void act(app, "stop")}
                >
                  <Square size={12} aria-hidden="true" />
                  Stop
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void toggleLogs(app)}>
                  <Terminal size={12} aria-hidden="true" />
                  {logsFor === app.name ? "Hide logs" : "Logs"}
                </Button>
              </div>
              {logsFor === app.name ? (
                <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
                  {logs === null ? "Loading…" : logs.length === 0 ? "No log output yet." : logs.join("\n")}
                </pre>
              ) : null}
            </div>
          ))
        ) : null}
      </CardBody>
    </Card>
  );
}
