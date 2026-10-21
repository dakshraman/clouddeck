"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SiteRedirect, SiteRedirectsResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { CornerUpRight, Trash2 } from "lucide-react";

export function RedirectsCard({ domain }: { domain: string }) {
  const base = `/api/sites/${encodeURIComponent(domain)}/redirects`;

  const [redirects, setRedirects] = useState<SiteRedirect[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [permanent, setPermanent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<SiteRedirectsResponse>(base);
      setRedirects(data.redirects);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load redirects");
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = submitting || pendingDelete !== null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const source = from.trim();
    if (!source.startsWith("/")) {
      setFormError('The "from" path must start with "/" (for example "/old-page").');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const data = await apiPost<SiteRedirectsResponse>(base, {
        from: source,
        to: to.trim(),
        permanent,
      });
      setRedirects(data.redirects);
      setFrom("");
      setTo("");
      setPermanent(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to add the redirect");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    setPendingDelete(id);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const data = await apiFetch<SiteRedirectsResponse>(`${base}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setRedirects(data.redirects);
    } catch (error) {
      setRowErrors((prev) => ({
        ...prev,
        [id]: error instanceof Error ? error.message : "Failed to delete the redirect",
      }));
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Redirects</CardTitle>
          <CardDescription>
            Redirect rules rendered into every nginx server block of this site, including its
            subdomains.
          </CardDescription>
        </div>
        <CornerUpRight size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardBody className="grid gap-5">
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="redirect-from">From path</Label>
              <Input
                id="redirect-from"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                placeholder="/old-page"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="redirect-to">To URL</Label>
              <Input
                id="redirect-to"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="https://example.com/new-page"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                className="font-mono"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground/80">
            <input
              type="checkbox"
              checked={permanent}
              onChange={(event) => setPermanent(event.target.checked)}
              disabled={busy}
              className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
            />
            Permanent redirect (301)
          </label>
          <p className="-mt-2 text-xs text-muted-foreground">
            Unchecked sends a 302 temporary redirect.
          </p>

          {formError ? <Alert variant="error">{formError}</Alert> : null}

          <div>
            <Button type="submit" loading={submitting} disabled={busy}>
              Add redirect
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
        ) : redirects === null ? (
          <div className="grid gap-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : redirects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No redirects yet.</p>
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 pr-5 text-left font-medium">From</th>
                  <th className="py-3 pr-5 text-left font-medium">To</th>
                  <th className="py-3 pr-5 text-left font-medium">Type</th>
                  <th className="py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {redirects.map((redirect) => {
                  const deleting = pendingDelete === redirect.id;
                  const rowError = rowErrors[redirect.id];
                  return (
                    <tr key={redirect.id} className="border-t border-border">
                      <td className="py-3 pr-5 font-mono text-foreground">
                        <span className="break-all">{redirect.from}</span>
                      </td>
                      <td className="py-3 pr-5">
                        <span className="mr-2 text-muted-foreground/60" aria-hidden="true">
                          →
                        </span>
                        <span className="break-all font-mono text-muted-foreground">{redirect.to}</span>
                      </td>
                      <td className="py-3 pr-5">
                        {redirect.permanent ? (
                          <Badge variant="green" title="Permanent (301)">
                            301
                          </Badge>
                        ) : (
                          <Badge variant="amber" title="Temporary (302)">
                            302
                          </Badge>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-end">
                          {deleting ? (
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Spinner size={14} className="text-muted-foreground" />
                              deleting…
                            </span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-red-400"
                              disabled={busy}
                              onClick={() => void onDelete(redirect.id)}
                              aria-label={`Delete redirect from ${redirect.from}`}
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
