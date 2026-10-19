# cPanel/WHM UI study — design brief for CloudDeck

Captured from a licensed-install trial of cPanel & WHM 11.138.0.15 (AlmaLinux 9, Jupiter
theme) on 2026-10-19. All observations below are **behavior/format notes** from using the
installed product; no cPanel code, CSS, assets, or text are copied into CloudDeck.

Capture artifacts (local, not shipped): `~/AppData/Local/Temp/opencode/cd-capture/*.png|txt`

## 1. WHM (admin) shell

- **Top bar (dark, full width)**: left = hamburger (main menu toggle) + WHM wordmark.
  Right = compact account/server line: `Username root`, `Hostname <fqdn>`, `OS`,
  `cPanel Version`, `Load Averages` (three numbers, up/down arrows), `Server Monitoring`
  chip ("No alerts" = green pill). Center-right = global search with keyboard hint `(/)`.
- **Left drawer menu**: dark navy full-height; sections collapsible with chevrons:
  Server Configuration, Support, Networking Setup, Security Center, Server Contacts,
  Resellers, Service Configuration, Locales, Backup, Clusters, System Reboot, Server
  Status, Account Information (sub: List Accounts, List Parked Domains, List Subdomains,
  List Suspended Accounts, Show Accounts Over Quota, View Bandwidth Usage),
  Account Functions, Transfers, Themes, Packages, DNS Functions, Database Services,
  IP Functions, Software, Email, System Health, cPanel, SSL/TLS, Market, Restart
  Services, Development, Plugins. Drawer has `Expand` / `Collapse` (all groups) buttons
  and its own "Search Tools (Ctrl /)" filter box.
- **Dashboard content**: "Important next steps" checklist (dismissable) with 3 items
  (Contact info, Nameservers, Ethernet device, DNS cluster); **Favorites** block with
  Edit Favorites; tool cards in a 3-column grid, each = icon + title + 1-line
  description; content grouped inside "application group" sections with collapse
  chevrons (Email, Files, Databases, Domains, Metrics, Security, Software, Advanced,
  Preferences). Right rail: `Statistics` box (Hostname, IPv4, Load Averages with
  trending arrow, OS, Product, User Analytics ID) and `Server Monitoring` promo card,
  then charts (CPU usage %, load average lines, Top processes).

## 2. cPanel (user) shell — Jupiter

- **Left rail**: dark navy (#1d2241-ish), cPanel wordmark top; items = icon + wrapping
  label (Tools, Social Media Management, Sitejet Builder, WordPress Management, Site
  Quality Monitoring). Content pane scrolls; rail is fixed.
- **Top bar (white)**: centered-left search `Search Tools (/)`, right = notifications
  bell (with badge dot) + profile icon.
- **Dashboard**: `Tools` page heading (large, light weight); each app group is one
  white card: header row (group icon + name + collapse chevron), then a 3-column
  grid of tools (2-tone pastel icon + link label, some with tiny warning badges).
  Below: `General Information` card — label/value rows: Current User, Primary Domain
  (with external-link icon), SSL Certificate (inline warning: "Self-signed" + yellow
  "Your domain is at risk!" strip + "Add SSL Certificate" link), Shared IP Address,
  Home Directory, Last Login IP Address. Promo card (bordered, CTA button).
  Info banner top: orange left rule + pale yellow background + bold prefix ("TRIAL
  LICENSE:") — used for system-wide notices.
- **Tool pages** (classic density inside the shell): plain document layout, page title,
  one-line description with docs link, then forms in single column (~55% width),
  blue primary buttons, sections separated by headings (e.g. Databases:
  "Create New Database" / "Modify Databases" (Check / Repair) / "Current Databases"
  search + table; FTP: "Add FTP Account" — Log In with `@domain` suffix, Password +
  Password (again), Strength bar "Very Weak (0/100)" + "Password Generator" button,
  Directory with `/home/<user>/` prefix, Quota = radio "2000 MB" / "Unlimited",
  then "FTP Accounts" table (Log In | Path | Usage / Quota | Actions:
  Change Quota, Configure FTP Client, Delete) and a distinct "Special FTP Accounts"
  table (Type | Log In | Path | Usage / Quota | Actions).
- **File Manager**: owns a dark header bar (app name + search scope select + Go +
  Settings); action toolbar row (File, Folder, Copy, Move, Upload, Download, Delete,
  Restore, Rename, Edit, HTML Editor, Permissions, View, Extract, Compress — greyed
  when disabled); left directory tree with expand +/− ; main pane = table with
  Name / Size / Last Modified / Type / Permissions and breadcrumb path row
  (Home, Up One Level, Back, Forward, Reload, Select All, Unselect All, View Trash,
  Empty Trash). Directory names act as links.
- **List Accounts (WHM)**: breadcrumb `Home / Account Information / List Accounts`
  + help icon; title with icon; `Create a New Account` primary button; filter card =
  "Search For" + Find, "Search By" radio set (Username/Domain, Domain, Username,
  Reseller/Owner, Package, IP Address), "Filter By" radios (None, Suspended),
  "Apply Filter"; pagination line `Page: First 1 Last All  Per Page: 30  Showing all
  1 records` + note "Suspended accounts are highlighted in red." Table columns:
  Domain, IP Address, Quota, Disk Used, Package, Reseller/Owner, Username, actions.

## 3. Patterns worth adopting in CloudDeck (original implementation)

1. **Two-level nav**: fixed dark rail with collapsible groups (icon + label), plus a
   global filter box in the rail and a global search with `/` shortcut in the top bar.
2. **Grouped tool tiles** on the dashboard (3-col grid, icon + name + description),
   groups collapse; a right rail with "General Information"-style key/value card and
   server statistics (load average trending, version, hostname).
3. **Dense tables** with all actions in one toolbar above and inline row actions;
   status colours: suspended/pending highlighted; quota shown as `used / limit`.
4. **Forms**: single-column, label above input, inline hint text, destructive actions
   in red, primary in brand colour; password fields with strength meter + generator;
   inputs that append a fixed suffix/prefix (login `@domain`, path `/home/user/`).
5. **Info banners**: neutral info (grey/light), warning (orange rule + pale yellow),
   all with bold lead-in; dismissable "next steps" checklist on the dashboard.
6. **Breadcrumbs** on every page + help icon linking to docs.
7. **Feedback**: instant inline validation, page-level notices, no modal-for-everything.

## 4. Feature inventory observed (for parity backlog)

- FTP: accounts CRUD, change password, change quota, configure FTP client,
  special/admin accounts, terminate sessions, anonymous FTP.
- Databases: create DB, check DB, repair DB, current DBs + search; DB users with
  privileges; remote access hosts with notes; per-user password change; phpMyAdmin.
- Files: file manager (full ops incl. trash/restore, permissions, extract/compress),
  disk usage, directory privacy (password-protected dirs), web disk, backups/restore.
- Account (WHM): list accounts w/ filters + suspend states, parked domains,
  subdomains, accounts over quota, bandwidth usage, create account wizard.

CloudDeck already covers: sites (CRUD + suspend), FTP accounts (CRUD), databases +
users, DNS zones/records, mail (domains/accounts/forwarders/autoresponders), backups,
cron, logs, SSL, WAF. Gaps to schedule: FTP password change + quota + client config,
DB check/repair, remote DB hosts with notes, dashboard checklist/favorites,
global search, account-over-quota views, directory privacy, file trash/restore.
