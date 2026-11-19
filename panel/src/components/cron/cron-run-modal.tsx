"use client";

import type { CronRunResult } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Play, CheckCircle2, AlertCircle, Copy, Check } from "lucide-react";
import { useState } from "react";

interface CronRunModalProps {
  result: CronRunResult | null;
  open: boolean;
  onClose: () => void;
}

export function CronRunModal({ result, open, onClose }: CronRunModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open || !result) return null;

  async function copyOutput() {
    if (!result?.output) return;
    try {
      await navigator.clipboard.writeText(result.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${result.success ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
              {result.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Task Execution Result</h3>
              <p className="text-xs text-muted-foreground">Executed directly on host system</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground cursor-pointer rounded-md p-1"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground font-medium">Status:</span>
            <Badge variant={result.success ? "green" : "red"}>
              {result.success ? "Success (Exit 0)" : `Failed (Exit ${result.exit_code})`}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <div>
              Duration: <span className="font-mono text-foreground font-medium">{result.duration_ms}ms</span>
            </div>
            <div>
              Time: <span className="text-foreground">{new Date(result.ran_at).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* Command info */}
        <div className="mt-3">
          <span className="text-xs font-medium text-muted-foreground">Command:</span>
          <pre className="mt-1 rounded-md border border-border bg-background p-2.5 font-mono text-xs text-foreground overflow-x-auto">
            {result.command}
          </pre>
        </div>

        {/* Output console */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Terminal Output:</span>
            {result.output ? (
              <Button variant="ghost" size="sm" onClick={copyOutput} className="h-6 px-2 text-xs">
                {copied ? <Check size={12} className="text-emerald-500 mr-1" /> : <Copy size={12} className="mr-1" />}
                {copied ? "Copied" : "Copy output"}
              </Button>
            ) : null}
          </div>
          <div className="rounded-lg border border-border bg-zinc-950 p-3.5 font-mono text-xs text-zinc-100 max-h-80 overflow-y-auto whitespace-pre-wrap select-text">
            {result.output ? result.output : <span className="text-zinc-500 italic">No output returned (command exited cleanly with empty stdout/stderr)</span>}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
