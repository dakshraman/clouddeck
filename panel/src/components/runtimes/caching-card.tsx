"use client";

import { useCallback, useEffect, useState } from "react";
import type { CachingFlushResponse, CachingStatusResponse, CachingToggleResponse } from "@/lib/types";
import { apiFetch, apiPost, HttpError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { copyText } from "@/components/mail/copy-button";
import { cn } from "@/components/ui/cn";
import {
  Check,
  Copy,
  Cpu,
  Database,
  Layers,
  Power,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";

export function CachingCard() {
  const [data, setData] = useState<CachingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flushing, setFlushing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [copiedSocket, setCopiedSocket] = useState(false);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<CachingStatusResponse>("/api/caching/status");
      setData(res);
    } catch (err) {
      // If endpoint returns error or 404/502 (e.g. agent caching not yet active)
      // Provide clean fallback view so UI stays resilient
      setError(
        err instanceof HttpError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Could not retrieve cache status",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleFlush() {
    setFlushing(true);
    setNotice(null);
    setError(null);
    try {
      const res = await apiPost<CachingFlushResponse>("/api/caching/redis/flush", {});
      setNotice(res.message || "Redis cache flushed successfully (FLUSHALL).");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to flush Redis cache");
    } finally {
      setFlushing(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    setNotice(null);
    setError(null);
    try {
      const isCurrentlyRunning = data?.redis?.running ?? false;
      const res = await apiPost<CachingToggleResponse>("/api/caching/redis/toggle", {
        running: !isCurrentlyRunning,
      });
      setNotice(
        res.message ||
          (res.running ? "Redis service started successfully." : "Redis service stopped."),
      );
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle Redis service");
    } finally {
      setToggling(false);
    }
  }

  async function handleCopySocket(path: string) {
    const ok = await copyText(path);
    if (ok) {
      setCopiedSocket(true);
      setTimeout(() => setCopiedSocket(false), 2000);
    }
  }

  const redis = data?.redis;
  const isRunning = redis?.running ?? false;
  const socketPath = redis?.socketPath || "/var/run/redis/redis.sock";

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-amber-500 shrink-0" aria-hidden="true" />
          <div>
            <CardTitle className="flex items-center gap-2">
              Redis & In-Memory Caching
              {redis && (
                <Badge variant={isRunning ? "green" : "neutral"} className="text-xs">
                  {isRunning ? "Running" : "Stopped"}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              High-performance object caching, session storage, and in-memory key-value engine.
            </CardDescription>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadStatus()}
          disabled={loading || flushing || toggling}
          className="shrink-0"
        >
          <RefreshCw size={14} className={cn("mr-1.5", loading && "animate-spin text-brand")} />
          Refresh
        </Button>
      </CardHeader>

      <CardBody className="grid gap-5">
        {notice && (
          <Alert variant="success">
            <div className="flex items-center justify-between w-full">
              <span>{notice}</span>
              <button
                type="button"
                className="text-xs font-semibold underline ml-2 cursor-pointer"
                onClick={() => setNotice(null)}
              >
                Dismiss
              </button>
            </div>
          </Alert>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            {/* Redis Stats Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Engine</span>
                  <Database size={14} />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {redis?.daemon || "Redis / Valkey"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Version: {redis?.version || "Latest"}
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Memory Usage</span>
                  <Cpu size={14} />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {redis?.memoryUsedHuman || "0 B"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Peak: {redis?.memoryPeakHuman || "0 B"}
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Cached Keys</span>
                  <Layers size={14} />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {redis?.totalKeys?.toLocaleString() ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Clients: {redis?.connectedClients ?? 0}
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>TCP Port</span>
                  <Zap size={14} />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {redis?.port ? `127.0.0.1:${redis.port}` : "127.0.0.1:6379"}
                </p>
                <p className="text-xs text-muted-foreground">Localhost binding</p>
              </div>
            </div>

            {/* UNIX Domain Socket Copy */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/80 bg-card p-3.5">
              <div className="space-y-0.5 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  UNIX Socket Path (Recommended for zero network overhead)
                </span>
                <p className="font-mono text-sm text-foreground break-all">{socketPath}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCopySocket(socketPath)}
                className="shrink-0 gap-1.5"
              >
                {copiedSocket ? (
                  <>
                    <Check size={14} className="text-emerald-500" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copy Socket</span>
                  </>
                )}
              </Button>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/60">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleToggle()}
                  disabled={toggling || flushing}
                  className="gap-1.5"
                >
                  <Power size={14} className={isRunning ? "text-amber-500" : "text-emerald-500"} />
                  {toggling ? "Applying..." : isRunning ? "Stop Service" : "Start Service"}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void handleFlush()}
                  disabled={flushing || !isRunning}
                  className="gap-1.5"
                >
                  {flushing ? (
                    <>
                      <Spinner className="h-3 w-3" />
                      <span>Flushing...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>Flush Cache (FLUSHALL)</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
