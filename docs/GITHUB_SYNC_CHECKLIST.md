# GitHub Sync Checklist

Use this checklist before pushing or opening a PR.

## 1) Clean Working Tree

```bash
git status --short
```

- Remove accidental files (terminal dumps, temp exports)
- Confirm only intended files are modified

## 2) Validate Both App Paths

```bash
node --check server.js
cd client && npm run build
```

- Backend syntax must pass
- React production build must pass

## 3) Validate Documentation

- Update `README.md` for major behavior changes
- Update `SERVER_MAP.md` when routes/auth/runtime change
- Update `SYSTEM_STATUS.md` for operational changes
- Keep links valid in updated docs

## 4) Stage by Scope

```bash
# Example scope-based staging
git add routes/ server.js middleware/ utils/
git add client/src/ client/vite.config.js
git add README.md SERVER_MAP.md SYSTEM_STATUS.md docs/
```

## 5) Review Diff

```bash
git diff --staged --stat
git diff --staged
```

- Check for secrets, credentials, local paths
- Ensure commit message matches actual changes

## 6) Push + PR

```bash
git push origin <branch-name>
```

- Use `.github/pull_request_template.md`
- Include validation steps and rollout notes
- Call out impact to vanilla app vs React app

## 7) Post-Merge Runtime Refresh

```bash
pm2 restart all
pm2 list
```

- Confirm `stockroom-dashboard` and related services are online
