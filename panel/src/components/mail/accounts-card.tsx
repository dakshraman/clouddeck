"use client";

import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import type { MailAccount, MailAccountsResponse } from "@/lib/types";
import { apiFetch, apiPost, isAbortError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { formatBytes, shortDateTime } from "@/components/format";
import {
  LOCAL_PART_PATTERN,
  PASSWORD_MIN_LENGTH,
  QUOTA_MAX_MB,
  buildEmail,
  quotaLabel,
} from "@/components/mail/mail-utils";
import { AtSign, Eye, EyeOff, Inbox, KeyRound, Plus, Trash2 } from "lucide-react";

interface AccountsCardProps {
  domains: string[] | null;
  onRefresh: () => void;
}

function parseQuotaInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (value > QUOTA_MAX_MB) return null;
  return value;
}

export function AccountsCard({ domains, onRefresh }: AccountsCardProps) {
  const [accounts, setAccounts] = useState<MailAccount[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [localPart, setLocalPart] = useState("");
  const [createDomain, setCreateDomain] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [quotaMb, setQuotaMb] = useState("0");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [passwordTarget, setPasswordTarget] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [quotaTarget, setQuotaTarget] = useState<string | null>(null);
  const [newQuota, setNewQuota] = useState("");
  const [changingQuota, setChangingQuota] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  function clearRowError(email: string) {
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[email];
      return next;
    });
  }

  // Keep the filter valid when the domain list changes.
  useEffect(() => {
    if (domains && filter !== "all" && !domains.includes(filter)) {
      setFilter("all");
    }
  }, [domains, filter]);

  // Default the create form's domain to the first listed domain.
  useEffect(() => {
    if (domains && domains.length > 0 && !domains.includes(createDomain)) {
      setCreateDomain(domains[0]);
    }
  }, [domains, createDomain]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const url =
      filter === "all"
        ? "/api/mail/accounts"
        : `/api/mail/accounts?domain=${encodeURIComponent(filter)}`;

    apiFetch<MailAccountsResponse>(url, { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        setAccounts(data.accounts);
        setLoading(false);
      })
      .catch((err) => {
        if (!active || isAbortError(err)) return;
        setError(err instanceof Error ? err.message : "Failed to load mailboxes");
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [filter, reloadKey]);

  function openCreate() {
    setCreateOpen(true);
    setCreateError(null);
    setNotice(null);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateError(null);
    setLocalPart("");
    setPassword("");
    setQuotaMb("0");
  }

  function openPasswordEditor(account: MailAccount) {
    setQuotaTarget(null);
    setPasswordTarget(account.email);
    setNewPassword("");
    setShowNewPassword(false);
    setNotice(null);
    clearRowError(account.email);
  }

  function openQuotaEditor(account: MailAccount) {
    setPasswordTarget(null);
    setQuotaTarget(account.email);
    setNewQuota(String(account.quotaMb));
    setNotice(null);
    clearRowError(account.email);
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidateLocal = localPart.trim().toLowerCase();
    if (!LOCAL_PART_PATTERN.test(candidateLocal)) {
      setCreateError(
        "Enter a local part like info or first.last (lowercase letters, numbers, dots, underscores and hyphens).",
      );
      return;
    }
    if (!createDomain) {
      setCreateError("Select a domain for the mailbox.");
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setCreateError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    const parsedQuota = parseQuotaInput(quotaMb);
    if (parsedQuota === null) {
      setCreateError(`Quota must be a whole number of MB between 0 and ${QUOTA_MAX_MB}.`);
      return;
    }

    const email = buildEmail(candidateLocal, createDomain);
    setCreating(true);
    setCreateError(null);
    try {
      await apiPost<MailAccount>("/api/mail/accounts", {
        email,
        password,
        quotaMb: parsedQuota,
      });
      setNotice(`Mailbox ${email} created.`);
      setCreateOpen(false);
      setLocalPart("");
      setPassword("");
      setQuotaMb("0");
      refresh();
      onRefresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create mailbox");
    } finally {
      setCreating(false);
    }
  }

  async function onPasswordChange(event: FormEvent<HTMLFormElement>, email: string) {
    event.preventDefault();
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setRowErrors((prev) => ({
        ...prev,
        [email]: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      }));
      return;
    }

    clearRowError(email);
    setChangingPassword(true);
    try {
      await apiPost<{ email: string; updated: boolean }>(
        `/api/mail/accounts/${encodeURIComponent(email)}/password`,
        { password: newPassword },
      );
      setNotice(`Password updated for ${email}.`);
      setPasswordTarget(null);
      setNewPassword("");
      setShowNewPassword(false);
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [email]: err instanceof Error ? err.message : "Failed to change password",
      }));
    } finally {
      setChangingPassword(false);
    }
  }

  async function onQuotaChange(event: FormEvent<HTMLFormElement>, email: string) {
    event.preventDefault();
    const parsedQuota = parseQuotaInput(newQuota);
    if (parsedQuota === null) {
      setRowErrors((prev) => ({
        ...prev,
        [email]: `Quota must be a whole number of MB between 0 and ${QUOTA_MAX_MB}.`,
      }));
      return;
    }

    clearRowError(email);
    setChangingQuota(true);
    try {
      await apiPost<{ email: string; quotaMb: number; updated: boolean }>(
        `/api/mail/accounts/${encodeURIComponent(email)}/quota`,
        { quotaMb: parsedQuota },
      );
      setNotice(`Quota updated for ${email}.`);
      setQuotaTarget(null);
      refresh();
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [email]: err instanceof Error ? err.message : "Failed to change quota",
      }));
    } finally {
      setChangingQuota(false);
    }
  }

  async function onDelete(email: string) {
    setConfirmEmail(null);
    setNotice(null);
    clearRowError(email);
    setDeletingEmail(email);
    try {
      await apiFetch<{ email: string; deleted: boolean }>(
        `/api/mail/accounts/${encodeURIComponent(email)}`,
        { method: "DELETE" },
      );
      setNotice(`Mailbox ${email} deleted.`);
      refresh();
      onRefresh();
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [email]: err instanceof Error ? err.message : "Delete failed",
      }));
    } finally {
      setDeletingEmail(null);
    }
  }

  const noDomains = domains !== null && domains.length === 0;

  return (
    <Card className={accounts && accounts.length > 0 ? "overflow-hidden" : undefined}>
      <CardHeader>
        <div>
          <CardTitle>Email accounts</CardTitle>
          <CardDescription>Mailboxes hosted on this server, with quotas and disk usage.</CardDescription>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={openCreate}
          disabled={createOpen || domains === null || noDomains}
          title={noDomains || domains === null ? "Add a mail domain first" : undefined}
        >
          <Plus size={14} aria-hidden="true" />
          Create mailbox
        </Button>
      </CardHeader>

      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <Label htmlFor="accounts-filter">Filter</Label>
        <Select
          id="accounts-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="w-56"
        >
          <option value="all">All domains</option>
          {domains?.map((domain) => (
            <option key={domain} value={domain}>
              {domain}
            </option>
          ))}
        </Select>
        {loading ? <Spinner size={14} className="text-slate-400" /> : null}
      </div>

      {createOpen ? (
        <form
          onSubmit={onCreate}
          className="mx-5 mt-4 grid gap-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="account-local">Local part</Label>
              <Input
                id="account-local"
                value={localPart}
                onChange={(event) => setLocalPart(event.target.value)}
                placeholder="info"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={creating}
                className="font-mono"
              />
              <p className="text-xs text-slate-500">
                1-63 lowercase letters, numbers, dots, underscores or hyphens.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account-domain">Domain</Label>
              <Select
                id="account-domain"
                value={createDomain}
                onChange={(event) => setCreateDomain(event.target.value)}
                disabled={creating || noDomains}
              >
                <option value="" disabled>
                  Select a domain…
                </option>
                {domains?.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-slate-500">
                The mailbox address is{" "}
                <span className="font-mono">
                  {localPart.trim() === "" ? "local" : localPart.trim().toLowerCase()}@
                  {createDomain || "domain"}
                </span>
                .
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account-password">Password</Label>
              <div className="relative">
                <Input
                  id="account-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                  autoComplete="new-password"
                  spellCheck={false}
                  disabled={creating}
                  className="pr-9 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={creating}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-2.5 text-slate-500 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff size={14} aria-hidden="true" />
                  ) : (
                    <Eye size={14} aria-hidden="true" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Stored as a Dovecot passwd-file entry ({PASSWORD_MIN_LENGTH}+ characters).
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account-quota">Quota (MB)</Label>
              <Input
                id="account-quota"
                value={quotaMb}
                onChange={(event) => setQuotaMb(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                disabled={creating}
                className="font-mono"
              />
              <p className="text-xs text-slate-500">0 = unlimited.</p>
            </div>
          </div>
          {createError ? <Alert variant="error">{createError}</Alert> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={creating}>
              Create mailbox
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

      {error && accounts === null ? (
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
      ) : accounts === null ? (
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

          {accounts.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={Inbox}
                title={noDomains ? "No mailboxes yet" : "No mailboxes here"}
                description={
                  noDomains
                    ? "Add a mail domain above to get started, then create mailboxes for it."
                    : filter === "all"
                      ? "Create a mailbox to get started."
                      : `No mailboxes under ${filter}.`
                }
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 text-left font-medium">Email</th>
                    <th className="px-5 py-3 text-left font-medium">Quota</th>
                    <th className="px-5 py-3 text-right font-medium">Usage</th>
                    <th className="px-5 py-3 text-left font-medium">Created</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => {
                    const isDeleting = deletingEmail === account.email;
                    const isConfirming = confirmEmail === account.email;
                    const isPasswordEditing = passwordTarget === account.email;
                    const isQuotaEditing = quotaTarget === account.email;
                    const rowError = rowErrors[account.email];
                    return (
                      <Fragment key={account.email}>
                        <tr className="border-t border-slate-800 hover:bg-slate-800/40">
                          <td className="px-5 py-3 font-mono text-sm text-slate-200">
                            {account.email}
                          </td>
                          <td className="px-5 py-3 text-slate-400">
                            {quotaLabel(account.quotaMb)}
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-slate-400">
                            {formatBytes(account.bytes)}
                          </td>
                          <td className="px-5 py-3 text-slate-400">
                            {shortDateTime(account.createdAt)}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {isDeleting ? (
                                <span className="flex items-center gap-2 text-xs text-slate-400">
                                  <Spinner size={14} className="text-slate-400" />
                                  deleting…
                                </span>
                              ) : isConfirming ? (
                                <>
                                  <span className="text-xs text-slate-400">Delete mailbox?</span>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => void onDelete(account.email)}
                                  >
                                    Confirm
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setConfirmEmail(null)}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => openPasswordEditor(account)}
                                  >
                                    <KeyRound size={14} aria-hidden="true" />
                                    Change password
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => openQuotaEditor(account)}
                                  >
                                    <AtSign size={14} aria-hidden="true" />
                                    Change quota
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-slate-400 hover:text-red-400"
                                    onClick={() => setConfirmEmail(account.email)}
                                    aria-label={`Delete ${account.email}`}
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

                        {isPasswordEditing ? (
                          <tr className="border-t border-slate-800 bg-slate-950/40">
                            <td colSpan={5} className="px-5 py-3">
                              <form
                                onSubmit={(event) => void onPasswordChange(event, account.email)}
                                className="flex flex-wrap items-end gap-3"
                              >
                                <div className="grid gap-1.5">
                                  <Label htmlFor={`password-${account.email}`}>
                                    New password for{" "}
                                    <span className="font-mono text-slate-300">
                                      {account.email}
                                    </span>
                                  </Label>
                                  <div className="relative">
                                    <Input
                                      id={`password-${account.email}`}
                                      type={showNewPassword ? "text" : "password"}
                                      value={newPassword}
                                      onChange={(event) => setNewPassword(event.target.value)}
                                      placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                                      autoComplete="new-password"
                                      spellCheck={false}
                                      autoFocus
                                      disabled={changingPassword}
                                      className="w-72 pr-9 font-mono"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowNewPassword((value) => !value)}
                                      disabled={changingPassword}
                                      aria-label={
                                        showNewPassword ? "Hide password" : "Show password"
                                      }
                                      title={showNewPassword ? "Hide password" : "Show password"}
                                      className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-2.5 text-slate-500 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {showNewPassword ? (
                                        <EyeOff size={14} aria-hidden="true" />
                                      ) : (
                                        <Eye size={14} aria-hidden="true" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                                <Button type="submit" size="sm" loading={changingPassword}>
                                  Save password
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setPasswordTarget(null);
                                    setNewPassword("");
                                  }}
                                  disabled={changingPassword}
                                >
                                  Cancel
                                </Button>
                              </form>
                            </td>
                          </tr>
                        ) : null}

                        {isQuotaEditing ? (
                          <tr className="border-t border-slate-800 bg-slate-950/40">
                            <td colSpan={5} className="px-5 py-3">
                              <form
                                onSubmit={(event) => void onQuotaChange(event, account.email)}
                                className="flex flex-wrap items-end gap-3"
                              >
                                <div className="grid gap-1.5">
                                  <Label htmlFor={`quota-${account.email}`}>
                                    New quota (MB) for{" "}
                                    <span className="font-mono text-slate-300">
                                      {account.email}
                                    </span>
                                  </Label>
                                  <Input
                                    id={`quota-${account.email}`}
                                    value={newQuota}
                                    onChange={(event) => setNewQuota(event.target.value)}
                                    inputMode="numeric"
                                    autoComplete="off"
                                    autoFocus
                                    disabled={changingQuota}
                                    className="w-40 font-mono"
                                  />
                                  <p className="text-xs text-slate-500">
                                    0 = unlimited, up to {QUOTA_MAX_MB.toLocaleString()} MB.
                                  </p>
                                </div>
                                <Button type="submit" size="sm" loading={changingQuota}>
                                  Save quota
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setQuotaTarget(null)}
                                  disabled={changingQuota}
                                >
                                  Cancel
                                </Button>
                              </form>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
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
