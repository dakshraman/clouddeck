"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPost, waitForTask } from "@/components/api";
import type { RuntimesResponse, RuntimeKindInfo, Task } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

const KIND_LABELS: Record<string, string> = {
  node: "Node.js",
  php: "PHP",
};

const KIND_NOTES: Record<string, string> = {
  node: "Installs the latest release of the chosen major under /opt/nodejs.",
  php: "Installs PHP-FPM via apt (adds the ondrej PPA when needed).",
};

function installedVersions(data: RuntimesResponse, kind: string): string[] {
  return data.runtimes
    .filter((runtime) => runtime.kind === kind)
    .flatMap((runtime: RuntimeKindInfo) => runtime.versions.map((version) => version.version));
}

/** Install curated Node.js / PHP versions without leaving the panel. */
export function RuntimesCard() {
  const [data, setData] = useState<RuntimesResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const payload = await apiFetch<RuntimesResponse>("/api/runtimes");
      setData(payload);
    } catch (err) {
      setLoadError(await readErrorFromException(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function install(kind: string, version: string) {
    if (!version || pending[kind]) return;
    setError("");
    setNotice("");
    setPending((prev) => ({ ...prev, [kind]: version }));
    try {
      const { task } = await apiPost<{ task: Task }>("/api/runtimes/install", { kind, version });
      const finished = await waitForTask(task.id);
      if (finished.status === "succeeded") {
        setNotice(`${KIND_LABELS[kind] ?? kind} ${version} installed.`);
        setSelected((prev) => ({ ...prev, [kind]: "" }));
        await load();
      } else {
        setError(finished.error || `${KIND_LABELS[kind] ?? kind} ${version} install failed.`);
      }
    } catch (err) {
      setError(await readErrorFromException(err));
    } finally {
      setPending((prev) => {
        const next = { ...prev };
        delete next[kind];
        return next;
      });
    }
  }

  if (loadError) {
    return (
      <Alert variant="error">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{loadError}</span>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Card className="p-5">
        <div className="grid gap-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      </Card>
    );
  }

  const installable = data.installable ?? {};
  const rows = Object.keys(KIND_LABELS).filter((kind) => (installable[kind] ?? []).length > 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Runtimes</h2>
          <p className="text-xs text-muted-foreground">Install extra Node.js or PHP versions for your sites.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {notice ? (
        <Alert variant="success" className="mb-4">
          {notice}
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <div className="grid gap-4">
        {rows.map((kind) => {
          const installed = installedVersions(data, kind);
          const choices = installable[kind] ?? [];
          const busyVersion = pending[kind];
          return (
            <div key={kind} className="grid gap-2 border-t pt-4 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{KIND_LABELS[kind]}</span>
                {installed.length > 0 ? (
                  installed.map((version) => (
                    <Badge key={version} variant="neutral">
                      {version}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">none installed</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label={`Select a ${KIND_LABELS[kind]} version to install`}
                  value={selected[kind] ?? ""}
                  disabled={Boolean(busyVersion)}
                  className="w-48"
                  onChange={(event) =>
                    setSelected((prev) => ({ ...prev, [kind]: event.target.value }))
                  }
                >
                  <option value="">Install a version…</option>
                  {choices.map((version) => (
                    <option key={version} value={version}>
                      {version}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!selected[kind] || Boolean(busyVersion)}
                  onClick={() => void install(kind, selected[kind])}
                >
                  {busyVersion ? (
                    <>
                      <Spinner className="h-3.5 w-3.5" />
                      Installing {busyVersion}…
                    </>
                  ) : (
                    "Install"
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{KIND_NOTES[kind]}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

async function readErrorFromException(err: unknown): Promise<string> {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}