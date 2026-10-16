"use client";

import { useState, type FormEvent } from "react";
import type { MySQLDatabase } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { Database, Plus, Trash2 } from "lucide-react";

const DATABASE_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

interface DatabasesCardProps {
  databases: MySQLDatabase[] | null;
  error: string | null;
  disabled: boolean;
  onRefresh: () => void;
}

export function DatabasesCard({ databases, error, disabled, onRefresh }: DatabasesCardProps) {
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
    const candidate = name.trim();
    if (!DATABASE_NAME_PATTERN.test(candidate)) {
      setCreateError("Use 1-64 characters: letters, numbers and underscores only.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await apiPost<{ name: string }>("/api/mysql/databases", { name: candidate });
      setNotice(`Database ${candidate} created.`);
      setCreateOpen(false);
      setName("");
      onRefresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create database");
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
      await apiFetch<{ name: string; deleted: boolean }>(
        `/api/mysql/databases/${encodeURIComponent(target)}`,
        { method: "DELETE" },
      );
      setNotice(`Database ${target} deleted.`);
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
    <Card className={databases && databases.length > 0 && !disabled ? "overflow-hidden" : undefined}>
      <CardHeader>
        <div>
          <CardTitle>Databases</CardTitle>
          <CardDescription>Schemas on the local MariaDB/MySQL server.</CardDescription>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={openCreate}
          disabled={disabled || createOpen}
        >
          <Plus size={14} aria-hidden="true" />
          Create database
        </Button>
      </CardHeader>

      {createOpen && !disabled ? (
        <form
          onSubmit={onCreate}
          className="mx-5 mt-4 grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 sm:max-w-md"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="database-name">Database name</Label>
            <Input
              id="database-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my_database"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              disabled={creating}
              className="font-mono"
            />
            <p className="text-xs text-slate-500">Letters, numbers and underscores - 1 to 64 characters.</p>
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

      {disabled ? (
        <CardBody>
          <p className="text-sm text-slate-500">
            MariaDB/MySQL is unreachable, so databases cannot be listed or changed right now.
          </p>
        </CardBody>
      ) : error && databases === null ? (
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
      ) : databases === null ? (
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

          {databases.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={Database}
                title="No databases yet"
                description="Create your first database to get started."
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 text-left font-medium">Database</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {databases.map((db) => {
                    const isDeleting = deletingName === db.name;
                    const isConfirming = confirmName === db.name;
                    const rowError = rowErrors[db.name];
                    return (
                      <tr key={db.name} className="border-t border-slate-800 hover:bg-slate-800/40">
                        <td className="px-5 py-3 font-mono text-sm text-slate-200">{db.name}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {isDeleting ? (
                              <span className="flex items-center gap-2 text-xs text-slate-400">
                                <Spinner size={14} className="text-slate-400" />
                                deleting…
                              </span>
                            ) : isConfirming ? (
                              <>
                                <span className="text-xs text-slate-400">Delete?</span>
                                <Button variant="danger" size="sm" onClick={() => void onDelete(db.name)}>
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
                                className="text-slate-400 hover:text-red-400"
                                onClick={() => setConfirmName(db.name)}
                                aria-label={`Delete ${db.name}`}
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
