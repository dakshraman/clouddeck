"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppInfo, AppsResponse, InstalledAppInfo, Site, Task } from "@/lib/types";
import { apiFetch, apiPost, HttpError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { TaskLog } from "@/components/task-log";
import { SubdomainsCard } from "@/components/site/subdomains-card";
import { RedirectsCard } from "@/components/site/redirects-card";
import { CronCard } from "@/components/site/cron-card";
import { PhpCard } from "@/components/site/php-card";
import { SecurityCard } from "@/components/site/security-card";
import { WafCard } from "@/components/site/waf-card";
import { SiteAppCard } from "@/components/site/app-card";
import { InstalledAppCard } from "@/components/site/installed-app-card";
import { InstallAppCard } from "@/components/site/install-app-card";
import { GitCard } from "@/components/site/git-card";
import { UsageCard } from "@/components/site/usage-card";
import { StatsCard } from "@/components/site/stats-card";
import { LogsCard } from "@/components/site/logs-card";
import { DnsMailCard } from "@/components/site/dns-mail-card";
import { TunnelCard } from "@/components/site/tunnel-card";
import { SiteDoctorCard } from "@/components/site/site-doctor-card";
import { FastCgiCacheCard } from "@/components/site/fastcgi-cache-card";
import { WordPressCard } from "@/components/site/wordpress-card";
import { StaticSpaCard } from "@/components/site/static-spa-card";
import { TrafficAnalyticsCard } from "@/components/site/traffic-analytics-card";
import { WildcardSslModal } from "@/components/site/wildcard-ssl-modal";
import { cn } from "@/components/ui/cn";
import { phpVersionLabel, shortDateTime, siteStatusVariant, titleCase } from "@/components/format";
import { ArrowLeft, ExternalLink, Eye, FolderOpen, Globe, HelpCircle, ShieldCheck, Trash2 } from "lucide-react";

function isCustomDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  const testTlds = [".ss", ".local", ".test", ".internal", ".lan", ".home", ".corp", ".invalid", ".localhost", ".example"];
  if (testTlds.some((tld) => lower.endsWith(tld))) return true;
  const parts = lower.split(".");
  if (parts.length < 2) return true;
  const tld = parts[parts.length - 1];
  return tld.length <= 1 || /^\d+$/.test(tld);
}

type LoadState = "loading" | "ready" | "notfound" | "error";

type SiteTabId =
  | "overview"
  | "wordpress"
  | "subdomains"
  | "redirects"
  | "cron"
  | "php"
  | "apps"
  | "static"
  | "git"
  | "security"
  | "usage"
  | "logs";

const SITE_TABS: { id: SiteTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "wordpress", label: "WordPress" },
  { id: "subdomains", label: "Subdomains" },
  { id: "redirects", label: "Redirects" },
  { id: "cron", label: "Cron jobs" },
  { id: "php", label: "PHP" },
  { id: "apps", label: "Applications" },
  { id: "static", label: "Static & SPA" },
  { id: "git", label: "Git & CI/CD" },
  { id: "security", label: "Security" },
  { id: "usage", label: "Usage & stats" },
  { id: "logs", label: "Logs" },
];

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Renders only the active tab; inactive panels stay unmounted. */
function TabPanel({ id, active, children }: { id: SiteTabId; active: boolean; children: ReactNode }) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`site-tabpanel-${id}`}
      aria-labelledby={`site-tab-${id}`}
      className="grid gap-6"
    >
      {children}
    </div>
  );
}

