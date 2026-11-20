"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Check,
  ChevronDown,
  Cpu,
  Layers,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Zap,
} from "lucide-react";
import type { FleetNode, FleetNodesResponse } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";

export function ServerSwitcher() {
  const [nodes, setNodes] = useState<FleetNode[]>([
    {
      id: "local",
      name: "node-primary (Local)",
      host: "127.0.0.1",
      port: 8080,
      status: "online",
      isCurrent: true,
      latencyMs: 1,
      stats: { cpuUsagePct: 18, memoryUsagePct: 42, diskUsagePct: 35, sitesCount: 4 },
    },
  ]);
  const [activeNodeId, setActiveNodeId] = useState<string>("local");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void apiFetch<FleetNodesResponse>("/api/fleet/nodes")
      .then((res) => {
        if (res.nodes && res.nodes.length > 0) {
          setNodes(res.nodes);
          if (res.currentNodeId) {
            setActiveNodeId(res.currentNodeId);
          }
        }
      })
      .catch(() => {
        // Fallback default local node
      });
  }, []);

  const currentNode = nodes.find((n) => n.id === activeNodeId) || nodes[0];

  function handleSelectNode(nodeId: string) {
    setActiveNodeId(nodeId);
    if (typeof window !== "undefined") {
      localStorage.setItem("clouddeck_active_node", nodeId);
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/40 hover:bg-muted/70 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors cursor-pointer outline-none focus:ring-1 focus:ring-brand"
          aria-label="Switch active fleet node"
        >
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                currentNode.status === "online"
                  ? "bg-emerald-500 animate-pulse"
                  : currentNode.status === "degraded"
                    ? "bg-amber-500"
                    : "bg-red-500",
              )}
            />
            <Server size={13} className="text-muted-foreground" />
            <span className="font-semibold text-foreground max-w-[120px] sm:max-w-[150px] truncate">
              {currentNode.name}
            </span>
          </div>
          <ChevronDown size={12} className="text-muted-foreground ml-0.5" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[260px] max-w-[320px] rounded-xl border border-border bg-card p-1.5 shadow-xl animate-in fade-in-80 zoom-in-95"
        >
          <div className="px-2 py-1.5 border-b border-border/60 mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cluster Fleet Nodes ({nodes.length})
            </p>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {nodes.map((node) => {
              const isSelected = node.id === activeNodeId;
              return (
                <DropdownMenu.Item
                  key={node.id}
                  onClick={() => handleSelectNode(node.id)}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer outline-none",
                    isSelected
                      ? "bg-brand/10 text-brand font-medium"
                      : "text-foreground hover:bg-muted/50",
                  )}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          node.status === "online" ? "bg-emerald-500" : "bg-red-500",
                        )}
                      />
                      <span className="truncate font-medium text-foreground">{node.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono pl-3">
                      {node.host}:{node.port}
                      {node.latencyMs ? ` • ${node.latencyMs}ms` : ""}
                    </span>
                  </div>

                  {isSelected && <Check size={14} className="text-brand shrink-0" />}
                </DropdownMenu.Item>
              );
            })}
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-border/60" />

          <DropdownMenu.Item asChild>
            <Link
              href="/servers"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Settings size={13} />
              <span>Manage Fleet Nodes...</span>
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
