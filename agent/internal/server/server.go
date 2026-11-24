// Package server exposes the agent's HTTP/JSON API on the configured listen
// address. All routes use Go 1.22+ ServeMux patterns.
package server

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	stdlog "log"
	"net"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"clouddeck/agent/internal/agents"
	"clouddeck/agent/internal/alerts"
	"clouddeck/agent/internal/analytics"
	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/apps"
	"clouddeck/agent/internal/appstore"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/backup"
	"clouddeck/agent/internal/caching"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/cron"
	"clouddeck/agent/internal/dns"
	"clouddeck/agent/internal/doctor"
	"clouddeck/agent/internal/files"
	"clouddeck/agent/internal/firewall"
	"clouddeck/agent/internal/fleet"
	"clouddeck/agent/internal/ftp"
	"clouddeck/agent/internal/git"
	"clouddeck/agent/internal/mail"
	"clouddeck/agent/internal/migration"
	"clouddeck/agent/internal/mysql"
	"clouddeck/agent/internal/php"
	"clouddeck/agent/internal/phpmyadmin"
	"clouddeck/agent/internal/postgres"
	"clouddeck/agent/internal/processinfo"
	"clouddeck/agent/internal/rbac"
	"clouddeck/agent/internal/security"
	"clouddeck/agent/internal/services"
	"clouddeck/agent/internal/siteinfo"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/sshkeys"
	"clouddeck/agent/internal/ssl"
	"clouddeck/agent/internal/systeminfo"
	"clouddeck/agent/internal/tasks"
	"clouddeck/agent/internal/term"
	"clouddeck/agent/internal/tunnel"
	"clouddeck/agent/internal/wordpress"
)

// Version is the agent version reported by /v1/health.
const Version = "0.6.58"

const maxBodyBytes = 1 << 20

// Server wires the HTTP routes to the agent services.
type Server struct {
	cfg       config.Config
	eng       *tasks.Engine
	sites     *sites.Service
	ssl       *ssl.Issuer
	files     *files.Service
	mysql     *mysql.Service
	services  *services.Manager
	dns       *dns.Manager
	tunnel    *tunnel.Service
	backups   *backup.Service
	mail      *mail.Service
	siteinfo  *siteinfo.Service
	ftp       *ftp.Service
	term      *term.Service
	ssh       *sshkeys.Service
	pma       *phpmyadmin.Service
	apps      *apps.Service
	firewall  *firewall.Service
	security  *security.Service
	panelSSL  *ssl.PanelSSL
	audit     *audit.Log
	git       *git.Service
	agents    *agents.Manager
	cron      *cron.Service
	doctor    *doctor.Service
	caching   *caching.Service
	alerts    *alerts.Service
	wordpress *wordpress.Service
	migration *migration.Service
	postgres  *postgres.Service
	rbac      *rbac.Service
	analytics *analytics.Service
	fleet     *fleet.Service
	appstore  *appstore.Service
}

