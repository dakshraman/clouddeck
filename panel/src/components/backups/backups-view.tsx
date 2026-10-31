"use client";

import { useCallback, useEffect, useState } from "react";
import type { BackupArchive, BackupListResponse } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { ArchivesCard } from "@/components/backups/archives-card";
import { CreateBackupCard } from "@/components/backups/create-backup-card";
import { UploadBackupCard } from "@/components/backups/upload-backup-card";

type LoadState = "loading" | "ready" | "error";

export function BackupsView() {
  const [backups, setBackups] = useState<BackupArchive[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setState("loading");
      setErrorMessage(null);
    }
    try {
      const data = await apiFetch<BackupListResponse>("/api/backups");
      setBackups(data.backups);
      setState("ready");
      setErrorMessage(null);
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to load backups");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  return (
    <>
      <PageHeader
        title="Backups"
        description="Backup archives on this server and the tasks that create or restore them."
      />

      {state === "error" ? (
        <Alert variant="error" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage ?? "Failed to load backups"}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      <CreateBackupCard onRefresh={refresh} />

      <div className="mt-6">
        <UploadBackupCard onRefresh={refresh} />
      </div>

      <div className="mt-6">
        {state === "loading" ? (
          <Card className="p-5">
            <div className="grid gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </Card>
        ) : state === "ready" && backups ? (
          <ArchivesCard backups={backups} onRefresh={refresh} />
        ) : null}
      </div>
    </>
  );
}
