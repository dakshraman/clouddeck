import type { SiteStatus, TaskStatus, TaskType } from "@/lib/types";
import type { BadgeVariant } from "@/components/ui/badge";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function percentOf(used: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

export function shortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function shortDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  if (date.getFullYear() !== new Date().getFullYear()) {
    options.year = "numeric";
  }
  return date.toLocaleString([], options);
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSeconds = Math.floor((Date.now() - then) / 1000);
  if (diffSeconds < 5) return "just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return shortDateTime(iso);
}

export function titleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function taskTypeLabel(type: TaskType | string): string {
  switch (type) {
    case "site.create":
      return "Create site";
    case "site.delete":
      return "Delete site";
    case "ssl.issue":
      return "Issue SSL";
    case "backup.create":
      return "Create backup";
    case "backup.restore":
      return "Restore backup";
    case "runtime.install":
      return "Install runtime";
    case "phpmyadmin.install":
      return "Install phpMyAdmin";
    default:
      return type;
  }
}

export function phpVersionLabel(phpVersion: string): string {
  if (!phpVersion || phpVersion === "none") return "Static (no PHP)";
  return `PHP ${phpVersion}`;
}

export function usageTone(percent: number): "indigo" | "amber" | "red" {
  if (percent >= 90) return "red";
  if (percent >= 70) return "amber";
  return "indigo";
}

export function siteStatusVariant(status: SiteStatus): BadgeVariant {
  switch (status) {
    case "active":
      return "green";
    case "provisioning":
      return "amber";
    case "error":
    default:
      return "red";
  }
}

export function taskStatusVariant(status: TaskStatus): BadgeVariant {
  switch (status) {
    case "succeeded":
      return "green";
    case "failed":
      return "red";
    case "pending":
      return "amber";
    case "running":
    default:
      return "indigo";
  }
}
