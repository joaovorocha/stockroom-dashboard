#!/bin/bash

# ========================================
# Deploy Stockroom Dashboard to Server
# Run this from your LOCAL machine
# ========================================

# Configuration - UPDATE THESE
SERVER_USER="victor"           # Change to your server username
SERVER_IP="10.201.40.178"   # Change to your server IP
SERVER_PATH="/var/www/stockroom-dashboard"

echo "=== Deploying Stockroom Dashboard ==="
echo "Server: $SERVER_USER@$SERVER_IP"
echo "Path: $SERVER_PATH"
echo ""

# Create tarball of the project (excluding node_modules)
echo "Creating deployment package..."
tar -czf /tmp/stockroom-deploy.tar.gz \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='ssl' \
    -C /Users/victor stockroom-dashboard

# Upload to server
echo "Uploading to server..."
scp /tmp/stockroom-deploy.tar.gz $SERVER_USER@$SERVER_IP:/tmp/

# Extract and setup on server
echo "Setting up on server..."
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
    # Create directory
    sudo mkdir -p /var/www/stockroom-dashboard
    sudo chown $USER:$USER /var/www/stockroom-dashboard
    
    # Extract files
    cd /var/www
    tar -xzf /tmp/stockroom-deploy.tar.gz
    
    # Install dependencies
    cd /var/www/stockroom-dashboard
    npm install --production
    
    # Set permissions
    chmod +x deploy/*.sh
    
    echo "Files deployed!"
ENDSSH

echo ""
echo "=== Deployment complete! ==="
echo ""
echo "Next: SSH to server and run:"
echo "  cd /var/www/stockroom-dashboard"
echo "  pm2 start ecosystem.config.json"
echo "  pm2 save"
echo "  pm2 startup"
