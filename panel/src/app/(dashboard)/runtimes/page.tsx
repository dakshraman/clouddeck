"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RuntimesResponse,
  RuntimeKindInfo,
  Task,
} from "@/lib/types";
import { apiFetch, apiPost, waitForTask } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { Boxes, RefreshCw, Trash2 } from "lucide-react";

const MANAGED_KINDS = ["node", "php"] as const;

const KIND_LABELS: Record<string, string> = {
  node: "Node.js",
  php: "PHP",
  python: "Python",
  go: "Go",
  ruby: "Ruby",
  custom: "Custom command",
};

const KIND_NOTES: Record<string, string> = {
  node: "Official nodejs.org builds under /opt/nodejs. Sites and apps can pick any installed version.",
  php: "PHP-FPM via apt (adds the ondrej PPA when the base repositories are too old).",
};

interface InstalledRuntime {
  version: string;
  bin?: string;
  isDefault?: boolean;
  removable: boolean;
}

function installedFor(data: RuntimesResponse): Record<string, InstalledRuntime[]> {
  const out: Record<string, InstalledRuntime[]> = {};

  for (const kind of data.runtimes as RuntimeKindInfo[]) {
    const byVersion = new Map<string, InstalledRuntime>();
    for (const runtime of kind.versions) {
      const current = byVersion.get(runtime.version);
      const entry: InstalledRuntime = {
        version: runtime.version,
        bin: runtime.bin,
        isDefault: runtime.default,
        // PHP branches and panel-installed Node builds can be removed; OS
        // Node/Python/Go/Ruby entries stay read-only.
        removable:
          kind.kind === "php" ||
          (kind.kind === "node" && (runtime.bin ?? "").startsWith("/opt/nodejs/")),
      };
      if (!current || (!current.removable && entry.removable)) {
        byVersion.set(runtime.version, entry);
      }
    }
    out[kind.kind] = [...byVersion.values()].sort((a, b) =>
      a.version.localeCompare(b.version, undefined, { numeric: true }),
    );
  }

  return out;
}

