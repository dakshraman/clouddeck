"use client";

import { useCallback, useEffect, useState } from "react";
import type { DoctorIssue, FixSiteIssueResponse, SiteDiagnosis } from "@/lib/types";
import { apiFetch, apiPost, HttpError } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/components/ui/cn";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  Sparkles,
  Wrench,
} from "lucide-react";

interface SiteDoctorCardProps {
  domain: string;
}

function getScoreColor(score: number): {
  stroke: string;
  text: string;
  bg: string;
  badge: "green" | "amber" | "red";
  label: string;
} {
  if (score >= 85) {
    return {
      stroke: "text-emerald-500",
      text: "text-emerald-500",
      bg: "bg-emerald-500/10",
      badge: "green",
      label: "Healthy",
    };
  }
  if (score >= 60) {
    return {
      stroke: "text-amber-500",
      text: "text-amber-500",
      bg: "bg-amber-500/10",
      badge: "amber",
      label: "Needs Attention",
    };
  }
  return {
    stroke: "text-red-500",
    text: "text-red-500",
    bg: "bg-red-500/10",
    badge: "red",
    label: "Critical Issues",
  };
}

function IssueSeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return <AlertCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />;
    case "info":
    default:
      return <Info className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />;
  }
}

function IssueSeverityBadge({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return <Badge variant="red">Critical</Badge>;
    case "warning":
      return <Badge variant="amber">Warning</Badge>;
    case "info":
    default:
      return <Badge variant="neutral">Info</Badge>;
  }
}

