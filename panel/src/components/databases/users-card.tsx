"use client";

import { useState, type FormEvent } from "react";
import type {
  MySQLCreateUserRequest,
  MySQLCreateUserResponse,
  MySQLDatabase,
  MySQLUser,
} from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { Check, Copy, KeyRound, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";

const USER_PATTERN = /^[A-Za-z0-9_]{1,32}$/;
const HOST_PATTERN = /^[A-Za-z0-9_.%:-]{1,255}$/;
const PASSWORD_PATTERN = /^[A-Za-z0-9!@#$%^&*()_+=.,?-]{8,64}$/;
const DEFAULT_HOST = "localhost";

type CopyState = "idle" | "copied" | "failed";

function userKey(entry: MySQLUser): string {
  return `${entry.user}@${entry.host}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API unavailable (e.g. insecure context) - fall back below.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

interface UsersCardProps {
  users: MySQLUser[] | null;
  databases: MySQLDatabase[] | null;
  error: string | null;
  disabled: boolean;
  onRefresh: () => void;
}

export function UsersCard({ users, databases, error, disabled, onRefresh }: UsersCardProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState(DEFAULT_HOST);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [created, setCreated] = useState<MySQLCreateUserResponse | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const [grantTarget, setGrantTarget] = useState<MySQLUser | null>(null);
  const [grantDatabase, setGrantDatabase] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const databasesLoaded = databases !== null && databases.length > 0;

  function openCreate() {
    setCreateOpen(true);
    setCreateError(null);
    setNotice(null);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateError(null);
    setUser("");
    setPassword("");
    setHost(DEFAULT_HOST);
  }

  function openGrant(target: MySQLUser) {
    setGrantTarget(target);
    setGrantDatabase("");
    setGrantError(null);
    setNotice(null);
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidateUser = user.trim();
    const candidateHost = host.trim() || DEFAULT_HOST;

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
    if (password !== "" && !PASSWORD_PATTERN.test(password)) {
      setCreateError(
        "Password must be 8-64 characters using letters, numbers or !@#$%^&*()_+-=.,?",
      );
      return;
    }

    const payload: MySQLCreateUserRequest = { user: candidateUser, host: candidateHost };
    if (password !== "") payload.password = password;

    setCreating(true);
    setCreateError(null);
    try {
      const data = await apiPost<MySQLCreateUserResponse>("/api/mysql/users", payload);
      setCreated(data);
      setCopyState("idle");
      setCreateOpen(false);
      setUser("");
      setPassword("");
      setHost(DEFAULT_HOST);
      onRefresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function onGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!grantTarget) return;
    if (!grantDatabase) {
      setGrantError("Select a database first.");
      return;
    }
    setGranting(true);
    setGrantError(null);
    try {
      await apiPost<{ granted: boolean }>("/api/mysql/grants", {
        user: grantTarget.user,
        host: grantTarget.host,
        database: grantDatabase,
        privileges: "all",
      });
      setNotice(
        `Granted all privileges on ${grantDatabase} to ${grantTarget.user}@${grantTarget.host}.`,
      );
      setGrantTarget(null);
      onRefresh();
    } catch (err) {
      setGrantError(err instanceof Error ? err.message : "Failed to grant privileges");
    } finally {
      setGranting(false);
    }
  }

  async function onDelete(target: MySQLUser) {
    const key = userKey(target);
    setConfirmUser(null);
    setNotice(null);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDeletingUser(key);
    try {
      await apiFetch<{ user: string; host: string; deleted: boolean }>(
        `/api/mysql/users/${encodeURIComponent(target.user)}?host=${encodeURIComponent(target.host)}`,
        { method: "DELETE" },
      );
      onRefresh();
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Delete failed",
      }));
    } finally {
      setDeletingUser(null);
    }
  }

  async function onCopyPassword() {
    if (!created?.password) return;
    const ok = await copyText(created.password);
    setCopyState(ok ? "copied" : "failed");
  }

  return (
    <Card className={users && users.length > 0 && !disabled ? "overflow-hidden" : undefined}>
      <CardHeader>
        <div>
          <CardTitle>Users</CardTitle>
          <CardDescription>Non-system MySQL accounts and their hosts.</CardDescription>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={openCreate}
          disabled={disabled || createOpen}
        >
          <UserPlus size={14} aria-hidden="true" />
          Create user
        </Button>
      </CardHeader>

      {created ? (
        <div className="mx-5 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <KeyRound size={18} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-300">
                User {created.user}@{created.host} created
                {created.password ? " with a generated password" : ""}.
              </p>
              {created.password ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="select-all rounded-md border border-amber-500/30 bg-background/60 px-3 py-1.5 font-mono text-sm text-amber-200">
                      {created.password}
                    </code>
                    <Button variant="secondary" size="sm" onClick={() => void onCopyPassword()}>
                      {copyState === "copied" ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Copy size={14} aria-hidden="true" />
                      )}
                      {copyState === "copied" ? "Copied" : "Copy"}
                    </Button>
                    {copyState === "failed" ? (
                      <span className="text-xs text-red-400">Copy failed - select it manually.</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-amber-400/90">
                    This password will not be shown again. Copy it now and store it in a safe place.
                  </p>
                </>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openGrant({ user: created.user, host: created.host })}
                  disabled={!databasesLoaded}
                  title={databasesLoaded ? undefined : "No databases available to grant"}
                >
                  <ShieldCheck size={14} aria-hidden="true" />
                  Grant on database
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {grantTarget ? (
        <form
          onSubmit={onGrant}
          className="mx-5 mt-4 rounded-lg border border-border bg-background/40 p-4"
        >
          <p className="text-sm text-foreground">
            Grant privileges on a database to{" "}
            <span className="font-mono text-foreground">
              {grantTarget.user}@{grantTarget.host}
            </span>
          </p>

          {databasesLoaded ? (
            <div className="mt-3 grid gap-3 sm:max-w-md">
              <div className="grid gap-1.5">
                <Label htmlFor="grant-database">Database</Label>
                <Select
                  id="grant-database"
                  value={grantDatabase}
                  onChange={(event) => {
                    setGrantDatabase(event.target.value);
                    setGrantError(null);
                  }}
                  disabled={granting}
                >
                  <option value="" disabled>
                    Select a database…
                  </option>
                  {databases?.map((db) => (
                    <option key={db.name} value={db.name}>
                      {db.name}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  Grants ALL privileges on the selected database.
                </p>
              </div>
              {grantError ? <Alert variant="error">{grantError}</Alert> : null}
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" loading={granting} disabled={!grantDatabase}>
                  Grant all privileges
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGrantTarget(null)}
                  disabled={granting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid gap-3">
              <p className="text-xs text-muted-foreground">
                No databases are available to grant. Create a database first.
              </p>
              <div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setGrantTarget(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </form>
      ) : null}

      {createOpen && !disabled ? (
        <form
          onSubmit={onCreate}
          className="mx-5 mt-4 grid gap-4 rounded-lg border border-border bg-background/40 p-4"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mysql-user">Username</Label>
              <Input
                id="mysql-user"
                value={user}
                onChange={(event) => setUser(event.target.value)}
                placeholder="app_user"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={creating}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">1-32 letters, numbers, underscores.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mysql-password">
                Password <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="mysql-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Leave empty to generate"
                autoComplete="new-password"
                spellCheck={false}
                disabled={creating}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Empty means the server generates a secure password.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mysql-host">Host</Label>
              <Input
                id="mysql-host"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder={DEFAULT_HOST}
                autoComplete="off"
                spellCheck={false}
                disabled={creating}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Defaults to {DEFAULT_HOST}.</p>
            </div>
          </div>
          {createError ? <Alert variant="error">{createError}</Alert> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={creating}>
              Create user
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
          <p className="text-sm text-muted-foreground">
            MariaDB/MySQL is unreachable, so users cannot be listed or changed right now.
          </p>
        </CardBody>
      ) : error && users === null ? (
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
      ) : users === null ? (
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

          {users.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={Users}
                title="No users yet"
                description="Create a MySQL user, then grant it access to a database."
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 text-left font-medium">User</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((entry) => {
                    const key = userKey(entry);
                    const isDeleting = deletingUser === key;
                    const isConfirming = confirmUser === key;
                    const rowError = rowErrors[key];
                    return (
                      <tr key={key} className="border-t border-border hover:bg-muted/40">
                        <td className="px-5 py-3 font-mono text-sm">
                          <span className="text-foreground">{entry.user}</span>
                          <span className="text-muted-foreground">@{entry.host}</span>
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
                                <Button variant="danger" size="sm" onClick={() => void onDelete(entry)}>
                                  Confirm
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setConfirmUser(null)}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => openGrant(entry)}
                                  disabled={!databasesLoaded}
                                  title={databasesLoaded ? undefined : "No databases available to grant"}
                                >
                                  <ShieldCheck size={14} aria-hidden="true" />
                                  Grant on database
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-red-400"
                                  onClick={() => setConfirmUser(key)}
                                  aria-label={`Delete ${key}`}
                                >
                                  <Trash2 size={14} aria-hidden="true" />
                                  Delete
                                </Button>
                              </>
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
