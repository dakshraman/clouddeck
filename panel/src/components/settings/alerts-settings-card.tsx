"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AlertsConfig, AlertTestResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Bell,
  BellRing,
  CheckCircle2,
  Cpu,
  HardDrive,
  MessageSquare,
  Radio,
  Send,
  ShieldAlert,
} from "lucide-react";

const DEFAULT_CONFIG: AlertsConfig = {
  telegram: {
    enabled: false,
    botToken: "",
    chatId: "",
  },
  discord: {
    enabled: false,
    webhookUrl: "",
  },
  slack: {
    enabled: false,
    webhookUrl: "",
  },
  thresholds: {
    cpuPercent: 90,
    ramPercent: 90,
    diskPercent: 90,
    serviceDown: true,
    cooldownMinutes: 15,
  },
};

export function AlertsSettingsCard() {
  const [config, setConfig] = useState<AlertsConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<AlertsConfig>("/api/alerts/config");
      setConfig({
        ...DEFAULT_CONFIG,
        ...data,
        telegram: { ...DEFAULT_CONFIG.telegram, ...(data.telegram || {}) },
        discord: { ...DEFAULT_CONFIG.discord, ...(data.discord || {}) },
        slack: { ...DEFAULT_CONFIG.slack, ...(data.slack || {}) },
        thresholds: { ...DEFAULT_CONFIG.thresholds, ...(data.thresholds || {}) },
      });
    } catch {
      // Keep sensible default config if endpoint is newly registered
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function handleSave(e?: FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost("/api/alerts/config", config);
      setNotice("Alert and notification settings saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save alert configuration.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestAlert() {
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiPost<AlertTestResponse>("/api/alerts/test", {});
      setNotice(res.message || "Test notification broadcasted to all active alert channels.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dispatch test notification.");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardBody className="grid gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="text-brand shrink-0" size={18} aria-hidden="true" />
          <div>
            <CardTitle>Alerts & Notifications</CardTitle>
            <CardDescription>
              Real-time multi-channel notifications for high CPU/RAM/Disk loads and service outages.
            </CardDescription>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleTestAlert()}
          disabled={testing || saving}
          className="gap-1.5 shrink-0"
        >
          {testing ? (
            <>
              <Spinner className="h-3 w-3" />
              <span>Testing...</span>
            </>
          ) : (
            <>
              <Send size={13} />
              <span>Send Test Alert</span>
            </>
          )}
        </Button>
      </CardHeader>

      <CardBody className="grid gap-6">
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

        <form onSubmit={handleSave} className="grid gap-6">
          {/* Notification Channels */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageSquare size={16} className="text-muted-foreground" />
              Notification Channels
            </h4>

            {/* Telegram */}
            <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Telegram Bot</span>
                  <Badge variant={config.telegram.enabled ? "green" : "neutral"} className="text-xs">
                    {config.telegram.enabled ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={config.telegram.enabled}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        telegram: { ...prev.telegram, enabled: e.target.checked },
                      }))
                    }
                    className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                  />
                  Enable Telegram
                </label>
              </div>

              {config.telegram.enabled && (
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor="telegram-token" className="text-xs">
                      Bot Token
                    </Label>
                    <Input
                      id="telegram-token"
                      type="password"
                      placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      value={config.telegram.botToken || ""}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          telegram: { ...prev.telegram, botToken: e.target.value },
                        }))
                      }
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="telegram-chat-id" className="text-xs">
                      Chat ID
                    </Label>
                    <Input
                      id="telegram-chat-id"
                      type="text"
                      placeholder="-100123456789 or @channel"
                      value={config.telegram.chatId || ""}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          telegram: { ...prev.telegram, chatId: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Discord */}
            <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Discord Webhook</span>
                  <Badge variant={config.discord.enabled ? "green" : "neutral"} className="text-xs">
                    {config.discord.enabled ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={config.discord.enabled}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        discord: { ...prev.discord, enabled: e.target.checked },
                      }))
                    }
                    className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                  />
                  Enable Discord
                </label>
              </div>

              {config.discord.enabled && (
                <div className="space-y-1 pt-1">
                  <Label htmlFor="discord-url" className="text-xs">
                    Discord Webhook URL
                  </Label>
                  <Input
                    id="discord-url"
                    type="url"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={config.discord.webhookUrl || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        discord: { ...prev.discord, webhookUrl: e.target.value },
                      }))
                    }
                    autoComplete="off"
                  />
                </div>
              )}
            </div>

            {/* Slack */}
            <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Slack Webhook</span>
                  <Badge variant={config.slack.enabled ? "green" : "neutral"} className="text-xs">
                    {config.slack.enabled ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={config.slack.enabled}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        slack: { ...prev.slack, enabled: e.target.checked },
                      }))
                    }
                    className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                  />
                  Enable Slack
                </label>
              </div>

              {config.slack.enabled && (
                <div className="space-y-1 pt-1">
                  <Label htmlFor="slack-url" className="text-xs">
                    Slack Incoming Webhook URL
                  </Label>
                  <Input
                    id="slack-url"
                    type="url"
                    placeholder="https://hooks.slack.com/services/..."
                    value={config.slack.webhookUrl || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        slack: { ...prev.slack, webhookUrl: e.target.value },
                      }))
                    }
                    autoComplete="off"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Trigger Thresholds */}
          <div className="space-y-4 pt-2 border-t border-border/60">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Radio size={16} className="text-muted-foreground" />
              Alert Thresholds & Cooldown
            </h4>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* CPU */}
              <div className="rounded-lg border border-border/80 bg-card p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Cpu size={14} className="text-brand" /> CPU Alert
                  </span>
                  <span className="font-mono text-xs font-bold text-brand">
                    {config.thresholds.cpuPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="99"
                  step="1"
                  value={config.thresholds.cpuPercent}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      thresholds: {
                        ...prev.thresholds,
                        cpuPercent: Number.parseInt(e.target.value, 10),
                      },
                    }))
                  }
                  className="w-full accent-brand cursor-pointer"
                />
                <p className="text-[11px] text-muted-foreground">
                  Trigger alert when CPU exceeds {config.thresholds.cpuPercent}%
                </p>
              </div>

              {/* RAM */}
              <div className="rounded-lg border border-border/80 bg-card p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldAlert size={14} className="text-amber-500" /> RAM Alert
                  </span>
                  <span className="font-mono text-xs font-bold text-amber-500">
                    {config.thresholds.ramPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="99"
                  step="1"
                  value={config.thresholds.ramPercent}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      thresholds: {
                        ...prev.thresholds,
                        ramPercent: Number.parseInt(e.target.value, 10),
                      },
                    }))
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <p className="text-[11px] text-muted-foreground">
                  Trigger alert when RAM exceeds {config.thresholds.ramPercent}%
                </p>
              </div>

              {/* Disk */}
              <div className="rounded-lg border border-border/80 bg-card p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <HardDrive size={14} className="text-red-500" /> Disk Alert
                  </span>
                  <span className="font-mono text-xs font-bold text-red-500">
                    {config.thresholds.diskPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="99"
                  step="1"
                  value={config.thresholds.diskPercent}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      thresholds: {
                        ...prev.thresholds,
                        diskPercent: Number.parseInt(e.target.value, 10),
                      },
                    }))
                  }
                  className="w-full accent-red-500 cursor-pointer"
                />
                <p className="text-[11px] text-muted-foreground">
                  Trigger alert when Disk exceeds {config.thresholds.diskPercent}%
                </p>
              </div>
            </div>

            {/* Service Down & Cooldown */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border/80 bg-muted/10 p-3.5">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={config.thresholds.serviceDown}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      thresholds: { ...prev.thresholds, serviceDown: e.target.checked },
                    }))
                  }
                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                />
                Immediate alert on service crash (Nginx, PHP-FPM, MySQL, Redis)
              </label>

              <div className="flex items-center gap-2 shrink-0">
                <Label htmlFor="cooldown-min" className="text-xs text-muted-foreground">
                  Cooldown:
                </Label>
                <select
                  id="cooldown-min"
                  value={config.thresholds.cooldownMinutes}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      thresholds: {
                        ...prev.thresholds,
                        cooldownMinutes: Number.parseInt(e.target.value, 10),
                      },
                    }))
                  }
                  className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground focus:border-brand focus:outline-none"
                >
                  <option value={5}>5 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" variant="primary" loading={saving}>
              Save Notification Settings
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
