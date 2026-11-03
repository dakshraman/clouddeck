"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { FileEntry } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FileGlyph } from "@/components/files/file-icons";
import { formatBytes, shortDateTime } from "@/components/format";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Maximize2,
  Minimize2,
  Pencil,
  RotateCcw,
  WrapText,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export interface FileViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  entry: FileEntry | null;
  currentPath: string;
  onEditRequested?: (entry: FileEntry) => void;
}

type ViewerType = "image" | "pdf" | "video" | "audio" | "text" | "binary";

function getViewerType(name: string): ViewerType {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif"].includes(ext)) {
    return "image";
  }
  if (ext === "pdf") {
    return "pdf";
  }
  if (["mp4", "webm", "ogv"].includes(ext)) {
    return "video";
  }
  if (["mp3", "wav", "ogg", "aac", "flac"].includes(ext)) {
    return "audio";
  }
  if (
    [
      "txt", "log", "md", "markdown", "php", "phtml", "js", "mjs", "cjs", "ts", "mts", "cts",
      "jsx", "tsx", "html", "htm", "css", "scss", "sass", "json", "xml", "svg", "py", "sh",
      "bash", "zsh", "sql", "env", "yaml", "yml", "ini", "conf", "cfg", "lock", "gitignore",
      "dockerfile", "htaccess", "properties", "toml", "c", "cpp", "h", "go", "rs", "java",
    ].includes(ext) ||
    name.startsWith(".env") ||
    name.toLowerCase() === "dockerfile" ||
    name.toLowerCase() === ".htaccess"
  ) {
    return "text";
  }
  return "binary";
}

