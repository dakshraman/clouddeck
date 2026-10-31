"use client";

import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@animate-ui/react/primitives/radix-ui/dialog";
import { Check, CheckCircle2, Copy, KeyRound, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { apiFetch, readError } from "@/components/api";
import { Alert, type AlertVariant } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface SetupData {
  secret: string;
  otpAuthUrl: string;
  qrCodeSvg: string;
  enabled: boolean;
}

interface TwoFactorCardProps {
  initialEnabled?: boolean;
  onStatusChange?: (enabled: boolean) => void;
}

export function TwoFactorCard({ initialEnabled = false, onStatusChange }: TwoFactorCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [notice, setNotice] = useState<{ variant: AlertVariant; text: string } | null>(null);

  // Enable modal state
  const [enableOpen, setEnableOpen] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [enableSubmitting, setEnableSubmitting] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Disable modal state
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableSubmitting, setDisableSubmitting] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  async function openEnableModal() {
    setEnableOpen(true);
    setSetupLoading(true);
    setSetupError(null);
    setEnableError(null);
    setConfirmCode("");
    setCopiedSecret(false);

    try {
      const data = await apiFetch<SetupData>("/api/auth/2fa");
      setSetupData(data);
    } catch (err) {
      setSetupError(
        err instanceof Error ? err.message : "Failed to generate two-factor configuration.",
      );
    } finally {
      setSetupLoading(false);
    }
  }

  async function onCopySecret() {
    if (!setupData?.secret || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopiedSecret(true);
      window.setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      setCopiedSecret(false);
    }
  }

  async function handleConfirmEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setupData?.secret || enableSubmitting) return;

    setEnableSubmitting(true);
    setEnableError(null);

    try {
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: setupData.secret,
          code: confirmCode.trim(),
        }),
      });

      if (!res.ok) {
        setEnableError(await readError(res));
        return;
      }

      setEnabled(true);
      onStatusChange?.(true);
      setEnableOpen(false);
      setNotice({
        variant: "success",
        text: "Two-factor authentication has been enabled. You will need your authenticator app next time you sign in.",
      });
    } catch {
      setEnableError("Cannot reach the panel. Check your connection and try again.");
    } finally {
      setEnableSubmitting(false);
    }
  }

  function openDisableModal() {
    setDisableOpen(true);
    setDisablePassword("");
    setDisableError(null);
  }

  async function handleConfirmDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disableSubmitting) return;

    setDisableSubmitting(true);
    setDisableError(null);

    try {
      const res = await fetch("/api/auth/2fa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword }),
      });

      if (!res.ok) {
        setDisableError(await readError(res));
        return;
      }

      setEnabled(false);
      onStatusChange?.(false);
      setDisableOpen(false);
      setNotice({
        variant: "info",
        text: "Two-factor authentication has been disabled.",
      });
    } catch {
      setDisableError("Cannot reach the panel. Check your connection and try again.");
    } finally {
      setDisableSubmitting(false);
    }
  }

  return (
    <>
      <section id="two-factor" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                <ShieldCheck size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <CardTitle>Two-Factor Authentication (2FA)</CardTitle>
                <CardDescription>
                  Protect your panel account with a time-based one-time password (TOTP RFC 6238).
                </CardDescription>
              </div>
            </div>
            <div className="shrink-0">
              {enabled ? (
                <Badge variant="green">Enabled</Badge>
              ) : (
                <Badge variant="neutral">Disabled</Badge>
              )}
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {enabled
                    ? "Two-factor authentication is active"
                    : "Two-factor authentication is not active"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {enabled
                    ? "A 6-digit TOTP code is required from your authenticator app on every login."
                    : "Require a 6-digit verification code from Google Authenticator, Authy, or 1Password when signing in."}
                </p>
              </div>
              <div className="shrink-0">
                {enabled ? (
                  <Button variant="danger" size="sm" onClick={openDisableModal}>
                    Disable 2FA
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => void openEnableModal()}>
                    <KeyRound size={13} aria-hidden="true" />
                    Enable 2FA
                  </Button>
                )}
              </div>
            </div>

            {notice ? <Alert variant={notice.variant}>{notice.text}</Alert> : null}
          </CardBody>
        </Card>
      </section>

      {/* Enable 2FA Dialog */}
      <Dialog.Root open={enableOpen} onOpenChange={setEnableOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm " />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-6 shadow-2xl focus:outline-none">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <ShieldCheck size={20} aria-hidden="true" />
                </div>
                <div>
                  <Dialog.Title className="text-base font-semibold text-foreground">
                    Enable Two-Factor Authentication
                  </Dialog.Title>
                  <Dialog.Description className="text-xs text-muted-foreground">
                    Scan the QR code with your authenticator app.
                  </Dialog.Description>
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

            {setupLoading ? (
              <div className="mt-6 flex flex-col items-center gap-4">
                <Skeleton className="h-48 w-48 rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ) : setupError ? (
              <div className="mt-4 space-y-4">
                <Alert variant="error">{setupError}</Alert>
                <div className="flex justify-end">
                  <Button variant="ghost" onClick={() => setEnableOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            ) : setupData ? (
              <form onSubmit={handleConfirmEnable} className="mt-5 space-y-5">
                <div className="space-y-3">
                  <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/10">
                    <div
                      className="h-full w-full"
                      dangerouslySetInnerHTML={{ __html: setupData.qrCodeSvg }}
                    />
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    Supported apps: Google Authenticator, 1Password, Authy, Microsoft Authenticator
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Or enter key manually</Label>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <code className="select-all font-mono text-xs font-semibold tracking-wider text-foreground">
                      {setupData.secret}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void onCopySecret()}
                      className="h-7 px-2 text-xs"
                    >
                      {copiedSecret ? (
                        <Check size={13} className="text-emerald-400" />
                      ) : (
                        <Copy size={13} />
                      )}
                      <span className="ml-1">{copiedSecret ? "Copied" : "Copy"}</span>
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="twofa-verify-code">Verification code</Label>
                  <Input
                    id="twofa-verify-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={confirmCode}
                    onChange={(event) =>
                      setConfirmCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    autoFocus
                    required
                    disabled={enableSubmitting}
                    className="text-center font-mono text-lg tracking-[0.25em]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the 6-digit code shown in your app to confirm.
                  </p>
                </div>

                {enableError ? <Alert variant="error">{enableError}</Alert> : null}

                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEnableOpen(false)}
                    disabled={enableSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={enableSubmitting}
                    disabled={confirmCode.trim().length !== 6 || enableSubmitting}
                  >
                    <CheckCircle2 size={14} aria-hidden="true" />
                    Confirm & Enable
                  </Button>
                </div>
              </form>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Disable 2FA Dialog */}
      <Dialog.Root open={disableOpen} onOpenChange={setDisableOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm " />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-6 shadow-2xl focus:outline-none">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <ShieldAlert size={20} aria-hidden="true" />
                </div>
                <div>
                  <Dialog.Title className="text-base font-semibold text-foreground">
                    Disable Two-Factor Authentication
                  </Dialog.Title>
                  <Dialog.Description className="text-xs text-muted-foreground">
                    Enter your current password to confirm removal.
                  </Dialog.Description>
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

            <form onSubmit={handleConfirmDisable} className="mt-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                Disabling 2FA will reduce your account security. You will only need your username
                and password to sign in.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="disable-2fa-password">Current password</Label>
                <Input
                  id="disable-2fa-password"
                  type="password"
                  value={disablePassword}
                  onChange={(event) => setDisablePassword(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  required
                  disabled={disableSubmitting}
                />
              </div>

              {disableError ? <Alert variant="error">{disableError}</Alert> : null}

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDisableOpen(false)}
                  disabled={disableSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  loading={disableSubmitting}
                  disabled={!disablePassword || disableSubmitting}
                >
                  Disable 2FA
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
