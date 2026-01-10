#!/usr/bin/env node
/**
 * Script to deduplicate shipments by tracking number
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SHIPMENTS_FILE = path.join(DATA_DIR, 'shipments.json');
const BACKUP_FILE = path.join(DATA_DIR, 'shipments-backup-' + new Date().toISOString().replace(/:/g, '-') + '.json');

function loadShipments() {
  if (!fs.existsSync(SHIPMENTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SHIPMENTS_FILE, 'utf8'));
  } catch (e) {
    console.error('Error loading shipments:', e);
    return [];
  }
}

function saveShipments(shipments) {
  fs.writeFileSync(SHIPMENTS_FILE, JSON.stringify(shipments, null, 2));
}

function getTrackingNumber(shipment) {
  return (shipment?.trackingNumber || shipment?.tracking || '').toString().trim().toUpperCase();
}

function statusRank(status) {
  const s = (status || '').toString().toLowerCase();
  const order = { unknown: 0, requested: 1, pending: 1, 'label-created': 2, shipped: 2, 'in-transit': 3, delivered: 4 };
  return order[s] || 0;
}

function mergeShipment(existing, incoming) {
  const merged = { ...existing };

  // Merge fields, preferring non-empty values
  Object.keys(incoming).forEach(key => {
    if (key === 'id') return; // Keep existing id
    if (key === 'createdAt') {
      // Keep earliest createdAt
      if (!merged.createdAt || new Date(incoming.createdAt) < new Date(merged.createdAt)) {
        merged.createdAt = incoming.createdAt;
      }
      return;
    }
    if (key === 'status') {
      // Keep highest rank status
      if (statusRank(incoming.status) > statusRank(merged.status)) {
        merged.status = incoming.status;
      }
      return;
    }
    
    // For other fields, fill in missing values
    const existingVal = merged[key];
    const incomingVal = incoming[key];
    
    if (existingVal === undefined || existingVal === null || existingVal === '') {
      if (incomingVal !== undefined && incomingVal !== null && incomingVal !== '') {
        merged[key] = incomingVal;
      }
    }
  });

  merged.updatedAt = new Date().toISOString();
  return merged;
}

function dedupeShipments() {
  console.log('Loading shipments...');
  const shipments = loadShipments();
  console.log(`Total shipments: ${shipments.length}`);

  // Create backup
  console.log(`Creating backup: ${BACKUP_FILE}`);
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(shipments, null, 2));

  // Group by tracking number
  const trackingMap = new Map();
  
  shipments.forEach(shipment => {
    const tracking = getTrackingNumber(shipment);
    if (!tracking) {
      // No tracking number, keep as-is
      if (!trackingMap.has('__no_tracking__')) {
        trackingMap.set('__no_tracking__', []);
      }
      trackingMap.get('__no_tracking__').push(shipment);
      return;
    }

    if (!trackingMap.has(tracking)) {
      trackingMap.set(tracking, []);
    }
    trackingMap.get(tracking).push(shipment);
  });

  console.log(`Unique tracking numbers: ${trackingMap.size}`);

  // Deduplicate by merging
  const deduped = [];
  let duplicatesRemoved = 0;

  trackingMap.forEach((group, tracking) => {
    if (group.length === 1) {
      deduped.push(group[0]);
      return;
    }

    // Multiple entries for same tracking number
    console.log(`  Merging ${group.length} entries for tracking: ${tracking || '(no tracking)'}`);
    duplicatesRemoved += group.length - 1;

    // Start with first entry, merge others into it
    let merged = group[0];
    for (let i = 1; i < group.length; i++) {
      merged = mergeShipment(merged, group[i]);
    }
    deduped.push(merged);
  });

  console.log(`\nDeduplication complete:`);
  console.log(`  Before: ${shipments.length} shipments`);
  console.log(`  After: ${deduped.length} shipments`);
  console.log(`  Removed: ${duplicatesRemoved} duplicates`);

  // Save deduplicated list
  saveShipments(deduped);
  console.log(`\nSaved to: ${SHIPMENTS_FILE}`);
  console.log(`Backup saved to: ${BACKUP_FILE}`);
}

// Run deduplication
dedupeShipments();
