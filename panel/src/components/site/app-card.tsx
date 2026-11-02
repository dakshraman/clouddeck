"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AppInfo, AppsResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Cpu, Play, Plus, RotateCw, Square, Terminal, Trash2, X } from "lucide-react";

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

const DEFAULT_COMMANDS: Record<string, string> = {
  node: "npm start",
  python: "python3 -m gunicorn app:app --bind 127.0.0.1:$PORT",
  go: "./app",
  ruby: "bundle exec rackup -o 127.0.0.1 -p $PORT",
  java: "java -jar app.jar --server.port=$PORT",
  docker: "docker run --rm --name app-service -p 127.0.0.1:$PORT:80 nginx:alpine",
  custom: "",
};

export function SiteAppCard({
  domain,
  refreshTrigger = 0,
  onProcessChanged,
}: {
  domain: string;
  refreshTrigger?: number;
  onProcessChanged?: () => void;
}) {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[] | null>(null);

  // Add process form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("web");
  const [kind, setKind] = useState("node");
  const [command, setCommand] = useState(DEFAULT_COMMANDS.node);
  const [port, setPort] = useState("");
  const [addingProcess, setAddingProcess] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
  }, [load, refreshTrigger]);

  async function act(app: AppInfo, action: "start" | "stop") {
    setBusy(`${app.name}/${action}`);
    try {
      await apiFetch(
        `/api/sites/${encodeURIComponent(app.site)}/apps/${encodeURIComponent(app.name)}/${action}`,
        { method: "POST" },
      );
      await load();
      onProcessChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} the app`);
    } finally {
      setBusy(null);
    }
  }

  async function restartApp(app: AppInfo) {
    setBusy(`${app.name}/restart`);
    try {
      await apiFetch(
        `/api/sites/${encodeURIComponent(app.site)}/apps/${encodeURIComponent(app.name)}/stop`,
        { method: "POST" },
      ).catch(() => {});
      await apiFetch(
        `/api/sites/${encodeURIComponent(app.site)}/apps/${encodeURIComponent(app.name)}/start`,
        { method: "POST" },
      );
      await load();
      onProcessChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restart the app");
    } finally {
      setBusy(null);
    }
  }

  async function deleteApp(app: AppInfo) {
    if (!window.confirm(`Delete supervised process "${app.name}" for ${domain}?`)) {
      return;
    }
    setBusy(`${app.name}/delete`);
    try {
      await apiFetch(
        `/api/sites/${encodeURIComponent(app.site)}/apps/${encodeURIComponent(app.name)}`,
        { method: "DELETE" },
      );
      await load();
      onProcessChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the app");
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
        `/api/sites/${encodeURIComponent(app.site)}/apps/${encodeURIComponent(app.name)}/logs?lines=100`,
      );
      setLogs(data.lines);
    } catch (err) {
      setLogs([err instanceof Error ? err.message : "Failed to load logs"]);
    }
  }

  async function onAddProcess(e: FormEvent) {
    e.preventDefault();
    setAddingProcess(true);
    setAddError(null);
    try {
      await apiPost("/api/apps", {
        site: domain,
        name: name.trim().toLowerCase(),
        kind,
        command: command.trim(),
        port: port.trim() ? Number(port) : undefined,
      });
      setShowAddForm(false);
      setName("web");
      await load();
      onProcessChanged?.();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add process");
    } finally {
      setAddingProcess(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Supervised App Processes</CardTitle>
          <CardDescription>
            Long-running background services proxied by Nginx for <span className="font-mono">{domain}</span>.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {!showAddForm ? (
            <Button variant="secondary" size="sm" onClick={() => setShowAddForm(true)}>
              <Plus size={14} aria-hidden="true" />
              Add Process
            </Button>
          ) : null}
          <Cpu size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardBody className="grid gap-4">
        {error ? <Alert variant="error">{error}</Alert> : null}

        {showAddForm ? (
          <form onSubmit={onAddProcess} className="rounded-lg border border-border bg-muted/30 p-4 grid gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Add Supervised Process</h4>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
            {addError ? <Alert variant="error">{addError}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="process-name" className="text-xs">Process Name</Label>
                <Input
                  id="process-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. web, api"
                  required
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="process-kind" className="text-xs">Runtime</Label>
                <Select
                  id="process-kind"
                  value={kind}
                  onChange={(e) => {
                    const newKind = e.target.value;
                    setKind(newKind);
                    if (DEFAULT_COMMANDS[newKind]) {
                      setCommand(DEFAULT_COMMANDS[newKind]);
                    }
                  }}
                >
                  <option value="node">Node.js</option>
                  <option value="python">Python</option>
                  <option value="go">Go</option>
                  <option value="ruby">Ruby</option>
                  <option value="java">Java / Spring Boot</option>
                  <option value="docker">Docker Container</option>
                  <option value="custom">Custom Command</option>
                </Select>
              </div>
              <div className="grid gap-1 sm:col-span-2">
                <Label htmlFor="process-cmd" className="text-xs">Command</Label>
                <Input
                  id="process-cmd"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="e.g. npm start"
                  required
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="process-port" className="text-xs">Listening Port (optional)</Label>
                <Input
                  id="process-port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="Auto-allocated if blank"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" loading={addingProcess}>
                Start Process
              </Button>
            </div>
          </form>
        ) : null}

        {apps === null && !error ? (
          <Skeleton className="h-12 w-full" />
        ) : apps && apps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No supervised process currently attached to this site. Install an application below or start a custom process.
          </p>
        ) : apps ? (
          apps.map((app) => (
            <div key={app.name} className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">{app.name}</span>
                  <Badge variant="indigo">{app.kind}</Badge>
                  <Badge variant={stateVariant(app.status.state)}>{app.status.state}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">127.0.0.1:{app.port}</span>
                  {app.status.pid ? (
                    <span className="font-mono text-xs text-muted-foreground">pid {app.status.pid}</span>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-red-400 h-7 px-2"
                  disabled={busy !== null}
                  onClick={() => void deleteApp(app)}
                  title="Delete process"
                >
                  <Trash2 size={13} aria-hidden="true" />
                </Button>
              </div>

              <code className="mt-2 block overflow-x-auto rounded-md border border-border bg-background/50 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                {app.command}
              </code>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                  loading={busy === `${app.name}/restart`}
                  disabled={busy !== null}
                  onClick={() => void restartApp(app)}
                >
                  <RotateCw size={12} aria-hidden="true" />
                  Restart
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
