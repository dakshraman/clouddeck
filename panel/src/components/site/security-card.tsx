"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SiteBlockedIP, SiteBlockedIPsResponse } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { shortDateTime } from "@/components/format";
import { ShieldBan, Trash2 } from "lucide-react";

export function SecurityCard({ domain }: { domain: string }) {
  const base = `/api/sites/${encodeURIComponent(domain)}/security`;

  const [blockedIps, setBlockedIps] = useState<SiteBlockedIP[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ip, setIp] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<SiteBlockedIPsResponse>(base);
      setBlockedIps(data.blockedIps);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load blocked IPs");
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = submitting || pendingDelete !== null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = ip.trim();
    if (address === "") {
      setFormError("Enter an IP address (IPv4 or IPv6) or a CIDR range such as 203.0.113.0/24.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const payload: { ip: string; note?: string } = { ip: address };
      if (note.trim() !== "") payload.note = note.trim();
      const data = await apiPost<SiteBlockedIPsResponse>(`${base}/block`, payload);
      setBlockedIps(data.blockedIps);
      setIp("");
      setNote("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to block the IP address");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRemove(address: string) {
    setPendingDelete(address);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[address];
      return next;
    });
    try {
      const data = await apiFetch<SiteBlockedIPsResponse>(
        `${base}/block/${encodeURIComponent(address)}`,
        { method: "DELETE" },
      );
      setBlockedIps(data.blockedIps);
    } catch (error) {
      setRowErrors((prev) => ({
        ...prev,
        [address]: error instanceof Error ? error.message : "Failed to remove the IP address",
      }));
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>IP blocker</CardTitle>
          <CardDescription>
            Deny rules applied to the whole site: every nginx server block for{" "}
            <span className="font-mono">{domain}</span> (including subdomains) rejects the listed
            IP addresses and CIDR ranges.
          </CardDescription>
        </div>
        <ShieldBan size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardBody className="grid gap-5">
        <Alert variant="info">
          Blocked IPs and ranges are refused by nginx before requests reach your files. Visitors
          from these addresses can no longer load any page of this site.
        </Alert>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="block-ip">IP address</Label>
              <Input
                id="block-ip"
                value={ip}
                onChange={(event) => setIp(event.target.value)}
                placeholder="203.0.113.10"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                IPv4 or IPv6 address, or a CIDR range such as 203.0.113.0/24.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="block-note">Note (optional)</Label>
              <Input
                id="block-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why this address is blocked"
                autoComplete="off"
                disabled={busy}
              />
            </div>
          </div>

          {formError ? <Alert variant="error">{formError}</Alert> : null}

          <div>
            <Button type="submit" loading={submitting} disabled={busy}>
              Block IP
            </Button>
          </div>
        </form>

        {loadError ? (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : blockedIps === null ? (
          <div className="grid gap-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : blockedIps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blocked IP addresses.</p>
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 pr-5 text-left font-medium">IP address</th>
                  <th className="py-3 pr-5 text-left font-medium">Note</th>
                  <th className="py-3 pr-5 text-left font-medium">Created</th>
                  <th className="py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {blockedIps.map((entry) => {
                  const removing = pendingDelete === entry.ip;
                  const rowError = rowErrors[entry.ip];
                  return (
                    <tr key={entry.ip} className="border-t border-border">
                      <td className="py-3 pr-5 font-mono text-foreground">
                        <span className="break-all">{entry.ip}</span>
                      </td>
                      <td className="py-3 pr-5 text-muted-foreground">{entry.note || "—"}</td>
                      <td className="py-3 pr-5 text-muted-foreground">{shortDateTime(entry.createdAt)}</td>
                      <td className="py-3">
                        <div className="flex items-center justify-end">
                          {removing ? (
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Spinner size={14} className="text-muted-foreground" />
                              removing…
                            </span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-red-400"
                              disabled={busy}
                              onClick={() => void onRemove(entry.ip)}
                              aria-label={`Remove ${entry.ip}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              Remove
                            </Button>
                          )}
                        </div>
                        {rowError ? (
                          <p className="mt-1 max-w-64 text-right text-xs text-red-400" title={rowError}>
                            {rowError}
                          </p>
                        ) : null}
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
  );
}
