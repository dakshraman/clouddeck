/**
 * Shared types between the panel UI, panel API routes, and the agent client.
 * This file mirrors docs/api.md exactly. Do not edit without updating docs/api.md first.
 */

export type TaskType = "site.create" | "site.delete" | "ssl.issue" | "backup.create" | "backup.restore" | "runtime.install" | "runtime.uninstall" | "phpmyadmin.install" | "php.extension.install" | "agent.install" | "agent.uninstall" | string;
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
  appTemplate?: string;
  appMeta?: Record<string, string>;
  git?: GitConfig;
}

export interface DeployRecord {
  id: string;
  commitHash?: string;
  commitMsg?: string;
  author?: string;
  trigger: "manual" | "webhook";
  status: "succeeded" | "failed" | "running" | "skipped";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  logs?: string;
}

export interface GitConfig {
  repoUrl?: string;
  branch?: string;
  buildCommand?: string;
  autoDeploy?: boolean;
  webhookSecret?: string;
  deployToken?: string;
  deployKeyPublic?: string;
  deployKeyPrivate?: string;
  lastCommitHash?: string;
  lastCommitMsg?: string;
  lastCommitAuthor?: string;
  lastCommitTime?: string;
  lastDeployAt?: string;
  lastDeployStatus?: "succeeded" | "failed" | "deploying" | "idle";
  history?: DeployRecord[];
}

