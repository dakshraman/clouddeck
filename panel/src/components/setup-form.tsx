"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CloudDeckLogo } from "@/components/brand/clouddeck-logo";
import { readError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function SetupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email: email.trim() || undefined }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      if (res.status === 409) {
        // Setup was completed elsewhere (another tab/session).
        router.push("/login");
        router.refresh();
        return;
      }
      setError(await readError(res));
    } catch {
      setError("Cannot reach the panel. Check the connection and try again.");
    } finally {
      setPending(false);
    }
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
          <h1 className="text-base font-semibold text-foreground">Welcome — set up your panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create the administrator account for this server. You can add more accounts later.
          </p>

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
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
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
                autoComplete="new-password"
                minLength={8}
                required
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                required
                disabled={pending}
              />
            </div>
            {error ? <Alert variant="error">{error}</Alert> : null}
            <Button type="submit" loading={pending} className="w-full">
              Create account &amp; sign in
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          This page disappears once the first account exists.
        </p>
      </div>
    </div>
  );
}
