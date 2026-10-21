"use client";

import { useCallback, useEffect, useState } from "react";
import type { WafInfo } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield } from "lucide-react";

function engineLabel(engine: string): string {
  switch (engine) {
    case "nginx-rules":
      return "nginx rules";
    case "modsecurity":
      return "ModSecurity";
    default:
      return engine || "unknown";
  }
}

export function WafCard({ domain }: { domain: string }) {
  const base = `/api/sites/${encodeURIComponent(domain)}/waf`;

  const [info, setInfo] = useState<WafInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<WafInfo>(base);
      setInfo(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load the WAF status");
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onToggle(enabled: boolean) {
    setToggling(true);
    setSaveError(null);
    try {
      const data = await apiFetch<WafInfo>(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      setInfo(data);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to update the WAF setting");
    } finally {
      setToggling(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>WAF (ModSecurity)</CardTitle>
          <CardDescription>
            Web application firewall for <span className="font-mono">{domain}</span>. Toggling
            re-renders the nginx vhost and reloads the web server; a failed reload reverts.
          </CardDescription>
        </div>
        <Shield size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardBody className="grid gap-4">
        {loadError ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : info === null ? (
          <div className="grid gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-64" />
          </div>
        ) : (
          <>
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={info.enabled}
                disabled={toggling}
                onChange={(event) => void onToggle(event.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-sm text-foreground">
                {info.enabled ? "WAF enabled" : "WAF disabled"}
              </span>
              {toggling ? <span className="text-xs text-muted-foreground">saving…</span> : null}
            </label>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Engine:
              <Badge variant="indigo">{engineLabel(info.engine)}</Badge>
            </div>

            {info.note ? <p className="text-xs text-muted-foreground">{info.note}</p> : null}
          </>
        )}

        {saveError ? <Alert variant="error">{saveError}</Alert> : null}
      </CardBody>
    </Card>
  );
}
