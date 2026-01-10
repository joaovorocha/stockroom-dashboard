# Deployment Guide

## Prerequisites

- Node.js v14 or higher
- npm or yarn
- Git
- Linux server (Ubuntu 20.04+ recommended)
- SSL certificates (optional but recommended for production)

---

## Development Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-org/stockroom-dashboard.git
cd stockroom-dashboard
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your local settings
nano .env
```

### 4. Create Data Directory
```bash
mkdir -p data
```

### 5. Start Development Server
```bash
npm start
# Server runs on http://localhost:3000
```

---

## Production Deployment

### 1. Server Setup

#### On Ubuntu 20.04+

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (LTS)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Create app user (optional, for security)
sudo useradd -m -s /bin/bash appuser
sudo su - appuser
```

### 2. Deploy Application

```bash
# Clone repo
git clone https://github.com/your-org/stockroom-dashboard.git
cd stockroom-dashboard

# Install dependencies
npm install --production

# Copy and configure environment
cp .env.example .env
nano .env  # Add production secrets

# Create data directory
mkdir -p data
chmod 755 data
```

### 3. Setup PM2

#### Using ecosystem.config.json (Recommended)

```bash
# Start with PM2
pm2 start ecosystem.config.json

# Save PM2 config to persist on reboot
pm2 save
pm2 startup

# Check status
pm2 status
pm2 logs
```

#### Or Manual PM2 Setup

```bash
pm2 start server.js --name "stockroom-dashboard" --instances 2 --exec-mode cluster
pm2 save
pm2 startup
```

### 4. Configure Reverse Proxy (Nginx)

```bash
sudo apt install -y nginx
```

**Create `/etc/nginx/sites-available/stockroom-dashboard`:**

```nginx
upstream app_server {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Proxy to Node.js app
    location / {
        proxy_pass http://app_server;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Enable Site:**
```bash
sudo ln -s /etc/nginx/sites-available/stockroom-dashboard /etc/nginx/sites-enabled/
sudo nginx -t  # Test config
sudo systemctl restart nginx
```

### 5. Setup SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --nginx -d your-domain.com

# Auto-renewal (automatic with certbot)
sudo systemctl enable certbot.timer
```

### 6. Firewall Configuration

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

## Monitoring & Logs

### PM2 Monitoring

```bash
# Real-time logs
pm2 logs

# Specific app logs
pm2 logs stockroom-dashboard

# Clear logs
pm2 flush

# Monitor dashboard
pm2 monit
```

### Application Logs

Logs are stored in:
- PM2: `~/.pm2/logs/`
- App: `./logs/` (configurable)

### System Monitoring

```bash
# CPU/Memory usage
top
htop

# Disk space
df -h

# Processes
ps aux | grep node
```

---

## Backup & Recovery

### Automated Backup Script

Create `/home/appuser/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backups/stockroom-dashboard"
SOURCE_DIR="/home/appuser/stockroom-dashboard/data"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup data
tar -czf $BACKUP_DIR/data_$TIMESTAMP.tar.gz $SOURCE_DIR

# Keep last 30 days only
find $BACKUP_DIR -name "data_*.tar.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/data_$TIMESTAMP.tar.gz"
```

**Make executable:**
```bash
chmod +x /home/appuser/backup.sh
```

**Setup Cron Job (daily at 2 AM):**
```bash
crontab -e
# Add: 0 2 * * * /home/appuser/backup.sh
```

### Manual Restore

```bash
# Stop app
pm2 stop stockroom-dashboard

# Restore from backup
tar -xzf /backups/stockroom-dashboard/data_20260110_020000.tar.gz -C /home/appuser/stockroom-dashboard/

# Start app
pm2 start stockroom-dashboard
```

---

## Updating Application

### Pull Latest Code

```bash
cd /home/appuser/stockroom-dashboard

# Backup current state
pm2 stop stockroom-dashboard

# Pull changes
git pull origin main

# Install/update dependencies
npm install --production

# Start app
pm2 start stockroom-dashboard

# Check logs
pm2 logs
```

