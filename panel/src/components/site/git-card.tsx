"use client";

import { useCallback, useEffect, useState } from "react";
import type { DeployRecord, GitConfig } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { copyText } from "@/components/mail/copy-button";
import {
  Check,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Key,
  Play,
  RefreshCw,
  Settings,
  Terminal,
  Trash2,
  User,
  Webhook,
  X,
  Zap,
} from "lucide-react";

interface GitCardProps {
  domain: string;
}

const PRESETS = [
  {
    name: "Next.js",
    cmd: "npm install && npm run build",
    desc: "Install dependencies & compile Next.js production build",
  },
  {
    name: "Laravel",
    cmd: "composer install --no-dev --prefer-dist && php artisan config:cache && php artisan route:cache && php artisan migrate --force",
    desc: "Composer dependencies, production caching & migrations",
  },
  {
    name: "Django / Python",
    cmd: "pip install -r requirements.txt && python manage.py migrate --no-input",
    desc: "Pip requirements & database migrations",
  },
  {
    name: "Static / None",
    cmd: "",
    desc: "Pure static HTML/CSS/JS (no build step)",
  },
];

export function GitCard({ domain }: GitCardProps) {
  const [git, setGit] = useState<GitConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeLog, setActiveLog] = useState<DeployRecord | null>(null);

  // Form states
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [buildCommand, setBuildCommand] = useState("");
  const [autoDeploy, setAutoDeploy] = useState(true);

  const loadGit = useCallback(async () => {
    try {
      const data = await apiFetch<GitConfig>(`/api/sites/${encodeURIComponent(domain)}/git`);
      setGit(data);
      if (data.repoUrl) {
        setRepoUrl(data.repoUrl);
        setBranch(data.branch || "main");
        setBuildCommand(data.buildCommand || "");
        setAutoDeploy(data.autoDeploy ?? true);
      }
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load Git configuration";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void loadGit();
  }, [loadGit]);

  async function handleCopy(key: string, text: string) {
    if (!text) return;
    const ok = await copyText(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!repoUrl.trim()) {
      setError("Repository URL is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await apiFetch<GitConfig>(`/api/sites/${encodeURIComponent(domain)}/git`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          branch: branch.trim() || "main",
          buildCommand: buildCommand.trim(),
          autoDeploy,
        }),
      });
      setGit(updated);
      setShowSettings(false);
      setSuccess("Git repository settings saved successfully.");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save Git configuration";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeployNow() {
    if (!git?.repoUrl || deploying) return;
    setDeploying(true);
    setError(null);

    try {
      const record = await apiPost<DeployRecord>(
        `/api/sites/${encodeURIComponent(domain)}/git/deploy`,
        {},
      );
      if (record.status === "failed") {
        setError(`Deployment failed: ${record.commitMsg || "build process error"}`);
      } else {
        setSuccess(`Deployment succeeded for commit ${record.commitHash?.slice(0, 7) || ""}`);
        setTimeout(() => setSuccess(null), 5000);
      }
      await loadGit();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deployment failed";
      setError(msg);
      await loadGit();
    } finally {
      setDeploying(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm(`Are you sure you want to disconnect Git repository from ${domain}? Existing site files will remain untouched.`)) {
      return;
    }
    setDisconnecting(true);
    setError(null);

    try {
      await apiFetch(`/api/sites/${encodeURIComponent(domain)}/git`, {
        method: "DELETE",
      });
      setGit((prev) => (prev ? { ...prev, repoUrl: "", branch: "main", buildCommand: "", autoDeploy: false } : null));
      setRepoUrl("");
      setBranch("main");
      setBuildCommand("");
      setAutoDeploy(true);
      setShowSettings(false);
      setSuccess("Git repository disconnected.");
      setTimeout(() => setSuccess(null), 4000);
      await loadGit();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to disconnect repository";
      setError(msg);
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isConfigured = Boolean(git?.repoUrl);
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/git/${domain}` : `/api/webhooks/git/${domain}`;

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="error">
          <p>{error}</p>
        </Alert>
      ) : null}

      {success ? (
        <Alert variant="success">
          <p>{success}</p>
        </Alert>
      ) : null}

      {/* Main Git Repository Card */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <GitBranch className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>Git & CI/CD Deployment</CardTitle>
              <CardDescription>
                Deploy code directly from GitHub, GitLab, Bitbucket, or any Git remote repository.
              </CardDescription>
            </div>
          </div>
          {isConfigured && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="mr-1.5 h-3.5 w-3.5" />
                {showSettings ? "Hide Settings" : "Configure"}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDeployNow}
                disabled={deploying}
              >
                {deploying ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                )}
                {deploying ? "Deploying..." : "Deploy Now"}
              </Button>
            </div>
          )}
        </CardHeader>

        <CardBody className="space-y-6">
          {isConfigured && !showSettings ? (
            /* Connected Repository Overview */
            <div className="space-y-6">
              <div className="rounded-lg border border-border bg-card/60 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {git?.repoUrl}
                      </span>
                      <Badge variant="indigo">
                        <GitBranch className="mr-1 h-3 w-3" />
                        {git?.branch || "main"}
                      </Badge>
                      <Badge
                        variant={
                          git?.lastDeployStatus === "succeeded"
                            ? "green"
                            : git?.lastDeployStatus === "failed"
                              ? "red"
                              : git?.lastDeployStatus === "deploying"
                                ? "indigo"
                                : "neutral"
                        }
                      >
                        {git?.lastDeployStatus ? git.lastDeployStatus.toUpperCase() : "IDLE"}
                      </Badge>
                    </div>
                    {git?.buildCommand ? (
                      <p className="font-mono text-xs text-muted-foreground">
                        Build: <span className="text-foreground">{git.buildCommand}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Build command: <span className="italic">None (static deployment)</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Disconnect
                    </Button>
                  </div>
                </div>

                {git?.lastCommitHash && (
                  <div className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <GitCommit className="h-3.5 w-3.5 text-brand" />
                        <span className="font-mono font-medium text-foreground">
                          {git.lastCommitHash.slice(0, 7)}
                        </span>
                        <span>{git.lastCommitMsg || "Updated code"}</span>
                      </div>
                      {git.lastCommitAuthor && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>{git.lastCommitAuthor}</span>
                        </div>
                      )}
                      {git.lastDeployAt && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(git.lastDeployAt).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Webhook Automation Box */}
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-brand" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Continuous Deployment Webhook (CI/CD)
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Trigger automatic deployments instantly when code is pushed to your Git repository.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Payload URL
                    </label>
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={webhookUrl}
                        className="w-full rounded border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-hidden"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopy("webhook_url", webhookUrl)}
                        title="Copy Webhook URL"
                      >
                        {copiedKey === "webhook_url" ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Secret Token
                    </label>
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        type="password"
                        readOnly
                        value={git?.webhookSecret || ""}
                        className="w-full rounded border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-hidden"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopy("webhook_secret", git?.webhookSecret || "")}
                        title="Copy Secret Token"
                      >
                        {copiedKey === "webhook_secret" ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded border border-border/80 bg-background/50 p-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">GitHub Webhook Setup:</span>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    <li>Go to repository <strong>Settings → Webhooks → Add webhook</strong>.</li>
                    <li>Paste the <strong>Payload URL</strong> and choose <code>application/json</code> as Content type.</li>
                    <li>Paste the <strong>Secret</strong> into the Secret field.</li>
                    <li>Select <strong>Just the push event</strong> and click <strong>Add webhook</strong>.</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            /* Unconfigured Setup Form OR Edit Settings Form */
            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground">
                    Repository URL <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Supports HTTPS or SSH (e.g. <code>git@github.com:user/project.git</code> or <code>https://github.com/user/project.git</code>)
                  </p>
                  <input
                    type="text"
                    required
                    placeholder="git@github.com:user/repository.git"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-brand focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Target Branch
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Branch to track and deploy
                  </p>
                  <input
                    type="text"
                    required
                    placeholder="main"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-brand focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Build Command & Presets */}
              <div className="space-y-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <label className="text-xs font-semibold text-foreground">
                      Build & Deployment Command (Optional)
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Executed in site root on every deployment before activating code.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Presets:</span>
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => setBuildCommand(preset.cmd)}
                        className="rounded border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
                        title={preset.desc}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="npm install && npm run build"
                  value={buildCommand}
                  onChange={(e) => setBuildCommand(e.target.value)}
                  className="w-full rounded border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-brand focus:outline-hidden"
                />
              </div>

              {/* Auto Deploy Toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoDeployCheckbox"
                  checked={autoDeploy}
                  onChange={(e) => setAutoDeploy(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                />
                <label htmlFor="autoDeployCheckbox" className="text-xs font-medium text-foreground">
                  Enable automatic deployment on Git push via Webhook
                </label>
              </div>

              {/* SSH Deploy Key Box */}
              {git?.deployKeyPublic && (
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-brand" />
                      <span className="text-xs font-semibold text-foreground">
                        Dedicated SSH Deploy Key (Ed25519)
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCopy("deploy_key", git.deployKeyPublic || "")}
                    >
                      {copiedKey === "deploy_key" ? (
                        <>
                          <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          Copy Public Key
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    For private Git repositories, add this public key under your repo&apos;s Deploy Keys:
                  </p>
                  <pre className="overflow-x-auto rounded border border-border bg-background p-2.5 font-mono text-[11px] text-muted-foreground">
                    {git.deployKeyPublic}
                  </pre>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                {isConfigured && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowSettings(false)}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={saving}
                >
                  {saving ? (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {saving ? "Saving..." : isConfigured ? "Update Git Configuration" : "Save & Connect Repository"}
                </Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>

      {/* Deployment History Table */}
      {isConfigured && git?.history && git.history.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Deployment History</CardTitle>
                <CardDescription>
                  Recent automated and manual deployment executions for {domain}.
                </CardDescription>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadGit}
                title="Refresh deployment history"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Commit</th>
                    <th className="px-4 py-3">Trigger</th>
                    <th className="px-4 py-3">Author</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {git.history.map((record) => (
                    <tr key={record.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            record.status === "succeeded"
                              ? "green"
                              : record.status === "failed"
                                ? "red"
                                : "indigo"
                          }
                        >
                          {record.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-mono font-medium text-foreground">
                            {record.commitHash ? record.commitHash.slice(0, 7) : "—"}
                          </span>
                          <span className="truncate max-w-[200px] text-muted-foreground text-[11px]" title={record.commitMsg}>
                            {record.commitMsg || "No message"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="neutral">
                          {record.trigger === "webhook" ? "Webhook (Push)" : "Manual"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {record.author || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(record.startedAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {record.durationMs ? `${(record.durationMs / 1000).toFixed(1)}s` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {record.logs ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setActiveLog(record)}
                          >
                            <Terminal className="mr-1 h-3 w-3" />
                            Logs
                          </Button>
                        ) : (
                          <span className="text-muted-foreground/50 text-[11px]">No logs</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Build Logs Modal */}
      {activeLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-brand" />
                <h3 className="text-sm font-semibold text-foreground">
                  Deployment Logs — Commit {activeLog.commitHash?.slice(0, 7) || activeLog.id}
                </h3>
                <Badge
                  variant={activeLog.status === "succeeded" ? "green" : "red"}
                >
                  {activeLog.status}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => setActiveLog(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="rounded bg-black/90 p-4 font-mono text-xs text-emerald-400 whitespace-pre-wrap selection:bg-emerald-800">
                {activeLog.logs || "No output recorded."}
              </pre>
            </div>
            <div className="flex items-center justify-between border-t border-border p-3 text-xs text-muted-foreground bg-muted/20">
              <span>
                Started: {new Date(activeLog.startedAt).toLocaleString()} ({activeLog.durationMs ? `${(activeLog.durationMs / 1000).toFixed(1)}s` : "0s"})
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCopy("log_text", activeLog.logs || "")}
              >
                {copiedKey === "log_text" ? "Copied" : "Copy Output"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
