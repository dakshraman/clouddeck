"use client";

import { useCallback, useEffect, useState } from "react";
import type { PmaStatusResponse } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Copy, Database, ExternalLink } from "lucide-react";

type CopyState = "idle" | "copied" | "failed";

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API unavailable (e.g. insecure context) - fall back below.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function PmaCard() {
  const [status, setStatus] = useState<PmaStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");

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

  // window is only touched from event handlers so the client component can
  // still be server-rendered.
  function resolveUrl(): string | null {
    if (
      status === null ||
      !status.installed ||
      typeof status.port !== "number" ||
      typeof status.urlPath !== "string"
    ) {
      return null;
    }
    return `http://${window.location.hostname}:${status.port}${status.urlPath}`;
  }

  function onOpen() {
    const url = resolveUrl();
    if (url === null) return;
    window.open(url, "_blank", "noopener");
  }

  async function onCopy() {
    const url = resolveUrl();
    if (url === null) return;
    const ok = await copyText(url);
    setCopyState(ok ? "copied" : "failed");
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
            Browser-based database administration detected on this server.
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
        <CardBody>
          <p className="text-sm text-muted-foreground">phpMyAdmin not detected on this server.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Install phpMyAdmin on the server, or point{" "}
            <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs text-foreground">
              AGENT_PHPMYADMIN_DIR
            </code>{" "}
            at an existing installation.
          </p>
        </CardBody>
      ) : (
        <CardBody className="grid gap-5">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Version</dt>
              <dd className="mt-1 font-mono text-sm text-foreground">
                {status.version ? status.version : "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Port</dt>
              <dd className="mt-1 font-mono text-sm text-foreground">
                {typeof status.port === "number" ? status.port : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Reachable</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
                <span
                  className={
                    status.reachable
                      ? "h-2.5 w-2.5 rounded-full bg-green-500"
                      : "h-2.5 w-2.5 rounded-full bg-red-500"
                  }
                  title={
                    status.reachable
                      ? "The agent reached phpMyAdmin on localhost"
                      : "The agent could not reach phpMyAdmin on localhost"
                  }
                  aria-hidden="true"
                />
                {status.reachable ? "Yes" : "No"}
              </dd>
            </div>
          </dl>

          {urlAvailable ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={onOpen}>
                <ExternalLink size={16} aria-hidden="true" />
                Open phpMyAdmin
              </Button>
              <Button variant="secondary" onClick={() => void onCopy()}>
                {copyState === "copied" ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Copy size={16} aria-hidden="true" />
                )}
                {copyState === "copied" ? "Copied" : "Copy URL"}
              </Button>
              {copyState === "failed" ? (
                <span className="text-xs text-red-400">Copy failed - open the URL manually.</span>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              The panel could not determine phpMyAdmin&apos;s URL; check the agent&apos;s detection
              output.
            </p>
          )}
        </CardBody>
      )}
    </Card>
  );
}
