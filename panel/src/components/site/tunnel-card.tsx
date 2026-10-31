"use client";

import { useCallback, useEffect, useState } from "react";
import type { SiteTunnelInfo } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { copyText } from "@/components/mail/copy-button";
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  Radio,
  Terminal,
  Zap,
  ZapOff,
} from "lucide-react";

interface TunnelCardProps {
  domain: string;
}

export function TunnelCard({ domain }: TunnelCardProps) {
  const [tunnel, setTunnel] = useState<SiteTunnelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadTunnel = useCallback(async () => {
    try {
      const res = await apiFetch<SiteTunnelInfo>(
        `/api/sites/${encodeURIComponent(domain)}/tunnel`,
      );
      setTunnel(res);
      setError(null);
    } catch {
      // Tunnel not active or endpoint returned 404/error
      setTunnel(null);
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void loadTunnel();
  }, [loadTunnel]);

  async function handleCopy(key: string, text: string) {
    if (!text) return;
    const ok = await copyText(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }

  async function handleStart() {
    setActionLoading(true);
    setError(null);
    try {
      const res = await apiPost<SiteTunnelInfo>(
        `/api/sites/${encodeURIComponent(domain)}/tunnel`,
        {},
      );
      setTunnel(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start public tunnel");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStop() {
    setActionLoading(true);
    setError(null);
    try {
      await apiFetch<SiteTunnelInfo>(
        `/api/sites/${encodeURIComponent(domain)}/tunnel`,
        { method: "DELETE" },
      );
      setTunnel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop tunnel");
    } finally {
      setActionLoading(false);
    }
  }

  const isTunnelActive =
    tunnel && tunnel.status === "active" && Boolean(tunnel.publicUrl);

  const linuxHosts = `sudo sh -c 'echo "127.0.0.1 ${domain}" >> /etc/hosts'`;
  const winHosts = `Add-Content C:\\Windows\\System32\\drivers\\etc\\hosts "127.0.0.1 ${domain}"`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Live Public Tunnel &amp; Browser Preview</CardTitle>
          <CardDescription>
            Instant public HTTPS access without DNS configuration, plus in-panel browser proxying.
          </CardDescription>
        </div>
        <a
          href={`/api/preview/${encodeURIComponent(domain)}`}
          target="_blank"
          rel="noreferrer noopener"
          className={buttonClass("secondary", "sm")}
          title="Preview site inside panel reverse-proxy"
        >
          <Eye size={14} aria-hidden="true" />
          Preview in Panel
        </a>
      </CardHeader>

      <CardBody className="grid gap-5">
        {error ? <Alert variant="error">{error}</Alert> : null}

        {/* Live Public Tunnel Section */}
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/70">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                <Radio size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span>Live Public Tunnel (Ngrok-style)</span>
                  {isTunnelActive ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-500">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      Active Tunnel
                    </span>
                  ) : (
                    <Badge variant="neutral">Inactive</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Secure Cloudflare tunnel proxying traffic directly to your site port 80.
                </div>
              </div>
            </div>

            <div>
              {loading ? (
                <Skeleton className="h-8 w-28" />
              ) : isTunnelActive ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleStop}
                  loading={actionLoading}
                  className="text-red-500 hover:text-red-600 gap-1.5 text-xs"
                >
                  <ZapOff size={13} />
                  Stop Tunnel
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleStart}
                  loading={actionLoading}
                  className="bg-[#235361] hover:bg-[#1a3f4a] text-white gap-1.5 text-xs"
                >
                  <Zap size={13} />
                  Start Public Tunnel
                </Button>
              )}
            </div>
          </div>

          {isTunnelActive ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 block">
                  Live Public URL (Worldwide SSL)
                </span>
                <span className="font-mono text-sm font-semibold text-foreground break-all select-all">
                  {tunnel.publicUrl}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCopy("tunnel-url", tunnel.publicUrl)}
                  className="gap-1.5 text-xs"
                >
                  {copiedKey === "tunnel-url" ? (
                    <Check size={13} className="text-emerald-500" />
                  ) : (
                    <Copy size={13} />
                  )}
                  Copy URL
                </Button>
                <a
                  href={tunnel.publicUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={buttonClass("primary", "sm")}
                >
                  <ExternalLink size={13} aria-hidden="true" />
                  Visit Tunnel
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-muted-foreground">
              Click <strong>Start Public Tunnel</strong> to generate an instant, publicly accessible HTTPS URL. Ideal for sharing client demos or testing webhooks before domain DNS propagates.
            </div>
          )}
        </div>

        {/* Local Hosts Snippet */}
        <div className="rounded-lg border border-border/80 bg-muted/10 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground pb-1.5">
            <Terminal size={14} className="text-muted-foreground" />
            <span>Local Hosts Configuration Snippets</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Test directly in your browser on your workstation before public DNS propagation:
          </p>

          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 text-xs">
            <div className="rounded-md border border-border bg-card p-2.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1">
                <span>Linux / macOS</span>
                <button
                  type="button"
                  onClick={() => handleCopy("linux-hosts", linuxHosts)}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted text-foreground"
                  title="Copy command"
                >
                  {copiedKey === "linux-hosts" ? (
                    <Check size={12} className="text-emerald-500" />
                  ) : (
                    <Copy size={12} />
                  )}
                  <span>Copy</span>
                </button>
              </div>
              <code className="mt-1 block rounded bg-muted/60 p-1.5 font-mono text-[11px] text-foreground break-all select-all">
                {linuxHosts}
              </code>
            </div>

            <div className="rounded-md border border-border bg-card p-2.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1">
                <span>Windows (PowerShell Admin)</span>
                <button
                  type="button"
                  onClick={() => handleCopy("win-hosts", winHosts)}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted text-foreground"
                  title="Copy command"
                >
                  {copiedKey === "win-hosts" ? (
                    <Check size={12} className="text-emerald-500" />
                  ) : (
                    <Copy size={12} />
                  )}
                  <span>Copy</span>
                </button>
              </div>
              <code className="mt-1 block rounded bg-muted/60 p-1.5 font-mono text-[11px] text-foreground break-all select-all">
                {winHosts}
              </code>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
