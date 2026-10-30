"use client";

import { useState, useRef, type FormEvent, type ChangeEvent } from "react";
import type { MySQLDatabase } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { formatBytes } from "@/components/format";
import { cn } from "@/components/ui/cn";
import * as Dialog from "@radix-ui/react-dialog";
import { Database, Download, ExternalLink, FileText, Plus, Trash2, Upload, UploadCloud, X } from "lucide-react";

const DATABASE_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

export interface DatabasesCardProps {
  databases: MySQLDatabase[] | null;
  error: string | null;
  disabled: boolean;
  onRefresh: () => void;
  pmaInstalled?: boolean;
}

export function DatabasesCard({ databases, error, disabled, onRefresh, pmaInstalled = false }: DatabasesCardProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const [importTarget, setImportTarget] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openCreate() {
    setCreateOpen(true);
    setCreateError(null);
    setNotice(null);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateError(null);
    setName("");
  }

  function openImport(target: string) {
    setImportTarget(target);
    setImportFile(null);
    setImportError(null);
  }

  function closeImport() {
    if (importing) return;
    setImportTarget(null);
    setImportFile(null);
    setImportError(null);
  }

  function onFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setImportFile(file);
    setImportError(null);
  }

  async function onImportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importTarget || !importFile) return;

    setImporting(true);
    setImportError(null);

    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const res = await fetch(`/api/mysql/databases/${encodeURIComponent(importTarget)}/import`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || `Import failed with status ${res.status}`);
      }

      setNotice(`Database "${importTarget}" restored successfully from "${importFile.name}".`);
      setImportTarget(null);
      setImportFile(null);
      onRefresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import database dump");
    } finally {
      setImporting(false);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = name.trim();
    if (!DATABASE_NAME_PATTERN.test(candidate)) {
      setCreateError("Use 1-64 characters: letters, numbers and underscores only.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await apiPost<{ name: string }>("/api/mysql/databases", { name: candidate });
      setNotice(`Database ${candidate} created.`);
      setCreateOpen(false);
      setName("");
      onRefresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create database");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(target: string) {
    setConfirmName(null);
    setNotice(null);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[target];
      return next;
    });
    setDeletingName(target);
    try {
      await apiFetch<{ name: string; deleted: boolean }>(
        `/api/mysql/databases/${encodeURIComponent(target)}`,
        { method: "DELETE" },
      );
      setNotice(`Database ${target} deleted.`);
      onRefresh();
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [target]: err instanceof Error ? err.message : "Delete failed",
      }));
    } finally {
      setDeletingName(null);
    }
  }

  return (
    <>
      <Card className={databases && databases.length > 0 && !disabled ? "overflow-hidden" : undefined}>
        <CardHeader>
          <div>
            <CardTitle>Databases</CardTitle>
            <CardDescription>Schemas on the local MariaDB/MySQL server.</CardDescription>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={openCreate}
            disabled={disabled || createOpen}
          >
            <Plus size={14} aria-hidden="true" />
            Create database
          </Button>
        </CardHeader>

        {createOpen && !disabled ? (
          <form
            onSubmit={onCreate}
            className="mx-5 mt-4 grid gap-3 rounded-lg border border-border bg-background/40 p-4 sm:max-w-md"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="database-name">Database name</Label>
              <Input
                id="database-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="my_database"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={creating}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Letters, numbers and underscores - 1 to 64 characters.</p>
            </div>
            {createError ? <Alert variant="error">{createError}</Alert> : null}
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" loading={creating}>
                Create
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={closeCreate} disabled={creating}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {notice ? (
          <div className="px-5 pt-4">
            <Alert variant="success">{notice}</Alert>
          </div>
        ) : null}

        {disabled ? (
          <CardBody>
            <p className="text-sm text-muted-foreground">
              MariaDB/MySQL is unreachable, so databases cannot be listed or changed right now.
            </p>
          </CardBody>
        ) : error && databases === null ? (
          <CardBody>
            <Alert variant="error">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{error}</span>
                <Button variant="secondary" size="sm" onClick={onRefresh}>
                  Retry
                </Button>
              </div>
            </Alert>
          </CardBody>
        ) : databases === null ? (
          <CardBody className="grid gap-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </CardBody>
        ) : (
          <>
            {error ? (
              <div className="px-5 pt-4">
                <Alert variant="error">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>{error}</span>
                    <Button variant="secondary" size="sm" onClick={onRefresh}>
                      Retry
                    </Button>
                  </div>
                </Alert>
              </div>
            ) : null}

            {databases.length === 0 ? (
              <CardBody>
                <EmptyState
                  icon={Database}
                  title="No databases yet"
                  description="Create your first database to get started."
                />
              </CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-3 text-left font-medium">Database</th>
                      <th className="px-5 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {databases.map((db) => {
                      const isDeleting = deletingName === db.name;
                      const isConfirming = confirmName === db.name;
                      const rowError = rowErrors[db.name];
                      return (
                        <tr key={db.name} className="border-t border-border hover:bg-muted/40">
                          <td className="px-5 py-3 font-mono text-sm text-foreground">{db.name}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-2">
                              {isDeleting ? (
                                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Spinner size={14} className="text-muted-foreground" />
                                  deleting…
                                </span>
                              ) : isConfirming ? (
                                <>
                                  <span className="text-xs text-muted-foreground">Delete?</span>
                                  <Button variant="danger" size="sm" onClick={() => void onDelete(db.name)}>
                                    Confirm
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => setConfirmName(null)}>
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {pmaInstalled ? (
                                    <a
                                      href={`/api/phpmyadmin/login?db=${encodeURIComponent(db.name)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={buttonClass("ghost", "sm")}
                                      aria-label={`Open ${db.name} in phpMyAdmin`}
                                      title={`Open ${db.name} directly in phpMyAdmin`}
                                    >
                                      <ExternalLink size={14} aria-hidden="true" />
                                      phpMyAdmin
                                    </a>
                                  ) : null}
                                  <a
                                    href={`/api/mysql/databases/${encodeURIComponent(db.name)}/export`}
                                    download={`${db.name}.sql`}
                                    className={buttonClass("ghost", "sm")}
                                    aria-label={`Export ${db.name}`}
                                    title="Export SQL dump"
                                  >
                                    <Download size={14} aria-hidden="true" />
                                    Export
                                  </a>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openImport(db.name)}
                                    aria-label={`Import into ${db.name}`}
                                    title="Import SQL dump"
                                  >
                                    <Upload size={14} aria-hidden="true" />
                                    Import
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-red-400"
                                    onClick={() => setConfirmName(db.name)}
                                    aria-label={`Delete ${db.name}`}
                                  >
                                    <Trash2 size={14} aria-hidden="true" />
                                    Delete
                                  </Button>
                                </>
                              )}
                            </div>
                            {rowError ? (
                              <p
                                className="mt-1 max-w-64 truncate text-right text-xs text-red-400"
                                title={rowError}
                              >
                                {rowError}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog.Root open={importTarget !== null} onOpenChange={(open) => { if (!open) closeImport(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-raised focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
            aria-describedby="import-dialog-description"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <Dialog.Title className="text-base font-semibold text-foreground flex items-center gap-2">
                <Upload size={18} className="text-primary" />
                Import Database Dump
              </Dialog.Title>
              <Dialog.Close asChild disabled={importing}>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={onImportSubmit} className="mt-4 space-y-4">
              <Dialog.Description id="import-dialog-description" className="text-xs text-muted-foreground leading-relaxed">
                Restore database schema and data into{" "}
                <span className="font-mono font-medium text-foreground">{importTarget}</span>.
                Select a <span className="font-mono text-foreground">.sql</span> or{" "}
                <span className="font-mono text-foreground">.sql.gz</span> dump file to execute.
              </Dialog.Description>

              <div className="grid gap-2">
                <Label htmlFor="sql-dump-file">Database Dump File</Label>
                <div
                  onClick={() => !importing && fileInputRef.current?.click()}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors",
                    importFile
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:border-muted-foreground/50 hover:bg-muted/30",
                    importing && "pointer-events-none opacity-60",
                  )}
                >
                  <input
                    ref={fileInputRef}
                    id="sql-dump-file"
                    type="file"
                    accept=".sql,.sql.gz,.gz,application/sql,application/gzip,application/x-gzip"
                    className="hidden"
                    disabled={importing}
                    onChange={onFileSelect}
                  />
                  {importFile ? (
                    <div className="flex flex-col items-center gap-1">
                      <FileText size={28} className="text-primary" />
                      <span className="font-medium text-sm text-foreground break-all">{importFile.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{formatBytes(importFile.size)}</span>
                      <span className="text-xs text-primary underline mt-1">Change file</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <UploadCloud size={28} className="text-muted-foreground/70" />
                      <span className="text-sm font-medium text-foreground">Click to select dump file</span>
                      <span className="text-xs text-muted-foreground">Supports .sql or compressed .sql.gz</span>
                    </div>
                  )}
                </div>
              </div>

              {importError ? <Alert variant="error">{importError}</Alert> : null}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={closeImport}
                  disabled={importing}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!importFile || importing}
                  loading={importing}
                >
                  {importing ? "Importing…" : "Import Dump"}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
