"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { PhpVersionsResponse, RuntimesResponse, Task } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { TaskLog } from "@/components/task-log";
import { cn } from "@/components/ui/cn";
import { Globe, Server } from "lucide-react";

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

type RuntimeChoice = "static" | "php" | "node" | "python" | "go" | "ruby" | "custom";

const APP_KINDS: RuntimeChoice[] = ["node", "python", "go", "ruby", "custom"];

const KIND_COPY: Record<RuntimeChoice, { title: string; description: string }> = {
  static: { title: "Static site", description: "HTML, CSS and assets from the webroot." },
  php: { title: "PHP", description: "PHP-FPM application with its own pool." },
  node: { title: "Node.js", description: "Node app or SSR framework, proxied with WebSocket support." },
  python: { title: "Python", description: "WSGI/ASGI app such as Django, Flask or FastAPI." },
  go: { title: "Go", description: "Compiled Go binary or go run service." },
  ruby: { title: "Ruby", description: "Rack application proxied through nginx." },
  custom: { title: "Custom command", description: "Any long-running process on a local port." },
};

const DEFAULT_COMMANDS: Record<string, string> = {
  node: "npm start",
  python: "python3 -m gunicorn app:app --bind 127.0.0.1:$PORT",
  go: "./app",
  ruby: "bundle exec rackup -o 127.0.0.1 -p $PORT",
  custom: "",
};

