"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ExternalLink, Eye, FileCode, FolderOpen, GitBranch, Globe, Sparkles, Zap } from "lucide-react";

interface StaticSpaCardProps {
  domain: string;
  onOpenGitTab?: () => void;
}

export function StaticSpaCard({ domain, onOpenGitTab }: StaticSpaCardProps) {
  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#74b8cc]/10 text-[#74b8cc]">
            <Globe size={18} aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Static &amp; Single Page Application (SPA)</CardTitle>
            <CardDescription>
              Client-side routing fallback and line-rate static asset delivery powered by Nginx.
            </CardDescription>
          </div>
        </div>
        <Badge variant="indigo" className="font-mono text-xs">
          SPA Active
        </Badge>
      </CardHeader>
      <CardBody className="grid gap-6">
        <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#74b8cc] flex items-center gap-1.5">
              <Zap size={14} /> Client-Side Routing Fallback
            </span>
            <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
              <CheckCircle2 size={13} /> try_files $uri $uri/ /index.html =404
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            All deep URLs (e.g. <code>/{domain}/dashboard</code> or <code>/login</code>) automatically resolve to{" "}
            <code>index.html</code> so React Router, Vue Router, Vite, Astro, and SPA frameworks handle navigation
            without throwing 404s. Existing static assets (CSS, JS, images) are served directly with line-rate HTTP/2 speed.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 bg-card/60 p-3">
            <span className="text-[11px] font-medium uppercase text-muted-foreground">Frameworks Supported</span>
            <p className="mt-1 text-sm font-semibold text-foreground">React, Vue, Vite, Svelte, Astro</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Or any static HTML5 bundle</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card/60 p-3">
            <span className="text-[11px] font-medium uppercase text-muted-foreground">Webroot Path</span>
            <p className="mt-1 font-mono text-xs text-foreground truncate" title={`/www/wwwroot/${domain}`}>
              /www/wwwroot/{domain}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Isolated directory</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card/60 p-3">
            <span className="text-[11px] font-medium uppercase text-muted-foreground">Server Overhead</span>
            <p className="mt-1 text-sm font-semibold text-emerald-500">0 MB (Zero Process)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Direct Nginx kernel sendfile</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-border/60">
          <Link
            href={`/sites/${encodeURIComponent(domain)}/files`}
            className={buttonClass("primary", "sm")}
          >
            <FolderOpen size={14} aria-hidden="true" />
            Manage Files in Webroot
          </Link>
          {onOpenGitTab ? (
            <Button variant="secondary" size="sm" onClick={onOpenGitTab}>
              <GitBranch size={14} aria-hidden="true" />
              Configure Git CI/CD Auto-Deploy
            </Button>
          ) : (
            <Link
              href={`/sites/${encodeURIComponent(domain)}?tab=git`}
              className={buttonClass("secondary", "sm")}
            >
              <GitBranch size={14} aria-hidden="true" />
              Git CI/CD Auto-Deploy
            </Link>
          )}
          <a
            href={`/api/preview/${encodeURIComponent(domain)}`}
            target="_blank"
            rel="noreferrer noopener"
            className={buttonClass("ghost", "sm")}
          >
            <Eye size={14} aria-hidden="true" />
            Preview in Panel
          </a>
        </div>
      </CardBody>
    </Card>
  );
}
