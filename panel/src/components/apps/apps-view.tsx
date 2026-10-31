"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import type {
  AppInfo,
  AppsResponse,
  CreateAppRequest,
  RuntimeKindInfo,
  RuntimesResponse,
  Site,
  SiteListResponse,
} from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/components/ui/cn";
import { Cpu, Play, RotateCw, Square, Trash2, Terminal } from "lucide-react";

const APP_KINDS = new Set(["node", "python", "go", "ruby", "java", "docker", "custom"]);

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

function kindLabel(kind: string): string {
  switch (kind) {
    case "node":
      return "Node.js";
    case "python":
      return "Python";
    case "go":
      return "Go";
    case "ruby":
      return "Ruby";
    case "java":
      return "Java / Spring Boot";
    case "docker":
      return "Docker";
    case "custom":
      return "Custom";
    default:
      return kind;
  }
}

function uptime(seconds?: number): string {
  if (!seconds || seconds < 1) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function AppsView() {
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [runtimes, setRuntimes] = useState<RuntimesResponse | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [appData, runtimeData, siteData] = await Promise.all([
        apiFetch<AppsResponse>("/api/apps"),
        apiFetch<RuntimesResponse>("/api/runtimes"),
        apiFetch<SiteListResponse>("/api/sites"),
      ]);
      setApps(appData.apps);
      setRuntimes(runtimeData);
      setSites(siteData.sites);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll status while the page is open so state changes show up without a reload.
  useEffect(() => {
    const timer = setInterval(() => {
      void apiFetch<AppsResponse>("/api/apps")
        .then((data) => setApps(data.apps))
        .catch(() => undefined);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const appKinds = useMemo(
    () => (runtimes?.runtimes ?? []).filter((info) => APP_KINDS.has(info.kind)),
    [runtimes],
  );

  async function runAction(app: AppInfo, action: "start" | "stop") {
    const key = `${app.site}/${app.name}/${action}`;
    setBusy(key);
    setActionError(null);
    try {
      await apiFetch(
        `/api/sites/${encodeURIComponent(app.site)}/apps/${encodeURIComponent(app.name)}/${action}`,
        { method: "POST" },
      );
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to ${action} the app`);
    } finally {
      setBusy(null);
    }
  }

  async function removeApp(app: AppInfo) {
    if (!window.confirm(`Delete app "${app.name}" on ${app.site}? Its process is stopped and removed.`)) {
      return;
    }
    const key = `${app.site}/${app.name}/delete`;
    setBusy(key);
    setActionError(null);
    try {
      await apiFetch(
        `/api/sites/${encodeURIComponent(app.site)}/apps/${encodeURIComponent(app.name)}`,
        { method: "DELETE" },
      );
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete the app");
    } finally {
      setBusy(null);
    }
  }

  async function showLogs(app: AppInfo) {
    const key = `${app.site}/${app.name}`;
    if (logsFor === key) {
      setLogsFor(null);
      setLogs(null);
      return;
    }
    setLogsFor(key);
    setLogs(null);
    try {
      const data = await apiFetch<{ lines: string[] }>(
        `/api/sites/${encodeURIComponent(app.site)}/apps/${encodeURIComponent(app.name)}/logs?lines=200`,
      );
      setLogs(data.lines);
    } catch (err) {
      setLogs([err instanceof Error ? err.message : "Failed to load logs"]);
    }
  }

  return (
    <>
      <PageHeader
        title="Applications"
        description="Long-running Node.js, Python, Go and Ruby processes supervised by the agent."
        actions={
          <Button onClick={() => setShowForm((value) => !value)} disabled={sites.length === 0}>
            {showForm ? "Close" : "New app"}
          </Button>
        }
      />

      {error ? (
        <Alert variant="error" className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {actionError ? (
        <Alert variant="error" className="mb-5">
          {actionError}
        </Alert>
      ) : null}

      {showForm && sites.length > 0 ? (
        <NewAppForm
          sites={sites}
          kinds={appKinds}
          supervisor={runtimes?.supervisor.backend ?? "systemd"}
          onCreated={async () => {
            setShowForm(false);
            await load();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {apps === null && !error ? (
        <div className="grid gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : apps && apps.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="No applications yet"
          description="Create a site, then add a Node.js, Python, Go or Ruby app to run it behind nginx."
          action={
            sites.length === 0 ? (
              <Link href="/sites/new" className={buttonClass("primary", "sm")}>
                Create a site
              </Link>
            ) : (
              <Button size="sm" onClick={() => setShowForm(true)}>
                New app
              </Button>
            )
          }
        />
      ) : apps ? (
        <div className="grid gap-3">
          {apps.map((app) => {
            const key = `${app.site}/${app.name}`;
            return (
              <Card key={key}>
                <CardHeader>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="font-mono">{app.name}</CardTitle>
                      <Badge variant="indigo">{kindLabel(app.kind)}</Badge>
                      {app.version ? <Badge>{app.version}</Badge> : null}
                      <Badge variant={stateVariant(app.status.state)}>{app.status.state}</Badge>
                    </div>
                    <CardDescription>
                      <Link
                        href={`/sites/${encodeURIComponent(app.site)}`}
                        className="font-mono hover:text-foreground/80"
                      >
                        {app.site}
                      </Link>{" "}
                      · 127.0.0.1:{app.port} · {app.supervisor ?? "systemd"}
                      {app.status.pid ? ` · pid ${app.status.pid}` : ""}
                      {app.status.state === "running" ? ` · up ${uptime(app.status.uptimeSeconds)}` : ""}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardBody className="grid gap-4">
                  <code className="block overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground/80">
                    {app.command}
                  </code>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy === `${key}/start`}
                      disabled={app.status.state === "running" || busy !== null}
                      onClick={() => void runAction(app, "start")}
                    >
                      <Play size={13} aria-hidden="true" />
                      Start
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy === `${key}/stop`}
                      disabled={app.status.state !== "running" || busy !== null}
                      onClick={() => void runAction(app, "stop")}
                    >
                      <Square size={13} aria-hidden="true" />
                      Stop
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy === `${key}/start`}
                      disabled={busy !== null}
                      onClick={() => {
                        void (async () => {
                          await runAction(app, "stop");
                          await runAction(app, "start");
                        })();
                      }}
                    >
                      <RotateCw size={13} aria-hidden="true" />
                      Restart
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void showLogs(app)}>
                      <Terminal size={13} aria-hidden="true" />
                      {logsFor === key ? "Hide logs" : "Logs"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                      loading={busy === `${key}/delete`}
                      disabled={busy !== null}
                      onClick={() => void removeApp(app)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      Delete
                    </Button>
                  </div>

                  {logsFor === key ? (
                    <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
                      {logs === null ? "Loading…" : logs.length === 0 ? "No log output yet." : logs.join("\n")}
                    </pre>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function NewAppForm({
  sites,
  kinds,
  supervisor,
  onCreated,
  onCancel,
}: {
  sites: Site[];
  kinds: RuntimeKindInfo[];
  supervisor: string;
  onCreated: () => Promise<void>;
  onCancel: () => void;
}) {
  const [site, setSite] = useState(sites[0]?.domain ?? "");
  const [name, setName] = useState("app");
  const [kind, setKind] = useState(kinds[0]?.kind ?? "node");
  const [version, setVersion] = useState("");
  const [command, setCommand] = useState("npm start");
  const [dir, setDir] = useState("");
  const [port, setPort] = useState("");
  const [envText, setEnvText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selected = kinds.find((info) => info.kind === kind);

  useEffect(() => {
    setVersion("");
    if (kind === "node") setCommand("npm start");
    else if (kind === "python") setCommand("python3 -m gunicorn app:app --bind 127.0.0.1:$PORT");
    else if (kind === "go") setCommand("./app");
    else if (kind === "ruby") setCommand("bundle exec rackup -o 127.0.0.1 -p $PORT");
    else if (kind === "java") setCommand("java -jar app.jar --server.port=$PORT");
    else if (kind === "docker") setCommand("docker run --rm --name app-service -p 127.0.0.1:$PORT:80 nginx:alpine");
    else setCommand("");
    if (selected?.defaultPort) setPort(String(selected.defaultPort));
  }, [kind, selected?.defaultPort]);

  function parseEnv(raw: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return env;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const body: CreateAppRequest = {
      site,
      name: name.trim().toLowerCase(),
      kind,
      command: command.trim(),
      dir: dir.trim() || undefined,
      port: port.trim() === "" ? undefined : Number(port),
      version: version || undefined,
      env: parseEnv(envText),
    };
    try {
      await apiPost("/api/apps", body);
      await onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create the app");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-5">
      <CardHeader>
        <div>
          <CardTitle>New application</CardTitle>
          <CardDescription>
            The process runs under {supervisor} as the site user and is proxied through nginx.
          </CardDescription>
        </div>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="app-site">Site</Label>
              <Select id="app-site" value={site} onChange={(event) => setSite(event.target.value)}>
                {sites.map((entry) => (
                  <option key={entry.domain} value={entry.domain}>
                    {entry.domain}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="app-name">Name</Label>
              <Input
                id="app-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="api"
                className="font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">Lowercase letters, digits and hyphens. Used in the URL prefix.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="app-kind">Runtime</Label>
              <Select id="app-kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                {kinds.map((info) => (
                  <option key={info.kind} value={info.kind} disabled={!info.available}>
                    {info.label}
                    {info.available ? "" : " (not installed)"}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="app-version">Version</Label>
              <Select id="app-version" value={version} onChange={(event) => setVersion(event.target.value)}>
                <option value="">Default</option>
                {selected?.versions.map((install) => (
                  <option key={`${install.version}-${install.bin ?? ""}`} value={install.version}>
                    {install.version}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="app-command">Start command</Label>
            <Input
              id="app-command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="npm start"
              className="font-mono"
              required
            />
            <p className="text-xs text-muted-foreground">
              Runs from the app directory. Use $PORT in the command to pick up the port below.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="app-dir">Directory (relative to webroot)</Label>
              <Input
                id="app-dir"
                value={dir}
                onChange={(event) => setDir(event.target.value)}
                placeholder="."
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="app-port">Local port</Label>
              <Input
                id="app-port"
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(event) => setPort(event.target.value)}
                placeholder="3000"
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="app-env">Environment variables</Label>
            <textarea
              id="app-env"
              value={envText}
              onChange={(event) => setEnvText(event.target.value)}
              rows={3}
              spellCheck={false}
              placeholder={"NODE_ENV=production\nPORT=3000"}
              className={cn(
                "w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            />
          </div>

          {formError ? <Alert variant="error">{formError}</Alert> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={submitting}>
              Create app
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
