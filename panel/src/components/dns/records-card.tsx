"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  CreateDNSRecordRequest,
  DNSRecord,
  DNSRecordListResponse,
  DNSRecordType,
} from "@/lib/types";
import { apiFetch, apiPost, isAbortError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { ListTree, Plus, Trash2 } from "lucide-react";

// Frozen by docs/api.md section 1.4.
const RECORD_TYPES: readonly DNSRecordType[] = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"];
const RECORD_NAME_REGEX = /^_?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[_a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const RECORD_NAME_MAX = 253;
const RECORD_CONTENT_MAX = 512;
const RECORD_TTL_MAX = 604800;

const CONTENT_PLACEHOLDER: Record<DNSRecordType, string> = {
  A: "192.0.2.10",
  AAAA: "2001:db8::10",
  CNAME: "target.example.com",
  MX: "10 mail.example.com",
  TXT: "v=spf1 -all",
  NS: "ns1.example.com",
  SRV: "10 5 443 target.example.com",
  CAA: '0 issue "letsencrypt.org"',
};

/** One name+type record set; the API deletes whole RRsets. */
interface RrSet {
  name: string;
  type: string;
  ttl: number;
  contents: string[];
}

function groupRecords(records: DNSRecord[]): RrSet[] {
  const sets = new Map<string, RrSet>();
  for (const record of records) {
    const key = `${record.name}\u0000${record.type}`;
    const set = sets.get(key);
    if (set) {
      set.contents.push(record.content);
    } else {
      sets.set(key, {
        name: record.name,
        type: record.type,
        ttl: record.ttl,
        contents: [record.content],
      });
    }
  }
  return [...sets.values()];
}

function rrsetKey(set: RrSet): string {
  return `${set.name}\u0000${set.type}`;
}

interface RecordsCardProps {
  zone: string | null;
}

export function RecordsCard({ zone }: RecordsCardProps) {
  const [records, setRecords] = useState<DNSRecord[] | null>(null);
  const [loadedZone, setLoadedZone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [recordName, setRecordName] = useState("@");
  const [recordType, setRecordType] = useState<DNSRecordType>("A");
  const [content, setContent] = useState("");
  const [ttl, setTtl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!zone) {
      setRecords(null);
      setLoadedZone(null);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    apiFetch<DNSRecordListResponse>(`/api/dns/zones/${encodeURIComponent(zone)}/records`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!active) return;
        setRecords(data.records);
        setLoadedZone(zone);
        setLoading(false);
      })
      .catch((err) => {
        if (!active || isAbortError(err)) return;
        setError(err instanceof Error ? err.message : "Failed to load records");
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [zone, reloadKey]);

  // Reset the form and per-row state when the user switches zones.
  useEffect(() => {
    setAddOpen(false);
    setRecordName("@");
    setRecordType("A");
    setContent("");
    setTtl("");
    setAddError(null);
    setNotice(null);
    setConfirmKey(null);
    setRowErrors({});
  }, [zone]);

  const visibleRecords = zone !== null && loadedZone === zone ? records : null;
  const sets = useMemo(() => (visibleRecords ? groupRecords(visibleRecords) : []), [visibleRecords]);

  function openAdd() {
    setAddOpen(true);
    setAddError(null);
    setNotice(null);
  }

  function closeAdd() {
    setAddOpen(false);
    setAddError(null);
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!zone) return;

    const candidateName = recordName.trim().toLowerCase();
    if (
      candidateName !== "@" &&
      (candidateName.length > RECORD_NAME_MAX || !RECORD_NAME_REGEX.test(candidateName))
    ) {
      setAddError("Enter a relative record name like www, or @ for the zone apex.");
      return;
    }

    const candidateContent = content.trim();
    if (candidateContent === "") {
      setAddError("Enter the record content.");
      return;
    }
    if (candidateContent.length > RECORD_CONTENT_MAX) {
      setAddError(`Content must be ${RECORD_CONTENT_MAX} characters or fewer.`);
      return;
    }

    let parsedTtl: number | undefined;
    const ttlCandidate = ttl.trim();
    if (ttlCandidate !== "") {
      if (!/^\d+$/.test(ttlCandidate) || Number(ttlCandidate) > RECORD_TTL_MAX) {
        setAddError(`TTL must be a whole number between 0 and ${RECORD_TTL_MAX}.`);
        return;
      }
      parsedTtl = Number(ttlCandidate);
    }

    const payload: CreateDNSRecordRequest = {
      name: candidateName,
      type: recordType,
      content: candidateContent,
    };
    if (parsedTtl !== undefined) payload.ttl = parsedTtl;

    setAdding(true);
    setAddError(null);
    try {
      await apiPost<{ record: DNSRecord }>(`/api/dns/zones/${encodeURIComponent(zone)}/records`, payload);
      setNotice(`Added ${candidateName} ${recordType} to ${zone}.`);
      setAddOpen(false);
      setRecordName("@");
      setRecordType("A");
      setContent("");
      setTtl("");
      refresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add record");
    } finally {
      setAdding(false);
    }
  }

  async function onDeleteSet(set: RrSet) {
    if (!zone) return;
    const key = rrsetKey(set);
    setConfirmKey(null);
    setNotice(null);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDeletingKey(key);
    try {
      await apiFetch<{ name: string; type: string; deleted: boolean }>(
        `/api/dns/zones/${encodeURIComponent(zone)}/records?name=${encodeURIComponent(set.name)}&type=${encodeURIComponent(set.type)}`,
        { method: "DELETE" },
      );
      setNotice(`Deleted ${set.name} ${set.type} records from ${zone}.`);
      refresh();
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Delete failed",
      }));
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <Card className={visibleRecords && visibleRecords.length > 0 ? "overflow-hidden" : undefined}>
      <CardHeader>
        <div>
          <CardTitle>Records</CardTitle>
          <CardDescription>
            {zone ? `Record sets in ${zone}.` : "Select a zone to view and edit its records."}
          </CardDescription>
        </div>
        <Button variant="secondary" size="sm" onClick={openAdd} disabled={!zone || addOpen}>
          <Plus size={14} aria-hidden="true" />
          Add record
        </Button>
      </CardHeader>

      {addOpen && zone ? (
        <form
          onSubmit={onAdd}
          className="mx-5 mt-4 grid gap-4 rounded-lg border border-border bg-background/40 p-4"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="record-name">Name</Label>
              <Input
                id="record-name"
                value={recordName}
                onChange={(event) => setRecordName(event.target.value)}
                placeholder="www"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={adding}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Relative to the zone - @ is the zone apex.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="record-type">Type</Label>
              <Select
                id="record-type"
                value={recordType}
                onChange={(event) => setRecordType(event.target.value as DNSRecordType)}
                disabled={adding}
              >
                {RECORD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="record-ttl">
                TTL <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="record-ttl"
                value={ttl}
                onChange={(event) => setTtl(event.target.value)}
                placeholder="3600"
                inputMode="numeric"
                autoComplete="off"
                disabled={adding}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Seconds, 0 to {RECORD_TTL_MAX}. Empty uses the PowerDNS default.
              </p>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="record-content">Content</Label>
            <Input
              id="record-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={CONTENT_PLACEHOLDER[recordType]}
              autoComplete="off"
              spellCheck={false}
              disabled={adding}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Record value - TXT values are quoted automatically.</p>
          </div>
          {addError ? <Alert variant="error">{addError}</Alert> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={adding}>
              Add record
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={closeAdd} disabled={adding}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {notice ? (
        <div className="px-5 pt-4">
          <Alert variant="success">{notice}</Alert>
        </div>
      ) : null}

      {zone === null ? (
        <CardBody>
          <p className="text-sm text-muted-foreground">
            Select a zone above to view and edit its records.
          </p>
        </CardBody>
      ) : error && visibleRecords === null ? (
        <CardBody>
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="secondary" size="sm" onClick={refresh}>
                Retry
              </Button>
            </div>
          </Alert>
        </CardBody>
      ) : visibleRecords === null ? (
        <CardBody className="grid gap-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </CardBody>
      ) : (
        <>
          {error ? (
            <div className="px-5 pt-4">
              <Alert variant="error">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{error}</span>
                  <Button variant="secondary" size="sm" onClick={refresh}>
                    Retry
                  </Button>
                </div>
              </Alert>
            </div>
          ) : null}

          {visibleRecords.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={ListTree}
                title="No records in this zone"
                description="Add a record to get started."
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 text-left font-medium">Name</th>
                    <th className="px-5 py-3 text-left font-medium">Type</th>
                    <th className="px-5 py-3 text-left font-medium">TTL</th>
                    <th className="w-full max-w-0 px-5 py-3 text-left font-medium">Content</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sets.map((set) => {
                    const key = rrsetKey(set);
                    const isDeleting = deletingKey === key;
                    const isConfirming = confirmKey === key;
                    const rowError = rowErrors[key];
                    return (
                      <tr key={key} className="border-t border-border hover:bg-muted/40">
                        <td className="px-5 py-3 align-top">
                          <span
                            className="font-mono text-sm text-foreground"
                            title={set.name === "@" ? "Zone apex" : undefined}
                          >
                            {set.name}
                          </span>
                        </td>
                        <td className="px-5 py-3 align-top">
                          <Badge variant="neutral">{set.type}</Badge>
                        </td>
                        <td className="px-5 py-3 align-top text-muted-foreground">{set.ttl}</td>
                        <td className="w-full max-w-0 px-5 py-3 align-top">
                          <div className="grid gap-1">
                            {set.contents.map((value, index) => (
                              <div
                                key={`${key}-${index}`}
                                className="truncate font-mono text-xs text-muted-foreground"
                                title={value}
                              >
                                {value}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3 align-top">
                          <div className="flex items-center justify-end gap-2">
                            {isDeleting ? (
                              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Spinner size={14} className="text-muted-foreground" />
                                deleting…
                              </span>
                            ) : isConfirming ? (
                              <>
                                <span className="text-xs text-muted-foreground">Delete set?</span>
                                <Button variant="danger" size="sm" onClick={() => void onDeleteSet(set)}>
                                  Confirm
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setConfirmKey(null)}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-red-400"
                                onClick={() => setConfirmKey(key)}
                                aria-label={`Delete ${set.name} ${set.type} records`}
                                title={`Deletes all ${set.name} ${set.type} records`}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                Delete
                              </Button>
                            )}
                          </div>
                          {rowError ? (
                            <p
                              className="mt-1 max-w-64 truncate text-right text-xs text-red-600 dark:text-red-400"
                              title={rowError}
                            >
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
        </>
      )}
    </Card>
  );
}