export function SiteDoctorCard({ domain }: SiteDoctorCardProps) {
  const [diagnosis, setDiagnosis] = useState<SiteDiagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixingIssueId, setFixingIssueId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchDiagnosis = useCallback(
    async (isManual = false) => {
      if (isManual) setScanning(true);
      setError(null);
      try {
        const res = await apiPost<SiteDiagnosis>(`/api/sites/${encodeURIComponent(domain)}/doctor`, {});
        setDiagnosis(res);
      } catch (err) {
        // Fallback to GET if POST was rejected
        try {
          const res = await apiFetch<SiteDiagnosis>(`/api/sites/${encodeURIComponent(domain)}/doctor`);
          setDiagnosis(res);
        } catch (fetchErr) {
          const msg =
            fetchErr instanceof HttpError
              ? fetchErr.message
              : err instanceof Error
              ? err.message
              : "Failed to run site diagnosis";
          setError(msg);
        }
      } finally {
        setLoading(false);
        if (isManual) setScanning(false);
      }
    },
    [domain],
  );

  useEffect(() => {
    void fetchDiagnosis(false);
  }, [fetchDiagnosis]);

  async function handleAutoFix(issue: DoctorIssue) {
    if (!issue.fixType) return;
    setFixingIssueId(issue.id);
    setToastMessage(null);
    try {
      const res = await apiPost<FixSiteIssueResponse>(
        `/api/sites/${encodeURIComponent(domain)}/doctor/fix`,
        { fixType: issue.fixType },
      );
      setToastMessage({
        type: "success",
        text: res.message || `Successfully resolved "${issue.title}".`,
      });
      // Re-scan site after fix
      await fetchDiagnosis(false);
    } catch (err) {
      setToastMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to apply auto-fix",
      });
    } finally {
      setFixingIssueId(null);
    }
  }

  const score = diagnosis?.healthScore ?? 100;
  const scoreInfo = getScoreColor(score);
  const issues = diagnosis?.issues ?? [];
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  // Circular progress calculation
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-brand shrink-0" aria-hidden="true" />
          <div>
            <CardTitle className="flex items-center gap-2">
              Site Doctor
              {diagnosis && (
                <Badge variant={scoreInfo.badge} className="text-xs">
                  {scoreInfo.label}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Autonomous diagnostics and 1-click self-healing for web, SSL, and runtime issues.
            </CardDescription>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchDiagnosis(true)}
          disabled={loading || scanning}
          className="shrink-0"
        >
          <RefreshCw
            size={14}
            className={cn("mr-1.5", scanning && "animate-spin text-brand")}
            aria-hidden="true"
          />
          {scanning ? "Scanning..." : "Diagnose Now"}
        </Button>
      </CardHeader>

      <CardBody className="grid gap-5">
        {toastMessage && (
          <Alert variant={toastMessage.type === "success" ? "success" : "error"}>
            <div className="flex items-center justify-between w-full">
              <span>{toastMessage.text}</span>
              <button
                type="button"
                className="text-xs font-semibold underline ml-2 cursor-pointer"
                onClick={() => setToastMessage(null)}
              >
                Dismiss
              </button>
            </div>
          </Alert>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div className="grid gap-3">
            <div className="flex items-center gap-4">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            {/* Health Score Overview */}
            <div className="flex flex-col sm:flex-row items-center gap-6 rounded-lg border border-border/60 bg-muted/20 p-4">
              {/* Circular Health Score */}
              <div className="relative flex items-center justify-center shrink-0">
                <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    className="stroke-muted/40"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    className={cn("transition-all duration-700 ease-out", scoreInfo.stroke)}
                    strokeWidth="7"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn("text-xl font-bold tracking-tight", scoreInfo.text)}>
                    {score}
                  </span>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">Score</span>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="flex-1 text-center sm:text-left space-y-1">
                <h4 className="text-sm font-semibold text-foreground">
                  {score === 100
                    ? "Perfect Health"
                    : `${issues.length} ${issues.length === 1 ? "Issue" : "Issues"} Detected`}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {issues.length === 0
                    ? "Nginx configuration, SSL certificates, socket endpoints, and runtime dependencies are verified."
                    : `Found ${criticalCount} critical and ${warningCount} warning conditions affecting site reliability.`}
                </p>
                {diagnosis?.checkedAt && (
                  <p className="text-[11px] text-muted-foreground/80 pt-1 font-mono">
                    Last diagnosed: {new Date(diagnosis.checkedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {/* Issues List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Diagnosed Checks
                </span>
                <span className="text-xs text-muted-foreground">
                  {issues.length} {issues.length === 1 ? "item" : "items"}
                </span>
              </div>

              {issues.length === 0 ? (
                <div className="flex items-center gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-foreground">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                  <div>
                    <p className="font-medium">All checks passed</p>
                    <p className="text-xs text-muted-foreground">
                      Site doctor detected no syntax errors, missing certificates, or port conflicts.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {issues.map((issue) => {
                    const isFixing = fixingIssueId === issue.id;
                    return (
                      <div
                        key={issue.id}
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3.5 transition-colors",
                          issue.severity === "critical"
                            ? "border-red-500/30 bg-red-500/5"
                            : issue.severity === "warning"
                            ? "border-amber-500/30 bg-amber-500/5"
                            : "border-border bg-card",
                        )}
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <IssueSeverityIcon severity={issue.severity} />
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-foreground">
                                {issue.title}
                              </span>
                              <IssueSeverityBadge severity={issue.severity} />
                            </div>
                            <p className="text-xs text-muted-foreground break-words">
                              {issue.description}
                            </p>
                          </div>
                        </div>

                        {issue.fixable && issue.fixType ? (
                          <div className="sm:shrink-0 self-end sm:self-center">
                            <Button
                              variant="primary"
                              size="sm"
                              className="text-xs h-8 gap-1.5"
                              disabled={fixingIssueId !== null}
                              onClick={() => void handleAutoFix(issue)}
                            >
                              {isFixing ? (
                                <>
                                  <Spinner className="h-3 w-3" />
                                  <span>Fixing...</span>
                                </>
                              ) : (
                                <>
                                  <Wrench size={13} className="text-brand-foreground" />
                                  <span>Auto-Fix</span>
                                </>
                              )}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
