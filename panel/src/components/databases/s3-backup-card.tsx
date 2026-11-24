"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  CloudStorageProvider,
  MySQLDatabase,
  S3DatabaseBackupConfig,
  S3DatabaseBackupResult,
} from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { formatBytes } from "@/components/format";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Cloud,
  CloudUpload,
  Database,
  ExternalLink,
  FolderOpen,
  HardDrive,
  KeyRound,
  Play,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Trash2,
  X,
  Zap,
} from "lucide-react";

interface ProviderPreset {
  id: CloudStorageProvider;
  name: string;
  defaultEndpoint?: string;
  defaultRegion?: string;
  docUrl: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "aws-s3",
    name: "Amazon S3",
    defaultEndpoint: "https://s3.us-east-1.amazonaws.com",
    defaultRegion: "us-east-1",
    docUrl: "https://aws.amazon.com/s3/",
  },
  {
    id: "cloudflare-r2",
    name: "Cloudflare R2",
    defaultEndpoint: "https://<account-id>.r2.cloudflarestorage.com",
    defaultRegion: "auto",
    docUrl: "https://developers.cloudflare.com/r2/",
  },
  {
    id: "backblaze-b2",
    name: "Backblaze B2",
    defaultEndpoint: "https://s3.us-west-004.backblazeb2.com",
    defaultRegion: "us-west-004",
    docUrl: "https://www.backblaze.com/b2/",
  },
  {
    id: "wasabi",
    name: "Wasabi Hot Cloud",
    defaultEndpoint: "https://s3.wasabisys.com",
    defaultRegion: "us-east-1",
    docUrl: "https://wasabi.com/",
  },
  {
    id: "custom",
    name: "MinIO / Custom S3",
    defaultEndpoint: "http://127.0.0.1:9000",
    defaultRegion: "us-east-1",
    docUrl: "https://min.io/",
  },
];

const DEFAULT_S3_CONFIG: S3DatabaseBackupConfig = {
  enabled: false,
  provider: "aws-s3",
  endpoint: "https://s3.us-east-1.amazonaws.com",
  bucket: "",
  accessKey: "",
  secretKey: "",
  region: "us-east-1",
  prefix: "clouddeck-db-backups/",
  retentionDays: 7,
  frequency: "daily",
  time: "03:00",
  database: "all",
};

interface S3BackupCardProps {
  databases?: MySQLDatabase[] | null;
}

