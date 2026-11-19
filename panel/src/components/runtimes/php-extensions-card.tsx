"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PhpExtension, PhpExtensionsResponse, Task } from "@/lib/types";
import { apiFetch, apiPost, waitForTask } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Check, Download, Power, RefreshCw, Search, Sliders } from "lucide-react";
import { PhpIniModal } from "@/components/runtimes/php-ini-modal";

interface PhpExtensionsCardProps {
  installedPhpVersions?: string[];
}

export function PhpExtensionsCard({ installedPhpVersions = [] }: PhpExtensionsCardProps) {
  const [data, setData] = useState<PhpExtensionsResponse | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "installed" | "available">("all");

  const [toggling, setToggling] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [iniModalOpen, setIniModalOpen] = useState(false);

  const load = useCallback(async (version?: string) => {
    setLoading(true);
    setError(null);
    try {
      const v = version ?? selectedVersion;
      const url = v
        ? `/api/runtimes/php/extensions?version=${encodeURIComponent(v)}`
        : "/api/runtimes/php/extensions";
      const res = await apiFetch<PhpExtensionsResponse>(url);
      setData(res);
      if (!selectedVersion && res.version) {
        setSelectedVersion(res.version);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PHP extensions.");
    } finally {
      setLoading(false);
    }
  }, [selectedVersion]);

  useEffect(() => {
    void load();
  }, [load]);

  const onVersionChange = (newVersion: string) => {
    setSelectedVersion(newVersion);
    setActionNotice(null);
    setActionError(null);
    void load(newVersion);
  };

  const handleToggle = async (ext: PhpExtension) => {
    if (!data?.version || toggling || installing) return;
    setToggling(ext.name);
    setActionNotice(null);
    setActionError(null);
    try {
      const nextState = !ext.enabled;
      await apiPost<{ success: boolean; version: string; extension: string; enabled: boolean }>(
        "/api/runtimes/php/extensions/toggle",
        {
          version: data.version,
          extension: ext.name,
          enabled: nextState,
        },
      );
      setActionNotice(
        `PHP ${data.version} extension "${ext.name}" ${nextState ? "enabled" : "disabled"} and php-fpm reloaded.`,
      );
      await load(data.version);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to toggle extension ${ext.name}.`);
    } finally {
      setToggling(null);
    }
  };

  const handleInstall = async (ext: PhpExtension) => {
    if (!data?.version || toggling || installing) return;
    setInstalling(ext.name);
    setInstallProgress(`Installing php${data.version}-${ext.name}...`);
    setActionNotice(null);
    setActionError(null);
    try {
      const { task } = await apiPost<{ task: Task }>("/api/runtimes/php/extensions/install", {
        version: data.version,
        extension: ext.name,
      });

      if (task?.id) {
        setInstallProgress(`Running installation task (${task.id})...`);
        const finished = await waitForTask(task.id);
        if (finished.status === "succeeded") {
          setActionNotice(
            `PHP ${data.version} extension "${ext.name}" installed successfully and php-fpm reloaded.`,
          );
          await load(data.version);
        } else {
          setActionError(finished.error || `Failed to install extension ${ext.name}.`);
        }
      } else {
        setActionNotice(`Installation of "${ext.name}" started.`);
        await load(data.version);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to install extension ${ext.name}.`);
    } finally {
      setInstalling(null);
      setInstallProgress(null);
    }
  };

  const versionsList = useMemo(() => {
    const list = new Set<string>(["8.4", "8.3", "8.2", "8.1"]);
    if (data?.versions) data.versions.forEach((v) => list.add(v));
    installedPhpVersions.forEach((v) => list.add(v));
    if (data?.version) list.add(data.version);
    return Array.from(list).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  }, [data?.versions, data?.version, installedPhpVersions]);

  const filteredExtensions = useMemo(() => {
    if (!data?.extensions) return [];
    const query = search.trim().toLowerCase();
    return data.extensions.filter((ext) => {
      if (filter === "installed" && !ext.installed) return false;
      if (filter === "available" && ext.installed) return false;
      if (!query) return true;
      return (
        ext.name.toLowerCase().includes(query) ||
        (ext.description && ext.description.toLowerCase().includes(query))
      );
    });
  }, [data?.extensions, search, filter]);

  const stats = useMemo(() => {
    const exts = data?.extensions ?? [];
    const installedCount = exts.filter((e) => e.installed).length;
    const enabledCount = exts.filter((e) => e.installed && e.enabled).length;
    return { total: exts.length, installedCount, enabledCount };
  }, [data?.extensions]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>PHP Extensions</CardTitle>
            {data?.version ? (
              <Badge variant="indigo" className="font-mono text-xs">
                PHP {data.version}
              </Badge>
            ) : null}
            {stats.total > 0 ? (
              <Badge variant="neutral">
                {stats.enabledCount} enabled / {stats.installedCount} installed
              </Badge>
            ) : null}
          </div>
          <CardDescription>
            1-click toggle, enable, and install extensions per coexisting PHP version with automated FPM daemon reload.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {versionsList.length > 1 ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Version:</span>
              <Select
                aria-label="Select PHP version"
                value={selectedVersion || (data?.version ?? "")}
                disabled={loading || toggling !== null || installing !== null}
                className="w-28 font-mono text-xs"
                onChange={(e) => onVersionChange(e.target.value)}
              >
                {versionsList.map((v) => (
                  <option key={v} value={v}>
                    PHP {v}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            disabled={loading || toggling !== null || installing !== null}
            onClick={() => void load()}
            title="Refresh extension status"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : undefined} aria-hidden="true" />
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIniModalOpen(true)}
            title="Open visual php.ini configuration editor"
            className="gap-1.5"
          >
            <Sliders size={13} aria-hidden="true" />
            Edit php.ini
          </Button>
        </div>
      </CardHeader>

      <CardBody className="grid gap-4">
        {actionNotice ? (
          <Alert variant="success" className="text-xs">
            {actionNotice}
          </Alert>
        ) : null}
        {actionError ? (
          <Alert variant="error" className="text-xs">
            {actionError}
          </Alert>
        ) : null}
        {installProgress ? (
          <Alert variant="info" className="flex items-center gap-2 text-xs">
            <Spinner size={14} />
            <span>{installProgress}</span>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : null}

        {/* Filter and search bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative w-full max-w-xs">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Filter extensions (curl, redis, gd)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant={filter === "all" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setFilter("all")}
              className="text-xs"
            >
              All ({data?.extensions?.length ?? 0})
            </Button>
            <Button
              variant={filter === "installed" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setFilter("installed")}
              className="text-xs"
            >
              Installed ({stats.installedCount})
            </Button>
            <Button
              variant={filter === "available" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setFilter("available")}
              className="text-xs"
            >
              Available ({stats.total - stats.installedCount})
            </Button>
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && !data ? (
          <div className="grid gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filteredExtensions.length === 0 ? (
          <div className="rounded-lg border border-border/60 p-6 text-center text-sm text-muted-foreground">
            No PHP extensions match your filter.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Extension</th>
                  <th className="px-4 py-2.5">Description</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredExtensions.map((ext) => {
                  const isTogglingThis = toggling === ext.name;
                  const isInstallingThis = installing === ext.name;
                  const isBusy = toggling !== null || installing !== null;

                  return (
                    <tr key={ext.name} className="transition-colors hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {ext.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {ext.description || `PHP ${ext.name} extension`}
                      </td>
                      <td className="px-4 py-3">
                        {!ext.installed ? (
                          <Badge variant="neutral">Not installed</Badge>
                        ) : ext.enabled ? (
                          <Badge variant="green" className="flex items-center gap-1">
                            <Check size={11} aria-hidden="true" />
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="amber">Disabled</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {ext.installed ? (
                            <Button
                              variant={ext.enabled ? "secondary" : "primary"}
                              size="sm"
                              disabled={isBusy}
                              loading={isTogglingThis}
                              onClick={() => void handleToggle(ext)}
                              className="text-xs"
                              title={ext.enabled ? "Disable extension" : "Enable extension"}
                            >
                              <Power size={12} aria-hidden="true" />
                              {ext.enabled ? "Disable" : "Enable"}
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={isBusy}
                              loading={isInstallingThis}
                              onClick={() => void handleInstall(ext)}
                              className="text-xs"
                              title="Install extension package and restart FPM"
                            >
                              <Download size={12} aria-hidden="true" />
                              Install
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>

      <PhpIniModal
        open={iniModalOpen}
        onOpenChange={setIniModalOpen}
        initialVersion={selectedVersion || (data?.version ?? "8.4")}
        versionsList={versionsList}
        onSaved={() => void load()}
      />
    </Card>
  );
}
