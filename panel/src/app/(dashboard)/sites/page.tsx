"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Site, SiteListResponse } from "@/lib/types";
import { apiFetch, isAbortError, waitForTask } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { phpVersionLabel, shortDateTime, siteStatusVariant, titleCase } from "@/components/format";
import { Globe, Plus, Trash2 } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

export default function SitesPage() {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDomain, setConfirmDomain] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Record<string, { taskId: string }>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
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
      if (task.status === "failed") {
        setRowError((prev) => ({ ...prev, [domain]: task.error ?? "Delete failed" }));
      } else {
        await load();
      }
    } catch (error) {
      if (!isAbortError(error)) {
        setRowError((prev) => ({
          ...prev,
          [domain]: error instanceof Error ? error.message : "Delete failed",
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
        description="Sites hosted on this server."
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
                  return (
                    <tr
                      key={site.domain}
                      className="border-t border-border hover:bg-muted/40"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/sites/${encodeURIComponent(site.domain)}`}
                          className="font-mono text-sm text-foreground hover:text-brand"
                        >
                          {site.domain}
                        </Link>
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
                              <Link
                                href={`/sites/${encodeURIComponent(site.domain)}`}
                                className={buttonClass("secondary", "sm")}
                              >
                                Open
                              </Link>
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
                            className="mt-1 max-w-56 truncate text-right text-xs text-red-400"
                            title={deleteError}
                          >
                            {deleteError}
                          </p>
                        ) : null}
                      </td>
                    </tr>
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
