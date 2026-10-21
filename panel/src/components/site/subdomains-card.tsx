"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SiteSubdomain, SiteSubdomainsResponse } from "@/lib/types";
import { apiFetch, isAbortError, waitForTask } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { shortDateTime } from "@/components/format";
import { Network, Trash2 } from "lucide-react";

// Mirrors the agent's subdomain rule (docs/api.md section 1.7); "www" is reserved.
const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

const JSON_HEADERS = { "Content-Type": "application/json" };

export function SubdomainsCard({ domain }: { domain: string }) {
  const base = `/api/sites/${encodeURIComponent(domain)}/subdomains`;

  const [subdomains, setSubdomains] = useState<SiteSubdomain[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const controllersRef = useRef<Set<AbortController>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<SiteSubdomainsResponse>(base);
      setSubdomains(data.subdomains);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load subdomains");
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((controller) => controller.abort());
    };
  }, []);

  const busy = creating || pendingDelete !== null;

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = name.trim().toLowerCase();
    if (candidate === "www") {
      setFormError('"www" is reserved for the main site.');
      return;
    }
    if (!SUBDOMAIN_REGEX.test(candidate)) {
      setFormError('Use lowercase letters, digits and hyphens (for example "blog" or "shop-1").');
      return;
    }

    setCreating(true);
    setFormError(null);
    const controller = new AbortController();
    controllersRef.current.add(controller);
    try {
      const { taskId } = await apiFetch<{ taskId: string }>(base, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: candidate }),
        signal: controller.signal,
      });
      const task = await waitForTask(taskId, controller.signal);
      if (task.status === "failed") {
        setFormError(task.error ?? `Creating ${candidate}.${domain} failed.`);
        return;
      }
      setName("");
      await load();
    } catch (error) {
      if (!isAbortError(error)) {
        setFormError(error instanceof Error ? error.message : "Failed to create the subdomain");
      }
    } finally {
      controllersRef.current.delete(controller);
      setCreating(false);
    }
  }

  async function onDelete(target: string) {
    setConfirmName(null);
    setPendingDelete(target);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[target];
      return next;
    });

    const controller = new AbortController();
    controllersRef.current.add(controller);
    try {
      const { taskId } = await apiFetch<{ taskId: string }>(
        `${base}/${encodeURIComponent(target)}`,
        { method: "DELETE", signal: controller.signal },
      );
      const task = await waitForTask(taskId, controller.signal);
      if (task.status === "failed") {
        setRowErrors((prev) => ({
          ...prev,
          [target]: task.error ?? `Deleting ${target}.${domain} failed.`,
        }));
        return;
      }
      await load();
    } catch (error) {
      if (!isAbortError(error)) {
        setRowErrors((prev) => ({
          ...prev,
          [target]: error instanceof Error ? error.message : "Failed to delete the subdomain",
        }));
      }
    } finally {
      controllersRef.current.delete(controller);
      setPendingDelete(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Subdomains</CardTitle>
          <CardDescription>
            Additional hostnames served from this site&apos;s webroot, each with its own nginx
            server block and log files.
          </CardDescription>
        </div>
        <Network size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardBody className="grid gap-5">
        <form onSubmit={onCreate} className="grid gap-4">
          <div className="grid gap-1.5 sm:max-w-md">
            <Label htmlFor="subdomain-name">Subdomain</Label>
            <div className="flex">
              <Input
                id="subdomain-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="blog"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                className="min-w-0 flex-1 rounded-r-none font-mono"
              />
              <span className="flex h-9 shrink-0 items-center rounded-r-lg border border-l-0 border-input bg-muted px-3 font-mono text-sm text-muted-foreground">
                .{domain}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Served from{" "}
              <span className="font-mono">{name.trim() === "" ? "name" : name.trim()}.{domain}</span>{" "}
              with a placeholder index page.
            </p>
          </div>

          {formError ? <Alert variant="error">{formError}</Alert> : null}

          <div>
            <Button type="submit" loading={creating} disabled={busy}>
              Add subdomain
            </Button>
          </div>
        </form>

        {loadError ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : subdomains === null ? (
          <div className="grid gap-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : subdomains.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No subdomains yet. Add one to serve an extra hostname from this site.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 pr-5 text-left font-medium">Name</th>
                  <th className="py-3 pr-5 text-left font-medium">Hostname</th>
                  <th className="py-3 pr-5 text-left font-medium">Created</th>
                  <th className="py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subdomains.map((subdomain) => {
                  const deleting = pendingDelete === subdomain.name;
                  const confirming = confirmName === subdomain.name;
                  const rowError = rowErrors[subdomain.name];
                  return (
                    <tr key={subdomain.name} className="border-t border-border">
                      <td className="py-3 pr-5 font-mono text-foreground">{subdomain.name}</td>
                      <td className="py-3 pr-5 font-mono text-muted-foreground">
                        <span className="break-all">{subdomain.name}.{domain}</span>
                      </td>
                      <td className="py-3 pr-5 text-muted-foreground">
                        {shortDateTime(subdomain.createdAt)}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-2">
                          {deleting ? (
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Spinner size={14} className="text-muted-foreground" />
                              deleting…
                            </span>
                          ) : confirming ? (
                            <>
                              <span className="text-xs text-muted-foreground">Delete?</span>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => void onDelete(subdomain.name)}
                              >
                                Confirm
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setConfirmName(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-red-400"
                              disabled={busy}
                              onClick={() => setConfirmName(subdomain.name)}
                              aria-label={`Delete ${subdomain.name}.${domain}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              Delete
                            </Button>
                          )}
                        </div>
                        {rowError ? (
                          <p className="mt-1 max-w-64 text-right text-xs text-red-400" title={rowError}>
                            {rowError}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
