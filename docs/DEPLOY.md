# Deploying divot on a DigitalOcean Droplet

The whole app is one Node process plus a SQLite file. A 1 GB Droplet is plenty.

Two paths below: **systemd** (no Docker, fewest moving parts, hand-edited
nginx config) and **Docker Compose** (recommended — the app rides the same
reverse proxy container as one4one and onward, and `git pull` +
`docker compose up -d --build` is the entire update procedure).

---

## Path A — systemd

### 1. Install Node 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
```

### 2. Put the code on the box

```bash
sudo useradd --system --home /srv/divot --shell /usr/sbin/nologin divot
sudo mkdir -p /srv/divot /var/lib/divot
sudo chown -R divot:divot /srv/divot /var/lib/divot

sudo -u divot git clone https://github.com/colehunt/divot.git /srv/divot
cd /srv/divot
sudo -u divot npm ci
sudo -u divot npm run build
sudo -u divot npm prune --omit=dev
```

`npm run build` produces `web/dist` (the client) and `server/dist` (the
compiled server). In production the Node server serves the client itself, so
there is only one origin and one port.

### 3. Start the service

```bash
sudo cp deploy/divot.service /etc/systemd/system/divot.service
sudo systemctl daemon-reload
sudo systemctl enable --now divot
sudo systemctl status divot
curl localhost:8080/api/health   # -> {"ok":true}
```

### 4. Put nginx in front

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/divot
sudo sed -i 's/golf.example.com/YOUR.DOMAIN/' /etc/nginx/sites-available/divot
sudo ln -s /etc/nginx/sites-available/divot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**The `/ws` block matters.** Without `Upgrade` and `Connection` headers the
WebSocket handshake fails, and a round degrades quietly: it loads, scores
save, but nobody else's screen ever updates. If live sync looks dead in
production, check that block first.

### 5. TLS

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR.DOMAIN
```

Cookies are marked `Secure` once `NODE_ENV=production` is set (see below), so
sign-in will not work until the site is served over HTTPS.

### 6. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Port 8080 stays closed — nginx reaches it over localhost.

### Updating

```bash
cd /srv/divot
sudo -u divot git pull
sudo -u divot npm ci
sudo -u divot npm run build
sudo -u divot npm prune --omit=dev
sudo systemctl restart divot
```

A restart drops open WebSockets; clients reconnect on their own within a few
seconds and pick their round back up.

---

## Path B — Docker Compose + Nginx Proxy Manager (recommended)

