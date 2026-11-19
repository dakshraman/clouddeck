"use client";

import Link from "next/link";
import type { AIAgentInfo } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bot,
  Brain,
  CheckCircle2,
  Code2,
  Download,
  Sparkles,
  SquareTerminal,
  Trash2,
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
    case "antigravity":
    case "agy":
    default:
      return Bot;
  }
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

  return (
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
                  <span className="truncate text-muted-foreground" title={agent.path}>
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
            <Link
              href={`/terminal?exec=${encodeURIComponent(agent.command)}`}
              className={buttonClass("primary", "sm")}
              title={`Launch ${agent.name} interactive session in Terminal`}
            >
              <SquareTerminal size={14} aria-hidden="true" />
              Open in Terminal
            </Link>

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
  );
}
