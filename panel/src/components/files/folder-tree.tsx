"use client";

import { useEffect, useRef, useState } from "react";
import type { FileEntry, FileListResponse } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";

interface FolderTreeProps {
  /** e.g. `/api/sites/example.com/files`. */
  filesBase: string;
  /** Directory path highlighted as the current location. */
  currentPath: string;
  /** Called with the clicked directory path ("" is the webroot). */
  onSelect: (path: string) => void;
  /** Bump to make the tree drop its cache and reload. */
  refreshKey?: number;
}

/**
 * Hostinger-style lazy directory tree: top-level folders load on mount,
 * expanding a folder fetches its subfolders on demand. Directories only.
 */
export function FolderTree({ filesBase, currentPath, onSelect, refreshKey = 0 }: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([""]));
  const [kids, setKids] = useState<Map<string, FileEntry[]>>(() => new Map());
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const loadedRef = useRef<Set<string>>(new Set());

  async function fetchDirs(dir: string): Promise<FileEntry[]> {
    const data = await apiFetch<FileListResponse>(
      `${filesBase}?path=${encodeURIComponent(dir)}`,
    );
    return data.entries
      .filter((entry) => entry.type === "dir")
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  async function load(dir: string) {
    if (loadedRef.current.has(dir)) return;
    loadedRef.current.add(dir);
    try {
      const dirs = await fetchDirs(dir);
      setKids((prev) => new Map(prev).set(dir, dirs));
    } catch {
      loadedRef.current.delete(dir);
      setFailed((prev) => new Set(prev).add(dir));
    }
  }

  // Refresh: drop the cache and reload every expanded level in place.
  useEffect(() => {
    if (refreshKey === 0) return;
    loadedRef.current.clear();
    setKids(new Map());
    setFailed(new Set());
    for (const dir of expanded) void load(dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Open the branches that lead to the highlighted directory.
  useEffect(() => {
    if (currentPath === "") return;
    const segments = currentPath.split("/");
    for (let i = 1; i <= segments.length; i += 1) {
      const prefix = segments.slice(0, i).join("/");
      void load(prefix);
      setExpanded((prev) => {
        if (prev.has(prefix)) return prev;
        const next = new Set(prev);
        next.add(prefix);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  function toggle(dir: string) {
    void load(dir);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  }

  function renderNode(dir: string, name: string, depth: number) {
    const childPath = dir === "" ? name : `${dir}/${name}`;
    const isOpen = expanded.has(childPath);
    const isCurrent = currentPath === childPath;
    const dirs = kids.get(dir) ?? [];
    return (
      <li key={childPath}>
        <div
          className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-sm ${
            isCurrent ? "bg-brand/10 text-brand" : "text-foreground hover:bg-muted/60"
          }`}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
        >
          <button
            type="button"
            aria-label={isOpen ? `Collapse ${name}` : `Expand ${name}`}
            className="shrink-0 cursor-pointer p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => toggle(childPath)}
          >
            {isOpen ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left"
            onClick={() => onSelect(childPath)}
          >
            {isOpen ? (
              <FolderOpen size={14} className="shrink-0 text-brand/80" aria-hidden="true" />
            ) : (
              <Folder size={14} className="shrink-0 text-brand/80" aria-hidden="true" />
            )}
            <span className="truncate font-mono text-xs">{name}</span>
          </button>
        </div>
        {isOpen ? (
          <ul>
            {failed.has(childPath) ? (
              <li
                className="py-1 text-xs text-muted-foreground"
                style={{ paddingLeft: `${(depth + 1) * 14 + 24}px` }}
              >
                could not load
              </li>
            ) : dirs.map((entry) => renderNode(childPath, entry.name, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  }

  const rootDirs = kids.get("") ?? [];

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-sm ${
          currentPath === "" ? "bg-brand/10 text-brand" : "text-foreground hover:bg-muted/60"
        }`}
      >
        <button
          type="button"
          aria-label={expanded.has("") ? "Collapse web root" : "Expand web root"}
          className="shrink-0 cursor-pointer p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => toggle("")}
        >
          {expanded.has("") ? (
            <ChevronDown size={13} aria-hidden="true" />
          ) : (
            <ChevronRight size={13} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left"
          onClick={() => onSelect("")}
        >
          {expanded.has("") ? (
            <FolderOpen size={14} className="shrink-0 text-brand/80" aria-hidden="true" />
          ) : (
            <Folder size={14} className="shrink-0 text-brand/80" aria-hidden="true" />
          )}
          <span className="truncate font-mono text-xs">web root</span>
        </button>
      </div>
      {expanded.has("") ? (
        <ul>
          {failed.has("") ? (
            <li className="py-1 pl-7 text-xs text-muted-foreground">could not load folders</li>
          ) : rootDirs.map((entry) => renderNode("", entry.name, 1))}
        </ul>
      ) : null}
    </div>
  );
}