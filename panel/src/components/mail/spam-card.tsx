"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SpamConfig, SpamStatusResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { CheckCircle2, Filter, ShieldAlert, ShieldCheck, Sliders, Zap } from "lucide-react";

const DEFAULT_CONFIG: SpamConfig = {
  enabled: true,
  engine: "rspamd",
  spamScoreThreshold: 6.0,
  rejectScoreThreshold: 15.0,
  greylistingEnabled: true,
};

export function SpamCard() {
  const [config, setConfig] = useState<SpamConfig>(DEFAULT_CONFIG);
  const [running, setRunning] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<SpamStatusResponse>("/api/mail/spam/status");
      setConfig(res.config || DEFAULT_CONFIG);
      setRunning(res.running);
    } catch {
      // Sensible defaults
      setConfig(DEFAULT_CONFIG);
      setRunning(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost("/api/mail/spam/config", config);
      setNotice("Anti-spam thresholds and protection rules saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update anti-spam settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2">
              Spam Filtering & Protection
              <Badge variant={config.enabled && running ? "green" : "neutral"} className="text-xs">
                {config.enabled && running ? `${config.engine || "Rspamd"} Active` : "Inactive"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Heuristic, statistical, and DNSBL spam analysis with automated quarantine and greylisting.
            </CardDescription>
          </div>
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
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="grid gap-5">
            {/* Toggle Switch */}
            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 p-4">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-foreground">Anti-Spam Engine</span>
                <p className="text-xs text-muted-foreground">
                  Score incoming messages using SPF, DKIM, DMARC, and Rspamd statistical filters.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                />
                Enabled
              </label>
            </div>

            {/* Threshold Sliders */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Spam Threshold */}
              <div className="rounded-lg border border-border/80 bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Filter size={14} className="text-amber-500" /> Mark as Spam Score
                  </span>
                  <span className="font-mono text-xs font-bold text-amber-500">
                    {config.spamScoreThreshold.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="12"
                  step="0.5"
                  value={config.spamScoreThreshold}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      spamScoreThreshold: Number.parseFloat(e.target.value),
                    }))
                  }
                  disabled={!config.enabled}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <p className="text-[11px] text-muted-foreground">
                  Messages scoring above {config.spamScoreThreshold.toFixed(1)} are flagged with [SPAM] and delivered to Junk.
                </p>
              </div>

              {/* Reject Threshold */}
              <div className="rounded-lg border border-border/80 bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldAlert size={14} className="text-red-500" /> Outright Reject Score
                  </span>
                  <span className="font-mono text-xs font-bold text-red-500">
                    {config.rejectScoreThreshold.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="25"
                  step="0.5"
                  value={config.rejectScoreThreshold}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      rejectScoreThreshold: Number.parseFloat(e.target.value),
                    }))
                  }
                  disabled={!config.enabled}
                  className="w-full accent-red-500 cursor-pointer"
                />
                <p className="text-[11px] text-muted-foreground">
                  Messages scoring above {config.rejectScoreThreshold.toFixed(1)} are rejected at SMTP level with a 550 error.
                </p>
              </div>
            </div>

            {/* Greylisting Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/10 p-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={config.greylistingEnabled}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, greylistingEnabled: e.target.checked }))
                  }
                  disabled={!config.enabled}
                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                />
                Enable Greylisting (Temporarily defers first-time unknown senders to filter automated spam bots)
              </label>
            </div>

            <div className="flex justify-end pt-1">
              <Button type="submit" variant="primary" loading={saving} disabled={!config.enabled}>
                Save Spam Protection Rules
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
