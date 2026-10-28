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
  wafEnabled?: boolean;
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

export interface ProcessInfo {
  pid: number;
  user: string;
  command: string;
  cpuPercent: number;
  memoryPercent: number;
  rssBytes: number;
  killable: boolean;
}

export interface ProcessListResponse {
  processes: ProcessInfo[];
  totalProcesses: number;
  sampledAt: string;
}

export interface KillProcessResponse {
  pid: number;
  killed: boolean;
}

export interface RebootResponse {
  rebooted: boolean;
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

// ---- v0.4: mail (docs/api.md section 1.6) ----
export interface MailStatus {
  baseDir: string;
  hostname: string;
  domains: number;
  accounts: number;
  dkimEnabled: number;
}
export interface MailAccount {
  email: string;
  domain: string;
  quotaMb: number;
  bytes: number;
  createdAt: string;
}
export interface MailForwarder {
  source: string;
  target: string;
  createdAt: string;
}
export interface MailAutoresponder {
  email: string;
  subject: string;
  body: string;
  enabled: boolean;
  updatedAt: string;
}
export interface MailDKIMInfo {
  domain: string;
  selector: string;
  enabled: boolean;
  dnsName?: string;
  dnsRecord?: string;
  dnsApplied: boolean;
}
export interface MailDNSOptions {
  spf?: boolean;
  dmarcPolicy?: "none" | "quarantine" | "reject" | "";
  dkim?: boolean;
  mx?: boolean;
}
export interface MailDNSResult {
  applied: Record<string, string>;
  errors?: string[];
}
export interface MailDomainsResponse {
  domains: string[];
}
export interface MailAccountsResponse {
  accounts: MailAccount[];
}
export interface MailForwardersResponse {
  forwarders: MailForwarder[];
}

// ---- v0.4: site operations (docs/api.md section 1.7) ----
export interface SiteSubdomain {
  name: string;
  createdAt: string;
}
export interface SiteRedirect {
  id: string;
  from: string;
  to: string;
  permanent: boolean;
}
export interface SiteBlockedIP {
  ip: string;
  note?: string;
  createdAt: string;
}
export interface SiteCronJob {
  id: string;
  schedule: string;
  command: string;
  comment?: string;
  createdAt: string;
  runAs?: string;
}
export interface SiteSubdomainsResponse {
  subdomains: SiteSubdomain[];
}
export interface SiteRedirectsResponse {
  redirects: SiteRedirect[];
}
export interface SiteBlockedIPsResponse {
  blockedIps: SiteBlockedIP[];
}
export interface SiteCronResponse {
  cron: SiteCronJob[];
}
export interface SiteUsage {
  domain: string;
  root: string;
  bytes: number;
  files: number;
}
export interface SiteDayStat {
  date: string;
  requests: number;
  bytes: number;
}
export interface SitePathStat {
  path: string;
  requests: number;
}
export interface SiteStats {
  domain: string;
  days: number;
  requests: number;
  bytes: number;
  perDay: SiteDayStat[];
  topPaths: SitePathStat[];
}
export interface SiteLogsResponse {
  domain: string;
  kind: string;
  lines: string[];
}

// ---- v0.4: backup schedule (docs/api.md section 1.8) ----
export interface BackupSchedule {
  enabled: boolean;
  frequency: "daily" | "weekly";
  time: string;
  weekday: number;
  keep: number;
  includeDatabases: boolean;
  uploads?: BackupUploadTarget[];
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  lastError?: string;
}

// ---- v0.5: toolbox (docs/api.md section 1.9) ----
export interface WafInfo {
  enabled: boolean;
  engine: string;
  note?: string;
}
export interface SiteCronEntry {
  domain: string;
  jobs: SiteCronJob[];
}
export interface CronAllResponse {
  sites: SiteCronEntry[];
}
export interface FtpAccount {
  name: string;
  home: string;
  uid: number;
  gid: number;
  site?: string;
  subdir?: string;
}
export interface FtpAccountsResponse {
  accounts: FtpAccount[];
}
export interface FtpStatusResponse {
  passwdFile: string;
  runAs: string;
  accounts: number;
}
export interface TermStatusResponse {
  enabled: boolean;
  user: string;
  shell: string;
  sessions: number;
}
export interface TermSession {
  id: string;
  user: string;
  shell: string;
  cols: number;
  rows: number;
  startedAt: string;
}
export interface SshKey {
  type: string;
  fingerprint: string;
  comment?: string;
  line: string;
}
export interface SshKeysResponse {
  keys: SshKey[];
}
export interface SshStatusResponse {
  user: string;
  keysFile: string;
  keyDir: string;
  port: number;
  hostname: string;
}
export interface SshGeneratedKey {
  name: string;
  type: string;
  comment?: string;
  fingerprint: string;
  publicKey: string;
  privateKey?: string;
}
export interface SshGeneratedKeysResponse {
  keys: SshGeneratedKey[];
}
export interface PmaStatusResponse {
  installed: boolean;
  dir?: string;
  port?: number;
  version?: string;
  urlPath?: string;
  reachable: boolean;
  authType?: string;
}
export interface PmaLoginCookie {
  name: string;
  value: string;
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
}
export interface PmaLoginResponse {
  port: number;
  urlPath: string;
  cookies: PmaLoginCookie[];
}
export interface RemoteMysqlUser {
  user: string;
  host: string;
}
export interface RemoteMysqlUsersResponse {
  users: RemoteMysqlUser[];
}
// ---- v0.6: app runtimes, process supervision, firewall and security ----

export type RuntimeKind = "static" | "php" | "node" | "python" | "go" | "ruby" | "custom";

export interface RuntimeInstall {
  kind: RuntimeKind;
  label: string;
  version: string;
  bin?: string;
  paths?: string[];
  default?: boolean;
}

export interface RuntimeKindInfo {
  kind: RuntimeKind;
  label: string;
  description: string;
  defaultPort?: number;
  versions: RuntimeInstall[];
  available: boolean;
}

export interface RuntimesResponse {
  runtimes: RuntimeKindInfo[];
  supervisor: { backend: string; note: string };
}

export type AppState = "running" | "stopped" | "error" | "unknown";

export interface AppStatus {
  state: AppState;
  pid?: number;
  startedAt?: string;
  uptimeSeconds?: number;
  detail?: string;
}

export interface AppInfo {
  id: string;
  site: string;
  name: string;
  kind: RuntimeKind;
  version?: string;
  bin?: string;
  command: string;
  dir: string;
  port: number;
  env?: Record<string, string>;
  healthPath?: string;
  runAs?: string;
  supervisor?: string;
  autoRestart: boolean;
  createdAt: string;
  updatedAt: string;
  status: AppStatus;
}

export interface AppsResponse {
  apps: AppInfo[];
}

export interface AppLogsResponse {
  lines: string[];
}

export interface CreateAppRequest {
  site: string;
  name: string;
  kind: RuntimeKind;
  version?: string;
  bin?: string;
  command: string;
  dir?: string;
  port?: number;
  env?: Record<string, string>;
  healthPath?: string;
  autoRestart?: boolean;
}

export interface FirewallRule {
  id: string;
  port: number;
  protocol: string;
  action: string;
  from?: string;
  comment?: string;
  createdAt: string;
}

export interface FirewallStatus {
  backend: string;
  available: boolean;
  enabled: boolean;
  detail?: string;
  defaults?: Record<string, string>;
  rules: FirewallRule[];
}

export interface Fail2banJail {
  name: string;
  banned: number;
  total: number;
  ips: string[];
  enabled: boolean;
}

export interface Fail2banInfo {
  installed: boolean;
  active: boolean;
  jails: Fail2banJail[];
  note?: string;
}

export interface ModsecInfo {
  moduleInstalled: boolean;
  modulePath?: string;
  crsInstalled: boolean;
  crsPath?: string;
  engine: string;
  note?: string;
}

export interface SecurityCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "info";
  detail: string;
  hint?: string;
}

export interface SecurityStatus {
  modsec: ModsecInfo;
  fail2ban: Fail2banInfo;
  ssh: {
    port: string;
    permitRootLogin: string;
    passwordAuthentication: string;
    pubkeyAuthentication: string;
  };
  checks: SecurityCheck[];
}
