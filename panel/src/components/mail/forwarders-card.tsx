"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { MailForwarder, MailForwardersResponse } from "@/lib/types";
import { apiFetch, apiPost, isAbortError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { shortDateTime } from "@/components/format";
import { LOCAL_PART_PATTERN, buildEmail, isValidEmail } from "@/components/mail/mail-utils";
import { ArrowRight, Forward, Plus, Trash2 } from "lucide-react";

interface ForwardersCardProps {
  domains: string[] | null;
  onRefresh: () => void;
}

export function ForwardersCard({ domains, onRefresh }: ForwardersCardProps) {
  const [domain, setDomain] = useState("");
  const [forwarders, setForwarders] = useState<MailForwarder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [localPart, setLocalPart] = useState("");
  const [createDomain, setCreateDomain] = useState("");
  const [target, setTarget] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [confirmSource, setConfirmSource] = useState<string | null>(null);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  // Keep the selected domain valid when the domain list changes.
  useEffect(() => {
    if (domains && domains.length > 0 && !domains.includes(domain)) {
      setDomain(domains[0]);
    }
  }, [domains, domain]);

  useEffect(() => {
    if (!domain) {
      setForwarders(null);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    apiFetch<MailForwardersResponse>(
      `/api/mail/forwarders?domain=${encodeURIComponent(domain)}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!active) return;
        setForwarders(data.forwarders);
        setLoading(false);
      })
      .catch((err) => {
        if (!active || isAbortError(err)) return;
        setError(err instanceof Error ? err.message : "Failed to load forwarders");
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [domain, reloadKey]);

  function openCreate() {
    setCreateOpen(true);
    setCreateError(null);
    setCreateDomain(domain || (domains && domains.length > 0 ? domains[0] : ""));
    setNotice(null);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateError(null);
    setLocalPart("");
    setTarget("");
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidateLocal = localPart.trim().toLowerCase();
    if (!LOCAL_PART_PATTERN.test(candidateLocal)) {
      setCreateError(
        "Enter a source local part like sales (lowercase letters, numbers, dots, underscores and hyphens).",
      );
      return;
    }
    if (!createDomain) {
      setCreateError("Select the domain the source address belongs to.");
      return;
    }
    const candidateTargets = target
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");
    if (candidateTargets.length === 0) {
      setCreateError("Enter at least one destination address.");
      return;
    }
    if (!candidateTargets.every((part) => isValidEmail(part))) {
      setCreateError(
        "Every destination must be a full address like you@example.com (comma-separate several).",
      );
      return;
    }

    const source = buildEmail(candidateLocal, createDomain);
    setCreating(true);
    setCreateError(null);
    try {
      const created = await apiPost<MailForwarder>("/api/mail/forwarders", {
        source,
        target: candidateTargets.join(", "),
      });
      setNotice(`Forwarder ${created.source} → ${created.target} added.`);
      setCreateOpen(false);
      setLocalPart("");
      setTarget("");
      onRefresh();
      if (created.source.endsWith(`@${domain}`)) refresh();
      else setDomain(createDomain);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to add forwarder");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(source: string) {
    setConfirmSource(null);
    setNotice(null);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[source];
      return next;
    });
    setDeletingSource(source);
    try {
      await apiFetch<{ source: string; deleted: boolean }>(
        `/api/mail/forwarders/${encodeURIComponent(source)}`,
        { method: "DELETE" },
      );
      setNotice(`Forwarder ${source} deleted.`);
      refresh();
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [source]: err instanceof Error ? err.message : "Delete failed",
      }));
    } finally {
      setDeletingSource(null);
    }
  }

  const noDomains = domains !== null && domains.length === 0;

  return (
    <Card className={forwarders && forwarders.length > 0 ? "overflow-hidden" : undefined}>
      <CardHeader>
        <div>
          <CardTitle>Forwarders</CardTitle>
          <CardDescription>
            Alias addresses that deliver to one or more destination mailboxes. Destinations may be
            on other servers.
          </CardDescription>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={openCreate}
          disabled={createOpen || domains === null || noDomains}
          title={noDomains || domains === null ? "Add a mail domain first" : undefined}
        >
          <Plus size={14} aria-hidden="true" />
          Add forwarder
        </Button>
      </CardHeader>

      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <Label htmlFor="forwarders-domain">Domain</Label>
        <Select
          id="forwarders-domain"
          value={domain}
          onChange={(event) => {
            setDomain(event.target.value);
            setNotice(null);
            setConfirmSource(null);
          }}
          disabled={domains === null || noDomains}
          className="w-56"
        >
          {domains === null || domains.length === 0 ? (
            <option value="">No domains</option>
          ) : (
            domains.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))
          )}
        </Select>
        {loading ? <Spinner size={14} className="text-muted-foreground" /> : null}
      </div>

      {createOpen ? (
        <form
          onSubmit={onCreate}
          className="mx-5 mt-4 grid gap-4 rounded-lg border border-border bg-background/40 p-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="forwarder-local">Source local part</Label>
              <Input
                id="forwarder-local"
                value={localPart}
                onChange={(event) => setLocalPart(event.target.value)}
                placeholder="sales"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={creating}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                The alias becomes{" "}
                <span className="font-mono">
                  {localPart.trim() === "" ? "local" : localPart.trim().toLowerCase()}@
                  {createDomain || "domain"}
                </span>
                .
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="forwarder-domain">Domain</Label>
              <Select
                id="forwarder-domain"
                value={createDomain}
                onChange={(event) => setCreateDomain(event.target.value)}
                disabled={creating || noDomains}
              >
                <option value="" disabled>
                  Select a domain…
                </option>
                {domains?.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="forwarder-target">Forward to</Label>
            <Input
              id="forwarder-target"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="you@example.com, team@example.com"
              autoComplete="off"
              spellCheck={false}
              disabled={creating}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              One address or a comma-separated list of destination addresses.
            </p>
          </div>
          {createError ? <Alert variant="error">{createError}</Alert> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={creating}>
              Add forwarder
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={closeCreate} disabled={creating}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {notice ? (
        <div className="px-5 pt-4">
          <Alert variant="success">{notice}</Alert>
        </div>
      ) : null}

      {noDomains ? (
        <CardBody>
          <p className="text-sm text-muted-foreground">
            Add a mail domain first to route its addresses to other mailboxes.
          </p>
        </CardBody>
      ) : domains === null ? (
        <CardBody>
          <p className="text-sm text-muted-foreground">Loading mail domains…</p>
        </CardBody>
      ) : error && forwarders === null ? (
        <CardBody>
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="secondary" size="sm" onClick={refresh}>
                Retry
              </Button>
            </div>
          </Alert>
        </CardBody>
      ) : forwarders === null ? (
        <CardBody className="grid gap-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </CardBody>
      ) : (
        <>
          {error ? (
            <div className="px-5 pt-4">
              <Alert variant="error">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{error}</span>
                  <Button variant="secondary" size="sm" onClick={refresh}>
                    Retry
                  </Button>
                </div>
              </Alert>
            </div>
          ) : null}

          {forwarders.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={Forward}
                title="No forwarders yet"
                description={`Aliases for ${domain} appear here. Add one to route an address to another mailbox.`}
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 text-left font-medium">Source</th>
                    <th className="px-2 py-3" aria-hidden="true" />
                    <th className="w-full max-w-0 px-5 py-3 text-left font-medium">Forward to</th>
                    <th className="px-5 py-3 text-left font-medium">Created</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {forwarders.map((forwarder) => {
                    const isDeleting = deletingSource === forwarder.source;
                    const isConfirming = confirmSource === forwarder.source;
                    const rowError = rowErrors[forwarder.source];
                    return (
                      <tr
                        key={forwarder.source}
                        className="border-t border-border hover:bg-muted/40"
                      >
                        <td className="px-5 py-3 align-top font-mono text-sm text-foreground">
                          {forwarder.source}
                        </td>
                        <td className="px-2 py-3 align-top">
                          <ArrowRight size={14} className="text-muted-foreground/60" aria-hidden="true" />
                        </td>
                        <td className="w-full max-w-0 px-5 py-3 align-top">
                          <div className="grid gap-1">
                            {forwarder.target.split(",").map((part, index) => (
                              <div
                                key={`${forwarder.source}-${index}`}
                                className="truncate font-mono text-xs text-muted-foreground"
                                title={part.trim()}
                              >
                                {part.trim()}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3 align-top text-muted-foreground">
                          {shortDateTime(forwarder.createdAt)}
                        </td>
                        <td className="px-5 py-3 align-top">
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
                                  onClick={() => void onDelete(forwarder.source)}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setConfirmSource(null)}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-red-400"
                                onClick={() => setConfirmSource(forwarder.source)}
                                aria-label={`Delete ${forwarder.source}`}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                Delete
                              </Button>
                            )}
                          </div>
                          {rowError ? (
                            <p
                              className="mt-1 max-w-64 truncate text-right text-xs text-red-600 dark:text-red-400"
                              title={rowError}
                            >
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
        </>
      )}
    </Card>
  );
}
