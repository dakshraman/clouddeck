"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { MailAutoresponder } from "@/lib/types";
import { HttpError, apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LOCAL_PART_PATTERN, buildEmail } from "@/components/mail/mail-utils";
import { Mail, Trash2 } from "lucide-react";

interface AutorespondersCardProps {
  domains: string[] | null;
}

export function AutorespondersCard({ domains }: AutorespondersCardProps) {
  const [localPart, setLocalPart] = useState("");
  const [domain, setDomain] = useState("");
  const [loadedEmail, setLoadedEmail] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Default the domain select to the first listed domain.
  useEffect(() => {
    if (domains && domains.length > 0 && !domains.includes(domain)) {
      setDomain(domains[0]);
    }
  }, [domains, domain]);

  function resetEditor() {
    setLoadedEmail(null);
    setNotConfigured(false);
    setSubject("");
    setBody("");
    setEnabled(true);
    setConfirmDelete(false);
  }

  async function onLoad(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidateLocal = localPart.trim().toLowerCase();
    if (!LOCAL_PART_PATTERN.test(candidateLocal)) {
      setLoadError(
        "Enter a mailbox local part like info (lowercase letters, numbers, dots, underscores and hyphens).",
      );
      return;
    }
    if (!domain) {
      setLoadError("Select a domain.");
      return;
    }

    const email = buildEmail(candidateLocal, domain);
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setDeleteError(null);
    setNotice(null);
    setConfirmDelete(false);
    try {
      const data = await apiFetch<MailAutoresponder>(
        `/api/mail/autoresponders/${encodeURIComponent(email)}`,
      );
      setSubject(data.subject);
      setBody(data.body);
      setEnabled(data.enabled);
      setLoadedEmail(email);
      setNotConfigured(false);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        // Not configured yet: empty fields, ready for an upsert.
        setSubject("");
        setBody("");
        setEnabled(true);
        setLoadedEmail(email);
        setNotConfigured(true);
      } else {
        setLoadError(err instanceof Error ? err.message : "Failed to load the autoresponder");
      }
    } finally {
      setLoading(false);
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loadedEmail) return;

    setSaving(true);
    setSaveError(null);
    setDeleteError(null);
    setNotice(null);
    try {
      const data = await apiFetch<MailAutoresponder>(
        `/api/mail/autoresponders/${encodeURIComponent(loadedEmail)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, body, enabled }),
        },
      );
      setSubject(data.subject);
      setBody(data.body);
      setEnabled(data.enabled);
      setNotConfigured(false);
      setNotice(`Autoresponder saved for ${data.email}.`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save the autoresponder");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!loadedEmail) return;
    setConfirmDelete(false);
    setDeleting(true);
    setDeleteError(null);
    setSaveError(null);
    setNotice(null);
    try {
      await apiFetch<{ email: string; deleted: boolean }>(
        `/api/mail/autoresponders/${encodeURIComponent(loadedEmail)}`,
        { method: "DELETE" },
      );
      setNotice(`Autoresponder deleted for ${loadedEmail}.`);
      setSubject("");
      setBody("");
      setEnabled(true);
      setNotConfigured(true);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const noDomains = domains !== null && domains.length === 0;

  return (
    <Card className={loadedEmail ? "overflow-hidden" : undefined}>
      <CardHeader>
        <div>
          <CardTitle>Autoresponders</CardTitle>
          <CardDescription>
            Vacation replies for one mailbox. Load a mailbox to see or edit its reply.
          </CardDescription>
        </div>
      </CardHeader>

      <div className={loadedEmail ? "px-5 pt-4" : "px-5 pb-5 pt-4"}>
        {noDomains ? (
          <p className="text-sm text-muted-foreground">
            Add a mail domain first to configure a reply for one of its mailboxes.
          </p>
        ) : domains === null ? (
          <p className="text-sm text-muted-foreground">Loading mail domains…</p>
        ) : (
          <form onSubmit={onLoad} className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="autoresponder-local">Mailbox</Label>
              <Input
                id="autoresponder-local"
                value={localPart}
                onChange={(event) => setLocalPart(event.target.value)}
                placeholder="info"
                autoComplete="off"
                spellCheck={false}
                disabled={loading}
                className="w-48 font-mono"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="autoresponder-domain">Domain</Label>
              <Select
                id="autoresponder-domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                disabled={loading}
                className="w-56"
              >
                {domains.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary" size="sm" loading={loading}>
              Load
            </Button>
            <p className="text-xs text-muted-foreground">
              Address:{" "}
              <span className="font-mono">
                {localPart.trim() === "" ? "local" : localPart.trim().toLowerCase()}@
                {domain || "domain"}
              </span>
            </p>
          </form>
        )}
      </div>

      {loadError ? (
        <div className="px-5 pt-4">
          <Alert variant="error">{loadError}</Alert>
        </div>
      ) : null}

      {loadedEmail ? (
        <div className="px-5 pb-5 pt-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Mail size={14} className="text-muted-foreground" aria-hidden="true" />
            <span className="font-mono text-sm text-foreground">{loadedEmail}</span>
            {notConfigured ? (
              <Badge variant="neutral">Not configured</Badge>
            ) : (
              <Badge variant={enabled ? "green" : "amber"}>
                {enabled ? "Enabled" : "Disabled"}
              </Badge>
            )}
          </div>

          {notConfigured ? (
            <Alert variant="info" className="mb-4">
              No autoresponder is configured for this mailbox yet. Fill in the fields and Save to
              create one.
            </Alert>
          ) : null}

          <form onSubmit={onSave} className="grid gap-4">
            <div className="grid gap-1.5 sm:max-w-xl">
              <Label htmlFor="autoresponder-subject">Subject</Label>
              <Input
                id="autoresponder-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Away from the office"
                autoComplete="off"
                spellCheck={false}
                disabled={saving || deleting}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="autoresponder-body">Message</Label>
              <textarea
                id="autoresponder-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Thanks for your message. I am away and will reply when I am back."
                spellCheck={false}
                disabled={saving || deleting}
                aria-label="Autoresponder message"
                className="h-40 w-full resize-y rounded-lg border border-input bg-background/60 p-3 font-mono text-xs leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                Plain text; sent once per sender while the autoresponder is enabled.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground/80">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                disabled={saving || deleting}
                className="h-4 w-4 cursor-pointer rounded border-input bg-background/60 accent-brand"
              />
              Enabled
            </label>

            {saveError ? <Alert variant="error">{saveError}</Alert> : null}
            {deleteError ? <Alert variant="error">{deleteError}</Alert> : null}
            {notice ? <Alert variant="success">{notice}</Alert> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" loading={saving} disabled={deleting}>
                Save
              </Button>
              {confirmDelete ? (
                <>
                  <span className="text-xs text-muted-foreground">Delete autoresponder?</span>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => void onDelete()}
                    disabled={saving}
                  >
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-red-400"
                    onClick={() => setConfirmDelete(true)}
                    disabled={saving || deleting || notConfigured}
                    title={
                      notConfigured ? "No autoresponder to delete" : "Delete this autoresponder"
                    }
                  >
                    {deleting ? null : <Trash2 size={14} aria-hidden="true" />}
                    {deleting ? "Deleting…" : "Delete"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetEditor}
                    disabled={saving || deleting}
                  >
                    Close
                  </Button>
                </>
              )}
            </div>
          </form>
        </div>
      ) : null}
    </Card>
  );
}
