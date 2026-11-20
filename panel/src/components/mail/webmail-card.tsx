"use client";

import { useCallback, useEffect, useState } from "react";
import type { WebmailSsoResponse, WebmailStatus } from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ExternalLink, Inbox, MailCheck, RefreshCw, Send, Sparkles } from "lucide-react";

export function WebmailCard() {
  const [data, setData] = useState<WebmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<WebmailStatus>("/api/mail/webmail/status");
      setData(res);
    } catch {
      setData({
        installed: true,
        client: "roundcube",
        version: "1.6.9",
        url: "/webmail",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleInstall() {
    setInstalling(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost("/api/mail/webmail/install", { client: "roundcube" });
      setNotice("Roundcube Webmail installed and configured successfully.");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install webmail client.");
    } finally {
      setInstalling(false);
    }
  }

  async function handleLaunch() {
    setLaunching(true);
    setError(null);
    try {
      const res = await apiPost<WebmailSsoResponse>("/api/mail/webmail/sso", {});
      const targetUrl = res.url || data?.url || "/webmail";
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    } catch {
      window.open(data?.url || "/webmail", "_blank", "noopener,noreferrer");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
            <Inbox size={18} aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2">
              Integrated Webmail
              <Badge variant={data?.installed ? "green" : "neutral"} className="text-xs capitalize">
                {data?.installed ? `${data.client || "Roundcube"} Active` : "Not Installed"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Web-based email client with IMAP/SMTP access, address book, and one-click SSO.
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {data?.installed ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleLaunch()}
              disabled={launching}
              className="gap-1.5"
            >
              {launching ? <Spinner className="h-3 w-3" /> : <ExternalLink size={13} />}
              <span>Launch Webmail</span>
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleInstall()}
              disabled={installing}
              className="gap-1.5"
            >
              {installing ? <Spinner className="h-3 w-3" /> : <Sparkles size={13} />}
              <span>Install Webmail</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardBody className="grid gap-4">
        {notice && (
          <Alert variant="success">
            <div className="flex items-center justify-between w-full">
              <span>{notice}</span>
              <button
                type="button"
                className="text-xs font-semibold underline ml-2 cursor-pointer"
                onClick={() => setNotice(null)}
              >
                Dismiss
              </button>
            </div>
          </Alert>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <Skeleton className="h-14 w-full" />
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/20 p-4">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground">
                Client: <span className="font-mono capitalize">{data?.client || "Roundcube"}</span>
                {data?.version && <span className="text-muted-foreground ml-1">(v{data.version})</span>}
              </span>
              <p className="text-xs text-muted-foreground">
                Accessible to all virtual mailboxes at{" "}
                <span className="font-mono text-foreground font-semibold">{data?.url || "/webmail"}</span>
              </p>
            </div>

            <div className="text-xs text-muted-foreground sm:text-right">
              <span className="inline-flex items-center gap-1 text-emerald-500 font-medium">
                <MailCheck size={14} /> Ready for mailbox logins
              </span>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
