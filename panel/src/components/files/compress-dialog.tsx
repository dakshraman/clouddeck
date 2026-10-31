"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@animate-ui/react/primitives/radix-ui/dialog";
import type { FileEntry } from "@/lib/types";
import { apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatBytes } from "@/components/format";
import {
  Archive,
  Check,
  FileArchive,
  Folder,
  X,
} from "lucide-react";
import { FileGlyph } from "@/components/files/file-icons";

export interface CompressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  items: FileEntry[];
  currentPath: string;
  onSuccess: () => void;
}

type ArchiveFormat = "zip" | "tar.gz";

function isValidWebrootPath(value: string): boolean {
  if (value.length > 1024) return false;
  if (value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  if (value === "") return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function CompressDialog({
  open,
  onOpenChange,
  domain,
  items,
  currentPath,
  onSuccess,
}: CompressDialogProps) {
  const [format, setFormat] = useState<ArchiveFormat>("zip");
  const [filename, setFilename] = useState("");
  const [filenameEdited, setFilenameEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Initialize default filename based on selected items
  useEffect(() => {
    if (open && items.length > 0) {
      const ext = format === "zip" ? ".zip" : ".tar.gz";
      let baseName = "archive";
      if (items.length === 1) {
        const item = items[0];
        // Strip existing extension if it's a file
        const dotIndex = item.name.lastIndexOf(".");
        baseName = item.type === "file" && dotIndex > 0 ? item.name.slice(0, dotIndex) : item.name;
      }
      setFilename(`${baseName}${ext}`);
      setFilenameEdited(false);
      setError(null);
      setSuccessNotice(null);
    }
  }, [open, items, format]);

  const handleFormatChange = (newFormat: ArchiveFormat) => {
    setFormat(newFormat);
    if (!filenameEdited) {
      const ext = newFormat === "zip" ? ".zip" : ".tar.gz";
      let baseName = "archive";
      if (items.length === 1) {
        const item = items[0];
        const dotIndex = item.name.lastIndexOf(".");
        baseName = item.type === "file" && dotIndex > 0 ? item.name.slice(0, dotIndex) : item.name;
      }
      setFilename(`${baseName}${ext}`);
    } else {
      // If user typed a custom name, adjust extension
      const cleaned = filename.replace(/\.(zip|tar\.gz)$/i, "");
      setFilename(`${cleaned}.${newFormat}`);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (items.length === 0) return;

    const trimmed = filename.trim();
    if (!trimmed) {
      setError("Please enter a name for the archive file.");
      return;
    }

    // Target path relative to site root
    const targetRelative = currentPath === "" ? trimmed : `${currentPath}/${trimmed}`;
    if (!isValidWebrootPath(targetRelative)) {
      setError("Enter a valid archive name without invalid path segments.");
      return;
    }

    const paths = items.map((item) =>
      currentPath === "" ? item.name : `${currentPath}/${item.name}`,
    );

    setBusy(true);
    setError(null);
    setSuccessNotice(null);

    try {
      await apiPost<{ path: string }>(
        `/api/sites/${encodeURIComponent(domain)}/files/compress`,
        {
          paths,
          format,
          target: targetRelative,
        },
      );

      setSuccessNotice(`Archive "${trimmed}" created successfully.`);
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create archive");
    } finally {
      setBusy(false);
    }
  };

  if (!open || items.length === 0) return null;

  const totalBytes = items.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm " />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-6 shadow-2xl focus:outline-none"
          aria-describedby="compress-description"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <FileArchive size={20} aria-hidden="true" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-foreground">
                  Compress to Archive
                </Dialog.Title>
                <p id="compress-description" className="text-xs text-muted-foreground">
                  Package selected files and folders into a compressed archive.
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error ? <Alert variant="error">{error}</Alert> : null}
            {successNotice ? (
              <Alert variant="success">
                <span className="flex items-center gap-1.5 font-medium">
                  <Check size={14} />
                  {successNotice}
                </span>
              </Alert>
            ) : null}

            {/* Selected Items Summary */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>Selected items ({items.length})</span>
                <span>{formatBytes(totalBytes)}</span>
              </div>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2.5">
                <ul className="space-y-1 text-xs font-mono">
                  {items.map((item) => (
                    <li key={item.name} className="flex items-center gap-2 text-foreground/90">
                      {item.type === "dir" ? (
                        <Folder size={14} className="shrink-0 text-brand/80" />
                      ) : (
                        <FileGlyph name={item.name} size={14} />
                      )}
                      <span className="truncate flex-1">{item.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {item.type === "dir" ? "dir" : formatBytes(item.sizeBytes)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Archive Format Selection */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="archive-format">Archive Format</Label>
                <div className="mt-1">
                  <Select
                    id="archive-format"
                    value={format}
                    onChange={(e) => handleFormatChange(e.target.value as ArchiveFormat)}
                    disabled={busy}
                    className="w-full"
                  >
                    <option value="zip">ZIP (.zip) - Recommended</option>
                    <option value="tar.gz">Tar Gzip (.tar.gz)</option>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="archive-filename">Archive Filename</Label>
                <div className="mt-1">
                  <Input
                    id="archive-filename"
                    value={filename}
                    onChange={(e) => {
                      setFilename(e.target.value);
                      setFilenameEdited(true);
                    }}
                    placeholder={`archive.${format}`}
                    disabled={busy}
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Destination Preview */}
            <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Save destination:</span>{" "}
              <span className="font-mono text-brand">
                /{currentPath ? `${currentPath}/` : ""}{filename}
              </span>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={busy}>
                <Archive size={14} aria-hidden="true" />
                Compress
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
