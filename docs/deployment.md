# CloudDeck deployment guide

Target: a fresh Ubuntu 24.04 VPS with root or sudo. Two components are deployed:

- **agent** — privileged worker; manages nginx, sites and certbot on the host
- **panel** — unprivileged Next.js UI; the only thing exposed to browsers (via TLS)

**Choose a topology first:**

| Topology | Use when | Layout |
|---|---|---|
| A — agent on the host | the VPS will host real websites (production-style) | nginx, agent and certbot run as system services; panel runs on 127.0.0.1 (step 3, option B) |
| B — full Docker Compose stack | evaluating CloudDeck / self-contained demo | agent + nginx + panel in containers; nothing installed system-wide (skip step 2) |

> **Security model:** the v0.1 agent API has **no authentication** — it trusts
> anything that can reach it. It must stay bound to `127.0.0.1:9090`. Only the
> panel is ever exposed, behind TLS.

## 1. Prerequisites

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot curl git
```

- `nginx` — serves your sites (topology A)
- `certbot` — Let's Encrypt certificates
- `git` — only for cloning the repo (steps 3 and 6)
- Go 1.23+ — optional, only when building the agent from source; the installer
  downloads a release binary when no checkout/toolchain is present

Check that nginx is running:

```bash
systemctl status nginx --no-pager
```

## 2. Install the agent (topology A; skip for the full compose stack)

The installer builds from a checkout when Go 1.23+ is available, falls back to
a prebuilt binary, otherwise downloads a release artifact. It installs
`/usr/local/bin/clouddeck-agent`, writes `/etc/clouddeck/agent.env` (never
overwriting an existing file), and enables a systemd unit.

**Option 1 — run the script straight from the repo** (once the repository URL
is real):

```bash
# PLACEHOLDER: CHANGE_ME must become the real GitHub owner before this works.
curl -fsSL https://raw.githubusercontent.com/CHANGE_ME/clouddeck/main/scripts/install-agent.sh | sudo bash
```

**Option 2 — copy the script from your checkout** (works today):

```bash
# from your local machine:
scp scripts/install-agent.sh root@SERVER_IP:/root/
# on the server:
sudo bash /root/install-agent.sh
```

Verify the agent:

```bash
curl -fsS http://127.0.0.1:9090/v1/health
# {"status":"ok","version":"0.1.0","hostname":"...","os":"linux/amd64","dryRun":false}
```

Useful service commands:

```bash
sudo systemctl status clouddeck-agent --no-pager
sudo journalctl -u clouddeck-agent -f
sudo systemctl restart clouddeck-agent
```

## 3. Deploy the panel

### Option A — Docker Compose (quickest way to a running panel; pairs with topology B)

```bash
# PLACEHOLDER: CHANGE_ME must become the real GitHub owner before this works.
sudo git clone https://github.com/CHANGE_ME/clouddeck.git /opt/clouddeck
cd /opt/clouddeck
```

Edit `docker-compose.yml` before the first start:

- `PANEL_SESSION_SECRET` → a long random value: `openssl rand -hex 32`
- `PANEL_SEED_PASSWORD` → your initial admin password (used only to seed the
  first user; see the security notes below)
- For a production host, bind published ports to localhost only — Docker
  publishes ports with its own iptables rules that **bypass ufw**:

```yaml
    ports:
      - "127.0.0.1:3000:3000"     # panel, reached via the TLS proxy in step 4
```

  For the `server` service, drop the `9090:9090` publish (the agent is only
  needed by the panel over the compose network) and keep `8080:80` only if the
  containerized nginx must serve sites on this host.

Then start the stack:

```bash
sudo docker compose up -d --build
sudo docker compose ps          # wait for clouddeck-server: healthy
```

The panel listens on `127.0.0.1:3000` (open it after step 4), and containerized
sites are reachable on the host's port 8080. Notes:

- Do **not** also run the step 2 host agent in this topology — port 9090 would conflict.
- Sites live inside the `server` container. If the VPS must actually serve
  websites on :80/:443, use topology A instead.

### Option B — Node on the host (pairs with topology A)

Node 22 via NodeSource (Ubuntu's stock Node is too old):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Build the panel (standalone output, per `panel/next.config.ts`):

```bash
sudo mkdir -p /opt/clouddeck-panel && cd /opt/clouddeck-panel
# PLACEHOLDER: CHANGE_ME must become the real GitHub owner before this works.
sudo git clone https://github.com/CHANGE_ME/clouddeck.git repo
cd repo/panel
npm install --no-audit --no-fund
npm run build

