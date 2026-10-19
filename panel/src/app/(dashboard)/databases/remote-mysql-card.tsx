"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { RemoteMysqlUser, RemoteMysqlUsersResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { Globe, Plus, Trash2 } from "lucide-react";

const USER_PATTERN = /^[A-Za-z0-9_]{1,32}$/;
const HOST_PATTERN = /^[A-Za-z0-9_.%:-]{1,255}$/;

function userKey(entry: RemoteMysqlUser): string {
  return `${entry.user}@${entry.host}`;
}

export function RemoteMysqlCard() {
  const [users, setUsers] = useState<RemoteMysqlUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [user, setUser] = useState("");
  const [host, setHost] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<RemoteMysqlUsersResponse>("/api/mysql/remote");
      setUsers(data.users);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load remote MySQL hosts");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = creating || deletingKey !== null;

  function openCreate() {
    setCreateOpen(true);
    setCreateError(null);
    setNotice(null);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateError(null);
    setUser("");
    setHost("");
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidateUser = user.trim();
    const candidateHost = host.trim();

    if (!USER_PATTERN.test(candidateUser)) {
      setCreateError("Username must be 1-32 characters: letters, numbers and underscores only.");
      return;
    }
    if (!HOST_PATTERN.test(candidateHost)) {
      setCreateError(
        "Host must be 1-255 characters and may only contain letters, numbers, dots, hyphens, underscores, colons and percent signs.",
      );
      return;
    }
    if (candidateHost.toLowerCase() === "localhost") {
      setCreateError("Remote hosts must not be localhost - local accounts are managed above.");
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      await apiPost<{ user: string }>("/api/mysql/remote", {
        user: candidateUser,
        host: candidateHost,
      });
      setNotice(
        `Remote access for ${candidateUser}@${candidateHost} added. The localhost account is unchanged.`,
      );
      setCreateOpen(false);
      setUser("");
      setHost("");
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to add the remote host");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(entry: RemoteMysqlUser) {
    const key = userKey(entry);
    setConfirmKey(null);
    setNotice(null);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDeletingKey(key);
    try {
      await apiFetch<{ user: string }>(
        `/api/mysql/remote/${encodeURIComponent(entry.user)}?host=${encodeURIComponent(entry.host)}`,
        { method: "DELETE" },
      );
      setNotice(`Remote access for ${key} removed.`);
      await load();
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Delete failed",
      }));
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <Card className={users && users.length > 0 ? "overflow-hidden" : undefined}>
      <CardHeader>
        <div>
          <CardTitle>Remote MySQL access</CardTitle>
          <CardDescription>
            Users that may connect from other machines. Adding a host clones the user&apos;s
            localhost entry (password hash and grants); the localhost account itself is never
            changed.
          </CardDescription>
        </div>
        <Button variant="secondary" size="sm" onClick={openCreate} disabled={createOpen || busy}>
          <Plus size={14} aria-hidden="true" />
          Add remote host
        </Button>
      </CardHeader>

      {createOpen ? (
        <form
          onSubmit={onCreate}
          className="mx-5 mt-4 grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 sm:max-w-md"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="remote-mysql-user">User</Label>
            <Input
              id="remote-mysql-user"
              value={user}
              onChange={(event) => setUser(event.target.value)}
              placeholder="app_user"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              disabled={creating}
              className="font-mono"
            />
            <p className="text-xs text-slate-500">
              An existing MySQL user name (1-32 letters, numbers, underscores).
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="remote-mysql-host">Host</Label>
            <Input
              id="remote-mysql-host"
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="203.0.113.10 or %"
              autoComplete="off"
              spellCheck={false}
              disabled={creating}
              className="font-mono"
            />
            <p className="text-xs text-slate-500">
              IP address, hostname or % — connections from other machines.
            </p>
          </div>
          {createError ? <Alert variant="error">{createError}</Alert> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={creating}>
              Add remote host
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

      {loadError && users === null ? (
        <CardBody>
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        </CardBody>
      ) : users === null ? (
        <CardBody className="grid gap-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </CardBody>
      ) : (
        <>
          {loadError ? (
            <div className="px-5 pt-4">
              <Alert variant="error">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{loadError}</span>
                  <Button variant="secondary" size="sm" onClick={() => void load()}>
                    Retry
                  </Button>
                </div>
              </Alert>
            </div>
          ) : null}

          {users.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={Globe}
                title="No remote hosts yet"
                description="Add a remote host to let a database user connect from another machine."
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 text-left font-medium">User@host</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((entry) => {
                    const key = userKey(entry);
                    const isDeleting = deletingKey === key;
                    const isConfirming = confirmKey === key;
                    const rowError = rowErrors[key];
                    return (
                      <tr key={key} className="border-t border-slate-800 hover:bg-slate-800/40">
                        <td className="px-5 py-3 font-mono text-sm">
                          <span className="text-slate-200">{entry.user}</span>
                          <span className="text-slate-500">@{entry.host}</span>
                        </td>
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
                                <Button variant="danger" size="sm" onClick={() => void onDelete(entry)}>
                                  Confirm
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setConfirmKey(null)}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-slate-400 hover:text-red-400"
                                onClick={() => setConfirmKey(key)}
                                aria-label={`Delete ${key}`}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                Delete
                              </Button>
                            )}
                          </div>
                          {isConfirming ? (
                            <p className="mt-1 text-right text-xs text-amber-400">
                              Removes only the remote copy; the localhost account stays.
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
