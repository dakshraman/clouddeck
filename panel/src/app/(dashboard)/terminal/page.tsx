"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { TermSession, TermStatusResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/ui/cn";
import {
  Check,
  Copy,
  Maximize2,
  Minimize2,
  Play,
  RotateCw,
  Square,
  Terminal as TerminalIcon,
  Trash2,
  Sparkles,
} from "lucide-react";

type LoadState = "loading" | "ready" | "error";
type Phase = "idle" | "starting" | "running" | "ended";

// docs/api.md section 1.9: the agent accepts 8-500 cols/rows.
const MIN_DIMENSION = 8;
const MAX_DIMENSION = 500;
const RESIZE_DEBOUNCE_MS = 150;

function clampDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.trunc(value)));
}

/** btoa() alone breaks on code points above 0x7F; encode as UTF-8 first. */
function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

const QUICK_COMMANDS = [
  { label: "clouddeck status", cmd: "clouddeck status" },
  { label: "clouddeck doctor", cmd: "clouddeck doctor" },
  { label: "nginx -t", cmd: "nginx -t" },
  { label: "htop", cmd: "htop" },
  { label: "df -h", cmd: "df -h" },
  { label: "free -m", cmd: "free -m" },
];

function TerminalContent() {
  const searchParams = useSearchParams();
  const cmdParam = searchParams.get("exec") || searchParams.get("cmd") || searchParams.get("command") || "";
  const initialCmdRef = useRef<string | null>(cmdParam ? cmdParam.trim() : null);
  const executedCmdRef = useRef(false);

  const [state, setState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<TermStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [startError, setStartError] = useState<string | null>(null);
  const [streamNotice, setStreamNotice] = useState<string | null>(null);
  const [fullPage, setFullPage] = useState(false);
  const [fullPageAvailable, setFullPageAvailable] = useState(false);
  const [dimensions, setDimensions] = useState<{ cols: number; rows: number }>({ cols: 80, rows: 24 });
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const inputSubscriptionRef = useRef<IDisposable | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const windowResizeHandlerRef = useRef<(() => void) | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const startingRef = useRef(false);
  const disposedRef = useRef(false);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    setFullPageAvailable(document.fullscreenEnabled);
  }, []);

  useEffect(() => {
    const onChange = () => {
      const isFullscreen = document.fullscreenElement === shellRef.current;
      setFullPage(isFullscreen);
      window.setTimeout(() => {
        try {
          if (termRef.current && fitRef.current) {
            fitRef.current.fit();
            setDimensions({ cols: termRef.current.cols, rows: termRef.current.rows });
          }
        } catch {
          // ignore
        }
      }, 80);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullPage = useCallback(async () => {
    const element = shellRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
    } catch {
      // The browser refused full page mode (for example inside an iframe).
    }
  }, []);

  const loadStatus = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setState("loading");
      setErrorMessage(null);
    }
    try {
      const result = await apiFetch<TermStatusResponse>("/api/term/status");
      setStatus(result);
      setState("ready");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load terminal status");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const stopSession = useCallback((deleteRemote = true) => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    if (resizeTimerRef.current !== null) {
      window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = null;
    }
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (windowResizeHandlerRef.current) {
      window.removeEventListener("resize", windowResizeHandlerRef.current);
      windowResizeHandlerRef.current = null;
    }
    inputSubscriptionRef.current?.dispose();
    inputSubscriptionRef.current = null;
    streamRef.current?.close();
    streamRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
    lastSizeRef.current = null;
    setStreamNotice(null);
    setPhase("idle");

    if (sessionId) {
      setStatus((prev) => (prev ? { ...prev, sessions: Math.max(0, prev.sessions - 1) } : prev));
      if (deleteRemote) {
        void fetch(`/api/term/sessions/${encodeURIComponent(sessionId)}`, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => {
          // Best effort; idle sessions are also reaped by the agent after 15 minutes.
        });
      }
    }
  }, []);

  const startSession = useCallback(async () => {
    if (sessionIdRef.current || startingRef.current) return;
    const container = containerRef.current;
    if (!container) {
      setStartError("The terminal is not ready yet - try again in a moment.");
      return;
    }

    startingRef.current = true;
    setStartError(null);
    setStreamNotice(null);
    setPhase("starting");

    let term: XTerm | null = null;
    try {
      term = new XTerm({
        cursorBlink: true,
        convertEol: true, // Prevents staircase output on raw \n
        cursorStyle: "block",
        cursorWidth: 2,
        fontFamily:
          "'JetBrains Mono', 'Geist Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Monaco, Consolas, monospace",
        fontSize: 13.5,
        lineHeight: 1.25,
        letterSpacing: 0,
        scrollback: 10000,
        theme: {
          background: "#080c14",
          foreground: "#f1f5f9",
          cursor: "#74b8cc",
          cursorAccent: "#080c14",
          selectionBackground: "rgba(116, 184, 204, 0.28)",
          black: "#1e293b",
          red: "#f87171",
          green: "#4ade80",
          yellow: "#fbbf24",
          blue: "#60a5fa",
          magenta: "#d2adac",
          cyan: "#74b8cc",
          white: "#f8fafc",
          brightBlack: "#475569",
          brightRed: "#fca5a5",
          brightGreen: "#86efac",
          brightYellow: "#fde68a",
          brightBlue: "#93c5fd",
          brightMagenta: "#faaa93",
          brightCyan: "#a5f3fc",
          brightWhite: "#ffffff",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(container);
      try {
        fit.fit();
        setDimensions({ cols: term.cols, rows: term.rows });
      } catch {
        // Ignore: xterm falls back to its default geometry.
      }

      // Open the session with fitted geometry so the initial prompt matches.
      const created = await apiPost<TermSession>("/api/term/sessions", {
        cols: clampDimension(term.cols, 80),
        rows: clampDimension(term.rows, 24),
      });

      if (disposedRef.current) {
        void fetch(`/api/term/sessions/${encodeURIComponent(created.id)}`, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => {});
        term.dispose();
        return;
      }

      sessionIdRef.current = created.id;
      termRef.current = term;
      fitRef.current = fit;
      lastSizeRef.current = { cols: term.cols, rows: term.rows };
      setPhase("running");
      setStatus((prev) => (prev ? { ...prev, sessions: prev.sessions + 1 } : prev));

      if (initialCmdRef.current && !executedCmdRef.current) {
        executedCmdRef.current = true;
        const cmdToSend = initialCmdRef.current;
        window.setTimeout(() => {
          const sid = sessionIdRef.current;
          if (sid) {
            void fetch(`/api/term/sessions/${encodeURIComponent(sid)}/input`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data: encodeBase64(cmdToSend + "\n") }),
            }).catch(() => {});
          }
        }, 350);
      }

      inputSubscriptionRef.current = term.onData((data) => {
        const sessionId = sessionIdRef.current;
        if (!sessionId || data.length === 0) return;
        void fetch(`/api/term/sessions/${encodeURIComponent(sessionId)}/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: encodeBase64(data) }),
        }).catch(() => {
          // Dropped input is ignored.
        });
      });

      const stream = new EventSource(`/api/term/sessions/${encodeURIComponent(created.id)}/stream`);
      streamRef.current = stream;
      stream.addEventListener("out", (event) => {
        const payload = (event as MessageEvent<string>).data;
        if (!payload) return;
        try {
          term?.write(decodeBase64(payload));
        } catch {
          // Malformed chunk; keep the stream alive.
        }
      });
      stream.addEventListener("exit", () => {
        if (sessionIdRef.current === created.id) {
          sessionIdRef.current = null;
          setStatus((prev) => (prev ? { ...prev, sessions: Math.max(0, prev.sessions - 1) } : prev));
        }
        inputSubscriptionRef.current?.dispose();
        inputSubscriptionRef.current = null;
        term?.write("\r\n\x1b[38;2;116;184;204m[session ended]\x1b[0m\r\n");
        setStreamNotice(null);
        setPhase("ended");
        stream.close();
        if (streamRef.current === stream) streamRef.current = null;
      });
      stream.onopen = () => setStreamNotice(null);
      stream.onerror = () => {
        if (sessionIdRef.current === created.id) {
          setStreamNotice("The output stream was interrupted. Reconnecting…");
        }
      };

      const fitAndNotify = () => {
        const activeTerm = termRef.current;
        if (!activeTerm) return;
        try {
          fit.fit();
          setDimensions({ cols: activeTerm.cols, rows: activeTerm.rows });
        } catch {
          return;
        }
        const activeId = sessionIdRef.current;
        if (!activeId) return;
        const next = { cols: activeTerm.cols, rows: activeTerm.rows };
        const previous = lastSizeRef.current;
        if (previous && previous.cols === next.cols && previous.rows === next.rows) return;
        lastSizeRef.current = next;
        if (resizeTimerRef.current !== null) window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = window.setTimeout(() => {
          resizeTimerRef.current = null;
          const currentId = sessionIdRef.current;
          if (!currentId) return;
          void fetch(`/api/term/sessions/${encodeURIComponent(currentId)}/resize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
          }).catch(() => {
            // Next resize retries with fresh dimensions.
          });
        }, RESIZE_DEBOUNCE_MS);
      };

      const observer = new ResizeObserver(fitAndNotify);
      observer.observe(container);
      resizeObserverRef.current = observer;
      windowResizeHandlerRef.current = fitAndNotify;
      window.addEventListener("resize", fitAndNotify);

      term.focus();
    } catch (err) {
      if (sessionIdRef.current) {
        stopSession(true);
      } else {
        term?.dispose();
        termRef.current = null;
        fitRef.current = null;
        setPhase("idle");
      }
      setStartError(err instanceof Error ? err.message : "Failed to start the terminal session");
    } finally {
      startingRef.current = false;
    }
  }, [stopSession]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      stopSession(true);
    };
  }, [stopSession]);

  // Automatically start the terminal session when status is loaded and enabled
  useEffect(() => {
    if (state === "ready" && status?.enabled && !autoStartedRef.current && phase === "idle") {
      autoStartedRef.current = true;
      const timer = window.setTimeout(() => {
        void startSession();
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [state, status?.enabled, phase, startSession]);

  const handleClear = useCallback(() => {
    if (termRef.current) {
      termRef.current.clear();
    }
    const sid = sessionIdRef.current;
    if (sid) {
      void fetch(`/api/term/sessions/${encodeURIComponent(sid)}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: encodeBase64("\x0c") }), // Ctrl+L
      }).catch(() => {});
    }
  }, []);

  const handleCopy = useCallback(() => {
    if (!termRef.current) return;
    const selection = termRef.current.getSelection();
    if (selection) {
      void navigator.clipboard.writeText(selection);
    } else {
      const buffer = termRef.current.buffer.active;
      let text = "";
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) text += line.translateToString(true) + "\n";
      }
      void navigator.clipboard.writeText(text.trimEnd());
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, []);

  const sendCommand = useCallback((cmd: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    void fetch(`/api/term/sessions/${encodeURIComponent(sid)}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: encodeBase64(cmd + "\n") }),
    }).catch(() => {});
    termRef.current?.focus();
  }, []);

  function startNewSession() {
    stopSession(false);
    void startSession();
  }

  const terminalEnabled = status?.enabled === true;
  const overlayVisible = phase === "idle" || phase === "starting";

  return (
    <>
      {state === "error" ? (
        <Alert variant="error" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage ?? "Cannot reach the CloudDeck agent"}</span>
            <Button variant="secondary" size="sm" onClick={() => void loadStatus()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {state === "loading" ? (
        <Card className="overflow-hidden border-border/60 shadow-lg">
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="mt-1 h-4 w-72" />
              <div className="mt-2.5 flex gap-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-28 rounded-full" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-28 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <Skeleton className="h-[74vh] min-h-[460px] w-full rounded-lg" />
          </div>
        </Card>
      ) : null}

      {state === "ready" && status ? (
        <div ref={shellRef} className={cn("w-full transition-all duration-200", fullPage && "flex h-screen flex-col bg-background")}>
          <div
            className={cn(
              "flex flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-[#080c14] shadow-2xl transition-all",
              fullPage && "h-screen rounded-none border-0 shadow-none",
            )}
          >
            {/* macOS & Developer Terminal Title Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950/70 px-4 py-3 backdrop-blur-md">
              <div className="flex items-center gap-3">
                {/* Traffic Light Window Controls */}
                <div className="flex items-center gap-1.5" aria-label="Terminal window controls">
                  <button
                    type="button"
                    onClick={() => stopSession(true)}
                    title={phase === "running" ? "End session (Ctrl+D)" : "Terminal offline"}
                    className={cn(
                      "h-3 w-3 rounded-full transition-transform hover:scale-110 active:scale-95",
                      phase === "running" ? "bg-rose-500/90 hover:bg-rose-600" : "bg-zinc-700",
                    )}
                  />
                  <button
                    type="button"
                    onClick={handleClear}
                    title="Clear screen buffer (Ctrl+L)"
                    className="h-3 w-3 rounded-full bg-amber-500/90 transition-transform hover:scale-110 active:scale-95 hover:bg-amber-600"
                  />
                  <button
                    type="button"
                    onClick={() => void toggleFullPage()}
                    title="Toggle fullscreen mode"
                    className="h-3 w-3 rounded-full bg-emerald-500/90 transition-transform hover:scale-110 active:scale-95 hover:bg-emerald-600"
                  />
                </div>

                <div className="h-4 w-px bg-zinc-800" />

                {/* Session Identification & Telemetry */}
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-300">
                    <TerminalIcon size={14} className="text-[#74b8cc]" aria-hidden="true" />
                    <span className="font-semibold">{status.user || "root"}</span>
                    <span className="text-zinc-600">@</span>
                    <span className="text-[#faaa93]">clouddeck</span>
                  </div>

                  <span className="text-zinc-700">•</span>

                  <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-400">
                    {status.shell || "/bin/bash"}
                  </span>

                  <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-400">
                    {dimensions.cols} × {dimensions.rows}
                  </span>

                  {/* Pulsing Status Beacon */}
                  <div className="flex items-center gap-1.5 pl-1">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        phase === "running"
                          ? "bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.6)] animate-pulse"
                          : phase === "starting"
                          ? "bg-amber-400 animate-pulse"
                          : "bg-zinc-600",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider",
                        phase === "running"
                          ? "text-emerald-400"
                          : phase === "starting"
                          ? "text-amber-400"
                          : "text-zinc-500",
                      )}
                    >
                      {phase === "running" ? "Connected" : phase === "starting" ? "Starting" : "Ended"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  title="Clear buffer (Ctrl+L)"
                  className="h-7 px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <Trash2 size={13} aria-hidden="true" />
                  <span className="hidden sm:inline">Clear</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  title="Copy terminal contents"
                  className="h-7 px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  {copied ? (
                    <>
                      <Check size={13} className="text-emerald-400" aria-hidden="true" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} aria-hidden="true" />
                      <span className="hidden sm:inline">Copy</span>
                    </>
                  )}
                </Button>

                {phase === "running" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startNewSession()}
                    title="Restart shell"
                    className="h-7 px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    <RotateCw size={13} aria-hidden="true" />
                    <span className="hidden sm:inline">Restart</span>
                  </Button>
                ) : null}

                {phase === "running" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => stopSession(true)}
                    className="h-7 px-2 text-xs text-rose-400 hover:bg-rose-950/40 hover:text-rose-300"
                  >
                    <Square size={13} aria-hidden="true" />
                    <span>Disconnect</span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => (phase === "ended" ? startNewSession() : void startSession())}
                    loading={phase === "starting"}
                    disabled={!terminalEnabled}
                    className="h-7 bg-[#74b8cc] text-zinc-950 hover:bg-[#60a5fa]"
                  >
                    {phase === "starting" ? null : <Play size={13} aria-hidden="true" />}
                    <span>{phase === "starting" ? "Starting…" : "Start Session"}</span>
                  </Button>
                )}

                {fullPageAvailable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void toggleFullPage()}
                    aria-pressed={fullPage}
                    title={fullPage ? "Exit Fullscreen" : "Fullscreen"}
                    className="h-7 px-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    {fullPage ? (
                      <Minimize2 size={13} aria-hidden="true" />
                    ) : (
                      <Maximize2 size={13} aria-hidden="true" />
                    )}
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Quick Command Launcher Bar */}
            {phase === "running" ? (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-900/80 bg-zinc-950/40 px-4 py-1.5">
                <span className="flex items-center gap-1 font-mono text-[11px] text-zinc-500">
                  <Sparkles size={11} className="text-[#faaa93]" />
                  <span>Quick:</span>
                </span>
                {QUICK_COMMANDS.map((qc) => (
                  <button
                    key={qc.cmd}
                    type="button"
                    onClick={() => sendCommand(qc.cmd)}
                    className="rounded border border-zinc-800/80 bg-zinc-900/70 px-2 py-0.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-[#74b8cc]/50 hover:bg-zinc-800 hover:text-[#74b8cc] active:scale-95"
                  >
                    {qc.label}
                  </button>
                ))}
              </div>
            ) : null}

            {/* Terminal Viewport */}
            <div className={cn("relative flex-1 bg-[#080c14]", fullPage && "flex min-h-0 flex-col")}>
              {!terminalEnabled ? (
                <div className="p-4 sm:p-6">
                  <Alert variant="warning">
                    <p className="font-medium">The web terminal is disabled.</p>
                    <p className="mt-1">
                      The agent is running in dry-run mode, so it refuses to spawn shells (
                      <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs text-foreground">
                        term_disabled
                      </code>
                      ). Restart the agent without dry-run to enable it.
                    </p>
                  </Alert>
                </div>
              ) : (
                <>
                  {startError ? (
                    <div className="p-3 pb-0">
                      <Alert variant="error">{startError}</Alert>
                    </div>
                  ) : null}
                  {streamNotice ? (
                    <div className="p-3 pb-0">
                      <Alert variant="warning">{streamNotice}</Alert>
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "relative w-full p-3 sm:p-4",
                      fullPage && "flex min-h-0 flex-1 flex-col",
                    )}
                  >
                    <div
                      ref={containerRef}
                      className={cn(
                        "w-full overflow-hidden font-mono",
                        fullPage ? "h-full min-h-0 flex-1" : "h-[74vh] min-h-[460px]",
                      )}
                    />

                    {overlayVisible ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#080c14]/95 px-6 text-center backdrop-blur-sm">
                        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/80 text-[#74b8cc] shadow-xl">
                          <TerminalIcon size={26} aria-hidden="true" />
                        </span>
                        <div>
                          <p className="text-base font-semibold text-zinc-100">Open Shell on CloudDeck</p>
                          <p className="mt-1 max-w-sm text-xs text-zinc-400">
                            Session launches as <span className="font-mono text-zinc-200">{status.user || "root"}</span> with{" "}
                            <span className="font-mono text-zinc-200">{status.shell || "/bin/bash"}</span> in{" "}
                            <span className="font-mono text-zinc-200">/www/wwwroot</span>.
                          </p>
                        </div>
                        <Button
                          onClick={() => void startSession()}
                          loading={phase === "starting"}
                          size="md"
                          className="bg-[#74b8cc] text-zinc-950 hover:bg-[#60a5fa]"
                        >
                          {phase === "starting" ? null : <Play size={14} aria-hidden="true" />}
                          <span>{phase === "starting" ? "Starting shell…" : "Launch Shell"}</span>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function TerminalPage() {
  return (
    <Suspense
      fallback={
        <Card className="overflow-hidden border-border/60 shadow-lg">
          <div className="p-5">
            <Skeleton className="h-[74vh] min-h-[460px] w-full rounded-lg" />
          </div>
        </Card>
      }
    >
      <TerminalContent />
    </Suspense>
  );
}
