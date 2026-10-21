"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import type { FileEntry, FileListResponse, FileUploadResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { FileEditor } from "@/components/files/file-editor";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { formatBytes, shortDateTime } from "@/components/format";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Download,
  File as FileIcon,
  FileArchive,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Link2,
  PackageOpen,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

interface EditorState {
  path: string;
  name: string;
  isNew: boolean;
}

type ActionKind = "chmod" | "copy" | "compress" | "extract";

interface ActionState {
  kind: ActionKind;
  entry: FileEntry;
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

/** docs/api.md section 1.1 path rules, mirrored so the panel rejects early. */
function isValidWebrootPath(value: string): boolean {
  if (value.length > 1024) return false;
  if (value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  if (value === "") return true;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** Copy default keeps the extension: "index.php" → "index-copy.php". */
function copyName(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot > 0) return `${name.slice(0, dot)}-copy${name.slice(dot)}`;
  return `${name}-copy`;
}

const ARCHIVE_EXTENSION: Record<"tar.gz" | "zip", string> = {
  "tar.gz": ".tar.gz",
  zip: ".zip",
};

function isExtractable(name: string): boolean {
  return /\.(zip|tar\.gz|tgz)$/i.test(name);
}

export function FileBrowser({ domain, embedded = false }: { domain: string; embedded?: boolean }) {
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

  const [action, setAction] = useState<ActionState | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [chmodMode, setChmodMode] = useState("");
  const [copyTarget, setCopyTarget] = useState("");
  const [copyOverwrite, setCopyOverwrite] = useState(false);
  const [compressFormat, setCompressFormat] = useState<"tar.gz" | "zip">("tar.gz");
  const [compressTarget, setCompressTarget] = useState("");
  const [compressTargetEdited, setCompressTargetEdited] = useState(false);
  const [extractDest, setExtractDest] = useState("");

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

  function openAction(kind: ActionKind, entry: FileEntry) {
    setAction({ kind, entry });
    setActionError(null);
    setError(null);
    setNotice(null);
    if (kind === "chmod") {
      setChmodMode("");
    } else if (kind === "copy") {
      setCopyTarget(joinPath(path, copyName(entry.name)));
      setCopyOverwrite(false);
    } else if (kind === "compress") {
      setCompressFormat("tar.gz");
      setCompressTarget(joinPath(path, entry.name + ARCHIVE_EXTENSION["tar.gz"]));
      setCompressTargetEdited(false);
    } else {
      setExtractDest(path);
    }
  }

  function closeAction() {
    setAction(null);
    setActionError(null);
  }

  function onCompressFormatChange(next: "tar.gz" | "zip") {
    if (!action) return;
    setCompressFormat(next);
    if (!compressTargetEdited) {
      setCompressTarget(joinPath(path, action.entry.name + ARCHIVE_EXTENSION[next]));
    }
  }

  /** Runs a file-manager mutation, then refreshes the listing. */
  async function runAction(
    request: () => Promise<unknown>,
    successMessage: () => string,
    fallbackError: string,
  ) {
    setActionBusy(true);
    setActionError(null);
    setError(null);
    setNotice(null);
    try {
      await request();
      setNotice(successMessage());
      setAction(null);
      await load(path);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : fallbackError);
    } finally {
      setActionBusy(false);
    }
  }

  function onSubmitChmod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || action.kind !== "chmod") return;
    const entry = action.entry;
    const mode = chmodMode.trim();
    if (!/^0?[0-7]{3}$/.test(mode)) {
      setActionError("Enter an octal mode like 644 or 0755.");
      return;
    }
    void runAction(
      () => apiPost<{ path: string }>(`${filesBase}/chmod`, { path: joinPath(path, entry.name), mode }),
      () => `Permissions updated for "${entry.name}".`,
      "Failed to change permissions",
    );
  }

  function onSubmitCopy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || action.kind !== "copy") return;
    const entry = action.entry;
    const from = joinPath(path, entry.name);
    const to = copyTarget.trim();
    if (to === "" || !isValidWebrootPath(to)) {
      setActionError("Enter a destination path inside the site webroot.");
      return;
    }
    if (to === from) {
      setActionError("Choose a destination that differs from the source.");
      return;
    }
    const body = copyOverwrite ? { from, to, overwrite: true } : { from, to };
    void runAction(
      () => apiPost<{ from: string; to: string }>(`${filesBase}/copy`, body),
      () => `Copied "${entry.name}" to "${to}".`,
      "Failed to copy",
    );
  }

  function onSubmitCompress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || action.kind !== "compress") return;
    const entry = action.entry;
    const target = compressTarget.trim();
    if (target === "" || !isValidWebrootPath(target)) {
      setActionError("Enter an archive name inside the site webroot.");
      return;
    }
    void runAction(
      () =>
        apiPost<{ path: string }>(`${filesBase}/compress`, {
          paths: [joinPath(path, entry.name)],
          format: compressFormat,
          target,
        }),
      () => `Created archive "${target}".`,
      "Failed to create the archive",
    );
  }

  function onSubmitExtract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || action.kind !== "extract") return;
    const entry = action.entry;
    const dest = extractDest.trim();
    if (!isValidWebrootPath(dest)) {
      setActionError("Enter a relative destination path without '..' segments.");
      return;
    }
    void runAction(
      () => apiPost<{ path: string }>(`${filesBase}/extract`, { archive: joinPath(path, entry.name), dest }),
      () =>
        dest === ""
          ? `Extracted "${entry.name}" into the site root.`
          : `Extracted "${entry.name}" into "${dest}".`,
      "Failed to extract the archive",
    );
  }

  const segments = path === "" ? [] : path.split("/");

  return (
    <>
      {embedded ? null : (
        <>
          <Link
            href={siteHref}
            className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground/80"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {domain}
          </Link>

          <PageHeader title="Files" description="Browse and edit files inside the site webroot." />
        </>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || uploading || actionBusy}
          onClick={() => void onCreateFolder()}
        >
          <FolderPlus size={14} aria-hidden="true" />
          New folder
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || uploading || actionBusy}
          onClick={onCreateFile}
        >
          <FilePlus size={14} aria-hidden="true" />
          New file
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={uploading}
          disabled={busy || actionBusy}
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
          disabled={busy || uploading || actionBusy}
          onClick={refresh}
        >
          {loading && entries !== null ? null : <RefreshCw size={14} aria-hidden="true" />}
          Refresh
        </Button>
      </div>

      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
        {path === "" ? (
          <span className="font-mono text-foreground">root</span>
        ) : (
          <button
            type="button"
            onClick={() => setPath("")}
            className="cursor-pointer font-mono text-muted-foreground transition-colors hover:text-brand"
          >
            root
          </button>
        )}
        {segments.map((segment, index) => {
          const target = segments.slice(0, index + 1).join("/");
          const isCurrent = index === segments.length - 1;
          return (
            <span key={target} className="flex items-center gap-1.5">
              <ChevronRight size={14} className="text-muted-foreground/60" aria-hidden="true" />
              {isCurrent ? (
                <span className="font-mono text-foreground">{segment}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setPath(target)}
                  className="cursor-pointer font-mono text-muted-foreground transition-colors hover:text-brand"
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
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 text-left font-medium">Name</th>
                  <th className="px-5 py-3 text-right font-medium">Size</th>
                  <th className="px-5 py-3 text-left font-medium">Modified</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const childPath = joinPath(path, entry.name);
                  const rowBusy = busy || uploading || actionBusy;
                  const activeAction =
                    action && action.entry.name === entry.name ? action.kind : null;
                  return (
                    <Fragment key={entry.name}>
                      <tr className="border-t border-border hover:bg-muted/40">
                        <td className="px-5 py-3">
                          {entry.type === "dir" ? (
                            <button
                              type="button"
                              onClick={() => setPath(childPath)}
                              className="flex items-center gap-2 text-left text-foreground transition-colors hover:text-brand"
                            >
                              <Folder
                                size={15}
                                className="shrink-0 text-brand/80"
                                aria-hidden="true"
                              />
                              <span className="break-all font-mono text-sm">{entry.name}</span>
                            </button>
                          ) : entry.type === "symlink" ? (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Link2
                                size={15}
                                className="shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <span className="break-all font-mono text-sm">{entry.name}</span>
                              <Badge variant="neutral">symlink</Badge>
                            </span>
                          ) : (
                            <span className="flex items-center gap-2 text-foreground">
                              <FileIcon
                                size={15}
                                className="shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <span className="break-all font-mono text-sm">{entry.name}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-muted-foreground">
                          {entry.type === "dir" ? "—" : formatBytes(entry.sizeBytes)}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {shortDateTime(entry.modifiedAt)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {deleting === entry.name ? (
                              <span className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                                <Spinner size={14} className="text-muted-foreground" />
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
                                        setEditor({
                                          path: childPath,
                                          name: entry.name,
                                          isNew: false,
                                        })
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
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={rowBusy}
                                      onClick={() => openAction("chmod", entry)}
                                    >
                                      <ShieldCheck size={14} aria-hidden="true" />
                                      Permissions
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={rowBusy}
                                      onClick={() => openAction("copy", entry)}
                                    >
                                      <Copy size={14} aria-hidden="true" />
                                      Copy
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={rowBusy}
                                      onClick={() => openAction("compress", entry)}
                                    >
                                      <FileArchive size={14} aria-hidden="true" />
                                      Compress
                                    </Button>
                                    {entry.type === "file" && isExtractable(entry.name) ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={rowBusy}
                                        onClick={() => openAction("extract", entry)}
                                      >
                                        <PackageOpen size={14} aria-hidden="true" />
                                        Extract
                                      </Button>
                                    ) : null}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={rowBusy}
                                      onClick={() => void onRename(entry)}
                                    >
                                      Rename
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-red-400"
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
                      {activeAction ? (
                        <tr className="border-t border-border">
                          <td colSpan={4} className="px-5 py-4">
                            {activeAction === "chmod" ? (
                              <form
                                onSubmit={onSubmitChmod}
                                className="grid gap-3 rounded-lg border border-border bg-background/40 p-4 sm:max-w-md"
                              >
                                <div className="grid gap-1.5">
                                  <Label htmlFor="chmod-mode">
                                    Mode for{" "}
                                    <span className="font-mono text-foreground/80">{entry.name}</span>
                                  </Label>
                                  <Input
                                    id="chmod-mode"
                                    value={chmodMode}
                                    onChange={(event) => setChmodMode(event.target.value)}
                                    placeholder="644"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    spellCheck={false}
                                    autoFocus
                                    disabled={actionBusy}
                                    className="w-32 font-mono"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Octal permissions, three or four digits (644, 0755).
                                  </p>
                                </div>
                                {actionError ? <Alert variant="error">{actionError}</Alert> : null}
                                <div className="flex items-center gap-2">
                                  <Button type="submit" size="sm" loading={actionBusy}>
                                    Set permissions
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={closeAction}
                                    disabled={actionBusy}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </form>
                            ) : activeAction === "copy" ? (
                              <form
                                onSubmit={onSubmitCopy}
                                className="grid gap-3 rounded-lg border border-border bg-background/40 p-4 sm:max-w-md"
                              >
                                <div className="grid gap-1.5">
                                  <Label htmlFor="copy-target">
                                    Copy{" "}
                                    <span className="font-mono text-foreground/80">{entry.name}</span>{" "}
                                    to
                                  </Label>
                                  <Input
                                    id="copy-target"
                                    value={copyTarget}
                                    onChange={(event) => setCopyTarget(event.target.value)}
                                    placeholder="assets/copy-of-file"
                                    autoComplete="off"
                                    spellCheck={false}
                                    autoFocus
                                    disabled={actionBusy}
                                    className="font-mono"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Destination path relative to the webroot.
                                  </p>
                                </div>
                                <label className="flex items-center gap-2 text-sm text-foreground/80">
                                  <input
                                    type="checkbox"
                                    checked={copyOverwrite}
                                    onChange={(event) => setCopyOverwrite(event.target.checked)}
                                    disabled={actionBusy}
                                    className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                                  />
                                  Overwrite the destination if it already exists
                                </label>
                                {actionError ? <Alert variant="error">{actionError}</Alert> : null}
                                <div className="flex items-center gap-2">
                                  <Button type="submit" size="sm" loading={actionBusy}>
                                    Copy
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={closeAction}
                                    disabled={actionBusy}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </form>
                            ) : activeAction === "compress" ? (
                              <form
                                onSubmit={onSubmitCompress}
                                className="grid gap-3 rounded-lg border border-border bg-background/40 p-4 sm:max-w-md"
                              >
                                <p className="text-sm font-medium text-foreground">
                                  Compress{" "}
                                  <span className="font-mono text-foreground/80">{entry.name}</span>
                                </p>
                                <div className="grid gap-1.5">
                                  <Label htmlFor="compress-format">Format</Label>
                                  <Select
                                    id="compress-format"
                                    value={compressFormat}
                                    onChange={(event) =>
                                      onCompressFormatChange(
                                        event.target.value === "zip" ? "zip" : "tar.gz",
                                      )
                                    }
                                    disabled={actionBusy}
                                    className="w-40"
                                  >
                                    <option value="tar.gz">tar.gz</option>
                                    <option value="zip">zip</option>
                                  </Select>
                                </div>
                                <div className="grid gap-1.5">
                                  <Label htmlFor="compress-target">Archive name</Label>
                                  <Input
                                    id="compress-target"
                                    value={compressTarget}
                                    onChange={(event) => {
                                      setCompressTarget(event.target.value);
                                      setCompressTargetEdited(true);
                                    }}
                                    placeholder="archive.tar.gz"
                                    autoComplete="off"
                                    spellCheck={false}
                                    disabled={actionBusy}
                                    className="font-mono"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Relative to the site root. An existing target is not replaced.
                                  </p>
                                </div>
                                {actionError ? <Alert variant="error">{actionError}</Alert> : null}
                                <div className="flex items-center gap-2">
                                  <Button type="submit" size="sm" loading={actionBusy}>
                                    Compress
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={closeAction}
                                    disabled={actionBusy}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </form>
                            ) : (
                              <form
                                onSubmit={onSubmitExtract}
                                className="grid gap-3 rounded-lg border border-border bg-background/40 p-4 sm:max-w-md"
                              >
                                <div className="grid gap-1.5">
                                  <Label htmlFor="extract-dest">
                                    Extract{" "}
                                    <span className="font-mono text-foreground/80">{entry.name}</span>{" "}
                                    into
                                  </Label>
                                  <Input
                                    id="extract-dest"
                                    value={extractDest}
                                    onChange={(event) => setExtractDest(event.target.value)}
                                    placeholder="site root"
                                    autoComplete="off"
                                    spellCheck={false}
                                    autoFocus
                                    disabled={actionBusy}
                                    className="font-mono"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Relative to the site root; empty extracts into the site root.
                                  </p>
                                </div>
                                {actionError ? <Alert variant="error">{actionError}</Alert> : null}
                                <div className="flex items-center gap-2">
                                  <Button type="submit" size="sm" loading={actionBusy}>
                                    Extract
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={closeAction}
                                    disabled={actionBusy}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </form>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
