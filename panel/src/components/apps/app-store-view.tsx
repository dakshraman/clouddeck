"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  FileCode,
  Folder,
  Globe,
  KeyRound,
  Layers,
  Lock,
  Package,
  Play,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Square,
  Terminal,
  Trash2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import type {
  AppStoreActionRequest,
  AppStoreActionResponse,
  AppStoreCatalogResponse,
  AppStoreInstalledResponse,
  AppStoreLogsResponse,
  AppStoreTemplate,
  InstallAppStoreRequest,
  InstallCustomAppStoreRequest,
  InstalledAppStoreApp,
  Site,
  SiteListResponse,
} from "@/lib/types";
import { apiFetch, apiPost } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/ui/cn";

const CURATED_CATALOG: AppStoreTemplate[] = [
  {
    id: "ghost",
    name: "Ghost CMS",
    tagline: "Professional publishing & newsletter platform",
    description: "The world's most popular open-source headless Node.js publishing platform with integrated memberships and Stripe subscriptions.",
    category: "CMS",
    icon: "Ghost",
    defaultPort: 2368,
    minRamMb: 512,
    websiteUrl: "https://ghost.org",
    envVars: [
      { key: "url", label: "Blog URL", defaultValue: "http://localhost:2368", required: true },
      { key: "admin_email", label: "Admin Email", defaultValue: "admin@example.com", required: true },
    ],
  },
  {
    id: "plausible",
    name: "Plausible Analytics",
    tagline: "Simple, privacy-friendly Google Analytics alternative",
    description: "Lightweight (< 1KB script) web analytics without cookies, fully compliant with GDPR, CCPA and PECR out of the box.",
    category: "Analytics",
    icon: "BarChart3",
    defaultPort: 8000,
    minRamMb: 1024,
    websiteUrl: "https://plausible.io",
    envVars: [
      { key: "BASE_URL", label: "Base URL", defaultValue: "http://localhost:8000", required: true },
      { key: "SECRET_KEY_BASE", label: "Secret Key Base", defaultValue: "64_random_characters_secret_token_123456", required: true },
    ],
  },
  {
    id: "umami",
    name: "Umami",
    tagline: "Modern, open-source privacy-focused web analytics",
    description: "Fast, privacy-respecting website analytics dashboard powered by Next.js and Prisma with custom event tracking.",
    category: "Analytics",
    icon: "Activity",
    defaultPort: 3000,
    minRamMb: 512,
    websiteUrl: "https://umami.is",
    envVars: [
      { key: "APP_SECRET", label: "Application Secret", defaultValue: "random_secure_app_secret_998877", required: true },
    ],
  },
  {
    id: "n8n",
    name: "n8n Workflow Automation",
    tagline: "Fair-code workflow automation with 400+ nodes",
    description: "Connect APIs, build autonomous AI agents, automate databases, and run self-hosted multi-step webhook workflows.",
    category: "Automation",
    icon: "Zap",
    defaultPort: 5678,
    minRamMb: 512,
    websiteUrl: "https://n8n.io",
    envVars: [
      { key: "N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS", label: "Enforce File Permissions", defaultValue: "true" },
      { key: "WEBHOOK_URL", label: "Webhook Public URL", defaultValue: "http://localhost:5678/" },
    ],
  },
  {
    id: "minio",
    name: "MinIO Object Storage",
    tagline: "High-performance S3-compatible cloud storage",
    description: "Enterprise-grade S3-compatible object storage server engineered for cloud-native AI pipelines, backups, and app assets.",
    category: "Storage",
    icon: "HardDrive",
    defaultPort: 9000,
    minRamMb: 512,
    websiteUrl: "https://min.io",
    envVars: [
      { key: "MINIO_ROOT_USER", label: "Root Access Key", defaultValue: "clouddeck_minio_admin", required: true },
      { key: "MINIO_ROOT_PASSWORD", label: "Root Secret Key", defaultValue: "clouddeck_secure_password_987", required: true, type: "password" },
    ],
  },
  {
    id: "vaultwarden",
    name: "Vaultwarden",
    tagline: "Lightweight Bitwarden password manager in Rust",
    description: "Full-featured, memory-efficient Bitwarden server compatible with all official browser extensions, mobile apps, and 2FA.",
    category: "Security",
    icon: "Lock",
    defaultPort: 8080,
    minRamMb: 256,
    websiteUrl: "https://github.com/dani-garcia/vaultwarden",
    envVars: [
      { key: "SIGNUPS_ALLOWED", label: "Allow Public Signups", defaultValue: "true" },
    ],
  },
  {
    id: "redis",
    name: "Redis In-Memory Database",
    tagline: "Ultra-fast in-memory key-value database & cache",
    description: "High-performance in-memory data store used as a database, cache, streaming engine, and message broker.",
    category: "Database",
    icon: "Database",
    defaultPort: 6379,
    minRamMb: 256,
    websiteUrl: "https://redis.io",
    envVars: [
      { key: "REDIS_PASSWORD", label: "Redis Password", defaultValue: "redisPassword123!", required: true, type: "password" },
    ],
  },
  {
    id: "mongodb",
    name: "MongoDB Server",
    tagline: "Modern document-oriented NoSQL database",
    description: "Flexible, scalable document database designed for modern applications with flexible JSON-like schema.",
    category: "Database",
    icon: "Database",
    defaultPort: 27017,
    minRamMb: 1024,
    websiteUrl: "https://www.mongodb.com",
    envVars: [
      { key: "MONGO_INITDB_ROOT_USERNAME", label: "Root Username", defaultValue: "admin", required: true },
      { key: "MONGO_INITDB_ROOT_PASSWORD", label: "Root Password", defaultValue: "mongoSecurePassword123", required: true, type: "password" },
    ],
  },
  {
    id: "pocketbase",
    name: "PocketBase Backend",
    tagline: "Open-source backend in 1 file with realtime DB",
    description: "Embedded SQLite database with realtime subscriptions, built-in auth, file storage, and an elegant admin UI.",
    category: "Backend",
    icon: "Server",
    defaultPort: 8090,
    minRamMb: 256,
    websiteUrl: "https://pocketbase.io",
    envVars: [],
  },
  {
    id: "meilisearch",
    name: "Meilisearch",
    tagline: "Lightning-fast, typo-tolerant search engine",
    description: "Ultra-fast open-source search engine with instant search-as-you-type, typo tolerance, and drop-in SDKs.",
    category: "Search",
    icon: "Search",
    defaultPort: 7700,
    minRamMb: 512,
    websiteUrl: "https://www.meilisearch.com",
    envVars: [
      { key: "MEILI_MASTER_KEY", label: "Master API Key", defaultValue: "meilisearch_master_key_secret_123", required: true, type: "password" },
    ],
  },
  {
    id: "nextcloud",
    name: "Nextcloud Hub",
    tagline: "Self-hosted productivity and collaborative cloud",
    description: "The most deployed self-hosted file sync and collaboration platform with office documents, calendar, and contacts.",
    category: "Productivity",
    icon: "Layers",
    defaultPort: 8080,
    minRamMb: 1024,
    websiteUrl: "https://nextcloud.com",
    envVars: [
      { key: "NEXTCLOUD_ADMIN_USER", label: "Admin Username", defaultValue: "admin", required: true },
      { key: "NEXTCLOUD_ADMIN_PASSWORD", label: "Admin Password", defaultValue: "NextcloudAdminPass123!", required: true, type: "password" },
    ],
  },
];