export interface InstalledAppInfo {
  installed: boolean;
  template?: string;
  name?: string;
  version?: string;
  runtime?: string;
  status?: string;
  webroot?: string;
  adminUrl?: string;
  siteUrl?: string;
  meta?: Record<string, string>;
  installedAt?: string;
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
  appTemplate?: string;
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

export interface UpdateResponse {
  started: boolean;
  version: string;
  log?: string;
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

export interface FileChmodRequest {
  path: string;
  mode: string | number;
}

export interface FileCompressRequest {
  paths: string[];
  format: "tar.gz" | "zip";
  target: string;
}

export interface FileExtractRequest {
  archive: string;
  dest: string;
}

export interface FilePathResponse {
  path: string;
}

// --- MySQL (v0.2) ---

export interface MySQLStatus {
  available: boolean;
  version?: string;
  kind?: "mysql" | "mariadb" | "";
}

export interface MySQLDatabase {
  name: string;
  sizeBytes?: number;
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

export interface BackupUploadResponse {
  archive: BackupArchive;
  uploaded: boolean;
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
  jobs?: CronJob[];
  sites: SiteCronEntry[];
}

export interface CronJob {
  id: string;
  schedule: string;
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
  command: string;
  comment?: string;
  title?: string;
  user: string;
  enabled: boolean;
  preset?: string;
  created_at: string;
  updated_at: string;
  last_run?: string;
  last_status?: "success" | "failed" | string;
  last_output?: string;
  last_duration_ms?: number;
  last_exit_code?: number;
}

export interface CronPreset {
  id: string;
  name: string;
  schedule: string;
  description: string;
}

export interface CronExecutionRecord {
  id: string;
  job_id: string;
  job_title?: string;
  command: string;
  user: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  exit_code: number;
  output: string;
  success: boolean;
}

export interface CronRunResult {
  id: string;
  job_id: string;
  command: string;
  exit_code: number;
  output: string;
  duration_ms: number;
  success: boolean;
  ran_at: string;
}

export interface CronListResponse {
  jobs: CronJob[];
  sites?: SiteCronEntry[];
}

export interface CronHistoryResponse {
  history: CronExecutionRecord[];
}

export interface CronPresetsResponse {
  presets: CronPreset[];
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
export interface SshPasswordResponse {
  updated: boolean;
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

export type RuntimeKind = "static" | "php" | "node" | "python" | "go" | "ruby" | "java" | "docker" | "custom";

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
  installable?: Record<string, string[]>;
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

export interface PanelSSLStatus {
  enabled: boolean;
  type: "self-signed" | "letsencrypt" | "custom" | "none";
  domain?: string;
  issuer?: string;
  expiresAt?: string;
  subject?: string;
  port: number;
  cookieSecure: boolean;
}

export interface PanelSSLInstallRequest {
  type: "self-signed" | "letsencrypt" | "custom";
  domain?: string;
  email?: string;
  cert?: string;
  key?: string;
}

export interface DNSNameserversInfo {
  nameserver1: string;
  nameserver2: string;
  serverIP: string;
}

export interface SiteTunnelInfo {
  domain: string;
  publicUrl: string;
  startedAt: string;
  status: string;
}

export interface GlobalTunnelStatus {
  configured: boolean;
  status: "running" | "stopped" | "not_configured" | "error" | string;
  running: boolean;
  token?: string;
  startedAt?: string;
  error?: string;
}

export interface GlobalTunnelConfig {
  token: string;
  autoStart?: boolean;
}

export interface SiteSyncResult {
  dnsZoneCreated: boolean;
  mailDomainCreated: boolean;
  dkimApplied: boolean;
  records?: any[];
}

export interface PhpExtension {
  name: string;
  description?: string;
  installed: boolean;
  enabled: boolean;
}

export interface PhpExtensionsResponse {
  version: string;
  versions: string[];
  extensions: PhpExtension[];
}

export interface PhpExtensionToggleResponse {
  success: boolean;
  version: string;
  extension: string;
  enabled: boolean;
}

export interface PhpConfigResponse {
  version: string;
  versions: string[];
  path: string;
  directives: Record<string, string>;
}

export interface SetPhpConfigResponse {
  success: boolean;
  version: string;
  path: string;
  directives: Record<string, string>;
}

export interface AIAgentInfo {
  id: string;
  name: string;
  command: string;
  installed: boolean;
  version?: string;
  path?: string;
  description: string;
  capabilities: string[];
}

export interface AIAgentsResponse {
  agents: AIAgentInfo[];
}

export type DoctorSeverity = "critical" | "warning" | "info";

export interface DoctorIssue {
  id: string;
  severity: DoctorSeverity | string;
  title: string;
  description: string;
  fixable: boolean;
  fixType?: string;
}

export interface SiteDiagnosis {
  domain: string;
  healthScore: number;
  issues: DoctorIssue[];
  checkedAt: string;
}

export interface FixSiteIssueResponse {
  success: boolean;
  domain: string;
  fixType: string;
  message: string;
}

export interface ServerDiagnosis {
  healthScore: number;
  issues: DoctorIssue[];
  checkedAt: string;
  metrics?: Record<string, unknown>;
}

export interface FixServerIssueResponse {
  success: boolean;
  fixType: string;
  message: string;
}

export interface MaskedVaultKey {
  name: string;
  isSet: boolean;
  maskedVal: string;
}

export interface VaultKeysResponse {
  keys: MaskedVaultKey[];
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  prompt: string;
  history?: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  model: string;
  provider: string;
  actions?: string[];
  timestamp: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  modifiedAt?: string;
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
  error?: string;
}

// ---- Wave 1: In-Memory Caching (Redis/Valkey & Memcached) ----
export interface RedisInfo {
  installed: boolean;
  running: boolean;
  version?: string;
  daemon?: string;
  socketPath: string;
  port: number;
  memoryUsedHuman?: string;
  memoryPeakHuman?: string;
  totalKeys: number;
  uptimeSeconds: number;
  connectedClients: number;
}

export interface MemcachedInfo {
  installed: boolean;
  running: boolean;
  port: number;
}

export interface CachingStatusResponse {
  redis: RedisInfo;
  memcached?: MemcachedInfo;
}

export interface CachingToggleResponse {
  success: boolean;
  running: boolean;
  message?: string;
}

export interface CachingFlushResponse {
  success: boolean;
  message: string;
}

// ---- Wave 1: Multi-Channel Alerting ----
export interface AlertChannelConfig {
  enabled: boolean;
  webhookUrl?: string;
  botToken?: string;
  chatId?: string;
}

export interface AlertThresholds {
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
  serviceDown: boolean;
  cooldownMinutes: number;
}

export interface AlertsConfig {
  telegram: AlertChannelConfig;
  discord: AlertChannelConfig;
  slack: AlertChannelConfig;
  genericWebhook?: AlertChannelConfig;
  thresholds: AlertThresholds;
}

export interface AlertTestResponse {
  success: boolean;
  message: string;
}

// ---- Wave 1: AI Log Investigator ----
export interface LogInvestigationResult {
  domain: string;
  rootCause: string;
  explanation: string;
  fixSuggestions: string[];
  remediationCommand?: string;
  severity: "critical" | "warning" | "info";
  analyzedLines: number;
  timestamp: string;
}

// ---- Wave 1: FastCGI Microcaching ----
export interface FastCgiCacheConfig {
  enabled: boolean;
  durationMinutes: number;
  bypassCookies: string[];
  status?: "active" | "disabled";
}

export interface FastCgiCachePurgeResponse {
  success: boolean;
  message: string;
}

// ---- Wave 2: WordPress & Staging Engine ----
export interface WordPressPlugin {
  name: string;
  title: string;
  version: string;
  status: "active" | "inactive" | string;
  updateAvailable?: boolean;
}

export interface WordPressTheme {
  name: string;
  title: string;
  version: string;
  status: "active" | "inactive" | string;
  updateAvailable?: boolean;
}

export interface WordPressStatus {
  installed: boolean;
  version?: string;
  siteTitle?: string;
  adminEmail?: string;
  plugins: WordPressPlugin[];
  themes: WordPressTheme[];
  updatesAvailable: number;
}

export interface WordPressInstallRequest {
  title: string;
  adminUser: string;
  adminPassword?: string;
  adminEmail: string;
}

export interface WordPressLoginResponse {
  loginUrl: string;
  expiresAt?: string;
}

export interface WordPressStageRequest {
  targetSubdomain?: string;
}

export interface WordPressStageResponse {
  success: boolean;
  stagingDomain: string;
  message: string;
}

export interface WordPressUpdateRequest {
  type: "core" | "plugins" | "themes" | "all";
}

export interface WordPressUpdateResponse {
  success: boolean;
  message: string;
}

// ---- Wave 2: S3-Compatible Cloud Backup Destinations ----
export type CloudStorageProvider =
  | "cloudflare-r2"
  | "aws-s3"
  | "backblaze-b2"
  | "wasabi"
  | "minio"
  | "custom";

export interface BackupDestination {
  id: string;
  name: string;
  provider: CloudStorageProvider;
  endpoint?: string;
  bucket: string;
  region?: string;
  accessKey: string;
  secretKey?: string;
  prefix?: string;
  isDefault?: boolean;
  createdAt: string;
}

export interface BackupDestinationListResponse {
  destinations: BackupDestination[];
}

export interface BackupDestinationTestRequest {
  provider: CloudStorageProvider | string;
  endpoint?: string;
  bucket: string;
  region?: string;
  accessKey: string;
  secretKey: string;
  prefix?: string;
}

export interface BackupDestinationTestResponse {
  success: boolean;
  message: string;
}

// ---- Wave 2: Direct S3 Database Backup Schedules ----
export interface S3DatabaseBackupConfig {
  enabled: boolean;
  provider: CloudStorageProvider | string;
  endpoint?: string;
  bucket: string;
  accessKey?: string;
  secretKey?: string;
  access_key?: string;
  secret_key?: string;
  region?: string;
  prefix?: string;
  retentionDays?: number;
  retention_days?: number;
  frequency?: "daily" | "weekly";
  time?: string;
  database?: string;
  lastRunAt?: string | null;
  last_run_at?: string | null;
  nextRunAt?: string | null;
  next_run_at?: string | null;
  lastError?: string;
  last_error?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface S3DatabaseBackupArchive {
  database: string;
  key: string;
  sizeBytes: number;
  url?: string;
}

export interface S3DatabaseBackupResult {
  success: boolean;
  message: string;
  archives?: S3DatabaseBackupArchive[];
  pruned?: number;
  timestamp?: string;
}

// ---- Wave 3: cPanel Parity & Migration ----
export interface CpanelImportRequest {
  path?: string;
  archiveName?: string;
  overwrite?: boolean;
}

export interface CpanelImportResult {
  success: boolean;
  username: string;
  domainsRestored: string[];
  databasesRestored: string[];
  mailboxesRestored: string[];
  errors?: string[];
}

export interface MigrationRecord {
  id: string;
  source: "cpanel" | string;
  user: string;
  domains: string[];
  status: "completed" | "failed" | "in_progress" | string;
  createdAt: string;
  error?: string;
}

export interface MigrationHistoryResponse {
  migrations: MigrationRecord[];
}

// ---- Wave 3: Integrated Webmail ----
export interface WebmailStatus {
  installed: boolean;
  client: "roundcube" | "snappymail" | string;
  version?: string;
  url?: string;
}

export interface WebmailSsoRequest {
  email?: string;
}

export interface WebmailSsoResponse {
  url: string;
  expiresAt?: string;
}

// ---- Wave 3: Anti-Spam & Reputation ----
export interface SpamConfig {
  enabled: boolean;
  engine: "rspamd" | "spamassassin" | string;
  spamScoreThreshold: number;
  rejectScoreThreshold: number;
  greylistingEnabled: boolean;
}

export interface SpamStatusResponse {
  config: SpamConfig;
  running: boolean;
}

// ---- Wave 4: Multi-Tenant RBAC & Users ----
export type UserRole = "admin" | "client";

export interface UserQuota {
  diskMb?: number;
  maxDatabases?: number;
  maxMailboxes?: number;
}

export interface PanelUser {
  username: string;
  email?: string;
  role: UserRole;
  assignedDomains: string[];
  quota?: UserQuota;
  createdAt: string;
}

export interface UserListResponse {
  users: PanelUser[];
}

export interface CreateUserRequest {
  username: string;
  password?: string;
  email?: string;
  role: UserRole;
  assignedDomains?: string[];
  quota?: UserQuota;
}

export interface UpdateUserRequest {
  password?: string;
  email?: string;
  role?: UserRole;
  assignedDomains?: string[];
  quota?: UserQuota;
}

// ---- Wave 4: PostgreSQL Engine ----
export interface PostgresStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  port: number;
  socketPath?: string;
}

export interface PostgresDatabase {
  name: string;
  owner: string;
  encoding: string;
  sizeBytes?: number;
  sizeHuman?: string;
}

export interface PostgresDatabasesResponse {
  databases: PostgresDatabase[];
}

export interface PostgresUser {
  username: string;
  superuser: boolean;
  canCreateDb: boolean;
  connectionUri?: string;
}

export interface PostgresUsersResponse {
  users: PostgresUser[];
}

export interface CreatePostgresDatabaseRequest {
  name: string;
  owner?: string;
  encoding?: string;
}

export interface CreatePostgresUserRequest {
  username: string;
  password?: string;
  superuser?: boolean;
}

// ---- Wave 4: AI Security Posture & Hardening ----
export interface SecurityFinding {
  id: string;
  severity: "critical" | "warning" | "info" | "pass";
  title: string;
  description: string;
  remediation?: string;
  autoFixable: boolean;
}

export interface SecurityPosture {
  score: number;
  findings: SecurityFinding[];
  scannedAt: string;
  summary: string;
}

export interface HardenResponse {
  success: boolean;
  appliedFixes: string[];
  message: string;
}

// ---- Phase A: Zero-Downtime Atomic Git Deployments & Rollback ----
export interface GitRelease {
  id: string;
  name: string;
  path: string;
  commitHash?: string;
  commitMsg?: string;
  author?: string;
  createdAt: string;
  current: boolean;
  sizeBytes?: number;
}

export interface GitReleasesResponse {
  releases: GitRelease[];
  currentRelease?: string;
  atomicDeploy: boolean;
}

export interface GitRollbackRequest {
  releaseId?: string;
}

export interface GitRollbackResponse {
  success: boolean;
  previousRelease?: string;
  currentRelease: string;
  message?: string;
}

// ---- Phase A: Privacy-First Visitor & Traffic Analytics ----
export interface TrafficTimelinePoint {
  timestamp: string;
  requests: number;
  bandwidthBytes: number;
  uniqueVisitors?: number;
}

export interface StatusCodesBreakdown {
  "2xx": number;
  "3xx": number;
  "4xx": number;
  "5xx": number;
}

export interface TopUrlItem {
  path: string;
  count: number;
  bandwidthBytes?: number;
}

export interface ReferrerItem {
  referrer: string;
  count: number;
}

export interface BotCategoryItem {
  category: string;
  name: string;
  count: number;
}

export interface SiteAnalytics {
  domain: string;
  period: string;
  totalRequests: number;
  totalBandwidthBytes: number;
  uniqueVisitors: number;
  statusCodes: StatusCodesBreakdown;
  timeline: TrafficTimelinePoint[];
  topUrls: TopUrlItem[];
  referrers: ReferrerItem[];
  bots: BotCategoryItem[];
}

export interface SystemAnalytics {
  period: string;
  totalSites: number;
  totalRequests: number;
  totalBandwidthBytes: number;
  uniqueVisitors: number;
  statusCodes: StatusCodesBreakdown;
  topSites: { domain: string; requests: number; bandwidthBytes: number }[];
  timeline: TrafficTimelinePoint[];
}

// ---- Phase A: Wildcard SSL & DNS-01 Challenge ----
export interface DnsProviderInfo {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  requiredFields: string[];
}

export interface DnsProvidersResponse {
  providers: DnsProviderInfo[];
}

export interface WildcardSslRequest {
  provider: string;
  credentials?: Record<string, string>;
  email?: string;
  autoRenew?: boolean;
}

export interface WildcardSslResponse {
  success: boolean;
  certificate?: string;
  issuer?: string;
  domains: string[];
  expiresAt: string;
  dnsProvider: string;
  message?: string;
}

// ---- Phase A: WordPress Push Staging to Production ----
export interface WordPressPushStagingRequest {
  stagingSubdomain?: string;
  syncFiles?: boolean;
  syncDatabase?: boolean;
  takeBackup?: boolean;
}

export interface WordPressPushStagingResponse {
  success: boolean;
  backupId?: string;
  filesSynced?: number;
  dbUpdated?: boolean;
  message?: string;
}

// ---- Phase B: Multi-Server Fleet Orchestration ----
export interface FleetNodeStats {
  cpuUsagePct?: number;
  memoryUsagePct?: number;
  diskUsagePct?: number;
  sitesCount?: number;
  loadAverage?: string;
  uptimeSeconds?: number;
}

export interface FleetNode {
  id: string;
  name: string;
  host: string;
  port: number;
  tags?: string[];
  status: "online" | "offline" | "degraded" | "unreachable";
  lastPing?: string;
  latencyMs?: number;
  version?: string;
  stats?: FleetNodeStats;
  isCurrent?: boolean;
}

export interface FleetNodesResponse {
  nodes: FleetNode[];
  currentNodeId: string;
}

export interface CreateFleetNodeRequest {
  name: string;
  host: string;
  port?: number;
  apiKey?: string;
  tags?: string[];
}

export interface UpdateFleetNodeRequest {
  name?: string;
  host?: string;
  port?: number;
  apiKey?: string;
  tags?: string[];
}

export interface FleetOverview {
  totalNodes: number;
  onlineNodes: number;
  offlineNodes: number;
  totalSites: number;
  averageCpuUsage: number;
  averageMemoryUsage: number;
  averageDiskUsage: number;
  nodes: FleetNode[];
}

export interface FleetPingResponse {
  success: boolean;
  latencyMs: number;
  status: "online" | "offline" | "unreachable";
  message?: string;
}

// ---- Phase B: 1-Click App Store & Docker Compose Orchestrator ----
export interface AppTemplateEnvVar {
  key: string;
  label: string;
  description?: string;
  defaultValue?: string;
  required?: boolean;
  type?: "text" | "password" | "number" | "boolean";
}

export interface AppStoreTemplate {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: "CMS" | "Analytics" | "Automation" | "Storage" | "Security" | "Search" | "Productivity" | "Database" | "Backend";
  icon: string;
  defaultPort: number;
  websiteUrl?: string;
  githubUrl?: string;
  envVars: AppTemplateEnvVar[];
  minRamMb?: number;
}

export interface AppStoreCatalogResponse {
  dockerAvailable: boolean;
  dockerComposeAvailable: boolean;
  catalog: AppStoreTemplate[];
}

export interface InstalledAppStoreApp {
  id: string;
  templateId: string;
  name: string;
  domain?: string;
  port: number;
  status: "running" | "stopped" | "error" | "installing";
  installedAt: string;
  version?: string;
  composeDir: string;
  env?: Record<string, string>;
}

export interface AppStoreInstalledResponse {
  apps: InstalledAppStoreApp[];
}

export interface InstallAppStoreRequest {
  templateId: string;
  domain?: string;
  port?: number;
  env?: Record<string, string>;
}

export interface InstallCustomAppStoreRequest {
  name: string;
  domain?: string;
  composeYaml: string;
  envVars?: Record<string, string>;
}

export interface AppStoreActionRequest {
  action: "start" | "stop" | "restart" | "upgrade";
}

export interface AppStoreActionResponse {
  success: boolean;
  status: string;
  message?: string;
}

export interface AppStoreLogsResponse {
  logs: string;
}










