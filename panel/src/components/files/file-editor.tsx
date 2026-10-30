"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FileContentResponse, FileWriteResponse } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/components/format";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Maximize2,
  Minimize2,
  Save,
  X,
} from "lucide-react";

interface FileEditorProps {
  domain: string;
  path: string;
  name: string;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface LanguageInfo {
  label: string;
  variant: BadgeVariant;
}

function getLanguageInfo(filename: string): LanguageInfo {
  const lower = filename.toLowerCase();
  if (lower === ".htaccess") return { label: "Apache", variant: "red" };
  if (lower.startsWith(".env")) return { label: "ENV", variant: "amber" };
  if (lower === "dockerfile") return { label: "Docker", variant: "indigo" };

  const dot = lower.lastIndexOf(".");
  if (dot === -1) {
    if (lower.startsWith(".")) return { label: "Config", variant: "neutral" };
    return { label: "Plain Text", variant: "neutral" };
  }

  const ext = lower.slice(dot + 1);
  switch (ext) {
    case "php":
    case "phtml":
      return { label: "PHP", variant: "indigo" };
    case "js":
    case "mjs":
    case "cjs":
      return { label: "JavaScript", variant: "amber" };
    case "ts":
    case "mts":
    case "cts":
      return { label: "TypeScript", variant: "indigo" };
    case "jsx":
      return { label: "React JSX", variant: "amber" };
    case "tsx":
      return { label: "React TSX", variant: "indigo" };
    case "html":
    case "htm":
      return { label: "HTML", variant: "amber" };
    case "css":
      return { label: "CSS", variant: "indigo" };
    case "scss":
    case "sass":
      return { label: "SCSS", variant: "indigo" };
    case "json":
      return { label: "JSON", variant: "green" };
    case "py":
      return { label: "Python", variant: "green" };
    case "sh":
    case "bash":
    case "zsh":
      return { label: "Bash", variant: "neutral" };
    case "sql":
      return { label: "SQL", variant: "neutral" };
    case "md":
    case "markdown":
      return { label: "Markdown", variant: "neutral" };
    case "yml":
    case "yaml":
      return { label: "YAML", variant: "green" };
    case "xml":
    case "svg":
      return { label: "XML", variant: "amber" };
    case "ini":
    case "conf":
    case "cfg":
      return { label: "Config", variant: "neutral" };
    case "txt":
    case "log":
      return { label: "Plain Text", variant: "neutral" };
    default:
      return { label: ext.toUpperCase(), variant: "neutral" };
  }
}

export function FileEditor({ domain, path, name, isNew, onClose, onSaved }: FileEditorProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const initialContentRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const contentUrl = `/api/sites/${encodeURIComponent(domain)}/files/content?path=${encodeURIComponent(path)}`;
  const language = getLanguageInfo(name);

  const loadContent = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<FileContentResponse>(contentUrl);
      setContent(data.content);
      initialContentRef.current = data.content;
      setIsDirty(false);
      setSavedNotice(false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load the file");
    } finally {
      setLoading(false);
    }
  }, [contentUrl]);

  useEffect(() => {
    if (!isNew) {
      void loadContent();
    } else {
      initialContentRef.current = "";
      setIsDirty(false);
    }
  }, [isNew, loadContent]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch<FileWriteResponse>(contentUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      initialContentRef.current = content;
      setIsDirty(false);
      setSavedNotice(true);
      onSaved();
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save the file");
    } finally {
      setSaving(false);
    }
  }, [contentUrl, path, content, onSaved]);

  const handleCloseRequest = useCallback(() => {
    if (isDirty) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // Keyboard shortcuts: Ctrl+S/Cmd+S to save, Esc to close/confirm
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving && !loading && loadError === null) {
          void onSave();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (showConfirmClose) {
          setShowConfirmClose(false);
        } else {
          handleCloseRequest();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSave, saving, loading, loadError, showConfirmClose, handleCloseRequest]);

  // Update cursor position and line/col
  const updateCursorPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const pos = textarea.selectionStart;
    const before = textarea.value.slice(0, pos);
    const lines = before.split("\n");
    setCursorPos({
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    });
  }, []);

  // Synchronize gutter scrolling with textarea
  const handleScroll = useCallback(() => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Handle Tab key inside textarea
  const handleKeyDownTextarea = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextContent = content.substring(0, start) + "  " + content.substring(end);
      setContent(nextContent);
      setIsDirty(nextContent !== initialContentRef.current);
      setSavedNotice(false);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        updateCursorPosition();
      });
    }
  };

  const lineCount = Math.max(1, content.split("\n").length);
  const sizeBytes = new TextEncoder().encode(content).length;

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-background/95 p-4 backdrop-blur-sm sm:p-6"
          : "relative"
      }
    >
      <Card className={`flex flex-col overflow-hidden border-border ${isFullscreen ? "h-full" : ""}`}>
        {/* Top Header Bar */}
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-sm font-semibold text-foreground">
                  {name}
                </span>

                {/* Dirty indicator */}
                {isDirty ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300"
                    title="Unsaved changes"
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                    Unsaved
                  </span>
                ) : null}

                {/* Language Badge */}
                <Badge variant={language.variant}>{language.label}</Badge>

                {/* File Size */}
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline-block">
                  {formatBytes(sizeBytes)}
                </span>
              </div>

              <span className="truncate font-mono text-xs text-muted-foreground" title={path}>
                {path}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {savedNotice ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                <Check size={14} aria-hidden="true" />
                Saved
              </span>
            ) : null}

            {/* Fullscreen Toggle Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen((prev) => !prev)}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 size={14} aria-hidden="true" />
              ) : (
                <Maximize2 size={14} aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </span>
            </Button>

            {/* Cancel/Close Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseRequest}
              disabled={saving}
              title="Close editor (Esc)"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Cancel
            </Button>

            {/* Save Button */}
            <Button
              size="sm"
              loading={saving}
              disabled={loading || loadError !== null}
              onClick={() => void onSave()}
              title="Save changes (Ctrl+S / Cmd+S)"
            >
              {saving ? null : <Save size={14} aria-hidden="true" />}
              Save
            </Button>
          </div>
        </CardHeader>

        {/* Content Body */}
        <CardBody className={`flex min-h-0 flex-1 flex-col gap-3 p-4 ${isFullscreen ? "h-full" : ""}`}>
          {saveError ? <Alert variant="error">{saveError}</Alert> : null}

          {loadError ? (
            <Alert variant="error">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="break-all">{loadError}</span>
                <Button variant="secondary" size="sm" onClick={() => void loadContent()}>
                  Retry
                </Button>
              </div>
            </Alert>
          ) : null}

          {loading ? (
            <Skeleton className={isFullscreen ? "h-full min-h-[500px]" : "h-96"} />
          ) : loadError ? null : (
            <div
              className={`relative flex min-h-[420px] flex-1 overflow-hidden rounded-lg border border-input bg-background/80 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30 ${
                isFullscreen ? "h-full min-h-[500px]" : "h-[500px]"
              }`}
            >
              {/* Line Numbers Gutter */}
              <div
                ref={gutterRef}
                aria-hidden="true"
                className="select-none overflow-hidden border-r border-border bg-muted/15 py-3 pl-3 pr-2 text-right font-mono text-xs leading-6 text-muted-foreground/40 sm:text-sm"
                style={{ width: `${Math.max(3, String(lineCount).length + 1.5)}ch` }}
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i + 1} className="h-6 leading-6">
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Code Textarea */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  setIsDirty(event.target.value !== initialContentRef.current);
                  setSavedNotice(false);
                  updateCursorPosition();
                }}
                onKeyUp={updateCursorPosition}
                onClick={updateCursorPosition}
                onScroll={handleScroll}
                onKeyDown={handleKeyDownTextarea}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                data-gramm="false"
                aria-label={`Edit ${name}`}
                style={{ tabSize: 2 }}
                className="h-full w-full flex-1 resize-none overflow-auto whitespace-pre bg-transparent p-3 font-mono text-xs leading-6 text-foreground placeholder:text-muted-foreground/60 focus:outline-none sm:text-sm"
              />
            </div>
          )}

          {/* Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-3 font-mono">
              <span>
                Line {cursorPos.line}, Col {cursorPos.col}
              </span>
              <span>{lineCount} lines</span>
              <span>{formatBytes(sizeBytes)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline">UTF-8</span>
              <span className="hidden sm:inline">Spaces: 2</span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">
                Ctrl+S to save
              </kbd>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Unsaved Changes Confirmation Dialog */}
      {showConfirmClose ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-popover p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                <CircleAlert size={20} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Discard unsaved changes?
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  You have unsaved changes in <span className="font-mono text-foreground">{name}</span>.
                  Leaving now will discard all edits made since the last save.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmClose(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmClose(false)}
              >
                Keep editing
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setShowConfirmClose(false);
                  onClose();
                }}
              >
                Discard changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
