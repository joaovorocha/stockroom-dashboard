# Contributing to Daily Operations Dashboard

## Welcome!

Thank you for contributing to the Daily Operations Dashboard! This guide will help you understand how to work with the project.

---

## Code of Conduct

- Be respectful and professional
- Test your changes before submitting
- Document your code
- Review others' pull requests constructively

---

## Getting Started

### 1. Fork & Clone

```bash
# Clone your fork
git clone https://github.com/your-username/stockroom-dashboard.git
cd stockroom-dashboard

# Add upstream remote
git remote add upstream https://github.com/original-org/stockroom-dashboard.git
```

### 2. Create Feature Branch

```bash
# Update main
git fetch upstream
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
# or for bugs:
git checkout -b bugfix/bug-description
```

### 3. Make Changes

```bash
# Install dependencies
npm install

# Make your changes
# Test thoroughly (see below)
```

### 4. Commit with Clear Messages

```bash
# Use descriptive commit messages
git commit -m "feat: add shipment filtering by status"
git commit -m "fix: resolve mobile button alignment issue"
git commit -m "docs: update API documentation"

# Commit message format:
# type(scope): subject
#
# Types: feat, fix, docs, style, refactor, test, chore
# Scope: gameplan, shipments, auth, etc.
# Subject: max 50 characters, lowercase, imperative
```

### 5. Push & Create Pull Request

```bash
# Push to your fork
git push origin feature/your-feature-name

# Go to GitHub and create Pull Request
# Title: "feat(shipments): add status filtering"
# Description: explain WHAT and WHY
```

---

## Pull Request Process

### Before Submitting

- [ ] Code follows project style
- [ ] Tests pass locally (`npm test`)
- [ ] No console errors/warnings
- [ ] Changes are documented
- [ ] Commit messages are clear
- [ ] No breaking changes (or clearly documented)

### PR Template

```markdown
## What changed?
Brief description of what this PR does.

## Why?
Explain the business reason or problem solved.

## How to test?
Steps to verify this works:
1. Go to...
2. Click...
3. Verify...

## Related Issues
Closes #123

## Checklist
- [x] Tests pass
- [x] No console errors
- [x] Documented changes
- [x] Ready for review
```

---

## Development Workflow

### File Organization

```
src/
├── routes/      # API endpoints
├── middleware/  # Request handlers
└── utils/       # Shared functions

public/
├── css/        # Stylesheets
├── js/         # Client-side code
└── *.html      # Pages

tests/          # Unit tests
docs/           # Documentation
```

### Code Style

#### JavaScript

```javascript
// Use const/let (no var)
const userId = req.user.id;
let count = 0;

// Clear function names
function fetchUserShipments(userId) {
  // ...
}

// Arrow functions for callbacks
const items = users.map(u => u.name);

// Template literals
const message = `Hello, ${user.name}!`;

// Proper error handling
try {
  const data = JSON.parse(content);
} catch (error) {
  console.error('Parse error:', error.message);
  return { error: 'Invalid JSON' };
}
```

#### CSS

```css
/* BEM naming convention */
.button {
  padding: 10px 20px;
}

.button--primary {
  background: #000;
  color: #fff;
}

.button--primary:hover {
  background: #333;
}

/* Mobile-first responsive */
@media (max-width: 600px) {
  .button {
    width: 100%;
  }
}
```

#### HTML

```html
<!-- Semantic markup -->
<header class="page-header">
  <h1>Title</h1>
  <p>Description</p>
</header>

<main>
  <section class="section-card">
    <h2>Section Title</h2>
    <!-- Content -->
  </section>
</main>

<!-- Always include accessibility attributes -->
<button aria-label="Close menu">×</button>
```

### Testing

Run tests before committing:

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/routes.test.js

# Run with coverage
npm test -- --coverage
```

### Debugging

#### Client-Side

```javascript
// In browser console
console.log('value:', value);
console.table(array);  // Pretty print arrays
console.time('operation');
// ... code to time ...
console.timeEnd('operation');
```

#### Server-Side

```javascript
// Add PM2 logs
pm2 logs

