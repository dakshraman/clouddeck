import {
  Activity,
  Archive,
  Clock,
  CloudUpload,
  Cpu,
  Database,
  FolderOpen,
  Globe,
  KeyRound,
  LayoutDashboard,
  Mail,
  Network,
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
        href: "/files",
        label: "Files",
        icon: FolderOpen,
        description: "Browse and edit site document roots.",
        keywords: "file manager editor",
      },
      {
        href: "/apps",
        label: "Applications",
        icon: Cpu,
        description: "Node.js, Python, Go and Ruby processes under supervision.",
        keywords: "node python go ruby runtime process pm2 supervisor systemd app",
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
        href: "/cron",
        label: "Cron Jobs",
        icon: Clock,
        description: "Scheduled tasks per site.",
        keywords: "schedule cronjob",
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
