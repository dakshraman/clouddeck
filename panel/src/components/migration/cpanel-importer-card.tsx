"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CpanelImportResult, MigrationRecord } from "@/lib/types";
import { apiFetch, apiPost, HttpError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  CheckCircle2,
  Database,
  DownloadCloud,
  FileArchive,
  Globe,
  Mail,
  RefreshCw,
  Server,
  Shield,
  Upload,
} from "lucide-react";

export function CpanelImporterCard() {
  const [importMode, setImportMode] = useState<"upload" | "path">("upload");
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [serverPath, setServerPath] = useState("");
  const [overwrite, setOverwrite] = useState(false);

  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CpanelImportResult | null>(null);
  const [history, setHistory] = useState<MigrationRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch<{ migrations?: MigrationRecord[] }>("/api/migrations/history");
      setHistory(res.migrations || []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleImport(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setResult(null);
    setImporting(true);

    try {
      if (importMode === "upload") {
        if (!archiveFile) {
          setError("Please select a cpmove-<user>.tar.gz backup archive.");
          setImporting(false);
          return;
        }

        const formData = new FormData();
        formData.append("file", archiveFile, archiveFile.name);

        const uploadRes = await fetch("/api/migrations/cpanel/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || "Failed to upload cpmove archive");
        }

        const uploadData = await uploadRes.json();
        const uploadedPath = uploadData.path || `/tmp/${archiveFile.name}`;

        // Trigger import on uploaded path
        const importRes = await apiPost<CpanelImportResult>("/api/migrations/cpanel/import", {
          path: uploadedPath,
          overwrite,
        });
        setResult(importRes);
        setNotice(
          `cPanel account "${importRes.username}" imported successfully! Restored ${importRes.domainsRestored?.length || 0} domain(s).`,
        );
      } else {
        if (!serverPath.trim()) {
          setError("Please specify the absolute server path to the cpmove archive.");
          setImporting(false);
          return;
        }

        const importRes = await apiPost<CpanelImportResult>("/api/migrations/cpanel/import", {
          path: serverPath.trim(),
          overwrite,
        });
        setResult(importRes);
        setNotice(
          `cPanel account "${importRes.username}" imported successfully! Restored ${importRes.domainsRestored?.length || 0} domain(s).`,
        );
      }
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "cPanel migration failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
            <DownloadCloud size={18} aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Import from cPanel (`cpmove`)</CardTitle>
            <CardDescription>
              1-Click migration engine for cPanel backup archives (domains, MySQL databases, mailboxes, and SSL).
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardBody className="grid gap-6">
        {notice && (
          <Alert variant="success">
            <div className="flex items-center justify-between w-full">
              <span>{notice}</span>
              <button
                type="button"
                className="text-xs font-semibold underline ml-2 cursor-pointer"
                onClick={() => setNotice(null)}
              >
                Dismiss
              </button>
            </div>
          </Alert>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {/* Import Mode Selector */}
        <div className="flex gap-2 border-b border-border/60 pb-3">
          <button
            type="button"
            onClick={() => setImportMode("upload")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
              importMode === "upload"
                ? "border-brand bg-brand/10 text-brand font-semibold"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            Upload Archive (.tar.gz)
          </button>
          <button
            type="button"
            onClick={() => setImportMode("path")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
              importMode === "path"
                ? "border-brand bg-brand/10 text-brand font-semibold"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            Server File Path
          </button>
        </div>

        <form onSubmit={handleImport} className="grid gap-4">
          {importMode === "upload" ? (
            <div className="space-y-1">
              <Label htmlFor="cpmove-file" className="text-xs">
                Select `cpmove-*.tar.gz` backup file
              </Label>
              <Input
                id="cpmove-file"
                type="file"
                accept=".tar.gz,.gz,.zip,.tar"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    setArchiveFile(files[0]);
                  }
                }}
                disabled={importing}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Generated via cPanel &quot;Backup Wizard&quot; or `/scripts/pkgacct &lt;username&gt;`.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="server-path" className="text-xs">
                Absolute Path on Server
              </Label>
              <Input
                id="server-path"
                type="text"
                placeholder="/home/cpmove-username.tar.gz"
                value={serverPath}
                onChange={(e) => setServerPath(e.target.value)}
                disabled={importing}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Path to a file already downloaded or uploaded to the server filesystem.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                disabled={importing}
              />
              Overwrite existing sites or databases if collisions occur
            </label>
          </div>

          <div className="pt-2 flex justify-end">
            <Button type="submit" variant="primary" loading={importing} className="gap-1.5">
              <Upload size={14} />
              Start cPanel Import
            </Button>
          </div>
        </form>

        {/* Import Results Banner */}
        {result && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
              <h4 className="text-sm font-semibold text-foreground">
                cPanel Account Restored: <span className="font-mono">{result.username}</span>
              </h4>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 pt-1">
              <div className="rounded-md border border-border/60 bg-card p-3 space-y-1">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Globe size={14} className="text-brand" /> Domains ({result.domainsRestored?.length || 0})
                </span>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5 max-h-24 overflow-y-auto">
                  {result.domainsRestored?.map((d) => (
                    <li key={d} className="font-mono">{d}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-md border border-border/60 bg-card p-3 space-y-1">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Database size={14} className="text-amber-500" /> Databases ({result.databasesRestored?.length || 0})
                </span>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5 max-h-24 overflow-y-auto">
                  {result.databasesRestored?.map((db) => (
                    <li key={db} className="font-mono">{db}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-md border border-border/60 bg-card p-3 space-y-1">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Mail size={14} className="text-blue-500" /> Mailboxes ({result.mailboxesRestored?.length || 0})
                </span>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5 max-h-24 overflow-y-auto">
                  {result.mailboxesRestored?.map((m) => (
                    <li key={m} className="font-mono">{m}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Migration History */}
        {history.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-border/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Account Migrations
            </span>
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-card p-3 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <FileArchive size={14} className="text-muted-foreground" />
                    <span className="font-semibold text-foreground">{item.user}</span>
                    <Badge variant={item.status === "completed" ? "green" : "neutral"} className="text-[10px]">
                      {item.status}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
