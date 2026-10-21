"use client";

import { useCallback, useEffect, useState } from "react";
import type { SiteUsage } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/components/format";
import { HardDrive } from "lucide-react";

export function UsageCard({ domain }: { domain: string }) {
  const [usage, setUsage] = useState<SiteUsage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiFetch<SiteUsage>(`/api/sites/${encodeURIComponent(domain)}/usage`);
      setUsage(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load disk usage");
    }
  }, [domain]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Disk usage</CardTitle>
          <CardDescription>
            Total size of this site&apos;s webroot; symlinks are skipped.
          </CardDescription>
        </div>
        <HardDrive size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardBody>
        {loadError ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : usage === null ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Size</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatBytes(usage.bytes)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Files</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {usage.files.toLocaleString()}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Root</dt>
              <dd className="mt-1 break-all font-mono text-xs text-muted-foreground">{usage.root}</dd>
            </div>
          </dl>
        )}
      </CardBody>
    </Card>
  );
}
