"use client";

import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import type { BackupArchive, BackupUploadResponse, Task } from "@/lib/types";
import { apiFetch, HttpError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { TaskLog } from "@/components/task-log";
import { formatBytes, titleCase } from "@/components/format";
import { CheckCircle2, HardDrive, RotateCcw, UploadCloud, X } from "lucide-react";
import { cn } from "@/components/ui/cn";

interface UploadBackupCardProps {
  onRefresh: () => void;
}

const BACKUP_NAME_REGEX = /^(site-[a-z0-9.-]+-[0-9]{1,10}\.(zip|tar\.gz)|database-[a-z0-9_]{1,64}-[0-9]{1,10}\.(zip|sql\.gz))$/;

export function UploadBackupCard({ onRefresh }: UploadBackupCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Post-upload state
  const [uploadedArchive, setUploadedArchive] = useState<BackupArchive | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreTaskId, setRestoreTaskId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [keptNotice, setKeptNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setFile(null);
    setProgress(null);
    setError(null);
    setUploadedArchive(null);
    setConfirmRestore(false);
    setRestoring(false);
    setRestoreTaskId(null);
    setRestoreError(null);
    setKeptNotice(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFile(selected: File) {
    setError(null);
    setKeptNotice(null);
    setUploadedArchive(null);
    const filename = selected.name.toLowerCase();
    if (!BACKUP_NAME_REGEX.test(filename)) {
      setError(
        `"${selected.name}" does not match the CloudDeck backup format (e.g. site-<domain>-<timestamp>.zip or database-<name>-<timestamp>.zip).`,
      );
      setFile(null);
      return;
    }
    setFile(selected);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!uploading && !restoring) setDragging(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (uploading || restoring) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  }

  async function startUpload() {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    setUploadedArchive(null);
    setKeptNotice(null);

    const formData = new FormData();
    formData.append("file", file, file.name);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      setUploading(false);
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText) as BackupUploadResponse;
          setUploadedArchive(res.archive);
          onRefresh();
        } catch {
          setError("Failed to parse agent response.");
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText) as { error?: { message?: string } };
          setError(errRes.error?.message ?? `Upload failed with HTTP ${xhr.status}`);
        } catch {
          setError(`Upload failed with HTTP ${xhr.status}`);
        }
      }
    });

    xhr.addEventListener("error", () => {
      setUploading(false);
      setProgress(null);
      setError("Network error while uploading backup to server.");
    });

    xhr.addEventListener("abort", () => {
      setUploading(false);
      setProgress(null);
      setError("Upload was aborted.");
    });

    xhr.open("POST", "/api/backups/upload");
    xhr.send(formData);
  }

  async function onRestoreUploaded() {
    if (!uploadedArchive) return;
    setConfirmRestore(false);
    setRestoring(true);
    setRestoreError(null);
    try {
      const { taskId } = await apiFetch<{ taskId: string }>(
        `/api/backups/${encodeURIComponent(uploadedArchive.id)}/restore`,
        { method: "POST" },
      );
      setRestoreTaskId(taskId);
    } catch (err) {
      setRestoring(false);
      setRestoreError(err instanceof Error ? err.message : "Failed to start restore task");
    }
  }

  function onRestoreTaskDone(task: Task) {
    setRestoring(false);
    if (task.status === "failed") {
      setRestoreError(task.error ?? "Restore failed");
    }
    onRefresh();
  }

  function onKeepOnServer() {
    if (!uploadedArchive) return;
    setKeptNotice(
      `Backup "${uploadedArchive.id}" has been registered and kept on the server. You can restore it anytime from the server archives list below.`,
    );
    setFile(null);
    setUploadedArchive(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onRefresh();
  }

  const busy = uploading || restoring;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Upload &amp; restore backup</CardTitle>
          <CardDescription>
            Select or drag a previously downloaded .zip (or legacy .tar.gz / .sql.gz) backup archive from your computer.
          </CardDescription>
        </div>
      </CardHeader>
      <CardBody className="grid gap-5">
        {keptNotice ? (
          <Alert variant="info" className="flex items-center justify-between gap-3">
            <span>{keptNotice}</span>
            <Button variant="ghost" size="sm" onClick={() => setKeptNotice(null)}>
              Dismiss
            </Button>
          </Alert>
        ) : null}

        {error ? <Alert variant="error">{error}</Alert> : null}
        {restoreError ? <Alert variant="error">{restoreError}</Alert> : null}

        {!uploadedArchive && !restoreTaskId ? (
          <div className="grid gap-4 sm:max-w-xl">
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => {
                if (!busy) fileInputRef.current?.click();
              }}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
                dragging
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border hover:border-foreground/30 bg-muted/20 hover:bg-muted/40",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.tar.gz,.sql.gz,.gz,application/zip,application/x-zip-compressed"
                className="hidden"
                disabled={busy}
                onChange={onFileInputChange}
              />

              {file ? (
                <div className="flex flex-col items-center gap-1.5">
                  <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                    <span className="break-all font-mono">{file.name}</span>
                    <Badge variant={file.name.endsWith(".zip") ? "green" : "neutral"} className="text-[10px]">
                      {file.name.endsWith(".zip") ? "ZIP" : "Legacy"}
                    </Badge>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{formatBytes(file.size)}</span>
                  <span className="text-xs text-brand underline underline-offset-2 mt-1">Change file</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <UploadCloud size={32} className="text-muted-foreground/70" />
                  <span className="text-sm font-medium text-foreground">Click or drop backup file here</span>
                  <span className="text-xs text-muted-foreground">
                    Accepts standard portable <span className="font-mono text-foreground">.zip</span> or legacy{" "}
                    <span className="font-mono text-foreground">.tar.gz</span> /{" "}
                    <span className="font-mono text-foreground">.sql.gz</span>
                  </span>
                </div>
              )}
            </div>

            {uploading && progress !== null ? (
              <div className="grid gap-1.5 rounded-lg border border-border bg-muted/40 p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <Spinner size={12} className="text-brand" />
                    Uploading archive to server…
                  </span>
                  <span className="font-mono font-medium text-brand">{progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-brand transition-all duration-150 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => void startUpload()}
                disabled={!file || busy}
                loading={uploading}
              >
                Upload to server
              </Button>
              {file && !busy ? (
                <Button type="button" variant="ghost" onClick={resetState}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {uploadedArchive && !restoreTaskId ? (
          <div className="grid gap-4 sm:max-w-xl rounded-xl border border-border bg-muted/30 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={22} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="grid gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">Archive Uploaded Successfully</span>
                  <Badge variant="green" className="text-[10px]">
                    {uploadedArchive.id.endsWith(".zip") ? "ZIP" : "Legacy"}
                  </Badge>
                </div>
                <p className="font-mono text-xs text-muted-foreground truncate" title={uploadedArchive.id}>
                  {uploadedArchive.id} ({formatBytes(uploadedArchive.sizeBytes)})
                </p>
                <p className="text-xs text-foreground/80 mt-1">
                  What would you like to do with this {titleCase(uploadedArchive.kind)} backup?
                </p>
              </div>
            </div>

            {confirmRestore ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 grid gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-amber-950 dark:text-amber-300">Confirm Restore</h4>
                  <p className="text-xs text-amber-900/90 dark:text-amber-200/90 mt-1">
                    Restoring will overwrite existing data for <strong>{uploadedArchive.source}</strong> on the server with
                    the contents of this archive.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void onRestoreUploaded()}
                    loading={restoring}
                  >
                    Confirm &amp; Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={restoring}
                    onClick={() => setConfirmRestore(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setConfirmRestore(true)}
                  disabled={restoring}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Restore immediately
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onKeepOnServer}
                  disabled={restoring}
                >
                  <HardDrive size={14} aria-hidden="true" />
                  Keep on server only
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetState}
                  disabled={restoring}
                >
                  Upload another
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {restoreTaskId ? (
          <div className="grid gap-3 sm:max-w-xl">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Restoring uploaded backup…</span>
              {!restoring ? (
                <Button variant="ghost" size="sm" onClick={resetState}>
                  Done / Upload another
                </Button>
              ) : null}
            </div>
            <TaskLog taskId={restoreTaskId} onComplete={onRestoreTaskDone} />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
