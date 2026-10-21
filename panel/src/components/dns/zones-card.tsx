"use client";

import { useState, type FormEvent } from "react";
import type { DNSZone } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/components/ui/cn";
import { Network, Plus, Trash2 } from "lucide-react";

// Frozen by docs/api.md section 4 - lowercase before testing.
const ZONE_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

interface ZonesCardProps {
  zones: DNSZone[] | null;
  error: string | null;
  selected: string | null;
  onSelect: (name: string) => void;
  onRefresh: () => void;
}

export function ZonesCard({ zones, error, selected, onSelect, onRefresh }: ZonesCardProps) {
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
    if (!ZONE_PATTERN.test(candidate)) {
      setCreateError(
        "Enter a valid zone name, like example.com (lowercase letters, numbers and hyphens, at least two labels).",
      );
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await apiPost<{ zone: DNSZone }>("/api/dns/zones", { name: candidate });
      setNotice(`Zone ${candidate} created.`);
      setCreateOpen(false);
      setName("");
      onRefresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create zone");
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
      await apiFetch<{ zone: string; deleted: boolean }>(
        `/api/dns/zones/${encodeURIComponent(target)}`,
        { method: "DELETE" },
      );
      setNotice(`Zone ${target} deleted.`);
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
    <Card className={zones && zones.length > 0 ? "overflow-hidden" : undefined}>
      <CardHeader>
        <div>
          <CardTitle>Zones</CardTitle>
          <CardDescription>PowerDNS zones on this server. Select a zone to manage its records.</CardDescription>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={openCreate}
          disabled={createOpen}
        >
          <Plus size={14} aria-hidden="true" />
          Create zone
        </Button>
      </CardHeader>

      {createOpen ? (
        <form
          onSubmit={onCreate}
          className="mx-5 mt-4 grid gap-3 rounded-lg border border-border bg-background/40 p-4 sm:max-w-md"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="zone-name">Zone name</Label>
            <Input
              id="zone-name"
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
              Create
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

      {error && zones === null ? (
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
      ) : zones === null ? (
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

          {zones.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={Network}
                title="No zones yet"
                description="Create your first DNS zone to manage its records."
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 text-left font-medium">Zone</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((zone) => {
                    const isSelected = selected === zone.name;
                    const isDeleting = deletingName === zone.name;
                    const isConfirming = confirmName === zone.name;
                    const rowError = rowErrors[zone.name];
                    return (
                      <tr
                        key={zone.name}
                        className={cn(
                          "border-t border-border hover:bg-muted/40",
                          isSelected && "bg-muted/40",
                        )}
                      >
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => onSelect(zone.name)}
                            aria-pressed={isSelected}
                            title="Show records"
                            className={cn(
                              "cursor-pointer font-mono text-sm transition-colors",
                              isSelected
                                ? "text-brand"
                                : "text-foreground hover:text-brand",
                            )}
                          >
                            {zone.name}
                          </button>
                          {isSelected ? (
                            <span className="ml-2 text-xs text-muted-foreground">viewing records</span>
                          ) : null}
                        </td>
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
                                <Button variant="danger" size="sm" onClick={() => void onDelete(zone.name)}>
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
                                onClick={() => setConfirmName(zone.name)}
                                aria-label={`Delete ${zone.name}`}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                Delete
                              </Button>
                            )}
                          </div>
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
