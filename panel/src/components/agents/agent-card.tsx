"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AIAgentInfo, OllamaModel, OllamaModelsResponse, Task } from "@/lib/types";
import { apiFetch, apiPost, waitForTask } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Bot,
  Boxes,
  Brain,
  CheckCircle2,
  Code2,
  Cpu,
  Download,
  Flame,
  HardDrive,
  Layers,
  Sparkles,
  SquareTerminal,
  Trash2,
  Wand2,
  X,
} from "lucide-react";

interface AgentCardProps {
  agent: AIAgentInfo;
  busyAgent: string | null;
  confirmUninstall: string | null;
  onInstall: (id: string, name: string) => Promise<void>;
  onUninstall: (id: string, name: string) => Promise<void>;
  onSetConfirmUninstall: (id: string | null) => void;
}

function getAgentIcon(id: string) {
  switch (id) {
    case "claude-code":
    case "claude":
      return Sparkles;
    case "codex":
    case "openai-codex":
      return Brain;
    case "opencode":
    case "opencode-ai":
      return Code2;
    case "aider":
    case "aider-chat":
      return Wand2;
    case "ollama":
      return Cpu;
    case "goose":
      return Boxes;
    case "hermes":
    case "hermes-agent":
      return Flame;
    case "antigravity":
    case "agy":
    default:
      return Bot;
  }
}

