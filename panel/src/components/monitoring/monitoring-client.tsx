"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentService,
  KillProcessResponse,
  ProcessInfo,
  ProcessListResponse,
  RebootResponse,
  ServiceListResponse,
  SystemInfo,
} from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ProcessesCard, type ProcessSort } from "@/components/monitoring/processes-card";
import { ServiceCard } from "@/components/monitoring/service-card";
import { formatBytes, percentOf, usageTone } from "@/components/format";
import { Cpu, HardDrive, MemoryStick, Power, Server } from "lucide-react";

const POLL_INTERVAL_MS = 5000;

type LoadState = "loading" | "ready" | "error";

function formatUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function MonitoringClient() {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [services, setServices] = useState<AgentService[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [systemError, setSystemError] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [processes, setProcesses] = useState<ProcessListResponse | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processLoading, setProcessLoading] = useState(true);
  const [processSort, setProcessSort] = useState<ProcessSort>("cpu");
  const [restarting, setRestarting] = useState<string | null>(null);
  const [restartErrors, setRestartErrors] = useState<Record<string, string>>({});
  const [killing, setKilling] = useState<number | null>(null);
  const [killError, setKillError] = useState<string | null>(null);
  const [rebooting, setRebooting] = useState(false);
  const [rebootMessage, setRebootMessage] = useState<string | null>(null);
  const [rebootError, setRebootError] = useState<string | null>(null);
  const pollInFlight = useRef(false);
  const processRequest = useRef(0);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setState("loading");
      setSystemError(null);
      setServicesError(null);
    }

    const [systemResult, servicesResult] = await Promise.allSettled([
      apiFetch<SystemInfo>("/api/system"),
      apiFetch<ServiceListResponse>("/api/services"),
    ]);

    if (systemResult.status === "fulfilled") {
      setSystem(systemResult.value);
      setSystemError(null);
      setState("ready");
    } else {
      setSystemError(
        systemResult.reason instanceof Error
          ? systemResult.reason.message
          : "Cannot reach the CloudDeck agent",
      );
      if (!options?.silent) {
        setSystem(null);
        setState("error");
      }
    }

    if (servicesResult.status === "fulfilled") {
      setServices(servicesResult.value.services);
      setServicesError(null);
    } else {
      setServicesError(
        servicesResult.reason instanceof Error
          ? servicesResult.reason.message
          : "Failed to load services",
      );
    }
  }, []);

  const loadProcesses = useCallback(
    async (sort: ProcessSort, options?: { silent?: boolean }) => {
      const requestId = ++processRequest.current;
      if (!options?.silent) {
        setProcessLoading(true);
        setProcessError(null);
      }

      try {
        const result = await apiFetch<ProcessListResponse>(`/api/processes?sort=${sort}`);
        if (requestId !== processRequest.current) return;
        setProcesses(result);
        setProcessError(null);
      } catch (error) {
        if (requestId !== processRequest.current) return;
        setProcessError(
          error instanceof Error ? error.message : "Failed to load processes",
        );
        if (!options?.silent) {
          setProcesses(null);
        }
      } finally {
        if (requestId === processRequest.current) {
          setProcessLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadProcesses(processSort);
  }, [loadProcesses, processSort]);

  useEffect(() => {
    // Pause polling while a restart runs so a stale probe cannot overwrite the
    // freshly probed state; skip ticks that would overlap the previous poll.
    if (restarting !== null) return;
    const timer = setInterval(() => {
      if (pollInFlight.current) return;
      pollInFlight.current = true;
      void Promise.allSettled([
        load({ silent: true }),
        loadProcesses(processSort, { silent: true }),
      ]).finally(() => {
        pollInFlight.current = false;
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load, loadProcesses, processSort, restarting]);

  async function onRestart(service: AgentService) {
    if (!window.confirm(`Restart ${service.label}? The service may be briefly unavailable.`)) {
      return;
    }

    setRestartErrors((prev) => {
      const next = { ...prev };
      delete next[service.name];
      return next;
    });
    setRestarting(service.name);

    try {
      await apiFetch<AgentService>(`/api/services/${encodeURIComponent(service.name)}/restart`, {
        method: "POST",
      });
      await load({ silent: true });
    } catch (error) {
      setRestartErrors((prev) => ({
        ...prev,
        [service.name]: error instanceof Error ? error.message : "Restart failed",
      }));
    } finally {
      setRestarting(null);
    }
  }

  async function onKill(process: ProcessInfo) {
    const command =
      process.command.length > 60 ? `${process.command.slice(0, 60)}…` : process.command;
    if (
      !window.confirm(
        `Kill PID ${process.pid} (${command})? It gets SIGTERM, then SIGKILL after 2 seconds.`,
      )
    ) {
      return;
    }

    setKilling(process.pid);
    setKillError(null);
    try {
      await apiPost<KillProcessResponse>("/api/processes", { pid: process.pid });
      await loadProcesses(processSort, { silent: true });
    } catch (error) {
      setKillError(error instanceof Error ? error.message : "Failed to kill the process");
    } finally {
      setKilling(null);
    }
  }

  async function onRebootServer() {
    if (
      !window.confirm(
        "Reboot the server? Everything on it — including this panel — goes down until the machine is back.",
      )
    ) {
      return;
    }
    setRebooting(true);
    setRebootError(null);
    setRebootMessage(null);
    try {
      await apiFetch<RebootResponse>("/api/system/reboot", { method: "POST" });
      setRebootMessage("Reboot initiated. The panel returns once the server is back up.");
    } catch (error) {
      setRebootError(error instanceof Error ? error.message : "Reboot failed");
    } finally {
      setRebooting(false);
    }
  }

  const memoryPercent = system ? percentOf(system.memory.usedBytes, system.memory.totalBytes) : 0;
  const diskPercent = system ? percentOf(system.disk.usedBytes, system.disk.totalBytes) : 0;

  return (
    <>
      <PageHeader
        title="Monitoring"
        description="Host metrics, top processes, and web-stack services, refreshed every 5 seconds."
        actions={
          system && !system.dryRun ? (
            <Button variant="outline" size="sm" disabled={rebooting} onClick={() => void onRebootServer()}>
              <Power size={13} aria-hidden="true" />
              Reboot server
            </Button>
          ) : null
        }
      />

      {rebootMessage ? <Alert className="mb-6">{rebootMessage}</Alert> : null}
      {rebootError ? <Alert variant="error" className="mb-6">{rebootError}</Alert> : null}

      {systemError ? (
        <Alert variant="error" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{systemError}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {state === "loading" ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : null}

        {state === "ready" && system ? (
          <>
            <StatCard
              label="CPU"
              value={`${Math.round(system.cpu.usagePercent)}%`}
              sub={`${system.cpu.cores} ${system.cpu.cores === 1 ? "core" : "cores"}`}
              icon={Cpu}
              progress={system.cpu.usagePercent}
              tone={usageTone(system.cpu.usagePercent)}
            />
            <StatCard
              label="Memory"
              value={formatBytes(system.memory.usedBytes)}
              sub={`of ${formatBytes(system.memory.totalBytes)} · ${Math.round(memoryPercent)}% used`}
              icon={MemoryStick}
              progress={memoryPercent}
              tone={usageTone(memoryPercent)}
            />
            <StatCard
              label="Disk"
              value={formatBytes(system.disk.usedBytes)}
              sub={`of ${formatBytes(system.disk.totalBytes)} · ${system.disk.mount}`}
              icon={HardDrive}
              progress={diskPercent}
              tone={usageTone(diskPercent)}
            />
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Host</p>
                <Server size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="mt-3 truncate font-mono text-lg font-semibold text-foreground">
                {system.hostname}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {system.os}
                {system.agentVersion ? ` · v${system.agentVersion}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {typeof system.uptimeSeconds === "number" ? (
                  <Badge variant="neutral">Up {formatUptime(system.uptimeSeconds)}</Badge>
                ) : null}
                {system.dryRun ? <Badge variant="amber">Dry run</Badge> : null}
              </div>
            </Card>
          </>
        ) : null}
      </div>

      <div className="mt-8">
        <ProcessesCard
          data={processes}
          error={processError}
          loading={processLoading}
          sort={processSort}
          onSortChange={setProcessSort}
          onRetry={() => void loadProcesses(processSort)}
          killingPid={killing}
          killError={killError}
          onKill={onKill}
        />
      </div>

      <div className="mb-4 mt-8">
        <CardTitle>Services</CardTitle>
        <CardDescription>
          Web-stack services probed by the agent. Restarts are audited.
        </CardDescription>
      </div>

      {services === null && !servicesError ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : null}

      {servicesError ? (
        <Alert variant="error" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{servicesError}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {services && services.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No services reported"
          description="The agent did not report any web-stack services."
        />
      ) : null}

      {services && services.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <ServiceCard
              key={service.name}
              service={service}
              restarting={restarting === service.name}
              restartDisabled={restarting !== null && restarting !== service.name}
              error={restartErrors[service.name] ?? null}
              onRestart={() => void onRestart(service)}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