This mirrors [one4one](https://github.com/ColeHunt/one4one) and
[onward](https://github.com/ColeHunt/onward): the app's own `Dockerfile` and
`docker-compose.yml`, riding the droplet's *existing* Nginx Proxy Manager
stack rather than running a second one. If one4one or onward is already
deployed on this droplet, skip straight to step 4 — the shared `web` network
and NPM container are already there.

### 1. Install Docker (skip if already installed for another app)

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. Firewall (skip if already configured)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. Point DNS at the droplet

Add an **A record** for the domain you're using (e.g. `golf.example.com`)
pointing at the droplet's IP, before requesting a cert in step 5 or issuance
will fail.

### 4. Clone and start

```bash
sudo mkdir -p /opt/divot && cd /opt/divot
sudo git clone git@github.com:<you>/divot.git .
docker compose up -d --build
```

`docker-compose.yml` joins the external `web` network — the same one
one4one's compose file creates and onward's joins — so no second reverse
proxy is created. Data lives in the `divot-data` volume (SQLite), managed by
Compose, so it survives `git pull` + rebuild.

### 5. Configure the proxy + TLS

```bash
ssh -L 81:localhost:81 root@<droplet-ip>
# then browse to http://localhost:81 on your own machine
```

In Nginx Proxy Manager, **Add Proxy Host**: domain name, forward to `divot`
port `8080` (Compose's internal DNS resolves the container name), enable
**Websockets Support** (the `/ws` endpoint needs this — without it the app
loads but live scoring never updates), and request a Let's Encrypt cert from
the same dialog.

### Updating

```bash
cd /opt/divot
git pull origin master
docker compose build divot
docker compose up -d
```

Or push to `master` and let the GitHub Actions workflow below do it.

---

## Auto-deploy on push (GitHub Actions)

`.github/workflows/deploy.yml` SSHs into the droplet and runs the update
steps above on every push to `master`. If one4one or onward already has a
deploy key set up on this droplet, the same key and droplet secrets can be
reused for divot's repo secrets.

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f /tmp/deploy_key -N ""

# Let the droplet SSH into itself: add the public key to its own authorized_keys
ssh root@<droplet-ip> "cat >> ~/.ssh/authorized_keys" < /tmp/deploy_key.pub
```

In the repo's **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | The droplet's IP |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | Contents of `/tmp/deploy_key` (the private half) |

Then delete the local copies of both key files.

---

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8080` | Port the Node process listens on |
| `DATA_DIR` | `./data` | Directory holding `divot.sqlite` |
| `NODE_ENV` | — | Set to `production` on the server. Also marks session cookies `Secure`, so this must be set once the site is behind HTTPS. |
| `RESEND_API_KEY` | — | Optional. Enables "forgot password" to actually send an email — see below. Without it, reset requests still work, they just log the link instead. |
| `EMAIL_FROM` | Resend's shared test sender | Optional. Set once a domain is verified with Resend, e.g. `divot <noreply@colehunt.com>`. |

### Password reset emails (optional)

Password reset uses [Resend](https://resend.com) — free tier is 3,000
emails/month, no credit card required, plenty for a friends-and-family app.

1. Sign up at resend.com and grab an API key.
2. (Optional, better deliverability) verify a domain or subdomain — Resend
   walks through adding a couple of DNS records. Until then, the default
   `onboarding@resend.dev` sender works fine for testing.
3. Add the key to `/opt/divot/.env` on the droplet (Compose reads this file
   automatically, same directory as `docker-compose.yml`):
   ```bash
   echo 'RESEND_API_KEY=re_your_key_here' >> /opt/divot/.env
   # once a domain is verified:
   echo 'EMAIL_FROM=divot <noreply@yourdomain.com>' >> /opt/divot/.env
   docker compose up -d
   ```
   `docker compose up -d` (no `--build` needed) picks up the new env vars on
   the existing image.

Until this is set up, "forgot password" on the live site quietly logs the
reset link to the container's stdout (`docker compose logs divot`) instead of
emailing it — useful for testing the flow before wiring up Resend for real.

### Admins

Admins can edit or delete any course in the shared library (a regular
account can only add new ones). There's no in-app way to grant this — it's a
deliberate gap, done from the server itself:

```bash
# Docker (Path B)
docker exec divot node server/dist/server/src/adminCli.js grant you@example.com
docker exec divot node server/dist/server/src/adminCli.js list
docker exec divot node server/dist/server/src/adminCli.js revoke someone@example.com

# systemd (Path A)
sudo -u divot node /srv/divot/server/dist/server/src/adminCli.js grant you@example.com
```

The account has to already exist (sign up first, then grant). Takes effect
immediately — no restart needed, and the next `/api/auth/me` (or next
sign-in) picks it up.

## Backups

Everything is in one SQLite file — accounts, friendships, courses and every
round ever played. It is in WAL mode, so copy it with the `.backup` command
rather than `cp`.

systemd (Path A):

```bash
sudo -u divot sqlite3 /var/lib/divot/divot.sqlite ".backup '/tmp/divot-$(date +%F).sqlite'"
```

Docker (Path B) — the database lives inside the `divot-data` volume:

```bash
docker compose exec divot sqlite3 /data/divot.sqlite ".backup '/data/backup-$(date +%F).sqlite'"
docker cp divot:/data/backup-$(date +%F).sqlite .
```

Unlike one4one's rooms, none of this data is meant to expire — back it up
for real.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Page loads, live scores never update on other phones | Reverse proxy not forwarding the WebSocket upgrade — nginx: `/ws` block missing `Upgrade`/`Connection` headers; NPM: "Websockets Support" not enabled on the proxy host |
| "Connecting…" forever | App container/service not running, or the firewall is blocking the proxy → app |
| Can't sign in after adding TLS | `NODE_ENV` was not set to `production` before the cert went live, or the cookie was set over plain HTTP first — clear cookies and retry |
| `SQLITE_CANTOPEN` at boot | `DATA_DIR` not writable by the service user, or the volume isn't mounted |
| Let's Encrypt request fails in NPM | DNS A record isn't pointing at the droplet yet, or hasn't propagated |

Logs: `sudo journalctl -u divot -f` (Path A) or `docker compose logs -f divot` (Path B).
