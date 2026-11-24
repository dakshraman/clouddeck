"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { GlobalTunnelStatus } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Cloud,
  Eye,
  EyeOff,
  ExternalLink,
  Play,
  RefreshCw,
  Square,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

export function CloudflareTunnelCard() {
  const [status, setStatus] = useState<GlobalTunnelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<GlobalTunnelStatus>("/api/tunnel/status");
      setStatus(data);
      if (data.token) {
        setToken(data.token);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load Cloudflare Tunnel status";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleSaveToken(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!token.trim()) {
      setError("Cloudflare Tunnel token cannot be empty");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await apiPost<GlobalTunnelStatus>("/api/tunnel/config", {
        token: token.trim(),
        autoStart: true,
      });
      setStatus(updated);
      setNotice("Cloudflare Tunnel token saved successfully.");
      setTimeout(() => setNotice(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save Cloudflare Tunnel token";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleDaemon() {
    if (!status?.configured && !token.trim()) {
      setError("Please save a Cloudflare Tunnel token before starting the tunnel.");
      return;
    }

    setToggling(true);
    setError(null);
    setNotice(null);

    try {
      if (status?.running) {
        const updated = await apiPost<GlobalTunnelStatus>("/api/tunnel/stop", {});
        setStatus(updated);
        setNotice("Cloudflare Tunnel daemon stopped.");
      } else {
        // If token in input hasn't been saved yet, save it first
        if (token.trim() && token.trim() !== status?.token) {
          await apiPost<GlobalTunnelStatus>("/api/tunnel/config", { token: token.trim() });
        }
        const updated = await apiPost<GlobalTunnelStatus>("/api/tunnel/start", {});
        setStatus(updated);
        setNotice("Cloudflare Tunnel daemon started successfully.");
      }
      setTimeout(() => setNotice(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change tunnel daemon state";
      setError(msg);
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  const isRunning = Boolean(status?.running);
  const isConfigured = Boolean(status?.configured);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <Cloud className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Cloudflare Tunnel</CardTitle>
            <CardDescription>
              Connect your CloudDeck server securely to Cloudflare without opening incoming firewall ports or needing a public IP.
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Badge variant="green" className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Running
            </Badge>
          ) : isConfigured ? (
            <Badge variant="amber">Stopped</Badge>
          ) : (
            <Badge variant="neutral">Not Configured</Badge>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadStatus()}
            title="Refresh tunnel status"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardBody className="space-y-6">
        {error ? (
          <Alert variant="error">
            <p>{error}</p>
          </Alert>
        ) : null}

        {notice ? (
          <Alert variant="success">
            <p>{notice}</p>
          </Alert>
        ) : null}

        {status?.error && (
          <Alert variant="error">
            <p><strong>Daemon Error:</strong> {status.error}</p>
          </Alert>
        )}

        {/* Status Details Box */}
        <div className="rounded-lg border border-border bg-card/60 p-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-semibold text-foreground">
                  Zero Trust Tunnel Daemon (cloudflared)
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Runs <code>cloudflared tunnel run</code> to route external traffic to your web server and panel.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={isRunning ? "danger" : "primary"}
                size="sm"
                onClick={handleToggleDaemon}
                disabled={toggling || (!isConfigured && !token.trim())}
              >
                {toggling ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : isRunning ? (
                  <Square className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                )}
                {toggling ? "Updating..." : isRunning ? "Stop Daemon" : "Start Daemon"}
              </Button>
            </div>
          </div>

          {status?.startedAt && isRunning && (
            <div className="text-xs text-muted-foreground border-t border-border/50 pt-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>Active since {new Date(status.startedAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Configuration Form */}
        <form onSubmit={handleSaveToken} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tunnel-token">Tunnel Token</Label>
              <a
                href="https://one.dash.cloudflare.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
              >
                Cloudflare Zero Trust Dashboard
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="relative">
              <Input
                id="tunnel-token"
                type={showToken ? "text" : "password"}
                placeholder="eyJhIjoi..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="font-mono text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title={showToken ? "Hide token" : "Show token"}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Obtain your tunnel connector token from <strong>Zero Trust → Networks → Tunnels → Configure</strong>. Copy the token from the run command snippet.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={saving || !token.trim()}
            >
              {saving ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {saving ? "Saving..." : "Save Token"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
