"use client";

import { useState } from "react";
import type { BackupArchive, Task } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { TaskLog } from "@/components/task-log";
import { formatBytes, shortDateTime, titleCase } from "@/components/format";
import { Archive, Download, RotateCcw, Trash2 } from "lucide-react";

interface ArchivesCardProps {
  backups: BackupArchive[];
  onRefresh: () => void;
}

interface ConfirmAction {
  id: string;
  action: "restore" | "delete";
}

export function ArchivesCard({ backups, onRefresh }: ArchivesCardProps) {
  const [confirming, setConfirming] = useState<ConfirmAction | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreTaskId, setRestoreTaskId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  function clearRowError(id: string) {
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function onRestore(archive: BackupArchive) {
    setConfirming(null);
    clearRowError(archive.id);
    setRestoringId(archive.id);
    try {
      const { taskId } = await apiFetch<{ taskId: string }>(
        `/api/backups/${encodeURIComponent(archive.id)}/restore`,
        { method: "POST" },
      );
      setRestoreTaskId(taskId);
    } catch (error) {
      setRestoringId(null);
      setRowErrors((prev) => ({
        ...prev,
        [archive.id]: error instanceof Error ? error.message : "Restore failed",
      }));
    }
  }

  function onRestoreTaskDone(task: Task) {
    const rowId = restoringId;
    if (task.status === "failed" && rowId) {
      setRowErrors((prev) => ({ ...prev, [rowId]: task.error ?? "Restore failed" }));
    }
    setRestoringId(null);
    onRefresh();
  }

  async function onDelete(archive: BackupArchive) {
    setConfirming(null);
    clearRowError(archive.id);
    setDeletingId(archive.id);
    try {
      await apiFetch<{ id: string; deleted: boolean }>(
        `/api/backups/${encodeURIComponent(archive.id)}`,
        { method: "DELETE" },
      );
      onRefresh();
    } catch (error) {
      setRowErrors((prev) => ({
        ...prev,
        [archive.id]: error instanceof Error ? error.message : "Delete failed",
      }));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card className={backups.length > 0 ? "overflow-hidden" : undefined}>
      <CardHeader>
        <div>
          <CardTitle>Backup archives</CardTitle>
          <CardDescription>Archives stored on this server, newest first.</CardDescription>
        </div>
      </CardHeader>

      {backups.length === 0 ? (
        <CardBody>
          <EmptyState
            icon={Archive}
            title="No backups yet"
            description="Backup archives are stored on the server. Creating one can also send it to Telegram or an rclone remote (Google Drive, MEGA, Dropbox)."
          />
        </CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Archive</th>
                <th className="px-5 py-3 text-left font-medium">Kind</th>
                <th className="px-5 py-3 text-left font-medium">Source</th>
                <th className="px-5 py-3 text-right font-medium">Size</th>
                <th className="px-5 py-3 text-left font-medium">Created</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((archive) => {
                const isDeleting = deletingId === archive.id;
                const isRestoring = restoringId === archive.id;
                const busyElsewhere = restoringId !== null && !isRestoring;
                const confirmingAction = confirming?.id === archive.id ? confirming.action : null;
                const rowError = rowErrors[archive.id];
                return (
                  <tr key={archive.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="block max-w-60 truncate font-mono text-sm text-foreground"
                          title={archive.id}
                        >
                          {archive.id}
                        </span>
                        {archive.id.endsWith(".zip") ? (
                          <Badge variant="green" className="text-[10px] font-semibold uppercase tracking-wider">
                            ZIP
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px] uppercase tracking-wider">
                            Legacy
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={archive.kind === "site" ? "indigo" : "amber"}>
                        {titleCase(archive.kind)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="block max-w-48 truncate font-mono text-sm text-muted-foreground"
                        title={archive.source}
                      >
                        {archive.source}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-muted-foreground">
                      {formatBytes(archive.sizeBytes)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {shortDateTime(archive.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {isDeleting ? (
                          <span className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                            <Spinner size={14} className="text-muted-foreground" />
                            deleting…
                          </span>
                        ) : isRestoring ? (
                          <span className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                            <Spinner size={14} className="text-muted-foreground" />
                            restoring…
                          </span>
                        ) : confirmingAction === "restore" ? (
                          <div className="flex items-center gap-1.5 rounded-md border border-border bg-background/80 p-1">
                            <span className="mr-1 text-xs text-muted-foreground">Restore to {archive.source}?</span>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="text-xs font-medium"
                              onClick={() => void onRestore(archive)}
                            >
                              Confirm Restore
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : confirmingAction === "delete" ? (
                          <div className="flex items-center gap-1.5 rounded-md border border-border bg-background/80 p-1">
                            <span className="mr-1 text-xs text-muted-foreground">Delete {archive.id}?</span>
                            <Button
                              variant="danger"
                              size="sm"
                              className="text-xs font-medium"
                              onClick={() => void onDelete(archive)}
                            >
                              Confirm Delete
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <a
                              href={`/api/backups/${encodeURIComponent(archive.id)}/download`}
                              download={archive.id}
                              className={buttonClass("ghost", "sm")}
                              title="Download to PC"
                            >
                              <Download size={14} aria-hidden="true" />
                              Download
                            </a>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busyElsewhere}
                              onClick={() => setConfirming({ id: archive.id, action: "restore" })}
                              title="Restore directly on server"
                            >
                              <RotateCcw size={14} aria-hidden="true" />
                              Restore
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-red-400"
                              disabled={busyElsewhere}
                              onClick={() => setConfirming({ id: archive.id, action: "delete" })}
                              aria-label={`Delete ${archive.id}`}
                              title="Delete archive from server"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                      {rowError ? (
                        <p
                          className="mt-1 max-w-56 truncate text-right text-xs text-red-400"
                          title={rowError}
                        >
                          {rowError}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {restoreTaskId ? (
        <div className="px-5 pb-5 pt-4">
          <TaskLog taskId={restoreTaskId} onComplete={onRestoreTaskDone} />
        </div>
      ) : null}
    </Card>
  );
}
