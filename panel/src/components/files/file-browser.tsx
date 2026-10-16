"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { FileEntry, FileListResponse, FileUploadResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { FileEditor } from "@/components/files/file-editor";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { formatBytes, shortDateTime } from "@/components/format";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  File as FileIcon,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Link2,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

interface EditorState {
  path: string;
  name: string;
  isNew: boolean;
}

interface ErrorBody {
  error?: { code?: unknown; message?: unknown };
}

function joinPath(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    const rank = (entry: FileEntry) => (entry.type === "dir" ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function FileBrowser({ domain }: { domain: string }) {
  const siteHref = `/sites/${encodeURIComponent(domain)}`;
  const filesBase = `/api/sites/${encodeURIComponent(domain)}/files`;

  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadIdRef = useRef(0);

  const load = useCallback(
    async (dirPath: string) => {
      const loadId = ++loadIdRef.current;
      setLoading(true);
      try {
        const data = await apiFetch<FileListResponse>(
          `${filesBase}?path=${encodeURIComponent(dirPath)}`,
        );
        if (loadIdRef.current !== loadId) return;
        setEntries(sortEntries(data.entries));
        setError(null);
      } catch (err) {
        if (loadIdRef.current !== loadId) return;
        setError(err instanceof Error ? err.message : "Failed to load files");
      } finally {
        if (loadIdRef.current === loadId) setLoading(false);
      }
    },
    [filesBase],
  );

  useEffect(() => {
    setEditor(null);
    setEntries(null);
    setError(null);
    setNotice(null);
    void load(path);
  }, [path, load]);

  const refresh = useCallback(() => {
    void load(path);
  }, [load, path]);

  async function onCreateFolder() {
    const name = window.prompt("New folder name:");
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a folder name.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost<{ path: string }>(`${filesBase}/mkdir`, { path: joinPath(path, trimmed) });
      setNotice(`Created folder "${trimmed}".`);
      await load(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the folder");
    } finally {
      setBusy(false);
    }
  }

  function onCreateFile() {
    const name = window.prompt("New file name:");
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a file name.");
      return;
    }
    setError(null);
    setNotice(null);
    setEditor({ path: joinPath(path, trimmed), name: trimmed, isNew: true });
  }

  async function onRename(entry: FileEntry) {
    const name = window.prompt(`Rename "${entry.name}" to:`, entry.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === entry.name) return;
    if (trimmed.includes("/")) {
      setError("Enter a name without a slash — files stay in the current folder.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost<{ from: string; to: string }>(`${filesBase}/rename`, {
        from: joinPath(path, entry.name),
        to: joinPath(path, trimmed),
      });
      setNotice(`Renamed "${entry.name}" to "${trimmed}".`);
      await load(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setBusy(false);
    }
  }

  async function performDelete(
    entry: FileEntry,
    recursive: boolean,
  ): Promise<"ok" | "not_empty" | "failed"> {
    const params = new URLSearchParams({ path: joinPath(path, entry.name) });
    if (recursive) params.set("recursive", "true");

    let res: Response;
    try {
      res = await fetch(`${filesBase}?${params}`, { method: "DELETE", cache: "no-store" });
    } catch {
      setError("The panel could not reach the server.");
      return "failed";
    }
    if (res.ok) return "ok";

    let code: string | undefined;
    let message = `Delete failed (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as ErrorBody;
      if (typeof body.error?.code === "string") code = body.error.code;
      if (typeof body.error?.message === "string" && body.error.message.length > 0) {
        message = body.error.message;
      }
    } catch {
      // Non-JSON error body.
    }
    if (code === "not_empty") return "not_empty";
    setError(message);
    return "failed";
  }

  async function onDelete(entry: FileEntry) {
    if (!window.confirm(`Delete "${entry.name}"?`)) return;

    setDeleting(entry.name);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let result = await performDelete(entry, false);
      if (result === "not_empty") {
        const confirmed = window.confirm(
          `"${entry.name}" is not empty. Delete the folder and everything inside it?`,
        );
        if (confirmed) result = await performDelete(entry, true);
      }
      if (result === "ok") {
        setNotice(`Deleted "${entry.name}".`);
        await load(path);
      }
    } finally {
      setDeleting(null);
      setBusy(false);
    }
  }

  async function onUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const form = new FormData();
    for (const file of Array.from(files)) form.append("file", file);

    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const data = await apiFetch<FileUploadResponse>(
        `${filesBase}/upload?path=${encodeURIComponent(path)}`,
        { method: "POST", body: form },
      );
      const count = data.uploaded.length;
      setNotice(`Uploaded ${count} file${count === 1 ? "" : "s"}.`);
      await load(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  const segments = path === "" ? [] : path.split("/");

  return (
    <>
      <Link
        href={siteHref}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {domain}
      </Link>

      <PageHeader title="Files" description="Browse and edit files inside the site webroot." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || uploading}
          onClick={() => void onCreateFolder()}
        >
          <FolderPlus size={14} aria-hidden="true" />
          New folder
        </Button>
        <Button variant="secondary" size="sm" disabled={busy || uploading} onClick={onCreateFile}>
          <FilePlus size={14} aria-hidden="true" />
          New file
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={uploading}
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? null : <Upload size={14} aria-hidden="true" />}
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void onUploadChange(event)}
        />
        <Button
          variant="ghost"
          size="sm"
          loading={loading && entries !== null}
          disabled={busy || uploading}
          onClick={refresh}
        >
          {loading && entries !== null ? null : <RefreshCw size={14} aria-hidden="true" />}
          Refresh
        </Button>
      </div>

      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
        {path === "" ? (
          <span className="font-mono text-slate-200">root</span>
        ) : (
          <button
            type="button"
            onClick={() => setPath("")}
            className="cursor-pointer font-mono text-slate-400 transition-colors hover:text-indigo-300"
          >
            root
          </button>
        )}
        {segments.map((segment, index) => {
          const target = segments.slice(0, index + 1).join("/");
          const isCurrent = index === segments.length - 1;
          return (
            <span key={target} className="flex items-center gap-1.5">
              <ChevronRight size={14} className="text-slate-600" aria-hidden="true" />
              {isCurrent ? (
                <span className="font-mono text-slate-200">{segment}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setPath(target)}
                  className="cursor-pointer font-mono text-slate-400 transition-colors hover:text-indigo-300"
                >
                  {segment}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      {error ? (
        <Alert variant="error" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="break-all">{error}</span>
            {entries === null ? (
              <Button variant="secondary" size="sm" onClick={refresh}>
                Retry
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant="success" className="mb-4">
          {notice}
        </Alert>
      ) : null}

      {editor ? (
        <FileEditor
          domain={domain}
          path={editor.path}
          name={editor.name}
          isNew={editor.isNew}
          onClose={() => setEditor(null)}
          onSaved={refresh}
        />
      ) : entries === null ? (
        loading ? (
          <Card className="p-5">
            <div className="grid gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </Card>
        ) : null
      ) : entries.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="This folder is empty"
          description="Upload files or create a folder to get started."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 text-left font-medium">Name</th>
                  <th className="px-5 py-3 text-right font-medium">Size</th>
                  <th className="px-5 py-3 text-left font-medium">Modified</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const childPath = joinPath(path, entry.name);
                  const rowBusy = busy || uploading;
                  return (
                    <tr
                      key={entry.name}
                      className="border-t border-slate-800 hover:bg-slate-800/40"
                    >
                      <td className="px-5 py-3">
                        {entry.type === "dir" ? (
                          <button
                            type="button"
                            onClick={() => setPath(childPath)}
                            className="flex items-center gap-2 text-left text-slate-200 transition-colors hover:text-indigo-300"
                          >
                            <Folder
                              size={15}
                              className="shrink-0 text-indigo-400/80"
                              aria-hidden="true"
                            />
                            <span className="break-all font-mono text-sm">{entry.name}</span>
                          </button>
                        ) : entry.type === "symlink" ? (
                          <span className="flex items-center gap-2 text-slate-400">
                            <Link2
                              size={15}
                              className="shrink-0 text-slate-500"
                              aria-hidden="true"
                            />
                            <span className="break-all font-mono text-sm">{entry.name}</span>
                            <Badge variant="neutral">symlink</Badge>
                          </span>
                        ) : (
                          <span className="flex items-center gap-2 text-slate-200">
                            <FileIcon
                              size={15}
                              className="shrink-0 text-slate-500"
                              aria-hidden="true"
                            />
                            <span className="break-all font-mono text-sm">{entry.name}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-slate-400">
                        {entry.type === "dir" ? "—" : formatBytes(entry.sizeBytes)}
                      </td>
                      <td className="px-5 py-3 text-slate-400">
                        {shortDateTime(entry.modifiedAt)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {deleting === entry.name ? (
                            <span className="flex items-center gap-2 px-2 text-xs text-slate-400">
                              <Spinner size={14} className="text-slate-400" />
                              deleting…
                            </span>
                          ) : (
                            <>
                              {entry.type === "file" ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={rowBusy}
                                    onClick={() =>
                                      setEditor({ path: childPath, name: entry.name, isNew: false })
                                    }
                                  >
                                    <Pencil size={14} aria-hidden="true" />
                                    Edit
                                  </Button>
                                  <a
                                    href={`${filesBase}/download?path=${encodeURIComponent(childPath)}`}
                                    className={buttonClass("ghost", "sm")}
                                  >
                                    <Download size={14} aria-hidden="true" />
                                    Download
                                  </a>
                                </>
                              ) : null}
                              {entry.type === "symlink" ? null : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={rowBusy}
                                  onClick={() => void onRename(entry)}
                                >
                                  Rename
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-slate-400 hover:text-red-400"
                                disabled={rowBusy}
                                onClick={() => void onDelete(entry)}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
