"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@animate-ui/react/primitives/radix-ui/dropdown-menu";
import type { FileEntry, FileListResponse, FileUploadResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { FileEditor } from "@/components/files/file-editor";
import { FileGlyph } from "@/components/files/file-icons";
import { FolderTree } from "@/components/files/folder-tree";
import { ChmodDialog } from "@/components/files/chmod-dialog";
import { CompressDialog } from "@/components/files/compress-dialog";
import { ExtractDialog } from "@/components/files/extract-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
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
  FileArchive,
  FilePlus,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderTree as FolderTreeIcon,
  LayoutGrid,
  Link2,
  List,
  MoreVertical,
  PackageOpen,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
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

function isExtractable(name: string): boolean {
  return /\.(zip|tar\.gz|tgz|tar)$/i.test(name);
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

  // Modern modal dialog states
  const [chmodEntry, setChmodEntry] = useState<FileEntry | null>(null);
  const [chmodOpen, setChmodOpen] = useState(false);

  const [compressItems, setCompressItems] = useState<FileEntry[]>([]);
  const [compressOpen, setCompressOpen] = useState(false);

  const [extractEntry, setExtractEntry] = useState<FileEntry | null>(null);
  const [extractOpen, setExtractOpen] = useState(false);

  // Copy modal state
  const [copyEntry, setCopyEntry] = useState<FileEntry | null>(null);
  const [copyTarget, setCopyTarget] = useState("");
  const [copyOverwrite, setCopyOverwrite] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  // Move inline state
  const [moveEntry, setMoveEntry] = useState<FileEntry | null>(null);
  const [moveDest, setMoveDest] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Browsing UI state
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [treeOpen, setTreeOpen] = useState(true);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);

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
    setQuery("");
    setSelected(new Set());
    void load(path);
  }, [path, load]);

  const refresh = useCallback(() => {
    void load(path);
    setTreeRefreshKey((key) => key + 1);
  }, [load, path]);

  // Dialog openers
  function openChmod(entry: FileEntry) {
    setChmodEntry(entry);
    setChmodOpen(true);
  }

  function openCompress(items: FileEntry[]) {
    setCompressItems(items);
    setCompressOpen(true);
  }

  function openExtract(entry: FileEntry) {
    setExtractEntry(entry);
    setExtractOpen(true);
  }

  function openCopy(entry: FileEntry) {
    setCopyEntry(entry);
    setCopyTarget(joinPath(path, copyName(entry.name)));
    setCopyOverwrite(false);
    setCopyError(null);
  }

  function openMove(entry: FileEntry) {
    setMoveEntry(entry);
    setMoveDest(path);
    setMoveError(null);
    setError(null);
    setNotice(null);
  }

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
      refresh();
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
      setError("Enter a name without a slash — use Move to change the folder.");
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
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitCopy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!copyEntry) return;
    const from = joinPath(path, copyEntry.name);
    const to = copyTarget.trim();
    if (to === "" || !isValidWebrootPath(to)) {
      setCopyError("Enter a destination path inside the site webroot.");
      return;
    }
    if (to === from) {
      setCopyError("Choose a destination that differs from the source.");
      return;
    }
    setCopyBusy(true);
    setCopyError(null);
    try {
      const body = copyOverwrite ? { from, to, overwrite: true } : { from, to };
      await apiPost<{ from: string; to: string }>(`${filesBase}/copy`, body);
      setNotice(`Copied "${copyEntry.name}" to "${to}".`);
      setCopyEntry(null);
      refresh();
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : "Failed to copy");
    } finally {
      setCopyBusy(false);
    }
  }

  async function onSubmitMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moveEntry) return;
    const from = joinPath(path, moveEntry.name);
    const to = joinPath(moveDest, moveEntry.name);
    if (to === from) {
      setMoveError("Pick a different folder — the item is already there.");
      return;
    }
    setMoveBusy(true);
    setMoveError(null);
    try {
      await apiPost<{ from: string; to: string }>(`${filesBase}/rename`, { from, to });
      setNotice(`Moved "${moveEntry.name}" to "${moveDest || "the web root"}".`);
      setMoveEntry(null);
      refresh();
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : "Failed to move");
    } finally {
      setMoveBusy(false);
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
        refresh();
      }
    } finally {
      setDeleting(null);
      setBusy(false);
    }
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;

    const form = new FormData();
    for (const file of files) form.append("file", file);

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
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragOver(false);
    if (busy || uploading) return;
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  function toggleSelected(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  async function onDeleteBulk() {
    if (selected.size === 0) return;
    if (
      !window.confirm(
        `Delete ${selected.size} item${selected.size === 1 ? "" : "s"}? Folders are deleted with their contents.`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    const names = [...selected];
    let deleted = 0;
    let failedName: string | null = null;
    try {
      for (const name of names) {
        const entry = entries?.find((candidate) => candidate.name === name);
        if (!entry) continue;
        const params = new URLSearchParams({ path: joinPath(path, name) });
        if (entry.type === "dir") params.set("recursive", "true");
        try {
          const res = await fetch(`${filesBase}?${params}`, { method: "DELETE", cache: "no-store" });
          if (res.ok) {
            deleted += 1;
          } else if (failedName === null) {
            failedName = name;
          }
        } catch {
          if (failedName === null) failedName = name;
        }
      }
      if (failedName !== null) {
        setError(`Deleted ${deleted}, but "${failedName}" could not be deleted.`);
      } else {
        setNotice(`Deleted ${deleted} item${deleted === 1 ? "" : "s"}.`);
      }
      setSelected(new Set());
      refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  const segments = path === "" ? [] : path.split("/");
  const needle = query.trim().toLowerCase();
  const visible =
    entries === null
      ? []
      : needle === ""
        ? entries
        : entries.filter((entry) => entry.name.toLowerCase().includes(needle));
  const allVisibleSelected =
    visible !== null && visible.length > 0 && visible.every((entry) => selected.has(entry.name));
  const rowBusy = busy || uploading || bulkBusy;

  // Selected entries list for action bar
  const selectedEntries = entries ? entries.filter((entry) => selected.has(entry.name)) : [];
  const singleSelected = selectedEntries.length === 1 ? selectedEntries[0] : null;
  const isArchiveSelected =
    singleSelected !== null &&
    singleSelected.type === "file" &&
    isExtractable(singleSelected.name);

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

      {/* Main Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={treeOpen}
          onClick={() => setTreeOpen((open) => !open)}
        >
          <FolderTreeIcon size={14} aria-hidden="true" />
          Folders
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={rowBusy || moveEntry !== null}
          onClick={() => void onCreateFolder()}
        >
          <FolderPlus size={14} aria-hidden="true" />
          New folder
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={rowBusy || moveEntry !== null}
          onClick={onCreateFile}
        >
          <FilePlus size={14} aria-hidden="true" />
          New file
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={uploading}
          disabled={rowBusy || moveEntry !== null}
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
          disabled={rowBusy || moveEntry !== null}
          onClick={refresh}
        >
          {loading && entries !== null ? null : <RefreshCw size={14} aria-hidden="true" />}
          Refresh
        </Button>
        <div className="relative ml-auto">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this folder"
            autoComplete="off"
            className="w-44 pl-8 sm:w-56"
          />
        </div>
        <div className="flex overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            aria-pressed={view === "list"}
            aria-label="List view"
            className={`cursor-pointer px-2.5 py-1.5 ${
              view === "list"
                ? "bg-brand/10 text-brand"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setView("list")}
          >
            <List size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            className={`cursor-pointer px-2.5 py-1.5 ${
              view === "grid"
                ? "bg-brand/10 text-brand"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setView("grid")}
          >
            <LayoutGrid size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={treeOpen ? "flex flex-col gap-4 lg:flex-row" : undefined}>
        {treeOpen ? (
          <Card className="h-fit w-full shrink-0 p-2 lg:w-60">
            <p className="px-1.5 pb-1 pt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Folders
            </p>
            <FolderTree
              filesBase={filesBase}
              currentPath={moveEntry ? moveDest : path}
              onSelect={moveEntry ? setMoveDest : setPath}
              refreshKey={treeRefreshKey}
            />
          </Card>
        ) : null}

        <div className="min-w-0 flex-1">
          {/* Breadcrumb Navigation */}
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

          {/* Action Bar for Selected Items (Hostinger / cPanel style) */}
          {selected.size > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/80 px-4 py-2.5 shadow-sm">
              <span className="text-xs font-semibold text-foreground">
                {selected.size} selected
              </span>

              {/* Compress action button - visible when 1 or more items are selected */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openCompress(selectedEntries)}
                disabled={rowBusy}
              >
                <FileArchive size={14} aria-hidden="true" />
                Compress
              </Button>

              {/* Permissions action button - visible for single selected file/folder */}
              {singleSelected && singleSelected.type !== "symlink" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openChmod(singleSelected)}
                  disabled={rowBusy}
                >
                  <ShieldCheck size={14} aria-hidden="true" />
                  Permissions
                </Button>
              ) : null}

              {/* Extract action button - visible when an archive is selected */}
              {isArchiveSelected ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openExtract(singleSelected)}
                  disabled={rowBusy}
                >
                  <PackageOpen size={14} aria-hidden="true" />
                  Extract
                </Button>
              ) : null}

              <Button
                variant="secondary"
                size="sm"
                loading={bulkBusy}
                className="text-red-400 hover:text-red-300"
                onClick={() => void onDeleteBulk()}
              >
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </Button>

              <Button
                variant="ghost"
                size="sm"
                disabled={bulkBusy}
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          ) : null}

          {/* File Editor Modal */}
          {editor ? (
            <FileEditor
              domain={domain}
              path={editor.path}
              name={editor.name}
              isNew={editor.isNew}
              onClose={() => setEditor(null)}
              onSaved={refresh}
            />
          ) : moveEntry ? (
            /* Move Inline Card */
            <Card>
              <form onSubmit={onSubmitMove} className="grid gap-4 p-5">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Move <span className="font-mono text-brand">{moveEntry.name}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    From {path === "" ? "the web root" : `/${path}`}. Pick a destination folder on
                    the left, then move it there.
                  </p>
                </div>
                {moveError ? <Alert variant="error">{moveError}</Alert> : null}
                <div className="flex items-center gap-2">
                  <Button type="submit" size="sm" loading={moveBusy}>
                    <FolderInput size={14} aria-hidden="true" />
                    Move here
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={moveBusy}
                    onClick={() => setMoveEntry(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
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
          ) : visible.length === 0 ? (
            query.trim() !== "" ? (
              <EmptyState
                icon={Search}
                title={`No matches for "${query.trim()}"`}
                description="Search looks at names in this folder only."
              />
            ) : (
              <EmptyState
                icon={FolderOpen}
                title="This folder is empty"
                description="Upload files or create a folder to get started."
              />
            )
          ) : view === "grid" ? (
            /* Grid View */
            <Card
              className={`overflow-hidden ${dragOver ? "ring-2 ring-brand" : undefined}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
                {visible.map((entry) => {
                  const childPath = joinPath(path, entry.name);
                  return (
                    <div
                      key={entry.name}
                      className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-border p-4 text-center transition-colors hover:border-brand/40 hover:bg-muted/40 ${
                        selected.has(entry.name) ? "border-brand/60 bg-brand/5" : ""
                      }`}
                      onClick={() => {
                        if (entry.type === "dir") {
                          setPath(childPath);
                        } else if (entry.type === "file") {
                          setEditor({ path: childPath, name: entry.name, isNew: false });
                        }
                      }}
                    >
                      {/* Checkbox */}
                      <label
                        className="absolute left-2 top-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select ${entry.name}`}
                          checked={selected.has(entry.name)}
                          onChange={() => toggleSelected(entry.name)}
                          disabled={rowBusy}
                          className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                        />
                      </label>

                      {/* Context Menu Dropdown */}
                      <div
                        className="absolute right-2 top-2 opacity-70 group-hover:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button
                              type="button"
                              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={`Actions for ${entry.name}`}
                            >
                              <MoreVertical size={14} aria-hidden="true" />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              align="end"
                              className="z-50 min-w-[10rem] rounded-lg border border-border bg-popover p-1 shadow-xl animate-in fade-in-0 zoom-in-95"
                            >
                              {entry.type === "file" ? (
                                <DropdownMenu.Item
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                  onClick={() =>
                                    setEditor({ path: childPath, name: entry.name, isNew: false })
                                  }
                                >
                                  <Pencil size={13} className="text-muted-foreground" />
                                  Edit
                                </DropdownMenu.Item>
                              ) : null}

                              {entry.type === "file" ? (
                                <a
                                  href={`${filesBase}/download?path=${encodeURIComponent(childPath)}`}
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                >
                                  <Download size={13} className="text-muted-foreground" />
                                  Download
                                </a>
                              ) : null}

                              {entry.type !== "symlink" ? (
                                <>
                                  <DropdownMenu.Item
                                    className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                    onClick={() => openChmod(entry)}
                                  >
                                    <ShieldCheck size={13} className="text-muted-foreground" />
                                    Permissions
                                  </DropdownMenu.Item>

                                  <DropdownMenu.Item
                                    className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                    onClick={() => openCopy(entry)}
                                  >
                                    <Copy size={13} className="text-muted-foreground" />
                                    Copy
                                  </DropdownMenu.Item>

                                  <DropdownMenu.Item
                                    className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                    onClick={() => openMove(entry)}
                                  >
                                    <FolderInput size={13} className="text-muted-foreground" />
                                    Move
                                  </DropdownMenu.Item>

                                  <DropdownMenu.Item
                                    className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                    onClick={() => openCompress([entry])}
                                  >
                                    <FileArchive size={13} className="text-muted-foreground" />
                                    Compress
                                  </DropdownMenu.Item>

                                  {entry.type === "file" && isExtractable(entry.name) ? (
                                    <DropdownMenu.Item
                                      className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                      onClick={() => openExtract(entry)}
                                    >
                                      <PackageOpen size={13} className="text-muted-foreground" />
                                      Extract
                                    </DropdownMenu.Item>
                                  ) : null}

                                  <DropdownMenu.Item
                                    className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                    onClick={() => void onRename(entry)}
                                  >
                                    <Pencil size={13} className="text-muted-foreground" />
                                    Rename
                                  </DropdownMenu.Item>
                                </>
                              ) : null}

                              <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />

                              <DropdownMenu.Item
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-red-400 outline-none hover:bg-destructive/10 focus:bg-destructive/10"
                                onClick={() => void onDelete(entry)}
                              >
                                <Trash2 size={13} />
                                Delete
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </div>

                      {entry.type === "dir" ? (
                        <Folder size={28} className="text-brand/80" aria-hidden="true" />
                      ) : entry.type === "symlink" ? (
                        <Link2 size={28} className="text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <span className="flex h-7 items-center">
                          <FileGlyph name={entry.name} size={26} />
                        </span>
                      )}
                      <span className="w-full break-all font-mono text-xs text-foreground">
                        {entry.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {entry.type === "dir" ? "folder" : formatBytes(entry.sizeBytes)} ·{" "}
                        {shortDateTime(entry.modifiedAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : (
            /* List / Table View */
            <Card
              className="overflow-hidden"
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={allVisibleSelected}
                          onChange={() => {
                            if (allVisibleSelected) {
                              setSelected(new Set());
                            } else {
                              setSelected(new Set(visible.map((entry) => entry.name)));
                            }
                          }}
                          disabled={rowBusy}
                          className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                        />
                      </th>
                      <th className="px-3 py-3 text-left font-medium">Name</th>
                      <th className="px-3 py-3 text-right font-medium">Size</th>
                      <th className="px-3 py-3 text-left font-medium">Modified</th>
                      <th className="px-3 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((entry) => {
                      const childPath = joinPath(path, entry.name);
                      return (
                        <tr key={entry.name} className="border-t border-border hover:bg-muted/40">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              aria-label={`Select ${entry.name}`}
                              checked={selected.has(entry.name)}
                              onChange={() => toggleSelected(entry.name)}
                              disabled={rowBusy}
                              className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                            />
                          </td>
                          <td className="px-3 py-3">
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
                                <FileGlyph name={entry.name} />
                                <span className="break-all font-mono text-sm">{entry.name}</span>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs text-muted-foreground">
                            {entry.type === "dir" ? "—" : formatBytes(entry.sizeBytes)}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {shortDateTime(entry.modifiedAt)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {deleting === entry.name ? (
                                <span className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                                  <Spinner size={14} className="text-muted-foreground" />
                                  deleting…
                                </span>
                              ) : (
                                <>
                                  {/* Direct Quick Action Buttons */}
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
                                        <Pencil size={13} aria-hidden="true" />
                                        Edit
                                      </Button>
                                      <a
                                        href={`${filesBase}/download?path=${encodeURIComponent(childPath)}`}
                                        className={buttonClass("ghost", "sm")}
                                      >
                                        <Download size={13} aria-hidden="true" />
                                        Download
                                      </a>
                                    </>
                                  ) : null}

                                  {entry.type !== "symlink" ? (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={rowBusy}
                                        onClick={() => openChmod(entry)}
                                      >
                                        <ShieldCheck size={13} aria-hidden="true" />
                                        Permissions
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={rowBusy}
                                        onClick={() => openCompress([entry])}
                                      >
                                        <FileArchive size={13} aria-hidden="true" />
                                        Compress
                                      </Button>
                                      {entry.type === "file" && isExtractable(entry.name) ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          disabled={rowBusy}
                                          onClick={() => openExtract(entry)}
                                        >
                                          <PackageOpen size={13} aria-hidden="true" />
                                          Extract
                                        </Button>
                                      ) : null}
                                    </>
                                  ) : null}

                                  {/* Dropdown Menu for More Actions */}
                                  <DropdownMenu.Root>
                                    <DropdownMenu.Trigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        disabled={rowBusy}
                                        aria-label={`More actions for ${entry.name}`}
                                      >
                                        <MoreVertical size={14} aria-hidden="true" />
                                      </Button>
                                    </DropdownMenu.Trigger>
                                    <DropdownMenu.Portal>
                                      <DropdownMenu.Content
                                        align="end"
                                        className="z-50 min-w-[10rem] rounded-lg border border-border bg-popover p-1 shadow-xl animate-in fade-in-0 zoom-in-95"
                                      >
                                        {entry.type === "file" ? (
                                          <DropdownMenu.Item
                                            className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                            onClick={() =>
                                              setEditor({
                                                path: childPath,
                                                name: entry.name,
                                                isNew: false,
                                              })
                                            }
                                          >
                                            <Pencil size={13} className="text-muted-foreground" />
                                            Edit
                                          </DropdownMenu.Item>
                                        ) : null}

                                        {entry.type !== "symlink" ? (
                                          <>
                                            <DropdownMenu.Item
                                              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                              onClick={() => openChmod(entry)}
                                            >
                                              <ShieldCheck
                                                size={13}
                                                className="text-muted-foreground"
                                              />
                                              Permissions
                                            </DropdownMenu.Item>

                                            <DropdownMenu.Item
                                              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                              onClick={() => openCopy(entry)}
                                            >
                                              <Copy size={13} className="text-muted-foreground" />
                                              Copy
                                            </DropdownMenu.Item>

                                            <DropdownMenu.Item
                                              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                              onClick={() => openMove(entry)}
                                            >
                                              <FolderInput
                                                size={13}
                                                className="text-muted-foreground"
                                              />
                                              Move
                                            </DropdownMenu.Item>

                                            <DropdownMenu.Item
                                              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                              onClick={() => openCompress([entry])}
                                            >
                                              <FileArchive
                                                size={13}
                                                className="text-muted-foreground"
                                              />
                                              Compress
                                            </DropdownMenu.Item>

                                            {entry.type === "file" && isExtractable(entry.name) ? (
                                              <DropdownMenu.Item
                                                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                                onClick={() => openExtract(entry)}
                                              >
                                                <PackageOpen
                                                  size={13}
                                                  className="text-muted-foreground"
                                                />
                                                Extract
                                              </DropdownMenu.Item>
                                            ) : null}

                                            <DropdownMenu.Item
                                              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none hover:bg-muted focus:bg-muted"
                                              onClick={() => void onRename(entry)}
                                            >
                                              <Pencil
                                                size={13}
                                                className="text-muted-foreground"
                                              />
                                              Rename
                                            </DropdownMenu.Item>
                                          </>
                                        ) : null}

                                        <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />

                                        <DropdownMenu.Item
                                          className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-red-400 outline-none hover:bg-destructive/10 focus:bg-destructive/10"
                                          onClick={() => void onDelete(entry)}
                                        >
                                          <Trash2 size={13} />
                                          Delete
                                        </DropdownMenu.Item>
                                      </DropdownMenu.Content>
                                    </DropdownMenu.Portal>
                                  </DropdownMenu.Root>
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
        </div>
      </div>

      {/* Permissions (chmod) Dialog */}
      <ChmodDialog
        open={chmodOpen}
        onOpenChange={setChmodOpen}
        domain={domain}
        entry={chmodEntry}
        currentPath={path}
        onSuccess={() => {
          setNotice(`Permissions updated for "${chmodEntry?.name}".`);
          refresh();
        }}
      />

      {/* Compress Dialog */}
      <CompressDialog
        open={compressOpen}
        onOpenChange={setCompressOpen}
        domain={domain}
        items={compressItems}
        currentPath={path}
        onSuccess={() => {
          setSelected(new Set());
          setNotice("Archive created successfully.");
          refresh();
        }}
      />

      {/* Extract Dialog */}
      <ExtractDialog
        open={extractOpen}
        onOpenChange={setExtractOpen}
        domain={domain}
        entry={extractEntry}
        currentPath={path}
        onSuccess={() => {
          setSelected(new Set());
          setNotice(`Archive "${extractEntry?.name}" extracted.`);
          refresh();
        }}
      />

      {/* Copy Modal Dialog */}
      {copyEntry ? (
        <Dialog.Root open={Boolean(copyEntry)} onOpenChange={(open) => !open && setCopyEntry(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
            <Dialog.Content
              className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-6 shadow-2xl focus:outline-none"
              aria-describedby="copy-desc"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <Copy size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <Dialog.Title className="text-base font-semibold text-foreground">
                      Copy {copyEntry.name}
                    </Dialog.Title>
                    <p id="copy-desc" className="text-xs text-muted-foreground">
                      Duplicate this item to a new destination inside the site webroot.
                    </p>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Close"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </div>

              <form onSubmit={onSubmitCopy} className="mt-4 space-y-4">
                {copyError ? <Alert variant="error">{copyError}</Alert> : null}
                <div className="space-y-1.5">
                  <Label htmlFor="copy-target">Destination Path</Label>
                  <Input
                    id="copy-target"
                    value={copyTarget}
                    onChange={(e) => setCopyTarget(e.target.value)}
                    placeholder="assets/my-copy"
                    disabled={copyBusy}
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Relative to site root.
                  </p>
                </div>

                <label className="flex items-center gap-2 text-xs text-foreground/80">
                  <input
                    type="checkbox"
                    checked={copyOverwrite}
                    onChange={(e) => setCopyOverwrite(e.target.checked)}
                    disabled={copyBusy}
                    className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
                  />
                  Overwrite destination if it already exists
                </label>

                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCopyEntry(null)}
                    disabled={copyBusy}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={copyBusy}>
                    <Copy size={14} aria-hidden="true" />
                    Copy Item
                  </Button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </>
  );
}
