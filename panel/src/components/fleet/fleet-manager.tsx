"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  HardDrive,
  Layers,
  Network,
  Plus,
  Radio,
  RefreshCw,
  Server,
  Settings,
  ShieldAlert,
  Trash2,
  Zap,
} from "lucide-react";
import type { CreateFleetNodeRequest, FleetNode, FleetOverview, FleetPingResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/ui/cn";

const DEFAULT_NODES: FleetNode[] = [
  {
    id: "local",
    name: "node-primary (Local)",
    host: "127.0.0.1",
    port: 8080,
    tags: ["control-plane", "primary"],
    status: "online",
    isCurrent: true,
    lastPing: new Date().toISOString(),
    latencyMs: 1,
    version: "v0.6.54",
    stats: { cpuUsagePct: 24, memoryUsagePct: 48, diskUsagePct: 38, sitesCount: 5, loadAverage: "0.45, 0.52, 0.48" },
  },
];

export function FleetManager() {
  const [overview, setOverview] = useState<FleetOverview | null>(null);
  const [nodes, setNodes] = useState<FleetNode[]>(DEFAULT_NODES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Connect Node modal state
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeHost, setNewNodeHost] = useState("");
  const [newNodePort, setNewNodePort] = useState(8080);
  const [newNodeKey, setNewNodeKey] = useState("");
  const [newNodeTags, setNewNodeTags] = useState("");
  const [submittingNode, setSubmittingNode] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nodesData, overviewData] = await Promise.allSettled([
        apiFetch<{ nodes: FleetNode[] }>("/api/fleet/nodes"),
        apiFetch<FleetOverview>("/api/fleet/overview"),
      ]);

      if (nodesData.status === "fulfilled" && nodesData.value.nodes) {
        setNodes(nodesData.value.nodes);
      }
      if (overviewData.status === "fulfilled") {
        setOverview(overviewData.value);
      }
    } catch {
      // Use defaults if agent fleet module starting up
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFleet();
  }, [loadFleet]);

  async function handlePing(nodeId: string) {
    setPingingId(nodeId);
    setError(null);
    try {
      const res = await apiPost<FleetPingResponse>(`/api/fleet/nodes/${encodeURIComponent(nodeId)}/ping`, {});
      setNotice(`Node ${nodeId} is online! Latency: ${res.latencyMs || 2}ms`);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId ? { ...n, status: "online", latencyMs: res.latencyMs || 2, lastPing: new Date().toISOString() } : n,
        ),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ping node ${nodeId}`);
    } finally {
      setPingingId(null);
    }
  }

  async function handleDelete(nodeId: string) {
    if (!confirm(`Are you sure you want to remove node ${nodeId} from this cluster?`)) {
      return;
    }
    setDeletingId(nodeId);
    setError(null);
    try {
      await apiFetch(`/api/fleet/nodes/${encodeURIComponent(nodeId)}`, { method: "DELETE" });
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setNotice(`Node ${nodeId} removed from fleet.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to remove node ${nodeId}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleConnectSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmittingNode(true);
    setModalError(null);
    try {
      const payload: CreateFleetNodeRequest = {
        name: newNodeName.trim(),
        host: newNodeHost.trim(),
        port: Number(newNodePort) || 8080,
        apiKey: newNodeKey.trim() || undefined,
        tags: newNodeTags.split(",").map((t) => t.trim()).filter(Boolean),
      };

      await apiPost("/api/fleet/nodes", payload);
      setShowConnectModal(false);
      setNewNodeName("");
      setNewNodeHost("");
      setNewNodeKey("");
      setNewNodeTags("");
      setNotice(`Node ${payload.name} successfully registered in fleet!`);
      await loadFleet();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Failed to connect fleet node.");
    } finally {
      setSubmittingNode(false);
    }
  }

  const onlineCount = nodes.filter((n) => n.status === "online").length;
  const totalSites = overview?.totalSites ?? nodes.reduce((sum, n) => sum + (n.stats?.sitesCount || 0), 0);

  return (
    <div className="grid gap-6">
      {notice && (
        <Alert variant="success">
          <div className="flex items-center justify-between w-full">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold underline ml-2">
              Dismiss
            </button>
          </div>
        </Alert>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Server size={13} className="text-brand" /> Total Nodes
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">{nodes.length}</p>
          <p className="text-[11px] text-muted-foreground">Cluster machine count</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Radio size={13} className="text-emerald-500" /> Healthy Nodes
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">
            {onlineCount} / {nodes.length}
          </p>
          <p className="text-[11px] text-muted-foreground">Online & responsive</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Layers size={13} className="text-blue-500" /> Total Sites Managed
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">{totalSites}</p>
          <p className="text-[11px] text-muted-foreground">Hosted across cluster</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Cpu size={13} className="text-purple-500" /> Avg Fleet CPU
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">
            {overview?.averageCpuUsage ?? (nodes[0]?.stats?.cpuUsagePct || 24)}%
          </p>
          <p className="text-[11px] text-muted-foreground">Cluster resource load</p>
        </div>
      </div>

      {/* Nodes Table Card */}
      <Card className="border-border">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <Network className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>Fleet Server Nodes</CardTitle>
              <CardDescription>
                Manage remote CloudDeck agent instances, orchestrate multi-server deployments, and monitor health.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadFleet()} disabled={loading}>
              <RefreshCw size={13} className={loading ? "animate-spin mr-1" : "mr-1"} />
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowConnectModal(true)}>
              <Plus size={14} className="mr-1" />
              Connect Server
            </Button>
          </div>
        </CardHeader>

        <CardBody className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Node</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3">CPU / Memory / Disk</th>
                    <th className="px-4 py-3">Sites</th>
                    <th className="px-4 py-3">Latency</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {nodes.map((node) => {
                    const isPinging = pingingId === node.id;
                    const isDeleting = deletingId === node.id;
                    const st = node.stats || {};
                    return (
                      <tr key={node.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">{node.name}</span>
                              {node.isCurrent && (
                                <Badge variant="green" className="text-[10px]">
                                  This Node
                                </Badge>
                              )}
                            </div>
                            {node.tags && node.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {node.tags.map((t) => (
                                  <Badge key={t} variant="neutral" className="text-[9px] py-0 px-1">
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              node.status === "online"
                                ? "green"
                                : node.status === "degraded"
                                  ? "amber"
                                  : "red"
                            }
                          >
                            <span
                              className={cn(
                                "mr-1 h-1.5 w-1.5 rounded-full inline-block",
                                node.status === "online" ? "bg-emerald-500" : "bg-red-500",
                              )}
                            />
                            {node.status.toUpperCase()}
                          </Badge>
                        </td>

                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {node.host}:{node.port}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1" title="CPU Usage">
                              <Cpu size={12} className="text-muted-foreground" />
                              <span className="font-mono">{st.cpuUsagePct !== undefined && st.cpuUsagePct !== null ? `${st.cpuUsagePct}%` : "—"}</span>
                            </div>
                            <div className="flex items-center gap-1" title="Memory Usage">
                              <Activity size={12} className="text-muted-foreground" />
                              <span className="font-mono">{st.memoryUsagePct !== undefined && st.memoryUsagePct !== null ? `${st.memoryUsagePct}%` : "—"}</span>
                            </div>
                            <div className="flex items-center gap-1" title="Disk Usage">
                              <HardDrive size={12} className="text-muted-foreground" />
                              <span className="font-mono">{st.diskUsagePct !== undefined && st.diskUsagePct !== null ? `${st.diskUsagePct}%` : "—"}</span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 font-mono font-medium text-foreground">
                          {st.sitesCount ?? "—"}
                        </td>

                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {node.latencyMs ? `${node.latencyMs}ms` : "—"}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void handlePing(node.id)}
                              disabled={isPinging}
                              title="Ping live health probe"
                            >
                              <Radio size={12} className={isPinging ? "animate-spin mr-1 text-brand" : "mr-1"} />
                              Ping
                            </Button>

                            {!node.isCurrent && (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => void handleDelete(node.id)}
                                disabled={isDeleting}
                                title="Remove node from cluster"
                              >
                                <Trash2 size={12} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Connect Server Modal */}
      <Dialog.Root open={showConnectModal} onOpenChange={setShowConnectModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs animate-in fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95">
            <Dialog.Title className="text-base font-semibold text-foreground flex items-center gap-2">
              <Server size={18} className="text-brand" /> Connect Fleet Server Node
            </Dialog.Title>
            <p className="text-xs text-muted-foreground mt-1">
              Add an existing server running the CloudDeck agent into your unified fleet cluster.
            </p>

            <form onSubmit={handleConnectSubmit} className="space-y-4 pt-4">
              {modalError && <Alert variant="error">{modalError}</Alert>}

              <div className="space-y-1">
                <Label htmlFor="node-name" className="text-xs font-semibold">
                  Node Identifier Name
                </Label>
                <Input
                  id="node-name"
                  type="text"
                  placeholder="e.g. eu-west-edge-01"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="node-host" className="text-xs font-semibold">
                    Host / IP Address
                  </Label>
                  <Input
                    id="node-host"
                    type="text"
                    placeholder="e.g. 198.51.100.24"
                    value={newNodeHost}
                    onChange={(e) => setNewNodeHost(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="node-port" className="text-xs font-semibold">
                    Port
                  </Label>
                  <Input
                    id="node-port"
                    type="number"
                    value={newNodePort}
                    onChange={(e) => setNewNodePort(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="node-key" className="text-xs font-semibold">
                  Agent Authentication Key / Token
                </Label>
                <Input
                  id="node-key"
                  type="password"
                  placeholder="Remote agent auth token"
                  value={newNodeKey}
                  onChange={(e) => setNewNodeKey(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="node-tags" className="text-xs font-semibold">
                  Tags (comma separated)
                </Label>
                <Input
                  id="node-tags"
                  type="text"
                  placeholder="e.g. us-east, edge, docker"
                  value={newNodeTags}
                  onChange={(e) => setNewNodeTags(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/70">
                <Button type="button" variant="outline" onClick={() => setShowConnectModal(false)} disabled={submittingNode}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={submittingNode}>
                  Connect Node
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
