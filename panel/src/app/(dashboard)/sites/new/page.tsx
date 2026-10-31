"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { DNSNameserversInfo, PhpVersionsResponse, RuntimesResponse, SiteSyncResult, Task } from "@/lib/types";
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
import { Globe, Server, Sparkles, Layers, CheckCircle2, ExternalLink, Eye, Zap } from "lucide-react";
import { INDUSTRIAL_APPS, type IndustrialAppTemplate } from "@/lib/templates";

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

type RuntimeChoice = "static" | "php" | "node" | "python" | "go" | "ruby" | "java" | "docker" | "custom";

const APP_KINDS: RuntimeChoice[] = ["node", "python", "go", "ruby", "java", "docker", "custom"];

const KIND_COPY: Record<RuntimeChoice, { title: string; description: string }> = {
  static: { title: "Static site", description: "HTML, CSS and assets from the webroot." },
  php: { title: "PHP", description: "PHP-FPM application with its own pool (WordPress, Laravel)." },
  node: { title: "Node.js", description: "Node app or SSR framework (Next.js, Express, NestJS)." },
  python: { title: "Python", description: "WSGI/ASGI app such as Django, Flask or FastAPI." },
  go: { title: "Go", description: "Compiled Go binary or go run service." },
  ruby: { title: "Ruby", description: "Rack application proxied through nginx." },
  java: { title: "Java / Spring Boot", description: "Standalone Spring Boot executable JAR or Quarkus." },
  docker: { title: "Docker Container", description: "Containerized app or Compose service proxied to port." },
  custom: { title: "Custom command", description: "Any long-running process on a local port." },
};

const DEFAULT_COMMANDS: Record<string, string> = {
  node: "npm start",
  python: "python3 -m gunicorn app:app --bind 127.0.0.1:$PORT",
  go: "./app",
  ruby: "bundle exec rackup -o 127.0.0.1 -p $PORT",
  java: "java -jar app.jar --server.port=$PORT",
  docker: "docker run --rm --name app-service -p 127.0.0.1:$PORT:80 nginx:alpine",
  custom: "",
};

