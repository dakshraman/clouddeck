"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Site, SiteListResponse } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { FileBrowser } from "@/components/files/file-browser";
import { FolderOpen } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

export default function FilesPage() {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);
    try {
      const data = await apiFetch<SiteListResponse>("/api/sites");
      setSites(data.sites);
      setState("ready");
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to load sites");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the selection valid when the site list changes: fall back to the first site.
  const activeSite = useMemo(() => {
    if (!sites || sites.length === 0) return null;
    if (selectedSite && sites.some((site) => site.domain === selectedSite)) return selectedSite;
    return sites[0].domain;
  }, [sites, selectedSite]);

  return (
    <>
      <PageHeader
        title="Files"
        description="Browse and manage files inside any site webroot."
      />

      {state === "error" ? (
        <Alert variant="error" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage ?? "Failed to load sites"}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {state === "loading" ? (
        <Card className="p-5">
          <div className="grid gap-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </Card>
      ) : null}

      {state === "ready" && sites && sites.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No sites yet"
          description="Create a site first, then browse and manage its files here."
          action={
            <Link href="/sites" className={buttonClass("secondary", "md")}>
              Go to sites
            </Link>
          }
        />
      ) : null}

      {state === "ready" && activeSite ? (
        <>
          <div className="mb-6 grid gap-1.5 sm:max-w-md">
            <Label htmlFor="files-site">Site</Label>
            <Select
              id="files-site"
              value={activeSite}
              onChange={(event) => setSelectedSite(event.target.value)}
            >
              {sites?.map((site) => (
                <option key={site.domain} value={site.domain}>
                  {site.domain}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              The file manager operates inside this site&apos;s webroot.
            </p>
          </div>
          <FileBrowser key={activeSite} domain={activeSite} embedded />
        </>
      ) : null}
    </>
  );
}