export function S3BackupCard({ databases }: S3BackupCardProps) {
  const [config, setConfig] = useState<S3DatabaseBackupConfig>(DEFAULT_S3_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastBackupResult, setLastBackupResult] = useState<S3DatabaseBackupResult | null>(null);

  const loadConfig = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<S3DatabaseBackupConfig>("/api/backups/database/s3");
      setConfig({
        ...DEFAULT_S3_CONFIG,
        ...data,
        accessKey: data.accessKey || data.access_key || "",
        secretKey: data.secretKey || data.secret_key || "",
        retentionDays: data.retentionDays || data.retention_days || 7,
        lastRunAt: data.lastRunAt || data.last_run_at || null,
        nextRunAt: data.nextRunAt || data.next_run_at || null,
        lastError: data.lastError || data.last_error || "",
      });
    } catch {
      // Use defaults if newly introduced
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  function handleSelectPreset(preset: ProviderPreset) {
    setConfig((prev) => ({
      ...prev,
      provider: preset.id,
      endpoint: preset.defaultEndpoint || "",
      region: preset.defaultRegion || prev.region || "us-east-1",
    }));
  }

  async function handleSave(e?: FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiPost<{ success: boolean; config: S3DatabaseBackupConfig }>(
        "/api/backups/database/s3",
        config,
      );
      if (res.config) {
        setConfig((prev) => ({
          ...prev,
          ...res.config,
          accessKey: res.config.accessKey || res.config.access_key || prev.accessKey,
          secretKey: res.config.secretKey || res.config.secret_key || prev.secretKey,
          retentionDays: res.config.retentionDays || res.config.retention_days || prev.retentionDays,
        }));
      }
      setNotice("S3 Cloud Backup schedule and credentials saved successfully.");
      setShowConfigModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save S3 backup configuration.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!config.bucket?.trim()) {
      setError("Please provide an S3 bucket name.");
      return;
    }
    if (!config.accessKey?.trim() && !config.access_key?.trim()) {
      setError("Please provide an S3 access key.");
      return;
    }
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiPost<{ success: boolean; message: string }>(
        "/api/backups/database/s3/test",
        config,
      );
      if (res.success) {
        setNotice(res.message || "S3 bucket connection and credentials verified successfully!");
      } else {
        setError(res.message || "S3 connectivity test failed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to S3 cloud storage.");
    } finally {
      setTesting(false);
    }
  }

  async function handleBackupNow() {
    setBackingUp(true);
    setError(null);
    setNotice(null);
    setLastBackupResult(null);
    try {
      const res = await apiPost<S3DatabaseBackupResult>("/api/backups/database/s3/run", {
        database: config.database || "all",
      });
      setLastBackupResult(res);
      setNotice(
        res.message ||
          `Backup successfully dumped and transferred to S3 bucket ${config.bucket}.`,
      );
      void loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete S3 database backup.");
    } finally {
      setBackingUp(false);
    }
  }

  if (loading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardBody className="grid gap-3">
          <Skeleton className="h-16 w-full" />
        </CardBody>
      </Card>
    );
  }

  const isConfigured = Boolean(
    config.bucket && (config.accessKey || config.access_key),
  );

  return (
    <>
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CloudUpload size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>S3 Cloud Backups</CardTitle>
                <Badge variant={config.enabled ? "green" : "neutral"} className="text-xs">
                  {config.enabled ? "Automated Schedule Active" : "Schedule Paused"}
                </Badge>
              </div>
              <CardDescription>
                Direct automated database dumps to AWS S3, Cloudflare R2, or Backblaze B2 with retention policy.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfigModal(true)}
              className="gap-1.5"
            >
              <Settings size={14} />
              <span>Configure S3 Backups</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleBackupNow()}
              disabled={backingUp || saving || (!isConfigured && !config.bucket)}
              className="gap-1.5"
            >
              {backingUp ? (
                <>
                  <Spinner className="h-3 w-3" />
                  <span>Dumping & Uploading...</span>
                </>
              ) : (
                <>
                  <Play size={13} className="fill-current" />
                  <span>Backup to S3 Now</span>
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardBody className="space-y-4">
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

          {/* Quick Overview Grid */}
          <div className="grid gap-3 sm:grid-cols-4 rounded-lg border border-border/80 bg-muted/20 p-4">
            <div className="space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Cloud size={13} /> Target Cloud
              </span>
              <p className="text-sm font-semibold text-foreground capitalize">
                {config.provider ? config.provider.replace("-", " ") : "AWS S3"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {config.bucket ? `Bucket: ${config.bucket}` : "No bucket configured"}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar size={13} /> Schedule
              </span>
              <p className="text-sm font-semibold text-foreground capitalize">
                {config.frequency || "Daily"} at {config.time || "03:00"}
              </p>
              <p className="text-xs text-muted-foreground">
                Target: {config.database === "all" || !config.database ? "All non-system DBs" : config.database}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <HardDrive size={13} /> Retention
              </span>
              <p className="text-sm font-semibold text-foreground">
                {config.retentionDays || config.retention_days || 7} Days
              </p>
              <p className="text-xs text-muted-foreground">Older S3 archives auto-pruned</p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock size={13} /> Last Execution
              </span>
              <p className="text-sm font-semibold text-foreground">
                {config.lastRunAt || config.last_run_at
                  ? new Date(config.lastRunAt || config.last_run_at || "").toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Never run"}
              </p>
              {config.lastError || config.last_error ? (
                <p className="text-xs text-red-500 truncate" title={config.lastError || config.last_error}>
                  Error: {config.lastError || config.last_error}
                </p>
              ) : (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Ready</p>
              )}
            </div>
          </div>

          {/* Last Run Results Details if available */}
          {lastBackupResult && lastBackupResult.archives && lastBackupResult.archives.length > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> Direct S3 Backup Completed
                </h5>
                {lastBackupResult.pruned !== undefined && lastBackupResult.pruned > 0 && (
                  <Badge variant="neutral" className="text-xs">
                    {lastBackupResult.pruned} expired archive(s) pruned
                  </Badge>
                )}
              </div>
              <div className="divide-y divide-border/60">
                {lastBackupResult.archives.map((arch) => (
                  <div key={arch.key} className="py-1.5 flex items-center justify-between text-xs">
                    <span className="font-mono text-foreground font-medium flex items-center gap-1.5">
                      <Database size={13} className="text-brand" /> {arch.database}: {arch.key}
                    </span>
                    <span className="text-muted-foreground font-mono">
                      {arch.sizeBytes ? formatBytes(arch.sizeBytes) : "Completed"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* S3 Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <CloudUpload className="text-brand" size={20} />
                <h3 className="text-base font-semibold text-foreground">
                  Configure Direct S3 Database Backups
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              {/* Enable Switch */}
              <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 p-3.5">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Enable Automated Database Backups
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Automatically dump and upload database archives to S3 on the specified schedule.
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, enabled: e.target.checked }))
                    }
                    className="h-5 w-5 rounded border-border text-brand focus:ring-brand"
                  />
                </label>
              </div>

              {/* Provider Preset Buttons */}
              <div className="space-y-2">
                <Label className="text-xs">Select Cloud Storage Provider</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        config.provider === preset.id
                          ? "border-brand bg-brand/10 text-brand font-semibold shadow-sm"
                          : "border-border hover:border-border/80 bg-card text-foreground"
                      }`}
                    >
                      <span className="text-xs">{preset.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate w-full">
                        {preset.id === "cloudflare-r2"
                          ? "Zero egress fees"
                          : preset.id === "backblaze-b2"
                          ? "Low-cost S3"
                          : "AWS standard"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Credentials Grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="s3-bucket" className="text-xs">
                    Bucket Name *
                  </Label>
                  <Input
                    id="s3-bucket"
                    type="text"
                    placeholder="my-company-backups"
                    value={config.bucket || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, bucket: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="s3-region" className="text-xs">
                    Region
                  </Label>
                  <Input
                    id="s3-region"
                    type="text"
                    placeholder="us-east-1 or auto"
                    value={config.region || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, region: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="s3-access-key" className="text-xs">
                    Access Key ID *
                  </Label>
                  <Input
                    id="s3-access-key"
                    type="text"
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    value={config.accessKey || config.access_key || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        accessKey: e.target.value,
                        access_key: e.target.value,
                      }))
                    }
                    required
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="s3-secret-key" className="text-xs">
                    Secret Access Key *
                  </Label>
                  <Input
                    id="s3-secret-key"
                    type="password"
                    placeholder="Leave unchanged to keep existing"
                    value={config.secretKey || config.secret_key || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        secretKey: e.target.value,
                        secret_key: e.target.value,
                      }))
                    }
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="s3-endpoint" className="text-xs">
                    Custom S3 Endpoint (Optional)
                  </Label>
                  <Input
                    id="s3-endpoint"
                    type="text"
                    placeholder="https://<account-id>.r2.cloudflarestorage.com or leave empty for AWS default"
                    value={config.endpoint || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, endpoint: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="s3-prefix" className="text-xs">
                    Storage Prefix / Folder
                  </Label>
                  <Input
                    id="s3-prefix"
                    type="text"
                    placeholder="clouddeck-db-backups/"
                    value={config.prefix || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, prefix: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="s3-retention" className="text-xs">
                    Retention Days
                  </Label>
                  <select
                    id="s3-retention"
                    value={config.retentionDays || config.retention_days || 7}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        retentionDays: Number.parseInt(e.target.value, 10),
                        retention_days: Number.parseInt(e.target.value, 10),
                      }))
                    }
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
                  >
                    <option value={3}>3 Days</option>
                    <option value={7}>7 Days (1 Week)</option>
                    <option value={14}>14 Days (2 Weeks)</option>
                    <option value={30}>30 Days (1 Month)</option>
                    <option value={60}>60 Days (2 Months)</option>
                    <option value={90}>90 Days (Quarter)</option>
                    <option value={365}>365 Days (1 Year)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="s3-frequency" className="text-xs">
                    Backup Frequency
                  </Label>
                  <select
                    id="s3-frequency"
                    value={config.frequency || "daily"}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        frequency: e.target.value as "daily" | "weekly",
                      }))
                    }
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="s3-time" className="text-xs">
                    Execution Time (Server Clock)
                  </Label>
                  <Input
                    id="s3-time"
                    type="time"
                    value={config.time || "03:00"}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, time: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="s3-target-db" className="text-xs">
                    Target Database
                  </Label>
                  <select
                    id="s3-target-db"
                    value={config.database || "all"}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, database: e.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
                  >
                    <option value="all">All Non-System Databases</option>
                    {databases?.map((db) => (
                      <option key={db.name} value={db.name}>
                        {db.name} ({formatBytes(db.sizeBytes ?? 0)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleTestConnection()}
                  disabled={testing || saving}
                  className="gap-1.5"
                >
                  {testing ? (
                    <>
                      <Spinner className="h-3 w-3" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={14} />
                      <span>Test S3 Connection</span>
                    </>
                  )}
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowConfigModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" loading={saving}>
                    Save S3 Settings
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default S3BackupCard;
