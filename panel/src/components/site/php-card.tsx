"use client";

import { useCallback, useEffect, useState } from "react";
import type { PhpVersionsResponse, Site } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { phpVersionLabel } from "@/components/format";
import { CodeXml } from "lucide-react";

interface PhpCardProps {
  domain: string;
  currentVersion: string;
  onUpdated: (site: Site) => void;
}

export function PhpCard({ domain, currentVersion, onUpdated }: PhpCardProps) {
  const [versions, setVersions] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState(currentVersion);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSelected(currentVersion);
  }, [currentVersion]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiFetch<PhpVersionsResponse>("/api/php-versions");
      setVersions(data.versions);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load PHP versions");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = saving || versions === null;
  const unchanged = selected === currentVersion;

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const site = await apiFetch<Site>(`/api/sites/${encodeURIComponent(domain)}/php`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: selected }),
      });
      onUpdated(site);
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to switch the PHP version");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>PHP version</CardTitle>
          <CardDescription>
            Switching re-renders the nginx vhost with the selected PHP-FPM socket and reloads the
            web server; a failed reload reverts.
          </CardDescription>
        </div>
        <CodeXml size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
      </CardHeader>
      <CardBody className="grid gap-5">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          Current version:
          <Badge variant="indigo">{phpVersionLabel(currentVersion)}</Badge>
        </div>

        {loadError ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : versions === null ? (
          <Skeleton className="h-9 sm:max-w-xs" />
        ) : (
          <div className="grid gap-4 sm:max-w-xs">
            <div className="grid gap-1.5">
              <Label htmlFor="php-version">Version</Label>
              <Select
                id="php-version"
                value={selected}
                onChange={(event) => {
                  setSelected(event.target.value);
                  setSaved(false);
                }}
                disabled={busy}
              >
                {versions.map((version) => (
                  <option key={version} value={version}>
                    {phpVersionLabel(version)}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-slate-500">
                &quot;Static&quot; removes PHP handling for this site.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                loading={saving}
                disabled={busy || unchanged}
                onClick={() => void onSave()}
              >
                Save
              </Button>
              {saved && unchanged ? (
                <span className="text-xs text-green-400">PHP version updated.</span>
              ) : null}
            </div>
          </div>
        )}

        {saveError ? <Alert variant="error">{saveError}</Alert> : null}
      </CardBody>
    </Card>
  );
}
