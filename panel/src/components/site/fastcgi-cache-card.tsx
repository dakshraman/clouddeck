"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { FastCgiCacheConfig, FastCgiCachePurgeResponse } from "@/lib/types";
import { apiFetch, apiPost, HttpError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Clock, Flame, Gauge, Layers, RefreshCw, Trash2, Zap } from "lucide-react";

interface FastCgiCacheCardProps {
  domain: string;
}

const DEFAULT_CACHE: FastCgiCacheConfig = {
  enabled: false,
  durationMinutes: 60,
  bypassCookies: ["wordpress_logged_in_", "comment_author_", "woocommerce_items_in_cart"],
  status: "disabled",
};

export function FastCgiCacheCard({ domain }: FastCgiCacheCardProps) {
  const [config, setConfig] = useState<FastCgiCacheConfig>(DEFAULT_CACHE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<FastCgiCacheConfig>(
        `/api/sites/${encodeURIComponent(domain)}/cache`,
      );
      setConfig({
        ...DEFAULT_CACHE,
        ...data,
      });
    } catch {
      // Sensible defaults if not yet customized
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function handleToggle(enabled: boolean) {
    const updated = { ...config, enabled, status: (enabled ? "active" : "disabled") as "active" | "disabled" };
    setConfig(updated);
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await apiPost(`/api/sites/${encodeURIComponent(domain)}/cache`, updated);
      setNotice(
        enabled
          ? "FastCGI microcaching enabled. Dynamic PHP responses will be cached at nginx edge."
          : "FastCGI microcaching disabled.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update cache settings");
      // Revert on error
      setConfig(config);
    } finally {
      setSaving(false);
    }
  }

  async function handlePurge() {
    setPurging(true);
    setNotice(null);
    setError(null);
    try {
      const res = await apiPost<FastCgiCachePurgeResponse>(
        `/api/sites/${encodeURIComponent(domain)}/cache/purge`,
        {},
      );
      setNotice(res.message || "FastCGI cache cleared successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to purge FastCGI cache");
    } finally {
      setPurging(false);
    }
  }

  async function handleSaveDuration(durationMinutes: number) {
    const updated = { ...config, durationMinutes };
    setConfig(updated);
    setSaving(true);
    try {
      await apiPost(`/api/sites/${encodeURIComponent(domain)}/cache`, updated);
      setNotice(`Cache TTL updated to ${durationMinutes} minutes.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update cache TTL");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-amber-500 shrink-0" aria-hidden="true" />
          <div>
            <CardTitle className="flex items-center gap-2">
              FastCGI Edge Cache
              <Badge variant={config.enabled ? "green" : "neutral"} className="text-xs">
                {config.enabled ? "Active" : "Disabled"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Microcaching layer at the Nginx edge to serve dynamic WordPress and PHP sites at 10x speed.
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handlePurge()}
            disabled={purging || !config.enabled}
            className="gap-1.5"
          >
            {purging ? (
              <>
                <Spinner className="h-3 w-3" />
                <span>Purging...</span>
              </>
            ) : (
              <>
                <Trash2 size={13} />
                <span>Purge Cache</span>
              </>
            )}
          </Button>
        </div>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            {/* Toggle Switch */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border/80 bg-muted/20 p-4">
              <div className="space-y-1">
                <span className="text-sm font-semibold text-foreground">
                  Nginx FastCGI Microcache
                </span>
                <p className="text-xs text-muted-foreground">
                  Caches rendered HTML responses directly in RAM/fast SSD disk, bypassing PHP-FPM execution.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Button
                  variant={config.enabled ? "secondary" : "primary"}
                  size="sm"
                  onClick={() => void handleToggle(!config.enabled)}
                  disabled={saving}
                  className="gap-1.5"
                >
                  {saving ? <Spinner className="h-3 w-3" /> : <Flame size={14} />}
                  {config.enabled ? "Disable Cache" : "Enable Cache"}
                </Button>
              </div>
            </div>

            {/* TTL & Bypass Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border/60 bg-card p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Clock size={14} className="text-muted-foreground" /> Cache TTL
                  </span>
                  <span className="font-mono text-xs text-brand font-semibold">
                    {config.durationMinutes} min
                  </span>
                </div>
                <select
                  value={config.durationMinutes}
                  onChange={(e) => void handleSaveDuration(Number(e.target.value))}
                  disabled={!config.enabled || saving}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
                >
                  <option value={5}>5 minutes (High freshness)</option>
                  <option value={15}>15 minutes (Recommended for active sites)</option>
                  <option value={60}>60 minutes (1 hour - standard)</option>
                  <option value={720}>12 hours (High traffic)</option>
                  <option value={1440}>24 hours (Static-like)</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Time-to-live before Nginx revalidates with backend PHP-FPM.
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-card p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Layers size={14} className="text-muted-foreground" /> Auto-Bypass Cookies
                  </span>
                  <Badge variant="neutral" className="text-[10px]">
                    {config.bypassCookies?.length ?? 3} rules
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Logged-in administrators, comment authors, and checkout shopping carts automatically bypass the cache.
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  <code className="text-[10px] bg-muted/60 px-1.5 py-0.5 rounded text-foreground/80 font-mono">
                    wordpress_logged_in_
                  </code>
                  <code className="text-[10px] bg-muted/60 px-1.5 py-0.5 rounded text-foreground/80 font-mono">
                    comment_author_
                  </code>
                </div>
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
