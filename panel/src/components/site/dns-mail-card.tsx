"use client";

import { useCallback, useEffect, useState } from "react";
import type { DNSNameserversInfo, SiteSyncResult } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { copyText } from "@/components/mail/copy-button";
import { Check, Copy, Globe, Mail, Network, RefreshCw, ShieldCheck } from "lucide-react";

interface DnsMailCardProps {
  domain: string;
}

export function DnsMailCard({ domain }: DnsMailCardProps) {
  const [nameservers, setNameservers] = useState<DNSNameserversInfo | null>(null);
  const [zoneActive, setZoneActive] = useState<boolean | null>(null);
  const [mailActive, setMailActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncBanner, setSyncBanner] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const [nsRes, zoneRes, mailRes] = await Promise.allSettled([
        apiFetch<DNSNameserversInfo>("/api/dns/nameservers"),
        apiFetch<{ zone?: unknown }>(`/api/dns/zones/${encodeURIComponent(domain)}`),
        apiFetch<{ domain?: unknown }>(`/api/mail/domains/${encodeURIComponent(domain)}`),
      ]);

      if (nsRes.status === "fulfilled") {
        setNameservers(nsRes.value);
      }
      setZoneActive(zoneRes.status === "fulfilled");
      setMailActive(mailRes.status === "fulfilled");
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleCopy(key: string, text: string) {
    if (!text) return;
    const ok = await copyText(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    setSyncBanner(null);

    try {
      const res = await apiPost<SiteSyncResult>(
        `/api/sites/${encodeURIComponent(domain)}/sync`,
        {},
      );
      setZoneActive(true);
      setMailActive(true);
      const parts: string[] = [];
      if (res.dnsZoneCreated) parts.push("Authoritative DNS Zone verified & created");
      if (res.mailDomainCreated) parts.push("Mail domain provisioned");
      if (res.dkimApplied) parts.push("DKIM key applied & verified");
      setSyncBanner(
        parts.length > 0
          ? `Successfully synchronized: ${parts.join(", ")}`
          : "DNS zone and Mail Stack & DKIM keys are fully synchronized and active.",
      );
      void loadStatus();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Failed to sync DNS & Mail stack");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardBody className="grid gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardBody>
      </Card>
    );
  }

  const ns1 = nameservers?.nameserver1 || "ns1.yourdomain.com";
  const ns2 = nameservers?.nameserver2 || "ns2.yourdomain.com";
  const serverIp = nameservers?.serverIP || "127.0.0.1";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Domain, DNS &amp; Mail Integration</CardTitle>
          <CardDescription>
            Authoritative DNS routing, nameservers, mail server domain, and DKIM signature keys.
          </CardDescription>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSync}
          loading={syncing}
          className="gap-1.5 text-xs"
        >
          <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
          Sync &amp; Repair DNS &amp; Mail
        </Button>
      </CardHeader>

      <CardBody className="grid gap-4">
        {syncBanner ? <Alert variant="success">{syncBanner}</Alert> : null}
        {syncError ? <Alert variant="error">{syncError}</Alert> : null}

        {/* Integration Status Highlights */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-[#74B8CC]" />
              <div>
                <div className="text-xs font-semibold text-foreground">PowerDNS Zone</div>
                <div className="text-[11px] text-muted-foreground">Authoritative DNS records on this server</div>
              </div>
            </div>
            <Badge variant={zoneActive ? "green" : "neutral"}>
              {zoneActive ? "Active" : "Not configured"}
            </Badge>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-[#FAAA93]" />
              <div>
                <div className="text-xs font-semibold text-foreground">Mail Domain &amp; DKIM</div>
                <div className="text-[11px] text-muted-foreground">Postfix, Dovecot &amp; 2048-bit DKIM key</div>
              </div>
            </div>
            <Badge variant={mailActive ? "green" : "neutral"}>
              {mailActive ? "Configured" : "Not configured"}
            </Badge>
          </div>
        </div>

        {/* Required Nameservers & Server IP with 1-click Copy */}
        <div className="rounded-lg border border-border/80 bg-muted/10 p-3.5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground pb-2 border-b border-border/60">
            <span>Required Nameservers &amp; Server IP</span>
            <span className="text-[11px]">Copy to domain registrar</span>
          </div>

          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
              <div className="truncate">
                <span className="text-[11px] text-muted-foreground block">Primary NS (NS1)</span>
                <span className="font-mono font-semibold text-foreground truncate block">{ns1}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy("ns1", ns1)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Copy NS1"
              >
                {copiedKey === "ns1" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
              <div className="truncate">
                <span className="text-[11px] text-muted-foreground block">Secondary NS (NS2)</span>
                <span className="font-mono font-semibold text-foreground truncate block">{ns2}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy("ns2", ns2)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Copy NS2"
              >
                {copiedKey === "ns2" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
              <div className="truncate">
                <span className="text-[11px] text-muted-foreground block">Server IP</span>
                <span className="font-mono font-semibold text-foreground truncate block">{serverIp}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy("ip", serverIp)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Copy Server IP"
              >
                {copiedKey === "ip" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