// New builds the HTTP handler.
func New(cfg config.Config, eng *tasks.Engine, siteSvc *sites.Service, sslIssuer *ssl.Issuer, fileSvc *files.Service, mysqlSvc *mysql.Service, svcMgr *services.Manager, dnsMgr *dns.Manager, backupSvc *backup.Service, mailSvc *mail.Service, siteInfoSvc *siteinfo.Service, ftpSvc *ftp.Service, termSvc *term.Service, sshSvc *sshkeys.Service, pmaSvc *phpmyadmin.Service, appSvc *apps.Service, fwSvc *firewall.Service, secSvc *security.Service, gitSvc *git.Service, auditLog *audit.Log) http.Handler {
	agentMgr := agents.New(cfg, auditLog)
	s := &Server{
		cfg:       cfg,
		eng:       eng,
		sites:     siteSvc,
		ssl:       sslIssuer,
		panelSSL:  ssl.NewPanelSSL(cfg),
		files:     fileSvc,
		mysql:     mysqlSvc,
		services:  svcMgr,
		dns:       dnsMgr,
		tunnel:    tunnel.New(cfg),
		backups:   backupSvc,
		mail:      mailSvc,
		siteinfo:  siteInfoSvc,
		ftp:       ftpSvc,
		term:      termSvc,
		ssh:       sshSvc,
		pma:       pmaSvc,
		apps:      appSvc,
		firewall:  fwSvc,
		security:  secSvc,
		git:       gitSvc,
		audit:     auditLog,
		agents:    agentMgr,
		cron:      cron.New(cfg, auditLog),
		doctor:    doctor.New(cfg, auditLog, agentMgr.Vault),
		caching:   caching.New(cfg, auditLog),
		alerts:    alerts.New(cfg, auditLog),
		wordpress: wordpress.New(cfg, siteSvc, mysqlSvc, auditLog, eng),
		migration: migration.New(cfg, siteSvc, mysqlSvc, mailSvc, auditLog, eng),
		postgres:  postgres.New(cfg, auditLog),
		rbac:      rbac.New(cfg, auditLog),
		analytics: analytics.New(cfg, eng.Store()),
		fleet:     fleet.New(cfg, auditLog),
		appstore:  appstore.New(cfg, siteSvc, auditLog),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/health", s.handleHealth)
	mux.HandleFunc("GET /v1/system", s.handleSystem)
	mux.HandleFunc("POST /v1/system/reboot", s.handleSystemReboot)
	mux.HandleFunc("POST /v1/update", s.handleUpdate)
	mux.HandleFunc("GET /v1/processes", s.handleProcesses)
	mux.HandleFunc("POST /v1/processes/{pid}/kill", s.handleKillProcess)
	mux.HandleFunc("GET /v1/php/versions", s.handlePHPVersions)
	mux.HandleFunc("GET /v1/sites", s.handleListSites)
	mux.HandleFunc("POST /v1/sites", s.handleCreateSite)
	mux.HandleFunc("GET /v1/sites/{domain}", s.handleGetSite)
	mux.HandleFunc("DELETE /v1/sites/{domain}", s.handleDeleteSite)
	mux.HandleFunc("POST /v1/sites/{domain}/ssl", s.handleIssueSSL)
	mux.HandleFunc("POST /v1/sites/{domain}/install-template", s.handleInstallTemplate)
	mux.HandleFunc("POST /v1/sites/{domain}/uninstall-template", s.handleUninstallTemplate)
	mux.HandleFunc("GET /v1/sites/{domain}/app-installation", s.handleGetInstalledApp)

	mux.HandleFunc("GET /v1/sites/{domain}/git", s.handleGetSiteGit)
	mux.HandleFunc("PUT /v1/sites/{domain}/git", s.handleSaveSiteGit)
	mux.HandleFunc("DELETE /v1/sites/{domain}/git", s.handleRemoveSiteGit)
	mux.HandleFunc("POST /v1/sites/{domain}/git/deploy", s.handleDeploySiteGit)
	mux.HandleFunc("GET /v1/sites/{domain}/git/history", s.handleGetSiteGitHistory)
	mux.HandleFunc("GET /v1/sites/{domain}/git/webhook-info", s.handleGetSiteGitWebhookInfo)
	mux.HandleFunc("POST /v1/sites/{domain}/git/webhook", s.handleWebhookSiteGit)

	mux.HandleFunc("GET /v1/sites/{domain}/files", s.handleFileList)
	mux.HandleFunc("GET /v1/sites/{domain}/files/content", s.handleFileRead)
	mux.HandleFunc("PUT /v1/sites/{domain}/files/content", s.handleFileWrite)
	mux.HandleFunc("GET /v1/sites/{domain}/files/download", s.handleFileDownload)
	mux.HandleFunc("POST /v1/sites/{domain}/files/upload", s.handleFileUpload)
	mux.HandleFunc("POST /v1/sites/{domain}/files/mkdir", s.handleFileMkdir)
	mux.HandleFunc("POST /v1/sites/{domain}/files/rename", s.handleFileRename)
	mux.HandleFunc("DELETE /v1/sites/{domain}/files", s.handleFileDelete)

	mux.HandleFunc("GET /v1/mysql/status", s.handleMySQLStatus)
	mux.HandleFunc("GET /v1/mysql/databases", s.handleMySQLListDatabases)
	mux.HandleFunc("POST /v1/mysql/databases", s.handleMySQLCreateDatabase)
	mux.HandleFunc("DELETE /v1/mysql/databases/{name}", s.handleMySQLDeleteDatabase)
	mux.HandleFunc("GET /v1/mysql/databases/{name}/export", s.handleMySQLExportDatabase)
	mux.HandleFunc("POST /v1/mysql/databases/{name}/import", s.handleMySQLImportDatabase)
	mux.HandleFunc("GET /v1/mysql/users", s.handleMySQLListUsers)
	mux.HandleFunc("POST /v1/mysql/users", s.handleMySQLCreateUser)
	mux.HandleFunc("DELETE /v1/mysql/users/{user}", s.handleMySQLDeleteUser)
	mux.HandleFunc("POST /v1/mysql/grants", s.handleMySQLGrant)

	mux.HandleFunc("GET /v1/services", s.handleListServices)
	mux.HandleFunc("POST /v1/services/{name}/restart", s.handleRestartService)
	mux.HandleFunc("POST /v1/services/{name}/stop", s.handleStopService)
	mux.HandleFunc("POST /v1/services/{name}/start", s.handleStartService)
	mux.HandleFunc("POST /v1/services/{name}/repair", s.handleRepairService)
	mux.HandleFunc("POST /api/services/{name}/restart", s.handleRestartService)
	mux.HandleFunc("POST /api/services/{name}/stop", s.handleStopService)
	mux.HandleFunc("POST /api/services/{name}/start", s.handleStartService)
	mux.HandleFunc("POST /api/services/{name}/repair", s.handleRepairService)

	mux.HandleFunc("GET /v1/dns/status", s.handleDNSStatus)
	mux.HandleFunc("POST /v1/dns/install", s.handleInstallDNS)
	mux.HandleFunc("GET /v1/dns/nameservers", s.handleGetDNSNameservers)
	mux.HandleFunc("PUT /v1/dns/nameservers", s.handleSetDNSNameservers)
	mux.HandleFunc("GET /v1/dns/zones", s.handleListDNSZones)
	mux.HandleFunc("POST /v1/dns/zones", s.handleCreateDNSZone)
	mux.HandleFunc("DELETE /v1/dns/zones/{zone}", s.handleDeleteDNSZone)
	mux.HandleFunc("GET /v1/dns/zones/{zone}/records", s.handleListDNSRecords)
	mux.HandleFunc("POST /v1/dns/zones/{zone}/records", s.handleAddDNSRecord)
	mux.HandleFunc("DELETE /v1/dns/zones/{zone}/records", s.handleDeleteDNSRecord)

	mux.HandleFunc("GET /v1/backups", s.handleListBackups)
	mux.HandleFunc("POST /v1/backups", s.handleCreateBackup)
	mux.HandleFunc("POST /v1/backups/upload", s.handleUploadBackup)
	mux.HandleFunc("GET /v1/backups/{id}", s.handleGetBackup)
	mux.HandleFunc("GET /v1/backups/{id}/download", s.handleDownloadBackup)
	mux.HandleFunc("POST /v1/backups/{id}/restore", s.handleRestoreBackup)
	mux.HandleFunc("DELETE /v1/backups/{id}", s.handleDeleteBackup)
	mux.HandleFunc("GET /v1/backups/schedule", s.handleGetBackupSchedule)
	mux.HandleFunc("PUT /v1/backups/schedule", s.handleSetBackupSchedule)
	mux.HandleFunc("POST /v1/backups/schedule/run", s.handleRunBackupSchedule)

	mux.HandleFunc("GET /v1/mail/status", s.handleMailStatus)
	mux.HandleFunc("GET /v1/mail/domains", s.handleMailListDomains)
	mux.HandleFunc("POST /v1/mail/domains", s.handleMailAddDomain)
	mux.HandleFunc("DELETE /v1/mail/domains/{domain}", s.handleMailDeleteDomain)
	mux.HandleFunc("GET /v1/mail/accounts", s.handleMailListAccounts)
	mux.HandleFunc("POST /v1/mail/accounts", s.handleMailCreateAccount)
	mux.HandleFunc("DELETE /v1/mail/accounts/{email}", s.handleMailDeleteAccount)
	mux.HandleFunc("POST /v1/mail/accounts/{email}/password", s.handleMailSetPassword)
	mux.HandleFunc("POST /v1/mail/accounts/{email}/quota", s.handleMailSetQuota)
	mux.HandleFunc("GET /v1/mail/forwarders", s.handleMailListForwarders)
	mux.HandleFunc("POST /v1/mail/forwarders", s.handleMailCreateForwarder)
	mux.HandleFunc("DELETE /v1/mail/forwarders/{source}", s.handleMailDeleteForwarder)
	mux.HandleFunc("GET /v1/mail/autoresponders/{email}", s.handleMailGetAutoresponder)
	mux.HandleFunc("PUT /v1/mail/autoresponders/{email}", s.handleMailSetAutoresponder)
	mux.HandleFunc("DELETE /v1/mail/autoresponders/{email}", s.handleMailDeleteAutoresponder)
	mux.HandleFunc("GET /v1/mail/dkim/{domain}", s.handleMailDKIMStatus)
	mux.HandleFunc("POST /v1/mail/dns/{domain}", s.handleMailApplyDNS)

	mux.HandleFunc("GET /v1/sites/{domain}/subdomains", s.handleListSubdomains)
	mux.HandleFunc("POST /v1/sites/{domain}/subdomains", s.handleCreateSubdomain)
	mux.HandleFunc("DELETE /v1/sites/{domain}/subdomains/{name}", s.handleDeleteSubdomain)
	mux.HandleFunc("GET /v1/sites/{domain}/redirects", s.handleListRedirects)
	mux.HandleFunc("POST /v1/sites/{domain}/redirects", s.handleAddRedirect)
	mux.HandleFunc("DELETE /v1/sites/{domain}/redirects/{id}", s.handleDeleteRedirect)
	mux.HandleFunc("GET /v1/sites/{domain}/cron", s.handleListCron)
	mux.HandleFunc("POST /v1/sites/{domain}/cron", s.handleAddCron)
	mux.HandleFunc("DELETE /v1/sites/{domain}/cron/{id}", s.handleDeleteCron)
	mux.HandleFunc("POST /v1/sites/{domain}/cron/{id}/run", s.handleRunCron)
	mux.HandleFunc("PUT /v1/sites/{domain}/php", s.handleSetSitePHP)
	mux.HandleFunc("GET /v1/sites/{domain}/security", s.handleListBlockedIPs)
	mux.HandleFunc("POST /v1/sites/{domain}/security/block", s.handleBlockIP)
	mux.HandleFunc("DELETE /v1/sites/{domain}/security/block/{ip}", s.handleUnblockIP)
	mux.HandleFunc("GET /v1/sites/{domain}/usage", s.handleSiteUsage)
	mux.HandleFunc("GET /v1/sites/{domain}/stats", s.handleSiteStats)
	mux.HandleFunc("GET /v1/sites/{domain}/logs", s.handleSiteLogs)
	mux.HandleFunc("POST /v1/sites/{domain}/dns-mail-sync", s.handleDNSMailSync)
	mux.HandleFunc("GET /v1/sites/{domain}/tunnel", s.handleGetTunnel)
	mux.HandleFunc("POST /v1/sites/{domain}/tunnel", s.handleStartTunnel)
	mux.HandleFunc("DELETE /v1/sites/{domain}/tunnel", s.handleStopTunnel)
	mux.HandleFunc("GET /v1/tunnels", s.handleListTunnels)
	mux.HandleFunc("GET /v1/tunnel/status", s.handleGetGlobalTunnelStatus)
	mux.HandleFunc("POST /v1/tunnel/start", s.handleStartGlobalTunnel)
	mux.HandleFunc("POST /v1/tunnel/stop", s.handleStopGlobalTunnel)
	mux.HandleFunc("POST /v1/tunnel/config", s.handleSaveGlobalTunnelConfig)

	// v0.5 — FTP accounts
	mux.HandleFunc("GET /v1/ftp/status", s.handleFTPStatus)
	mux.HandleFunc("GET /v1/ftp/accounts", s.handleFTPList)
	mux.HandleFunc("POST /v1/ftp/accounts", s.handleFTPCreate)
	mux.HandleFunc("DELETE /v1/ftp/accounts/{name}", s.handleFTPDelete)
	mux.HandleFunc("POST /v1/ftp/accounts/{name}/password", s.handleFTPSetPassword)

	// v0.5 — web terminal
	mux.HandleFunc("GET /v1/term/status", s.handleTermStatus)
	mux.HandleFunc("POST /v1/term/sessions", s.handleTermStart)
	mux.HandleFunc("GET /v1/term/sessions/{id}/stream", s.handleTermStream)
	mux.HandleFunc("POST /v1/term/sessions/{id}/input", s.handleTermInput)
	mux.HandleFunc("POST /v1/term/sessions/{id}/resize", s.handleTermResize)
	mux.HandleFunc("DELETE /v1/term/sessions/{id}", s.handleTermDelete)

	// v0.5 — SSH keys
	mux.HandleFunc("GET /v1/ssh/status", s.handleSSHStatus)
	mux.HandleFunc("GET /v1/ssh/keys", s.handleSSHListKeys)
	mux.HandleFunc("POST /v1/ssh/keys", s.handleSSHAddKey)
	mux.HandleFunc("DELETE /v1/ssh/keys", s.handleSSHDeleteKey)
	mux.HandleFunc("GET /v1/ssh/keys/generated", s.handleSSHListGenerated)
	mux.HandleFunc("POST /v1/ssh/keys/generated", s.handleSSHGenerateKey)
	mux.HandleFunc("GET /v1/ssh/keys/generated/{name}", s.handleSSHReadGenerated)
	mux.HandleFunc("DELETE /v1/ssh/keys/generated/{name}", s.handleSSHDeleteGenerated)
	mux.HandleFunc("POST /v1/ssh/password", s.handleSSHSetPassword)

	// v0.5 — phpMyAdmin + remote MySQL
	mux.HandleFunc("GET /v1/phpmyadmin/status", s.handlePHPMYADMINStatus)
	mux.HandleFunc("POST /v1/phpmyadmin/install", s.handlePHPMYADMINInstall)
	mux.HandleFunc("POST /v1/phpmyadmin/login", s.handlePHPMYADMINLogin)
	mux.HandleFunc("GET /v1/mysql/remote", s.handleMySQLListRemote)
	mux.HandleFunc("POST /v1/mysql/remote", s.handleMySQLAddRemote)
	mux.HandleFunc("DELETE /v1/mysql/remote/{user}", s.handleMySQLDeleteRemote)

	// Scheduled tasks (system & user cron)
	mux.HandleFunc("GET /v1/cron", s.handleListCronJobs)
	mux.HandleFunc("GET /api/cron", s.handleListCronJobs)
	mux.HandleFunc("POST /v1/cron", s.handleCreateCronJob)
	mux.HandleFunc("POST /api/cron", s.handleCreateCronJob)
	mux.HandleFunc("GET /v1/cron/history", s.handleCronHistory)
	mux.HandleFunc("GET /api/cron/history", s.handleCronHistory)
	mux.HandleFunc("GET /v1/cron/presets", s.handleCronPresets)
	mux.HandleFunc("GET /api/cron/presets", s.handleCronPresets)
	mux.HandleFunc("GET /v1/cron/{id}", s.handleGetCronJob)
	mux.HandleFunc("GET /api/cron/{id}", s.handleGetCronJob)
	mux.HandleFunc("PUT /v1/cron/{id}", s.handleUpdateCronJob)
	mux.HandleFunc("PUT /api/cron/{id}", s.handleUpdateCronJob)
	mux.HandleFunc("DELETE /v1/cron/{id}", s.handleDeleteCronJob)
	mux.HandleFunc("DELETE /api/cron/{id}", s.handleDeleteCronJob)
	mux.HandleFunc("POST /v1/cron/{id}/run", s.handleRunCronJob)
	mux.HandleFunc("POST /api/cron/{id}/run", s.handleRunCronJob)
	mux.HandleFunc("GET /v1/sites/{domain}/waf", s.handleGetWAF)
	mux.HandleFunc("PUT /v1/sites/{domain}/waf", s.handleSetWAF)
	mux.HandleFunc("POST /v1/sites/{domain}/files/chmod", s.handleFileChmod)
	mux.HandleFunc("POST /v1/sites/{domain}/files/copy", s.handleFileCopy)
	mux.HandleFunc("POST /v1/sites/{domain}/files/compress", s.handleFileCompress)
	mux.HandleFunc("POST /v1/sites/{domain}/files/extract", s.handleFileExtract)

	// v0.6 — application runtimes, app workloads and firewall
	mux.HandleFunc("GET /v1/runtimes", s.handleListRuntimes)
	mux.HandleFunc("POST /v1/runtimes/install", s.handleRuntimeInstall)
	mux.HandleFunc("DELETE /v1/runtimes/{kind}/{version}", s.handleRuntimeUninstall)
	mux.HandleFunc("GET /v1/runtimes/php/extensions", s.handlePHPExtensions)
	mux.HandleFunc("POST /v1/runtimes/php/extensions/install", s.handlePHPExtensionInstall)
	mux.HandleFunc("POST /v1/runtimes/php/extensions/toggle", s.handlePHPExtensionToggle)
	mux.HandleFunc("GET /v1/runtimes/php/config", s.handlePHPConfigGet)
	mux.HandleFunc("POST /v1/runtimes/php/config", s.handlePHPConfigSet)
	mux.HandleFunc("GET /api/runtimes/php/extensions", s.handlePHPExtensions)
	mux.HandleFunc("POST /api/runtimes/php/extensions/install", s.handlePHPExtensionInstall)
	mux.HandleFunc("POST /api/runtimes/php/extensions/toggle", s.handlePHPExtensionToggle)
	mux.HandleFunc("GET /api/runtimes/php/config", s.handlePHPConfigGet)
	mux.HandleFunc("POST /api/runtimes/php/config", s.handlePHPConfigSet)
	mux.HandleFunc("GET /v1/apps", s.handleListApps)
	mux.HandleFunc("POST /v1/apps", s.handleCreateApp)
	mux.HandleFunc("GET /v1/sites/{domain}/apps", s.handleListApps)
	mux.HandleFunc("GET /v1/sites/{domain}/apps/{name}", s.handleGetApp)
	mux.HandleFunc("PUT /v1/sites/{domain}/apps/{name}", s.handleUpdateApp)
	mux.HandleFunc("DELETE /v1/sites/{domain}/apps/{name}", s.handleDeleteApp)
	mux.HandleFunc("POST /v1/sites/{domain}/apps/{name}/start", s.handleStartApp)
	mux.HandleFunc("POST /v1/sites/{domain}/apps/{name}/stop", s.handleStopApp)
	mux.HandleFunc("GET /v1/sites/{domain}/apps/{name}/logs", s.handleAppLogs)
	mux.HandleFunc("GET /v1/firewall", s.handleFirewallStatus)
	mux.HandleFunc("POST /v1/firewall/rules", s.handleFirewallAddRule)
	mux.HandleFunc("DELETE /v1/firewall/rules/{id}", s.handleFirewallDeleteRule)
	mux.HandleFunc("PUT /v1/firewall", s.handleFirewallSetEnabled)
	mux.HandleFunc("GET /v1/security", s.handleSecurityStatus)
	mux.HandleFunc("GET /v1/security/modsec", s.handleModsecStatus)
	mux.HandleFunc("POST /v1/security/unban", s.handleSecurityUnban)
	mux.HandleFunc("PUT /v1/security/jails/{jail}", s.handleSecurityJail)

	// Panel SSL
	mux.HandleFunc("GET /v1/panel/ssl", s.handleGetPanelSSL)
	mux.HandleFunc("POST /v1/panel/ssl", s.handleInstallPanelSSL)
	mux.HandleFunc("DELETE /v1/panel/ssl", s.handleDisablePanelSSL)

	// AI Coding Agents
	mux.HandleFunc("GET /v1/agents", s.handleListAgents)
	mux.HandleFunc("GET /api/agents", s.handleListAgents)
	mux.HandleFunc("POST /v1/agents/install", s.handleAgentInstall)
	mux.HandleFunc("POST /api/agents/install", s.handleAgentInstall)
	mux.HandleFunc("POST /v1/agents/uninstall", s.handleAgentUninstall)
	mux.HandleFunc("POST /api/agents/uninstall", s.handleAgentUninstall)
	mux.HandleFunc("DELETE /v1/agents/{id}", s.handleAgentUninstall)
	mux.HandleFunc("DELETE /api/agents/{id}", s.handleAgentUninstall)
	mux.HandleFunc("GET /v1/agents/ollama/models", s.handleListOllamaModels)
	mux.HandleFunc("GET /api/agents/ollama/models", s.handleListOllamaModels)
	mux.HandleFunc("POST /v1/agents/ollama/pull", s.handleOllamaPull)
	mux.HandleFunc("POST /api/agents/ollama/pull", s.handleOllamaPull)
	mux.HandleFunc("GET /v1/agents/keys", s.handleGetAgentKeys)
	mux.HandleFunc("GET /api/agents/keys", s.handleGetAgentKeys)
	mux.HandleFunc("POST /v1/agents/keys", s.handleSetAgentKeys)
	mux.HandleFunc("POST /api/agents/keys", s.handleSetAgentKeys)
	mux.HandleFunc("POST /v1/agents/chat", s.handleAgentChat)
	mux.HandleFunc("POST /api/agents/chat", s.handleAgentChat)

	mux.HandleFunc("POST /v1/sites/{domain}/doctor", s.handleDiagnoseSite)
	mux.HandleFunc("POST /api/sites/{domain}/doctor", s.handleDiagnoseSite)
	mux.HandleFunc("POST /v1/sites/{domain}/doctor/fix", s.handleFixSiteIssue)
	mux.HandleFunc("POST /api/sites/{domain}/doctor/fix", s.handleFixSiteIssue)
	mux.HandleFunc("POST /v1/system/doctor", s.handleDiagnoseServer)
	mux.HandleFunc("POST /api/system/doctor", s.handleDiagnoseServer)
	mux.HandleFunc("POST /v1/system/doctor/fix", s.handleFixServerIssue)
	mux.HandleFunc("POST /api/system/doctor/fix", s.handleFixServerIssue)
	mux.HandleFunc("POST /v1/sites/{domain}/doctor/investigate-logs", s.handleInvestigateSiteLogs)
	mux.HandleFunc("POST /api/sites/{domain}/doctor/investigate-logs", s.handleInvestigateSiteLogs)

	// In-Memory Caching & Redis
	mux.HandleFunc("GET /v1/caching/status", s.handleCachingStatus)
	mux.HandleFunc("GET /api/caching/status", s.handleCachingStatus)
	mux.HandleFunc("POST /v1/caching/redis/toggle", s.handleRedisToggle)
	mux.HandleFunc("POST /api/caching/redis/toggle", s.handleRedisToggle)
	mux.HandleFunc("POST /v1/caching/redis/flush", s.handleRedisFlush)
	mux.HandleFunc("POST /api/caching/redis/flush", s.handleRedisFlush)

	// Multi-Channel Alerts
	mux.HandleFunc("GET /v1/alerts/config", s.handleGetAlertsConfig)
	mux.HandleFunc("GET /api/alerts/config", s.handleGetAlertsConfig)
	mux.HandleFunc("PUT /v1/alerts/config", s.handleUpdateAlertsConfig)
	mux.HandleFunc("PUT /api/alerts/config", s.handleUpdateAlertsConfig)
	mux.HandleFunc("POST /v1/alerts/config", s.handleUpdateAlertsConfig)
	mux.HandleFunc("POST /api/alerts/config", s.handleUpdateAlertsConfig)
	mux.HandleFunc("POST /v1/alerts/test", s.handleTestAlerts)
	mux.HandleFunc("POST /api/alerts/test", s.handleTestAlerts)

	// Site FastCGI Microcaching
	mux.HandleFunc("GET /v1/sites/{domain}/cache", s.handleGetSiteCache)
	mux.HandleFunc("GET /api/sites/{domain}/cache", s.handleGetSiteCache)
	mux.HandleFunc("PUT /v1/sites/{domain}/cache", s.handleSetSiteCache)
	mux.HandleFunc("PUT /api/sites/{domain}/cache", s.handleSetSiteCache)
	mux.HandleFunc("POST /v1/sites/{domain}/cache", s.handleSetSiteCache)
	mux.HandleFunc("POST /api/sites/{domain}/cache", s.handleSetSiteCache)
	mux.HandleFunc("POST /v1/sites/{domain}/cache/purge", s.handlePurgeSiteCache)
	mux.HandleFunc("POST /api/sites/{domain}/cache/purge", s.handlePurgeSiteCache)

	// WordPress Engine
	mux.HandleFunc("GET /v1/sites/{domain}/wordpress/status", s.handleGetWordPressStatus)
	mux.HandleFunc("GET /api/sites/{domain}/wordpress/status", s.handleGetWordPressStatus)
	mux.HandleFunc("POST /v1/sites/{domain}/wordpress/install", s.handleInstallWordPress)
	mux.HandleFunc("POST /api/sites/{domain}/wordpress/install", s.handleInstallWordPress)
	mux.HandleFunc("POST /v1/sites/{domain}/wordpress/stage", s.handleStageWordPress)
	mux.HandleFunc("POST /api/sites/{domain}/wordpress/stage", s.handleStageWordPress)
	mux.HandleFunc("POST /v1/sites/{domain}/wordpress/login", s.handleLoginWordPress)
	mux.HandleFunc("POST /api/sites/{domain}/wordpress/login", s.handleLoginWordPress)
	mux.HandleFunc("POST /v1/sites/{domain}/wordpress/update", s.handleUpdateWordPress)
	mux.HandleFunc("POST /api/sites/{domain}/wordpress/update", s.handleUpdateWordPress)

	// Backup Cloud Storage Destinations
	mux.HandleFunc("GET /v1/backups/destinations", s.handleListBackupDestinations)
	mux.HandleFunc("GET /api/backups/destinations", s.handleListBackupDestinations)
	mux.HandleFunc("POST /v1/backups/destinations", s.handleSaveBackupDestination)
	mux.HandleFunc("POST /api/backups/destinations", s.handleSaveBackupDestination)
	mux.HandleFunc("DELETE /v1/backups/destinations/{id}", s.handleDeleteBackupDestination)
	mux.HandleFunc("DELETE /api/backups/destinations/{id}", s.handleDeleteBackupDestination)
	mux.HandleFunc("POST /v1/backups/destinations/test", s.handleTestBackupDestination)
	mux.HandleFunc("POST /api/backups/destinations/test", s.handleTestBackupDestination)

	// Direct S3 Database Backup Schedules
	mux.HandleFunc("GET /v1/backups/database/s3", s.handleGetS3DatabaseBackupConfig)
	mux.HandleFunc("GET /api/backups/database/s3", s.handleGetS3DatabaseBackupConfig)
	mux.HandleFunc("PUT /v1/backups/database/s3", s.handleSaveS3DatabaseBackupConfig)
	mux.HandleFunc("PUT /api/backups/database/s3", s.handleSaveS3DatabaseBackupConfig)
	mux.HandleFunc("POST /v1/backups/database/s3", s.handleSaveS3DatabaseBackupConfig)
	mux.HandleFunc("POST /api/backups/database/s3", s.handleSaveS3DatabaseBackupConfig)
	mux.HandleFunc("POST /v1/backups/database/s3/run", s.handleRunS3DatabaseBackup)
	mux.HandleFunc("POST /api/backups/database/s3/run", s.handleRunS3DatabaseBackup)
	mux.HandleFunc("POST /v1/backups/database/s3/test", s.handleTestS3DatabaseBackup)
	mux.HandleFunc("POST /api/backups/database/s3/test", s.handleTestS3DatabaseBackup)

	// cPanel Migration Importer
	mux.HandleFunc("POST /v1/migrations/cpanel/upload", s.handleUploadMigration)
	mux.HandleFunc("POST /api/migrations/cpanel/upload", s.handleUploadMigration)
	mux.HandleFunc("POST /v1/migrations/cpanel/import", s.handleImportMigration)
	mux.HandleFunc("POST /api/migrations/cpanel/import", s.handleImportMigration)
	mux.HandleFunc("GET /v1/migrations/history", s.handleListMigrationHistory)
	mux.HandleFunc("GET /api/migrations/history", s.handleListMigrationHistory)

	// Integrated Webmail
	mux.HandleFunc("GET /v1/mail/webmail/status", s.handleGetWebmailStatus)
	mux.HandleFunc("GET /api/mail/webmail/status", s.handleGetWebmailStatus)
	mux.HandleFunc("POST /v1/mail/webmail/install", s.handleInstallWebmail)
	mux.HandleFunc("POST /api/mail/webmail/install", s.handleInstallWebmail)
	mux.HandleFunc("POST /v1/mail/webmail/sso", s.handleWebmailSSO)
	mux.HandleFunc("POST /api/mail/webmail/sso", s.handleWebmailSSO)

	// Anti-Spam Filter & Reputation Management
	mux.HandleFunc("GET /v1/mail/spam/status", s.handleGetSpamStatus)
	mux.HandleFunc("GET /api/mail/spam/status", s.handleGetSpamStatus)
	mux.HandleFunc("PUT /v1/mail/spam/config", s.handleUpdateSpamConfig)
	mux.HandleFunc("PUT /api/mail/spam/config", s.handleUpdateSpamConfig)
	mux.HandleFunc("POST /v1/mail/spam/config", s.handleUpdateSpamConfig)
	mux.HandleFunc("POST /api/mail/spam/config", s.handleUpdateSpamConfig)

	// Multi-Tenant Sub-Accounts / RBAC
	mux.HandleFunc("GET /v1/users", s.handleListUsers)
	mux.HandleFunc("GET /api/users", s.handleListUsers)
	mux.HandleFunc("POST /v1/users", s.handleCreateUser)
	mux.HandleFunc("POST /api/users", s.handleCreateUser)
	mux.HandleFunc("PUT /v1/users/{username}", s.handleUpdateUser)
	mux.HandleFunc("PUT /api/users/{username}", s.handleUpdateUser)
	mux.HandleFunc("DELETE /v1/users/{username}", s.handleDeleteUser)
	mux.HandleFunc("DELETE /api/users/{username}", s.handleDeleteUser)

	// PostgreSQL Database Engine
	mux.HandleFunc("GET /v1/postgres/status", s.handlePostgresStatus)
	mux.HandleFunc("GET /api/postgres/status", s.handlePostgresStatus)
	mux.HandleFunc("GET /v1/postgres/databases", s.handlePostgresListDatabases)
	mux.HandleFunc("GET /api/postgres/databases", s.handlePostgresListDatabases)
	mux.HandleFunc("POST /v1/postgres/databases", s.handlePostgresCreateDatabase)
	mux.HandleFunc("POST /api/postgres/databases", s.handlePostgresCreateDatabase)
	mux.HandleFunc("DELETE /v1/postgres/databases/{name}", s.handlePostgresDeleteDatabase)
	mux.HandleFunc("DELETE /api/postgres/databases/{name}", s.handlePostgresDeleteDatabase)
	mux.HandleFunc("GET /v1/postgres/users", s.handlePostgresListUsers)
	mux.HandleFunc("GET /api/postgres/users", s.handlePostgresListUsers)
	mux.HandleFunc("POST /v1/postgres/users", s.handlePostgresCreateUser)
	mux.HandleFunc("POST /api/postgres/users", s.handlePostgresCreateUser)
	mux.HandleFunc("DELETE /v1/postgres/users/{name}", s.handlePostgresDeleteUser)
	mux.HandleFunc("DELETE /api/postgres/users/{name}", s.handlePostgresDeleteUser)

	// AI Security Posture & Hardening Scanner
	mux.HandleFunc("GET /v1/security/posture", s.handleGetSecurityPosture)
	mux.HandleFunc("GET /api/security/posture", s.handleGetSecurityPosture)
	mux.HandleFunc("POST /v1/security/scan", s.handleScanSecurityPosture)
	mux.HandleFunc("POST /api/security/scan", s.handleScanSecurityPosture)
	mux.HandleFunc("POST /v1/security/harden", s.handleHardenSecurity)
	mux.HandleFunc("POST /api/security/harden", s.handleHardenSecurity)

	// Zero-Downtime Atomic Git Deployments & Releases
	mux.HandleFunc("GET /v1/sites/{domain}/git/releases", s.handleGetSiteGitReleases)
	mux.HandleFunc("GET /api/sites/{domain}/git/releases", s.handleGetSiteGitReleases)
	mux.HandleFunc("POST /v1/sites/{domain}/git/rollback", s.handleRollbackSiteGit)
	mux.HandleFunc("POST /api/sites/{domain}/git/rollback", s.handleRollbackSiteGit)

	// Privacy-First Visitor & Traffic Analytics
	mux.HandleFunc("GET /v1/sites/{domain}/analytics", s.handleGetSiteAnalytics)
	mux.HandleFunc("GET /api/sites/{domain}/analytics", s.handleGetSiteAnalytics)
	mux.HandleFunc("GET /v1/system/analytics", s.handleGetSystemAnalytics)
	mux.HandleFunc("GET /api/system/analytics", s.handleGetSystemAnalytics)

	// Wildcard SSL & DNS-01 Providers
	mux.HandleFunc("GET /v1/ssl/providers", s.handleListSSLProviders)
	mux.HandleFunc("GET /api/ssl/providers", s.handleListSSLProviders)
	mux.HandleFunc("POST /v1/sites/{domain}/ssl/wildcard", s.handleIssueWildcardSSL)
	mux.HandleFunc("POST /api/sites/{domain}/ssl/wildcard", s.handleIssueWildcardSSL)

	// Bidirectional WordPress Staging Sync (Push Staging -> Production)
	mux.HandleFunc("POST /v1/sites/{domain}/wordpress/push-staging", s.handlePushStagingWordPress)
	mux.HandleFunc("POST /api/sites/{domain}/wordpress/push-staging", s.handlePushStagingWordPress)

	// Multi-Server Fleet Orchestration
	mux.HandleFunc("GET /v1/fleet/nodes", s.handleListFleetNodes)
	mux.HandleFunc("GET /api/fleet/nodes", s.handleListFleetNodes)
	mux.HandleFunc("POST /v1/fleet/nodes", s.handleRegisterFleetNode)
	mux.HandleFunc("POST /api/fleet/nodes", s.handleRegisterFleetNode)
	mux.HandleFunc("GET /v1/fleet/nodes/{id}", s.handleGetFleetNode)
	mux.HandleFunc("GET /api/fleet/nodes/{id}", s.handleGetFleetNode)
	mux.HandleFunc("PUT /v1/fleet/nodes/{id}", s.handleUpdateFleetNode)
	mux.HandleFunc("PUT /api/fleet/nodes/{id}", s.handleUpdateFleetNode)
	mux.HandleFunc("DELETE /v1/fleet/nodes/{id}", s.handleDeleteFleetNode)
	mux.HandleFunc("DELETE /api/fleet/nodes/{id}", s.handleDeleteFleetNode)
	mux.HandleFunc("POST /v1/fleet/nodes/{id}/ping", s.handlePingFleetNode)
	mux.HandleFunc("POST /api/fleet/nodes/{id}/ping", s.handlePingFleetNode)
	mux.HandleFunc("GET /v1/fleet/overview", s.handleGetFleetOverview)
	mux.HandleFunc("GET /api/fleet/overview", s.handleGetFleetOverview)

	// 1-Click App Store & Docker Compose Orchestrator
	mux.HandleFunc("GET /v1/appstore/catalog", s.handleGetAppStoreCatalog)
	mux.HandleFunc("GET /api/appstore/catalog", s.handleGetAppStoreCatalog)
	mux.HandleFunc("GET /v1/appstore/installed", s.handleListInstalledApps)
	mux.HandleFunc("GET /api/appstore/installed", s.handleListInstalledApps)
	mux.HandleFunc("POST /v1/appstore/install", s.handleInstallApp)
	mux.HandleFunc("POST /api/appstore/install", s.handleInstallApp)
	mux.HandleFunc("POST /v1/appstore/custom", s.handleInstallCustomApp)
	mux.HandleFunc("POST /api/appstore/custom", s.handleInstallCustomApp)
	mux.HandleFunc("POST /v1/appstore/{id}/action", s.handleAppAction)
	mux.HandleFunc("POST /api/appstore/{id}/action", s.handleAppAction)
	mux.HandleFunc("DELETE /v1/appstore/{id}", s.handleUninstallApp)
	mux.HandleFunc("DELETE /api/appstore/{id}", s.handleUninstallApp)
	mux.HandleFunc("GET /v1/appstore/{id}/logs", s.handleGetAppLogs)
	mux.HandleFunc("GET /api/appstore/{id}/logs", s.handleGetAppLogs)

	mux.HandleFunc("GET /v1/tasks", s.handleListTasks)
	mux.HandleFunc("GET /v1/tasks/{id}", s.handleGetTask)
	mux.HandleFunc("/", s.handleNotFound)

	return logRequests(s.authenticated(mux))
}

func (s *Server) authenticated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/health" || strings.HasSuffix(r.URL.Path, "/git/webhook") {
			next.ServeHTTP(w, r)
			return
		}
		if s.cfg.AuthToken == "" && (s.cfg.DryRun || s.cfg.AllowInsecureDev) {
			next.ServeHTTP(w, r)
			return
		}
		provided := r.Header.Get("X-CloudDeck-Agent-Token")
		if provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(s.cfg.AuthToken)) != 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":{"code":"unauthorized","message":"agent authentication required"}}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

