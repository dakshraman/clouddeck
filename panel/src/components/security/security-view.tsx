"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  FirewallRule,
  FirewallStatus,
  SecurityStatus,
} from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/components/ui/cn";
import {
  Ban,
  CircleCheck,
  CircleX,
  Flame,
  Shield,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

function checkIcon(status: string) {
  switch (status) {
    case "pass":
      return <CircleCheck size={16} className="text-emerald-700 dark:text-emerald-400" aria-hidden="true" />;
    case "fail":
      return <CircleX size={16} className="text-red-700 dark:text-red-400" aria-hidden="true" />;
    case "warn":
      return <TriangleAlert size={16} className="text-amber-800 dark:text-amber-400" aria-hidden="true" />;
    default:
      return <Shield size={16} className="text-muted-foreground" aria-hidden="true" />;
  }
}

function checkVariant(status: string): BadgeVariant {
  switch (status) {
    case "pass":
      return "green";
    case "fail":
      return "red";
    case "warn":
      return "amber";
    default:
      return "neutral";
  }
}

export function SecurityView() {
  const [security, setSecurity] = useState<SecurityStatus | null>(null);
  const [firewall, setFirewall] = useState<FirewallStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [secData, fwData] = await Promise.all([
        apiFetch<SecurityStatus>("/api/security"),
        apiFetch<FirewallStatus>("/api/firewall"),
      ]);
      setSecurity(secData);
      setFirewall(fwData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load security status");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFirewall(enabled: boolean) {
    setBusy("firewall");
    setActionError(null);
    try {
      const data = await apiFetch<FirewallStatus>("/api/firewall", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      setFirewall(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update the firewall");
    } finally {
      setBusy(null);
    }
  }

  async function addRule(body: { port: number; protocol: string; action: string; from?: string; comment?: string }) {
    setBusy("rule");
    setActionError(null);
    try {
      await apiPost<FirewallRule>("/api/firewall/rules", body);
      setFirewall(await apiFetch<FirewallStatus>("/api/firewall"));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add the rule");
    } finally {
      setBusy(null);
    }
  }

  async function deleteRule(rule: FirewallRule) {
    if (!window.confirm(`Delete the ${rule.action} rule for ${rule.port}/${rule.protocol}?`)) return;
    setBusy(rule.id);
    setActionError(null);
    try {
      await apiFetch(`/api/firewall/rules/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      setFirewall(await apiFetch<FirewallStatus>("/api/firewall"));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete the rule");
    } finally {
      setBusy(null);
    }
  }

  async function unban(jail: string, ip: string) {
    setBusy(`${jail}/${ip}`);
    setActionError(null);
    try {
      await apiPost("/api/security", { jail, ip });
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to unban the address");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Security" description="Firewall, brute-force protection and WAF status." />
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      </>
    );
  }

  if (security === null || firewall === null) {
    return (
      <>
        <PageHeader title="Security" description="Firewall, brute-force protection and WAF status." />
        <div className="grid gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Security"
        description="Host firewall, brute-force protection, ModSecurity and the hardening checklist."
        actions={
          <Button variant="secondary" onClick={() => void load()} loading={busy === "reload"}>
            Refresh
          </Button>
        }
      />

      {actionError ? (
        <Alert variant="error" className="mb-5">
          {actionError}
        </Alert>
      ) : null}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Hardening checklist</CardTitle>
              <CardDescription>Live posture checks for this host.</CardDescription>
            </div>
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardBody className="grid gap-3">
            {security.checks.map((check) => (
              <div
                key={check.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5">{checkIcon(check.status)}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{check.label}</p>
                    <p className="text-xs text-muted-foreground">{check.detail}</p>
                    {check.status !== "pass" && check.hint ? (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{check.hint}</p>
                    ) : null}
                  </div>
                </div>
                <Badge variant={checkVariant(check.status)}>{check.status}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Firewall</CardTitle>
              <CardDescription>
                Backend: <span className="font-mono">{firewall.backend}</span>
                {firewall.detail ? ` · ${firewall.detail}` : ""}
              </CardDescription>
            </div>
            <Flame size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardBody className="grid gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={firewall.enabled ? "green" : "amber"}>
                {firewall.enabled ? "active" : "inactive"}
              </Badge>
              <Button
                variant={firewall.enabled ? "secondary" : "primary"}
                size="sm"
                loading={busy === "firewall"}
                disabled={!firewall.available || busy !== null}
                onClick={() => void toggleFirewall(!firewall.enabled)}
              >
                {firewall.enabled ? "Disable firewall" : "Enable firewall"}
              </Button>
            </div>

            {firewall.rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No CloudDeck-managed rules yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Action</th>
                      <th className="py-2 pr-4 font-medium">Port</th>
                      <th className="py-2 pr-4 font-medium">Protocol</th>
                      <th className="py-2 pr-4 font-medium">Source</th>
                      <th className="py-2 pr-4 font-medium">Comment</th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {firewall.rules.map((rule) => (
                      <tr key={rule.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-4">
                          <Badge variant={rule.action === "allow" ? "green" : "red"}>{rule.action}</Badge>
                        </td>
                        <td className="py-2 pr-4 font-mono text-foreground/80">{rule.port}</td>
                        <td className="py-2 pr-4 font-mono text-muted-foreground">{rule.protocol}</td>
                        <td className="py-2 pr-4 font-mono text-muted-foreground">{rule.from || "any"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{rule.comment || "—"}</td>
                        <td className="py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300"
                            loading={busy === rule.id}
                            disabled={busy !== null}
                            onClick={() => void deleteRule(rule)}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <AddRuleForm disabled={!firewall.available || busy !== null} onSubmit={addRule} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Fail2ban</CardTitle>
              <CardDescription>
                {security.fail2ban.active
                  ? `${security.fail2ban.jails.length} active jail(s).`
                  : security.fail2ban.note ?? "fail2ban is not running."}
              </CardDescription>
            </div>
            <Ban size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardBody className="grid gap-4">
            {security.fail2ban.jails.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {security.fail2ban.installed
                  ? "No jails are configured yet."
                  : "Install fail2ban to ban brute-force addresses automatically."}
              </p>
            ) : (
              security.fail2ban.jails.map((jail) => (
                <div key={jail.name} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-foreground">{jail.name}</span>
                    <Badge variant={jail.banned > 0 ? "red" : "neutral"}>{jail.banned} banned</Badge>
                    <Badge>{jail.total} total</Badge>
                  </div>
                  {jail.ips.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {jail.ips.map((ip) => (
                        <button
                          key={ip}
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void unban(jail.name, ip)}
                          title="Unban this address"
                          className={cn(
                            "cursor-pointer rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground/80",
                            "transition-colors hover:border-red-500/50 hover:text-red-300 disabled:opacity-50",
                          )}
                        >
                          {ip} ×
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>ModSecurity</CardTitle>
              <CardDescription>{security.modsec.note}</CardDescription>
            </div>
            <Shield size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Engine</dt>
                <dd className="mt-1">
                  <Badge variant={security.modsec.engine === "modsecurity" ? "green" : "amber"}>
                    {security.modsec.engine}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Module</dt>
                <dd className="mt-1 font-mono text-xs text-foreground/80">
                  {security.modsec.modulePath ?? "not installed"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">OWASP Core Rule Set</dt>
                <dd className="mt-1">
                  <Badge variant={security.modsec.crsInstalled ? "green" : "amber"}>
                    {security.modsec.crsInstalled ? "installed" : "missing"}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">CRS path</dt>
                <dd className="mt-1 font-mono text-xs text-foreground/80">
                  {security.modsec.crsPath ?? "—"}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>SSH</CardTitle>
              <CardDescription>Effective sshd configuration.</CardDescription>
            </div>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Port</dt>
                <dd className="mt-1 font-mono text-foreground">{security.ssh.port}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Root login</dt>
                <dd className="mt-1 font-mono text-foreground">{security.ssh.permitRootLogin}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Password authentication</dt>
                <dd className="mt-1 font-mono text-foreground">{security.ssh.passwordAuthentication}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Public key authentication</dt>
                <dd className="mt-1 font-mono text-foreground">{security.ssh.pubkeyAuthentication}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function AddRuleForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (body: {
    port: number;
    protocol: string;
    action: string;
    from?: string;
    comment?: string;
  }) => Promise<void>;
}) {
  const [port, setPort] = useState("");
  const [protocol, setProtocol] = useState("tcp");
  const [action, setAction] = useState("allow");
  const [from, setFrom] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(port);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return;
    setSubmitting(true);
    await onSubmit({
      port: parsed,
      protocol,
      action,
      from: from.trim() || undefined,
      comment: comment.trim() || undefined,
    });
    setSubmitting(false);
    setPort("");
    setFrom("");
    setComment("");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs font-medium text-foreground/80">Add rule</p>
      <div className="grid gap-3 sm:grid-cols-5">
        <div className="grid gap-1.5">
          <Label htmlFor="fw-port">Port</Label>
          <Input
            id="fw-port"
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(event) => setPort(event.target.value)}
            placeholder="443"
            className="font-mono"
            required
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fw-proto">Protocol</Label>
          <Select
            id="fw-proto"
            value={protocol}
            onChange={(event) => setProtocol(event.target.value)}
            disabled={disabled}
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fw-action">Action</Label>
          <Select
            id="fw-action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            disabled={disabled}
          >
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fw-from">Source (optional)</Label>
          <Input
            id="fw-from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            placeholder="any"
            className="font-mono"
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fw-comment">Comment</Label>
          <Input
            id="fw-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="optional"
            disabled={disabled}
          />
        </div>
      </div>
      <div>
        <Button type="submit" size="sm" loading={submitting} disabled={disabled}>
          Add rule
        </Button>
      </div>
    </form>
  );
}