export function SiteDetail({
  domain,
  initialTab = "overview",
  autoOpenWildcardSsl = false,
}: {
  domain: string;
  initialTab?: SiteTabId;
  autoOpenWildcardSsl?: boolean;
}) {
  const router = useRouter();
  const [site, setSite] = useState<Site | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [sslEmail, setSslEmail] = useState("");
  const [sslError, setSslError] = useState<string | null>(null);
  const [sslSubmitting, setSslSubmitting] = useState(false);
  const [sslTaskId, setSslTaskId] = useState<string | null>(null);
  const [showWildcardModal, setShowWildcardModal] = useState(autoOpenWildcardSsl);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [tab, setTab] = useState<SiteTabId>(initialTab);
  const [appsRefreshTrigger, setAppsRefreshTrigger] = useState(0);
  const [installedApp, setInstalledApp] = useState<InstalledAppInfo | null>(null);
  const [siteApps, setSiteApps] = useState<AppInfo[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchTab = new URLSearchParams(window.location.search).get("tab") as SiteTabId | null;
      if (searchTab && SITE_TABS.some((t) => t.id === searchTab)) {
        setTab(searchTab);
      }
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const [siteData, appInfoData, appsData] = await Promise.allSettled([
        apiFetch<Site>(`/api/sites/${encodeURIComponent(domain)}`),
        apiFetch<InstalledAppInfo>(`/api/sites/${encodeURIComponent(domain)}/installed-app`),
        apiFetch<AppsResponse>("/api/apps"),
      ]);

      if (siteData.status === "fulfilled") {
        setSite(siteData.value);
        setState("ready");
        setErrorMessage(null);
      } else {
        const error = siteData.reason;
        if (error instanceof HttpError && error.status === 404) {
          setState("notfound");
          return;
        }
        setState("error");
        setErrorMessage(error instanceof Error ? error.message : "Failed to load site");
        return;
      }

      if (appInfoData.status === "fulfilled") {
        setInstalledApp(appInfoData.value);
      } else {
        setInstalledApp(null);
      }

      if (appsData.status === "fulfilled") {
        setSiteApps(appsData.value.apps.filter((a) => a.site === domain));
      } else {
        setSiteApps([]);
      }
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to load site");
    }
  }, [domain]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onIssueSsl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = sslEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSslError("Enter a valid email address for the certificate authority.");
      return;
    }
    setSslSubmitting(true);
    setSslError(null);
    try {
      const data = await apiPost<{ taskId: string }>(
        `/api/sites/${encodeURIComponent(domain)}/ssl`,
        { email },
      );
      setSslTaskId(data.taskId);
    } catch (error) {
      setSslError(error instanceof Error ? error.message : "Failed to request the certificate");
    } finally {
      setSslSubmitting(false);
    }
  }

  function onSslTaskDone(task: Task) {
    if (task.status === "succeeded") void load();
  }

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const data = await apiFetch<{ taskId: string }>(
        `/api/sites/${encodeURIComponent(domain)}`,
        { method: "DELETE" },
      );
      setConfirmDelete(false);
      setDeleteTaskId(data.taskId);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete the site");
    } finally {
      setDeleting(false);
    }
  }

  function onDeleteTaskDone(task: Task) {
    if (task.status === "succeeded") {
      router.push("/sites");
      router.refresh();
    } else {
      setDeleteError(task.error ?? "The delete task failed.");
    }
  }

  const isPHP = Boolean(site && site.phpVersion && site.phpVersion !== "none");
  const isWordPress = Boolean(
    site && (site.appTemplate === "wordpress" || installedApp?.template === "wordpress" || installedApp?.name?.toLowerCase() === "wordpress")
  );
  const hasAppProcess = siteApps.length > 0;
  const isNode = Boolean(
    site?.appTemplate === "node" ||
    site?.appTemplate === "nextjs" ||
    site?.appTemplate === "express" ||
    installedApp?.runtime === "node" ||
    siteApps.some((a) => a.kind === "node")
  );
  const isPython = Boolean(
    site?.appTemplate === "python" ||
    site?.appTemplate === "django" ||
    site?.appTemplate === "flask" ||
    site?.appTemplate === "fastapi" ||
    installedApp?.runtime === "python" ||
    siteApps.some((a) => a.kind === "python")
  );
  const isGo = Boolean(
    site?.appTemplate === "go" ||
    installedApp?.runtime === "go" ||
    siteApps.some((a) => a.kind === "go")
  );
  const isDocker = Boolean(
    site?.appTemplate === "docker" ||
    installedApp?.runtime === "docker" ||
    siteApps.some((a) => a.kind === "docker")
  );
  const isStatic =
    !isPHP &&
    !hasAppProcess &&
    !isNode &&
    !isPython &&
    !isGo &&
    !isDocker &&
    (!installedApp || installedApp.runtime === "static" || site?.appTemplate === "static");

  const dynamicTabs = useMemo(() => {
    const list: { id: SiteTabId; label: string }[] = [{ id: "overview", label: "Overview" }];

    if (isWordPress) {
      list.push({ id: "wordpress", label: "WordPress" });
    }

    list.push({ id: "subdomains", label: "Subdomains" });
    list.push({ id: "redirects", label: "Redirects" });
    list.push({ id: "cron", label: "Cron jobs" });

    if (isPHP) {
      list.push({ id: "php", label: "PHP" });
    }

    if (isStatic) {
      list.push({ id: "static", label: "Static & SPA" });
    }

    let appsLabel = "Applications";
    if (isNode) appsLabel = "Node.js Process";
    else if (isPython) appsLabel = "Python Process";
    else if (isGo) appsLabel = "Go Process";
    else if (isDocker) appsLabel = "Docker Service";

    if (!isStatic || hasAppProcess) {
      list.push({ id: "apps", label: appsLabel });
    }

    list.push({ id: "git", label: "Git & CI/CD" });
    list.push({ id: "security", label: "Security" });
    list.push({ id: "usage", label: "Usage & stats" });
    list.push({ id: "logs", label: "Logs" });

    return list;
  }, [isWordPress, isPHP, isStatic, isNode, isPython, isGo, isDocker, hasAppProcess]);

  useEffect(() => {
    if (state === "ready" && dynamicTabs.length > 0 && !dynamicTabs.some((t) => t.id === tab)) {
      setTab(dynamicTabs[0].id);
    }
  }, [state, dynamicTabs, tab]);

  if (state === "loading") {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-56" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (state === "notfound") {
    return (
      <EmptyState
        icon={Globe}
        title="Site not found"
        description={`The site ${domain} does not exist or has been deleted.`}
        action={
          <Link href="/sites" className={buttonClass("secondary", "md")}>
            Back to sites
          </Link>
        }
      />
    );
  }

  if (state === "error" || !site) {
    return (
      <>
        <Alert variant="error" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage ?? "Failed to load site"}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
        <Link href="/sites" className={buttonClass("ghost", "sm")}>
          <ArrowLeft size={14} aria-hidden="true" />
          All sites
        </Link>
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <Link
          href="/sites"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground/80"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          All sites
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold tracking-tight text-foreground">
            {site.domain}
          </h1>
          <Badge variant={siteStatusVariant(site.status)}>{titleCase(site.status)}</Badge>
          {site.ssl.enabled ? <Badge variant="green">SSL</Badge> : null}
          {isCustomDomain(site.domain) ? (
            <Badge variant="amber" title="Custom or test domain">
              Custom domain
            </Badge>
          ) : null}
          <a
            href={`/api/preview/${encodeURIComponent(site.domain)}`}
            target="_blank"
            rel="noreferrer noopener"
            className={buttonClass("secondary", "sm")}
            title={`Preview ${site.domain} in-panel`}
          >
            <Eye size={14} aria-hidden="true" />
            Preview in Panel
          </a>
          <a
            href={`${site.ssl.enabled ? "https" : "http"}://${site.domain}`}
            target="_blank"
            rel="noreferrer noopener"
            className={buttonClass("primary", "sm")}
            title={`Open http${site.ssl.enabled ? "s" : ""}://${site.domain} in new tab`}
          >
            <ExternalLink size={14} aria-hidden="true" />
            Open site
          </a>
          <Link
            href={`/sites/${encodeURIComponent(site.domain)}/files`}
            className={buttonClass("secondary", "sm")}
          >
            <FolderOpen size={14} aria-hidden="true" />
            Files
          </Link>
        </div>

        {isCustomDomain(site.domain) ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <HelpCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <span>Testing a custom domain? Add </span>
              <code className="rounded bg-background/80 px-1 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                &lt;server_ip&gt; {site.domain}
              </code>
              <span> to your </span>
              <code className="font-mono text-[11px]">/etc/hosts</code>
              <span> or Windows </span>
              <code className="font-mono text-[11px]">C:\Windows\System32\drivers\etc\hosts</code>
              <span> so your browser can resolve it.</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mb-6 overflow-x-auto border-b border-border">
        <div role="tablist" aria-label="Site tools" className="flex min-w-max gap-1">
          {dynamicTabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`site-tab-${entry.id}`}
              aria-selected={tab === entry.id}
              aria-controls={`site-tabpanel-${entry.id}`}
              onClick={() => setTab(entry.id)}
              className={cn(
                "-mb-px cursor-pointer whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                tab === entry.id
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground/80",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <TabPanel id="overview" active={tab === "overview"}>
        <SiteDoctorCard domain={site.domain} />

        {isPHP ? <FastCgiCacheCard domain={site.domain} /> : null}

        {isStatic ? (
          <StaticSpaCard domain={site.domain} onOpenGitTab={() => setTab("git")} />
        ) : null}

        <TunnelCard domain={site.domain} />

        <DnsMailCard domain={site.domain} />

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Site</CardTitle>
              <CardDescription>Configuration managed by the CloudDeck agent.</CardDescription>
            </div>
            <Globe size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <DetailRow label="Domain">
                <span className="font-mono">{site.domain}</span>
              </DetailRow>
              <DetailRow label="Root">
                <span className="break-all font-mono">{site.root}</span>
              </DetailRow>
              <DetailRow label="Runtime">
                {isWordPress ? (
                  <Badge variant="indigo">WordPress • PHP {site.phpVersion}</Badge>
                ) : isPHP ? (
                  <Badge variant="indigo">PHP {site.phpVersion} (PHP-FPM)</Badge>
                ) : isNode ? (
                  <Badge variant="indigo">Node.js (Supervised Process)</Badge>
                ) : isPython ? (
                  <Badge variant="indigo">Python (ASGI / WSGI)</Badge>
                ) : isGo ? (
                  <Badge variant="indigo">Go (Native Binary)</Badge>
                ) : isDocker ? (
                  <Badge variant="indigo">Docker Container</Badge>
                ) : (
                  <Badge variant="indigo">Static &amp; SPA (Nginx)</Badge>
                )}
              </DetailRow>
              <DetailRow label="Status">
                <Badge variant={siteStatusVariant(site.status)}>{titleCase(site.status)}</Badge>
              </DetailRow>
              <DetailRow label="Created">
                <span className="font-mono">{shortDateTime(site.createdAt)}</span>
              </DetailRow>
              <DetailRow label="Updated">
                <span className="font-mono">{shortDateTime(site.updatedAt)}</span>
              </DetailRow>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>SSL</CardTitle>
              <CardDescription>
                {site.ssl.enabled
                  ? "Certificate issued by Let's Encrypt."
                  : "No certificate issued for this domain yet."}
              </CardDescription>
            </div>
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardBody className="grid gap-5">
            {site.ssl.enabled ? (
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <DetailRow label="Status">
                  <Badge variant="green">Enabled</Badge>
                </DetailRow>
                <DetailRow label="Issuer">{site.ssl.issuer ?? "Let's Encrypt"}</DetailRow>
                <DetailRow label="Expires">
                  <span className="font-mono">
                    {site.ssl.expiresAt ? shortDateTime(site.ssl.expiresAt) : "—"}
                  </span>
                </DetailRow>
                <div className="sm:col-span-2 pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Wildcard (*.{site.domain}) certificate via DNS-01 challenge</span>
                  <Button variant="secondary" size="sm" onClick={() => setShowWildcardModal(true)}>
                    <ShieldCheck size={14} className="mr-1.5 text-emerald-500" />
                    Configure Wildcard SSL
                  </Button>
                </div>
              </dl>
            ) : (
              <form onSubmit={onIssueSsl} className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="ssl-email">Contact email</Label>
                  <Input
                    id="ssl-email"
                    type="email"
                    value={sslEmail}
                    onChange={(event) => setSslEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="off"
                    disabled={sslSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used for expiry notices from the certificate authority.
                  </p>
                </div>
                {sslError ? <Alert variant="error">{sslError}</Alert> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" loading={sslSubmitting} disabled={sslTaskId !== null}>
                    Issue Standard SSL (HTTP-01)
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowWildcardModal(true)}>
                    <ShieldCheck size={14} className="mr-1.5 text-emerald-500" />
                    Issue Wildcard SSL (*.{site.domain})
                  </Button>
                </div>
              </form>
            )}

            {sslTaskId ? <TaskLog taskId={sslTaskId} onComplete={onSslTaskDone} /> : null}
          </CardBody>
        </Card>

        <Card className="border-red-900/40">
          <CardHeader>
            <div>
              <CardTitle>Danger zone</CardTitle>
              <CardDescription>
                Deleting a site removes its nginx configuration and stops serving it.
              </CardDescription>
            </div>
            <Trash2 size={16} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          </CardHeader>
          <CardBody className="grid gap-4">
            {deleteError ? <Alert variant="error">{deleteError}</Alert> : null}

            {deleteTaskId ? (
              <TaskLog taskId={deleteTaskId} onComplete={onDeleteTaskDone} />
            ) : confirmDelete ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  This permanently removes <span className="font-mono text-foreground/80">{site.domain}</span>.
                  This cannot be undone.
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="danger" loading={deleting} onClick={() => void onDelete()}>
                    Confirm delete
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={16} aria-hidden="true" />
                  Delete site
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </TabPanel>

      <TabPanel id="wordpress" active={tab === "wordpress"}>
        <WordPressCard domain={site.domain} />
      </TabPanel>

      <TabPanel id="subdomains" active={tab === "subdomains"}>
        <SubdomainsCard domain={site.domain} />
      </TabPanel>

      <TabPanel id="redirects" active={tab === "redirects"}>
        <RedirectsCard domain={site.domain} />
      </TabPanel>

      <TabPanel id="cron" active={tab === "cron"}>
        <CronCard domain={site.domain} />
      </TabPanel>

      <TabPanel id="php" active={tab === "php"}>
        <PhpCard domain={site.domain} currentVersion={site.phpVersion} onUpdated={setSite} />
      </TabPanel>

      <TabPanel id="static" active={tab === "static"}>
        <StaticSpaCard domain={site.domain} onOpenGitTab={() => setTab("git")} />
      </TabPanel>

      <TabPanel id="apps" active={tab === "apps"}>
        <InstalledAppCard
          domain={site.domain}
          refreshTrigger={appsRefreshTrigger}
          onAppUninstalled={() => {
            void load();
            setAppsRefreshTrigger((v) => v + 1);
          }}
        />
        <InstallAppCard
          domain={site.domain}
          currentPhpVersion={site.phpVersion}
          onAppInstalled={() => {
            void load();
            setAppsRefreshTrigger((v) => v + 1);
          }}
        />
        <SiteAppCard
          domain={site.domain}
          refreshTrigger={appsRefreshTrigger}
          onProcessChanged={() => setAppsRefreshTrigger((v) => v + 1)}
        />
      </TabPanel>

      <TabPanel id="git" active={tab === "git"}>
        <GitCard domain={site.domain} />
      </TabPanel>

      <TabPanel id="security" active={tab === "security"}>
        <SecurityCard domain={site.domain} />
        <WafCard domain={site.domain} />
      </TabPanel>

      <TabPanel id="usage" active={tab === "usage"}>
        <TrafficAnalyticsCard domain={site.domain} />
        <UsageCard domain={site.domain} />
        <StatsCard domain={site.domain} />
      </TabPanel>

      <TabPanel id="logs" active={tab === "logs"}>
        <LogsCard domain={site.domain} />
      </TabPanel>

      <WildcardSslModal
        domain={site.domain}
        open={showWildcardModal}
        onOpenChange={setShowWildcardModal}
        onSuccess={() => void load()}
      />
    </>
  );
}
