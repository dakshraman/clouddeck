"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  SshGeneratedKey,
  SshGeneratedKeysResponse,
  SshKey,
  SshKeysResponse,
  SshStatusResponse,
} from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { CopyButton } from "@/components/mail/copy-button";
import { Download, KeyRound, Plus, Trash2, TriangleAlert } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

// docs/api.md section 1.9: generated keypair names are `^[a-z0-9][a-z0-9-]{0,31}$`.
const KEY_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,31}$/;

const TEXTAREA_CLASS =
  "h-20 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 p-3 font-mono text-xs leading-relaxed text-slate-200 transition-colors placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50";

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function SshPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<SshStatusResponse | null>(null);
  const [keys, setKeys] = useState<SshKey[] | null>(null);
  const [generated, setGenerated] = useState<SshGeneratedKey[] | null>(null);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [generatedError, setGeneratedError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Add key (paste) form.
  const [addOpen, setAddOpen] = useState(false);
  const [keyLine, setKeyLine] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Authorized keys table.
  const [confirmFingerprint, setConfirmFingerprint] = useState<string | null>(null);
  const [deletingFingerprint, setDeletingFingerprint] = useState<string | null>(null);
  const [keyRowErrors, setKeyRowErrors] = useState<Record<string, string>>({});

  // Generate keypair form + one-time private key notice.
  const [genOpen, setGenOpen] = useState(false);
  const [genName, setGenName] = useState("");
  const [genType, setGenType] = useState<"ed25519" | "rsa">("ed25519");
  const [genComment, setGenComment] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [freshKey, setFreshKey] = useState<SshGeneratedKey | null>(null);
  const [generatedNotice, setGeneratedNotice] = useState<string | null>(null);

  // Generated keys table.
  const [busyGenerated, setBusyGenerated] = useState<string | null>(null);
  const [confirmGenerated, setConfirmGenerated] = useState<string | null>(null);
  const [generatedRowErrors, setGeneratedRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setState("loading");
    setErrorMessage(null);

    const [statusResult, keysResult, generatedResult] = await Promise.allSettled([
      apiFetch<SshStatusResponse>("/api/ssh/status"),
      apiFetch<SshKeysResponse>("/api/ssh/keys"),
      apiFetch<SshGeneratedKeysResponse>("/api/ssh/keys/generated"),
    ]);

    if (statusResult.status === "rejected") {
      setState("error");
      setErrorMessage(errorText(statusResult.reason, "Cannot reach the CloudDeck agent"));
      return;
    }

    setStatus(statusResult.value);

    if (keysResult.status === "fulfilled") {
      setKeys(keysResult.value.keys);
      setKeysError(null);
    } else {
      setKeysError(errorText(keysResult.reason, "Failed to load authorized keys"));
    }

    if (generatedResult.status === "fulfilled") {
      setGenerated(generatedResult.value.keys);
      setGeneratedError(null);
    } else {
      setGeneratedError(errorText(generatedResult.reason, "Failed to load generated keys"));
    }

    setState("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshKeys = useCallback(async () => {
    try {
      setKeys((await apiFetch<SshKeysResponse>("/api/ssh/keys")).keys);
      setKeysError(null);
    } catch (err) {
      setKeysError(errorText(err, "Failed to load authorized keys"));
    }
  }, []);

  const refreshGenerated = useCallback(async () => {
    try {
      setGenerated((await apiFetch<SshGeneratedKeysResponse>("/api/ssh/keys/generated")).keys);
      setGeneratedError(null);
    } catch (err) {
      setGeneratedError(errorText(err, "Failed to load generated keys"));
    }
  }, []);

  async function onAddKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = keyLine.trim();
    if (candidate === "") {
      setAddError("Paste one OpenSSH public key line.");
      return;
    }
    if (/[\r\n]/.test(candidate)) {
      setAddError("Paste exactly one key line, without line breaks.");
      return;
    }
    setAdding(true);
    setAddError(null);
    setNotice(null);
    try {
      const created = await apiPost<{ key: SshKey }>("/api/ssh/keys", { key: candidate });
      setNotice(`Key added${created.key.comment ? ` (${created.key.comment})` : ""}.`);
      setAddOpen(false);
      setKeyLine("");
      await refreshKeys();
    } catch (err) {
      setAddError(errorText(err, "Failed to add the key"));
    } finally {
      setAdding(false);
    }
  }

  async function onDeleteKey(fingerprint: string) {
    setConfirmFingerprint(null);
    setNotice(null);
    setKeyRowErrors((prev) => {
      const next = { ...prev };
      delete next[fingerprint];
      return next;
    });
    setDeletingFingerprint(fingerprint);
    try {
      const remaining = await apiFetch<SshKeysResponse>(
        `/api/ssh/keys?fingerprint=${encodeURIComponent(fingerprint)}`,
        { method: "DELETE" },
      );
      setKeys(remaining.keys);
      setNotice("Key removed.");
    } catch (err) {
      setKeyRowErrors((prev) => ({
        ...prev,
        [fingerprint]: errorText(err, "Delete failed"),
      }));
    } finally {
      setDeletingFingerprint(null);
    }
  }

  async function onGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = genName.trim().toLowerCase();
    if (!KEY_NAME_REGEX.test(name)) {
      setGenError("Use 1-32 characters: start with a letter or number, then lowercase letters, numbers and dashes.");
      return;
    }
    setGenerating(true);
    setGenError(null);
    setGeneratedNotice(null);
    try {
      const created = await apiPost<{ key: SshGeneratedKey }>("/api/ssh/keys/generated", {
        name,
        type: genType,
        comment: genComment.trim(),
      });
      setFreshKey(created.key);
      setGenOpen(false);
      setGenName("");
      setGenComment("");
      setGenType("ed25519");
      await refreshGenerated();
    } catch (err) {
      setGenError(errorText(err, "Failed to generate the keypair"));
    } finally {
      setGenerating(false);
    }
  }

  function onDownloadFresh() {
    if (!freshKey?.privateKey) {
      setGenError("The agent did not return private key material.");
      return;
    }
    downloadText(freshKey.name, freshKey.privateKey.endsWith("\n") ? freshKey.privateKey : `${freshKey.privateKey}\n`);
  }

  async function onDownloadGenerated(name: string, kind: "private" | "public") {
    setGeneratedRowErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setBusyGenerated(`${name}:${kind}`);
    try {
      const { key } = await apiFetch<{ key: SshGeneratedKey }>(
        `/api/ssh/keys/generated/${encodeURIComponent(name)}`,
      );
      if (kind === "private") {
        if (!key.privateKey) {
          throw new Error("The agent returned no private key material");
        }
        downloadText(name, key.privateKey.endsWith("\n") ? key.privateKey : `${key.privateKey}\n`);
      } else {
        downloadText(`${name}.pub`, key.publicKey.endsWith("\n") ? key.publicKey : `${key.publicKey}\n`);
      }
    } catch (err) {
      setGeneratedRowErrors((prev) => ({
        ...prev,
        [name]: errorText(err, "Download failed"),
      }));
    } finally {
      setBusyGenerated(null);
    }
  }

  async function onDeleteGenerated(name: string) {
    setConfirmGenerated(null);
    setGeneratedRowErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setBusyGenerated(`${name}:delete`);
    try {
      const remaining = await apiFetch<SshGeneratedKeysResponse>(
        `/api/ssh/keys/generated/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      setGenerated(remaining.keys);
      if (freshKey?.name === name) setFreshKey(null);
      setGeneratedNotice(`Keypair ${name} deleted.`);
    } catch (err) {
      setGeneratedRowErrors((prev) => ({
        ...prev,
        [name]: errorText(err, "Delete failed"),
      }));
    } finally {
      setBusyGenerated(null);
    }
  }

  const sshCommand = status
    ? `ssh -p ${status.port} ${status.user || "root"}@${status.hostname || "server"}`
    : "";

  return (
    <>
      <PageHeader
        title="SSH"
        description="Authorized keys and generated keypairs for shell access to this server."
      />

      {state === "error" ? (
        <Alert variant="error" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage ?? "Cannot reach the CloudDeck agent"}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {state === "loading" ? (
        <>
          <Skeleton className="h-44" />
          <Skeleton className="mt-6 h-64" />
          <Skeleton className="mt-6 h-64" />
        </>
      ) : null}

      {state === "ready" && status ? (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>SSH access</CardTitle>
                <CardDescription>Public keys allowed to sign in over SSH.</CardDescription>
              </div>
              <Badge variant="indigo">
                {status.user || "root"}@{status.hostname || "this server"}
              </Badge>
            </CardHeader>
            <CardBody className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Hostname</p>
                  <p
                    className="mt-1 truncate font-mono text-sm text-slate-100"
                    title={status.hostname}
                  >
                    {status.hostname || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Port</p>
                  <p className="mt-1 font-mono text-sm text-slate-100">{status.port}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">User</p>
                  <p className="mt-1 truncate font-mono text-sm text-slate-100" title={status.user}>
                    {status.user || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Authorized keys file
                  </p>
                  <p
                    className="mt-1 truncate font-mono text-sm text-slate-100"
                    title={status.keysFile}
                  >
                    {status.keysFile || "—"}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Connect from your machine
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <code className="min-w-0 break-all font-mono text-sm text-slate-200">
                    {sshCommand}
                  </code>
                  <CopyButton value={sshCommand} label="Copy command" />
                </div>
                <p className="text-xs text-slate-500">
                  Authorize a public key below (or generate a keypair), then sign in with the matching
                  private key. Existing non-CloudDeck lines in the keys file are preserved.
                </p>
              </div>
            </CardBody>
          </Card>

          <div className="mt-6">
            <Card className={keys && keys.length > 0 ? "overflow-hidden" : undefined}>
              <CardHeader>
                <div>
                  <CardTitle>Authorized keys</CardTitle>
                  <CardDescription>
                    {keys === null
                      ? "Reading the authorized_keys file…"
                      : `${keys.length} key${keys.length === 1 ? "" : "s"} in ${status.keysFile || "the keys file"}.`}
                  </CardDescription>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAddOpen(true);
                    setAddError(null);
                    setNotice(null);
                  }}
                  disabled={addOpen}
                >
                  <Plus size={14} aria-hidden="true" />
                  Add key
                </Button>
              </CardHeader>

              {addOpen ? (
                <form
                  onSubmit={onAddKey}
                  className="mx-5 mt-4 grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 sm:max-w-md"
                >
                  <div className="grid gap-1.5">
                    <Label htmlFor="ssh-public-key">Public key</Label>
                    <textarea
                      id="ssh-public-key"
                      value={keyLine}
                      onChange={(event) => setKeyLine(event.target.value)}
                      placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI… you@laptop"
                      spellCheck={false}
                      autoComplete="off"
                      autoFocus
                      disabled={adding}
                      aria-label="Public key"
                      className={TEXTAREA_CLASS}
                    />
                    <p className="text-xs text-slate-500">
                      One line from e.g. ~/.ssh/id_ed25519.pub: type, base64 blob and an optional
                      comment.
                    </p>
                  </div>
                  {addError ? <Alert variant="error">{addError}</Alert> : null}
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm" loading={adding}>
                      Add key
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAddOpen(false);
                        setAddError(null);
                        setKeyLine("");
                      }}
                      disabled={adding}
                    >
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

              {keysError && keys === null ? (
                <CardBody>
                  <Alert variant="error">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>{keysError}</span>
                      <Button variant="secondary" size="sm" onClick={() => void refreshKeys()}>
                        Retry
                      </Button>
                    </div>
                  </Alert>
                </CardBody>
              ) : keys === null ? (
                <CardBody className="grid gap-3">
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                </CardBody>
              ) : keys.length === 0 ? (
                <CardBody>
                  <EmptyState
                    icon={KeyRound}
                    title="No authorized keys"
                    description="Paste an existing public key or generate a keypair below."
                  />
                </CardBody>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-5 py-3 text-left font-medium">Type</th>
                        <th className="px-5 py-3 text-left font-medium">Fingerprint</th>
                        <th className="px-5 py-3 text-left font-medium">Comment</th>
                        <th className="px-5 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => {
                        const isDeleting = deletingFingerprint === key.fingerprint;
                        const isConfirming = confirmFingerprint === key.fingerprint;
                        const rowError = keyRowErrors[key.fingerprint];
                        return (
                          <tr
                            key={key.fingerprint}
                            className="border-t border-slate-800 hover:bg-slate-800/40"
                          >
                            <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-300">
                              {key.type}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className="block max-w-64 truncate font-mono text-xs text-slate-400"
                                title={key.fingerprint}
                              >
                                {key.fingerprint}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-slate-300">{key.comment || "—"}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center justify-end gap-2">
                                {isDeleting ? (
                                  <span className="flex items-center gap-2 text-xs text-slate-400">
                                    <Spinner size={14} className="text-slate-400" />
                                    deleting…
                                  </span>
                                ) : isConfirming ? (
                                  <>
                                    <span className="text-xs text-slate-400">Delete?</span>
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() => void onDeleteKey(key.fingerprint)}
                                    >
                                      Confirm
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setConfirmFingerprint(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-slate-400 hover:text-red-400"
                                    onClick={() => setConfirmFingerprint(key.fingerprint)}
                                    aria-label={`Delete key ${key.fingerprint}`}
                                  >
                                    <Trash2 size={14} aria-hidden="true" />
                                    Delete
                                  </Button>
                                )}
                              </div>
                              {rowError ? (
                                <p
                                  className="mt-1 max-w-64 truncate text-right text-xs text-red-400"
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
            </Card>
          </div>

          <div className="mt-6">
            <Card className={generated && generated.length > 0 ? "overflow-hidden" : undefined}>
              <CardHeader>
                <div>
                  <CardTitle>Generated keys</CardTitle>
                  <CardDescription>
                    Keypairs created by the agent under{" "}
                    <span className="font-mono text-slate-400">{status.keyDir || "the key directory"}</span>.
                  </CardDescription>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setGenOpen(true);
                    setGenError(null);
                  }}
                  disabled={genOpen}
                >
                  <Plus size={14} aria-hidden="true" />
                  Generate keypair
                </Button>
              </CardHeader>

              {genOpen ? (
                <form
                  onSubmit={onGenerate}
                  className="mx-5 mt-4 grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 sm:max-w-md"
                >
                  <div className="grid gap-1.5">
                    <Label htmlFor="ssh-key-name">Key name</Label>
                    <Input
                      id="ssh-key-name"
                      value={genName}
                      onChange={(event) => setGenName(event.target.value)}
                      placeholder="laptop-2026"
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus
                      disabled={generating}
                      className="font-mono"
                    />
                    <p className="text-xs text-slate-500">
                      Start with a letter or number, then lowercase letters, numbers and dashes - 1 to
                      32 characters.
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ssh-key-type">Type</Label>
                    <Select
                      id="ssh-key-type"
                      value={genType}
                      onChange={(event) =>
                        setGenType(event.target.value === "rsa" ? "rsa" : "ed25519")
                      }
                      disabled={generating}
                    >
                      <option value="ed25519">ed25519</option>
                      <option value="rsa">rsa</option>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ssh-key-comment">Comment (optional)</Label>
                    <Input
                      id="ssh-key-comment"
                      value={genComment}
                      onChange={(event) => setGenComment(event.target.value)}
                      placeholder="you@laptop"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={generating}
                    />
                  </div>
                  {genError ? <Alert variant="error">{genError}</Alert> : null}
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm" loading={generating}>
                      Generate
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setGenOpen(false);
                        setGenError(null);
                      }}
                      disabled={generating}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}

              {freshKey ? (
                <div className="mx-5 mt-4 grid gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-start gap-2.5">
                    <TriangleAlert
                      size={16}
                      className="mt-0.5 shrink-0 text-amber-400"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium text-amber-300">
                        Private key for {freshKey.name}
                      </p>
                      <p className="mt-0.5 text-xs text-amber-200/70">
                        Download or copy it now and store it safely. The keypair stays listed below,
                        where the private half can be downloaded again.
                      </p>
                    </div>
                  </div>
                  {freshKey.privateKey ? (
                    <pre className="max-h-44 overflow-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
                      {freshKey.privateKey}
                    </pre>
                  ) : (
                    <Alert variant="warning">The agent did not return private key material.</Alert>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={onDownloadFresh} disabled={!freshKey.privateKey}>
                      <Download size={14} aria-hidden="true" />
                      Download private key
                    </Button>
                    {freshKey.privateKey ? (
                      <CopyButton value={freshKey.privateKey} label="Copy private key" />
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => setFreshKey(null)}>
                      Dismiss
                    </Button>
                  </div>
                  <div className="grid gap-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Public key
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                      <code
                        className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300"
                        title={freshKey.publicKey}
                      >
                        {freshKey.publicKey}
                      </code>
                      <CopyButton value={freshKey.publicKey} label="Copy public key" />
                    </div>
                  </div>
                </div>
              ) : null}

              {generatedNotice ? (
                <div className="px-5 pt-4">
                  <Alert variant="success">{generatedNotice}</Alert>
                </div>
              ) : null}

              {generatedError && generated === null ? (
                <CardBody>
                  <Alert variant="error">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>{generatedError}</span>
                      <Button variant="secondary" size="sm" onClick={() => void refreshGenerated()}>
                        Retry
                      </Button>
                    </div>
                  </Alert>
                </CardBody>
              ) : generated === null ? (
                <CardBody className="grid gap-3">
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                </CardBody>
              ) : generated.length === 0 ? (
                <CardBody>
                  <EmptyState
                    icon={KeyRound}
                    title="No generated keys"
                    description="Create a keypair here, add its public half to the authorized keys, and download the private half once."
                  />
                </CardBody>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-5 py-3 text-left font-medium">Name</th>
                        <th className="px-5 py-3 text-left font-medium">Type</th>
                        <th className="px-5 py-3 text-left font-medium">Fingerprint</th>
                        <th className="px-5 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generated.map((key) => {
                        const isBusy = busyGenerated !== null;
                        const isDeleting = busyGenerated === `${key.name}:delete`;
                        const isConfirming = confirmGenerated === key.name;
                        const rowError = generatedRowErrors[key.name];
                        return (
                          <tr
                            key={key.name}
                            className="border-t border-slate-800 hover:bg-slate-800/40"
                          >
                            <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-200">
                              {key.name}
                            </td>
                            <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-300">
                              {key.type}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className="block max-w-64 truncate font-mono text-xs text-slate-400"
                                title={key.fingerprint}
                              >
                                {key.fingerprint}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  loading={busyGenerated === `${key.name}:private`}
                                  disabled={isBusy && busyGenerated !== `${key.name}:private`}
                                  onClick={() => void onDownloadGenerated(key.name, "private")}
                                >
                                  {busyGenerated === `${key.name}:private` ? null : (
                                    <Download size={14} aria-hidden="true" />
                                  )}
                                  Download private
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  loading={busyGenerated === `${key.name}:public`}
                                  disabled={isBusy && busyGenerated !== `${key.name}:public`}
                                  onClick={() => void onDownloadGenerated(key.name, "public")}
                                >
                                  {busyGenerated === `${key.name}:public` ? null : (
                                    <Download size={14} aria-hidden="true" />
                                  )}
                                  Download public
                                </Button>
                                {isDeleting ? (
                                  <span className="flex items-center gap-2 text-xs text-slate-400">
                                    <Spinner size={14} className="text-slate-400" />
                                    deleting…
                                  </span>
                                ) : isConfirming ? (
                                  <>
                                    <span className="text-xs text-slate-400">Delete?</span>
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() => void onDeleteGenerated(key.name)}
                                    >
                                      Confirm
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setConfirmGenerated(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-slate-400 hover:text-red-400"
                                    disabled={isBusy}
                                    onClick={() => setConfirmGenerated(key.name)}
                                    aria-label={`Delete keypair ${key.name}`}
                                  >
                                    <Trash2 size={14} aria-hidden="true" />
                                    Delete
                                  </Button>
                                )}
                              </div>
                              {rowError ? (
                                <p
                                  className="mt-1 max-w-64 truncate text-right text-xs text-red-400"
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
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
