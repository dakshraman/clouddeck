"use client";

import { useCallback, useEffect, useState } from "react";
import type { DNSNameserversInfo } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { copyText } from "@/components/mail/copy-button";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, Edit3, Globe, Info, Network, Server, X } from "lucide-react";

export function NameserversCard() {
  const [data, setData] = useState<DNSNameserversInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Copy state per key
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [ns1, setNs1] = useState("");
  const [ns2, setNs2] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<DNSNameserversInfo>("/api/dns/nameservers");
      setData(res);
      setNs1(res.nameserver1 || "");
      setNs2(res.nameserver2 || "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load nameservers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCopy(key: string, text: string) {
    if (!text) return;
    const ok = await copyText(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }

  function openEdit() {
    if (data) {
      setNs1(data.nameserver1);
      setNs2(data.nameserver2);
    }
    setSaveError(null);
    setEditOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await apiFetch<DNSNameserversInfo>("/api/dns/nameservers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameserver1: ns1.trim(), nameserver2: ns2.trim() }),
      });
      setData(updated);
      setEditOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update nameservers");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="mb-6 p-5">
        <div className="grid gap-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    );
  }

  const ns1Val = data?.nameserver1 || "ns1.yourdomain.com";
  const ns2Val = data?.nameserver2 || "ns2.yourdomain.com";
  const serverIp = data?.serverIP || "127.0.0.1";

  return (
    <>
      <Card className="mb-6 border-border/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-brand/10 p-2 text-brand">
              <Network size={20} />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Authoritative Nameservers & Server IP</CardTitle>
              <CardDescription>
                Point your domain registrar to this server or use direct A-records for instant routing.
              </CardDescription>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={openEdit} className="gap-1.5 text-xs">
            <Edit3 size={13} />
            Edit Nameservers
          </Button>
        </CardHeader>

        <CardBody className="grid gap-5 pt-1">
          {error ? <Alert variant="error">{error}</Alert> : null}

          {/* Value Badges with 1-click Copy */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col justify-between rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Primary NS (NS1)</span>
                <Badge variant="neutral">Authoritative</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-sm font-semibold text-foreground">{ns1Val}</span>
                <button
                  type="button"
                  onClick={() => handleCopy("ns1", ns1Val)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Copy Primary NS"
                >
                  {copiedKey === "ns1" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Secondary NS (NS2)</span>
                <Badge variant="neutral">Authoritative</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-sm font-semibold text-foreground">{ns2Val}</span>
                <button
                  type="button"
                  onClick={() => handleCopy("ns2", ns2Val)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Copy Secondary NS"
                >
                  {copiedKey === "ns2" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Server IP</span>
                <Badge variant="green">Public IPv4</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-sm font-semibold text-foreground">{serverIp}</span>
                <button
                  type="button"
                  onClick={() => handleCopy("ip", serverIp)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Copy Server IP"
                >
                  {copiedKey === "ip" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Registrar Instructions */}
          <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-4 text-xs sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Globe size={14} className="text-[#74B8CC]" />
                <span>Option A: Authoritative Nameservers</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Change <strong>custom nameservers</strong> at your registrar (GoDaddy, Namecheap, Cloudflare, Porkbun) to{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground font-semibold">{ns1Val}</code> and{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground font-semibold">{ns2Val}</code>. CloudDeck will manage all DNS records and mail automatically.
              </p>
            </div>

            <div className="space-y-1.5 sm:border-l sm:border-border/50 sm:pl-4">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Server size={14} className="text-[#FAAA93]" />
                <span>Option B: Direct A-Record</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Keep your current external DNS provider and create two <strong>A Records</strong>:
                point <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground font-semibold">@</code> and{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground font-semibold">www</code> directly to{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground font-semibold">{serverIp}</code>.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Edit Nameservers Modal Dialog */}
      <Dialog.Root open={editOpen} onOpenChange={setEditOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-6 shadow-2xl focus:outline-none">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <Dialog.Title className="text-base font-semibold text-foreground">
                Configure Authoritative Nameservers
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              {saveError ? <Alert variant="error">{saveError}</Alert> : null}

              <div className="space-y-1.5">
                <Label htmlFor="ns1-input">Primary Nameserver (NS1)</Label>
                <Input
                  id="ns1-input"
                  value={ns1}
                  onChange={(e) => setNs1(e.target.value)}
                  placeholder="ns1.example.com"
                  className="font-mono text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ns2-input">Secondary Nameserver (NS2)</Label>
                <Input
                  id="ns2-input"
                  value={ns2}
                  onChange={(e) => setNs2(e.target.value)}
                  placeholder="ns2.example.com"
                  className="font-mono text-xs"
                  required
                />
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                When new DNS zones are provisioned, these nameservers will be automatically injected as authoritative SOA &amp; NS records.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button variant="secondary" type="button" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving}>
                  Save Nameservers
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
