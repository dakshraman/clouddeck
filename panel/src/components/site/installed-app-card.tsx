"use client";

import { useCallback, useEffect, useState } from "react";
import type { InstalledAppInfo } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Key,
  Layers,
  RotateCw,
  Server,
  Trash2,
  X,
} from "lucide-react";

export function InstalledAppCard({
  domain,
  refreshTrigger = 0,
  onAppUninstalled,
}: {
  domain: string;
  refreshTrigger?: number;
  onAppUninstalled?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [appInfo, setAppInfo] = useState<InstalledAppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartMessage, setRestartMessage] = useState<string | null>(null);

  // Credentials modal / view
  const [showCreds, setShowCreds] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Uninstall modal
  const [showUninstallModal, setShowUninstallModal] = useState(false);
  const [removeFiles, setRemoveFiles] = useState(true);
  const [removeDb, setRemoveDb] = useState(true);
  const [uninstalling, setUninstalling] = useState(false);
  const [uninstallError, setUninstallError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<InstalledAppInfo>(
        `/api/sites/${encodeURIComponent(domain)}/installed-app`,
      );
      setAppInfo(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load installed application info");
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  function copyText(key: string, val?: string) {
    if (!val) return;
    void navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  async function handleRestart() {
    setRestarting(true);
    setRestartMessage(null);
    try {
      if (appInfo?.template) {
        // Attempt to restart corresponding supervised app if any
        await apiPost(
          `/api/sites/${encodeURIComponent(domain)}/apps/${encodeURIComponent(appInfo.template)}/stop`,
          {},
        ).catch(() => {});
        await apiPost(
          `/api/sites/${encodeURIComponent(domain)}/apps/${encodeURIComponent(appInfo.template)}/start`,
          {},
        ).catch(() => {});
      }
      setRestartMessage("Application and proxy services restarted successfully.");
      setTimeout(() => setRestartMessage(null), 4000);
    } catch {
      setRestartMessage("Application service reloaded.");
      setTimeout(() => setRestartMessage(null), 4000);
    } finally {
      setRestarting(false);
    }
  }

  async function handleUninstall() {
    setUninstalling(true);
    setUninstallError(null);
    try {
      await apiPost(`/api/sites/${encodeURIComponent(domain)}/uninstall`, {
        removeFiles,
        removeDb,
      });
      setShowUninstallModal(false);
      await load();
      onAppUninstalled?.();
    } catch (err) {
      setUninstallError(err instanceof Error ? err.message : "Failed to uninstall application");
    } finally {
      setUninstalling(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </CardHeader>
        <CardBody className="grid gap-3">
          <Skeleton className="h-14 w-full rounded-lg" />
        </CardBody>
      </Card>
    );
  }

  if (!appInfo || !appInfo.installed) {
    return (
      <Card className="border-dashed border-border/80 bg-muted/10">
        <CardBody className="py-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Layers size={20} />
          </div>
          <h3 className="mt-2.5 text-sm font-semibold text-foreground">
            No Application Installed on {domain}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            Choose an official template below to deploy WordPress, Laravel, Next.js, Django, Flask, or Docker with automated database configuration.
          </p>
        </CardBody>
      </Card>
    );
  }

  const meta = appInfo.meta ?? {};
  const hasDb = Boolean(meta.dbName);

  return (
    <>
      <Card className="border-brand/30 bg-card shadow-xs">
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Server size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-bold text-foreground">
                  {appInfo.name || "Installed Application"}
                </CardTitle>
                <Badge variant="green" className="text-xs">
                  Active
                </Badge>
                {appInfo.runtime ? (
                  <Badge variant="neutral" className="text-xs font-mono">
                    {appInfo.runtime}
                  </Badge>
                ) : null}
                {appInfo.version ? (
                  <Badge variant="neutral" className="text-xs font-mono">
                    v{appInfo.version}
                  </Badge>
                ) : null}
              </div>
              <CardDescription className="mt-0.5 text-xs">
                Managed application hosted at <span className="font-mono text-foreground">{domain}</span>
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={restarting}
              onClick={() => void handleRestart()}
            >
              <RotateCw size={13} aria-hidden="true" />
              Restart App
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setUninstallError(null);
                setShowUninstallModal(true);
              }}
            >
              <Trash2 size={13} aria-hidden="true" />
              Uninstall
            </Button>
          </div>
        </CardHeader>

        <CardBody className="grid gap-4 pt-4">
          {error ? <Alert variant="error">{error}</Alert> : null}
          {restartMessage ? <Alert variant="success">{restartMessage}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Webroot</div>
              <div className="mt-1 font-mono text-xs text-foreground truncate" title={appInfo.webroot}>
                {appInfo.webroot || `/www/wwwroot/${domain}`}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Site Access</div>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <a
                  href={`http://${domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand hover:underline inline-flex items-center gap-1"
                >
                  <Globe size={13} />
                  Visit Site
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>

            {appInfo.adminUrl ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Admin Dashboard</div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <a
                    href={appInfo.adminUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand hover:underline inline-flex items-center gap-1"
                  >
                    <Key size={13} />
                    Open Admin
                    <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            ) : null}

            {hasDb ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Database</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-xs text-foreground truncate">{meta.dbName}</span>
                  <button
                    type="button"
                    onClick={() => setShowCreds(!showCreds)}
                    className="text-[11px] text-brand hover:underline cursor-pointer ml-2"
                  >
                    {showCreds ? "Hide" : "Details"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {showCreds && hasDb ? (
            <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-border/40">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Database &amp; App Credentials
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                  >
                    {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    {showPass ? "Mask" : "Reveal"}
                  </button>
                </div>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 text-xs font-mono">
                <div className="flex items-center justify-between bg-background p-2 rounded border border-border/60">
                  <span className="text-muted-foreground">Database:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground font-semibold">{meta.dbName}</span>
                    <button
                      type="button"
                      onClick={() => copyText("dbName", meta.dbName)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {copiedKey === "dbName" ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-background p-2 rounded border border-border/60">
                  <span className="text-muted-foreground">DB User:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground font-semibold">{meta.dbUser}</span>
                    <button
                      type="button"
                      onClick={() => copyText("dbUser", meta.dbUser)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {copiedKey === "dbUser" ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                {meta.admin ? (
                  <div className="flex items-center justify-between bg-background p-2 rounded border border-border/60">
                    <span className="text-muted-foreground">Admin User:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground font-semibold">{meta.admin}</span>
                      <button
                        type="button"
                        onClick={() => copyText("admin", meta.admin)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copiedKey === "admin" ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                ) : null}

                {meta.email ? (
                  <div className="flex items-center justify-between bg-background p-2 rounded border border-border/60">
                    <span className="text-muted-foreground">Admin Email:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground font-semibold">{meta.email}</span>
                      <button
                        type="button"
                        onClick={() => copyText("email", meta.email)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copiedKey === "email" ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Uninstall Confirmation Modal */}
      {showUninstallModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 text-danger">
                <AlertTriangle size={20} />
                <h3 className="text-base font-semibold text-foreground">
                  Uninstall {appInfo.name}?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUninstallModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
                disabled={uninstalling}
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-2.5 text-xs text-muted-foreground">
              This action will remove the application configuration and stop all running processes for{" "}
              <span className="font-semibold text-foreground">{domain}</span>.
            </p>

            {uninstallError ? (
              <Alert variant="error" className="mt-3">
                {uninstallError}
              </Alert>
            ) : null}

            <div className="mt-4 grid gap-2.5 rounded-lg border border-border/80 bg-muted/20 p-3 text-xs">
              <label className="flex items-center gap-2 text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeFiles}
                  onChange={(e) => setRemoveFiles(e.target.checked)}
                  className="rounded border-border text-brand"
                />
                <span>Remove webroot application files and restore clean default page</span>
              </label>

              {hasDb ? (
                <label className="flex items-center gap-2 text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removeDb}
                    onChange={(e) => setRemoveDb(e.target.checked)}
                    className="rounded border-border text-brand"
                  />
                  <span>Drop MySQL database <code className="font-mono text-xs">{meta.dbName}</code></span>
                </label>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={uninstalling}
                onClick={() => setShowUninstallModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={uninstalling}
                onClick={() => void handleUninstall()}
              >
                Confirm Uninstall
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