const DEFAULT_CUSTOM_COMPOSE = `version: '3.8'
services:
  web:
    image: nginx:alpine
    restart: always
    ports:
      - "8080:80"
    environment:
      - APP_ENV=production
`;

type CategoryFilter = "All" | "CMS" | "Analytics" | "Automation" | "Database" | "Backend" | "Storage" | "Security" | "Search" | "Productivity";

export function AppStoreView() {
  const [activeTab, setActiveTab] = useState<"catalog" | "installed">("catalog");
  const [catalog, setCatalog] = useState<AppStoreTemplate[]>(CURATED_CATALOG);
  const [installedApps, setInstalledApps] = useState<InstalledAppStoreApp[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [dockerAvailable, setDockerAvailable] = useState<boolean>(false);
  const [dockerComposeAvailable, setDockerComposeAvailable] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("All");

  // Install Modal state
  const [installModalTemplate, setInstallModalTemplate] = useState<AppStoreTemplate | null>(null);
  const [installDomain, setInstallDomain] = useState("");
  const [installPort, setInstallPort] = useState<number>(8000);
  const [installEnv, setInstallEnv] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  // Custom Compose Modal state
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [customComposeYaml, setCustomComposeYaml] = useState(DEFAULT_CUSTOM_COMPOSE);
  const [customEnvVars, setCustomEnvVars] = useState("");
  const [customDeploying, setCustomDeploying] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  // Logs Modal state
  const [viewingLogsApp, setViewingLogsApp] = useState<InstalledAppStoreApp | null>(null);
  const [logsText, setLogsText] = useState("");
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catRes, instRes, sitesRes] = await Promise.allSettled([
        apiFetch<AppStoreCatalogResponse>("/api/appstore/catalog"),
        apiFetch<AppStoreInstalledResponse>("/api/appstore/installed"),
        apiFetch<SiteListResponse>("/api/sites"),
      ]);

      if (catRes.status === "fulfilled" && catRes.value) {
        if (catRes.value.catalog && catRes.value.catalog.length > 0) {
          setCatalog(catRes.value.catalog);
        }
        setDockerAvailable(catRes.value.dockerAvailable ?? true);
        setDockerComposeAvailable(catRes.value.dockerComposeAvailable ?? true);
      }
      if (instRes.status === "fulfilled" && instRes.value?.apps) {
        setInstalledApps(instRes.value.apps);
      }
      if (sitesRes.status === "fulfilled" && sitesRes.value?.sites) {
        setSites(sitesRes.value.sites);
      }
    } catch {
      // Keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredCatalog = useMemo(() => {
    const normalizeCat = (c: string) => {
      const lower = (c || "").toLowerCase();
      if (lower === "cms" || lower === "publishing") return "cms";
      if (lower === "productivity" || lower === "collaboration") return "productivity";
      return lower;
    };

    return catalog.filter((tpl) => {
      const matchesCategory =
        selectedCategory === "All" ||
        normalizeCat(tpl.category) === normalizeCat(selectedCategory);
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        tpl.name.toLowerCase().includes(q) ||
        tpl.tagline.toLowerCase().includes(q) ||
        tpl.description.toLowerCase().includes(q) ||
        tpl.id.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [catalog, selectedCategory, searchQuery]);

  function handleOpenInstall(tpl: AppStoreTemplate) {
    setInstallModalTemplate(tpl);
    setInstallPort(tpl.defaultPort);
    setInstallDomain(sites[0]?.domain ? `${tpl.id}.${sites[0].domain}` : "");
    const initialEnv: Record<string, string> = {};
    for (const v of tpl.envVars) {
      if (v.defaultValue) initialEnv[v.key] = v.defaultValue;
    }
    setInstallEnv(initialEnv);
    setInstallError(null);
  }

  async function handleInstallSubmit(e: FormEvent) {
    e.preventDefault();
    if (!installModalTemplate) return;
    setInstalling(true);
    setInstallError(null);

    try {
      const payload: InstallAppStoreRequest = {
        templateId: installModalTemplate.id,
        domain: installDomain.trim() || undefined,
        port: Number(installPort),
        env: installEnv,
      };

      await apiPost("/api/appstore/install", payload);
      setNotice(`Stack "${installModalTemplate.name}" installed and launched via Docker Compose!`);
      setInstallModalTemplate(null);
      setActiveTab("installed");
      await loadData();
    } catch (err: unknown) {
      setInstallError(err instanceof Error ? err.message : "Installation failed.");
    } finally {
      setInstalling(false);
    }
  }

  async function handleCustomComposeSubmit(e: FormEvent) {
    e.preventDefault();
    setCustomDeploying(true);
    setCustomError(null);

    try {
      const envObj: Record<string, string> = {};
      if (customEnvVars.trim()) {
        for (const line of customEnvVars.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx !== -1) {
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim();
            if (k) envObj[k] = v;
          }
        }
      }

      const payload: InstallCustomAppStoreRequest = {
        name: customName.trim(),
        domain: customDomain.trim() || undefined,
        composeYaml: customComposeYaml,
        envVars: Object.keys(envObj).length > 0 ? envObj : undefined,
      };

      await apiPost("/api/appstore/custom", payload);
      setNotice(`Custom stack "${customName}" deployed successfully via Docker Compose!`);
      setCustomModalOpen(false);
      setCustomName("");
      setCustomDomain("");
      setCustomEnvVars("");
      setActiveTab("installed");
      await loadData();
    } catch (err: unknown) {
      setCustomError(err instanceof Error ? err.message : "Custom stack deployment failed.");
    } finally {
      setCustomDeploying(false);
    }
  }

  async function handleAppAction(appId: string, action: "start" | "stop" | "restart") {
    setActionLoadingId(`${appId}-${action}`);
    setError(null);
    try {
      const payload: AppStoreActionRequest = { action };
      const res = await apiPost<AppStoreActionResponse>(`/api/appstore/${encodeURIComponent(appId)}/action`, payload);
      setNotice(res.message || `Stack ${action} succeeded.`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${action} app.`);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleViewLogs(app: InstalledAppStoreApp) {
    setViewingLogsApp(app);
    setLoadingLogs(true);
    setLogsText("");
    try {
      const res = await apiFetch<AppStoreLogsResponse>(`/api/appstore/${encodeURIComponent(app.id)}/logs`);
      setLogsText(res.logs || "No logs captured yet.");
    } catch (err: unknown) {
      setLogsText(err instanceof Error ? `Error loading logs: ${err.message}` : "Failed to load container logs.");
    } finally {
      setLoadingLogs(false);
    }
  }

  async function handleDeleteApp(appId: string, appName: string) {
    if (!confirm(`Are you sure you want to uninstall and remove "${appName}"? Docker containers, volumes, and reverse proxy routes will be deleted.`)) {
      return;
    }
    setActionLoadingId(`${appId}-delete`);
    setError(null);
    try {
      await apiFetch(`/api/appstore/${encodeURIComponent(appId)}`, { method: "DELETE" });
      setNotice(`App stack "${appName}" uninstalled successfully.`);
      setInstalledApps((prev) => prev.filter((a) => a.id !== appId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to uninstall app.");
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div className="grid gap-6">
      {notice && (
        <Alert variant="success">
          <div className="flex items-center justify-between w-full">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold underline ml-2 cursor-pointer">
              Dismiss
            </button>
          </div>
        </Alert>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {/* Docker Engine Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border/80 bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Docker Compose Orchestrator</h3>
              <Badge variant={dockerAvailable ? "green" : "amber"} className="text-[10px]">
                {dockerAvailable ? "Engine Ready" : "Docker Missing"}
              </Badge>
              {dockerComposeAvailable && (
                <Badge variant="indigo" className="text-[10px]">Compose v2</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Production stacks are deployed in isolated containers with automatic reverse-proxy routing and SSL.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCustomModalOpen(true)}
            className="gap-1.5"
          >
            <FileCode size={13} />
            <span>Deploy Custom Compose</span>
          </Button>

          {/* Tab switch: Catalog vs Installed */}
          <div className="flex rounded-lg border border-border bg-muted/30 p-1 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("catalog")}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer",
                activeTab === "catalog"
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Catalog ({catalog.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("installed")}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                activeTab === "installed"
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Installed Apps
              {installedApps.length > 0 && (
                <Badge variant="green" className="text-[10px] py-0 px-1.5">
                  {installedApps.length}
                </Badge>
              )}
            </button>
          </div>
        </div>
      </div>

      {activeTab === "catalog" ? (
        /* App Store Catalog */
        <div className="space-y-6">
          {/* Search & Category Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search stacks (Ghost, n8n, MinIO...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {(["All", "CMS", "Analytics", "Automation", "Database", "Backend", "Storage", "Security", "Search", "Productivity"] as CategoryFilter[]).map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 transition-colors cursor-pointer text-xs font-medium",
                      selectedCategory === cat
                        ? "bg-brand text-brand-foreground"
                        : "border border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40",
                    )}
                  >
                    {cat}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Catalog Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredCatalog.map((tpl) => (
              <div
                key={tpl.id}
                className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-xs hover:border-brand/50 hover:shadow-md transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                      <Package size={22} />
                    </div>
                    <Badge variant="neutral" className="text-[10px]">
                      {tpl.category}
                    </Badge>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                      {tpl.name}
                    </h4>
                    <p className="text-[11px] text-brand/90 font-medium mt-0.5">
                      {tpl.tagline}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-3 mt-1.5">
                      {tpl.description}
                    </p>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-border/60 space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                    <span>Port: {tpl.defaultPort}</span>
                    <span>Min: {tpl.minRamMb || 512}MB RAM</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {tpl.websiteUrl && (
                      <a
                        href={tpl.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Official Documentation"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleOpenInstall(tpl)}
                      className="w-full gap-1.5"
                    >
                      <Wand2 size={13} />
                      <span>1-Click Install</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Installed Apps Management Tab */
        <Card className="border-border">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Installed Docker Stacks</CardTitle>
              <CardDescription>
                Containers managed by CloudDeck Docker Compose orchestrator.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => setCustomModalOpen(true)}>
                <FileCode size={13} className="mr-1" />
                Deploy Custom Compose
              </Button>
              <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
                <RefreshCw size={13} className={loading ? "animate-spin mr-1" : "mr-1"} />
                Refresh
              </Button>
            </div>
          </CardHeader>

          <CardBody className="p-0">
            {installedApps.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-3">
                <p>No 1-Click Docker applications deployed yet.</p>
                <div className="flex items-center justify-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setActiveTab("catalog")}>
                    Browse 1-Click App Catalog
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setCustomModalOpen(true)}>
                    <FileCode size={13} className="mr-1" />
                    Deploy Custom Compose
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Application</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Exposed Port</th>
                      <th className="px-4 py-3">Mapped Domain</th>
                      <th className="px-4 py-3">Deployed At</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {installedApps.map((app) => {
                      const isStarting = actionLoadingId === `${app.id}-start`;
                      const isStopping = actionLoadingId === `${app.id}-stop`;
                      const isRestarting = actionLoadingId === `${app.id}-restart`;
                      const isDeleting = actionLoadingId === `${app.id}-delete`;
                      return (
                        <tr key={app.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
                                <Package size={14} />
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">{app.name}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{app.templateId}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                app.status === "running"
                                  ? "green"
                                  : app.status === "stopped"
                                    ? "amber"
                                    : "red"
                              }
                            >
                              <span
                                className={cn(
                                  "mr-1 h-1.5 w-1.5 rounded-full inline-block",
                                  app.status === "running" ? "bg-emerald-500 animate-pulse" : "bg-gray-400",
                                )}
                              />
                              {app.status.toUpperCase()}
                            </Badge>
                          </td>

                          <td className="px-4 py-3 font-mono font-medium text-foreground">
                            :{app.port}
                          </td>

                          <td className="px-4 py-3">
                            {app.domain ? (
                              <a
                                href={`https://${app.domain}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-mono text-brand hover:underline"
                              >
                                {app.domain}
                                <ExternalLink size={11} />
                              </a>
                            ) : (
                              <span className="text-muted-foreground italic">Direct Port</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {app.installedAt ? new Date(app.installedAt).toLocaleDateString() : "—"}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {app.status === "running" ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => void handleAppAction(app.id, "stop")}
                                  disabled={isStopping}
                                  title="Stop containers"
                                >
                                  <Square size={11} className={isStopping ? "animate-spin mr-1" : "mr-1"} />
                                  Stop
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => void handleAppAction(app.id, "start")}
                                  disabled={isStarting}
                                  title="Start containers"
                                >
                                  <Play size={11} className={isStarting ? "animate-spin mr-1 text-emerald-500" : "mr-1 text-emerald-500"} />
                                  Start
                                </Button>
                              )}

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleAppAction(app.id, "restart")}
                                disabled={isRestarting}
                                title="Restart Docker Compose service"
                              >
                                <RefreshCw size={11} className={isRestarting ? "animate-spin" : ""} />
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleViewLogs(app)}
                                title="View container logs"
                              >
                                <Terminal size={11} />
                              </Button>

                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => void handleDeleteApp(app.id, app.name)}
                                disabled={isDeleting}
                                title="Uninstall container stack"
                              >
                                <Trash2 size={11} />
                              </Button>
                            </div>
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
      )}

      {/* 1-Click Install Modal */}
      {installModalTemplate && (
        <Dialog.Root open={Boolean(installModalTemplate)} onOpenChange={(open) => !open && setInstallModalTemplate(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs animate-in fade-in" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <Package size={20} />
                  </div>
                  <div>
                    <Dialog.Title className="text-base font-semibold text-foreground">
                      Deploy {installModalTemplate.name}
                    </Dialog.Title>
                    <p className="text-xs text-muted-foreground">
                      Automated Docker Compose stack provisioning
                    </p>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button type="button" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X size={18} />
                  </button>
                </Dialog.Close>
              </div>

              <form onSubmit={handleInstallSubmit} className="space-y-4 pt-4">
                {installError && <Alert variant="error">{installError}</Alert>}

                {/* Routing & Domain */}
                <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Globe size={13} className="text-brand" /> Network & Reverse Proxy Routing
                  </span>

                  <div className="space-y-1">
                    <Label htmlFor="install-domain" className="text-xs">
                      Public Domain / Reverse Proxy (Optional)
                    </Label>
                    <Input
                      id="install-domain"
                      type="text"
                      placeholder="e.g. ghost.mycompany.com"
                      value={installDomain}
                      onChange={(e) => setInstallDomain(e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Nginx will automatically reverse-proxy incoming HTTPS requests to this container.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="install-port" className="text-xs">
                      Internal Host Port
                    </Label>
                    <Input
                      id="install-port"
                      type="number"
                      value={installPort}
                      onChange={(e) => setInstallPort(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                {/* Environment Variables */}
                {installModalTemplate.envVars && installModalTemplate.envVars.length > 0 && (
                  <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Lock size={13} className="text-amber-500" /> Environment Variables (.env)
                    </span>

                    {installModalTemplate.envVars.map((v) => (
                      <div key={v.key} className="space-y-1">
                        <Label htmlFor={`env-${v.key}`} className="text-xs">
                          {v.label} {v.required && <span className="text-red-500">*</span>}
                        </Label>
                        <Input
                          id={`env-${v.key}`}
                          type={v.type === "password" ? "password" : "text"}
                          value={installEnv[v.key] ?? v.defaultValue ?? ""}
                          onChange={(e) =>
                            setInstallEnv((prev) => ({ ...prev, [v.key]: e.target.value }))
                          }
                          required={v.required}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/70">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setInstallModalTemplate(null)}
                    disabled={installing}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" loading={installing}>
                    <Wand2 size={14} className="mr-1.5" />
                    Deploy Stack Now
                  </Button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      {/* Deploy Custom Docker Compose Modal */}
      {customModalOpen && (
        <Dialog.Root open={customModalOpen} onOpenChange={setCustomModalOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs animate-in fade-in" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                    <FileCode size={20} />
                  </div>
                  <div>
                    <Dialog.Title className="text-base font-semibold text-foreground">
                      Deploy Custom Docker Compose
                    </Dialog.Title>
                    <p className="text-xs text-muted-foreground">
                      Deploy arbitrary multi-container stacks with automated reverse proxy routing
                    </p>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button type="button" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X size={18} />
                  </button>
                </Dialog.Close>
              </div>

              <form onSubmit={handleCustomComposeSubmit} className="space-y-4 pt-4">
                {customError && <Alert variant="error">{customError}</Alert>}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="custom-name" className="text-xs">
                      Application Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="custom-name"
                      type="text"
                      placeholder="e.g. my-service"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      required
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Saved to /www/apps/&lt;name&gt;/docker-compose.yml
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="custom-domain" className="text-xs">
                      Public Domain / Reverse Proxy (Optional)
                    </Label>
                    <Input
                      id="custom-domain"
                      type="text"
                      placeholder="e.g. service.mycompany.com"
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Nginx will reverse-proxy requests to your container port.
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="custom-yaml" className="text-xs">
                      Docker Compose YAML <span className="text-red-500">*</span>
                    </Label>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      docker-compose.yml
                    </span>
                  </div>
                  <textarea
                    id="custom-yaml"
                    rows={12}
                    className="w-full rounded-md border border-input bg-muted/40 p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="version: '3.8'&#10;services:&#10;  app:&#10;    image: my-image:latest&#10;    ports:&#10;      - '8080:80'"
                    value={customComposeYaml}
                    onChange={(e) => setCustomComposeYaml(e.target.value)}
                    required
                    spellCheck={false}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="custom-env" className="text-xs">
                    Environment Variables (Optional, KEY=value format)
                  </Label>
                  <textarea
                    id="custom-env"
                    rows={3}
                    className="w-full rounded-md border border-input bg-muted/40 p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="PORT=8080&#10;SECRET_KEY=my_secure_secret&#10;DB_HOST=127.0.0.1"
                    value={customEnvVars}
                    onChange={(e) => setCustomEnvVars(e.target.value)}
                    spellCheck={false}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Variables will be written to .env file in the app directory.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/70">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCustomModalOpen(false)}
                    disabled={customDeploying}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" loading={customDeploying}>
                    <Wand2 size={14} className="mr-1.5" />
                    Deploy Stack Now
                  </Button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      {/* Container Logs Modal */}
      {viewingLogsApp && (
        <Dialog.Root open={Boolean(viewingLogsApp)} onOpenChange={(open) => !open && setViewingLogsApp(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs animate-in fade-in" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card shadow-2xl animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="flex items-center gap-2">
                  <Terminal className="h-5 w-5 text-brand" />
                  <Dialog.Title className="text-sm font-semibold text-foreground">
                    Container Logs — {viewingLogsApp.name} (Port {viewingLogsApp.port})
                  </Dialog.Title>
                </div>
                <Dialog.Close asChild>
                  <button type="button" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </Dialog.Close>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {loadingLogs ? (
                  <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Fetching Docker container stdout/stderr...
                  </div>
                ) : (
                  <pre className="rounded bg-black/90 p-4 font-mono text-xs text-emerald-400 whitespace-pre-wrap selection:bg-emerald-800">
                    {logsText}
                  </pre>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border p-3 text-xs text-muted-foreground bg-muted/20">
                <span>Compose Path: {viewingLogsApp.composeDir || `/var/lib/clouddeck/apps/${viewingLogsApp.id}`}</span>
                <Button variant="secondary" size="sm" onClick={() => void handleViewLogs(viewingLogsApp)}>
                  <RefreshCw size={12} className="mr-1" />
                  Reload Logs
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}