const POPULAR_OLLAMA_MODELS = [
  "qwen2.5-coder:1.5b",
  "deepseek-coder:6.7b",
  "llama3.2:3b",
  "codellama:7b",
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function AgentCard({
  agent,
  busyAgent,
  confirmUninstall,
  onInstall,
  onUninstall,
  onSetConfirmUninstall,
}: AgentCardProps) {
  const Icon = getAgentIcon(agent.id);
  const isBusyThis = busyAgent === agent.id;
  const isAnyBusy = busyAgent !== null;

  // Ollama specific modal state
  const isOllama = agent.id === "ollama";
  const [showOllamaModal, setShowOllamaModal] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [pullModelName, setPullModelName] = useState("qwen2.5-coder:1.5b");
  const [pulling, setPulling] = useState(false);
  const [pullNotice, setPullNotice] = useState<string | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);

  const fetchOllamaModels = async () => {
    setLoadingModels(true);
    try {
      const res = await apiFetch<OllamaModelsResponse>("/api/agents/ollama/models");
      setOllamaModels(res.models || []);
    } catch {
      // ignore
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (showOllamaModal && isOllama) {
      void fetchOllamaModels();
    }
  }, [showOllamaModal, isOllama]);

  const handlePullModel = async (modelToPull?: string) => {
    const target = (modelToPull ?? pullModelName).trim();
    if (!target || pulling) return;

    setPulling(true);
    setPullNotice(`Pulling ${target} into Ollama daemon...`);
    setPullError(null);

    try {
      const res = await apiPost<{ task?: Task; model?: string }>("/api/agents/ollama/pull", {
        model: target,
      });

      if (res?.task?.id) {
        setPullNotice(`Running pull task (${res.task.id})...`);
        const finalTask = await waitForTask(res.task.id);
        if (finalTask.status === "succeeded") {
          setPullNotice(`Successfully pulled ${target}!`);
          await fetchOllamaModels();
        } else {
          setPullError(finalTask.error || `Failed to pull ${target}.`);
        }
      } else {
        setPullNotice(`Pull task triggered for ${target}.`);
        await fetchOllamaModels();
      }
    } catch (err) {
      setPullError(err instanceof Error ? err.message : `Failed to pull ${target}.`);
    } finally {
      setPulling(false);
    }
  };

  return (
    <>
      <Card className="flex flex-col justify-between">
        <div>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-muted/60 text-foreground">
                <Icon size={20} aria-hidden="true" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-semibold">{agent.name}</CardTitle>
                  {agent.installed ? (
                    <Badge variant="green" className="flex items-center gap-1 text-[11px]">
                      <CheckCircle2 size={11} aria-hidden="true" />
                      Installed
                    </Badge>
                  ) : (
                    <Badge variant="neutral" className="text-[11px]">
                      Not installed
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs">{agent.description}</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardBody className="grid gap-4 pt-0">
            {agent.installed ? (
              <div className="grid gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Version:</span>
                  <span className="font-semibold text-foreground">{agent.version || "detected"}</span>
                </div>
                {agent.path ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Path:</span>
                    <span className="truncate text-muted-foreground max-w-[200px]" title={agent.path}>
                      {agent.path}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Command:</span>
                  <code className="rounded bg-background px-1.5 py-0.5 text-foreground">
                    {agent.command}
                  </code>
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Capabilities
              </p>
              <div className="flex flex-wrap gap-1.5">
                {agent.capabilities?.map((cap) => (
                  <span
                    key={cap}
                    className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </CardBody>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3.5">
          {agent.installed ? (
            <>
              <div className="flex items-center gap-2">
                <Link
                  href={`/terminal?exec=${encodeURIComponent(agent.command)}`}
                  className={buttonClass("primary", "sm")}
                  title={`Launch ${agent.name} interactive session in Terminal`}
                >
                  <SquareTerminal size={14} aria-hidden="true" />
                  Open in Terminal
                </Link>

                {isOllama ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowOllamaModal(true)}
                    title="Manage and pull local Ollama models"
                  >
                    <Layers size={13} aria-hidden="true" />
                    Models
                  </Button>
                ) : null}
              </div>

              {confirmUninstall === agent.id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Confirm?</span>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={isBusyThis}
                    disabled={isAnyBusy && !isBusyThis}
                    onClick={() => void onUninstall(agent.id, agent.name)}
                  >
                    Uninstall
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onSetConfirmUninstall(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-red-400"
                  disabled={isAnyBusy}
                  onClick={() => onSetConfirmUninstall(agent.id)}
                >
                  <Trash2 size={13} aria-hidden="true" />
                  Uninstall
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                variant="primary"
                size="sm"
                loading={isBusyThis}
                disabled={isAnyBusy}
                onClick={() => void onInstall(agent.id, agent.name)}
              >
                <Download size={13} aria-hidden="true" />
                Install {agent.name}
              </Button>
              <span className="text-xs text-muted-foreground">
                1-click global install
              </span>
            </>
          )}
        </div>
      </Card>

      {/* Ollama Model Pull Modal */}
      {showOllamaModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Cpu size={18} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Ollama Model Manager</h3>
                  <p className="text-[11px] text-muted-foreground">Download and inspect local open-weight coding models</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowOllamaModal(false)}
              >
                <X size={16} />
              </Button>
            </div>

            {pullNotice ? (
              <Alert variant="info" className="mb-3">
                {pullNotice}
              </Alert>
            ) : null}
            {pullError ? (
              <Alert variant="error" className="mb-3">
                {pullError}
              </Alert>
            ) : null}

            {/* Pull Model Form */}
            <div className="mb-4 rounded-lg border border-border/80 bg-muted/20 p-3.5">
              <label htmlFor="model-input" className="mb-1 block text-xs font-semibold text-foreground">
                Pull Model by Tag
              </label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  id="model-input"
                  type="text"
                  value={pullModelName}
                  onChange={(e) => setPullModelName(e.target.value)}
                  placeholder="e.g. qwen2.5-coder:1.5b"
                  disabled={pulling}
                  className="h-8.5 flex-1 rounded-md border border-input bg-background px-3 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button
                  variant="primary"
                  size="sm"
                  loading={pulling}
                  disabled={!pullModelName.trim() || pulling}
                  onClick={() => void handlePullModel()}
                >
                  <Download size={13} aria-hidden="true" />
                  Pull
                </Button>
              </div>

              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Recommended coding models:</p>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_OLLAMA_MODELS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={pulling}
                      onClick={() => {
                        setPullModelName(m);
                        void handlePullModel(m);
                      }}
                      className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] text-foreground hover:bg-primary/20 transition-colors"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Installed Models List */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <HardDrive size={13} className="text-muted-foreground" />
                  Installed Models ({ollamaModels.length})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  disabled={loadingModels || pulling}
                  onClick={() => void fetchOllamaModels()}
                >
                  Refresh
                </Button>
              </div>

              {loadingModels ? (
                <div className="flex items-center justify-center p-6 text-xs text-muted-foreground gap-2">
                  <Spinner size={14} />
                  <span>Loading Ollama models...</span>
                </div>
              ) : ollamaModels.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                  No local models installed yet. Pull one of the recommended models above to get started.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {ollamaModels.map((mod) => (
                    <div
                      key={mod.name}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs"
                    >
                      <span className="font-mono font-medium text-foreground">{mod.name}</span>
                      <span className="text-muted-foreground text-[11px] font-mono">
                        {formatBytes(mod.size)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
