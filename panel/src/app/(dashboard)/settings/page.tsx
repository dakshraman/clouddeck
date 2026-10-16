"use client";

import { useEffect, useState } from "react";
import type { SystemInfo } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { Archive, Database, Mail, Network, Server, User } from "lucide-react";

const comingSoon = [
  {
    icon: Archive,
    title: "Backups",
    description: "Scheduled snapshots of sites and databases.",
  },
  {
    icon: Network,
    title: "DNS zones",
    description: "Manage DNS records for your domains.",
  },
  {
    icon: Database,
    title: "Databases",
    description: "Create and manage MySQL databases.",
  },
  {
    icon: Mail,
    title: "Email",
    description: "Mailboxes on your own domain.",
  },
];

export default function SettingsPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [meResult, systemResult] = await Promise.allSettled([
        apiFetch<{ user: { username: string } }>("/api/auth/me"),
        apiFetch<SystemInfo>("/api/system"),
      ]);
      if (cancelled) return;

      if (meResult.status === "fulfilled") {
        setUsername(meResult.value.user.username);
      } else {
        setAccountError(
          meResult.reason instanceof Error ? meResult.reason.message : "Failed to load account",
        );
      }

      if (systemResult.status === "fulfilled") {
        setSystem(systemResult.value);
      } else {
        setSystemError(
          systemResult.reason instanceof Error
            ? systemResult.reason.message
            : "Cannot reach the CloudDeck agent",
        );
      }

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader title="Settings" description="Account and server information." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Account</CardTitle>
              <CardDescription>The signed-in panel user.</CardDescription>
            </div>
            <User size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
          </CardHeader>
          <CardBody>
            {loading ? (
              <Skeleton className="h-10 w-48" />
            ) : accountError ? (
              <Alert variant="error">{accountError}</Alert>
            ) : (
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-semibold uppercase text-indigo-300">
                  {(username ?? "?").slice(0, 1)}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-200">{username}</p>
                  <p className="text-xs text-slate-500">Panel administrator</p>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Agent</CardTitle>
              <CardDescription>The privileged service managing this server.</CardDescription>
            </div>
            <Server size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
          </CardHeader>
          <CardBody>
            {loading ? (
              <div className="grid gap-3">
                <Skeleton className="h-5" />
                <Skeleton className="h-5" />
                <Skeleton className="h-5" />
              </div>
            ) : systemError ? (
              <Alert variant="error">{systemError}</Alert>
            ) : system ? (
              <dl className="grid gap-3">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-xs text-slate-500">Hostname</dt>
                  <dd className="truncate font-mono text-sm text-slate-200">{system.hostname}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-xs text-slate-500">Operating system</dt>
                  <dd className="truncate font-mono text-sm text-slate-200">{system.os}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-xs text-slate-500">Version</dt>
                  <dd className="font-mono text-sm text-slate-200">
                    {system.agentVersion ? `v${system.agentVersion}` : "unknown"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-xs text-slate-500">Mode</dt>
                  <dd className="flex items-center gap-2">
                    <Badge variant="green">Online</Badge>
                    {system.dryRun ? <Badge variant="amber">Dry run</Badge> : null}
                  </dd>
                </div>
              </dl>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>Coming soon</CardTitle>
            <CardDescription>Planned features, not yet available in this version.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="pt-2">
          <ul className="divide-y divide-slate-800">
            {comingSoon.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.title}
                  aria-disabled="true"
                  className="flex items-center gap-4 py-3 opacity-70"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-slate-400">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-300">{item.title}</p>
                    <p className="truncate text-xs text-slate-500">{item.description}</p>
                  </div>
                  <Badge variant="neutral" className="shrink-0">
                    Soon
                  </Badge>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