export function FileViewer({
  open,
  onOpenChange,
  domain,
  entry,
  currentPath,
  onEditRequested,
}: FileViewerProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [wrapText, setWrapText] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [isFullWidth, setIsFullWidth] = useState(false);

  const fullPath = useMemo(() => {
    if (!entry) return "";
    return currentPath === "" ? entry.name : `${currentPath}/${entry.name}`;
  }, [entry, currentPath]);

  const viewerType = useMemo(() => {
    return entry ? getViewerType(entry.name) : "binary";
  }, [entry]);

  const rawUrl = useMemo(() => {
    if (!entry) return "";
    return `/api/sites/${encodeURIComponent(domain)}/files/download?path=${encodeURIComponent(fullPath)}&inline=true`;
  }, [domain, entry, fullPath]);

  const downloadUrl = useMemo(() => {
    if (!entry) return "";
    return `/api/sites/${encodeURIComponent(domain)}/files/download?path=${encodeURIComponent(fullPath)}`;
  }, [domain, entry, fullPath]);

  // Load text content when viewing text-based file
  useEffect(() => {
    if (!open || !entry || viewerType !== "text") {
      setTextContent(null);
      setTextLoading(false);
      setTextError(null);
      return;
    }

    let active = true;
    setTextLoading(true);
    setTextError(null);

    const contentUrl = `/api/sites/${encodeURIComponent(domain)}/files/content?path=${encodeURIComponent(fullPath)}`;
    apiFetch<{ content: string }>(contentUrl)
      .then((data) => {
        if (active) {
          setTextContent(data.content);
        }
      })
      .catch((err) => {
        if (active) {
          setTextError(err instanceof Error ? err.message : "Failed to load file preview");
        }
      })
      .finally(() => {
        if (active) setTextLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, entry, viewerType, domain, fullPath]);

  // Reset zoom on open
  useEffect(() => {
    if (open) {
      setZoom(1);
      setCopied(false);
    }
  }, [open]);

  const copyText = useCallback(() => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [textContent]);

  if (!entry) return null;

  const lines = textContent !== null ? textContent.split("\n") : [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm animate-in fade-in-0 duration-200" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card shadow-2xl transition-all duration-200 focus:outline-none ${
            isFullWidth
              ? "w-[calc(100%-1.5rem)] h-[90vh]"
              : "w-[calc(100%-2rem)] max-w-5xl h-[85vh]"
          }`}
          aria-describedby="file-viewer-description"
        >
          {/* Header Bar */}
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileGlyph name={entry.name} size={20} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Dialog.Title className="truncate font-mono text-sm font-semibold text-foreground">
                    {entry.name}
                  </Dialog.Title>
                  <Badge variant="neutral" className="text-[10px] uppercase font-mono">
                    {viewerType}
                  </Badge>
                </div>
                <p id="file-viewer-description" className="truncate text-xs text-muted-foreground font-mono">
                  /{fullPath} • {formatBytes(entry.sizeBytes)} • {shortDateTime(entry.modifiedAt)}
                </p>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center gap-1.5 shrink-0">
              {viewerType === "text" && onEditRequested ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onEditRequested(entry);
                  }}
                  className="gap-1.5 text-xs font-medium"
                >
                  <Pencil size={13} aria-hidden="true" />
                  Edit File
                </Button>
              ) : null}

              {viewerType === "text" && textContent !== null ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setWrapText(!wrapText)}
                    title={wrapText ? "Disable Word Wrap" : "Enable Word Wrap"}
                    aria-label="Toggle word wrap"
                  >
                    <WrapText size={14} className={wrapText ? "text-brand" : "text-muted-foreground"} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={copyText}
                    title="Copy Content"
                    aria-label="Copy file content"
                  >
                    {copied ? (
                      <Check size={14} className="text-emerald-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </Button>
                </>
              ) : null}

              {viewerType === "image" ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                    title="Zoom Out"
                    aria-label="Zoom out"
                  >
                    <ZoomOut size={14} />
                  </Button>
                  <span className="font-mono text-[11px] text-muted-foreground min-w-[3rem] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                    title="Zoom In"
                    aria-label="Zoom in"
                  >
                    <ZoomIn size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setZoom(1)}
                    title="Reset Zoom"
                    aria-label="Reset zoom to 100%"
                  >
                    <RotateCcw size={13} />
                  </Button>
                </>
              ) : null}

              <a
                href={rawUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Open Raw in New Tab"
                aria-label="Open in new browser tab"
              >
                <ExternalLink size={14} />
              </a>

              <a
                href={downloadUrl}
                download={entry.name}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Download"
                aria-label="Download file"
              >
                <Download size={14} />
              </a>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsFullWidth(!isFullWidth)}
                title={isFullWidth ? "Restore Size" : "Maximize"}
                aria-label="Toggle full width"
              >
                {isFullWidth ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </Button>

              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Close"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Body Preview Area */}
          <div className="flex-1 min-h-0 overflow-auto bg-[#0d1117] text-slate-200">
            {viewerType === "image" ? (
              <div
                className="flex min-h-full items-center justify-center p-6"
                style={{
                  backgroundImage: `radial-gradient(#1f2937 1px, transparent 1px)`,
                  backgroundSize: "16px 16px",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={rawUrl}
                  alt={entry.name}
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "center center",
                    transition: "transform 0.15s ease",
                  }}
                  className="max-h-[70vh] max-w-full rounded-md object-contain shadow-2xl"
                />
              </div>
            ) : viewerType === "pdf" ? (
              <iframe
                src={rawUrl}
                title={entry.name}
                className="h-full w-full border-0 bg-white"
              />
            ) : viewerType === "video" ? (
              <div className="flex h-full items-center justify-center p-6 bg-black">
                <video
                  src={rawUrl}
                  controls
                  autoPlay={false}
                  className="max-h-full max-w-full rounded-lg shadow-2xl"
                >
                  Your browser does not support HTML5 video preview.
                </video>
              </div>
            ) : viewerType === "audio" ? (
              <div className="flex h-full flex-col items-center justify-center gap-6 p-8 bg-[#111827]">
                <div className="rounded-full bg-brand/10 p-6 text-brand">
                  <FileGlyph name={entry.name} size={48} />
                </div>
                <div className="text-center">
                  <p className="font-mono text-base font-semibold text-foreground">{entry.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground font-mono">{formatBytes(entry.sizeBytes)}</p>
                </div>
                <audio src={rawUrl} controls className="w-full max-w-md">
                  Your browser does not support HTML5 audio playback.
                </audio>
              </div>
            ) : viewerType === "text" ? (
              textLoading ? (
                <div className="flex h-full items-center justify-center gap-3 p-12 text-muted-foreground">
                  <Spinner size={18} className="text-brand" />
                  <span className="font-mono text-xs">Loading file preview…</span>
                </div>
              ) : textError ? (
                <div className="p-6">
                  <Alert variant="error">{textError}</Alert>
                </div>
              ) : (
                <div className="flex min-h-full font-mono text-xs">
                  {/* Line numbers gutter */}
                  <div className="select-none border-r border-slate-800 bg-[#090d13] px-3 py-4 text-right font-mono text-slate-600 shrink-0">
                    {lines.map((_, i) => (
                      <div key={i} className="leading-6">
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  {/* Content viewer */}
                  <div
                    className={`flex-1 p-4 overflow-x-auto font-mono text-slate-200 ${
                      wrapText ? "whitespace-pre-wrap break-all" : "whitespace-pre"
                    }`}
                  >
                    {lines.map((line, i) => (
                      <div key={i} className="leading-6">
                        {line || " "}
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : (
              /* Binary / Unknown fallback card */
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center bg-[#0d1117]">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <FileGlyph name={entry.name} size={48} />
                </div>
                <div>
                  <h3 className="font-mono text-base font-semibold text-foreground">
                    {entry.name}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Binary or unsupported preview format ({formatBytes(entry.sizeBytes)})
                  </p>
                </div>
                <div className="flex gap-2.5 pt-2">
                  <a
                    href={downloadUrl}
                    download={entry.name}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground hover:bg-brand/90 transition"
                  >
                    <Download size={14} />
                    Download File
                  </a>
                  <a
                    href={rawUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition"
                  >
                    <ExternalLink size={14} />
                    Open Raw
                  </a>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

