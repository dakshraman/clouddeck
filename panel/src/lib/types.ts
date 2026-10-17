/**
 * Shared types between the panel UI, panel API routes, and the agent client.
 * This file mirrors docs/api.md exactly. Do not edit without updating docs/api.md first.
 */

export type TaskType = "site.create" | "site.delete" | "ssl.issue" | "backup.create" | "backup.restore";
export type TaskStatus = "pending" | "running" | "succeeded" | "failed";
export type TaskLogLevel = "info" | "warn" | "error";

export interface TaskLogEntry {
  at: string;
  level: TaskLogLevel;
  message: string;
}

export interface Task {
  id: string;
  type: TaskType;
  site?: string;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  logs: TaskLogEntry[];
  error?: string | null;
}

export interface SslInfo {
  enabled: boolean;
  issuer?: string;
  expiresAt?: string;
}

export type SiteStatus = "active" | "provisioning" | "error";

export interface Site {
  domain: string;
  root: string;
  phpVersion: string;
  ssl: SslInfo;
  status: SiteStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SiteListResponse {
  sites: Site[];
}

export interface TaskListResponse {
  tasks: Task[];
}

export interface CreateSiteRequest {
  domain: string;
  phpVersion: string;
}

export interface IssueSslRequest {
  email: string;
}

export interface PhpVersionsResponse {
  versions: string[];
}

export interface HealthResponse {
  status: string;
  version: string;
  hostname: string;
  os: string;
  dryRun: boolean;
}

export interface SystemInfo {
  hostname: string;
  os: string;
  kernel?: string;
  uptimeSeconds?: number;
  cpu: {
    cores: number;
    usagePercent: number;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
  };
  disk: {
    totalBytes: number;
    usedBytes: number;
    mount: string;
  };
  agentVersion?: string;
  agentTime?: string;
  dryRun?: boolean;
}

export interface SessionUser {
  username: string;
}

export interface ApiErrorBody {
  error: {
    code?: string;
    message: string;
  };
}

// --- File manager (v0.2) ---

export type FileEntryType = "file" | "dir" | "symlink";

export interface FileEntry {
  name: string;
  type: FileEntryType;
  sizeBytes: number;
  modifiedAt: string;
}

export interface FileListResponse {
  path: string;
  entries: FileEntry[];
}

export interface FileContentResponse {
  path: string;
  content: string;
  sizeBytes: number;
}

export interface FileWriteRequest {
  path: string;
  content: string;
}

export interface FileWriteResponse {
  path: string;
  sizeBytes: number;
}

export interface FileUploadResponse {
  uploaded: { name: string; sizeBytes: number }[];
}

export interface FileMkdirRequest {
  path: string;
}

export interface FileRenameRequest {
  from: string;
  to: string;
}

// --- MySQL (v0.2) ---

export interface MySQLStatus {
  available: boolean;
  version?: string;
  kind?: "mysql" | "mariadb" | "";
}

export interface MySQLDatabase {
  name: string;
}

export interface MySQLListDatabasesResponse {
  databases: MySQLDatabase[];
}

export interface MySQLUser {
  user: string;
  host: string;
}

export interface MySQLListUsersResponse {
  users: MySQLUser[];
}

export interface MySQLCreateUserRequest {
  user: string;
  password?: string;
  host?: string;
}

export interface MySQLCreateUserResponse {
  user: string;
  host: string;
  password?: string;
}

export interface MySQLGrantRequest {
  user: string;
  host?: string;
  database: string;
  privileges: "all";
}

// --- v0.3: monitoring, DNS, backups ---

export type ServiceState = "running" | "stopped" | "unknown";

export interface AgentService {
  name: string;
  label: string;
  state: ServiceState;
  pid?: number;
  version?: string;
  details?: string;
}

export interface ServiceListResponse {
  services: AgentService[];
}

export interface DNSStatus {
  available: boolean;
  version?: string;
  confDir?: string;
}

export interface DNSZone {
  name: string;
}

export interface DNSZoneListResponse {
  zones: DNSZone[];
}

export type DNSRecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SRV" | "CAA";

export interface DNSRecord {
  name: string;
  type: string;
  ttl: number;
  content: string;
}

export interface DNSRecordListResponse {
  records: DNSRecord[];
}

export interface CreateDNSZoneRequest {
  name: string;
}

export interface CreateDNSRecordRequest {
  name: string;
  type: DNSRecordType;
  content: string;
  ttl?: number;
}

export type BackupKind = "site" | "database";

export interface BackupArchive {
  id: string;
  kind: BackupKind;
  source: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupListResponse {
  backups: BackupArchive[];
}

export interface BackupUploadTarget {
  type: "telegram" | "rclone";
  remote?: string;
}

export interface CreateBackupRequest {
  kind: BackupKind;
  site?: string;
  database?: string;
  uploads?: BackupUploadTarget[];
}