type errorBody struct {
	Error errorInfo `json:"error"`
}

type errorInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	hostname, err := os.Hostname()
	if err != nil {
		hostname = ""
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"version":  Version,
		"hostname": hostname,
		"os":       runtime.GOOS + "/" + runtime.GOARCH,
		"dryRun":   s.cfg.DryRun,
	})
}

func (s *Server) handleSystem(w http.ResponseWriter, r *http.Request) {
	info := systeminfo.Collect()
	info.DryRun = s.cfg.DryRun
	info.AgentVersion = Version
	info.AgentTime = time.Now().UTC().Format(time.RFC3339)
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleSystemReboot(w http.ResponseWriter, r *http.Request) {
	if s.cfg.DryRun {
		writeError(w, apierr.Conflict("dry_run", "server reboots are disabled in dry-run mode"))
		return
	}
	if err := systeminfo.Reboot(s.cfg.RebootCmd, s.audit); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"rebooted": true})
}

func (s *Server) handleProcesses(w http.ResponseWriter, r *http.Request) {
	limit := processinfo.DefaultLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}
	writeJSON(w, http.StatusOK, processinfo.Collect(r.URL.Query().Get("sort"), limit))
}

func (s *Server) handleKillProcess(w http.ResponseWriter, r *http.Request) {
	pid, err := strconv.Atoi(r.PathValue("pid"))
	if err != nil || pid <= 0 {
		writeError(w, apierr.BadRequest("invalid_pid", "pid must be a positive integer"))
		return
	}
	killErr := processinfo.Kill(pid)
	s.recordKill(pid, killErr)
	if killErr != nil {
		writeError(w, killErr)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"pid": pid, "killed": true})
}