# Next.js standalone: the server expects static assets and public/ beside it.
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
```

Unprivileged service user + data directory:

```bash
sudo useradd --system --home /opt/clouddeck-panel --shell /usr/sbin/nologin clouddeck || true
sudo mkdir -p /opt/clouddeck-panel/data
sudo chown -R clouddeck:clouddeck /opt/clouddeck-panel
```

Environment file (secrets, mode 600):

```bash
sudo tee /etc/clouddeck/panel.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
AGENT_URL=http://127.0.0.1:9090
PANEL_DATA_DIR=/opt/clouddeck-panel/data
# openssl rand -hex 32
PANEL_SESSION_SECRET=replace-with-openssl-rand-hex-32
# Seed credentials apply only on the first start (no users.json yet).
PANEL_SEED_ADMIN=admin
PANEL_SEED_PASSWORD=replace-before-first-start
EOF
sudo chmod 600 /etc/clouddeck/panel.env
```

systemd unit `/etc/systemd/system/clouddeck-panel.service`:

```ini
[Unit]
Description=CloudDeck panel (Next.js)
After=network.target

[Service]
User=clouddeck
WorkingDirectory=/opt/clouddeck-panel/repo/panel/.next/standalone
EnvironmentFile=-/etc/clouddeck/panel.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable and verify:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now clouddeck-panel
curl -fsS -o /dev/null http://127.0.0.1:3000/ && echo "panel is up"
```

## 4. TLS for the panel

Point a DNS A/AAAA record for `panel.yourdomain.com` at the server first.

### Caddy (simplest — automatic certificates)

```bash
sudo apt-get install -y caddy
```

`/etc/caddy/Caddyfile`:

```
panel.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

### nginx + certbot

Create `/etc/nginx/sites-available/panel.yourdomain.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name panel.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/panel.yourdomain.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --nginx -d panel.yourdomain.com
```

Then add the TLS server block (same file):

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name panel.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/panel.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.yourdomain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Certbot's systemd timer renews certificates automatically.

## 5. Firewall

```bash
sudo ufw allow OpenSSH      # keep SSH open BEFORE enabling ufw
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

**Port 9090 must never be exposed.** The agent binds `127.0.0.1:9090`, which is
unreachable from outside the machine — that loopback binding is the entire
security boundary for v0.1, because the agent API is unauthenticated. Do not
`ufw allow 9090`, do not publish it in Docker, do not change `AGENT_LISTEN` to
`0.0.0.0` on a host with a public interface. If you run Docker, remember that
published container ports bypass ufw (Docker installs its own iptables rules),
which is why the compose guidance binds the panel to `127.0.0.1:3000`.

## 6. Updates

```bash
cd /opt/clouddeck     # or the panel checkout
sudo git pull
sudo docker compose up -d --build     # topology B; or: make up
```

- **Agent (topology A):** re-run the installer — it replaces the binary,
  keeps `/etc/clouddeck/agent.env` and restarts the service.
- **Panel (option B):**

  ```bash
  cd /opt/clouddeck-panel/repo && sudo git pull
  cd panel && npm install --no-audit --no-fund && npm run build
  mkdir -p .next/standalone/.next
  cp -r .next/static .next/standalone/.next/static
  cp -r public .next/standalone/public
  sudo systemctl restart clouddeck-panel
  ```

## 7. Backups

| What | Where | Notes |
|---|---|---|
| Panel accounts | `/opt/clouddeck-panel/data` (Docker: volume `clouddeck-panel-data`) | `users.json` — losing it means re-seeding from scratch |
| Agent state | `/var/lib/clouddeck-agent` | `state.json`, `tasks.json`, `audit.log` (reconstructable from nginx configs, but keeps history) |
| Site content | `/www/wwwroot` | the actual websites |
| Certificates | `/etc/letsencrypt` | backing these up avoids re-issuing (Let's Encrypt rate limits) |
| Configuration | `/etc/clouddeck` | agent and panel env files |

Quick archive example:

```bash
sudo tar czf clouddeck-backup-$(date +%F).tar.gz \
  /etc/clouddeck /etc/letsencrypt /var/lib/clouddeck-agent /www/wwwroot \
  /opt/clouddeck-panel/data
```

Adjust the path list to your topology (Docker volumes are covered in the table
above; paths that do not exist can simply be dropped). Copy the archive off the
server (restic, rclone, scp — scheduled via cron or a systemd timer).

## Security notes

- **Set the seed password before the first start.** `PANEL_SEED_PASSWORD` is
  only used to create the first user; once `users.json` exists it is ignored.
- **Set `PANEL_SESSION_SECRET`** to a long random value (`openssl rand -hex 32`).
  Rotating it invalidates existing sessions.
- **Keep the agent on `127.0.0.1`.** No authentication exists in v0.1 (mutual
  TLS + tokens arrive with multi-server support in v0.5).
- Serve the panel over HTTPS only; never expose port 3000 directly.
- Keep the OS, nginx and the CloudDeck checkout updated; review
  `sudo journalctl -u clouddeck-agent` and the panel's task logs after upgrades.
