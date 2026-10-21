"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { DOMAIN_PATTERN } from "@/components/mail/mail-utils";
import { Globe, Plus, Trash2 } from "lucide-react";

interface DomainsCardProps {
  domains: string[] | null;
  error: string | null;
  onRefresh: () => void;
}

export function DomainsCard({ domains, error, onRefresh }: DomainsCardProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  function openCreate() {
    setCreateOpen(true);
    setCreateError(null);
    setNotice(null);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateError(null);
    setName("");
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = name.trim().toLowerCase();
    if (!DOMAIN_PATTERN.test(candidate)) {
      setCreateError(
        "Enter a valid domain, like example.com (lowercase letters, numbers and hyphens, at least two labels).",
      );
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await apiPost<{ domain: string }>("/api/mail/domains", { domain: candidate });
      setNotice(`Mail domain ${candidate} added.`);
      setCreateOpen(false);
      setName("");
      onRefresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to add mail domain");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(target: string) {
    setConfirmName(null);
    setNotice(null);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[target];
      return next;
    });
    setDeletingName(target);
    try {
      await apiFetch<{ domain: string; deleted: boolean }>(
        `/api/mail/domains/${encodeURIComponent(target)}`,
        { method: "DELETE" },
      );
      setNotice(`Mail domain ${target} deleted.`);
      onRefresh();
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [target]: err instanceof Error ? err.message : "Delete failed",
      }));
    } finally {
      setDeletingName(null);
    }
  }

  return (
    <Card className={domains && domains.length > 0 ? "overflow-hidden" : undefined}>
      <CardHeader>
        <div>
          <CardTitle>Mail domains</CardTitle>
          <CardDescription>
            Domains this server accepts mail for. Mailboxes, forwarders and autoresponders belong to
            a domain.
          </CardDescription>
        </div>
        <Button variant="secondary" size="sm" onClick={openCreate} disabled={createOpen}>
          <Plus size={14} aria-hidden="true" />
          Add domain
        </Button>
      </CardHeader>

      {createOpen ? (
        <form
          onSubmit={onCreate}
          className="mx-5 mt-4 grid gap-3 rounded-lg border border-border bg-background/40 p-4 sm:max-w-md"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="mail-domain">Domain</Label>
            <Input
              id="mail-domain"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="example.com"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              disabled={creating}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers and hyphens per label, separated by dots.
            </p>
          </div>
          {createError ? <Alert variant="error">{createError}</Alert> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={creating}>
              Add domain
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

      {error && domains === null ? (
        <CardBody>
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="secondary" size="sm" onClick={onRefresh}>
                Retry
              </Button>
            </div>
          </Alert>
        </CardBody>
      ) : domains === null ? (
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
                  <Button variant="secondary" size="sm" onClick={onRefresh}>
                    Retry
                  </Button>
                </div>
              </Alert>
            </div>
          ) : null}

          {domains.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={Globe}
                title="No mail domains yet — add one to get started"
                description="Add a domain to create mailboxes, forwarders, autoresponders and DKIM records for it."
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 text-left font-medium">Domain</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {domains.map((domain) => {
                    const isDeleting = deletingName === domain;
                    const isConfirming = confirmName === domain;
                    const rowError = rowErrors[domain];
                    return (
                      <tr
                        key={domain}
                        className="border-t border-border hover:bg-muted/40"
                      >
                        <td className="px-5 py-3 font-mono text-sm text-foreground">{domain}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {isDeleting ? (
                              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Spinner size={14} className="text-muted-foreground" />
                                deleting…
                              </span>
                            ) : isConfirming ? (
                              <>
                                <span className="text-xs text-muted-foreground">Delete domain?</span>
                                <Button variant="danger" size="sm" onClick={() => void onDelete(domain)}>
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
                                onClick={() => setConfirmName(domain)}
                                aria-label={`Delete ${domain}`}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                Delete
                              </Button>
                            )}
                          </div>
                          {isConfirming ? (
                            <p className="mt-1 text-right text-xs text-amber-400">
                              Also removes the domain&apos;s mailboxes, forwarders and autoresponders.
                            </p>
                          ) : null}
                          {rowError ? (
                            <p
                              className="mt-1 max-w-64 truncate text-right text-xs text-red-400"
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