func (s *Server) recordKill(pid int, err error) {
	if s.audit == nil {
		return
	}
	rec := audit.Record{
		Action: "process.kill",
		Params: map[string]any{"pid": pid},
		Result: audit.ResultAccepted,
	}
	if err != nil {
		rec.Result = audit.ResultRejected
		rec.Error = err.Error()
	}
	// The signal was already delivered; an audit write failure must not turn
	// a completed kill into an error response.
	_ = s.audit.Append(rec)
}

func (s *Server) handlePHPVersions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"versions": php.Available(s.cfg.PHPBase)})
}

func (s *Server) handleListSites(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"sites": s.sites.List()})
}

func (s *Server) handleCreateSite(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Domain      string `json:"domain"`
		PHPVersion  string `json:"phpVersion"`
		AppTemplate string `json:"appTemplate"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	task, err := s.sites.CreateWithTemplate(req.Domain, req.PHPVersion, req.AppTemplate)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"taskId": task.ID})
}

func (s *Server) handleGetSite(w http.ResponseWriter, r *http.Request) {
	site, err := s.sites.Get(r.PathValue("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, site)
}

func (s *Server) handleDeleteSite(w http.ResponseWriter, r *http.Request) {
	task, err := s.sites.Delete(r.PathValue("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"taskId": task.ID})
}

func (s *Server) handleIssueSSL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	task, err := s.ssl.Issue(r.PathValue("domain"), req.Email)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"taskId": task.ID})
}

func (s *Server) handleInstallTemplate(w http.ResponseWriter, r *http.Request) {
	var req sites.TemplateInstallOptions
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	domain := r.PathValue("domain")

	// Ensure database and credentials exist in MySQL if database options were provided
	if req.DBName != "" && s.mysql != nil {
		_, _ = s.mysql.CreateDatabase(r.Context(), req.DBName)
		if req.DBUser != "" {
			hosts := []string{"localhost", "127.0.0.1"}
			if req.DBHost != "" {
				h := req.DBHost
				if hostOnly, _, err := net.SplitHostPort(h); err == nil {
					h = hostOnly
				}
				if h != "localhost" && h != "127.0.0.1" && !strings.HasPrefix(h, "/") {
					hosts = append(hosts, h)
				}
			}
			for _, host := range hosts {
				_ = s.mysql.EnsureUser(r.Context(), req.DBUser, req.DBPass, host)
				_ = s.mysql.Grant(r.Context(), req.DBUser, host, req.DBName, "all")
			}
		}
	}

	logs, err := s.sites.InstallTemplate(r.Context(), domain, req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "installed",
		"template": req.Template,
		"domain":   domain,
		"logs":     logs,
	})
}

func (s *Server) handleUninstallTemplate(w http.ResponseWriter, r *http.Request) {
	var req sites.TemplateUninstallOptions
	_ = decodeBody(w, r, &req) // defaults are fine if empty body
	domain := r.PathValue("domain")
	if err := s.sites.UninstallTemplate(r.Context(), domain, req); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "uninstalled",
		"domain": domain,
	})
}

func (s *Server) handleGetInstalledApp(w http.ResponseWriter, r *http.Request) {
	domain := r.PathValue("domain")
	info, err := s.sites.GetInstalledApp(r.Context(), domain)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"tasks": s.eng.List()})
}

func (s *Server) handleGetTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	task, ok := s.eng.Get(id)
	if !ok {
		writeError(w, apierr.NotFound("task_not_found", fmt.Sprintf("task %q does not exist", id)))
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (s *Server) handleNotFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, apierr.NotFound("not_found", fmt.Sprintf("no endpoint for %s %s", r.Method, r.URL.Path)))
}

// ---- v0.4 mail endpoints (docs/api.md section 1.6) ----

func (s *Server) checkMail(w http.ResponseWriter) bool {
	if s.mail == nil {
		writeError(w, apierr.New(http.StatusServiceUnavailable, "mail_unavailable", "mail service is not configured"))
		return false
	}
	return true
}

func (s *Server) handleMailStatus(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	writeJSON(w, http.StatusOK, s.mail.Status())
}

func (s *Server) handleMailListDomains(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	domains, err := s.mail.ListDomains()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"domains": domains})
}

func (s *Server) handleMailAddDomain(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	var req struct {
		Domain string `json:"domain"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := s.mail.AddDomain(req.Domain); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"domain": req.Domain})
}

