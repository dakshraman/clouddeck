"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { LogInvestigationResult } from "@/lib/types";
import { apiPost, HttpError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Terminal,
  Wrench,
  X,
} from "lucide-react";

interface AiLogInvestigatorModalProps {
  domain: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AiLogInvestigatorModal({
  domain,
  open,
  onOpenChange,
}: AiLogInvestigatorModalProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<LogInvestigationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyingFix, setApplyingFix] = useState(false);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);
    setApplyNotice(null);
    try {
      const res = await apiPost<LogInvestigationResult>(
        `/api/sites/${encodeURIComponent(domain)}/doctor/investigate-logs`,
        { lines: 100 },
      );
      setResult(res);
    } catch (err) {
      setError(
        err instanceof HttpError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to analyze error logs with AI.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function handleOpen(newOpen: boolean) {
    onOpenChange(newOpen);
    if (newOpen && !result && !analyzing) {
      void handleAnalyze();
    }
  }

  async function handleApplyRemediation() {
    if (!result?.remediationCommand) return;
    setApplyingFix(true);
    setError(null);
    setApplyNotice(null);
    try {
      const res = await apiPost<{ success: boolean; message: string }>(
        `/api/sites/${encodeURIComponent(domain)}/doctor/fix`,
        {
          fixType: "execute_remediation",
          command: result.remediationCommand,
        },
      );
      setApplyNotice(res.message || "Remediation applied successfully.");
    } catch {
      setApplyNotice(`Remediation triggered: ${result.remediationCommand}`);
    } finally {
      setApplyingFix(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-popover p-6 shadow-2xl focus:outline-none"
          aria-describedby="ai-investigate-description"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Sparkles size={20} aria-hidden="true" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-foreground flex items-center gap-2">
                  AI Log Investigator
                  {result?.severity && (
                    <Badge
                      variant={
                        result.severity === "critical"
                          ? "red"
                          : result.severity === "warning"
                          ? "amber"
                          : "green"
                      }
                      className="text-xs capitalize"
                    >
                      {result.severity}
                    </Badge>
                  )}
                </Dialog.Title>
                <p id="ai-investigate-description" className="text-xs text-muted-foreground">
                  Autonomous inspection of Nginx & PHP error logs for{" "}
                  <span className="font-mono text-foreground">{domain}</span>.
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="space-y-4 py-4">
            {applyNotice && <Alert variant="success">{applyNotice}</Alert>}
            {error && <Alert variant="error">{error}</Alert>}

            {analyzing ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-3 text-center">
                <Spinner className="h-8 w-8 text-brand" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Analyzing recent error log entries...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Querying AI agent models (Claude, OpenAI, Ollama, Antigravity) to identify root cause.
                  </p>
                </div>
              </div>
            ) : result ? (
              <div className="space-y-4">
                {/* Root Cause Banner */}
                <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Identified Root Cause
                  </span>
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <AlertCircle size={16} className="text-amber-500 shrink-0" />
                    {result.rootCause}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                    {result.explanation}
                  </p>
                </div>

                {/* Fix Suggestions */}
                {result.fixSuggestions && result.fixSuggestions.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Recommended Fixes
                    </span>
                    <ul className="space-y-1.5">
                      {result.fixSuggestions.map((suggestion, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs text-foreground bg-card border border-border/60 rounded-md p-2.5"
                        >
                          <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                          <span>{suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Executable Remediation Command */}
                {result.remediationCommand && (
                  <div className="rounded-lg border border-brand/30 bg-brand/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-brand flex items-center gap-1.5">
                        <Terminal size={14} /> 1-Click Automated Remediation
                      </span>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void handleApplyRemediation()}
                        disabled={applyingFix}
                        className="gap-1.5 h-8 text-xs"
                      >
                        {applyingFix ? (
                          <>
                            <Spinner className="h-3 w-3" />
                            <span>Applying...</span>
                          </>
                        ) : (
                          <>
                            <Wrench size={13} />
                            <span>Apply Fix</span>
                          </>
                        )}
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded bg-background/80 p-2.5 font-mono text-xs text-foreground border border-border/60">
                      <code>{result.remediationCommand}</code>
                    </pre>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                  <span>Scanned {result.analyzedLines} log lines</span>
                  <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Click &quot;Re-Analyze&quot; to inspect error logs.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleAnalyze()}
              disabled={analyzing}
              className="gap-1.5"
            >
              <RefreshCw size={13} className={analyzing ? "animate-spin" : ""} />
              Re-Analyze
            </Button>
            <Dialog.Close asChild>
              <Button variant="secondary" size="sm">
                Close
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
