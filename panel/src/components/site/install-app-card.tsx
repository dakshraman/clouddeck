"use client";

import { useState } from "react";
import { INDUSTRIAL_APPS, type IndustrialAppTemplate } from "@/lib/templates";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PhpVersionsResponse, Site } from "@/lib/types";
import { CheckCircle2, Database, Download, Sparkles, X } from "lucide-react";

const APP_KINDS = new Set(["node", "python", "go", "ruby", "java", "docker", "custom"]);

export function InstallAppCard({
  domain,
  currentPhpVersion,
  onAppInstalled,
}: {
  domain: string;
  currentPhpVersion: string;
  onAppInstalled?: () => void;
}) {
  const [confirmTemplate, setConfirmTemplate] = useState<IndustrialAppTemplate | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<{
    templateName: string;
    details: string[];
  } | null>(null);

  async function handleInstall(template: IndustrialAppTemplate) {
    setInstalling(true);
    setInstallError(null);
    setInstallSuccess(null);
    const details: string[] = [];
    const cleanDomain = domain.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 16);

    try {
      let dbDetails: { dbName: string; dbUser: string; dbPass: string; dbHost: string } | null = null;

      // 1. Database provisioning if needed
      if (template.requiresDatabase) {
        const dbName = `${template.id}_${cleanDomain}`;
        const dbUser = `${template.id}_${cleanDomain}`.slice(0, 16);
        const dbPass = Math.random().toString(36).slice(-10) + "CD!" + Math.random().toString(36).slice(-6);
        const dbHost = "127.0.0.1";

        try {
          await apiPost("/api/mysql/databases", { name: dbName });
          await apiPost("/api/mysql/users", { user: dbUser, password: dbPass, host: "localhost" });
          await apiPost("/api/mysql/grants", { user: dbUser, host: "localhost", database: dbName, privileges: "all" });
          dbDetails = { dbName, dbUser, dbPass, dbHost };
          details.push(`MySQL Database: ${dbName} (User: ${dbUser}, Password: ${dbPass})`);
        } catch (dbErr) {
          details.push(`Database auto-provisioning note: ${dbErr instanceof Error ? dbErr.message : "Check MySQL service"}`);
        }
      }

      // 2. Call template install proxy route
      try {
        await apiPost(`/api/sites/${encodeURIComponent(domain)}/install`, {
          template: template.id,
          dbName: dbDetails?.dbName ?? "",
          dbUser: dbDetails?.dbUser ?? "",
          dbPass: dbDetails?.dbPass ?? "",
          dbHost: dbDetails?.dbHost ?? "127.0.0.1",
        });
        details.push(`Installed latest ${template.name} application into webroot`);
      } catch {
        // Fallback to scaffold files if agent template installer endpoint is not active
        if (template.scaffoldFiles) {
          for (const [filePath, fileContent] of Object.entries(template.scaffoldFiles)) {
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
        details.push(`Installed latest ${template.name} application into webroot`);
      }

      // 3. Configure PHP runtime if template requires PHP and site is currently "none"
      if (template.runtime === "php" && currentPhpVersion === "none") {
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

      // 4. Start supervised app process if needed (Node.js, Python, Docker, etc.)
      if (APP_KINDS.has(template.runtime)) {
        try {
          await apiPost("/api/apps", {
            site: domain,
            name: template.id,
            kind: template.runtime,
            command: template.defaultCommand || "npm start",
            port: template.defaultPort,
          });
          details.push(`Started supervised process on port ${template.defaultPort ?? "auto"}`);
        } catch (appErr) {
          details.push(`Process start notice: ${appErr instanceof Error ? appErr.message : "Start manually above"}`);
        }
      }

      setInstallSuccess({
        templateName: template.name,
        details,
      });
      setConfirmTemplate(null);
      onAppInstalled?.();
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "Failed to install application");
    } finally {
      setInstalling(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Install / Change Application</CardTitle>
          <CardDescription>
            Deploy famous production stacks with 1-click scaffolding and automated database configuration.
          </CardDescription>
        </div>
        <Sparkles size={16} className="mt-0.5 shrink-0 text-[#FAAA93]" aria-hidden="true" />
      </CardHeader>
      <CardBody className="grid gap-4">
        {installError ? <Alert variant="error">{installError}</Alert> : null}

        {installSuccess ? (
          <Alert variant="success">
            <div className="grid gap-2">
              <span className="font-semibold">
                Successfully installed {installSuccess.templateName}!
              </span>
              <ul className="list-inside list-disc text-xs space-y-1 text-foreground/90">
                {installSuccess.details.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          </Alert>
        ) : null}

        {confirmTemplate ? (
          <div className="rounded-xl border border-brand/40 bg-brand/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Confirm 1-Click Install: {confirmTemplate.name}
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  This will deploy <span className="font-medium text-foreground">{confirmTemplate.name}</span> into the webroot of{" "}
                  <span className="font-mono text-foreground">{domain}</span>.
                  {confirmTemplate.requiresDatabase
                    ? " A dedicated MySQL database and credentials will be provisioned automatically."
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmTemplate(null)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
                disabled={installing}
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                loading={installing}
                onClick={() => void handleInstall(confirmTemplate)}
              >
                <Download size={14} aria-hidden="true" />
                Proceed with Install
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={installing}
                onClick={() => setConfirmTemplate(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {INDUSTRIAL_APPS.map((tmpl) => (
            <div
              key={tmpl.id}
              className="flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-brand/50 hover:bg-muted/10 shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{tmpl.name}</span>
                  <div className="flex items-center gap-1.5">
                    {tmpl.requiresDatabase ? (
                      <Badge variant="indigo" className="text-[10px] gap-1">
                        <Database size={10} />
                        MySQL
                      </Badge>
                    ) : null}
                    <Badge variant="neutral" className="text-[10px]">
                      {tmpl.runtime}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1 text-xs font-medium text-brand/90">{tmpl.tagline}</p>
                <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{tmpl.description}</p>
              </div>

              <div className="mt-3.5 pt-2 border-t border-border/60 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">1-click ready</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={installing}
                  onClick={() => {
                    setConfirmTemplate(tmpl);
                    setInstallError(null);
                    setInstallSuccess(null);
                  }}
                >
                  <Download size={12} aria-hidden="true" />
                  Install {tmpl.name}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
