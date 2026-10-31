"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DNSStatus, DNSZone, DNSZoneListResponse } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { NameserversCard } from "@/components/dns/nameservers-card";
import { RecordsCard } from "@/components/dns/records-card";
import { ZonesCard } from "@/components/dns/zones-card";
import { ServerCrash } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

export function DnsPage() {
  const [status, setStatus] = useState<DNSStatus | null>(null);
  const [zones, setZones] = useState<DNSZone[] | null>(null);
  const [zonesError, setZonesError] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setState("loading");
    setErrorMessage(null);

    const [statusResult, zonesResult] = await Promise.allSettled([
      apiFetch<DNSStatus>("/api/dns/status"),
      apiFetch<DNSZoneListResponse>("/api/dns/zones"),
    ]);

    if (statusResult.status === "rejected") {
      setState("error");
      setErrorMessage(
        statusResult.reason instanceof Error
          ? statusResult.reason.message
          : "Cannot reach the CloudDeck agent",
      );
      return;
    }

    setStatus(statusResult.value);

    if (zonesResult.status === "fulfilled") {
      setZones(zonesResult.value.zones);
      setZonesError(null);
    } else {
      setZonesError(
        zonesResult.reason instanceof Error ? zonesResult.reason.message : "Failed to load zones",
      );
    }

    setState("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  // Keep the selection valid when zones change: fall back to the first zone.
  const activeZone = useMemo(() => {
    if (!zones || zones.length === 0) return null;
    if (selectedZone && zones.some((zone) => zone.name === selectedZone)) return selectedZone;
    return zones[0].name;
  }, [selectedZone, zones]);

  const available = status?.available === true;

  return (
    <>
      <PageHeader
        title="DNS"
        description="PowerDNS zones and records on this server."
        actions={
          available ? (
            <Badge variant="green">{status?.version ? status.version : "Connected"}</Badge>
          ) : undefined
        }
      />

      <NameserversCard />

      {state === "error" ? (
        <Alert variant="error" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage ?? "Cannot reach the CloudDeck agent"}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {state === "loading" ? (
        <>
          <Card className="p-5">
            <div className="grid gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </Card>
          <Card className="mt-6 p-5">
            <div className="grid gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </Card>
        </>
      ) : null}

      {state === "ready" && status && !status.available ? (
        <EmptyState
          icon={ServerCrash}
          title="PowerDNS is not available"
          description="The agent could not run pdnsutil, so zone and record management is disabled. Install PowerDNS on this server and make sure pdnsutil is on the PATH, or point the agent's AGENT_PDNSUTIL_BIN setting at the binary."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Check again
            </Button>
          }
        />
      ) : null}

      {state === "ready" && available ? (
        <>
          <ZonesCard
            zones={zones}
            error={zonesError}
            selected={activeZone}
            onSelect={setSelectedZone}
            onRefresh={refresh}
          />
          <div className="mt-6">
            <RecordsCard zone={activeZone} />
          </div>
        </>
      ) : null}
    </>
  );
}
