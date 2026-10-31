"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { CloudDeckLogo } from "@/components/brand/clouddeck-logo";
import { readError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [requires2FA, setRequires2FA] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const payload: { username: string; password: string; code?: string } = {
        username,
        password,
      };
      if (requires2FA) {
        payload.code = code.trim();
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        if (data?.requires2FA) {
          setRequires2FA(true);
          setCode("");
          setError(null);
          return;
        }
        router.push("/");
        router.refresh();
        return;
      }

      if (res.status === 401) {
        if (requires2FA) {
          setError(data?.message || "Invalid two-factor authentication code");
        } else {
          setError(data?.message || "Invalid username or password");
        }
      } else {
        setError(await readError(res));
      }
    } catch {
      setError("Cannot reach the panel. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  function handleBack() {
    setRequires2FA(false);
    setCode("");
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sidebar-primary-foreground shadow-lg shadow-brand/20">
            <CloudDeckLogo size={18} aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">CloudDeck</span>
        </div>

        <div className="rounded-xl border border-border bg-muted/60 p-6 shadow-xl shadow-black/20">
          {!requires2FA ? (
            <>
              <h1 className="text-base font-semibold text-foreground">Sign in</h1>
              <p className="mt-1 text-sm text-muted-foreground">Use your panel account to continue.</p>

              <form onSubmit={onSubmit} className="mt-6 grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    autoFocus
                    required
                    disabled={pending}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={pending}
                  />
                </div>
                {error ? <Alert variant="error">{error}</Alert> : null}
                <Button type="submit" loading={pending} className="w-full">
                  Sign in
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-brand">
                  <ShieldCheck size={15} aria-hidden="true" />
                </span>
                <h1 className="text-base font-semibold text-foreground">Two-Factor Authentication</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app for{" "}
                <span className="font-medium text-foreground">{username}</span>.
              </p>

              <form onSubmit={onSubmit} className="mt-6 grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="totp-code">Verification code</Label>
                  <Input
                    id="totp-code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    autoFocus
                    required
                    disabled={pending}
                    className="text-center font-mono text-xl tracking-[0.3em]"
                  />
                </div>
                {error ? <Alert variant="error">{error}</Alert> : null}
                <Button
                  type="submit"
                  loading={pending}
                  disabled={code.trim().length !== 6 || pending}
                  className="w-full"
                >
                  Verify code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBack}
                  disabled={pending}
                  className="w-full text-muted-foreground"
                >
                  <ArrowLeft size={14} className="mr-1.5" aria-hidden="true" />
                  Back to credentials
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Accounts are created during the panel&apos;s first-run setup.
        </p>
      </div>
    </div>
  );
}
