# Daily Operations Dashboard

A comprehensive Progressive Web Application for managing retail operations, including game plans, shipments, employee scheduling, radio communications, task management, and real-time email processing.

**Current Status:** Production (Single Store) | **Technology:** Node.js, PostgreSQL, MCP Servers, Gmail API, Real-time Updates

## 🎯 Key Features

### Core Operations
- **Role-based Dashboard** - Customized views for Sales Associates, Back of House, Tailors, and Managers
- **Daily Game Planning** - Set goals and track employee assignments with real-time updates
- **Shipment Tracking** - Monitor deliveries with automated UPS integration and email processing
- **Lost Punch Management** - Process and approve time corrections with audit trails
- **Time Off Requests** - Public Calendar employee leave management
- **Closing Duties** - Automated end-of-day task management and checklists

### Real-time Communications
- **Radio System** - Integrated radio communications with MCP server and live monitoring
- **Gmail Push Notifications** - Real-time email processing using Google Cloud Pub/Sub (Jan 2026)
- **WebSocket Updates** - Live data synchronization across all connected clients

### Mobile & PWA
- **Mobile-First Design** - Optimized for iOS, Android, and desktop
- **PWA Support** - Install as app with offline capabilities
- **Add to Home Screen** - iOS-optimized installation prompt with visual instructions
- **Smart Network Detection** - Auto-switches between WiFi (fast) and Tailscale (secure) (Jan 2026)

### Integrations
- **MCP Integration** - Model Context Protocol servers for inventory, shipments, and radio operations
- **Gmail API** - OAuth 2.0 with automatic watch renewal for real-time email notifications
- **UPS API** - Automated shipment tracking and status updates
- **Looker Data** - Automated sales data extraction from email reports

## 📊 Business Impact

**Current Deployment:** Single store production system  
**Technology Stack:** Node.js 18+, PostgreSQL 15, Redis, MCP servers, Gmail API, WebSockets  
**Performance:** < 200ms response times, real-time data processing, 100x faster on local WiFi  
**App Name:** Daily Operations (formerly Stockroom Dashboard)

## 🚀 Quick Start

### Development

```bash
# Clone repository
git clone https://github.com/your-org/stockroom-dashboard.git
cd stockroom-dashboard

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env  # Add your settings

# Start development server
npm start

# Open http://localhost:3000
```

### Production

See [Deployment Guide](docs/DEPLOYMENT.md) for full setup instructions.

```bash
# Quick production setup
npm install --production
pm2 start ecosystem.config.json
# Configure Nginx reverse proxy
# Setup SSL with Let's Encrypt
```

## 📚 Documentation

### Active Documentation
- **[Server Map](SERVER_MAP.md)** - Complete API endpoint reference and route documentation
- **[Network Optimization](NETWORK_OPTIMIZATION.md)** - Smart WiFi/Tailscale detection setup
- **[Gmail Push Setup](GMAIL_PUSH_QUICKSTART.md)** - Quick start for Gmail real-time notifications  
- **[Gmail Push Details](GMAIL_PUSH_SETUP.md)** - Complete Gmail API integration guide
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute code
- **[Quick Reference](QUICK_REFERENCE.md)** - Common commands and workflows

### Legacy Documentation
See `legacy-docs/` folder for historical migration guides, completed feature plans, and deprecated documentation.

## 🆕 Recent Updates (January 2026)

1. **Gmail Push Notifications** - Real-time email processing using Gmail API + Google Cloud Pub/Sub
   - OAuth 2.0 authentication
   - Auto-renewal cron (7-day watch expiration)
   - Webhook endpoint at `/api/webhooks/gmail`
   
2. **Network Optimization** - Smart network detection for local WiFi users
   - Auto-redirects WiFi users to local IP (1000+ Mbps)
   - Remote users stay on Tailscale (secure 10 Mbps connection)
   - Zero configuration required
   
3. **PWA Enhancements** - iPhone-optimized installation
   - Add to Home Screen balloon prompt
   - Black translucent status bar
   - Full-screen standalone mode
   - App renamed to "Daily Operations"

4. **App Rebranding** - Changed from "Stockroom Dashboard" to "Daily Operations"
   - Updated manifest and all page titles
   - New short name: "Daily Ops"

## 🏗️ Project Structure

```
stockroom-dashboard/
├── routes/          # API endpoints (auth, gameplan, shipments, radio, etc.)
├── middleware/      # Request processing (authentication, validation)
├── utils/           # Shared utilities (database, email, APIs, MCP clients)
├── mcp-servers/     # Model Context Protocol servers (inventory, shipments, radio)
├── public/          # Static assets (HTML, CSS, JS, images)
├── models/          # Data models and schemas
├── scripts/         # Utility scripts and migrations
├── tests/           # Unit and integration tests
├── docs/            # Project documentation
├── data/            # Runtime data (gitignored in production)
└── logs/            # Application logs
```

## 🔧 Configuration

### Environment Variables

Create `.env` from `.env.example`:

```env
NODE_ENV=production
PORT=3000
SESSION_SECRET=<random-secret-key>
DATABASE_URL=postgresql://user:pass@localhost:5432/stockroom
GMAIL_USER=<gmail-for-ups-emails>
GMAIL_APP_PASSWORD=<16-char-app-password>
UPS_WEBHOOK_SECRET=<webhook-secret>
```

### Database Setup

**Current:** PostgreSQL with automated migrations
**Schema:** Comprehensive relational database with audit trails

See [Database Schema](docs/POSTGRESQL_MIGRATION_PLAN.md) for details.

## 🔐 Security

- Session-based authentication with PostgreSQL storage
- Role-based access control with granular permissions
- HTTPS support with SSL/TLS certificates
- Environment variable secrets management
- Input validation and parameterized queries
- Audit trails for all user actions
- MCP server authentication and authorization

**Production Security:**
- ✅ Strong SESSION_SECRET configured
- ✅ HTTPS with valid certificates
- ✅ PostgreSQL with connection security
- ✅ Automated security updates
- ✅ Regular security audits (`npm audit`)

## 📈 Current Architecture

### Technology Stack
- **Backend:** Node.js 18+, Express.js, PostgreSQL
- **Frontend:** Vanilla JavaScript, HTML5, CSS3, Progressive Web App
- **Real-time:** WebSockets for live updates
- **Integration:** Gmail IMAP, UPS API, MCP servers
- **Deployment:** PM2 process management, Linux servers

### Current Capacity
- **Users:** 50+ active users
- **Database:** PostgreSQL with automated migrations
- **Response Time:** < 200ms average
- **Uptime:** 99.9% with PM2 monitoring

### Key Components
- **Authentication System:** Session-based with role permissions
- **Email Processing:** Automated Looker report ingestion
- **MCP Servers:** Inventory, shipments, and radio management
- **Real-time Updates:** WebSocket synchronization
- **Mobile Support:** PWA with offline capabilities

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Lint code
npm run lint

# Check security vulnerabilities
npm audit
```

## 📦 Dependencies

### Core
- `express` - Web framework
- `pg` - PostgreSQL database client
- `ws` - WebSocket support
- `cookie-parser` - Cookie handling
- `cors` - Cross-origin requests

### Data & Integration
- `dotenv` - Environment variables
- `mailparser` - Email parsing
- `imap` - Gmail email access
- `googleapis` - Google services integration
- `@microsoft/microsoft-graph-client` - Microsoft Graph API
- `@modelcontextprotocol/sdk` - MCP server framework

### Production & Utilities
- `pm2` - Process manager
- `compression` - Gzip responses
- `multer` - File uploads
- `node-cron` - Scheduled tasks
- `redis` - Caching and sessions
- `axios` - HTTP client

## 🤝 Contributing

1. Read [CONTRIBUTING.md](CONTRIBUTING.md)
2. Create feature branch: `git checkout -b feature/description`
3. Make changes and test locally
4. Commit with clear messages
5. Submit pull request with description

### Code Style
- JavaScript: ES6+, no `var`, use `const`/`let`
- CSS: BEM naming, mobile-first responsive
- Commits: Descriptive (`feat:`, `fix:`, `docs:`)

## 🐛 Troubleshooting

### Server won't start
```bash
pm2 logs                    # Check PM2 logs
node server.js              # Run directly to see errors
lsof -i :3000              # Check port availability
```

### API endpoints returning errors
```bash
curl http://localhost:3000/api/auth/current-user  # Check auth
pm2 logs                                            # Check logs
```

### Mobile issues
- Clear browser cache (Ctrl+Shift+Delete)
- Check CSS version number in links
- Test in Chrome DevTools mobile mode

See [DEPLOYMENT.md > Troubleshooting](docs/DEPLOYMENT.md#troubleshooting) for more.

## 📞 Support

- **Bug Reports** - Open GitHub issue with details
- **Questions** - Check documentation first
- **Contributions** - See [CONTRIBUTING.md](CONTRIBUTING.md)
- **Security** - Email security@example.com


## 👥 Team

- **Victor Rocha** - Stockroom Manager @ Suit Supply, Original Developer
- **Your Team** - Production support

## 🔄 Current Status & Roadmap

### ✅ Completed (2025-2026)
- [x] PostgreSQL migration from JSON files
- [x] MCP server integration (inventory, shipments, radio)
- [x] Automated email processing (Looker reports)
- [x] Real-time WebSocket updates
- [x] Mobile PWA implementation
- [x] Role-based access control
- [x] Audit trail implementation
- [x] Production deployment with PM2

### 🚧 In Progress
- [ ] Multi-store support preparation
- [ ] Advanced analytics dashboard
- [ ] API documentation completion
- [ ] Automated testing framework

### 📋 Future Enhancements
- [ ] Enterprise multi-store rollout
- [ ] Mobile native apps (iOS/Android)
- [ ] Advanced reporting and analytics
- [ ] Integration with additional systems (POS, HR, etc.)

---

**Last Updated:** January 15, 2026  
**Developer:** Victor Rocha, Stockroom Manager @ Suit Supply  
**Organization:** Suit Supply Operations  
**Status:** Production Deployment - Active Maintenance
