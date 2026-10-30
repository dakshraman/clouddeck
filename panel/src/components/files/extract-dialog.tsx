"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { FileEntry } from "@/lib/types";
import { apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatBytes } from "@/components/format";
import {
  Check,
  FolderOpen,
  PackageOpen,
  X,
} from "lucide-react";
import { FileGlyph } from "@/components/files/file-icons";

export interface ExtractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  entry: FileEntry | null;
  currentPath: string;
  onSuccess: () => void;
}

function isValidWebrootPath(value: string): boolean {
  if (value.length > 1024) return false;
  if (value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  if (value === "") return true;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function ExtractDialog({
  open,
  onOpenChange,
  domain,
  entry,
  currentPath,
  onSuccess,
}: ExtractDialogProps) {
  const [destination, setDestination] = useState(currentPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDestination(currentPath);
      setError(null);
      setSuccessNotice(null);
    }
  }, [open, currentPath]);

  if (!entry) return null;

  const archivePath = currentPath === "" ? entry.name : `${currentPath}/${entry.name}`;

  // Suggest extracting to a subfolder named after the archive
  const cleanBaseName = entry.name.replace(/\.(tar\.gz|tgz|zip|tar)$/i, "");
  const subfolderPath = currentPath === "" ? cleanBaseName : `${currentPath}/${cleanBaseName}`;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const dest = destination.trim();
    if (!isValidWebrootPath(dest)) {
      setError("Please enter a valid destination path relative to the site root without '..' segments.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessNotice(null);

    try {
      await apiPost<{ path: string }>(
        `/api/sites/${encodeURIComponent(domain)}/files/extract`,
        {
          archive: archivePath,
          dest,
        },
      );

      const destDisplay = dest === "" ? "the site root" : `"${dest}"`;
      setSuccessNotice(`Extracted "${entry.name}" into ${destDisplay}.`);
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract archive");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-6 shadow-2xl focus:outline-none"
          aria-describedby="extract-description"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <PackageOpen size={20} aria-hidden="true" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-foreground">
                  Extract Archive
                </Dialog.Title>
                <p id="extract-description" className="text-xs text-muted-foreground">
                  Unpack files from compressed archive into a destination folder.
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

            {/* Archive Info */}
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
              <FileGlyph name={entry.name} size={20} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-semibold text-foreground">
                  {entry.name}
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  /{archivePath} · {formatBytes(entry.sizeBytes)}
                </p>
              </div>
              <Badge variant="indigo">Archive</Badge>
            </div>

            {/* Destination Directory */}
            <div className="space-y-1.5">
              <Label htmlFor="extract-dest">Destination Directory</Label>
              <Input
                id="extract-dest"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="public_html (or leave blank for site root)"
                disabled={busy}
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Path relative to the site root. Leave empty to unpack directly into site root.
              </p>
            </div>

            {/* Quick Destination Buttons */}
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDestination(currentPath)}
                className={destination === currentPath ? "border-brand bg-brand/10 text-brand" : ""}
              >
                <FolderOpen size={13} aria-hidden="true" />
                Current folder ({currentPath || "root"})
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDestination("")}
                className={destination === "" ? "border-brand bg-brand/10 text-brand" : ""}
              >
                Site root (/)
              </Button>
              {cleanBaseName && cleanBaseName !== currentPath ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDestination(subfolderPath)}
                  className={destination === subfolderPath ? "border-brand bg-brand/10 text-brand" : ""}
                >
                  New folder /{subfolderPath}
                </Button>
              ) : null}
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
                <PackageOpen size={14} aria-hidden="true" />
                Extract Files
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
