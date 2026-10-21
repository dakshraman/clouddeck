"use client";

import { useCallback, useEffect, useState } from "react";
import type { MailDomainsResponse, MailStatus } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AccountsCard } from "@/components/mail/accounts-card";
import { AutorespondersCard } from "@/components/mail/autoresponders-card";
import { DomainsCard } from "@/components/mail/domains-card";
import { EmailDnsCard } from "@/components/mail/email-dns-card";
import { ForwardersCard } from "@/components/mail/forwarders-card";
import { FolderOpen, Globe, Inbox, KeyRound, Server } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

export function MailPage() {
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [domains, setDomains] = useState<string[] | null>(null);
  const [domainsError, setDomainsError] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setState("loading");
    setErrorMessage(null);

    const [statusResult, domainsResult] = await Promise.allSettled([
      apiFetch<MailStatus>("/api/mail/status"),
      apiFetch<MailDomainsResponse>("/api/mail/domains"),
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

    if (domainsResult.status === "fulfilled") {
      setDomains(domainsResult.value.domains);
      setDomainsError(null);
    } else {
      setDomainsError(
        domainsResult.reason instanceof Error
          ? domainsResult.reason.message
          : "Failed to load mail domains",
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

  return (
    <>
      <PageHeader
        title="Mail"
        description="Mail domains, mailboxes, forwarders, autoresponders and email DNS records."
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : null}

      {state === "ready" && status ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Hostname
                </p>
                <Server size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
              <p
                className="mt-3 truncate font-mono text-lg font-semibold text-foreground"
                title={status.hostname}
              >
                {status.hostname || "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">MX target for new records</p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Base directory
                </p>
                <FolderOpen size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
              <p
                className="mt-3 truncate font-mono text-lg font-semibold text-foreground"
                title={status.baseDir}
              >
                {status.baseDir || "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Agent mail state on disk</p>
            </Card>

            <StatCard
              label="Mail domains"
              value={String(status.domains)}
              sub="accepted for delivery"
              icon={Globe}
            />
            <StatCard
              label="Mailboxes"
              value={String(status.accounts)}
              sub="virtual accounts"
              icon={Inbox}
            />
            <StatCard
              label="DKIM keys"
              value={String(status.dkimEnabled)}
              sub="domain keypairs"
              icon={KeyRound}
            />
          </div>

          <div className="mt-6">
            <DomainsCard domains={domains} error={domainsError} onRefresh={refresh} />
          </div>

          <div className="mt-6">
            <AccountsCard domains={domains} onRefresh={refresh} />
          </div>

          <div className="mt-6">
            <ForwardersCard domains={domains} onRefresh={refresh} />
          </div>

          <div className="mt-6">
            <AutorespondersCard domains={domains} />
          </div>

          <div className="mt-6">
            <EmailDnsCard domains={domains} onRefresh={refresh} />
          </div>
        </>
      ) : null}
    </>
  );
}