/** Runtime inventory: what is installed, plus install and uninstall actions. */
export default function RuntimesPage() {
  const [data, setData] = useState<RuntimesResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const runtimes = await apiFetch<RuntimesResponse>("/api/runtimes");
      setData(runtimes);
    } catch (err) {
      setLoadError(await readErrorFromException(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const installed = useMemo(() => (data ? installedFor(data) : {}), [data]);

  async function runTask(key: string, request: Promise<{ task: Task }>, done: string) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const { task } = await request;
      const finished = await waitForTask(task.id);
      if (finished.status === "succeeded") {
        setNotice(done);
        await load();
      } else {
        setError(finished.error || `${done} failed.`);
      }
    } catch (err) {
      setError(await readErrorFromException(err));
    } finally {
      setBusy(null);
    }
  }

  function install(kind: string, version: string) {
    if (!version || busy) return;
    void runTask(
      `install:${kind}:${version}`,
      apiPost<{ task: Task }>("/api/runtimes/install", { kind, version }),
      `${KIND_LABELS[kind] ?? kind} ${version} installed.`,
    ).then(() => setSelected((prev) => ({ ...prev, [kind]: "" })));
  }

  function uninstall(kind: string, version: string) {
    setConfirm(null);
    void runTask(
      `uninstall:${kind}:${version}`,
      apiPost<{ task: Task }>("/api/runtimes/uninstall", { kind, version }),
      `${KIND_LABELS[kind] ?? kind} ${version} uninstalled.`,
    );
  }

  if (loadError) {
    return (
      <>
        <PageHeader title="Runtimes" description="Installed language runtimes and versions." />
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{loadError}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Runtimes" description="Installed language runtimes and versions." />
        <Card className="p-5">
          <div className="grid gap-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </Card>
      </>
    );
  }

  const installable = data.installable ?? {};
  const otherKinds = (data.runtimes as RuntimeKindInfo[]).filter(
    (kind) =>
      !MANAGED_KINDS.includes(kind.kind as (typeof MANAGED_KINDS)[number]) &&
      kind.kind !== "static" &&
      kind.kind !== "custom" &&
      (installed[kind.kind]?.length ?? 0) > 0,
  );

  return (
    <>
      <PageHeader
        title="Runtimes"
        description="Every language runtime detected on this server. Install or remove Node.js and PHP versions without the shell."
        actions={
          <Button variant="secondary" size="md" onClick={() => void load()}>
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </Button>
        }
      />

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
        {MANAGED_KINDS.map((kind) => {
          const rows = installed[kind] ?? [];
          const choices = (installable[kind] ?? []).filter((version) =>
            kind === "php"
              ? !rows.some((row) => row.version === version)
              : !rows.some((row) => row.version.startsWith(`${version}.`)),
          );
          const installKey = `install:${kind}:${selected[kind] ?? ""}`;
          return (
            <Card key={kind}>
              <CardHeader>
                <div>
                  <CardTitle>{KIND_LABELS[kind]}</CardTitle>
                  <CardDescription>{KIND_NOTES[kind]}</CardDescription>
                </div>
                <Badge variant={rows.length > 0 ? "green" : "neutral"}>
                  {rows.length > 0 ? `${rows.length} installed` : "not installed"}
                </Badge>
              </CardHeader>
              <CardBody className="grid gap-5">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Installed
                  </p>
                  {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No version detected.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {rows.map((row) => {
                        const rowKey = `${kind}:${row.version}`;
                        const rowBusy = busy === `uninstall:${kind}:${row.version}`;
                        return (
                          <li
                            key={row.version}
                            className="flex flex-wrap items-center gap-2 py-2.5"
                          >
                            <span className="font-mono text-sm text-foreground">{row.version}</span>
                            {row.isDefault ? <Badge variant="indigo">default</Badge> : null}
                            {row.bin ? (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {row.bin}
                              </span>
                            ) : null}
                            <div className="ml-auto flex items-center gap-2">
                              {!row.removable ? (
                                <span className="text-xs text-muted-foreground">managed by the OS</span>
                              ) : confirm === rowKey ? (
                                <>
                                  <span className="text-xs text-muted-foreground">Remove {row.version}?</span>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    loading={rowBusy}
                                    disabled={busy !== null && !rowBusy}
                                    onClick={() => uninstall(kind, row.version)}
                                  >
                                    Confirm
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-red-400"
                                  disabled={busy !== null}
                                  onClick={() => setConfirm(rowKey)}
                                >
                                  <Trash2 size={14} aria-hidden="true" />
                                  Uninstall
                                </Button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
                  <Select
                    aria-label={`Select a ${KIND_LABELS[kind]} version to install`}
                    value={selected[kind] ?? ""}
                    disabled={busy !== null || choices.length === 0}
                    className="w-48"
                    onChange={(event) =>
                      setSelected((prev) => ({ ...prev, [kind]: event.target.value }))
                    }
                  >
                    <option value="">
                      {choices.length === 0 ? "All supported versions installed" : "Install a version…"}
                    </option>
                    {choices.map((version) => (
                      <option key={version} value={version}>
                        {version}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={busy === installKey}
                    disabled={!selected[kind] || busy !== null}
                    onClick={() => install(kind, selected[kind])}
                  >
                    Install
                  </Button>
                </div>
              </CardBody>
            </Card>
          );
        })}

        {otherKinds.length > 0 ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Other runtimes</CardTitle>
                <CardDescription>
                  Detected on the host. These are managed by the operating system or another tool, so
                  the panel only reports them.
                </CardDescription>
              </div>
              <Boxes size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </CardHeader>
            <CardBody className="grid gap-3">
              {otherKinds.map((kind) => (
                <div key={kind.kind} className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-sm font-medium">{KIND_LABELS[kind.kind] ?? kind.label}</span>
                  {(installed[kind.kind] ?? []).map((row) => (
                    <Badge key={row.version} variant="neutral">
                      {row.version}
                    </Badge>
                  ))}
                </div>
              ))}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}

async function readErrorFromException(err: unknown): Promise<string> {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}
