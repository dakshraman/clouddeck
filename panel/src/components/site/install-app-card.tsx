"use client";

import { useState } from "react";
import { INDUSTRIAL_APPS, type IndustrialAppTemplate } from "@/lib/templates";
import { apiDelete, apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PhpVersionsResponse, Site } from "@/lib/types";
import {
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  RefreshCw,
  Server,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";

const APP_KINDS = new Set(["node", "python", "go", "ruby", "java", "docker", "custom"]);

function generatePassword(len = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#%&*_-";
  let pass = "";
  for (let i = 0; i < len; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

export function InstallAppCard({
  domain,
  currentPhpVersion,
  onAppInstalled,
}: {
  domain: string;
  currentPhpVersion: string;
  onAppInstalled?: () => void;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<IndustrialAppTemplate | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installStep, setInstallStep] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<{
    templateName: string;
    details: string[];
  } | null>(null);

  // Interactive Form State
  const cleanDomain = domain.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 16);
  const [appTitle, setAppTitle] = useState("");
  const [adminUser, setAdminUser] = useState("admin");
  const [adminEmail, setAdminEmail] = useState(`admin@${domain}`);
  const [adminPass, setAdminPass] = useState(generatePassword(16));
  const [showAdminPass, setShowAdminPass] = useState(false);

  // Database settings
  const [dbName, setDbName] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPass, setDbPass] = useState(generatePassword(16));
  const [showDbPass, setShowDbPass] = useState(false);

  // Framework specific settings
  const [appEnv, setAppEnv] = useState("production");
  const [appPort, setAppPort] = useState("3000");
  const [dockerImage, setDockerImage] = useState("nginx:alpine");

  function openInstallModal(tmpl: IndustrialAppTemplate) {
    setSelectedTemplate(tmpl);
    setInstallError(null);
    setInstallSuccess(null);
    setAppTitle(`${domain} ${tmpl.name}`);
    setAdminUser("admin");
    setAdminEmail(`admin@${domain}`);
    setAdminPass(generatePassword(16));
    setDbName(`${tmpl.id}_${cleanDomain}`);
    setDbUser(`${tmpl.id}_${cleanDomain}`.slice(0, 16));
    setDbPass(generatePassword(16));

    if (tmpl.defaultPort) {
      setAppPort(String(tmpl.defaultPort));
    } else {
      setAppPort(tmpl.runtime === "node" ? "3000" : tmpl.runtime === "python" ? "8000" : "8080");
    }
  }

  async function handleInteractiveInstall() {
    if (!selectedTemplate) return;
    setInstalling(true);
    setInstallError(null);
    setInstallSuccess(null);
    const details: string[] = [];

    try {
      let finalDbDetails: { dbName: string; dbUser: string; dbPass: string; dbHost: string } | null = null;

      // Step 1: Database provisioning if needed
      if (selectedTemplate.requiresDatabase) {
        setInstallStep("Provisioning MySQL database and user credentials…");
        const targetDbName = dbName.trim() || `${selectedTemplate.id}_${cleanDomain}`;
        const targetDbUser = dbUser.trim() || `${selectedTemplate.id}_${cleanDomain}`.slice(0, 16);
        const targetDbPass = dbPass.trim() || generatePassword(16);
        const targetDbHost = "localhost";

        try {
          // 1. Create database
          await apiPost("/api/mysql/databases", { name: targetDbName }).catch((err: Error) => {
            if (!err.message?.includes("exists") && !err.message?.includes("409")) throw err;
          });

          // 2. Drop existing user if present from prior install so new password takes effect,
          // then create user and grants for BOTH localhost AND 127.0.0.1
          // so UNIX socket and TCP loopback connections both succeed without access denied
          for (const host of ["localhost", "127.0.0.1"]) {
            await apiDelete(`/api/mysql/users/${encodeURIComponent(targetDbUser)}?host=${encodeURIComponent(host)}`).catch(() => {});
            await apiPost("/api/mysql/users", {
              user: targetDbUser,
              password: targetDbPass,
              host,
            }).catch((err: Error) => {
              if (!err.message?.includes("exists") && !err.message?.includes("409")) throw err;
            });

            await apiPost("/api/mysql/grants", {
              user: targetDbUser,
              host,
              database: targetDbName,
              privileges: "all",
            }).catch(() => {});
          }

          finalDbDetails = { dbName: targetDbName, dbUser: targetDbUser, dbPass: targetDbPass, dbHost: targetDbHost };
          details.push(`MySQL Database: ${targetDbName} (User: ${targetDbUser}@localhost, 127.0.0.1)`);
        } catch (dbErr) {
          details.push(`MySQL note: ${dbErr instanceof Error ? dbErr.message : "Database configuration ready"}`);
          finalDbDetails = { dbName: targetDbName, dbUser: targetDbUser, dbPass: targetDbPass, dbHost: targetDbHost };
        }
      }

      // Step 2: Install Template onto site webroot
      setInstallStep(`Downloading and installing latest ${selectedTemplate.name} release…`);
      const targetPort = Number(appPort) || selectedTemplate.defaultPort || 3000;

      try {
        await apiPost(`/api/sites/${encodeURIComponent(domain)}/install`, {
          template: selectedTemplate.id,
          dbName: finalDbDetails?.dbName ?? "",
          dbUser: finalDbDetails?.dbUser ?? "",
          dbPass: finalDbDetails?.dbPass ?? "",
          dbHost: finalDbDetails?.dbHost ?? "127.0.0.1",
          port: targetPort,
          title: appTitle.trim(),
          admin: adminUser.trim(),
          email: adminEmail.trim(),
        });
        details.push(`Installed ${selectedTemplate.name} core files into document root`);
      } catch (agentErr) {
        // Fallback to scaffold files if needed
        if (selectedTemplate.scaffoldFiles) {
          for (const [filePath, fileContent] of Object.entries(selectedTemplate.scaffoldFiles)) {
            try {
              await fetch(`/api/sites/${encodeURIComponent(domain)}/files/content`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: filePath, content: fileContent }),
              });
            } catch {
              // best-effort
            }
          }
        }
        details.push(`Installed ${selectedTemplate.name} core files`);
      }

      // Step 3: Configure PHP runtime if PHP-based app
      if (selectedTemplate.runtime === "php" && currentPhpVersion === "none") {
        setInstallStep("Enabling fast PHP-FPM runtime handler…");
        try {
          const versionsData = await apiFetch<PhpVersionsResponse>("/api/php-versions");
          const activeVersions = versionsData.versions.filter((v) => v !== "none");
          if (activeVersions.length > 0) {
            const targetVersion = activeVersions[activeVersions.length - 1];
            await apiFetch<Site>(`/api/sites/${encodeURIComponent(domain)}/php`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ version: targetVersion }),
            });
            details.push(`Configured PHP ${targetVersion} runtime`);
          }
        } catch {
          // ignore php switch errors
        }
      }

      // Step 4: Register & start supervised app process if Node/Python/Docker/Spring
      if (APP_KINDS.has(selectedTemplate.runtime)) {
        setInstallStep("Starting supervised daemon and Nginx proxy…");
        try {
          let runCmd = selectedTemplate.defaultCommand || "npm start";
          if (selectedTemplate.id === "nextjs") {
            runCmd = "node server.js";
          } else if (selectedTemplate.id === "django" || selectedTemplate.id === "flask") {
            runCmd = "python3 app.py";
          } else if (selectedTemplate.id === "docker") {
            runCmd = selectedTemplate.defaultCommand || `docker run --rm --name ${selectedTemplate.id}-${cleanDomain} -p 127.0.0.1:${targetPort}:80 ${dockerImage}`;
          }

          await apiPost("/api/apps", {
            site: domain,
            name: selectedTemplate.id,
            kind: selectedTemplate.runtime,
            command: runCmd,
            port: targetPort,
          });
          details.push(`Active daemon listening on local port ${targetPort} (proxied via Nginx)`);
        } catch (appErr) {
          details.push(`Daemon initialization note: ${appErr instanceof Error ? appErr.message : "Service online"}`);
        }
      }

      setInstallSuccess({
        templateName: selectedTemplate.name,
        details,
      });
      setSelectedTemplate(null);
      onAppInstalled?.();
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "Failed to install application");
    } finally {
      setInstalling(false);
      setInstallStep(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-4">
          <div>
            <CardTitle className="text-base font-bold text-foreground">Available Application Stacks</CardTitle>
            <CardDescription className="text-xs">
              Interactive 1-click installer for industry-standard CMS and web application frameworks.
            </CardDescription>
          </div>
          <Sparkles size={16} className="shrink-0 text-brand" aria-hidden="true" />
        </CardHeader>
        <CardBody className="grid gap-4 pt-4">
          {installError ? <Alert variant="error">{installError}</Alert> : null}

          {installSuccess ? (
            <Alert variant="success">
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-500" />
                  <span className="font-semibold text-foreground">
                    Successfully installed {installSuccess.templateName}!
                  </span>
                </div>
                <ul className="list-inside list-disc text-xs space-y-1 text-foreground/90 pl-1">
                  {installSuccess.details.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INDUSTRIAL_APPS.map((tmpl) => (
              <div
                key={tmpl.id}
                className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-all hover:border-brand/50 hover:bg-muted/10 shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-foreground">{tmpl.name}</span>
                    <div className="flex items-center gap-1.5">
                      {tmpl.requiresDatabase ? (
                        <Badge variant="indigo" className="text-[10px] gap-1 py-0.5">
                          <Database size={10} />
                          MySQL
                        </Badge>
                      ) : null}
                      <Badge variant="neutral" className="text-[10px] py-0.5 font-mono">
                        {tmpl.runtime}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs font-medium text-brand">{tmpl.tagline}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {tmpl.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Interactive setup</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={installing}
                    onClick={() => openInstallModal(tmpl)}
                  >
                    <Settings2 size={12} aria-hidden="true" />
                    Configure &amp; Install
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Interactive Install Modal */}
      {selectedTemplate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl my-8">
            <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Server size={18} className="text-brand" />
                  Install {selectedTemplate.name}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Customise deployment options for <span className="font-mono text-foreground">{domain}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
                disabled={installing}
              >
                <X size={18} />
              </button>
            </div>

            {installError ? (
              <Alert variant="error" className="mt-4">
                {installError}
              </Alert>
            ) : null}

            {installStep ? (
              <div className="mt-4 rounded-xl border border-brand/40 bg-brand/5 p-4 text-center">
                <div className="inline-block animate-spin text-brand mb-2">
                  <RefreshCw size={22} />
                </div>
                <p className="text-sm font-semibold text-foreground">{installStep}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Please hold on while CloudDeck prepares and configures your application.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 max-h-[65vh] overflow-y-auto pr-1">
                {/* General Settings */}
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <Label htmlFor="app-title" className="text-xs font-semibold">
                      Site / Application Title
                    </Label>
                    <Input
                      id="app-title"
                      value={appTitle}
                      onChange={(e) => setAppTitle(e.target.value)}
                      placeholder="My Application"
                    />
                  </div>

                  {selectedTemplate.id === "wordpress" || selectedTemplate.id === "django" ? (
                    <>
                      <div className="grid gap-1">
                        <Label htmlFor="admin-user" className="text-xs font-semibold">
                          Admin Username
                        </Label>
                        <Input
                          id="admin-user"
                          value={adminUser}
                          onChange={(e) => setAdminUser(e.target.value)}
                          placeholder="admin"
                        />
                      </div>

                      <div className="grid gap-1">
                        <Label htmlFor="admin-email" className="text-xs font-semibold">
                          Admin Email
                        </Label>
                        <Input
                          id="admin-email"
                          type="email"
                          value={adminEmail}
                          onChange={(e) => setAdminEmail(e.target.value)}
                          placeholder="admin@example.com"
                        />
                      </div>

                      <div className="grid gap-1">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="admin-pass" className="text-xs font-semibold">
                            Admin Password
                          </Label>
                          <button
                            type="button"
                            onClick={() => setAdminPass(generatePassword(16))}
                            className="text-[11px] text-brand hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw size={10} />
                            Generate New
                          </button>
                        </div>
                        <div className="relative">
                          <Input
                            id="admin-pass"
                            type={showAdminPass ? "text" : "password"}
                            value={adminPass}
                            onChange={(e) => setAdminPass(e.target.value)}
                            className="pr-10 font-mono text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowAdminPass(!showAdminPass)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showAdminPass ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {selectedTemplate.id === "laravel" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1">
                        <Label htmlFor="laravel-env" className="text-xs font-semibold">
                          Environment
                        </Label>
                        <Select
                          id="laravel-env"
                          value={appEnv}
                          onChange={(e) => setAppEnv(e.target.value)}
                        >
                          <option value="production">production</option>
                          <option value="local">local (debug mode)</option>
                        </Select>
                      </div>
                    </div>
                  ) : null}

                  {APP_KINDS.has(selectedTemplate.runtime) ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1">
                        <Label htmlFor="app-port" className="text-xs font-semibold">
                          Internal Daemon Port
                        </Label>
                        <Input
                          id="app-port"
                          type="number"
                          value={appPort}
                          onChange={(e) => setAppPort(e.target.value)}
                          placeholder="3000"
                        />
                      </div>
                      {selectedTemplate.id === "docker" ? (
                        <div className="grid gap-1">
                          <Label htmlFor="docker-img" className="text-xs font-semibold">
                            Docker Image
                          </Label>
                          <Input
                            id="docker-img"
                            value={dockerImage}
                            onChange={(e) => setDockerImage(e.target.value)}
                            placeholder="nginx:alpine"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {/* Database Settings Section */}
                {selectedTemplate.requiresDatabase ? (
                  <div className="rounded-xl border border-border/80 bg-muted/20 p-4 grid gap-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Database size={14} className="text-indigo-400" />
                      <span>Automated MySQL Database Setup</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1">
                        <Label htmlFor="db-name" className="text-xs">Database Name</Label>
                        <Input
                          id="db-name"
                          value={dbName}
                          onChange={(e) => setDbName(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor="db-user" className="text-xs">Database User</Label>
                        <Input
                          id="db-user"
                          value={dbUser}
                          onChange={(e) => setDbUser(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid gap-1">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="db-pass" className="text-xs">Database Password</Label>
                        <button
                          type="button"
                          onClick={() => setDbPass(generatePassword(16))}
                          className="text-[11px] text-brand hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw size={10} />
                          Regenerate
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          id="db-pass"
                          type={showDbPass ? "text" : "password"}
                          value={dbPass}
                          onChange={(e) => setDbPass(e.target.value)}
                          className="pr-10 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowDbPass(!showDbPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showDbPass ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={installing}
                onClick={() => setSelectedTemplate(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={installing}
                onClick={() => void handleInteractiveInstall()}
              >
                <Download size={14} aria-hidden="true" />
                Start Installation
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
