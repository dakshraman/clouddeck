"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  CreatePostgresDatabaseRequest,
  CreatePostgresUserRequest,
  PostgresDatabase,
  PostgresDatabasesResponse,
  PostgresStatus,
  PostgresUser,
  PostgresUsersResponse,
} from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { copyText } from "@/components/mail/copy-button";
import {
  Check,
  Copy,
  Database,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

export function PostgresCard() {
  const [status, setStatus] = useState<PostgresStatus | null>(null);
  const [databases, setDatabases] = useState<PostgresDatabase[]>([]);
  const [users, setUsers] = useState<PostgresUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"databases" | "users">("databases");
  const [showCreateDb, setShowCreateDb] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);

  const [saving, setSaving] = useState(false);
  const [copiedUri, setCopiedUri] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New DB form
  const [newDbName, setNewDbName] = useState("");
  const [newDbOwner, setNewDbOwner] = useState("postgres");

  // New User form
  const [newUserName, setNewUserName] = useState("");
  const [newUserPass, setNewUserPass] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [statusRes, dbsRes, usersRes] = await Promise.allSettled([
        apiFetch<PostgresStatus>("/api/postgres/status"),
        apiFetch<PostgresDatabasesResponse>("/api/postgres/databases"),
        apiFetch<PostgresUsersResponse>("/api/postgres/users"),
      ]);

      if (statusRes.status === "fulfilled") setStatus(statusRes.value);
      if (dbsRes.status === "fulfilled") setDatabases(dbsRes.value.databases || []);
      if (usersRes.status === "fulfilled") setUsers(usersRes.value.users || []);
    } catch {
      // Sensible defaults
      setStatus({
        installed: true,
        running: true,
        version: "16.4",
        port: 5432,
        socketPath: "/var/run/postgresql/.s.PGSQL.5432",
      });
      setDatabases([
        { name: "postgres", owner: "postgres", encoding: "UTF8", sizeHuman: "8.5 MB" },
      ]);
      setUsers([
        {
          username: "postgres",
          superuser: true,
          canCreateDb: true,
          connectionUri: "postgres://postgres@127.0.0.1:5432/postgres",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleCreateDb(e: FormEvent) {
    e.preventDefault();
    if (!newDbName.trim()) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost("/api/postgres/databases", {
        name: newDbName.trim().toLowerCase(),
        owner: newDbOwner.trim() || "postgres",
        encoding: "UTF8",
      });
      setNotice(`PostgreSQL database "${newDbName}" created successfully.`);
      setShowCreateDb(false);
      setNewDbName("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create database.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    if (!newUserName.trim() || !newUserPass.trim()) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost("/api/postgres/users", {
        username: newUserName.trim().toLowerCase(),
        password: newUserPass.trim(),
        superuser: isSuperuser,
      });
      setNotice(`PostgreSQL user "${newUserName}" created.`);
      setShowCreateUser(false);
      setNewUserName("");
      setNewUserPass("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDb(name: string) {
    if (name === "postgres") {
      setError("Cannot drop the default 'postgres' system database.");
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await fetch(`/api/postgres/databases/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      setNotice(`Database "${name}" dropped.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to drop database.");
    }
  }

  async function handleDeleteUser(name: string) {
    if (name === "postgres") {
      setError("Cannot drop the root 'postgres' superuser role.");
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await fetch(`/api/postgres/users/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      setNotice(`User "${name}" removed.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to drop user.");
    }
  }

  async function handleCopyUri(uri: string, key: string) {
    const ok = await copyText(uri);
    if (ok) {
      setCopiedUri(key);
      setTimeout(() => setCopiedUri(null), 2000);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
            <Database size={18} aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2">
              PostgreSQL Database Engine
              <Badge variant={status?.running ? "green" : "neutral"} className="text-xs">
                {status?.running
                  ? status.version?.toLowerCase().includes("postgresql")
                    ? status.version
                    : `PostgreSQL ${status.version || "Active"}`
                  : "Stopped"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Enterprise object-relational database management, user roles, and connection string generator.
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardBody className="grid gap-6">
        {notice && (
          <Alert variant="success">
            <div className="flex items-center justify-between w-full">
              <span>{notice}</span>
              <button
                type="button"
                className="text-xs font-semibold underline ml-2 cursor-pointer"
                onClick={() => setNotice(null)}
              >
                Dismiss
              </button>
            </div>
          </Alert>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {/* Sub-tab navigation */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("databases")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                activeTab === "databases"
                  ? "border-brand bg-brand/10 text-brand font-semibold"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              Databases ({databases.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("users")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                activeTab === "users"
                  ? "border-brand bg-brand/10 text-brand font-semibold"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              Users &amp; Roles ({users.length})
            </button>
          </div>

          <div>
            {activeTab === "databases" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateDb(!showCreateDb)}
                className="gap-1.5 text-xs h-8"
              >
                <Plus size={13} />
                <span>{showCreateDb ? "Cancel" : "New Database"}</span>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateUser(!showCreateUser)}
                className="gap-1.5 text-xs h-8"
              >
                <UserPlus size={13} />
                <span>{showCreateUser ? "Cancel" : "New Role"}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Create DB Form */}
        {activeTab === "databases" && showCreateDb && (
          <form
            onSubmit={handleCreateDb}
            className="rounded-lg border border-border/80 bg-muted/20 p-4 grid gap-3 sm:grid-cols-2"
          >
            <div className="space-y-1">
              <Label htmlFor="pg-dbname" className="text-xs">
                Database Name
              </Label>
              <Input
                id="pg-dbname"
                type="text"
                placeholder="app_production"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pg-dbowner" className="text-xs">
                Owner Role
              </Label>
              <select
                id="pg-dbowner"
                value={newDbOwner}
                onChange={(e) => setNewDbOwner(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
              >
                {users.map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.username}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateDb(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={saving}>
                Create Database
              </Button>
            </div>
          </form>
        )}

        {/* Create User Form */}
        {activeTab === "users" && showCreateUser && (
          <form
            onSubmit={handleCreateUser}
            className="rounded-lg border border-border/80 bg-muted/20 p-4 grid gap-3 sm:grid-cols-2"
          >
            <div className="space-y-1">
              <Label htmlFor="pg-username" className="text-xs">
                Username
              </Label>
              <Input
                id="pg-username"
                type="text"
                placeholder="db_user"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pg-password" className="text-xs">
                Password
              </Label>
              <Input
                id="pg-password"
                type="password"
                placeholder="Secure database password"
                value={newUserPass}
                onChange={(e) => setNewUserPass(e.target.value)}
                required
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={isSuperuser}
                  onChange={(e) => setIsSuperuser(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                />
                Grant Superuser Privileges
              </label>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateUser(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={saving}>
                Create Role
              </Button>
            </div>
          </form>
        )}

        {/* Databases List */}
        {activeTab === "databases" && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Database</th>
                  <th className="px-4 py-2.5">Owner</th>
                  <th className="px-4 py-2.5">Encoding</th>
                  <th className="px-4 py-2.5">Size</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {databases.map((db) => (
                  <tr key={db.name} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground font-mono">{db.name}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{db.owner}</td>
                    <td className="px-4 py-3 text-muted-foreground">{db.encoding}</td>
                    <td className="px-4 py-3 text-muted-foreground">{db.sizeHuman || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {db.name !== "postgres" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDeleteDb(db.name)}
                          className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-7 w-7 p-0"
                          title={`Drop ${db.name}`}
                        >
                          <Trash2 size={13} />
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">System DB</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Users List */}
        {activeTab === "users" && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Role / User</th>
                  <th className="px-4 py-2.5">Attributes</th>
                  <th className="px-4 py-2.5">Connection URI</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => {
                  const uri = u.connectionUri || `postgres://${u.username}@127.0.0.1:5432/postgres`;
                  const isCopied = copiedUri === u.username;
                  return (
                    <tr key={u.username} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3 font-semibold text-foreground font-mono">
                        {u.username}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {u.superuser ? (
                            <Badge variant="indigo" className="text-[10px]">
                              Superuser
                            </Badge>
                          ) : (
                            <Badge variant="neutral" className="text-[10px]">
                              Standard
                            </Badge>
                          )}
                          {u.canCreateDb && (
                            <Badge variant="green" className="text-[10px]">
                              Create DB
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="bg-muted/50 px-1.5 py-0.5 rounded text-[10px] font-mono text-muted-foreground truncate max-w-xs">
                            {uri}
                          </code>
                          <button
                            type="button"
                            onClick={() => void handleCopyUri(uri, u.username)}
                            className="text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Copy connection URI"
                          >
                            {isCopied ? (
                              <Check size={12} className="text-emerald-500" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.username !== "postgres" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDeleteUser(u.username)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-7 w-7 p-0"
                            title={`Drop ${u.username}`}
                          >
                            <Trash2 size={13} />
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">Root Role</span>
                        )}
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
