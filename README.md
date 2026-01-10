# Daily Operations Dashboard

A Progressive Web Application for managing daily store operations, including game plans, shipments, employee scheduling, and task management.

**Current Status:** Production (Single Store) | **Target:** Enterprise (150+ Stores, 5,000 Employees)

## 🎯 Key Features

- **Role-based Dashboard** - Customized views for Sales Associates, Back of House, Tailors, and Managers
- **Daily Game Planning** - Set goals and track employee assignments
- **Shipment Tracking** - Monitor deliveries with real-time UPS integration
- **Lost Punch Management** - Process and approve time corrections
- **Time Off Requests** - Public Calendar employee leave
- **Mobile-First Design** - Works on all devices (iOS, Android, desktop)
- **Offline Support** - Progressive Web App with Service Workers
- **Real-time Updates** - WebSocket support for live data sync

## 📊 Business Impact

**Potential Savings:** $4M+/year for 150 stores
- **Labor:** 54,750 hours/year saved across store operations
- **Errors:** Reduced through digital tracking and automation
- **Efficiency:** Centralized management dashboard

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
src/
├── routes/          # API endpoints (gameplan, shipments, auth, etc.)
├── middleware/      # Request processing (authentication, validation)
└── utils/          # Shared utilities (database, email, APIs)

public/
├── css/             # Global styles (theme, responsive, components)
├── js/              # Client-side logic (dashboard, forms, sync)
└── *.html           # Page templates (role-specific views)

docs/               # Project documentation
tests/              # Unit and integration tests
config/             # Configuration templates
data/               # Runtime data (gitignored in production)
```

## 🔧 Configuration

### Environment Variables

Create `.env` from `.env.example`:

```env
NODE_ENV=production
PORT=3000
SESSION_SECRET=<random-secret-key>
GMAIL_USER=<gmail-for-ups-emails>
GMAIL_APP_PASSWORD=<16-char-app-password>
```

### Database Setup (Optional)

Current: JSON file storage
Recommended for production: PostgreSQL

See [Architecture](docs/ARCHITECTURE.md#database-schema) for schema details.

## 🔐 Security

- Session-based authentication (cookies)
- Role-based access control
- HTTPS support with SSL/TLS
- Environment variable secrets management
- Input validation on all endpoints

**Before Production:**
- [ ] Set strong SESSION_SECRET
- [ ] Enable HTTPS with valid certificate
- [ ] Configure firewall rules
- [ ] Setup automated backups
- [ ] Review dependency security (`npm audit`)

## 📈 Scalability

### Current Capacity
- **Users:** 50-200 concurrent
- **Storage:** Single server, JSON files
- **Response Time:** < 200ms average

### Scaling Path (Q1-Q3 2026)
1. **Database Migration** - Move from JSON to PostgreSQL
2. **Load Balancing** - Multi-server deployment
3. **Caching** - Redis for sessions and data
4. **Cloud Infrastructure** - AWS/Azure deployment
5. **Monitoring** - APM, error tracking, analytics

See [Architecture](docs/ARCHITECTURE.md#scalability-considerations) for details.

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
- `express-session` - Session management
- `cookie-parser` - Cookie handling
- `cors` - Cross-origin requests
- `ws` - WebSocket support

### Data
- `dotenv` - Environment variables
- `mailparser` - Email parsing
- `imap` - Gmail email access

### Production
- `pm2` - Process manager
- `compression` - Gzip responses

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

- **Victor Rocha** - Original developer
- **Your Team** - Production support

## 🔄 Roadmap

### Q1 2026
- [ ] Automated testing framework
- [ ] PostgreSQL migration
- [ ] CI/CD pipeline
- [ ] Error monitoring (Sentry)

### Q2 2026
- [ ] Multi-store support
- [ ] Advanced analytics
- [ ] User management UI
- [ ] API rate limiting

### Q3 2026
- [ ] Mobile app
- [ ] Global localization
- [ ] Audit trails
- [ ] Compliance reporting

---

**Last Updated:** January 10, 2026  
**Maintainer:** Victor Rocha  
**Status:** Active Development
