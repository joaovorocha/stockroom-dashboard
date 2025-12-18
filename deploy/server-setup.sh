#!/bin/bash

# ========================================
# Stockroom Dashboard - Server Setup Script
# For Silicon AI3001 or similar Linux servers
# ========================================

echo "=== Stockroom Dashboard Server Setup ==="

# Update system
echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version

# Install PM2 for process management
echo "Installing PM2..."
sudo npm install -g pm2

# Install Git
sudo apt install -y git

# Create app directory
echo "Creating app directory..."
sudo mkdir -p /var/www/stockroom-dashboard
sudo chown $USER:$USER /var/www/stockroom-dashboard

echo ""
echo "=== Base setup complete! ==="
echo ""
echo "Next steps:"
echo "1. Transfer your project files to /var/www/stockroom-dashboard"
echo "2. Run: cd /var/www/stockroom-dashboard && npm install"
echo "3. Set environment variables (see below)"
echo "4. Start the app with PM2"
echo ""
echo "Environment variables to set:"
echo "  export GMAIL_USER='sanfranciscosuitsupplyredirect@gmail.com'"
echo "  export GMAIL_APP_PASSWORD='your-app-password'"
echo ""