export default function NewSitePage() {
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [selectedTemplate, setSelectedTemplate] = useState<IndustrialAppTemplate | null>(INDUSTRIAL_APPS[0]);
  const [autoCreateDb, setAutoCreateDb] = useState(true);
  const [setupDns, setSetupDns] = useState(true);
  const [setupMail, setSetupMail] = useState(true);
  const [nameservers, setNameservers] = useState<DNSNameserversInfo | null>(null);

  const [domain, setDomain] = useState("");
  const [phpVersion, setPhpVersion] = useState("none");
  const [runtime, setRuntime] = useState<RuntimeChoice>("php");
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
  const [scaffoldSummary, setScaffoldSummary] = useState<string[]>([]);

  const pendingApp = useRef<{
    site: string;
    name: string;
    kind: string;
    version?: string;
    command: string;
    port?: number;
    template?: IndustrialAppTemplate | null;
    autoDb?: boolean;
    setupDns?: boolean;
    setupMail?: boolean;
  } | null>(null);

  const loadVersions = useCallback(async () => {
    setVersions(null);
    setVersionsError(null);
    try {
      const data = await apiFetch<PhpVersionsResponse>("/api/php-versions");
      const filtered = data.versions.filter((version) => version !== "none");
      setVersions(filtered);
      if (filtered.length > 0 && phpVersion === "none") {
        setPhpVersion(filtered[filtered.length - 1]);
      }
    } catch (error) {
      setVersionsError(error instanceof Error ? error.message : "Failed to load PHP versions");
    }
  }, [phpVersion]);

  const loadRuntimes = useCallback(async () => {
    try {
      const data = await apiFetch<RuntimesResponse>("/api/runtimes");
      setRuntimes(data);
    } catch {
      setRuntimes(null);
    }
  }, []);

  useEffect(() => {
    void loadVersions();
    void loadRuntimes();
    apiFetch<DNSNameserversInfo>("/api/dns/nameservers")
      .then((data) => setNameservers(data))
      .catch(() => {});
  }, [loadVersions, loadRuntimes]);

  const chooseTemplate = (tmpl: IndustrialAppTemplate) => {
    setSelectedTemplate(tmpl);
    setRuntime(tmpl.runtime as RuntimeChoice);
    if (tmpl.runtime === "php") {
      if (versions && versions.length > 0) {
        setPhpVersion(versions[versions.length - 1]);
      }
    } else {
      setPhpVersion("none");
    }
    if (tmpl.defaultCommand) {
      setStartCommand(tmpl.defaultCommand);
    }
    if (tmpl.defaultPort) {
      setAppPort(String(tmpl.defaultPort));
    }
    setAppName(tmpl.id);
  };

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
      const chosenPhp = runtime === "php" ? phpVersion : "none";
      const data = await apiPost<{ taskId: string }>("/api/sites", {
        domain: normalized,
        phpVersion: chosenPhp,
      });

      pendingApp.current = {
        site: normalized,
        name: appName.trim().toLowerCase() || "app",
        kind: runtime,
        version: runtimeVersion || undefined,
        command: startCommand.trim(),
        port: appPort.trim() === "" ? undefined : Number(appPort),
        template: mode === "preset" ? selectedTemplate : null,
        autoDb: autoCreateDb,
        setupDns,
        setupMail,
      };

      setCreatedDomain(normalized);
      setTaskId(data.taskId);
      setResult(null);
      setTaskError(null);
      setScaffoldSummary([]);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to create site");
    } finally {
      setSubmitting(false);
    }
  }

  async function onTaskDone(task: Task) {
    if (task.status !== "succeeded") {
      setResult("failed");
      setTaskError(task.error ?? "The site creation task failed. Check the log for details.");
      return;
    }

    const appConfig = pendingApp.current;
    if (!appConfig) {
      setResult("succeeded");
      return;
    }

    const summaryNotes: string[] = [];
    const cleanDomain = appConfig.site.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 16);

    try {
      if (appConfig.template?.requiresDatabase && appConfig.autoDb) {
        const dbName = `${appConfig.template.id}_${cleanDomain}`;
        const dbUser = `${appConfig.template.id}_${cleanDomain}`.slice(0, 16);
        const dbPass = Math.random().toString(36).slice(-10) + "CD!" + Math.random().toString(36).slice(-6);

        try {
          await apiPost("/api/mysql/databases", { name: dbName });
          await apiPost("/api/mysql/users", { user: dbUser, password: dbPass, host: "localhost" });
          await apiPost("/api/mysql/grants", { user: dbUser, host: "localhost", database: dbName, privileges: "all" });
          summaryNotes.push(`MySQL Database: ${dbName} (User: ${dbUser})`);
        } catch (dbErr) {
          summaryNotes.push(`Database auto-provisioning note: ${dbErr instanceof Error ? dbErr.message : "Check MySQL service"}`);
        }
      }

      if (appConfig.template?.scaffoldFiles) {
        for (const [filePath, fileContent] of Object.entries(appConfig.template.scaffoldFiles)) {
          try {
            await fetch(`/api/sites/${encodeURIComponent(appConfig.site)}/files/content`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: filePath, content: fileContent }),
            });
          } catch {
            // best-effort file write
          }
        }
        summaryNotes.push(`Scaffolded ${appConfig.template.name} production structure`);
      }

      if (APP_KINDS.includes(appConfig.kind as RuntimeChoice)) {
        try {
          await apiPost("/api/apps", {
            site: appConfig.site,
            name: appConfig.name,
            kind: appConfig.kind,
            version: appConfig.version,
            command: appConfig.command,
            port: appConfig.port,
          });
          summaryNotes.push(`Supervised app process started on port ${appConfig.port ?? "auto"}`);
        } catch (appErr) {
          summaryNotes.push(`App service start notice: ${appErr instanceof Error ? appErr.message : "Start manually from Applications page"}`);
        }
      }

      if (appConfig.setupDns || appConfig.setupMail) {
        try {
          const syncRes = await apiPost<SiteSyncResult>(
            `/api/sites/${encodeURIComponent(appConfig.site)}/sync`,
            {},
          );
          if (syncRes.dnsZoneCreated) summaryNotes.push("Configured Authoritative DNS Zone");
          if (syncRes.mailDomainCreated || syncRes.dkimApplied) summaryNotes.push("Configured Mail Stack & DKIM keys");
        } catch (syncErr) {
          summaryNotes.push(
            `DNS & Mail sync notice: ${syncErr instanceof Error ? syncErr.message : "Sync manually in site details"}`,
          );
        }
      }

      setScaffoldSummary(summaryNotes);
      setResult("succeeded");
    } catch {
      setResult("succeeded");
    } finally {
      pendingApp.current = null;
    }
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
          title={`Provisioning ${createdDomain}`}
          description="Setting up webroot, permissions, Nginx routing, and industrial application templates."
        />

        {result === "succeeded" ? (
          <Alert variant="success" className="mb-5">
            <div className="grid gap-2">
              <span className="font-semibold">Application site created successfully and live!</span>
              {scaffoldSummary.length > 0 ? (
                <ul className="list-inside list-disc text-xs space-y-1 mt-1 text-foreground/90">
                  {scaffoldSummary.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Alert>
        ) : null}

        {result === "failed" ? (
          <Alert variant="error" className="mb-5">
            {taskError}
          </Alert>
        ) : null}

        <TaskLog taskId={taskId} onComplete={onTaskDone} />

        {result === "succeeded" ? (
          <div className="mt-5 space-y-4">
            {/* Assigned Nameservers & Server IP Card */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-brand/10 p-1.5 text-brand">
                    <Globe size={16} />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Assigned Nameservers &amp; Server IP</span>
                </div>
                <Badge variant="green">Ready for Traffic</Badge>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
                <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
                  <div className="text-muted-foreground font-medium">Primary NS (NS1)</div>
                  <div className="mt-1 font-mono font-semibold text-foreground truncate">{nameservers?.nameserver1 || "ns1.yourdomain.com"}</div>
                </div>
                <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
                  <div className="text-muted-foreground font-medium">Secondary NS (NS2)</div>
                  <div className="mt-1 font-mono font-semibold text-foreground truncate">{nameservers?.nameserver2 || "ns2.yourdomain.com"}</div>
                </div>
                <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
                  <div className="text-muted-foreground font-medium">Server IP</div>
                  <div className="mt-1 font-mono font-semibold text-foreground truncate">{nameservers?.serverIP || "127.0.0.1"}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`/api/preview/${encodeURIComponent(createdDomain)}`}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonClass("primary", "md")}
              >
                <Eye size={16} aria-hidden="true" />
                Preview Site (In-Panel)
              </a>
              <Link
                href={`/sites/${encodeURIComponent(createdDomain)}`}
                className={buttonClass("secondary", "md")}
              >
                <Zap size={16} aria-hidden="true" />
                Launch Public Tunnel
              </Link>
              <a
                href={`http://${createdDomain}`}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonClass("secondary", "md")}
              >
                <ExternalLink size={16} aria-hidden="true" />
                Open site in browser
              </a>
              <Link href={`/sites/${encodeURIComponent(createdDomain)}`} className={buttonClass("secondary", "md")}>
                View site details
              </Link>
              <Link href="/sites" className={buttonClass("ghost", "md")}>
                All sites
              </Link>
              <Button variant="ghost" onClick={createAnother}>
                Create another
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-3.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground/90">
                If using a custom domain (e.g., .ss), make sure it resolves to your server IP in DNS or /etc/hosts.
              </p>
              <p className="mt-1">
                For local development or testing, add{" "}
                <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                  &lt;server_ip&gt; {createdDomain}
                </code>{" "}
                to your <code className="font-mono text-[11px]">/etc/hosts</code> or Windows{" "}
                <code className="font-mono text-[11px]">C:\Windows\System32\drivers\etc\hosts</code>.
              </p>
            </div>
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
        title="New Site & Application"
        description="Deploy famous industrial apps with 1-click scaffolding or configure custom runtime environments."
      />

      <div className="mb-6 flex items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => {
            setMode("preset");
            if (selectedTemplate) chooseTemplate(selectedTemplate);
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer",
            mode === "preset"
              ? "bg-[#235361] text-white shadow-sm"
              : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
          )}
        >
          <Sparkles size={16} className="text-[#FAAA93]" />
          Famous Industrial Apps
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer",
            mode === "custom"
              ? "bg-[#235361] text-white shadow-sm"
              : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
          )}
        >
          <Layers size={16} className="text-[#74B8CC]" />
          Custom / Manual Stack
        </button>
      </div>

      <Card className="max-w-3xl">
        <CardBody>
          <form onSubmit={onSubmit} className="grid gap-6">
            <div className="grid gap-1.5">
              <Label htmlFor="domain" className="text-base font-semibold">
                Domain Name
              </Label>
              <Input
                id="domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="myapp.example.com"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                required
                disabled={submitting}
                className="font-mono text-base"
              />
              <p className="text-xs text-muted-foreground">
                Enter your production domain or local test host (e.g., <code>app.local</code> or <code>example.com</code>).
              </p>
            </div>

            {mode === "preset" ? (
              <div className="grid gap-3">
                <Label className="text-base font-semibold">Choose Industrial App Template</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {INDUSTRIAL_APPS.map((tmpl) => {
                    const isSelected = selectedTemplate?.id === tmpl.id;
                    return (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => chooseTemplate(tmpl)}
                        className={cn(
                          "flex flex-col text-left p-3.5 rounded-xl border transition-all cursor-pointer relative",
                          isSelected
                            ? "border-[#74B8CC] bg-[#74B8CC]/10 shadow-sm"
                            : "border-border bg-card/40 hover:bg-muted/30"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                            {tmpl.name}
                          </span>
                          {isSelected ? (
                            <CheckCircle2 size={16} className="text-[#74B8CC]" />
                          ) : (
                            <Badge variant="neutral" className="text-[10px] uppercase font-mono">
                              {tmpl.category}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {tmpl.tagline}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {selectedTemplate ? (
                  <div className="mt-2 rounded-xl border border-border/80 bg-muted/20 p-4 grid gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#74B8CC]">
                        Template Configuration • {selectedTemplate.name}
                      </span>
                      <Badge variant="indigo">Runtime: {selectedTemplate.runtime}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedTemplate.description}
                    </p>

                    {selectedTemplate.requiresDatabase ? (
                      <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={autoCreateDb}
                          onChange={(e) => setAutoCreateDb(e.target.checked)}
                          className="rounded border-border text-[#235361] focus:ring-[#74B8CC]"
                        />
                        <span>Automatically create dedicated MySQL database & user with strong credentials</span>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3">
                <Label className="text-base font-semibold">Select Runtime Stack</Label>
                <div className="grid gap-2.5 sm:grid-cols-2">
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
                              : ""
                          );
                        }}
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                          runtime === choice
                            ? "border-[#74B8CC] bg-[#74B8CC]/10"
                            : "border-border bg-muted/20 hover:bg-accent",
                          unavailable && "cursor-not-allowed opacity-50"
                        )}
                      >
                        <span className="mt-0.5 text-muted-foreground">
                          {APP_KINDS.includes(choice) ? <Server size={15} /> : <Globe size={15} />}
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                            {KIND_COPY[choice].title}
                            {unavailable ? <Badge variant="amber">not installed</Badge> : null}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {KIND_COPY[choice].description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {runtime === "php" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="phpVersion">PHP Version</Label>
                <Select
                  id="phpVersion"
                  value={phpVersion}
                  onChange={(event) => setPhpVersion(event.target.value)}
                  disabled={submitting || versions === null}
                >
                  {versions?.map((version) => (
                    <option key={version} value={version}>
                      PHP {version} {version === "8.4" ? "(Default Recommended)" : ""}
                    </option>
                  ))}
                  {versions === null && !versionsError ? (
                    <option value="none">Loading PHP versions…</option>
                  ) : null}
                </Select>
                {versionsError ? (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-red-600 dark:text-red-400">
                    {versionsError}
                    <button
                      type="button"
                      onClick={() => void loadVersions()}
                      className="cursor-pointer text-[#74B8CC] underline-offset-2 hover:underline"
                    >
                      Retry
                    </button>
                  </p>
                ) : null}
              </div>
            ) : null}

            {isAppRuntime ? (
              <div className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="appPort">Application Local Port</Label>
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
                  <div className="grid gap-1.5">
                    <Label htmlFor="appName">App Identifier</Label>
                    <Input
                      id="appName"
                      value={appName}
                      onChange={(event) => setAppName(event.target.value)}
                      placeholder="app"
                      className="font-mono"
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="startCommand">Start Command</Label>
                  <Input
                    id="startCommand"
                    value={startCommand}
                    onChange={(event) => setStartCommand(event.target.value)}
                    placeholder="npm start"
                    className="font-mono"
                    disabled={submitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Supervised via <span className="font-mono font-medium">{runtimes?.supervisor.backend ?? "systemd"}</span> and proxied through Nginx. Use <code className="text-[#74B8CC]">$PORT</code> to bind to the assigned port.
                  </p>
                </div>
              </div>
            ) : null}

            {/* DNS & Mail Integration Options */}
            <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Automated DNS &amp; Mail Stack Configuration
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={setupDns}
                  onChange={(e) => setSetupDns(e.target.checked)}
                  disabled={submitting}
                  className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">Set up Authoritative DNS Zone</span>
                  <p className="text-xs text-muted-foreground">
                    Automatically provisions a PowerDNS zone with authoritative NS and @ / www A-records pointing to this server.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={setupMail}
                  onChange={(e) => setSetupMail(e.target.checked)}
                  disabled={submitting}
                  className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">Configure Mail Stack &amp; DKIM</span>
                  <p className="text-xs text-muted-foreground">
                    Sets up the mail domain, generates 2048-bit DKIM keys, and publishes SPF, DMARC, and MX DNS records.
                  </p>
                </div>
              </label>
            </div>

            {formError ? <Alert variant="error">{formError}</Alert> : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="submit" loading={submitting} size="md" className="bg-[#235361] hover:bg-[#1a3f4a] text-white">
                Create & Deploy Application
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