func (s *Server) handleMailDeleteDomain(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	domain := r.PathValue("domain")
	if err := s.mail.DeleteDomain(domain); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"domain": domain, "deleted": true})
}

func (s *Server) handleMailListAccounts(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	accounts, err := s.mail.ListAccounts(r.URL.Query().Get("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"accounts": accounts})
}

func (s *Server) handleMailCreateAccount(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		QuotaMB  int64  `json:"quotaMb"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	account, err := s.mail.CreateAccount(req.Email, req.Password, req.QuotaMB)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, account)
}

func (s *Server) handleMailDeleteAccount(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	email := r.PathValue("email")
	if err := s.mail.DeleteAccount(email); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"email": email, "deleted": true})
}

func (s *Server) handleMailSetPassword(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	email := r.PathValue("email")
	if err := s.mail.SetPassword(email, req.Password); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"email": email, "updated": true})
}

func (s *Server) handleMailSetQuota(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	var req struct {
		QuotaMB int64 `json:"quotaMb"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	email := r.PathValue("email")
	if err := s.mail.SetQuota(email, req.QuotaMB); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"email": email, "quotaMb": req.QuotaMB, "updated": true})
}

func (s *Server) handleMailListForwarders(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	forwarders, err := s.mail.ListForwarders(r.URL.Query().Get("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"forwarders": forwarders})
}

func (s *Server) handleMailCreateForwarder(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	var req struct {
		Source string `json:"source"`
		Target string `json:"target"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := s.mail.CreateForwarder(req.Source, req.Target); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"source": req.Source, "target": req.Target})
}

func (s *Server) handleMailDeleteForwarder(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	source := r.PathValue("source")
	if err := s.mail.DeleteForwarder(source); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"source": source, "deleted": true})
}

func (s *Server) handleMailGetAutoresponder(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	a, err := s.mail.GetAutoresponder(r.PathValue("email"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) handleMailSetAutoresponder(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	var req struct {
		Subject string `json:"subject"`
		Body    string `json:"body"`
		Enabled bool   `json:"enabled"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	a, err := s.mail.SetAutoresponder(mail.Autoresponder{
		Email:   r.PathValue("email"),
		Subject: req.Subject,
		Body:    req.Body,
		Enabled: req.Enabled,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) handleMailDeleteAutoresponder(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	email := r.PathValue("email")
	if err := s.mail.DeleteAutoresponder(email); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"email": email, "deleted": true})
}

func (s *Server) handleMailDKIMStatus(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	info, err := s.mail.DKIMStatus(r.PathValue("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleMailApplyDNS(w http.ResponseWriter, r *http.Request) {
	if !s.checkMail(w) {
		return
	}
	var req mail.DNSOptions
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	result, err := s.mail.ApplyDNS(r.Context(), r.PathValue("domain"), req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// ---- v0.4 site operation endpoints (docs/api.md section 1.7) ----

func (s *Server) handleListSubdomains(w http.ResponseWriter, r *http.Request) {
	subdomains, err := s.sites.ListSubdomains(r.PathValue("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"subdomains": subdomains})
}

func (s *Server) handleCreateSubdomain(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	task, err := s.sites.CreateSubdomain(r.PathValue("domain"), req.Name)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"taskId": task.ID})
}

func (s *Server) handleDeleteSubdomain(w http.ResponseWriter, r *http.Request) {
	task, err := s.sites.DeleteSubdomain(r.PathValue("domain"), r.PathValue("name"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"taskId": task.ID})
}

func (s *Server) handleListRedirects(w http.ResponseWriter, r *http.Request) {
	redirects, err := s.sites.ListRedirects(r.PathValue("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"redirects": redirects})
}

func (s *Server) handleAddRedirect(w http.ResponseWriter, r *http.Request) {
	var req struct {
		From      string `json:"from"`
		To        string `json:"to"`
		Permanent bool   `json:"permanent"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	redirects, err := s.sites.AddRedirect(r.PathValue("domain"), req.From, req.To, req.Permanent)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"redirects": redirects})
}

func (s *Server) handleDeleteRedirect(w http.ResponseWriter, r *http.Request) {
	redirects, err := s.sites.DeleteRedirect(r.PathValue("domain"), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"redirects": redirects})
}

func (s *Server) handleListCron(w http.ResponseWriter, r *http.Request) {
	cron, err := s.sites.ListCron(r.PathValue("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"cron": cron})
}

func (s *Server) handleAddCron(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Schedule string `json:"schedule"`
		Command  string `json:"command"`
		Comment  string `json:"comment"`
		RunAs    string `json:"runAs"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	cron, err := s.sites.AddCron(r.PathValue("domain"), req.Schedule, req.Command, req.Comment, req.RunAs)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"cron": cron})
}

func (s *Server) handleDeleteCron(w http.ResponseWriter, r *http.Request) {
	cron, err := s.sites.DeleteCron(r.PathValue("domain"), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"cron": cron})
}

func (s *Server) handleRunCron(w http.ResponseWriter, r *http.Request) {
	result, err := s.sites.RunCron(r.Context(), r.PathValue("domain"), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleSetSitePHP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Version string `json:"version"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	site, err := s.sites.SetPHPVersion(r.PathValue("domain"), req.Version)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, site)
}

func (s *Server) handleListBlockedIPs(w http.ResponseWriter, r *http.Request) {
	blocked, err := s.sites.ListBlockedIPs(r.PathValue("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"blockedIps": blocked})
}

func (s *Server) handleBlockIP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IP   string `json:"ip"`
		Note string `json:"note"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	blocked, err := s.sites.BlockIP(r.PathValue("domain"), req.IP, req.Note)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"blockedIps": blocked})
}

func (s *Server) handleUnblockIP(w http.ResponseWriter, r *http.Request) {
	blocked, err := s.sites.UnblockIP(r.PathValue("domain"), r.PathValue("ip"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"blockedIps": blocked})
}

func (s *Server) handleSiteUsage(w http.ResponseWriter, r *http.Request) {
	usage, err := s.siteinfo.Usage(r.PathValue("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, usage)
}

func (s *Server) handleSiteStats(w http.ResponseWriter, r *http.Request) {
	days := 7
	if raw := r.URL.Query().Get("days"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil {
			writeError(w, apierr.BadRequest("invalid_days", "days must be an integer"))
			return
		}
		days = n
	}
	stats, err := s.siteinfo.Stats(r.PathValue("domain"), days)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleSiteLogs(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	if kind == "" {
		kind = "access"
	}
	lines := 200
	if raw := r.URL.Query().Get("lines"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil {
			writeError(w, apierr.BadRequest("invalid_lines", "lines must be an integer"))
			return
		}
		lines = n
	}
	tail, err := s.siteinfo.Logs(r.PathValue("domain"), kind, lines)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"domain": r.PathValue("domain"), "kind": kind, "lines": tail})
}

// ---- v0.4 backup schedule endpoints (docs/api.md section 1.8) ----

func (s *Server) handleGetBackupSchedule(w http.ResponseWriter, r *http.Request) {
	sc, err := s.backups.GetSchedule()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, sc)
}

func (s *Server) handleSetBackupSchedule(w http.ResponseWriter, r *http.Request) {
	var req backup.Schedule
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	sc, err := s.backups.SetSchedule(req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, sc)
}

func (s *Server) handleRunBackupSchedule(w http.ResponseWriter, r *http.Request) {
	started, err := s.backups.RunScheduledNow()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"started": started})
}

func decodeBody(w http.ResponseWriter, r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err := dec.Decode(v); err != nil {
		return apierr.BadRequest("invalid_json", fmt.Sprintf("invalid request body: %v", err))
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		stdlog.Printf("server: encode response: %v", err)
	}
}

func writeError(w http.ResponseWriter, err error) {
	if apiErr, ok := apierr.As(err); ok {
		writeJSON(w, apiErr.Status, errorBody{Error: errorInfo{Code: apiErr.Code, Message: apiErr.Message}})
		return
	}
	writeJSON(w, http.StatusInternalServerError, errorBody{Error: errorInfo{Code: "internal", Message: err.Error()}})
}

// logRequests writes one line per request and records the response status.
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		stdlog.Printf("%s %s -> %d (%s)", r.Method, r.URL.Path, sw.status, time.Since(start).Round(time.Millisecond))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

// Flush forwards to the underlying writer so SSE handlers (terminal streams)
// keep working behind the logging middleware.
func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
