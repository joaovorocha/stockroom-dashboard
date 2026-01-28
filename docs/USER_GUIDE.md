# Enterprise Multi-Store Admin Panel - User Guide

**Version**: 1.0  
**Date**: January 28, 2026

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Login & Store Selection](#login--store-selection)
3. [Super Admin Panel](#super-admin-panel)
4. [Store Admin Panel](#store-admin-panel)
5. [Security Features](#security-features)
6. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Access Levels

| Role | Access |
|------|--------|
| **Super Admin** | All stores, global settings, user management |
| **Store Admin** | Single store, store settings, team management |
| **Manager** | Single store, view settings, team oversight |
| **Employee** | Single store, basic access |

### Quick Links

- **Super Admin Panel**: `/admin`
- **Store Admin Panel**: `/store`
- **Regular Dashboard**: `/`

---

## Login & Store Selection

### Step 1: Enter Credentials

1. Navigate to the login page
2. Enter your **Employee ID** (or email)
3. Enter your **Password**

### Step 2: Select Store

After successful authentication:

1. A list of your accessible stores appears
2. Select the store you want to work in
3. Click **Continue**

> 💡 **Tip**: Your last selected store is remembered for next login.

### Switching Stores

If you have access to multiple stores:

1. Click on the **store name** in the navigation header
2. Or use the **Store Switcher** dropdown
3. Select a new store
4. The page will refresh with the new store context

---

## Super Admin Panel

Access: `/admin` (Super Admins only)

### Dashboard Overview

The main dashboard shows:

- **Total Stores**: Number of active stores (39)
- **Total Users**: System-wide user count
- **Open Tickets**: Support tickets needing attention
- **Recent Activity**: Latest admin actions

### Store Management

**Path**: `/admin/stores`

#### View Stores
- See all 39 stores in a grid or list view
- Filter by region, status, or search
- Click a store card to view details

#### Edit Store
1. Click **Edit** on any store card
2. Modify store details:
   - Name, code, address
   - Contact information
   - Operating status
3. Click **Save Changes**

### User Management

**Path**: `/admin/users`

#### View Users
- Search by name, email, or employee ID
- Filter by role or store
- See user status at a glance

#### Edit User
1. Click on a user row
2. Update basic info (name, email, role)
3. Manage store access (see below)
4. Save changes

#### Managing Store Access

For each user, you can:
- **Add store access**: Grant access to additional stores
- **Change role**: Admin, Manager, or User for each store
- **Remove access**: Revoke store access

```
Example: Making John a manager at Chicago store
1. Find John in user list
2. Click "Store Access" tab
3. Click "Add Store Access"
4. Select "Chicago" store
5. Choose role: "Manager"
6. Save
```

### Global Settings

**Path**: `/admin/settings`

Settings are organized by category:

| Category | Examples |
|----------|----------|
| **System** | Maintenance mode, app version |
| **Email** | SMTP settings, templates |
| **Security** | Session timeout, password policy |
| **Legal** | Privacy policy, terms of service |
| **Display** | Theme, branding |

#### Editing Settings
1. Navigate to category
2. Click on a setting row
3. Enter new value
4. Click **Save**

> ⚠️ **Warning**: Some settings affect all stores immediately.

---

## Store Admin Panel

Access: `/store` (Store Admins & Managers)

### Store Dashboard

Shows your store's overview:

- **Team Members**: Count and role breakdown
- **Custom Settings**: Number of store-specific settings
- **Recent Scans**: Today's scan activity
- **Quick Actions**: Common tasks

### Store Settings

**Path**: `/store/settings`

#### What You Can Edit
- Operating hours
- Store-specific preferences
- Local policies

#### What You Can View Only (Read-Only)
- Global compliance settings
- Legal requirements
- System settings

Look for these indicators:
- ✏️ **Editable**: You can modify this setting
- 🔒 **Read-Only**: Set globally, cannot be changed
- ⚡ **Custom**: Overrides the global default

### Team Management

**Path**: `/store/team`

#### View Team
- See all team members for your store
- View roles and last activity
- Check who's currently active

#### Manage Roles (Admins Only)

1. Find the team member
2. Click the **Role** dropdown
3. Select new role:
   - **Admin**: Full store control
   - **Manager**: Team oversight
   - **User**: Basic access
4. Confirm change

#### Invite New Member

1. Click **Invite Team Member**
2. Enter their email address
3. Select their role
4. Click **Send Invite**

> 📧 They'll receive an email with login instructions.

### Store Reports

**Path**: `/store/reports`

Available reports:

| Report | Description |
|--------|-------------|
| **Summary** | Activity overview, top users |
| **Team Activity** | Per-user action counts |
| **Scan Reports** | Daily scan performance |

#### Filtering Reports
- Use date range selector (7, 14, 30, 60, 90 days)
- Click tabs to switch report types
- Data updates when you change filters

---

## Security Features

### Rate Limiting

To protect against attacks, login attempts are limited:

- **10 attempts** per 15 minutes per IP
- **10 failed attempts** locks account for 1 hour

If locked out:
1. Wait for the timeout period
2. Or contact your Super Admin

### Audit Logging

All admin actions are logged:
- Login/logout events
- Settings changes
- User modifications
- Store access grants

Super Admins can view audit logs in the admin panel.

### Password Security

- Minimum 8 characters required
- First-time login requires password change
- Secure hashing (scrypt) used

---

## Troubleshooting

### "Access Denied to This Store"

**Cause**: You don't have permission for the selected store.

**Solution**:
1. Contact your Super Admin
2. Request access to the store
3. They can grant access in User Management

### "Too Many Login Attempts"

**Cause**: Rate limiting triggered.

**Solution**:
1. Wait 15-60 minutes
2. Try again with correct credentials
3. Contact admin if issue persists

### "Session Expired"

**Cause**: Inactive too long.

**Solution**:
1. Log in again
2. Check "Remember Me" for longer sessions

### Store Not Appearing

**Cause**: No access granted.

**Solution**:
1. Verify with Super Admin
2. Check if access is active (not expired)

### Settings Not Saving

**Cause**: Setting might be read-only.

**Solution**:
1. Check for 🔒 icon (read-only)
2. Global settings require Super Admin
3. Refresh and try again

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `G` then `D` | Go to Dashboard |
| `G` then `S` | Go to Settings |
| `G` then `T` | Go to Team |
| `?` | Show help |
| `Esc` | Close modal |

---

## Getting Help

### In-App Support
1. Click **Help** icon in header
2. Submit a support ticket
3. Include screenshots if possible

### Contact
- **Email**: support@suitsupply.com
- **Slack**: #stockroom-support

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 28, 2026 | Initial release with multi-store support |

---

*Last updated: January 28, 2026*
