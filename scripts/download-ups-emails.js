#!/usr/bin/env node
/**
 * Download UPS-related emails to disk for offline parsing/debugging.
 *
 * Usage:
 *   GMAIL_USER=you@gmail.com GMAIL_APP_PASSWORD=app_password node scripts/download-ups-emails.js --all
 *   node scripts/download-ups-emails.js --days=30
 *
 * This script DOES NOT write to the DB or delete any emails. It only saves
 * parsed email snapshots under `data/ups-emails/<mailbox>/` for later use.
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_DIR = path.join(DATA_DIR, 'ups-emails');

const argv = require('minimist')(process.argv.slice(2));
const fetchAll = !!argv.all || process.env.UPS_FETCH_ALL === 'true';
const daysArg = argv.days !== undefined ? parseInt(argv.days, 10) : (process.env.UPS_FETCH_DAYS ? parseInt(process.env.UPS_FETCH_DAYS, 10) : 30);
const daysBack = fetchAll ? null : (Number.isFinite(daysArg) ? daysArg : 30);

const GMAIL_CONFIG = {
  user: process.env.GMAIL_USER || '',
  password: process.env.GMAIL_APP_PASSWORD || '',
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
};

if (!GMAIL_CONFIG.user || !GMAIL_CONFIG.password) {
  console.error('Please set GMAIL_USER and GMAIL_APP_PASSWORD in the environment.');
  process.exit(1);
}

function mkdirp(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeName(name) {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 120) || 'mailbox';
}

function connectImap() {
  return new Promise((resolve, reject) => {
    const imap = new Imap(GMAIL_CONFIG);
    imap.once('ready', () => resolve(imap));
    imap.once('error', err => reject(err));
    imap.connect();
  });
}

function getBoxes(imap) {
  return new Promise((resolve, reject) => {
    imap.getBoxes((err, boxes) => {
      if (err) return reject(err);
      resolve(boxes);
    });
  });
}

function flattenBoxes(boxObj, prefix = '') {
  const out = [];
  for (const k of Object.keys(boxObj || {})) {
    const name = prefix ? `${prefix}/${k}` : k;
    out.push(name);
    if (boxObj[k].children) out.push(...flattenBoxes(boxObj[k].children, name));
  }
  return out;
}

function openBox(imap, name) {
  return new Promise((resolve, reject) => {
    imap.openBox(name, true, (err, box) => {
      if (err) return reject(err);
      resolve(box);
    });
  });
}

function searchMail(imap, daysBack) {
  return new Promise((resolve, reject) => {
    if (daysBack === null || daysBack === 0) {
      imap.search(['ALL'], (err, results) => err ? reject(err) : resolve(results || []));
      return;
    }
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    imap.search([['OR', ['FROM', 'ups.com'], ['SUBJECT', 'UPS']], ['SINCE', sinceDate]], (err, results) => err ? reject(err) : resolve(results || []));
  });
}

function fetchAndParse(imap, uid) {
  return new Promise((resolve, reject) => {
    const f = imap.fetch(uid, { bodies: '' });
    f.on('message', (msg) => {
      let bufs = [];
      msg.on('body', (stream) => {
        stream.on('data', (chunk) => bufs.push(Buffer.from(chunk)));
      });
      msg.once('end', async () => {
        try {
          const raw = Buffer.concat(bufs).toString('utf8');
          const parsed = await simpleParser(raw);
          resolve({ uid, raw, parsed });
        } catch (e) {
          reject(e);
        }
      });
    });
    f.once('error', reject);
  });
}

async function run() {
  console.log(`Downloading UPS emails to ${OUT_DIR} (daysBack=${daysBack === null ? 'ALL' : daysBack})`);
  mkdirp(OUT_DIR);

  const imap = await connectImap();

  let mailboxes = ['INBOX'];
  if (fetchAll) {
    try {
      const boxes = await getBoxes(imap);
      const flattened = flattenBoxes(boxes).map(n => n.replace(/"/g, ''));
      mailboxes = Array.from(new Set([...flattened, ...mailboxes]));
    } catch (e) {
      console.warn('Could not enumerate mailboxes, defaulting to INBOX');
    }
  }

  const summary = { processed: 0, saved: 0, skipped: 0, errors: [] };

  for (const mailbox of mailboxes) {
    try {
      await openBox(imap, mailbox);
    } catch (e) {
      continue; // skip mailbox if cannot open
    }
    let uids = [];
    try {
      uids = await searchMail(imap, daysBack);
    } catch (e) {
      console.warn(`Search failed for ${mailbox}: ${e.message}`);
      continue;
    }
    if (!uids || uids.length === 0) continue;
    console.log(`Mailbox "${mailbox}": ${uids.length} messages matched search`);

    const boxDir = path.join(OUT_DIR, safeName(mailbox));
    mkdirp(boxDir);

    for (const uid of uids) {
      try {
        const { uid: id, parsed } = await fetchAndParse(imap, uid);
        const fromAddr = parsed.from?.value?.[0]?.address || '';
        const subject = parsed.subject || '';
        // crude UPS filter: from contains ups or subject contains 'ups' or 'tracking'
        const isUPS = (fromAddr && fromAddr.toLowerCase().includes('ups')) || (subject && /ups|tracking|delivery|ship/i.test(subject));
        summary.processed++;
        if (!isUPS) { summary.skipped++; continue; }

        const outFile = path.join(boxDir, `${id}.json`);
        const attachments = [];
        if (Array.isArray(parsed.attachments) && parsed.attachments.length) {
          const attDir = path.join(boxDir, `${id}_attachments`);
          mkdirp(attDir);
          for (const a of parsed.attachments) {
            const fname = path.join(attDir, safeName(a.filename || `att_${a.checksum || Date.now()}`));
            try {
              fs.writeFileSync(fname, a.content);
              attachments.push({ filename: a.filename || '', path: path.relative(DATA_DIR, fname) });
            } catch (e) {
              // ignore attachment write errors
            }
          }
        }

        const snapshot = {
          uid: id,
          subject: parsed.subject || '',
          date: parsed.date ? parsed.date.toISOString() : null,
          from: parsed.from?.value || [],
          to: parsed.to?.value || [],
          headers: parsed.headers && typeof parsed.headers === 'object' ? Object.fromEntries(parsed.headers) : null,
          text: parsed.text || '',
          html: parsed.html || '',
          attachments
        };

        fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2), 'utf8');
        summary.saved++;
      } catch (e) {
        summary.errors.push(e.message || String(e));
      }
    }
  }

  try { imap.end(); } catch (_) {}

  console.log('Done. Summary:', JSON.stringify(summary, null, 2));
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
