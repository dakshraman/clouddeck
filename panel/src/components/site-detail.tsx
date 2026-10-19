"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Site, Task } from "@/lib/types";
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
import { UsageCard } from "@/components/site/usage-card";
import { StatsCard } from "@/components/site/stats-card";
import { LogsCard } from "@/components/site/logs-card";
import { cn } from "@/components/ui/cn";
import { phpVersionLabel, shortDateTime, siteStatusVariant, titleCase } from "@/components/format";
import { ArrowLeft, FolderOpen, Globe, ShieldCheck, Trash2 } from "lucide-react";

type LoadState = "loading" | "ready" | "notfound" | "error";

type SiteTabId =
  | "overview"
  | "subdomains"
  | "redirects"
  | "cron"
  | "php"
  | "security"
  | "usage"
  | "logs";

const SITE_TABS: { id: SiteTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "subdomains", label: "Subdomains" },
  { id: "redirects", label: "Redirects" },
  { id: "cron", label: "Cron jobs" },
  { id: "php", label: "PHP" },
  { id: "security", label: "Security" },
  { id: "usage", label: "Usage & stats" },
  { id: "logs", label: "Logs" },
];

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-200">{children}</dd>
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

export function SiteDetail({ domain }: { domain: string }) {
  const router = useRouter();
  const [site, setSite] = useState<Site | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [sslEmail, setSslEmail] = useState("");
  const [sslError, setSslError] = useState<string | null>(null);
  const [sslSubmitting, setSslSubmitting] = useState(false);
  const [sslTaskId, setSslTaskId] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [tab, setTab] = useState<SiteTabId>("overview");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Site>(`/api/sites/${encodeURIComponent(domain)}`);
      setSite(data);
      setState("ready");
      setErrorMessage(null);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        setState("notfound");
        return;
      }
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
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          All sites
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold tracking-tight text-slate-100">
            {site.domain}
          </h1>
          <Badge variant={siteStatusVariant(site.status)}>{titleCase(site.status)}</Badge>
          {site.ssl.enabled ? <Badge variant="green">SSL</Badge> : null}
          <Link
            href={`/sites/${encodeURIComponent(site.domain)}/files`}
            className={buttonClass("secondary", "sm")}
          >
            <FolderOpen size={14} aria-hidden="true" />
            Files
          </Link>
        </div>
      </div>

      <div className="mb-6 overflow-x-auto border-b border-slate-800">
        <div role="tablist" aria-label="Site tools" className="flex min-w-max gap-1">
          {SITE_TABS.map((entry) => (
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
                  ? "border-indigo-500 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <TabPanel id="overview" active={tab === "overview"}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Site</CardTitle>
              <CardDescription>Configuration managed by the CloudDeck agent.</CardDescription>
            </div>
            <Globe size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
          </CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <DetailRow label="Domain">
                <span className="font-mono">{site.domain}</span>
              </DetailRow>
              <DetailRow label="Root">
                <span className="break-all font-mono">{site.root}</span>
              </DetailRow>
              <DetailRow label="PHP version">{phpVersionLabel(site.phpVersion)}</DetailRow>
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
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
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
                  <p className="text-xs text-slate-500">
                    Used for expiry notices from the certificate authority.
                  </p>
                </div>
                {sslError ? <Alert variant="error">{sslError}</Alert> : null}
                <div>
                  <Button type="submit" loading={sslSubmitting} disabled={sslTaskId !== null}>
                    Issue SSL
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
            <Trash2 size={16} className="mt-0.5 shrink-0 text-red-400/80" aria-hidden="true" />
          </CardHeader>
          <CardBody className="grid gap-4">
            {deleteError ? <Alert variant="error">{deleteError}</Alert> : null}

            {deleteTaskId ? (
              <TaskLog taskId={deleteTaskId} onComplete={onDeleteTaskDone} />
            ) : confirmDelete ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-slate-400">
                  This permanently removes <span className="font-mono text-slate-300">{site.domain}</span>.
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

      <TabPanel id="security" active={tab === "security"}>
        <SecurityCard domain={site.domain} />
        <WafCard domain={site.domain} />
      </TabPanel>

      <TabPanel id="usage" active={tab === "usage"}>
        <UsageCard domain={site.domain} />
        <StatsCard domain={site.domain} />
      </TabPanel>

      <TabPanel id="logs" active={tab === "logs"}>
        <LogsCard domain={site.domain} />
      </TabPanel>
    </>
  );
}
