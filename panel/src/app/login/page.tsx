"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { readError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      if (res.status === 401) {
        setError("Invalid username or password");
      } else {
        setError(await readError(res));
      }
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
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white shadow-lg shadow-indigo-500/20">
            <Layers size={16} aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-100">CloudDeck</span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20">
          <h1 className="text-base font-semibold text-slate-100">Sign in</h1>
          <p className="mt-1 text-sm text-slate-400">Use your panel account to continue.</p>

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
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Default credentials are set via <span className="font-mono text-slate-400">PANEL_SEED_*</span> env vars.
        </p>
      </div>
    </div>
  );
}
