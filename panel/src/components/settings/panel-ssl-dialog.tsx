"use client";

import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@animate-ui/react/primitives/radix-ui/dialog";
import {
  ExternalLink,
  Globe,
  KeyRound,
  Lock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { PanelSSLInstallRequest, PanelSSLStatus } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input, Label } from "@/components/ui/input";

export interface PanelSSLDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatus: PanelSSLStatus | null;
  onStatusUpdated: (status: PanelSSLStatus) => void;
}

type TabType = "self-signed" | "letsencrypt" | "custom";

function formatExpiryDate(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PanelSSLDialog({
  open,
  onOpenChange,
  currentStatus,
  onStatusUpdated,
}: PanelSSLDialogProps) {
  const isCurrentlyActive = Boolean(currentStatus?.enabled);

  const [activeTab, setActiveTab] = useState<TabType>("self-signed");

  // Form states
  const [selfSignedDomain, setSelfSignedDomain] = useState("");
  const [leDomain, setLeDomain] = useState("");
  const [leEmail, setLeEmail] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [customCert, setCustomCert] = useState("");
  const [customKey, setCustomKey] = useState("");

  // Operation states
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<PanelSSLStatus | null>(null);
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [disabledNotice, setDisabledNotice] = useState(false);

  // Reset transient feedback when opened
  useEffect(() => {
    if (open) {
      setError(null);
      setSuccessStatus(null);
      setConfirmingDisable(false);
      setDisabledNotice(false);

      if (currentStatus?.domain) {
        setLeDomain(currentStatus.domain);
        setSelfSignedDomain(currentStatus.domain);
      }
    }
  }, [open, currentStatus]);

  async function handleInstall(req: PanelSSLInstallRequest) {
    setBusy(true);
    setError(null);
    setDisabledNotice(false);

    try {
      const res = await apiFetch<PanelSSLStatus>("/api/panel/ssl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      setSuccessStatus(res);
      onStatusUpdated(res);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Failed to install SSL certificate for the panel.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setError(null);
    setSuccessStatus(null);

    try {
      const res = await apiFetch<PanelSSLStatus>("/api/panel/ssl", {
        method: "DELETE",
      });
      setConfirmingDisable(false);
      setDisabledNotice(true);
      onStatusUpdated(res);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Failed to disable Panel SSL.",
      );
    } finally {
      setBusy(false);
    }
  }

  function onSelfSignedSubmit(e: FormEvent) {
    e.preventDefault();
    void handleInstall({
      type: "self-signed",
      domain: selfSignedDomain.trim() || undefined,
    });
  }

  function onLetsEncryptSubmit(e: FormEvent) {
    e.preventDefault();
    if (!leDomain.trim() || !leEmail.trim()) {
      setError("Domain name and contact email are required for Let's Encrypt.");
      return;
    }
    void handleInstall({
      type: "letsencrypt",
      domain: leDomain.trim(),
      email: leEmail.trim(),
    });
  }

  function onCustomSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customCert.trim() || !customKey.trim()) {
      setError("Both certificate PEM and private key PEM are required.");
      return;
    }
    void handleInstall({
      type: "custom",
      domain: customDomain.trim() || undefined,
      cert: customCert.trim(),
      key: customKey.trim(),
    });
  }

  const destinationPort = successStatus?.port || currentStatus?.port || 2083;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm " />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-popover p-6 shadow-2xl focus:outline-none"
          aria-describedby="panel-ssl-description"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <ShieldCheck size={20} aria-hidden="true" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-foreground">
                  {isCurrentlyActive ? "Manage Panel SSL" : "Install Panel SSL"}
                </Dialog.Title>
                <p id="panel-ssl-description" className="text-xs text-muted-foreground">
                  Enable HTTPS encryption and secure session cookies for your CloudDeck panel.
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-5 space-y-5">
            {error ? <Alert variant="error">{error}</Alert> : null}

            {disabledNotice ? (
              <Alert variant="info">
                Panel SSL has been disabled. The panel is now served over plain HTTP.
              </Alert>
            ) : null}

            {successStatus ? (
              <div className="space-y-4 rounded-lg border border-success/30 bg-success/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <ShieldCheck size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-emerald-300">
                      Panel HTTPS Active!
                    </h3>
                    <p className="mt-0.5 text-xs text-emerald-400/90 leading-relaxed">
                      SSL has been configured and is actively listening on port{" "}
                      <strong className="font-mono text-emerald-300">{destinationPort}</strong>.
                      Your session cookies and credentials are now secured with TLS encryption.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-success/20 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSuccessStatus(null);
                      onOpenChange(false);
                    }}
                  >
                    Done
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const host =
                        successStatus.domain ||
                        (typeof window !== "undefined" ? window.location.hostname : "localhost");
                      window.open(`https://${host}:${destinationPort}`, "_blank");
                    }}
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                    Go to HTTPS Panel
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Currently Active Certificate Summary */}
            {isCurrentlyActive && !successStatus ? (
              <div className="rounded-lg border border-border bg-card/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-semibold text-foreground">
                      Current SSL Certificate
                    </span>
                  </div>
                  <Badge variant="green" className="capitalize">
                    {currentStatus?.type.replace("-", " ")}
                  </Badge>
                </div>

                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Domain / Subject</dt>
                    <dd className="font-mono font-medium text-foreground truncate">
                      {currentStatus?.domain || currentStatus?.subject || "Self-signed IP / SAN"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Issuer</dt>
                    <dd className="font-medium text-foreground truncate">
                      {currentStatus?.issuer || "CloudDeck Self-Signed CA"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Expires</dt>
                    <dd className="font-medium text-foreground">
                      {formatExpiryDate(currentStatus?.expiresAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">HTTPS Port</dt>
                    <dd className="font-mono font-medium text-foreground">
                      {currentStatus?.port || 2083}
                    </dd>
                  </div>
                </dl>

                {/* Disable SSL Option */}
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <p className="text-[11px] text-muted-foreground">
                    Revert the panel back to unencrypted plain HTTP.
                  </p>
                  {confirmingDisable ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmingDisable(false)}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => void handleDisable()}
                        loading={busy}
                      >
                        Confirm Disable
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-red-400 hover:text-red-300 hover:bg-destructive/10"
                      onClick={() => setConfirmingDisable(true)}
                      disabled={busy}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      Disable Panel SSL
                    </Button>
                  )}
                </div>
              </div>
            ) : null}

            {/* If SSL is active, prompt to replace certificate */}
            {isCurrentlyActive && !successStatus ? (
              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-popover px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Replace or Reinstall Certificate
                  </span>
                </div>
              </div>
            ) : null}

            {/* Tab navigation */}
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("self-signed");
                  setError(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  activeTab === "self-signed"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                disabled={busy}
              >
                <Shield size={14} className="shrink-0" />
                <span className="truncate">Self-Signed</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("letsencrypt");
                  setError(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  activeTab === "letsencrypt"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                disabled={busy}
              >
                <Globe size={14} className="shrink-0" />
                <span className="truncate">Let's Encrypt</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("custom");
                  setError(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  activeTab === "custom"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                disabled={busy}
              >
                <KeyRound size={14} className="shrink-0" />
                <span className="truncate">Custom Cert</span>
              </button>
            </div>

            {/* Tab 1: Self-Signed */}
            {activeTab === "self-signed" ? (
              <form onSubmit={onSelfSignedSubmit} className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-2 text-xs leading-relaxed text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <ShieldCheck size={15} className="text-brand" />
                    Instant HTTPS (1-Click)
                  </div>
                  <p>
                    Recommended when accessing via IP address or internal hostname.
                  </p>
                  <p className="text-[11px] text-muted-foreground/90">
                    Self-signed certificate with Subject Alternative Names (SAN) matching your
                    server IP and localhost. No domain required.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="self-signed-domain">Custom Domain or IP (Optional)</Label>
                  <Input
                    id="self-signed-domain"
                    type="text"
                    placeholder="e.g. 192.168.1.10 or panel.local (optional)"
                    value={selfSignedDomain}
                    onChange={(e) => setSelfSignedDomain(e.target.value)}
                    disabled={busy}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Leave blank to automatically detect your server's public/private IP addresses.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={busy}>
                    <ShieldCheck size={14} aria-hidden="true" />
                    Enable Self-Signed SSL
                  </Button>
                </div>
              </form>
            ) : null}

            {/* Tab 2: Let's Encrypt */}
            {activeTab === "letsencrypt" ? (
              <form onSubmit={onLetsEncryptSubmit} className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Lock size={14} className="text-emerald-400" />
                    Automated Let's Encrypt SSL
                  </div>
                  <p>
                    Free automated certificates for public domains (e.g. panel.example.com).
                  </p>
                  <p className="text-[11px] text-muted-foreground/90">
                    Before requesting, ensure your domain has an A/AAAA DNS record pointing directly
                    to this server.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="le-domain">
                    Domain Name <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="le-domain"
                    type="text"
                    required
                    placeholder="panel.example.com"
                    value={leDomain}
                    onChange={(e) => setLeDomain(e.target.value)}
                    disabled={busy}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="le-email">
                    Email Address <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="le-email"
                    type="email"
                    required
                    placeholder="admin@example.com"
                    value={leEmail}
                    onChange={(e) => setLeEmail(e.target.value)}
                    disabled={busy}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Used by Let's Encrypt to send urgent certificate renewal notices.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={busy}>
                    <Lock size={14} aria-hidden="true" />
                    Issue Let's Encrypt SSL
                  </Button>
                </div>
              </form>
            ) : null}

            {/* Tab 3: Custom Certificate */}
            {activeTab === "custom" ? (
              <form onSubmit={onCustomSubmit} className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <KeyRound size={14} className="text-brand" />
                    Custom SSL Certificate
                  </div>
                  <p>
                    For purchased or external certificates (e.g. Cloudflare Origin, Comodo, DigiCert).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="custom-domain">Domain Name (Optional)</Label>
                  <Input
                    id="custom-domain"
                    type="text"
                    placeholder="e.g. panel.example.com (optional)"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    disabled={busy}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="custom-key">
                    Private Key (PEM) <span className="text-red-400">*</span>
                  </Label>
                  <textarea
                    id="custom-key"
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value)}
                    placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
                    rows={4}
                    required
                    disabled={busy}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="custom-cert">
                    Certificate (PEM) <span className="text-red-400">*</span>
                  </Label>
                  <textarea
                    id="custom-cert"
                    value={customCert}
                    onChange={(e) => setCustomCert(e.target.value)}
                    placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                    rows={5}
                    required
                    disabled={busy}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={busy}>
                    <ShieldCheck size={14} aria-hidden="true" />
                    Install Custom SSL
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
