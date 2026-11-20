"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CreateUserRequest, PanelUser, UserListResponse, UserRole } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Globe,
  HardDrive,
  KeyRound,
  Plus,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

export function UsersRbacCard() {
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("client");
  const [assignedDomainsStr, setAssignedDomainsStr] = useState("");
  const [maxDiskMb, setMaxDiskMb] = useState("5120");
  const [maxDbs, setMaxDbs] = useState("5");
  const [maxMails, setMaxMails] = useState("10");

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<UserListResponse>("/api/users");
      setUsers(res.users || []);
    } catch {
      // Sensible defaults
      setUsers([
        {
          username: "admin",
          email: "admin@localhost",
          role: "admin",
          assignedDomains: ["*"],
          quota: { diskMb: 0, maxDatabases: 0, maxMailboxes: 0 },
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      setError("Username and initial password are required.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    const domains = assignedDomainsStr
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    const payload: CreateUserRequest = {
      username: newUsername.trim().toLowerCase(),
      password: newPassword.trim(),
      email: newEmail.trim() || undefined,
      role: newRole,
      assignedDomains: domains.length > 0 ? domains : ["*"],
      quota: {
        diskMb: Number.parseInt(maxDiskMb, 10) || 5120,
        maxDatabases: Number.parseInt(maxDbs, 10) || 5,
        maxMailboxes: Number.parseInt(maxMails, 10) || 10,
      },
    };

    try {
      await apiPost("/api/users", payload);
      setNotice(`Sub-account "${payload.username}" created with role "${payload.role}".`);
      setShowAddForm(false);
      // Reset form
      setNewUsername("");
      setNewPassword("");
      setNewEmail("");
      setAssignedDomainsStr("");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user sub-account.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(username: string) {
    if (username === "admin") {
      setError("Cannot delete the primary root administrator account.");
      return;
    }
    setDeletingUser(username);
    setError(null);
    setNotice(null);
    try {
      await fetch(`/api/users/${encodeURIComponent(username)}`, {
        method: "DELETE",
      });
      setNotice(`Sub-account "${username}" removed.`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
    } finally {
      setDeletingUser(null);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
            <Users size={18} aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Client Sub-Accounts & RBAC</CardTitle>
            <CardDescription>
              Role-based access control for client tenants, reseller delegation, and resource quotas.
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="gap-1.5"
          >
            <UserPlus size={14} />
            <span>{showAddForm ? "Cancel" : "Add User"}</span>
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

        {showAddForm && (
          <div className="rounded-lg border border-border/80 bg-muted/20 p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <UserCheck size={16} className="text-brand" /> Provision Client Sub-Account
            </h4>

            <form onSubmit={handleCreateUser} className="grid gap-4 sm:grid-cols-2 pt-1">
              <div className="space-y-1">
                <Label htmlFor="user-name" className="text-xs">
                  Username
                </Label>
                <Input
                  id="user-name"
                  type="text"
                  placeholder="client_john"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="user-pass" className="text-xs">
                  Password
                </Label>
                <Input
                  id="user-pass"
                  type="password"
                  placeholder="Generate strong password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="user-email" className="text-xs">
                  Email Address
                </Label>
                <Input
                  id="user-email"
                  type="email"
                  placeholder="john@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="user-role" className="text-xs">
                  Role
                </Label>
                <select
                  id="user-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
                >
                  <option value="client">Client (Restricted to assigned domains)</option>
                  <option value="admin">Administrator (Full root privileges)</option>
                </select>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="user-domains" className="text-xs">
                  Assigned Domains (comma-separated, or * for all)
                </Label>
                <Input
                  id="user-domains"
                  type="text"
                  placeholder="clientapp.com, test.clientapp.com"
                  value={assignedDomainsStr}
                  onChange={(e) => setAssignedDomainsStr(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="user-quota-disk" className="text-xs">
                  Disk Quota (MB)
                </Label>
                <Input
                  id="user-quota-disk"
                  type="number"
                  placeholder="5120"
                  value={maxDiskMb}
                  onChange={(e) => setMaxDiskMb(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="user-quota-db" className="text-xs">
                    Max Databases
                  </Label>
                  <Input
                    id="user-quota-db"
                    type="number"
                    placeholder="5"
                    value={maxDbs}
                    onChange={(e) => setMaxDbs(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="user-quota-mail" className="text-xs">
                    Max Mailboxes
                  </Label>
                  <Input
                    id="user-quota-mail"
                    type="number"
                    placeholder="10"
                    value={maxMails}
                    onChange={(e) => setMaxMails(e.target.value)}
                  />
                </div>
              </div>

              <div className="sm:col-span-2 pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" loading={saving}>
                  Create Sub-Account
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* User Accounts Table */}
        {loading ? (
          <div className="grid gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Assigned Domains</th>
                  <th className="px-4 py-2.5">Quotas</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr key={u.username} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground font-mono">{u.username}</div>
                      {u.email && <div className="text-[11px] text-muted-foreground">{u.email}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === "admin" ? "indigo" : "amber"} className="capitalize">
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {u.assignedDomains && u.assignedDomains.length > 0 ? (
                          u.assignedDomains.map((d) => (
                            <code
                              key={d}
                              className="rounded bg-muted/50 px-1 py-0.5 text-[10px] font-mono text-foreground"
                            >
                              {d}
                            </code>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-[11px]">All (*)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.quota ? (
                        <span className="text-[11px]">
                          {u.quota.diskMb ? `${u.quota.diskMb} MB` : "Unlimited"} &bull;{" "}
                          {u.quota.maxDatabases ?? 0} DBs &bull; {u.quota.maxMailboxes ?? 0} Mails
                        </span>
                      ) : (
                        <span className="text-[11px]">Unlimited</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.username !== "admin" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDelete(u.username)}
                          disabled={deletingUser === u.username}
                          className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-7 w-7 p-0"
                          title={`Delete ${u.username}`}
                        >
                          {deletingUser === u.username ? (
                            <Spinner className="h-3 w-3" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">Root Admin</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
