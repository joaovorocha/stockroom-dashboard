# Stockroom Dashboard — Production Runbook

This runbook covers operational tasks for the Stockroom Dashboard running on the new server (10.201.48.17).

## System Overview

- **App root**: `/var/www/stockroom-dashboard`
- **Process manager**: PM2
  - `stockroom-dashboard` (Express web server)
  - `looker-scheduler` (background Looker ingest/process job)
- **Canonical runtime storage**:
  - Data: `/var/lib/stockroom-dashboard/data`
  - Files (imports/exports/assets): `/var/lib/stockroom-dashboard/files`
- **Repo symlinks**:
  - `/var/www/stockroom-dashboard/data` -> `/var/lib/stockroom-dashboard/data`
  - `/var/www/stockroom-dashboard/files` -> `/var/lib/stockroom-dashboard/files`
- **Logs**:
  - App logs directory: `/var/www/stockroom-dashboard/logs`
  - PM2 logs: `/home/suit/.pm2/logs`

## Environment / Config

PM2 config is in `ecosystem.config.json`.

Key env vars:

- **Paths**
  - `STOCKROOM_DATA_DIR=/var/lib/stockroom-dashboard/data`
  - `STOCKROOM_FILES_DIR=/var/lib/stockroom-dashboard/files`
  - `STOCKROOM_LOG_DIR=/var/www/stockroom-dashboard/logs`
- **Web**
  - `PORT` (default `3000`)
  - `APP_BASE_URL` (used for password reset links)
- **Email (password reset + some import flows)**
  - SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
  - Gmail alternative: `GMAIL_USER`, `GMAIL_APP_PASSWORD`
- **UPS email importer (in-process scheduler)**
  - `UPS_EMAIL_IMPORT_CRON` (supports multiple expressions separated by `;`)
  - `UPS_EMAIL_IMPORT_DAYS`
  - `UPS_EMAIL_DELETE_AFTER_IMPORT` (`true` deletes emails after import)

## Common Operations

### Check service health

- HTTP local check:
  - `curl -I http://127.0.0.1:3000/`
- PM2 status:
  - `pm2 ls`
  - `pm2 describe stockroom-dashboard`
  - `pm2 describe looker-scheduler`

### View logs

- PM2 logs:
  - `pm2 logs stockroom-dashboard --lines 200`
  - `pm2 logs looker-scheduler --lines 200`
- Raw log files:
  - `ls -lah /home/suit/.pm2/logs | rg -n 'stockroom|looker'`

### Restart / reload

- Reload both apps (graceful where possible):
  - `cd /var/www/stockroom-dashboard && pm2 reload ecosystem.config.json`
- Restart a single app:
  - `pm2 restart stockroom-dashboard`
  - `pm2 restart looker-scheduler`

### Deploy (code update)

Assuming a git-based deploy:

1) `cd /var/www/stockroom-dashboard`
2) `git pull --ff-only`
3) Install deps:
   - Recommended for consistent deploys: `npm ci` (requires clean lockfile)
   - Otherwise: `npm install`
4) Reload:
   - `pm2 reload ecosystem.config.json`
5) Verify:
   - `pm2 ls`
   - `curl -I http://127.0.0.1:3000/`

## Schedulers

### Looker scheduler (PM2 process: `looker-scheduler`)

- Entrypoint: `utils/looker-scheduler.js`
- Schedule:
  - Runs via `node-cron`.
  - Current PM2 args are `start` (no cron override). The code default is **daily at 06:30**: `30 6 * * *`.
  - Timezone is set in the scheduler (America/Los_Angeles).
- Primary outputs (written under the data dir):
  - `data/dashboard-data.json`
  - `data/store-metrics/<date>.json` and other derived datasets

If you see it running too frequently:

- Confirm current schedule string in logs:
  - `pm2 logs looker-scheduler --lines 200 | rg -n "Starting scheduler with cron expression"`
- Confirm PM2 args are not overriding cron:
  - `pm2 describe looker-scheduler | rg -n "args|script"`

### UPS email importer (in-process)

- Started by the web server (`server.js`) at runtime.
- Controlled by `UPS_EMAIL_IMPORT_CRON` (defaults to business-hours schedule if unset).

## Backups / Restore

### What to back up

Minimum set:

- `/var/lib/stockroom-dashboard/data/`
- `/var/lib/stockroom-dashboard/files/`
- `/var/www/stockroom-dashboard/.env` (handle securely)
- `/var/www/stockroom-dashboard/ecosystem.config.json`
- `/var/www/stockroom-dashboard/ssl/` (if you terminate TLS here)

### Simple backup command (tar)

Example (writes to /var/backups):

- `sudo mkdir -p /var/backups/stockroom-dashboard`
- `sudo tar -czf /var/backups/stockroom-dashboard/stockroom-dashboard_$(date +%F).tgz \
    /var/lib/stockroom-dashboard/data \
    /var/lib/stockroom-dashboard/files \
    /var/www/stockroom-dashboard/ecosystem.config.json \
    /var/www/stockroom-dashboard/ssl \
    /var/www/stockroom-dashboard/.env`

### Restore checklist

1) Stop PM2 apps:
   - `pm2 stop stockroom-dashboard looker-scheduler`
2) Restore tarball contents to the same paths.
3) Fix ownership (if needed):
   - `sudo chown -R suit:suit /var/lib/stockroom-dashboard`
4) Start apps:
   - `pm2 start /var/www/stockroom-dashboard/ecosystem.config.json`
5) Verify HTTP and logs.

## Dependency / Security Maintenance

### Run audits

- `cd /var/www/stockroom-dashboard`
- `npm audit --omit=dev`

### Safe remediation

- `npm audit fix` (non-breaking where possible)
- Re-run: `npm audit --omit=dev`

If a fix requires `--force`, treat it as a deploy with a validation step (see next section).

### Validation checklist (post-upgrade)

- Web:
  - Login works
  - Dashboard renders
- Background jobs:
  - `pm2 logs looker-scheduler --lines 200` shows clean startup
- Email (if used):
  - Trigger a password reset and confirm email delivery

## Git Hygiene / GitHub Readiness

This repo currently uses real runtime data under `data/` and `files/` (now symlinked to `/var/lib`). For any public/remote git mirror:

- Ensure `.env`, `data/`, `files/`, `logs/`, and any secrets are ignored.
- Remove any tracked runtime data from git history before pushing.

Typical cleanup steps (only do this on a dedicated branch/repo intended for GitHub):

- `git rm -r --cached data files logs`
- Add to `.gitignore`:
  - `data/`
  - `files/`
  - `logs/`
  - `.env`
- Commit and verify `git status` shows no runtime artifacts.

