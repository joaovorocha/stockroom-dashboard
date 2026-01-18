# Stockroom Dashboard

A comprehensive Progressive Web Application for managing retail operations, including game plans, shipments, employee scheduling, radio communications, and task management.

**Current Status:** Production (Single Store) | **Technology:** Node.js, PostgreSQL, MCP Servers, Real-time Updates

## 🎯 Key Features

- **Role-based Dashboard** - Customized views for Sales Associates, Back of House, Tailors, and Managers
- **Daily Game Planning** - Set goals and track employee assignments with real-time updates
- **Shipment Tracking** - Monitor deliveries with automated UPS integration and email processing
- **Lost Punch Management** - Process and approve time corrections with audit trails
- **Time Off Requests** - Public Calendar employee leave management
- **Radio Communications** - Integrated radio system with MCP server and live monitoring
- **Mobile-First Design** - Works on all devices (iOS, Android, desktop) with PWA support
- **Real-time Updates** - WebSocket support for live data synchronization
- **MCP Integration** - Model Context Protocol servers for inventory, shipments, and radio operations

## 📊 Business Impact

**Current Deployment:** Single store production system
**Technology Stack:** Node.js, PostgreSQL, MCP servers, WebSockets, automated email processing
**Performance:** < 200ms response times, real-time data processing

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

- **[API Documentation](docs/API.md)** - Complete endpoint reference
- **[Architecture](docs/ARCHITECTURE.md)** - System design and data flow
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production setup and maintenance
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute code

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

## 📄 License

[Your License Here]

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
