import {
  Activity,
  Archive,
  Bot,
  Boxes,
  Clock,
  CloudUpload,
  Database,
  FolderOpen,
  Globe,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Mail,
  Network,
  Server,
  Settings,
  ShieldAlert,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  keywords?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        description: "Server health, recent tasks, and shortcuts.",
        keywords: "home start overview",
      },
    ],
  },
  {
    id: "web",
    label: "Web",
    items: [
      {
        href: "/sites",
        label: "Sites",
        icon: Globe,
        description: "Domains hosted on this server.",
        keywords: "domains vhost webroot",
      },
      {
        href: "/apps",
        label: "App Store",
        icon: LayoutGrid,
        description: "1-Click Docker stacks (Ghost, Plausible, Umami, n8n, MinIO, Vaultwarden).",
        keywords: "docker compose apps store 1-click ghost plausible n8n minio vaultwarden",
      },
      {
        href: "/files",
        label: "Files",
        icon: FolderOpen,
        description: "Browse and edit site document roots.",
        keywords: "file manager editor",
      },
      {
        href: "/runtimes",
        label: "Runtimes",
        icon: Boxes,
        description: "Installed Node.js, PHP and other language runtimes.",
        keywords: "node php python go ruby versions install uninstall runtime",
      },
      {
        href: "/agents",
        label: "AI Agents",
        icon: Bot,
        description: "Autonomous AI coding agents (Claude, Codex, Antigravity, OpenCode).",
        keywords: "ai claude codex antigravity opencode coding agents tools",
      },
      {
        href: "/ftp",
        label: "FTP",
        icon: CloudUpload,
        description: "FTP accounts and access.",
        keywords: "sftp ftp accounts",
      },
    ],
  },
  {
    id: "data",
    label: "Data",
    items: [
      {
        href: "/databases",
        label: "Databases",
        icon: Database,
        description: "MariaDB databases, users, and phpMyAdmin.",
        keywords: "mysql mariadb sql",
      },
      {
        href: "/dns",
        label: "DNS",
        icon: Network,
        description: "PowerDNS zones and records.",
        keywords: "zones records nameserver",
      },
      {
        href: "/backups",
        label: "Backups",
        icon: Archive,
        description: "Create, download, and restore archives.",
        keywords: "archive restore snapshot",
      },
    ],
  },
  {
    id: "email",
    label: "Email",
    items: [
      {
        href: "/mail",
        label: "Mail",
        icon: Mail,
        description: "Mail domains, accounts, and forwarders.",
        keywords: "smtp imap email",
      },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      {
        href: "/monitoring",
        label: "Monitoring",
        icon: Activity,
        description: "Host metrics and web-stack services.",
        keywords: "metrics services uptime",
      },
      {
        href: "/servers",
        label: "Fleet Nodes",
        icon: Server,
        description: "Multi-server fleet management and cluster health overview.",
        keywords: "fleet cluster nodes multi-server remote servers",
      },
      {
        href: "/cron",
        label: "Cron Jobs",
        icon: Clock,
        description: "Scheduled tasks and cron manager.",
        keywords: "schedule cronjob crontab automated tasks",
      },
      {
        href: "/terminal",
        label: "Terminal",
        icon: SquareTerminal,
        description: "In-browser shell on the server.",
        keywords: "shell console command",
      },
      {
        href: "/ssh",
        label: "SSH",
        icon: KeyRound,
        description: "Authorized SSH keys.",
        keywords: "keys access",
      },
    ],
  },
  {
    id: "security",
    label: "Security",
    items: [
      {
        href: "/security",
        label: "Security",
        icon: ShieldAlert,
        description: "Firewall rules, fail2ban, ModSecurity and hardening checks.",
        keywords: "firewall ufw fail2ban modsecurity waf hardening security",
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        description: "Account and server information.",
        keywords: "preferences account",
      },
    ],
  },
];

export const allNavItems: NavItem[] = navGroups.flatMap((group) => group.items);

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
