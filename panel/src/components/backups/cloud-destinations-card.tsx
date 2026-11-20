"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  BackupDestination,
  BackupDestinationListResponse,
  BackupDestinationTestRequest,
  BackupDestinationTestResponse,
  CloudStorageProvider,
} from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Check,
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  FolderOpen,
  HardDrive,
  KeyRound,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Trash2,
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
    id: "cloudflare-r2",
    name: "Cloudflare R2",
    defaultEndpoint: "https://<account-id>.r2.cloudflarestorage.com",
    defaultRegion: "auto",
    docUrl: "https://developers.cloudflare.com/r2/",
  },
  {
    id: "aws-s3",
    name: "Amazon S3",
    defaultRegion: "us-east-1",
    docUrl: "https://aws.amazon.com/s3/",
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
    id: "minio",
    name: "MinIO / Self-Hosted",
    defaultEndpoint: "http://127.0.0.1:9000",
    defaultRegion: "us-east-1",
    docUrl: "https://min.io/",
  },
];

export function CloudDestinationsCard() {
  const [destinations, setDestinations] = useState<BackupDestination[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [provider, setProvider] = useState<CloudStorageProvider>("cloudflare-r2");
  const [name, setName] = useState("Cloudflare R2 Daily");
  const [endpoint, setEndpoint] = useState("");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("auto");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [prefix, setPrefix] = useState("clouddeck-backups/");

  const loadDestinations = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<BackupDestinationListResponse>("/api/backups/destinations");
      setDestinations(res.destinations || []);
    } catch {
      setDestinations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDestinations();
  }, [loadDestinations]);

  function handleSelectPreset(preset: ProviderPreset) {
    setProvider(preset.id);
    setName(`${preset.name} Storage`);
    setEndpoint(preset.defaultEndpoint || "");
    setRegion(preset.defaultRegion || "");
  }

  async function handleTest() {
    if (!bucket.trim() || !accessKey.trim() || !secretKey.trim()) {
      setError("Bucket name, access key, and secret key are required to test the connection.");
      return;
    }
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      const payload: BackupDestinationTestRequest = {
        provider,
        endpoint: endpoint.trim() || undefined,
        bucket: bucket.trim(),
        region: region.trim() || undefined,
        accessKey: accessKey.trim(),
        secretKey: secretKey.trim(),
        prefix: prefix.trim() || undefined,
      };
      const res = await apiPost<BackupDestinationTestResponse>(
        "/api/backups/destinations/test",
        payload,
      );
      setNotice(res.message || "Connection verified! S3 credentials and bucket write access confirmed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to cloud storage destination.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !bucket.trim() || !accessKey.trim() || !secretKey.trim()) {
      setError("Please fill out all required destination fields.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost("/api/backups/destinations", {
        name: name.trim(),
        provider,
        endpoint: endpoint.trim() || undefined,
        bucket: bucket.trim(),
        region: region.trim() || undefined,
        accessKey: accessKey.trim(),
        secretKey: secretKey.trim(),
        prefix: prefix.trim() || undefined,
      });
      setNotice(`Destination "${name}" configured successfully!`);
      setShowAddForm(false);
      // Reset sensitive fields
      setSecretKey("");
      await loadDestinations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cloud storage destination.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    setNotice(null);
    try {
      await fetch(`/api/backups/destinations/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setNotice("Storage destination deleted.");
      await loadDestinations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove destination.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <Cloud size={18} aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Cloud Storage Destinations</CardTitle>
            <CardDescription>
              Offsite S3-compatible replication for zero-data-loss disaster recovery.
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="gap-1.5"
          >
            <Plus size={14} />
            <span>{showAddForm ? "Cancel" : "Add Destination"}</span>
          </Button>
        </div>
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

        {/* Add Destination Form with 1-Click Presets */}
        {showAddForm && (
          <div className="rounded-lg border border-border/80 bg-muted/20 p-5 space-y-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Zap size={15} className="text-amber-500" /> 1-Click Provider Presets
              </h4>
              <p className="text-xs text-muted-foreground">
                Select your cloud storage provider to automatically populate default endpoints and regions.
              </p>
            </div>

            {/* Provider Preset Buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              {PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                    provider === preset.id
                      ? "border-brand bg-brand/10 text-brand font-semibold"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>

            <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2 pt-2">
              <div className="space-y-1">
                <Label htmlFor="dest-name" className="text-xs">
                  Destination Name
                </Label>
                <Input
                  id="dest-name"
                  type="text"
                  placeholder="e.g. Daily S3 Offsite"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="dest-bucket" className="text-xs">
                  Bucket Name
                </Label>
                <Input
                  id="dest-bucket"
                  type="text"
                  placeholder="e.g. my-clouddeck-backups"
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="dest-endpoint" className="text-xs">
                  S3 Endpoint URL (Required for R2, B2, Wasabi, MinIO)
                </Label>
                <Input
                  id="dest-endpoint"
                  type="text"
                  placeholder="https://<account-id>.r2.cloudflarestorage.com"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="dest-region" className="text-xs">
                  Region
                </Label>
                <Input
                  id="dest-region"
                  type="text"
                  placeholder="auto or us-east-1"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="dest-access-key" className="text-xs">
                  Access Key ID
                </Label>
                <Input
                  id="dest-access-key"
                  type="text"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="dest-secret-key" className="text-xs">
                  Secret Access Key
                </Label>
                <Input
                  id="dest-secret-key"
                  type="password"
                  placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="dest-prefix" className="text-xs">
                  Storage Prefix / Folder (optional)
                </Label>
                <Input
                  id="dest-prefix"
                  type="text"
                  placeholder="clouddeck-backups/"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2 pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleTest()}
                  disabled={testing || saving}
                  className="gap-1.5"
                >
                  {testing ? <Spinner className="h-3 w-3" /> : <HardDrive size={13} />}
                  <span>Test Connection</span>
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" loading={saving}>
                    Save Destination
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Configured Destinations List */}
        {loading ? (
          <div className="grid gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : destinations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 p-8 text-center space-y-2">
            <Cloud size={24} className="mx-auto text-muted-foreground/60" />
            <h4 className="text-sm font-medium text-foreground">No offsite destinations configured</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Add Cloudflare R2, AWS S3, or Backblaze B2 to automatically mirror backups off-server.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Configured Storage Providers ({destinations.length})
            </span>
            <div className="grid gap-3 sm:grid-cols-2">
              {destinations.map((dest) => (
                <div
                  key={dest.id}
                  className="flex flex-col justify-between rounded-lg border border-border/80 bg-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {dest.name}
                        </span>
                        <Badge variant="indigo" className="text-[10px] capitalize">
                          {dest.provider}
                        </Badge>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground">
                        Bucket: <span className="text-foreground">{dest.bucket}</span>
                      </p>
                      {dest.prefix && (
                        <p className="text-[11px] text-muted-foreground">
                          Prefix: <span className="font-mono text-foreground/80">{dest.prefix}</span>
                        </p>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDelete(dest.id)}
                      disabled={deletingId === dest.id}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-8 w-8 p-0"
                    >
                      {deletingId === dest.id ? <Spinner className="h-3 w-3" /> : <Trash2 size={14} />}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/60">
                    <span>Region: {dest.region || "auto"}</span>
                    <span>Created: {new Date(dest.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
