"use client";

import { useCallback, useEffect, useState } from "react";
import type { PmaStatusResponse, Task } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { TaskLog } from "@/components/task-log";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, Download } from "lucide-react";

export interface PmaCardProps {
  onInstalled?: () => void;
}

export function PmaCard({ onInstalled }: PmaCardProps = {}) {
  const [status, setStatus] = useState<PmaStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [startingInstall, setStartingInstall] = useState(false);
  const [installFailed, setInstallFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<PmaStatusResponse>("/api/phpmyadmin/status");
      setStatus(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to check for phpMyAdmin");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onInstall() {
    setStartingInstall(true);
    setInstallError(null);
    setInstallFailed(false);
    try {
      const { task } = await apiPost<{ task: Task }>("/api/phpmyadmin/install", {});
      setTaskId(task.id);
    } catch (error) {
      setInstallError(
        error instanceof Error ? error.message : "Failed to start the phpMyAdmin install",
      );
    } finally {
      setStartingInstall(false);
    }
  }

  const onInstallComplete = useCallback(
    async (task: Task) => {
      if (task.status === "succeeded") {
        setTaskId(null);
        setInstallFailed(false);
        await load();
        onInstalled?.();
      } else if (task.status === "failed") {
        setInstallFailed(true);
      }
    },
    [load, onInstalled],
  );

  // When phpMyAdmin is installed, access is directly provided on each database row
  if (status?.installed) {
    return null;
  }

  const urlAvailable =
    status !== null &&
    status.installed &&
    typeof status.port === "number" &&
    typeof status.urlPath === "string";

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>phpMyAdmin</CardTitle>
          <CardDescription>
            Browser-based database administration for this server.
          </CardDescription>
        </div>
        <Database size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardHeader>

      {loadError ? (
        <CardBody>
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        </CardBody>
      ) : status === null ? (
        <CardBody className="grid gap-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-9 sm:max-w-xs" />
        </CardBody>
      ) : !status.installed ? (
        <CardBody className="grid gap-4">
          <div>
            <p className="text-sm text-muted-foreground">phpMyAdmin is not installed on this server.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              CloudDeck can install the latest official release, verify its checksum, configure
              cookie authentication and start it as a systemd service. Point{" "}
              <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs text-foreground">
                AGENT_PHPMYADMIN_DIR
              </code>{" "}
              at an existing installation instead if you already run one.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void onInstall()}
              loading={startingInstall}
              disabled={startingInstall || (taskId !== null && !installFailed)}
            >
              <Download size={16} aria-hidden="true" />
              {installFailed ? "Retry install" : "Install latest phpMyAdmin"}
            </Button>
            {installFailed ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setTaskId(null);
                  setInstallFailed(false);
                }}
              >
                Dismiss
              </Button>
            ) : null}
          </div>
          {installError ? <Alert variant="error">{installError}</Alert> : null}
          {taskId ? (
            <TaskLog taskId={taskId} onComplete={(task) => void onInstallComplete(task)} />
          ) : null}
        </CardBody>
      ) : null}
    </Card>
  );
}
