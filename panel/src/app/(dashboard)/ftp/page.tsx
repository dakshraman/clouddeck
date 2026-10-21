"use client";

import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  FtpAccount,
  FtpAccountsResponse,
  FtpStatusResponse,
  Site,
  SiteListResponse,
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
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CloudUpload, Eye, EyeOff, FileText, KeyRound, Plus, Trash2, User, Wand2 } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

// Frozen by docs/api.md section 1.9 — mirror these hints in the UI.
const FTP_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@-]{1,32}$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_LENGTH = 16;
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+";

/** Mirrors the agent's webroot path rule for the optional subdirectory. */
function isValidSubdir(value: string): boolean {
  if (value === "") return true;
  if (value.length > 1024 || value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    return false;
  }
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** Browser-side random password; the server hashes it into the passwd file. */
function generatePassword(): string {
  const values = new Uint32Array(PASSWORD_LENGTH);
  window.crypto.getRandomValues(values);
  let password = "";
  for (const value of values) {
    password += PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length];
  }
  return password;
}

function accountPath(account: FtpAccount): string {
  if (!account.site) return account.home;
  return account.subdir ? `${account.site}/${account.subdir}` : account.site;
}

export default function FtpPage() {
  const [status, setStatus] = useState<FtpStatusResponse | null>(null);
  const [accounts, setAccounts] = useState<FtpAccount[] | null>(null);
  const [sites, setSites] = useState<Site[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSite, setCreateSite] = useState("");
  const [createSubdir, setCreateSubdir] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [passwordTarget, setPasswordTarget] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setState("loading");
    setErrorMessage(null);

    const [statusResult, accountsResult, sitesResult] = await Promise.allSettled([
      apiFetch<FtpStatusResponse>("/api/ftp/status"),
      apiFetch<FtpAccountsResponse>("/api/ftp/accounts"),
      apiFetch<SiteListResponse>("/api/sites"),
    ]);

    if (statusResult.status === "rejected") {
      setState("error");
      setErrorMessage(
        statusResult.reason instanceof Error
          ? statusResult.reason.message
          : "Cannot reach the CloudDeck agent",
      );
      return;
    }

    setStatus(statusResult.value);

    if (accountsResult.status === "fulfilled") {
      setAccounts(accountsResult.value.accounts);
      setAccountsError(null);
    } else {
      setAccountsError(
        accountsResult.reason instanceof Error
          ? accountsResult.reason.message
          : "Failed to load FTP accounts",
      );
    }

    if (sitesResult.status === "fulfilled") {
      setSites(sitesResult.value.sites);
      setSitesError(null);
    } else {
      setSitesError(
        sitesResult.reason instanceof Error ? sitesResult.reason.message : "Failed to load sites",
      );
    }

    setState("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  // Default the create form's site to the first listed site.
  useEffect(() => {
    if (sites && sites.length > 0 && !sites.some((site) => site.domain === createSite)) {
      setCreateSite(sites[0].domain);
    }
  }, [sites, createSite]);

  function clearRowError(name: string) {
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function openCreate() {
    setCreateOpen(true);
    setCreateError(null);
    setNotice(null);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateError(null);
    setCreateName("");
    setCreatePassword("");
    setCreateSubdir("");
    setShowCreatePassword(false);
  }

  function onGeneratePassword() {
    setCreatePassword(generatePassword());
    setShowCreatePassword(true);
  }

  function openPasswordEditor(account: FtpAccount) {
    setPasswordTarget(account.name);
    setNewPassword("");
    setShowNewPassword(false);
    setNotice(null);
    clearRowError(account.name);
  }

  function closePasswordEditor() {
    setPasswordTarget(null);
    setNewPassword("");
    setShowNewPassword(false);
  }

  const noSites = sites !== null && sites.length === 0;

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createSite) {
      setCreateError("Select a site for the FTP account.");
      return;
    }
    const subdir = createSubdir.trim();
    if (!isValidSubdir(subdir)) {
      setCreateError("Subdirectory must be a relative path without '.' or '..' segments.");
      return;
    }
    const name = createName.trim();
    if (!FTP_NAME_PATTERN.test(name)) {
      setCreateError(
        "Enter a login name of 2-33 letters, numbers or . _ @ - (starting with a letter or number).",
      );
      return;
    }
    if (createPassword.length < PASSWORD_MIN_LENGTH) {
      setCreateError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }

    setCreating(true);
    setCreateError(null);
    setNotice(null);
    try {
      const data = await apiPost<FtpAccountsResponse>("/api/ftp/accounts", {
        site: createSite,
        subdir: subdir === "" ? undefined : subdir,
        name,
        password: createPassword,
      });
      // The create endpoint returns the full list — use it to refresh.
      setAccounts(data.accounts);
      setAccountsError(null);
      setStatus((prev) => (prev ? { ...prev, accounts: data.accounts.length } : prev));
      setNotice(`FTP account ${name} created.`);
      setCreateOpen(false);
      setCreateName("");
      setCreatePassword("");
      setCreateSubdir("");
      setShowCreatePassword(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create the FTP account");
    } finally {
      setCreating(false);
    }
  }

  async function onPasswordChange(event: FormEvent<HTMLFormElement>, name: string) {
    event.preventDefault();
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setRowErrors((prev) => ({
        ...prev,
        [name]: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      }));
      return;
    }

    clearRowError(name);
    setChangingPassword(true);
    try {
      await apiPost<unknown>(`/api/ftp/accounts/${encodeURIComponent(name)}/password`, {
        password: newPassword,
      });
      setNotice(`Password updated for ${name}.`);
      closePasswordEditor();
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [name]: err instanceof Error ? err.message : "Failed to change the password",
      }));
    } finally {
      setChangingPassword(false);
    }
  }

  async function onDelete(name: string) {
    setConfirmName(null);
    setNotice(null);
    clearRowError(name);
    setDeletingName(name);
    try {
      const data = await apiFetch<FtpAccountsResponse>(
        `/api/ftp/accounts/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      setAccounts(data.accounts);
      setAccountsError(null);
      setStatus((prev) => (prev ? { ...prev, accounts: data.accounts.length } : prev));
      setNotice(`FTP account ${name} deleted. Its home directory was kept.`);
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [name]: err instanceof Error ? err.message : "Delete failed",
      }));
    } finally {
      setDeletingName(null);
    }
  }

  return (
    <>
      <PageHeader
        title="FTP"
        description="Virtual FTP logins backed by pure-ftpd, jailed to a site webroot."
      />

      {state === "error" ? (
        <Alert variant="error" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage ?? "Cannot reach the CloudDeck agent"}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {state === "loading" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : null}

      {state === "ready" && status ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Passwd file
                </p>
                <FileText size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
              <p
                className="mt-3 truncate font-mono text-lg font-semibold text-foreground"
                title={status.passwdFile}
              >
                {status.passwdFile || "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">pure-ftpd passwd database</p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Run as</p>
                <User size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
              <p
                className="mt-3 truncate font-mono text-lg font-semibold text-foreground"
                title={status.runAs}
              >
                {status.runAs || "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">owner of FTP home directories</p>
            </Card>

            <StatCard
              label="FTP accounts"
              value={String(status.accounts)}
              sub="virtual logins"
              icon={KeyRound}
            />
          </div>

          <div className="mt-6">
            <Card className={accounts && accounts.length > 0 ? "overflow-hidden" : undefined}>
              <CardHeader>
                <div>
                  <CardTitle>FTP accounts</CardTitle>
                  <CardDescription>
                    Each login is locked to a site webroot (optionally a subfolder) and stored in
                    the pure-ftpd passwd file.
                  </CardDescription>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openCreate}
                  disabled={createOpen || sites === null || noSites}
                  title={
                    noSites
                      ? "A site is required before creating logins"
                      : sites === null
                        ? "Sites are still loading"
                        : undefined
                  }
                >
                  <Plus size={14} aria-hidden="true" />
                  Create account
                </Button>
              </CardHeader>

              {createOpen ? (
                <form
                  onSubmit={onCreate}
                  className="mx-5 mt-4 grid gap-4 rounded-lg border border-border bg-background/40 p-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="ftp-site">Site</Label>
                      <Select
                        id="ftp-site"
                        value={createSite}
                        onChange={(event) => setCreateSite(event.target.value)}
                        disabled={creating || noSites}
                      >
                        <option value="" disabled>
                          Select a site…
                        </option>
                        {sites?.map((site) => (
                          <option key={site.domain} value={site.domain}>
                            {site.domain}
                          </option>
                        ))}
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        The login is jailed to this site&apos;s webroot.
                      </p>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ftp-subdir">Subdirectory (optional)</Label>
                      <Input
                        id="ftp-subdir"
                        value={createSubdir}
                        onChange={(event) => setCreateSubdir(event.target.value)}
                        placeholder="uploads"
                        autoComplete="off"
                        spellCheck={false}
                        disabled={creating}
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Folder inside the webroot; empty means the site root.
                      </p>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ftp-name">Login name</Label>
                      <Input
                        id="ftp-name"
                        value={createName}
                        onChange={(event) => setCreateName(event.target.value)}
                        placeholder="deploy"
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus
                        disabled={creating}
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        2-33 letters, numbers and . _ @ - (starts with a letter or number).
                      </p>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ftp-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="ftp-password"
                          type={showCreatePassword ? "text" : "password"}
                          value={createPassword}
                          onChange={(event) => setCreatePassword(event.target.value)}
                          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                          autoComplete="new-password"
                          spellCheck={false}
                          disabled={creating}
                          className="pr-16 font-mono"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-1">
                          <button
                            type="button"
                            onClick={onGeneratePassword}
                            disabled={creating}
                            aria-label="Generate password"
                            title="Generate password"
                            className="flex cursor-pointer items-center px-2 py-1 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Wand2 size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCreatePassword((value) => !value)}
                            disabled={creating}
                            aria-label={showCreatePassword ? "Hide password" : "Show password"}
                            title={showCreatePassword ? "Hide password" : "Show password"}
                            className="flex cursor-pointer items-center px-2 py-1 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {showCreatePassword ? (
                              <EyeOff size={14} aria-hidden="true" />
                            ) : (
                              <Eye size={14} aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Stored as a SHA-512 crypt hash ({PASSWORD_MIN_LENGTH}+ characters); use the
                        wand for a random password.
                      </p>
                    </div>
                  </div>
                  {sitesError ? (
                    <p className="flex flex-wrap items-center gap-2 text-xs text-red-400">
                      {sitesError}
                      <button
                        type="button"
                        onClick={() => void load({ silent: true })}
                        className="cursor-pointer text-brand underline-offset-2 hover:underline"
                      >
                        Retry
                      </button>
                    </p>
                  ) : noSites ? (
                    <p className="text-xs text-muted-foreground">
                      No sites exist yet — create a site first.
                    </p>
                  ) : null}
                  {createError ? <Alert variant="error">{createError}</Alert> : null}
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm" loading={creating}>
                      Create account
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={closeCreate}
                      disabled={creating}
                    >
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

              {accountsError && accounts === null ? (
                <CardBody>
                  <Alert variant="error">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>{accountsError}</span>
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
              ) : accounts.length === 0 ? (
                <CardBody>
                  <EmptyState
                    icon={CloudUpload}
                    title="No FTP accounts"
                    description="Create a login to move files over FTP, jailed to a site webroot."
                  />
                </CardBody>
              ) : (
                <>
                  {accountsError ? (
                    <div className="px-5 pt-4">
                      <Alert variant="error">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span>{accountsError}</span>
                          <Button variant="secondary" size="sm" onClick={refresh}>
                            Retry
                          </Button>
                        </div>
                      </Alert>
                    </div>
                  ) : null}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-5 py-3 text-left font-medium">Login</th>
                          <th className="px-5 py-3 text-left font-medium">Site</th>
                          <th className="px-5 py-3 text-left font-medium">Path</th>
                          <th className="px-5 py-3 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accounts.map((account) => {
                          const isDeleting = deletingName === account.name;
                          const isConfirming = confirmName === account.name;
                          const isPasswordEditing = passwordTarget === account.name;
                          const rowError = rowErrors[account.name];
                          return (
                            <Fragment key={account.name}>
                              <tr className="border-t border-border hover:bg-muted/40">
                                <td className="px-5 py-3 font-mono text-sm text-foreground">
                                  {account.name}
                                </td>
                                <td className="px-5 py-3 text-muted-foreground">
                                  {account.site ?? "—"}
                                </td>
                                <td
                                  className="px-5 py-3 font-mono text-xs text-muted-foreground"
                                  title={account.home}
                                >
                                  {accountPath(account)}
                                </td>
                                <td className="px-5 py-3">
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    {isDeleting ? (
                                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Spinner size={14} className="text-muted-foreground" />
                                        deleting…
                                      </span>
                                    ) : isConfirming ? (
                                      <>
                                        <span className="text-xs text-muted-foreground">
                                          Delete login? The home directory is kept.
                                        </span>
                                        <Button
                                          variant="danger"
                                          size="sm"
                                          onClick={() => void onDelete(account.name)}
                                        >
                                          Confirm
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setConfirmName(null)}
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
                                          variant="ghost"
                                          size="sm"
                                          className="text-muted-foreground hover:text-red-400"
                                          onClick={() => setConfirmName(account.name)}
                                          aria-label={`Delete ${account.name}`}
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
                                <tr className="border-t border-border bg-background/40">
                                  <td colSpan={4} className="px-5 py-3">
                                    <form
                                      onSubmit={(event) =>
                                        void onPasswordChange(event, account.name)
                                      }
                                      className="flex flex-wrap items-end gap-3"
                                    >
                                      <div className="grid gap-1.5">
                                        <Label htmlFor={`ftp-password-${account.name}`}>
                                          New password for{" "}
                                          <span className="font-mono text-foreground/80">
                                            {account.name}
                                          </span>
                                        </Label>
                                        <div className="relative">
                                          <Input
                                            id={`ftp-password-${account.name}`}
                                            type={showNewPassword ? "text" : "password"}
                                            value={newPassword}
                                            onChange={(event) =>
                                              setNewPassword(event.target.value)
                                            }
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
                                            title={
                                              showNewPassword ? "Hide password" : "Show password"
                                            }
                                            className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-2.5 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
                                        onClick={closePasswordEditor}
                                        disabled={changingPassword}
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
                </>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
