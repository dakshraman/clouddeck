"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  WordPressInstallRequest,
  WordPressLoginResponse,
  WordPressStageResponse,
  WordPressStatus,
  WordPressUpdateResponse,
} from "@/lib/types";
import { apiFetch, apiPost, HttpError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  ArrowUpCircle,
  Copy,
  ExternalLink,
  Flame,
  Globe,
  KeyRound,
  Layers,
  Lock,
  Package,
  Palette,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";

interface WordPressCardProps {
  domain: string;
}

export function WordPressCard({ domain }: WordPressCardProps) {
  const [data, setData] = useState<WordPressStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Install form state
  const [installTitle, setInstallTitle] = useState("My WordPress Site");
  const [installUser, setInstallUser] = useState("admin");
  const [installPassword, setInstallPassword] = useState("");
  const [installEmail, setInstallEmail] = useState(`admin@${domain}`);

  // Staging form state
  const [stagingSubdomain, setStagingSubdomain] = useState("staging");

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<WordPressStatus>(
        `/api/sites/${encodeURIComponent(domain)}/wordpress/status`,
      );
      setData(res);
    } catch (err) {
      // If error or 404, assume not installed yet
      setData({
        installed: false,
        plugins: [],
        themes: [],
        updatesAvailable: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleInstall(e: FormEvent) {
    e.preventDefault();
    setBusyAction("install");
    setError(null);
    setNotice(null);
    try {
      const req: WordPressInstallRequest = {
        title: installTitle.trim(),
        adminUser: installUser.trim(),
        adminPassword: installPassword.trim() || undefined,
        adminEmail: installEmail.trim(),
      };
      await apiPost(`/api/sites/${encodeURIComponent(domain)}/wordpress/install`, req);
      setNotice("WordPress installed successfully! Database and configuration provisioned.");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install WordPress.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleMagicLogin() {
    setBusyAction("login");
    setError(null);
    setNotice(null);
    try {
      const res = await apiPost<WordPressLoginResponse>(
        `/api/sites/${encodeURIComponent(domain)}/wordpress/login`,
        {},
      );
      if (res.loginUrl) {
        window.open(res.loginUrl, "_blank", "noopener,noreferrer");
        setNotice("Magic login URL generated and opened in new window.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate magic login link.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCloneStaging() {
    setBusyAction("stage");
    setError(null);
    setNotice(null);
    try {
      const res = await apiPost<WordPressStageResponse>(
        `/api/sites/${encodeURIComponent(domain)}/wordpress/stage`,
        { targetSubdomain: stagingSubdomain.trim() },
      );
      setNotice(
        res.message ||
          `Staging site cloned successfully to ${res.stagingDomain || `staging.${domain}`}!`,
      );
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create staging clone.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdate(type: "core" | "plugins" | "themes" | "all") {
    setBusyAction(`update-${type}`);
    setError(null);
    setNotice(null);
    try {
      const res = await apiPost<WordPressUpdateResponse>(
        `/api/sites/${encodeURIComponent(domain)}/wordpress/update`,
        { type },
      );
      setNotice(res.message || `WordPress ${type} updated successfully.`);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to update WordPress ${type}.`);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
            <Globe size={18} aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2">
              WordPress Toolkit
              {data?.installed ? (
                <Badge variant="green" className="text-xs">
                  {data.version ? `v${data.version}` : "Installed"}
                </Badge>
              ) : (
                <Badge variant="neutral" className="text-xs">
                  Not Installed
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              1-Click installations, automated staging cloner, magic admin login, and auto-updates.
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadStatus()}
            disabled={loading || busyAction !== null}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardBody className="grid gap-6">
        {notice && (
          <Alert variant="success">
            <div className="flex items-center justify-between w-full">
              <span>{notice}</span>
              <button
                type="button"
                className="text-xs font-semibold underline ml-2 cursor-pointer"
                onClick={() => setNotice(null)}
              >
                Dismiss
              </button>
            </div>
          </Alert>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div className="grid gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : !data?.installed ? (
          /* 1-Click Installer Form */
          <div className="rounded-lg border border-border/80 bg-muted/20 p-5 space-y-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Wand2 size={16} className="text-brand" /> 1-Click WordPress Provisioning
              </h4>
              <p className="text-xs text-muted-foreground">
                Automatically provisions a MariaDB/MySQL database, secure user, latest core files, and wp-config.php.
              </p>
            </div>

            <form onSubmit={handleInstall} className="grid gap-4 sm:grid-cols-2 pt-1">
              <div className="space-y-1">
                <Label htmlFor="wp-title" className="text-xs">
                  Site Title
                </Label>
                <Input
                  id="wp-title"
                  type="text"
                  value={installTitle}
                  onChange={(e) => setInstallTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="wp-admin-email" className="text-xs">
                  Admin Email
                </Label>
                <Input
                  id="wp-admin-email"
                  type="email"
                  value={installEmail}
                  onChange={(e) => setInstallEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="wp-admin-user" className="text-xs">
                  Admin Username
                </Label>
                <Input
                  id="wp-admin-user"
                  type="text"
                  value={installUser}
                  onChange={(e) => setInstallUser(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="wp-admin-pass" className="text-xs">
                  Admin Password (leave blank to auto-generate)
                </Label>
                <Input
                  id="wp-admin-pass"
                  type="password"
                  placeholder="Generate secure password"
                  value={installPassword}
                  onChange={(e) => setInstallPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className="sm:col-span-2 pt-2 flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  loading={busyAction === "install"}
                  className="gap-1.5"
                >
                  <Sparkles size={14} />
                  Install WordPress
                </Button>
              </div>
            </form>
          </div>
        ) : (
          /* Installed Site Dashboard */
          <>
            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-card p-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">
                  {data.siteTitle || domain}
                </h4>
                <p className="text-xs text-muted-foreground">
                  Admin email: <span className="text-foreground">{data.adminEmail || `admin@${domain}`}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleMagicLogin()}
                  disabled={busyAction !== null}
                  className="gap-1.5"
                >
                  {busyAction === "login" ? <Spinner className="h-3 w-3" /> : <KeyRound size={13} />}
                  <span>1-Click Magic Login</span>
                  <ExternalLink size={12} className="opacity-70" />
                </Button>
              </div>
            </div>

            {/* Staging Cloner */}
            <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers size={14} className="text-brand" /> 1-Click Staging Cloner
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Instantly clone your site files and database with automated WP search-replace for isolated testing.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                <div className="flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs w-full sm:w-auto flex-1 font-mono">
                  <input
                    type="text"
                    value={stagingSubdomain}
                    onChange={(e) => setStagingSubdomain(e.target.value)}
                    className="bg-transparent text-right outline-none w-20 text-foreground font-semibold"
                    placeholder="staging"
                  />
                  <span className="text-muted-foreground">.{domain}</span>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCloneStaging()}
                  disabled={busyAction !== null}
                  className="gap-1.5 shrink-0 w-full sm:w-auto"
                >
                  {busyAction === "stage" ? <Spinner className="h-3 w-3" /> : <Copy size={13} />}
                  <span>Create Staging Copy</span>
                </Button>
              </div>
            </div>

            {/* Updates Manager */}
            <div className="rounded-lg border border-border/80 bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ArrowUpCircle size={14} className="text-amber-500" /> Update Manager
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {data.updatesAvailable > 0
                      ? `${data.updatesAvailable} updates available for core, plugins, or themes.`
                      : "All WordPress components are up to date."}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleUpdate("all")}
                    disabled={busyAction !== null || data.updatesAvailable === 0}
                    className="gap-1.5 text-xs h-8"
                  >
                    {busyAction === "update-all" ? <Spinner className="h-3 w-3" /> : <RefreshCw size={12} />}
                    Update All
                  </Button>
                </div>
              </div>

              {/* Plugins List */}
              {data.plugins && data.plugins.length > 0 && (
                <div className="space-y-2 pt-1">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Package size={13} className="text-muted-foreground" /> Installed Plugins (
                    {data.plugins.length})
                  </span>
                  <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto">
                    {data.plugins.map((p) => (
                      <div
                        key={p.name}
                        className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 p-2 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-medium text-foreground truncate">{p.title || p.name}</p>
                          <p className="text-[11px] text-muted-foreground">v{p.version}</p>
                        </div>
                        <Badge
                          variant={p.status === "active" ? "green" : "neutral"}
                          className="text-[10px]"
                        >
                          {p.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
