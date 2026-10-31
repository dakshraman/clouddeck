"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { TermSession, TermStatusResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/ui/cn";
import { Maximize2, Minimize2, Play, Square, Terminal as TerminalIcon } from "lucide-react";

type LoadState = "loading" | "ready" | "error";
type Phase = "idle" | "starting" | "running" | "ended";

// docs/api.md section 1.9: the agent accepts 8-500 cols/rows.
const MIN_DIMENSION = 8;
const MAX_DIMENSION = 500;
const RESIZE_DEBOUNCE_MS = 200;

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

export default function TerminalPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<TermStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [startError, setStartError] = useState<string | null>(null);
  const [streamNotice, setStreamNotice] = useState<string | null>(null);
  const [fullPage, setFullPage] = useState(false);
  const [fullPageAvailable, setFullPageAvailable] = useState(false);

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
          fitRef.current?.fit();
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
      if (!options?.silent) {
        setState("error");
        setErrorMessage(err instanceof Error ? err.message : "Cannot reach the CloudDeck agent");
      }
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  /** Tears down the local terminal; optionally closes the agent-side session. */
  const stopSession = useCallback((deleteRemote: boolean) => {
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
        convertEol: false,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 13,
        scrollback: 5000,
        theme: {
          background: "#0a0a0a",
          foreground: "#fafafa",
          cursor: "#00b8db",
          cursorAccent: "#0a0a0a",
          selectionBackground: "#155e75",
          black: "#262626",
          red: "#f87171",
          green: "#4ade80",
          yellow: "#fbbf24",
          blue: "#60a5fa",
          magenta: "#e879f9",
          cyan: "#22d3ee",
          white: "#e5e5e5",
          brightBlack: "#737373",
          brightRed: "#fca5a5",
          brightGreen: "#86efac",
          brightYellow: "#fde68a",
          brightBlue: "#93c5fd",
          brightMagenta: "#f0abfc",
          brightCyan: "#67e8f9",
          brightWhite: "#fafafa",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(container);
      try {
        fit.fit();
      } catch {
        // Ignore: xterm falls back to its default 80x24 geometry.
      }

      // Open the session with the fitted geometry so the first prompt is correct.
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

      inputSubscriptionRef.current = term.onData((data) => {
        const sessionId = sessionIdRef.current;
        if (!sessionId || data.length === 0) return;
        void fetch(`/api/term/sessions/${encodeURIComponent(sessionId)}/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: encodeBase64(data) }),
        }).catch(() => {
          // Dropped input is not worth interrupting the session over.
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
        term?.write("\r\n[session ended]");
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
            // The next resize retries with fresh dimensions.
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
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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
            <Skeleton className="h-[72vh] min-h-[420px] w-full rounded-lg" />
          </div>
        </Card>
      ) : null}

      {state === "ready" && status ? (
        <div ref={shellRef} className={cn("w-full", fullPage && "flex h-screen flex-col bg-background")}>
          <Card
            className={cn(
              "overflow-hidden",
              fullPage && "flex min-h-0 flex-1 flex-col rounded-none border-0 shadow-none",
            )}
          >
            <CardHeader className="shrink-0 flex-col gap-3 border-b border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold sm:text-lg">Terminal</CardTitle>
                  {phase === "running" ? (
                    <Badge variant="green">Connected</Badge>
                  ) : phase === "starting" ? (
                    <Badge variant="amber">Starting…</Badge>
                  ) : phase === "ended" ? (
                    <Badge variant="amber">Ended</Badge>
                  ) : !terminalEnabled ? (
                    <Badge variant="amber">Disabled</Badge>
                  ) : null}
                </div>
                <CardDescription className="mt-0.5 text-xs text-muted-foreground">
                  Interactive shell in your sites webroot (/www/wwwroot).
                </CardDescription>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="neutral" className="font-mono text-xs">
                    <span className="text-muted-foreground mr-1">User:</span>
                    <span className="font-semibold text-foreground">{status.user || "clouddeck"}</span>
                  </Badge>
                  <Badge variant="neutral" className="font-mono text-xs">
                    <span className="text-muted-foreground mr-1">Shell:</span>
                    <span className="font-semibold text-foreground">{status.shell || "/bin/bash"}</span>
                  </Badge>
                  <Badge variant="neutral" className="text-xs">
                    <span className="text-muted-foreground mr-1">Sessions:</span>
                    <span className="font-semibold text-foreground">{status.sessions}</span>
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {phase === "running" ? (
                  <Button variant="secondary" size="sm" onClick={() => stopSession(true)}>
                    <Square size={13} aria-hidden="true" />
                    End session
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => (phase === "ended" ? startNewSession() : void startSession())}
                    loading={phase === "starting"}
                    disabled={!terminalEnabled}
                  >
                    {phase === "starting" ? null : <Play size={13} aria-hidden="true" />}
                    {phase === "starting" ? "Starting…" : "Start session"}
                  </Button>
                )}
                {fullPageAvailable ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void toggleFullPage()}
                    aria-pressed={fullPage}
                  >
                    {fullPage ? (
                      <Minimize2 size={13} aria-hidden="true" />
                    ) : (
                      <Maximize2 size={13} aria-hidden="true" />
                    )}
                    {fullPage ? "Exit full page" : "Full page"}
                  </Button>
                ) : null}
              </div>
            </CardHeader>

            <CardBody className={cn("p-4 sm:p-5", fullPage && "flex min-h-0 flex-1 flex-col")}>
              {!terminalEnabled ? (
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
              ) : (
                <>
                  {startError ? (
                    <Alert variant="error" className="mb-3">
                      {startError}
                    </Alert>
                  ) : null}
                  {streamNotice ? (
                    <Alert variant="warning" className="mb-3">
                      {streamNotice}
                    </Alert>
                  ) : null}
                  {phase === "ended" ? (
                    <Alert variant="info" className="mb-3">
                      The shell session ended. Its output is kept above for reference. Click &ldquo;Start session&rdquo; to begin a new session.
                    </Alert>
                  ) : null}

                  <div
                    className={cn(
                      "relative overflow-hidden rounded-lg border border-border bg-[#0a0a0a]",
                      fullPage && "flex min-h-0 flex-1 flex-col",
                    )}
                  >
                    <div
                      ref={containerRef}
                      className={cn(
                        "w-full",
                        fullPage ? "h-full min-h-0 flex-1" : "h-[72vh] min-h-[420px]",
                      )}
                    />
                    {overlayVisible ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-6 text-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300">
                          <TerminalIcon size={22} aria-hidden="true" />
                        </span>
                        <div>
                          <p className="text-sm font-medium text-zinc-100">Open a shell on this server</p>
                          <p className="mt-1 max-w-sm text-xs text-zinc-400">
                            The session runs as {status.user || "clouddeck"} with {status.shell || "/bin/bash"}. Closing this
                            page ends it.
                          </p>
                        </div>
                        <Button
                          onClick={() => void startSession()}
                          loading={phase === "starting"}
                          size="md"
                        >
                          {phase === "starting" ? null : <Play size={14} aria-hidden="true" />}
                          {phase === "starting" ? "Starting…" : "Start session"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </>
  );
}
