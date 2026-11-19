"use client";

import { useEffect, useState } from "react";
import type { CronExecutionRecord } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { shortDateTime } from "@/components/format";
import { X, History, RefreshCw, Terminal } from "lucide-react";

interface CronHistoryModalProps {
  jobId?: string; // Optional: filter by job
  jobTitle?: string;
  open: boolean;
  onClose: () => void;
}

export function CronHistoryModal({ jobId, jobTitle, open, onClose }: CronHistoryModalProps) {
  const [history, setHistory] = useState<CronExecutionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<CronExecutionRecord | null>(null);

  async function loadHistory() {
    setLoading(true);
    setError(null);
    try {
      const url = jobId ? `/api/cron/history?job_id=${encodeURIComponent(jobId)}` : "/api/cron/history";
      const res = await apiFetch<{ history: CronExecutionRecord[] }>(url);
      setHistory(res.history || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load execution history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void loadHistory();
      setSelectedRecord(null);
    }
  }, [open, jobId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <History size={20} className="text-primary" />
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {jobTitle ? `Execution History: ${jobTitle}` : "Scheduled Tasks Execution History"}
              </h3>
              <p className="text-xs text-muted-foreground">Recent runs recorded by CloudDeck</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadHistory} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground cursor-pointer rounded-md p-1"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 shrink-0">
            <Alert variant="error">{error}</Alert>
          </div>
        ) : null}

        <div className="mt-4 flex-1 overflow-y-auto min-h-0 space-y-4">
          {loading && history.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <Spinner size={16} /> Loading execution records...
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No execution records recorded yet. Click &quot;Run Now&quot; on a task to test it.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 uppercase tracking-wide text-muted-foreground font-medium border-b border-border">
                  <tr>
                    <th className="px-3.5 py-2.5">Time</th>
                    <th className="px-3.5 py-2.5">Command</th>
                    <th className="px-3.5 py-2.5">User</th>
                    <th className="px-3.5 py-2.5">Duration</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Output</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((record) => (
                    <tr
                      key={record.id}
                      className={`hover:bg-muted/30 cursor-pointer ${selectedRecord?.id === record.id ? "bg-muted/50" : ""}`}
                      onClick={() => setSelectedRecord(record)}
                    >
                      <td className="px-3.5 py-2.5 text-muted-foreground whitespace-nowrap">
                        {shortDateTime(record.started_at)}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-foreground max-w-[14rem] truncate" title={record.command}>
                        {record.command}
                      </td>
                      <td className="px-3.5 py-2.5 text-muted-foreground">{record.user || "root"}</td>
                      <td className="px-3.5 py-2.5 font-mono text-muted-foreground">{record.duration_ms}ms</td>
                      <td className="px-3.5 py-2.5">
                        <Badge variant={record.success ? "green" : "red"}>
                          {record.success ? "Exit 0" : `Exit ${record.exit_code}`}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecord(record);
                          }}
                        >
                          <Terminal size={12} className="mr-1" />
                          View Log
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Selected Record Detail Viewer */}
          {selectedRecord ? (
            <div className="rounded-lg border border-border bg-card p-4 space-y-2 animate-in fade-in-0 duration-150">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Log Details ({shortDateTime(selectedRecord.started_at)})</span>
                <Badge variant={selectedRecord.success ? "green" : "red"}>
                  {selectedRecord.success ? "Success" : `Failed (Exit ${selectedRecord.exit_code})`}
                </Badge>
              </div>
              <div className="rounded-md border border-border bg-zinc-950 p-3 font-mono text-xs text-zinc-100 max-h-48 overflow-y-auto whitespace-pre-wrap select-text">
                {selectedRecord.output ? selectedRecord.output : <span className="text-zinc-500 italic">No output produced</span>}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 pt-3 border-t border-border flex justify-end shrink-0">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
