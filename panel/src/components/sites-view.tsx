"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PhpVersionsResponse, Site, SiteListResponse } from "@/lib/types";
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
import { ExternalLink, Globe, Pencil, Plus, Trash2 } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

export function SitesView() {
  const [sites, setSites] = useState<Site[] | null>(null);
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
      const data = await apiFetch<SiteListResponse>("/api/sites");
      setSites(data.sites);
      setState("ready");
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
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 text-left font-medium">Domain</th>
                  <th className="px-5 py-3 text-left font-medium">PHP</th>
                  <th className="px-5 py-3 text-left font-medium">SSL</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Created</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => {
                  const isDeleting = Boolean(deleting[site.domain]);
                  const isConfirming = confirmDomain === site.domain;
                  const deleteError = rowError[site.domain];
                  const siteUrl = `${site.ssl.enabled ? "https" : "http"}://${site.domain}`;
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
                      <td className="px-5 py-3 text-muted-foreground">{phpVersionLabel(site.phpVersion)}</td>
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
