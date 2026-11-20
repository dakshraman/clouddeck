"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Calendar,
  Compass,
  FileText,
  Globe,
  Layers,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import type { SiteAnalytics } from "@/lib/types";
import { apiFetch } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface TrafficAnalyticsCardProps {
  domain: string;
}

type Period = "24h" | "7d" | "30d";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function TrafficAnalyticsCard({ domain }: TrafficAnalyticsCardProps) {
  const [period, setPeriod] = useState<Period>("24h");
  const [analytics, setAnalytics] = useState<SiteAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SiteAnalytics>(
        `/api/sites/${encodeURIComponent(domain)}/analytics?period=${p}`,
      );
      setAnalytics(data);
    } catch (err: unknown) {
      // If agent is still assembling access logs or endpoint empty, synthesize baseline
      setAnalytics({
        domain,
        period: p,
        totalRequests: 0,
        totalBandwidthBytes: 0,
        uniqueVisitors: 0,
        statusCodes: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
        timeline: [],
        topUrls: [],
        referrers: [],
        bots: [],
      });
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void loadAnalytics(period);
  }, [domain, period, loadAnalytics]);

  const totalReq = analytics?.totalRequests || 0;
  const sc = analytics?.statusCodes || { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
  const successPct = totalReq > 0 ? (((sc["2xx"] + sc["3xx"]) / totalReq) * 100).toFixed(1) : "100.0";

  // Compute max requests for timeline visualization
  const timeline = analytics?.timeline || [];
  const maxReq = Math.max(...timeline.map((t) => t.requests), 1);

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>Traffic & Visitor Analytics</CardTitle>
              <Badge variant="indigo" className="text-[10px]">Privacy-First</Badge>
            </div>
            <CardDescription>
              High-performance Nginx access log parsing with zero cookies and no client tracking scripts.
            </CardDescription>
          </div>
        </div>

        {/* Period Selector & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
            {(["24h", "7d", "30d"] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  period === p
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "24h" ? "24 Hours" : p === "7d" ? "7 Days" : "30 Days"}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadAnalytics(period)}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </CardHeader>

      <CardBody className="space-y-6">
        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            {/* KPI Metrics Grid */}
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-border/80 bg-card/60 p-4 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Activity size={13} className="text-indigo-400" /> Total Requests
                </span>
                <p className="text-2xl font-bold font-mono text-foreground">
                  {totalReq.toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground">HTTP traffic in last {period}</p>
              </div>

              <div className="rounded-lg border border-border/80 bg-card/60 p-4 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Users size={13} className="text-emerald-400" /> Unique Visitors
                </span>
                <p className="text-2xl font-bold font-mono text-foreground">
                  {(analytics?.uniqueVisitors || 0).toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground">Distinct IP / User-Agents</p>
              </div>

              <div className="rounded-lg border border-border/80 bg-card/60 p-4 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-blue-400" /> Bandwidth Served
                </span>
                <p className="text-2xl font-bold font-mono text-foreground">
                  {formatBytes(analytics?.totalBandwidthBytes || 0)}
                </p>
                <p className="text-[11px] text-muted-foreground">Egress data transfer</p>
              </div>

              <div className="rounded-lg border border-border/80 bg-card/60 p-4 space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-emerald-500" /> Success Rate
                </span>
                <p className="text-2xl font-bold font-mono text-foreground">
                  {successPct}%
                </p>
                <p className="text-[11px] text-muted-foreground">2xx & 3xx responses</p>
              </div>
            </div>

            {/* Traffic Timeline Chart */}
            <div className="rounded-lg border border-border/80 bg-card/60 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Requests Timeline</h4>
                  <p className="text-xs text-muted-foreground">Hourly request volume trends</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-indigo-500 inline-block" /> Requests
                  </span>
                </div>
              </div>

              {timeline.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/10 text-xs text-muted-foreground">
                  No request timeline data recorded for this period yet.
                </div>
              ) : (
                <div className="pt-2">
                  <div className="flex h-32 items-end gap-1.5 pt-4">
                    {timeline.map((point, idx) => {
                      const heightPct = Math.max((point.requests / maxReq) * 100, 4);
                      return (
                        <div
                          key={idx}
                          className="group relative flex-1 h-full flex items-end justify-center"
                        >
                          <div
                            style={{ height: `${heightPct}%` }}
                            className="w-full rounded-t-sm bg-indigo-500/80 hover:bg-indigo-400 transition-all cursor-pointer"
                          />
                          {/* Hover Tooltip */}
                          <div className="absolute -top-12 z-10 hidden group-hover:flex flex-col items-center rounded-md bg-black/90 px-2 py-1 text-[10px] text-white whitespace-nowrap shadow-md pointer-events-none">
                            <span className="font-semibold">{point.requests} requests</span>
                            <span className="text-gray-400">{point.timestamp}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between border-t border-border/60 pt-1 text-[10px] text-muted-foreground">
                    <span>{timeline[0]?.timestamp || "Start"}</span>
                    <span>{timeline[timeline.length - 1]?.timestamp || "Current"}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Status Codes Breakdown */}
            <div className="rounded-lg border border-border/80 bg-card/60 p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                HTTP Response Status Codes
              </h4>
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="flex items-center justify-between rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-emerald-400">2xx Success</span>
                    <p className="text-lg font-bold font-mono text-foreground">{sc["2xx"].toLocaleString()}</p>
                  </div>
                  <Badge variant="green" className="text-[10px]">Normal</Badge>
                </div>

                <div className="flex items-center justify-between rounded-md border border-blue-500/20 bg-blue-500/5 p-2.5">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-blue-400">3xx Redirect</span>
                    <p className="text-lg font-bold font-mono text-foreground">{sc["3xx"].toLocaleString()}</p>
                  </div>
                  <Badge variant="indigo" className="text-[10px]">Redirect</Badge>
                </div>

                <div className="flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-amber-400">4xx Client Error</span>
                    <p className="text-lg font-bold font-mono text-foreground">{sc["4xx"].toLocaleString()}</p>
                  </div>
                  <Badge variant="amber" className="text-[10px]">404/403</Badge>
                </div>

                <div className="flex items-center justify-between rounded-md border border-red-500/20 bg-red-500/5 p-2.5">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-red-400">5xx Server Error</span>
                    <p className="text-lg font-bold font-mono text-foreground">{sc["5xx"].toLocaleString()}</p>
                  </div>
                  <Badge variant="red" className="text-[10px]">Server Fault</Badge>
                </div>
              </div>
            </div>

            {/* Split Grid: Top URLs & Referrers */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Top URLs */}
              <div className="rounded-lg border border-border/80 bg-card p-4 space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText size={13} className="text-indigo-400" /> Top Requested Paths
                </span>
                {(!analytics?.topUrls || analytics.topUrls.length === 0) ? (
                  <p className="text-xs text-muted-foreground italic py-4 text-center">
                    No path requests recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border/60 text-xs">
                    {analytics.topUrls.slice(0, 7).map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-2">
                        <span className="font-mono text-foreground truncate max-w-[240px]" title={item.path}>
                          {item.path}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono font-medium text-muted-foreground">
                            {item.count.toLocaleString()} hits
                          </span>
                          {item.bandwidthBytes ? (
                            <span className="text-[11px] text-muted-foreground/70">
                              {formatBytes(item.bandwidthBytes)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Referrers & Crawlers */}
              <div className="space-y-4">
                {/* Referrers */}
                <div className="rounded-lg border border-border/80 bg-card p-4 space-y-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Compass size={13} className="text-blue-400" /> Top Inbound Referrers
                  </span>
                  {(!analytics?.referrers || analytics.referrers.length === 0) ? (
                    <p className="text-xs text-muted-foreground italic py-3 text-center">
                      Direct traffic or no referrers recorded yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-border/60 text-xs">
                      {analytics.referrers.slice(0, 5).map((ref, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5">
                          <span className="truncate max-w-[240px] text-foreground font-mono" title={ref.referrer}>
                            {ref.referrer || "Direct / Bookmark"}
                          </span>
                          <span className="font-mono text-muted-foreground font-medium">
                            {ref.count.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bot & Crawler Breakdown */}
                {analytics?.bots && analytics.bots.length > 0 && (
                  <div className="rounded-lg border border-border/80 bg-card p-4 space-y-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Bot size={13} className="text-purple-400" /> Bots & AI Crawlers
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {analytics.bots.map((bot, i) => (
                        <div key={i} className="rounded-md border border-border/60 bg-muted/10 p-2 flex items-center justify-between">
                          <div className="min-w-0 pr-2">
                            <p className="font-medium text-foreground truncate">{bot.name}</p>
                            <p className="text-[10px] text-muted-foreground">{bot.category}</p>
                          </div>
                          <Badge variant="neutral" className="text-[10px] shrink-0 font-mono">
                            {bot.count}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