export default function NewSitePage() {
  const [domain, setDomain] = useState("");
  const [phpVersion, setPhpVersion] = useState("none");
  const [runtime, setRuntime] = useState<RuntimeChoice>("static");
  const [runtimeVersion, setRuntimeVersion] = useState("");
  const [startCommand, setStartCommand] = useState(DEFAULT_COMMANDS.node);
  const [appPort, setAppPort] = useState("");
  const [appName, setAppName] = useState("app");
  const [versions, setVersions] = useState<string[] | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [runtimes, setRuntimes] = useState<RuntimesResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [createdDomain, setCreatedDomain] = useState("");
  const [result, setResult] = useState<"succeeded" | "failed" | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const pendingApp = useRef<{
    site: string;
    name: string;
    kind: string;
    version?: string;
    command: string;
    port?: number;
  } | null>(null);

  const loadVersions = useCallback(async () => {
    setVersions(null);
    setVersionsError(null);
    try {
      const data = await apiFetch<PhpVersionsResponse>("/api/php-versions");
      setVersions(data.versions.filter((version) => version !== "none"));
    } catch (error) {
      setVersionsError(error instanceof Error ? error.message : "Failed to load PHP versions");
    }
  }, []);

  const loadRuntimes = useCallback(async () => {
    try {
      const data = await apiFetch<RuntimesResponse>("/api/runtimes");
      setRuntimes(data);
    } catch {
      // Runtime discovery is best-effort; the static/PHP path still works.
      setRuntimes(null);
    }
  }, []);

  useEffect(() => {
    void loadVersions();
    void loadRuntimes();
  }, [loadVersions, loadRuntimes]);

  const runtimeInfo = runtimes?.runtimes.find((info) => info.kind === runtime) ?? null;
  const isAppRuntime = APP_KINDS.includes(runtime);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = domain.trim().toLowerCase();
    if (!DOMAIN_PATTERN.test(normalized)) {
      setFormError("Enter a valid domain, like example.com (letters, numbers and hyphens, at least two labels).");
      return;
    }
    if (isAppRuntime && startCommand.trim() === "") {
      setFormError("Enter the command that starts your application.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const data = await apiPost<{ taskId: string }>("/api/sites", {
        domain: normalized,
        phpVersion: runtime === "php" ? phpVersion : "none",
      });
      pendingApp.current = isAppRuntime
        ? {
            site: normalized,
            name: appName.trim().toLowerCase() || "app",
            kind: runtime,
            version: runtimeVersion || undefined,
            command: startCommand.trim(),
            port: appPort.trim() === "" ? undefined : Number(appPort),
          }
        : null;
      setCreatedDomain(normalized);
      setTaskId(data.taskId);
      setResult(null);
      setTaskError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to create site");
    } finally {
      setSubmitting(false);
    }
  }

  async function onTaskDone(task: Task) {
    if (task.status !== "succeeded") {
      setResult("failed");
      setTaskError(task.error ?? "The task failed. Check the log for details.");
      return;
    }
    if (pendingApp.current) {
      try {
        await apiPost("/api/apps", pendingApp.current);
      } catch (error) {
        setResult("failed");
        setTaskError(
          `The site was created, but the application could not be started: ${
            error instanceof Error ? error.message : "unknown error"
          }. Add it from the Applications page.`,
        );
        pendingApp.current = null;
        return;
      }
      pendingApp.current = null;
    }
    setResult("succeeded");
  }

  function backToForm() {
    setTaskId(null);
    setResult(null);
    setTaskError(null);
    setFormError(null);
  }

  function createAnother() {
    setDomain("");
    setPhpVersion("none");
    backToForm();
  }

  if (taskId) {
    return (
      <>
        <PageHeader
          title={`Creating ${createdDomain}`}
          description="The site is being provisioned. This usually takes a few seconds."
        />

        {result === "succeeded" ? (
          <Alert variant="success" className="mb-5">
            Site created successfully. It is ready to receive traffic.
          </Alert>
        ) : null}

        {result === "failed" ? (
          <Alert variant="error" className="mb-5">
            {taskError}
          </Alert>
        ) : null}

        <TaskLog taskId={taskId} onComplete={onTaskDone} />

        {result === "succeeded" ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/sites/${encodeURIComponent(createdDomain)}`} className={buttonClass("primary", "md")}>
              Open site
            </Link>
            <Button variant="secondary" onClick={createAnother}>
              Create another
            </Button>
          </div>
        ) : null}

        {result === "failed" ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={backToForm}>
              Try again
            </Button>
            <Link href="/sites" className={buttonClass("ghost", "md")}>
              Back to sites
            </Link>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New site"
        description="Create a site with its own webroot and nginx configuration."
      />

      <Card className="max-w-2xl">
        <CardBody>
          <form onSubmit={onSubmit} className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="example.com"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                required
                disabled={submitting}
                className="font-mono"
              />
              <p className="text-xs text-slate-500">
                Lowercase letters, numbers and hyphens per label, separated by dots — e.g.
                example.com. No protocol, port or trailing dot.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Runtime</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(KIND_COPY) as RuntimeChoice[]).map((choice) => {
                  const info = runtimes?.runtimes.find((entry) => entry.kind === choice);
                  const unavailable = choice !== "static" && choice !== "php" && info !== undefined && !info.available;
                  return (
                    <button
                      key={choice}
                      type="button"
                      disabled={submitting || unavailable}
                      onClick={() => {
                        setRuntime(choice);
                        setRuntimeVersion("");
                        setStartCommand(DEFAULT_COMMANDS[choice] ?? "");
                        setAppPort(
                          info?.defaultPort && APP_KINDS.includes(choice)
                            ? String(info.defaultPort)
                            : "",
                        );
                      }}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                        runtime === choice
                          ? "border-indigo-500/60 bg-indigo-500/10"
                          : "border-border bg-muted/20 hover:bg-accent",
                        unavailable && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <span className="mt-0.5 text-slate-400">
                        {APP_KINDS.includes(choice) ? <Server size={15} /> : <Globe size={15} />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-200">
                          {KIND_COPY[choice].title}
                          {unavailable ? <Badge variant="amber">not installed</Badge> : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {KIND_COPY[choice].description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {runtime === "php" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="phpVersion">PHP version</Label>
                <Select
                  id="phpVersion"
                  value={phpVersion}
                  onChange={(event) => setPhpVersion(event.target.value)}
                  disabled={submitting || versions === null}
                >
                  {versions?.map((version) => (
                    <option key={version} value={version}>
                      PHP {version}
                    </option>
                  ))}
                  {versions === null && !versionsError ? (
                    <option value="none">Loading PHP versions…</option>
                  ) : null}
                </Select>
                {versionsError ? (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-red-400">
                    {versionsError}
                    <button
                      type="button"
                      onClick={() => void loadVersions()}
                      className="cursor-pointer text-indigo-300 underline-offset-2 hover:underline"
                    >
                      Retry
                    </button>
                  </p>
                ) : null}
              </div>
            ) : null}

            {isAppRuntime ? (
              <div className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="runtimeVersion">Runtime version</Label>
                    <Select
                      id="runtimeVersion"
                      value={runtimeVersion}
                      onChange={(event) => setRuntimeVersion(event.target.value)}
                      disabled={submitting}
                    >
                      <option value="">Default</option>
                      {runtimeInfo?.versions.map((install) => (
                        <option key={`${install.version}-${install.bin ?? ""}`} value={install.version}>
                          {install.version}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="appPort">Local port</Label>
                    <Input
                      id="appPort"
                      type="number"
                      min={1}
                      max={65535}
                      value={appPort}
                      onChange={(event) => setAppPort(event.target.value)}
                      placeholder={String(runtimeInfo?.defaultPort ?? 3000)}
                      className="font-mono"
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div className="grid gap-1.5">
                    <Label htmlFor="appName">App name</Label>
                    <Input
                      id="appName"
                      value={appName}
                      onChange={(event) => setAppName(event.target.value)}
                      placeholder="app"
                      className="font-mono"
                      disabled={submitting}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="startCommand">Start command</Label>
                    <Input
                      id="startCommand"
                      value={startCommand}
                      onChange={(event) => setStartCommand(event.target.value)}
                      placeholder="npm start"
                      className="min-w-[18rem] font-mono"
                      disabled={submitting}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  The site is created first, then the app is started under{" "}
                  <span className="font-mono">{runtimes?.supervisor.backend ?? "systemd"}</span> and
                  proxied through nginx. Use $PORT in the command to receive the port above.
                </p>
              </div>
            ) : null}

            {formError ? <Alert variant="error">{formError}</Alert> : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={submitting}>
                Create site
              </Button>
              <Link href="/sites" className={buttonClass("ghost", "md")}>
                Cancel
              </Link>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
