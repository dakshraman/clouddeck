"use client";

import { useEffect, useState } from "react";
import type { MailDKIMInfo, MailDNSOptions, MailDNSResult } from "@/lib/types";
import { apiFetch, apiPost, isAbortError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { CopyButton } from "@/components/mail/copy-button";
import { KeyRound, Send, ShieldCheck } from "lucide-react";

type ApplyKind = "dkim" | "spf" | "dmarc" | "mx";
type DmarcPolicy = "none" | "quarantine" | "reject";

interface EmailDnsCardProps {
  domains: string[] | null;
  onRefresh: () => void;
}

const APPLY_LABELS: Record<ApplyKind, string> = {
  dkim: "DKIM",
  spf: "SPF",
  dmarc: "DMARC",
  mx: "MX",
};

export function EmailDnsCard({ domains, onRefresh }: EmailDnsCardProps) {
  const [domain, setDomain] = useState("");
  const [dkim, setDkim] = useState<MailDKIMInfo | null>(null);
  const [dkimLoading, setDkimLoading] = useState(false);
  const [dkimError, setDkimError] = useState<string | null>(null);
  const [dkimReloadKey, setDkimReloadKey] = useState(0);

  const [policy, setPolicy] = useState<DmarcPolicy>("none");
  const [applying, setApplying] = useState<ApplyKind | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [result, setResult] = useState<MailDNSResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Keep the selected domain valid when the domain list changes.
  useEffect(() => {
    if (domains && domains.length > 0 && !domains.includes(domain)) {
      setDomain(domains[0]);
    }
  }, [domains, domain]);

  useEffect(() => {
    setResult(null);
    setApplyError(null);
    setNotice(null);
    setPolicy("none");
  }, [domain]);

  useEffect(() => {
    if (!domain) {
      setDkim(null);
      setDkimError(null);
      setDkimLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setDkimLoading(true);
    setDkimError(null);

    apiFetch<MailDKIMInfo>(`/api/mail/dkim/${encodeURIComponent(domain)}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!active) return;
        setDkim(data);
        setDkimLoading(false);
      })
      .catch((err) => {
        if (!active || isAbortError(err)) return;
        setDkimError(err instanceof Error ? err.message : "Failed to load the DKIM status");
        setDkimLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [domain, dkimReloadKey]);

  async function onApply(kind: ApplyKind) {
    if (!domain) return;
    const options: MailDNSOptions =
      kind === "dkim"
        ? { dkim: true }
        : kind === "spf"
          ? { spf: true }
          : kind === "dmarc"
            ? { dmarcPolicy: policy }
            : { mx: true };

    setApplying(kind);
    setApplyError(null);
    setResult(null);
    setNotice(null);
    try {
      const data = await apiPost<MailDNSResult>(
        `/api/mail/dns/${encodeURIComponent(domain)}`,
        options,
      );
      const appliedCount = Object.keys(data.applied ?? {}).length;
      setResult(data);
      setNotice(
        appliedCount > 0
          ? `Published ${appliedCount} ${APPLY_LABELS[kind]} record${appliedCount === 1 ? "" : "s"} for ${domain}.`
          : `No ${APPLY_LABELS[kind]} records were published for ${domain}.`,
      );
      setDkimReloadKey((key) => key + 1);
      onRefresh();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Failed to publish DNS records");
    } finally {
      setApplying(null);
    }
  }

  const noDomains = domains !== null && domains.length === 0;
  const busy = applying !== null;
  const dnsName = dkim?.dnsName ?? (dkim ? `${dkim.selector}._domainkey.${domain}` : "");
  const appliedEntries = result ? Object.entries(result.applied ?? {}) : [];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Email DNS</CardTitle>
          <CardDescription>
            Publish SPF, DMARC, DKIM and MX records into the domain&apos;s PowerDNS zone.
          </CardDescription>
        </div>
      </CardHeader>

      <div className={noDomains || domains === null ? "px-5 pb-5 pt-4" : "px-5 pt-4"}>
        {noDomains ? (
          <p className="text-sm text-muted-foreground">
            Add a mail domain first to publish its SPF, DMARC, DKIM and MX records.
          </p>
        ) : domains === null ? (
          <p className="text-sm text-muted-foreground">Loading mail domains…</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="mail-dns-domain">Domain</Label>
            <Select
              id="mail-dns-domain"
              value={domain}
              onChange={(event) => {
                setDomain(event.target.value);
                setDkim(null);
              }}
              disabled={busy}
              className="w-56"
            >
              {domains.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </Select>
            {dkimLoading ? <Spinner size={14} className="text-muted-foreground" /> : null}
          </div>
        )}
      </div>

      {!noDomains && domains !== null && domain ? (
        <div className="px-5 pb-5 pt-5">
          <div className="rounded-lg border border-border bg-background/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">DKIM</p>
              {dkim ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={dkim.enabled ? "green" : "neutral"}>
                    {dkim.enabled ? "Key present" : "No key"}
                  </Badge>
                  {dkim.enabled ? (
                    <Badge variant={dkim.dnsApplied ? "green" : "amber"}>
                      {dkim.dnsApplied ? "Published in DNS" : "Not in DNS"}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>

            {dkimLoading ? (
              <div className="mt-3 grid gap-2">
                <Skeleton className="h-6" />
                <Skeleton className="h-6" />
              </div>
            ) : dkimError ? (
              <div className="mt-3">
                <Alert variant="error">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>{dkimError}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDkimReloadKey((key) => key + 1)}
                    >
                      Retry
                    </Button>
                  </div>
                </Alert>
              </div>
            ) : dkim ? (
              dkim.enabled ? (
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-1">
                    <p className="text-xs text-muted-foreground">Selector</p>
                    <p className="font-mono text-sm text-foreground">{dkim.selector}</p>
                  </div>
                  <div className="grid gap-1">
                    <p className="text-xs text-muted-foreground">DNS name</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="select-all break-all rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs text-foreground/80">
                        {dnsName}
                      </code>
                      <CopyButton value={dnsName} label="Copy name" />
                    </div>
                  </div>
                  {dkim.dnsRecord ? (
                    <div className="grid gap-1">
                      <p className="text-xs text-muted-foreground">TXT value</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="select-all break-all rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs text-foreground/80">
                          {dkim.dnsRecord}
                        </code>
                        <CopyButton value={dkim.dnsRecord} label="Copy TXT" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Add this TXT record at {dnsName} if the zone is hosted elsewhere.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No DKIM key exists for {domain} yet. Use Generate DKIM to create a keypair and
                  publish its TXT record.
                </p>
              )
            ) : null}
          </div>

          <div className="mt-4 grid gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                loading={applying === "dkim"}
                disabled={busy}
                onClick={() => void onApply("dkim")}
              >
                <KeyRound size={14} aria-hidden="true" />
                Generate DKIM
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={applying === "spf"}
                disabled={busy}
                onClick={() => void onApply("spf")}
              >
                <ShieldCheck size={14} aria-hidden="true" />
                Add SPF
              </Button>
              <div className="flex items-end gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="dmarc-policy">DMARC policy</Label>
                  <Select
                    id="dmarc-policy"
                    value={policy}
                    onChange={(event) => setPolicy(event.target.value as DmarcPolicy)}
                    disabled={busy}
                    className="w-36"
                  >
                    <option value="none">none</option>
                    <option value="quarantine">quarantine</option>
                    <option value="reject">reject</option>
                  </Select>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={applying === "dmarc"}
                  disabled={busy}
                  onClick={() => void onApply("dmarc")}
                >
                  <ShieldCheck size={14} aria-hidden="true" />
                  Add DMARC
                </Button>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={applying === "mx"}
                disabled={busy}
                onClick={() => void onApply("mx")}
              >
                <Send size={14} aria-hidden="true" />
                Add MX
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Records are published with TTL 3600 into the domain&apos;s PowerDNS zone. Per-record
              failures are listed below.
            </p>
          </div>

          {applyError ? (
            <div className="mt-4">
              <Alert variant="error">{applyError}</Alert>
            </div>
          ) : null}

          {notice ? (
            <div className="mt-4">
              <Alert variant="success">{notice}</Alert>
            </div>
          ) : null}

          {result ? (
            <div className="mt-4 grid gap-3 rounded-lg border border-border bg-background/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Applied records
              </p>
              {appliedEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No records were applied.</p>
              ) : (
                <div className="grid gap-2">
                  {appliedEntries.map(([name, value]) => (
                    <div key={name} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-foreground/80">{name}</span>
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
                        title={value}
                      >
                        {value}
                      </span>
                      <CopyButton value={value} label="Copy value" />
                    </div>
                  ))}
                </div>
              )}
              {result.errors && result.errors.length > 0 ? (
                <Alert variant="warning">
                  <p className="font-medium">Some records were not published:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {result.errors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
