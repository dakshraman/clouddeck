"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  BackupKind,
  BackupUploadTarget,
  CreateBackupRequest,
  MySQLDatabase,
  MySQLListDatabasesResponse,
  Site,
  SiteListResponse,
  Task,
  TaskLogEntry,
} from "@/lib/types";
import { apiFetch, apiPost, HttpError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TaskLog } from "@/components/task-log";

interface CreateBackupCardProps {
  onRefresh: () => void;
}

/** Mirrors the agent's rclone remote rule: "name:path". */
const RCLONE_REMOTE_PATTERN = /^[A-Za-z0-9_.-]+:.+$/;

export function CreateBackupCard({ onRefresh }: CreateBackupCardProps) {
  const [kind, setKind] = useState<BackupKind>("site");
  const [site, setSite] = useState("");
  const [database, setDatabase] = useState("");
  const [downloadOnComplete, setDownloadOnComplete] = useState(false);
  const [telegram, setTelegram] = useState(false);
  const [rclone, setRclone] = useState(false);
  const [remote, setRemote] = useState("");
  const [sites, setSites] = useState<Site[] | null>(null);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [databases, setDatabases] = useState<MySQLDatabase[] | null>(null);
  const [databasesError, setDatabasesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [taskRunning, setTaskRunning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  const loadSites = useCallback(async () => {
    setSites(null);
    setSitesError(null);
    try {
      const data = await apiFetch<SiteListResponse>("/api/sites");
      setSites(data.sites);
    } catch (error) {
      setSitesError(error instanceof Error ? error.message : "Failed to load sites");
    }
  }, []);

  const loadDatabases = useCallback(async () => {
    setDatabases(null);
    setDatabasesError(null);
    try {
      const data = await apiFetch<MySQLListDatabasesResponse>("/api/mysql/databases");
      setDatabases(data.databases);
    } catch (error) {
      setDatabasesError(error instanceof Error ? error.message : "Failed to load databases");
    }
  }, []);

  useEffect(() => {
    void loadSites();
    void loadDatabases();
  }, [loadSites, loadDatabases]);

  const isSite = kind === "site";
  const source = isSite ? site : database;
  const siteOptions =
    sites === null ? null : sites.map((entry) => ({ value: entry.domain, label: entry.domain }));
  const databaseOptions =
    databases === null
      ? null
      : databases.map((entry) => ({ value: entry.name, label: entry.name }));
  const sourceOptions = isSite ? siteOptions : databaseOptions;
  const sourceError = isSite ? sitesError : databasesError;
  const sourceLoading = sourceOptions === null && sourceError === null;
  const noSources = sourceOptions !== null && sourceOptions.length === 0;
  const busy = submitting || taskRunning;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source) {
      setFormError(isSite ? "Select a site to back up." : "Select a database to back up.");
      return;
    }
    const trimmedRemote = remote.trim();
    if (rclone && !RCLONE_REMOTE_PATTERN.test(trimmedRemote)) {
      setFormError('Enter an rclone remote like gdrive:clouddeck/backups (format "name:path").');
      return;
    }

    const uploads: BackupUploadTarget[] = [];
    if (telegram) uploads.push({ type: "telegram" });
    if (rclone) uploads.push({ type: "rclone", remote: trimmedRemote });

    const request: CreateBackupRequest = { kind };
    if (isSite) request.site = source;
    else request.database = source;
    if (uploads.length > 0) request.uploads = uploads;

    setSubmitting(true);
    setFormError(null);
    try {
      const data = await apiPost<{ taskId: string }>("/api/backups", request);
      setTaskId(data.taskId);
      setTaskRunning(true);
    } catch (error) {
      if (error instanceof HttpError && error.status === 412) {
        setFormError(
          `${error.message}. Uncheck Telegram to keep the backup on the server only.`,
        );
      } else {
        setFormError(error instanceof Error ? error.message : "Failed to create the backup");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onTaskDone(task: Task) {
    setTaskRunning(false);
    onRefresh();
    if (downloadOnComplete && task.status === "succeeded") {
      const createdLog = task.logs?.find((l: TaskLogEntry) => /archive\s+([^\s]+)\s+created/.test(l.message));
      const archiveId = createdLog?.message.match(/archive\s+([^\s]+)\s+created/)?.[1];
      if (archiveId) {
        const link = document.createElement("a");
        link.href = `/api/backups/${encodeURIComponent(archiveId)}/download`;
        link.download = archiveId;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Create native .zip backup</CardTitle>
          <CardDescription>
            Creates a portable .zip archive stored on the server which you can restore anytime with 1 click or download to your computer.
          </CardDescription>
        </div>
      </CardHeader>
      <CardBody className="grid gap-5">
        <form onSubmit={onSubmit} className="grid gap-5 sm:max-w-xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="backup-kind">Kind</Label>
              <Select
                id="backup-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as BackupKind)}
                disabled={busy}
              >
                <option value="site">Site</option>
                <option value="database">Database</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Site compresses webroot into .zip; Database dumps SQL into .zip.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="backup-source">{isSite ? "Site" : "Database"}</Label>
              <Select
                id="backup-source"
                value={source}
                onChange={(event) =>
                  isSite ? setSite(event.target.value) : setDatabase(event.target.value)
                }
                disabled={busy || sourceLoading || noSources}
                required
              >
                <option value="">{isSite ? "Select a site" : "Select a database"}</option>
                {sourceOptions?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              {sourceError ? (
                <p className="flex flex-wrap items-center gap-2 text-xs text-red-400">
                  {sourceError}
                  <button
                    type="button"
                    onClick={() => void (isSite ? loadSites() : loadDatabases())}
                    className="cursor-pointer text-brand underline-offset-2 hover:underline"
                  >
                    Retry
                  </button>
                </p>
              ) : noSources ? (
                <p className="text-xs text-muted-foreground">
                  {isSite
                    ? "No sites exist yet — create a site first."
                    : "No databases exist yet — create a database first."}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3.5">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={downloadOnComplete}
                onChange={(event) => setDownloadOnComplete(event.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
              />
              <div>
                <span className="font-medium text-foreground">Download to PC upon completion</span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Keeps the backup safely on the server and automatically triggers a local .zip download to your computer when finished.
                </p>
              </div>
            </label>
          </div>

          <fieldset className="grid gap-3" disabled={busy}>
            <legend className="text-xs font-medium text-muted-foreground">Optional cloud upload</legend>
            <label className="flex items-center gap-2 text-sm text-foreground/80">
              <input
                type="checkbox"
                checked={telegram}
                onChange={(event) => setTelegram(event.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
              />
              Telegram
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground/80">
              <input
                type="checkbox"
                checked={rclone}
                onChange={(event) => setRclone(event.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
              />
              rclone remote
            </label>
            {rclone ? (
              <div className="grid gap-1.5 sm:max-w-md">
                <Label htmlFor="backup-remote">Remote</Label>
                <Input
                  id="backup-remote"
                  value={remote}
                  onChange={(event) => setRemote(event.target.value)}
                  placeholder="gdrive:clouddeck/backups"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  className="font-mono"
                />
              </div>
            ) : null}
          </fieldset>

          {formError ? <Alert variant="error">{formError}</Alert> : null}

          <div>
            <Button type="submit" loading={submitting} disabled={busy || sourceLoading || noSources}>
              Create backup
            </Button>
          </div>
        </form>

        {taskId ? <TaskLog taskId={taskId} onComplete={onTaskDone} /> : null}
      </CardBody>
    </Card>
  );
}
