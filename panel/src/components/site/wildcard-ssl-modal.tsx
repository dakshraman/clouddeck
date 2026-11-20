"use client";

import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Globe,
  KeyRound,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";
import type { DnsProviderInfo, DnsProvidersResponse, WildcardSslRequest, WildcardSslResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export interface WildcardSslModalProps {
  domain: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const DEFAULT_PROVIDERS: DnsProviderInfo[] = [
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Automated DNS-01 challenge via Cloudflare scoped API token",
    configured: false,
    requiredFields: ["api_token"],
  },
  {
    id: "powerdns",
    name: "PowerDNS (Local DNS Engine)",
    description: "Automated challenge via CloudDeck's integrated PowerDNS service",
    configured: true,
    requiredFields: ["api_key"],
  },
  {
    id: "digitalocean",
    name: "DigitalOcean DNS",
    description: "Personal access token with read/write DNS record permissions",
    configured: false,
    requiredFields: ["api_token"],
  },
  {
    id: "route53",
    name: "AWS Route53",
    description: "IAM credentials with ChangeResourceRecordSets permissions",
    configured: false,
    requiredFields: ["access_key_id", "secret_access_key"],
  },
];

export function WildcardSslModal({
  domain,
  open,
  onOpenChange,
  onSuccess,
}: WildcardSslModalProps) {
  const [providers, setProviders] = useState<DnsProviderInfo[]>(DEFAULT_PROVIDERS);
  const [selectedProvider, setSelectedProvider] = useState<string>("cloudflare");
  const [email, setEmail] = useState(`admin@${domain}`);
  const [credentials, setCredentials] = useState<Record<string, string>>({
    api_token: "",
    api_key: "",
    access_key_id: "",
    secret_access_key: "",
  });
  const [autoRenew, setAutoRenew] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WildcardSslResponse | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setResult(null);
      void apiFetch<DnsProvidersResponse>("/api/ssl/providers")
        .then((res) => {
          if (res.providers && res.providers.length > 0) {
            setProviders(res.providers);
          }
        })
        .catch(() => {
          // Use default providers if agent endpoint pending
        });
    }
  }, [open, domain]);

  const activeProvider = providers.find((p) => p.id === selectedProvider) || providers[0];

  function handleCredentialChange(field: string, val: string) {
    setCredentials((prev) => ({ ...prev, [field]: val }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const payload: WildcardSslRequest = {
        provider: selectedProvider,
        email: email.trim(),
        credentials,
        autoRenew,
      };

      const res = await apiPost<WildcardSslResponse>(
        `/api/sites/${encodeURIComponent(domain)}/ssl/wildcard`,
        payload,
      );

      setResult(res);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to issue wildcard certificate.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-border/70 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <ShieldCheck size={20} />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-foreground">
                  Wildcard SSL Certificate (*.{domain})
                </Dialog.Title>
                <p className="text-xs text-muted-foreground">
                  Automated DNS-01 Let&apos;s Encrypt issuance with automatic renewals
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {result ? (
            <div className="py-6 space-y-4">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-400 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <CheckCircle2 size={18} />
                  <span>Wildcard Certificate Active!</span>
                </div>
                <p className="text-xs text-foreground/90">
                  {result.message ||
                    `Successfully verified DNS-01 challenge and installed certificate covering *.${domain} and ${domain}.`}
                </p>
                {result.expiresAt && (
                  <p className="text-[11px] text-muted-foreground font-mono">
                    Expires: {new Date(result.expiresAt).toLocaleDateString()} (Auto-renewal enabled)
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="primary" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              {error && <Alert variant="error">{error}</Alert>}

              {/* Provider Selection */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">DNS Provider (DNS-01 Challenge)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {providers.map((p) => {
                    const active = p.id === selectedProvider;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProvider(p.id)}
                        className={`flex flex-col text-left rounded-lg border p-3 text-xs transition-colors cursor-pointer ${
                          active
                            ? "border-brand bg-brand/10 text-foreground"
                            : "border-border bg-card/60 hover:bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        <span className="font-semibold text-foreground flex items-center justify-between">
                          {p.name}
                          {p.configured && <Badge variant="green" className="text-[10px] ml-1">Configured</Badge>}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {p.id === "cloudflare"
                            ? "Cloudflare API"
                            : p.id === "powerdns"
                              ? "Local Server"
                              : p.id === "digitalocean"
                                ? "DO Token"
                                : "Route53"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {activeProvider.description}
                </p>
              </div>

              {/* Dynamic Credentials Inputs */}
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <KeyRound size={13} className="text-brand" /> Provider Credentials
                </span>

                {selectedProvider === "cloudflare" && (
                  <div className="space-y-1">
                    <Label htmlFor="cf-token" className="text-xs">
                      Cloudflare API Token
                    </Label>
                    <Input
                      id="cf-token"
                      type="password"
                      placeholder="e.g. v1.0-..."
                      value={credentials.api_token || ""}
                      onChange={(e) => handleCredentialChange("api_token", e.target.value)}
                      required={!activeProvider.configured}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Needs Zone:DNS:Edit permissions for {domain}.
                    </p>
                  </div>
                )}

                {selectedProvider === "powerdns" && (
                  <div className="space-y-1">
                    <Label htmlFor="pdns-key" className="text-xs">
                      PowerDNS API Key (or leave empty for local socket)
                    </Label>
                    <Input
                      id="pdns-key"
                      type="password"
                      placeholder="Optional local auth key"
                      value={credentials.api_key || ""}
                      onChange={(e) => handleCredentialChange("api_key", e.target.value)}
                    />
                  </div>
                )}

                {selectedProvider === "digitalocean" && (
                  <div className="space-y-1">
                    <Label htmlFor="do-token" className="text-xs">
                      DigitalOcean Personal Access Token
                    </Label>
                    <Input
                      id="do-token"
                      type="password"
                      placeholder="dop_v1_..."
                      value={credentials.api_token || ""}
                      onChange={(e) => handleCredentialChange("api_token", e.target.value)}
                      required
                    />
                  </div>
                )}

                {selectedProvider === "route53" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="r53-id" className="text-xs">
                        AWS Access Key ID
                      </Label>
                      <Input
                        id="r53-id"
                        type="text"
                        placeholder="AKIA..."
                        value={credentials.access_key_id || ""}
                        onChange={(e) => handleCredentialChange("access_key_id", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="r53-secret" className="text-xs">
                        AWS Secret Key
                      </Label>
                      <Input
                        id="r53-secret"
                        type="password"
                        placeholder="Secret key..."
                        value={credentials.secret_access_key || ""}
                        onChange={(e) => handleCredentialChange("secret_access_key", e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Renewal Email */}
              <div className="space-y-1">
                <Label htmlFor="ssl-email" className="text-xs">
                  Let&apos;s Encrypt Notification Email
                </Label>
                <Input
                  id="ssl-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {/* Auto Renew Checkbox */}
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRenew}
                  onChange={(e) => setAutoRenew(e.target.checked)}
                  className="rounded border-border text-brand focus:ring-brand"
                />
                <span>Automatically renew certificate every 60 days via cron background job</span>
              </label>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-border/70 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={loading}>
                  <ShieldCheck size={14} className="mr-1.5" />
                  Issue Wildcard SSL
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