// Or use debugger
node --inspect server.js
# Then open chrome://inspect
```

---

## Common Tasks

### Adding a New API Endpoint

1. **Create route handler** (`src/routes/feature.js`):

```javascript
router.get('/feature/:id', authMiddleware, (req, res) => {
  try {
    const data = getFeatureData(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

2. **Register route** in `server.js`:

```javascript
const featureRoutes = require('./routes/feature');
app.use('/api', featureRoutes);
```

3. **Document** in `docs/API.md`:

```markdown
#### GET /api/feature/:id
Get feature details.

**Response:**
```json
{
  "success": true,
  "data": { ... }
}
```
```

### Adding a New Page

1. **Create HTML** (`public/feature.html`):

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Feature - Daily Operations</title>
    <link rel="stylesheet" href="/css/theme.css">
    <link rel="stylesheet" href="/css/dashboard.css">
  </head>
  <body>
    <div id="shared-header-mount"></div>
    <main>
      <!-- Content here -->
    </main>
    <script src="/js/shared-header.js"></script>
    <script>
      // App logic here
    </script>
  </body>
</html>
```

2. **Add navigation link** in shared header

3. **Add route** in `server.js` if needed

### Modifying Styles

1. **Add CSS** to appropriate file (`public/css/*.css`)
2. **Use variables** from `theme.css`:

```css
.my-component {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}
```

3. **Test mobile** (`@media (max-width: 600px)`)

---

## Debugging Tips

### "It works on my machine but not in production"

```bash
# Copy production .env locally
scp user@server:/path/.env .

# Test with production config
NODE_ENV=production npm start
```

### "Changes not showing up"

```bash
# Clear browser cache
# In DevTools: Ctrl+Shift+Delete

# Check CSS version (cache busting)
# In server.js look for: ?v=XX
# Increment the version number

# Check git status
git status
git diff
```

### "API endpoint returns 401/403"

```javascript
// Check middleware is properly applied
// authMiddleware must come before handler:
router.get('/api/data', authMiddleware, handler);

// Check req.user is populated
console.log('User:', req.user);

// Verify session cookie exists
curl -b "connect.sid=xxx" http://localhost:3000/api/data
```

---

## Performance Considerations

### Before Optimizing

```bash
# Profile app
npm start -- --prof
node --prof-process isolate-*.log > profile.txt

# Check bundle size
du -sh public/js/*

# Monitor memory
pm2 monit
```

### Common Optimizations

1. **Avoid N+1 queries** (load related data once)
2. **Cache computed values**
3. **Lazy load images**
4. **Minify CSS/JS in production**
5. **Use CDN for static files**

---

## Security Guidelines

### What NOT to commit

```
.env                  # Secrets
data/                 # User data
*.pem, *.key         # Certificates
node_modules/        # Dependencies
.DS_Store, Thumbs.db # OS files
```

### Input Validation

```javascript
// Always validate user input
const email = req.body.email?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  return res.status(400).json({ error: 'Invalid email' });
}

// Sanitize before storing
const name = req.body.name?.replace(/<[^>]*>/g, '').trim();
```

### Error Messages

```javascript
// ✓ Good: User-friendly
res.status(401).json({ error: 'Invalid email or password' });

// ✗ Bad: Too specific (security risk)
res.status(401).json({ error: 'Email not found in database' });
```

---

## Release Process

### Version Numbering (Semantic Versioning)

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (1.1.0): New features
- **PATCH** (1.1.1): Bug fixes

### Releasing

1. **Update version** in `package.json`
2. **Update CHANGELOG** if exists
3. **Tag release**: `git tag v1.0.0`
4. **Push tags**: `git push upstream --tags`
5. **Create GitHub Release** with changelog

---

## Getting Help

- Check existing documentation in `docs/`
- Look at similar code for examples
- Ask in team Slack/Discord
- Open a discussion issue (not a bug report)

---

## Review Checklist for Maintainers

- [ ] Code quality and style
- [ ] Tests pass and coverage sufficient
- [ ] Documentation updated
- [ ] No security issues
- [ ] No breaking changes (or clearly documented)
- [ ] Performance acceptable
- [ ] Commit messages are clear
- [ ] Ready for production

---

Thank you for your contributions! 🎉
