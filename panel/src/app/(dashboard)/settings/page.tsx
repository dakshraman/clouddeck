"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  LogOut,
  Palette,
  RefreshCw,
  Server,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { SystemInfo } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { formatBytes, relativeTime, shortDateTime } from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { usePreferences } from "@/components/preferences";
import { ThemePicker } from "@/components/theme-picker";
import { Alert, type AlertVariant } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface Profile {
  username: string;
  email: string | null;
  createdAt: string;
}

interface MeResponse {
  user: Profile;
  session: {
    ttlDays: number;
    cookieSecure: boolean;
  };
}

interface PanelInfo {
  version: string;
  agentUrl: string;
  cookieSecure: boolean;
  sessionTtlDays: number;
  nodeVersion: string;
}

interface LatestRelease {
  version: string;
  url: string;
  publishedAt: string | null;
}

interface UpdatesResponse {
  panelVersion: string;
  latest: LatestRelease | null;
  checkedAt: string | null;
  error: string | null;
}

interface Notice {
  variant: AlertVariant;
  text: string;
}

const INSTALL_COMMAND =
  "curl -fsSL https://github.com/dakshraman/clouddeck/releases/latest/download/install.sh | sudo bash";

const sections = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "server", label: "Server", icon: Server },
  { id: "updates", label: "Updates", icon: ArrowUpCircle },
] as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function formatUptime(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function versionParts(version: string): number[] {
  return version
    .replace(/^v/, "")
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isNewer(candidate: string, current: string): boolean {
  const next = versionParts(candidate);
  const installed = versionParts(current);
  for (let index = 0; index < 3; index += 1) {
    if ((next[index] ?? 0) !== (installed[index] ?? 0)) {
      return (next[index] ?? 0) > (installed[index] ?? 0);
    }
  }
  return false;
}

function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card>
        <CardHeader>
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
              <Icon size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </CardHeader>
        <CardBody>{children}</CardBody>
      </Card>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm text-foreground">{children}</dd>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { reduceMotion, setReduceMotion } = usePreferences();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [panel, setPanel] = useState<PanelInfo | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [updates, setUpdates] = useState<UpdatesResponse | null>(null);

  const [accountLoading, setAccountLoading] = useState(true);
  const [systemLoading, setSystemLoading] = useState(true);
  const [systemRefreshing, setSystemRefreshing] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [updatesFetchError, setUpdatesFetchError] = useState<string | null>(null);
  const [updatesLoading, setUpdatesLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailNotice, setEmailNotice] = useState<Notice | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice | null>(null);

  const [signingOut, setSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadUpdates = useCallback(async (refresh: boolean) => {
    setUpdatesLoading(true);
    setUpdatesFetchError(null);
    try {
      const result = await apiFetch<UpdatesResponse>(`/api/updates${refresh ? "?refresh=1" : ""}`);
      setUpdates(result);
    } catch (err) {
      setUpdatesFetchError(errorMessage(err, "Could not check for updates."));
    } finally {
      setUpdatesLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    apiFetch<MeResponse>("/api/auth/me")
      .then((result) => {
        if (cancelled) return;
        setMe(result);
        setEmail(result.user.email ?? "");
      })
      .catch((err) => {
        if (!cancelled) setAccountError(errorMessage(err, "Failed to load your account."));
      })
      .finally(() => {
        if (!cancelled) setAccountLoading(false);
      });

    apiFetch<PanelInfo>("/api/panel")
      .then((result) => {
        if (!cancelled) setPanel(result);
      })
      .catch((err) => {
        if (!cancelled) setPanelError(errorMessage(err, "Failed to load panel details."));
      });

    apiFetch<SystemInfo>("/api/system")
      .then((result) => {
        if (cancelled) return;
        setSystem(result);
        setSystemError(null);
      })
      .catch((err) => {
        if (!cancelled) setSystemError(errorMessage(err, "Cannot reach the CloudDeck agent."));
      })
      .finally(() => {
        if (!cancelled) setSystemLoading(false);
      });

    void loadUpdates(false);

    return () => {
      cancelled = true;
    };
  }, [loadUpdates]);

  async function refreshSystem() {
    if (systemRefreshing) return;
    setSystemRefreshing(true);
    try {
      setSystem(await apiFetch<SystemInfo>("/api/system"));
      setSystemError(null);
    } catch (err) {
      setSystemError(errorMessage(err, "Cannot reach the CloudDeck agent."));
    } finally {
      setSystemRefreshing(false);
    }
  }

  async function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me || emailSaving) return;
    setEmailSaving(true);
    setEmailNotice(null);
    try {
      const result = await apiFetch<MeResponse>("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setMe(result);
      setEmail(result.user.email ?? "");
      setEmailNotice({
        variant: "success",
        text: result.user.email ? "Contact email saved." : "Contact email cleared.",
      });
    } catch (err) {
      setEmailNotice({
        variant: "error",
        text: errorMessage(err, "Could not save the contact email."),
      });
    } finally {
      setEmailSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordSaving) return;
    setPasswordNotice(null);

    if (newPassword.length < 8) {
      setPasswordNotice({ variant: "error", text: "The new password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ variant: "error", text: "The new passwords do not match." });
      return;
    }

    setPasswordSaving(true);
    try {
      await apiFetch<MeResponse>("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice({
        variant: "success",
        text: "Password changed. Use the new password the next time you sign in.",
      });
    } catch (err) {
      setPasswordNotice({
        variant: "error",
        text: errorMessage(err, "Could not change the password."),
      });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Sign out locally even if the request fails.
    }
    router.push("/login");
    router.refresh();
  }

  async function copyInstallCommand() {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const emailDirty = me ? email.trim() !== (me.user.email ?? "") : false;
  const panelVersion = panel?.version ?? updates?.panelVersion ?? null;
  const updateError = updates?.error ?? updatesFetchError;
  const updateAvailable = Boolean(
    updates?.latest && panelVersion && isNewer(updates.latest.version, panelVersion),
  );
  const runningAhead = Boolean(
    updates?.latest && panelVersion && isNewer(panelVersion, updates.latest.version),
  );

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your account, security, appearance and this server."
      />

      <div className="grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {sections.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon size={14} aria-hidden="true" />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          <SectionCard
            id="account"
            icon={UserRound}
            title="Account"
            description="The identity used to sign in to this panel."
          >
            {accountLoading ? (
              <div className="grid gap-3">
                <Skeleton className="h-11 w-64" />
                <Skeleton className="h-9 w-full max-w-md" />
              </div>
            ) : accountError ? (
              <Alert variant="error">{accountError}</Alert>
            ) : me ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold uppercase text-foreground/90">
                    {me.user.username.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {me.user.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Panel administrator · member since {formatDate(me.user.createdAt)}
                    </p>
                  </div>
                  <Badge variant="indigo" className="ml-auto">
                    Administrator
                  </Badge>
                </div>

                <div className="h-px bg-border" />

                <form onSubmit={saveEmail} className="space-y-2">
                  <div>
                    <Label htmlFor="settings-email">Contact email</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Used for account notices. It is never shown on hosted sites.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="settings-email"
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setEmailNotice(null);
                      }}
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="sm:max-w-sm"
                    />
                    <Button type="submit" loading={emailSaving} disabled={!emailDirty}>
                      Save email
                    </Button>
                  </div>
                  {emailNotice ? (
                    <Alert variant={emailNotice.variant}>{emailNotice.text}</Alert>
                  ) : null}
                </form>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            id="security"
            icon={ShieldCheck}
            title="Security"
            description="Password and session policy for this panel."
          >
            <form onSubmit={changePassword} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => {
                      setCurrentPassword(event.target.value);
                      setPasswordNotice(null);
                    }}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      setPasswordNotice(null);
                    }}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      setPasswordNotice(null);
                    }}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  loading={passwordSaving}
                  disabled={!currentPassword || !newPassword || !confirmPassword}
                >
                  <KeyRound size={14} aria-hidden="true" />
                  Change password
                </Button>
                <p className="text-xs text-muted-foreground">
                  At least 8 characters. Your current session stays signed in.
                </p>
              </div>
              {passwordNotice ? (
                <Alert variant={passwordNotice.variant}>{passwordNotice.text}</Alert>
              ) : null}
            </form>

            <div className="my-5 h-px bg-border" />

            <dl className="grid gap-4 sm:grid-cols-3">
              <Fact label="Session length">
                {me ? `${me.session.ttlDays} days` : "—"}
              </Fact>
              <Fact label="Session cookie">
                {me?.session.cookieSecure ? (
                  <Badge variant="green">Secure</Badge>
                ) : (
                  <Badge variant="amber">Not secure</Badge>
                )}
              </Fact>
              <Fact label="Sign-in protection">bcrypt + signed session</Fact>
            </dl>

            {me && !me.session.cookieSecure ? (
              <Alert variant="info" className="mt-4">
                This panel is served over plain HTTP. Set{" "}
                <code className="font-mono">PANEL_COOKIE_SECURE=true</code> after enabling HTTPS to
                mark the session cookie secure.
              </Alert>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">Sign out of this panel</p>
                <p className="text-xs text-muted-foreground">
                  The session cookie is cleared on this browser.
                </p>
              </div>
              <Button variant="outline" onClick={() => void signOut()} loading={signingOut}>
                <LogOut size={14} aria-hidden="true" />
                Sign out
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            id="appearance"
            icon={Palette}
            title="Appearance"
            description="How the panel looks and moves on this browser."
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Theme</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pick a palette. Changes apply instantly across the panel.
                </p>
              </div>
              <ThemePicker />
            </div>
            <div className="my-5 h-px bg-border" />
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Reduce motion</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Disable page transitions and decorative animation. When off, CloudDeck follows
                  your system&apos;s reduced-motion setting.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={reduceMotion}
                aria-label="Reduce motion"
                onClick={() => setReduceMotion(!reduceMotion)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  reduceMotion ? "border-primary bg-primary" : "border-border bg-muted",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    reduceMotion ? "translate-x-6" : "translate-x-1",
                  )}
                />
              </button>
            </div>
            <div className="mt-4 rounded-lg border border-border bg-background/40 px-4 py-3 text-xs text-muted-foreground">
              Theme and motion preferences are stored in this browser only. They do not change the
              panel for other administrators.
            </div>
          </SectionCard>

          <SectionCard
            id="server"
            icon={Server}
            title="Server & agent"
            description="The machine and privileged service behind this panel."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshSystem()}
                loading={systemRefreshing}
              >
                <RefreshCw size={13} aria-hidden="true" />
                Refresh
              </Button>
            }
          >
            {systemLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-10" />
                ))}
              </div>
            ) : systemError ? (
              <Alert variant="error">{systemError}</Alert>
            ) : system ? (
              <>
                <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Fact label="Hostname">{system.hostname}</Fact>
                  <Fact label="Operating system">{system.os}</Fact>
                  <Fact label="Kernel">{system.kernel ?? "—"}</Fact>
                  <Fact label="Uptime">{formatUptime(system.uptimeSeconds)}</Fact>
                  <Fact label="CPU">
                    {system.cpu.cores} cores · {system.cpu.usagePercent.toFixed(0)}% used
                  </Fact>
                  <Fact label="Memory">
                    {formatBytes(system.memory.usedBytes)} / {formatBytes(system.memory.totalBytes)}
                  </Fact>
                  <Fact label="Disk">
                    {formatBytes(system.disk.usedBytes)} / {formatBytes(system.disk.totalBytes)} ·{" "}
                    {system.disk.mount}
                  </Fact>
                  <Fact label="Agent">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant="green">Online</Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {system.agentVersion ? `v${system.agentVersion}` : "unknown"}
                      </span>
                      {system.dryRun ? <Badge variant="amber">Dry run</Badge> : null}
                    </span>
                  </Fact>
                  <Fact label="Agent time">
                    {system.agentTime ? shortDateTime(system.agentTime) : "—"}
                  </Fact>
                </dl>

                <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                  <Fact label="Agent endpoint">
                    <span className="font-mono text-xs">{panel?.agentUrl ?? "—"}</span>
                  </Fact>
                  <Fact label="Panel runtime">
                    {panel ? `CloudDeck v${panel.version} · Node ${panel.nodeVersion}` : "—"}
                  </Fact>
                </div>

                {panelError ? (
                  <Alert variant="warning" className="mt-4">
                    {panelError}
                  </Alert>
                ) : null}
              </>
            ) : null}
          </SectionCard>

          <SectionCard
            id="updates"
            icon={ArrowUpCircle}
            title="Updates"
            description="Release status for this panel and the CloudDeck agent."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadUpdates(true)}
                loading={updatesLoading}
              >
                <RefreshCw size={13} aria-hidden="true" />
                Check now
              </Button>
            }
          >
            <dl className="grid gap-4 sm:grid-cols-3">
              <Fact label="Panel version">{panelVersion ? `v${panelVersion}` : "—"}</Fact>
              <Fact label="Agent version">
                {system?.agentVersion ? `v${system.agentVersion}` : "—"}
              </Fact>
              <Fact label="Latest release">
                {updates?.latest
                  ? `v${updates.latest.version}`
                  : updatesLoading
                    ? "Checking…"
                    : "—"}
              </Fact>
            </dl>

            <div className="mt-4">
              {updateError ? (
                <Alert variant="warning">
                  Could not check GitHub for the latest release ({updateError}). The server may be
                  offline or GitHub unreachable.
                </Alert>
              ) : !updates ? (
                <Skeleton className="h-10 w-full" />
              ) : updateAvailable && updates.latest ? (
                <Alert variant="info">
                  CloudDeck v{updates.latest.version} is available. You are running v
                  {panelVersion}.
                </Alert>
              ) : runningAhead && updates.latest ? (
                <Alert variant="success">
                  You are running a newer build (v{panelVersion}) than the latest published
                  release (v{updates.latest.version}).
                </Alert>
              ) : updates.latest ? (
                <Alert variant="success">You are running the latest CloudDeck release.</Alert>
              ) : (
                <Alert variant="info">No published release was found.</Alert>
              )}
            </div>

            <div className="mt-5 rounded-lg border border-border bg-background/50">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Update from the server shell
                </p>
                <Button variant="ghost" size="sm" onClick={() => void copyInstallCommand()}>
                  {copied ? (
                    <CheckCircle2 size={13} aria-hidden="true" />
                  ) : (
                    <Copy size={13} aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <code className="block overflow-x-auto px-4 py-3 font-mono text-xs text-foreground/90">
                {INSTALL_COMMAND}
              </code>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {updates?.checkedAt
                  ? `Last checked ${relativeTime(updates.checkedAt)}`
                  : "Not checked yet"}
              </span>
              {updates?.latest ? (
                <a
                  href={updates.latest.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  Release notes
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