### Zero-Downtime Updates (Advanced)

Using PM2's reload:

```bash
# Graceful reload (no downtime)
pm2 reload stockroom-dashboard

# Or with ecosystem config
pm2 reload ecosystem.config.json
```

---

## Troubleshooting

### App Won't Start

```bash
# Check PM2 logs
pm2 logs stockroom-dashboard

# Check Node.js error
node server.js

# Verify .env exists
cat .env

# Check port availability
lsof -i :3000
```

### High Memory Usage

```bash
# Check memory
pm2 monit

# Restart app
pm2 restart stockroom-dashboard

# Check for memory leaks in code
```

### Database Connection Errors

```bash
# Check .env settings
cat .env | grep DATABASE

# Test connection
node -e "require('./src/utils/dal').readJson('./data/users.json')"
```

### SSL Certificate Issues

```bash
# Test SSL
curl -I https://your-domain.com

# Renew certificate
sudo certbot renew --force-renewal

# Check expiry
sudo certbot certificates
```

---

## Performance Tuning

### Node.js Cluster Mode (in ecosystem.config.json)

```javascript
module.exports = {
  apps: [{
    name: 'stockroom-dashboard',
    script: './server.js',
    instances: 'max',  // Use all CPU cores
    exec_mode: 'cluster',
    env: { NODE_ENV: 'production' }
  }]
};
```

### Nginx Caching

```nginx
# Add to nginx config
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=app_cache:10m;

location / {
    proxy_cache app_cache;
    proxy_cache_valid 200 1h;
    proxy_cache_bypass $http_pragma $http_authorization;
}
```

### Database Indexing (When using PostgreSQL)

```sql
CREATE INDEX idx_tracking ON shipments(tracking_number);
CREATE INDEX idx_employee ON gameplan(employee_id, date);
CREATE INDEX idx_status ON shipments(status);
```

---

## Security Checklist

Before going to production:

- [ ] Change all default passwords
- [ ] Set strong SESSION_SECRET in .env
- [ ] Enable HTTPS with valid SSL cert
- [ ] Configure firewall (allow only 80, 443, 22)
- [ ] Disable SSH password auth (use keys only)
- [ ] Setup automated backups
- [ ] Configure log rotation
- [ ] Setup monitoring/alerts
- [ ] Review and update dependencies (`npm audit`)
- [ ] Enable rate limiting (add to Express)
- [ ] Setup fail2ban for SSH bruteforce protection

---

## Scaling to Multiple Servers

### Load Balancing Setup

```nginx
upstream app_cluster {
    server 10.0.1.10:3000 weight=1;
    server 10.0.1.11:3000 weight=1;
    server 10.0.1.12:3000 weight=1;
}

server {
    listen 443 ssl;
    location / {
        proxy_pass http://app_cluster;
    }
}
```

### Shared Data Layer

Move from local JSON to PostgreSQL:

```javascript
// In utils/dal.js, replace JSON ops with DB queries
const readJson = async (path) => {
  // Instead of fs.readFileSync, use:
  // return await db.query('SELECT * FROM shipments');
};
```

### Session Sharing

Use Redis for cross-server sessions:

```javascript
// In server.js
const RedisStore = require('connect-redis').default;
const redis = require('redis');

const redisClient = redis.createClient();
app.use(session({
  store: new RedisStore({ client: redisClient }),
  // ...
}));
```

---

## Disaster Recovery Plan

### RTO (Recovery Time Objective): 1 hour
### RPO (Recovery Point Objective): 1 day

### Recovery Steps

1. **Restore from backup** (automated daily)
2. **Verify data integrity** (spot check records)
3. **Restart services** (PM2 restart)
4. **Run health checks** (ping API endpoints)
5. **Notify users** (email/SMS alert)

### Runbook for Emergency

See `docs/RUNBOOK.md` for step-by-step emergency procedures.

---

## Support

For issues or questions:
1. Check logs: `pm2 logs stockroom-dashboard`
2. Review errors in browser console
3. Contact DevOps team
4. Check `docs/` for troubleshooting guides
