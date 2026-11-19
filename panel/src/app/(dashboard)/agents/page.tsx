"use client";

import { useCallback, useEffect, useState } from "react";
import type { AIAgentInfo, AIAgentsResponse, Task } from "@/lib/types";
import { apiFetch, apiPost, waitForTask } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/page-header";
import { AgentCard } from "@/components/agents/agent-card";
import { ApiKeyVaultCard } from "@/components/agents/api-key-vault-card";
import { RefreshCw } from "lucide-react";

interface DefaultAgentPreset {
  id: string;
  name: string;
  command: string;
  description: string;
  capabilities: string[];
}

const DEFAULT_AGENTS: DefaultAgentPreset[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    command: "claude",
    description: "Anthropic's autonomous coding agent running directly in the terminal.",
    capabilities: ["Autonomous coding", "Terminal integration", "Git operations", "Subagent orchestration"],
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    command: "codex",
    description: "OpenAI's AI coding assistant and CLI code generation agent.",
    capabilities: ["Code synthesis", "Shell execution", "Refactoring", "Test generation"],
  },
  {
    id: "antigravity",
    name: "Google Antigravity",
    command: "agy",
    description: "Google DeepMind's agentic AI coding and workflow orchestration assistant.",
    capabilities: ["Swarm coordination", "Multi-agent workflows", "Full-stack auditing", "Tool execution"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    command: "opencode",
    description: "Open-source autonomous terminal-based AI programmer.",
    capabilities: ["Local & remote LLMs", "Terminal workspace", "Multi-file edits", "Git integration"],
  },
  {
    id: "aider",
    name: "Aider AI Pair Programmer",
    command: "aider",
    description: "Terminal AI coding assistant that pairs with you in your git repository with automated commits.",
    capabilities: ["Git repo map comprehension", "Auto-commits with messages", "Multi-file edits", "Architect mode"],
  },
  {
    id: "ollama",
    name: "Ollama Local LLMs",
    command: "ollama",
    description: "Run local open-weight AI coding models (DeepSeek-Coder, Qwen 2.5-Coder) directly with zero API costs.",
    capabilities: ["Local open-weight models", "DeepSeek-Coder & Qwen 2.5", "100% private & offline", "REST API on port 11434"],
  },
  {
    id: "goose",
    name: "Goose Developer Agent",
    command: "goose",
    description: "Block's open-source autonomous developer agent for terminal operations, bash execution, and code generation.",
    capabilities: ["Autonomous file editing", "Direct shell tool execution", "Custom extensions / plugins", "Extensible LLM backends"],
  },
  {
    id: "hermes",
    name: "Hermes Agent",
    command: "hermes",
    description: "Nous Research's open-source autonomous agent with persistent memory, dynamic skill creation, and multi-modal tool use.",
    capabilities: ["Autonomous tool use", "Dynamic skill creation", "TUI & interactive chat", "Multi-platform gateways", "Persistent memory"],
  },
];

export default function AgentsPage() {
  const [agents, setAgents] = useState<AIAgentInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAgent, setBusyAgent] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<AIAgentsResponse>("/api/agents");
      setAgents(res.agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI agents from server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInstall = async (agentId: string, name: string) => {
    if (busyAgent) return;
    setBusyAgent(agentId);
    setBusyAction(`Installing ${name}...`);
    setNotice(null);
    setActionError(null);

    try {
      const res = await apiPost<{ task?: Task; success?: boolean }>("/api/agents/install", {
        agent: agentId,
      });

      if (res?.task?.id) {
        setBusyAction(`Running installation task (${res.task.id})...`);
        const finalTask = await waitForTask(res.task.id);
        if (finalTask.status === "succeeded") {
          setNotice(`${name} installed successfully!`);
          await load();
        } else {
          setActionError(finalTask.error || `Failed to install ${name}.`);
        }
      } else {
        setNotice(`${name} installation triggered.`);
        await load();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to install ${name}.`);
    } finally {
      setBusyAgent(null);
      setBusyAction(null);
    }
  };

  const handleUninstall = async (agentId: string, name: string) => {
    if (busyAgent) return;
    setConfirmUninstall(null);
    setBusyAgent(agentId);
    setBusyAction(`Uninstalling ${name}...`);
    setNotice(null);
    setActionError(null);

    try {
      const res = await apiPost<{ task?: Task; success?: boolean }>("/api/agents/uninstall", {
        agent: agentId,
      });
      if (res?.task?.id) {
        setBusyAction(`Running uninstall task (${res.task.id})...`);
        const finalTask = await waitForTask(res.task.id);
        if (finalTask.status === "succeeded") {
          setNotice(`${name} uninstalled successfully.`);
          await load();
        } else {
          setActionError(finalTask.error || `Failed to uninstall ${name}.`);
        }
      } else {
        setNotice(`${name} uninstalled successfully.`);
        await load();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to uninstall ${name}.`);
    } finally {
      setBusyAgent(null);
      setBusyAction(null);
    }
  };

  // Merge presets with server response
  const displayedAgents: AIAgentInfo[] = DEFAULT_AGENTS.map((preset) => {
    const serverAgent = agents?.find(
      (a) => a.id === preset.id || a.command === preset.command,
    );
    if (serverAgent) {
      return {
        ...preset,
        installed: serverAgent.installed,
        version: serverAgent.version,
        path: serverAgent.path,
        command: serverAgent.command || preset.command,
        capabilities: serverAgent.capabilities?.length ? serverAgent.capabilities : preset.capabilities,
      };
    }
    return {
      ...preset,
      installed: false,
    };
  });

  return (
    <>
      <PageHeader
        title="AI Agents & LLM Tools"
        description="Autonomous coding agents, AI pair programmers, and local open-weight LLMs installed directly on this server."
        actions={
          <Button variant="secondary" size="md" onClick={() => void load()} disabled={loading || busyAgent !== null}>
            <RefreshCw size={16} className={loading ? "animate-spin" : undefined} aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {notice ? (
        <Alert variant="success" className="mb-4">
          {notice}
        </Alert>
      ) : null}
      {actionError ? (
        <Alert variant="error" className="mb-4">
          {actionError}
        </Alert>
      ) : null}
      {busyAction ? (
        <Alert variant="info" className="mb-4 flex items-center gap-2">
          <Spinner size={16} />
          <span>{busyAction}</span>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="error" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {/* Secret API Key Vault */}
      <ApiKeyVaultCard />

      {/* Agents Grid Header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Installed & Available Coding Agents</h2>
        <span className="text-xs text-muted-foreground">{displayedAgents.length} curated agents</span>
      </div>

      {loading && !agents ? (
        <div className="grid gap-5 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {displayedAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              busyAgent={busyAgent}
              confirmUninstall={confirmUninstall}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onSetConfirmUninstall={setConfirmUninstall}
            />
          ))}
        </div>
      )}
    </>
  );
}
