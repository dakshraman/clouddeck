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
import { PageHeader } from "@/components/page-header";
import { Play, Square, Terminal as TerminalIcon } from "lucide-react";

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
  const [location, setLocation] = useState<{ host: string; port: string } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    setLocation({
      host: window.location.hostname || "this host",
      port: window.location.port || (window.location.protocol === "https:" ? "443" : "80"),
    });
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
          background: "#0B0F17",
          foreground: "#e2e8f0",
          cursor: "#a5b4fc",
          cursorAccent: "#0B0F17",
          selectionBackground: "#4338ca",
          black: "#0f172a",
          red: "#f87171",
          green: "#4ade80",
          yellow: "#fbbf24",
          blue: "#818cf8",
          magenta: "#e879f9",
          cyan: "#22d3ee",
          white: "#e2e8f0",
          brightBlack: "#64748b",
          brightRed: "#fca5a5",
          brightGreen: "#86efac",
          brightYellow: "#fde68a",
          brightBlue: "#a5b4fc",
          brightMagenta: "#f0abfc",
          brightCyan: "#67e8f9",
          brightWhite: "#f8fafc",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(container);
      try {
        // The container may still be mid-layout; the observer fits again later.
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
    return () => {
      disposedRef.current = true;
      stopSession(true);
    };
  }, [stopSession]);

  function startNewSession() {
    stopSession(false);
    void startSession();
  }

  const login = status ? `${status.user || "—"}@${location?.host ?? "…"}` : "";
  const terminalEnabled = status?.enabled === true;
  const overlayVisible = phase === "idle" || phase === "starting";

  return (
    <>
      <PageHeader
        title="Terminal"
        description="Interactive shell on this server, streamed from the CloudDeck agent."
      />

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
        <>
          <Skeleton className="h-40" />
          <Skeleton className="mt-6 h-[60vh] min-h-[320px]" />
        </>
      ) : null}

      {state === "ready" && status ? (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Shell session</CardTitle>
                <CardDescription>PTY-backed shell running on this host through the agent.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {phase === "starting" ? <Badge variant="amber">Starting…</Badge> : null}
                {phase === "running" ? <Badge variant="green">Connected</Badge> : null}
                {phase === "ended" ? <Badge variant="amber">Ended</Badge> : null}
                <Badge variant={terminalEnabled ? "indigo" : "amber"}>
                  {terminalEnabled ? "Enabled" : "Disabled"}
                </Badge>
                {phase === "running" ? (
                  <Button variant="secondary" size="sm" onClick={() => stopSession(true)}>
                    <Square size={13} aria-hidden="true" />
                    End session
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardBody className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Login</p>
                  <p className="mt-1 truncate font-mono text-sm text-slate-100" title={login}>
                    {login}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Agent shell user</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Shell</p>
                  <p className="mt-1 truncate font-mono text-sm text-slate-100" title={status.shell}>
                    {status.shell || "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">AGENT_TERM_SHELL</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Panel port</p>
                  <p className="mt-1 truncate font-mono text-sm text-slate-100">{location?.port ?? "…"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    The shell is proxied through the panel; no SSH port is exposed.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Live sessions
                  </p>
                  <p className="mt-1 font-mono text-sm text-slate-100">{status.sessions}</p>
                  <p className="mt-1 text-xs text-slate-500">At most 4; 15 minutes idle timeout</p>
                </div>
              </div>

              {!terminalEnabled ? (
                <Alert variant="warning">
                  <p className="font-medium">The web terminal is disabled.</p>
                  <p className="mt-1">
                    The agent is running in dry-run mode, so it refuses to spawn shells (
                    <code className="rounded bg-slate-950/60 px-1 py-0.5 font-mono text-xs text-slate-200">
                      term_disabled
                    </code>
                    ). Restart the agent without dry-run to enable it.
                  </p>
                </Alert>
              ) : (
                <p className="text-xs text-slate-500">
                  Sessions run as{" "}
                  <code className="rounded bg-slate-950/60 px-1 py-0.5 font-mono text-xs text-slate-300">
                    {status.user || "—"}
                  </code>{" "}
                  and end when you close this page or after 15 minutes without keystrokes.
                </p>
              )}
            </CardBody>
          </Card>

          {terminalEnabled ? (
            <Card className="mt-6 overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Shell</CardTitle>
                  <CardDescription>
                    {phase === "running"
                      ? "Interactive session - type commands below."
                      : phase === "ended"
                        ? "The shell exited. Start a new session to keep going."
                        : "Start a session to open a shell inside the panel."}
                  </CardDescription>
                </div>
                {phase === "ended" ? (
                  <Button size="sm" onClick={startNewSession}>
                    <Play size={13} aria-hidden="true" />
                    Start new session
                  </Button>
                ) : null}
              </CardHeader>
              <div className="px-5 pb-5 pt-4">
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
                    The shell session ended. Its output is kept above for reference.
                  </Alert>
                ) : null}

                <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-[#0B0F17]">
                  <div ref={containerRef} className="h-[60vh] min-h-[320px] w-full" />
                  {overlayVisible ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0B0F17] px-6 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-800 bg-slate-900/60 text-indigo-400">
                        <TerminalIcon size={22} aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-200">Open a shell on this server</p>
                        <p className="mt-1 max-w-sm text-xs text-slate-500">
                          The session runs as {status.user || "—"} with {status.shell || "—"}. Closing this
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
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}
