"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AppInfo, AppsResponse, PhpVersionsResponse, Site, SiteListResponse } from "@/lib/types";
import { apiFetch, isAbortError, waitForTask } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { phpVersionLabel, shortDateTime, siteStatusVariant, titleCase } from "@/components/format";
import { cn } from "@/components/ui/cn";
import { Cpu, ExternalLink, Eye, Globe, Pencil, Plus, Trash2 } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

export function SitesView() {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [filter, setFilter] = useState<"all" | "apps">("all");
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDomain, setConfirmDomain] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Record<string, { taskId: string }>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [editingDomain, setEditingDomain] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState("");
  const [phpVersions, setPhpVersions] = useState<string[] | null>(null);
  const [versionsError, setVersionsError] = useState("");
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [runtimeError, setRuntimeError] = useState("");
  const controllersRef = useRef<Set<AbortController>>(new Set());

  const load = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);
    try {
      const [sitesData, appsData] = await Promise.allSettled([
        apiFetch<SiteListResponse>("/api/sites"),
        apiFetch<AppsResponse>("/api/apps"),
      ]);
      if (sitesData.status === "fulfilled") {
        setSites(sitesData.value.sites);
        setState("ready");
      } else {
        throw sitesData.reason;
      }
      if (appsData.status === "fulfilled") {
        setApps(appsData.value.apps);
      } else {
        setApps([]);
      }
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to load sites");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((controller) => controller.abort());
    };
  }, []);

  const loadPhpVersions = useCallback(async () => {
    setVersionsError("");
    try {
      const data = await apiFetch<PhpVersionsResponse>("/api/php-versions");
      setPhpVersions(data.versions);
    } catch (error) {
      setVersionsError(error instanceof Error ? error.message : "Failed to load PHP versions");
    }
  }, []);

  function startEdit(site: Site) {
    setEditingDomain(site.domain);
    setEditVersion(site.phpVersion);
    setRuntimeError("");
    if (phpVersions === null && !versionsError) void loadPhpVersions();
  }

  async function saveRuntime(domain: string) {
    setSavingRuntime(true);
    setRuntimeError("");
    try {
      const updated = await apiFetch<Site>(`/api/sites/${encodeURIComponent(domain)}/php`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: editVersion }),
      });
      setSites((prev) =>
        prev ? prev.map((site) => (site.domain === domain ? updated : site)) : prev,
      );
      setEditingDomain(null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "Failed to switch the runtime");
    } finally {
      setSavingRuntime(false);
    }
  }

  async function confirmDelete(domain: string) {
    setConfirmDomain(null);
    setRowError((prev) => {
      const next = { ...prev };
      delete next[domain];
      return next;
    });
    setDeleting((prev) => ({ ...prev, [domain]: { taskId: "" } }));

    const controller = new AbortController();
    controllersRef.current.add(controller);

    try {
      const { taskId } = await apiFetch<{ taskId: string }>(
        `/api/sites/${encodeURIComponent(domain)}`,
        { method: "DELETE", signal: controller.signal },
      );
      setDeleting((prev) => ({ ...prev, [domain]: { taskId } }));
      const task = await waitForTask(taskId, controller.signal);
      if (task.status === "succeeded") {
        setSites((prev) => (prev ? prev.filter((site) => site.domain !== domain) : prev));
      } else {
        setRowError((prev) => ({
          ...prev,
          [domain]: task.error ?? "Deletion task failed",
        }));
      }
    } catch (error) {
      if (!isAbortError(error)) {
        setRowError((prev) => ({
          ...prev,
          [domain]: error instanceof Error ? error.message : "Lost connection while deleting",
        }));
      }
    } finally {
      controllersRef.current.delete(controller);
      setDeleting((prev) => {
        const next = { ...prev };
        delete next[domain];
        return next;
      });
    }
  }

  const appsBySite = useMemo(() => {
    return (apps ?? []).reduce<Record<string, AppInfo[]>>((acc, app) => {
      if (!acc[app.site]) acc[app.site] = [];
      acc[app.site].push(app);
      return acc;
    }, {});
  }, [apps]);

  const appSitesCount = useMemo(() => {
    return (sites ?? []).filter(
      (s) => (appsBySite[s.domain]?.length ?? 0) > 0 || s.phpVersion !== "none",
    ).length;
  }, [sites, appsBySite]);

  const displayedSites = useMemo(() => {
    return (sites ?? []).filter((site) => {
      if (filter === "apps") {
        return (appsBySite[site.domain]?.length ?? 0) > 0 || site.phpVersion !== "none";
      }
      return true;
    });
  }, [sites, filter, appsBySite]);

  return (
    <>
      <PageHeader
        title="Sites"
        description="Every site is backed by an nginx server block and an isolated web root."
        actions={
          <Link href="/sites/new" className={buttonClass("primary", "md")}>
            <Plus size={16} aria-hidden="true" />
            New site
          </Link>
        }
      />

      {state === "error" ? (
        <Alert variant="error" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage ?? "Failed to load sites"}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {state === "loading" ? (
        <Card className="p-5">
          <div className="grid gap-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </Card>
      ) : null}

      {state === "ready" && sites && sites.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No sites yet"
          description="Create your first site to add an nginx configuration and webroot."
          action={
            <Link href="/sites/new" className={buttonClass("primary", "md")}>
              <Plus size={16} aria-hidden="true" />
              New site
            </Link>
          }
        />
      ) : null}

      {state === "ready" && sites && sites.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                filter === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Globe size={13} aria-hidden="true" />
              All Sites
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {sites.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilter("apps")}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                filter === "apps"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Cpu size={13} aria-hidden="true" />
              Applications
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {appSitesCount}
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {state === "ready" && sites && sites.length > 0 && displayedSites.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            <Cpu size={20} />
          </div>
          <h3 className="mt-3 text-sm font-medium text-foreground">No applications match filter</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            No sites currently host supervised applications or dynamic runtimes.
          </p>
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={() => setFilter("all")}>
              Show all sites
            </Button>
          </div>
        </Card>
      ) : null}

      {state === "ready" && displayedSites.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 text-left font-medium">Domain</th>
                  <th className="px-5 py-3 text-left font-medium">Application / Runtime</th>
                  <th className="px-5 py-3 text-left font-medium">SSL</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Created</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedSites.map((site) => {
                  const isDeleting = Boolean(deleting[site.domain]);
                  const isConfirming = confirmDomain === site.domain;
                  const deleteError = rowError[site.domain];
                  const siteUrl = `${site.ssl.enabled ? "https" : "http"}://${site.domain}`;
                  const siteApps = appsBySite[site.domain] ?? [];
                  return (
                    <Fragment key={site.domain}>
                      <tr className="border-t border-border hover:bg-muted/40">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/sites/${encodeURIComponent(site.domain)}`}
                            className="font-mono text-sm font-medium text-foreground hover:text-brand"
                          >
                            {site.domain}
                          </Link>
                          <a
                            href={siteUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-muted-foreground transition-colors hover:text-foreground"
                            title={`Open ${site.domain} in browser`}
                            aria-label={`Open ${site.domain} in browser`}
                          >
                            <ExternalLink size={13} aria-hidden="true" />
                          </a>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {siteApps.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {siteApps.map((app) => (
                              <Link
                                key={app.name}
                                href={`/sites/${encodeURIComponent(site.domain)}?tab=apps`}
                                className="inline-flex items-center gap-1.5 group"
                                title={`Application: ${app.name} (${app.kind}) - Click to manage`}
                              >
                                <Badge variant="indigo" className="group-hover:border-indigo-400">
                                  {app.name || app.kind}
                                </Badge>
                                {app.status.state === "running" ? (
                                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" title="Running" />
                                ) : app.status.state === "error" ? (
                                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" title="Error" />
                                ) : (
                                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" title="Stopped" />
                                )}
                              </Link>
                            ))}
                          </div>
                        ) : site.phpVersion !== "none" ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="indigo">PHP {site.phpVersion}</Badge>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Static</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {site.ssl.enabled ? (
                          <Badge variant="green">SSL</Badge>
                        ) : (
                          <Badge variant="neutral">None</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={siteStatusVariant(site.status)}>
                          {titleCase(site.status)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{shortDateTime(site.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {isDeleting ? (
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Spinner size={14} className="text-muted-foreground" />
                              deleting…
                            </span>
                          ) : isConfirming ? (
                            <>
                              <span className="text-xs text-muted-foreground">Delete?</span>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => void confirmDelete(site.domain)}
                              >
                                Confirm
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDomain(null)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <a
                                href={`/api/preview/${encodeURIComponent(site.domain)}`}
                                target="_blank"
                                rel="noreferrer noopener"
                                className={buttonClass("secondary", "sm")}
                                title={`Preview ${site.domain} in-panel`}
                              >
                                <Eye size={14} aria-hidden="true" />
                                Preview
                              </a>
                              <a
                                href={siteUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className={buttonClass("secondary", "sm")}
                                title={`Open ${site.domain} in browser`}
                              >
                                <ExternalLink size={14} aria-hidden="true" />
                                Open site
                              </a>
                              <Link
                                href={`/sites/${encodeURIComponent(site.domain)}?tab=apps`}
                                className={buttonClass("secondary", "sm")}
                                title={`Manage applications for ${site.domain}`}
                              >
                                <Cpu size={14} aria-hidden="true" />
                                Apps
                              </Link>
                              <Link
                                href={`/sites/${encodeURIComponent(site.domain)}`}
                                className={buttonClass("ghost", "sm")}
                              >
                                Manage
                              </Link>
                              <Button variant="ghost" size="sm" onClick={() => startEdit(site)}>
                                <Pencil size={14} aria-hidden="true" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-red-400"
                                onClick={() => setConfirmDomain(site.domain)}
                                aria-label={`Delete ${site.domain}`}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                        {deleteError ? (
                          <p
                            className="mt-1 max-w-56 truncate text-right text-xs text-red-600 dark:text-red-400"
                            title={deleteError}
                          >
                            {deleteError}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                    {editingDomain === site.domain ? (
                      <tr className="border-t border-border bg-muted/20">
                        <td colSpan={6} className="px-5 py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="grid gap-1.5">
                              <Label htmlFor={`php-version-${site.domain}`}>PHP runtime</Label>
                              {versionsError ? (
                                <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                                  {versionsError}
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => void loadPhpVersions()}
                                  >
                                    Retry
                                  </Button>
                                </div>
                              ) : phpVersions === null ? (
                                <Skeleton className="h-9 w-48" />
                              ) : (
                                <Select
                                  id={`php-version-${site.domain}`}
                                  className="w-48"
                                  value={editVersion}
                                  disabled={savingRuntime}
                                  onChange={(event) => {
                                    setEditVersion(event.target.value);
                                    setRuntimeError("");
                                  }}
                                >
                                  {phpVersions.map((version) => (
                                    <option key={version} value={version}>
                                      {phpVersionLabel(version)}
                                    </option>
                                  ))}
                                </Select>
                              )}
                            </div>
                            <Button
                              size="sm"
                              loading={savingRuntime}
                              disabled={phpVersions === null || editVersion === site.phpVersion}
                              onClick={() => void saveRuntime(site.domain)}
                            >
                              Save
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingDomain(null)}>
                              Cancel
                            </Button>
                            {runtimeError ? (
                              <span className="text-xs text-red-600 dark:text-red-400">{runtimeError}</span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Switching re-renders the nginx vhost and reloads the web server; a failed
                            reload reverts.
                          </p>
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  );
}

export default SitesView;
