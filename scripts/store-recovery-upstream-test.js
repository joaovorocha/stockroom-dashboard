/*
  One-off validation script:
  - Reads data/store-recovery-config.json
  - Decodes a sample SGTIN-96 EPC to EAN
  - Retrieves OAuth token (client_credentials)
  - Calls suitsApi NewTagFromEanCode

  Usage:
    node scripts/store-recovery-upstream-test.js 3036...E1
*/

const fs = require('fs');
const axios = require('axios');
const zlib = require('zlib');

const CONFIG_PATH = '/var/www/stockroom-dashboard/data/store-recovery-config.json';

function decodeSgtin96EpcToGtin(epcHex) {
  const hex = (epcHex || '').toString().trim();
  if (!/^[0-9a-fA-F]{24}$/.test(hex)) return null;
  const n = BigInt('0x' + hex);
  const header = Number((n >> 88n) & 0xffn);
  if (header !== 0x30) return null; // SGTIN-96

  const partition = Number((n >> 82n) & 0x7n);
  if (partition < 0 || partition > 6) return null;

  const companyPrefixBits = [40, 37, 34, 30, 27, 24, 20][partition];
  const itemReferenceBits = [4, 7, 10, 14, 17, 20, 24][partition];
  const companyPrefixDigits = [12, 11, 10, 9, 8, 7, 6][partition];
  const itemReferenceDigits = [1, 2, 3, 4, 5, 6, 7][partition];

  const companyPrefix = (n >> (38n + BigInt(itemReferenceBits))) & ((1n << BigInt(companyPrefixBits)) - 1n);
  const itemReference = (n >> 38n) & ((1n << BigInt(itemReferenceBits)) - 1n);

  const companyPrefixStr = companyPrefix.toString().padStart(companyPrefixDigits, '0');
  const itemRefStr = itemReference.toString().padStart(itemReferenceDigits, '0');
  const indicator = itemRefStr.slice(0, 1);
  const itemRefRemainder = itemRefStr.slice(1);

  const gtin13 = `${indicator}${companyPrefixStr}${itemRefRemainder}`;
  if (!/^\d{13}$/.test(gtin13)) return null;

  let sum = 0;
  for (let i = 0; i < gtin13.length; i++) {
    const digit = Number(gtin13[gtin13.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  const check = (10 - (sum % 10)) % 10;
  const gtin14 = `${gtin13}${check}`;
  const ean = gtin14.startsWith('0') ? gtin14.slice(1) : gtin14;

  return { gtin14, ean };
}

function joinUrl(baseUrl, pathPart) {
  const base = (baseUrl || '').toString();
  const part = (pathPart || '').toString();
  if (!base) return part;
  const a = base.endsWith('/') ? base.slice(0, -1) : base;
  const b = part.startsWith('/') ? part : `/${part}`;
  return `${a}${b}`;
}

async function getToken(cfg) {
  const tokenUrl = (cfg.oauthTokenUrl || '').toString().trim();
  const grantType = (cfg.oauthGrantType || 'client_credentials').toString().trim() || 'client_credentials';
  const clientId = (cfg.oauthClientId || '').toString().trim();
  const resource = (cfg.oauthResource || '').toString().trim();
  const scope = (cfg.oauthScope || '').toString().trim();

  if (!tokenUrl) throw new Error('Missing oauthTokenUrl');
  if (!clientId) throw new Error('Missing oauthClientId');

  const secretCandidates = [];

  function addCandidate(kind, value) {
    const v = (value || '').toString();
    if (!v) return;
    // de-dupe by string content
    if (secretCandidates.some(c => c.value === v)) return;
    secretCandidates.push({ kind, value: v });
  }

  // 1) Use the stored oauthClientSecret verbatim.
  const rawSecret = (cfg.oauthClientSecret || '').toString();
  addCandidate('config.raw', rawSecret);

  // 2) If the stored secret looks base64, try decoding to bytes and various string encodings.
  const compact = rawSecret.replace(/\s+/g, '');
  const looksBase64 = compact.length >= 16 && /^[A-Za-z0-9+/=]+$/.test(compact);
  if (looksBase64) {
    try {
      const bytes = Buffer.from(compact, 'base64');
      if (bytes.length) {
        addCandidate('config.base64->latin1', bytes.toString('latin1'));
        addCandidate('config.base64->utf8', bytes.toString('utf8').replace(/\0/g, '').trim());
        addCandidate('config.base64->utf16le', bytes.toString('utf16le').replace(/\0/g, '').trim());
        addCandidate('config.base64->hex', bytes.toString('hex'));
        // base64url variant
        addCandidate('config.base64url', compact.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''));
      }
    } catch (_) {}
  }

  // 3) If decodedText looks like gzip+base64 and contains suitsApi_clientSecret bytes,
  // also try common encodings of those bytes.
  const decodedText = (cfg.decodedText || '').toString().trim();
  const looksGzipB64 = decodedText.startsWith('H4sI') && /^[A-Za-z0-9+/=\s]+$/.test(decodedText);
  if (looksGzipB64) {
    try {
      const gz = Buffer.from(decodedText.replace(/\s+/g, ''), 'base64');
      const out = zlib.gunzipSync(gz);
      const latin = out.toString('latin1');
      const re = /@S\dC([A-Za-z0-9_./-]+)=@/g;
      const matches = [];
      let m;
      while ((m = re.exec(latin))) matches.push({ key: m[1], idx: m.index, len: m[0].length });
      for (let i = 0; i < matches.length; i++) {
        const cur = matches[i];
        const start = cur.idx + cur.len;
        const end = (i + 1 < matches.length) ? matches[i + 1].idx : out.length;
        const valBytes = out.subarray(start, end);
        if (cur.key !== 'suitsApi_clientSecret') continue;

        addCandidate('qr.bytes->latin1', valBytes.toString('latin1'));
        addCandidate('qr.bytes->utf8', valBytes.toString('utf8').replace(/\0/g, '').trim());
        addCandidate('qr.bytes->utf16le', valBytes.toString('utf16le').replace(/\0/g, '').trim());
        addCandidate('qr.bytes->hex', valBytes.toString('hex'));
        addCandidate('qr.bytes->base64', valBytes.toString('base64'));
        addCandidate('qr.bytes->base64url', valBytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''));
      }
    } catch (_) {}
  }

  let lastStatus = null;
  let lastBody = null;

  if (!secretCandidates.length) throw new Error('Missing oauthClientSecret');

  let lastTried = null;
  for (const candidate of secretCandidates) {
    lastTried = candidate.kind;
    const params = new URLSearchParams();
    params.set('grant_type', grantType);
    params.set('client_id', clientId);
    params.set('client_secret', candidate.value);
    if (scope) params.set('scope', scope);
    else if (resource) params.set('resource', resource);

    const resp = await axios.post(tokenUrl, params.toString(), {
      timeout: 15000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      validateStatus: () => true
    });

    lastStatus = resp.status;
    lastBody = resp.data;

    if (resp.status >= 200 && resp.status < 300 && resp.data && resp.data.access_token) {
      console.log('TOKEN_CANDIDATE', candidate.kind);
      return resp.data.access_token;
    }
  }

  const details = (lastBody && typeof lastBody === 'object') ? (lastBody.error_description || lastBody.error || '') : '';
  throw new Error(`Token failed (${lastStatus ?? 'unknown'})${details ? `: ${details}` : ''}${lastTried ? ` (last tried: ${lastTried})` : ''}`);
}

async function main() {
  const epc = (process.argv[2] || '30361431CC4B7740200835E1').toString().trim();
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  const decoded = decodeSgtin96EpcToGtin(epc);
  if (!decoded?.ean) throw new Error('EPC is not a SGTIN-96 hex EPC (24 hex chars starting with 30...)');

  console.log('EPC', epc);
  console.log('EAN', decoded.ean);
  console.log('BASE_URL', cfg.baseUrl);

  const token = await getToken(cfg);
  console.log('TOKEN_OK', true, 'TOKEN_LEN', token.length);

  const url = joinUrl(cfg.baseUrl, '/api/v1/RfidTag/NewTagFromEanCode');
  const resp = await axios.post(url, { eanCode: decoded.ean }, {
    timeout: 15000,
    headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
    validateStatus: () => true
  });

  console.log('UPSTREAM_STATUS', resp.status);
  if (resp.status >= 200 && resp.status < 300) {
    const raw = resp.data;
    const sample = {
      itemcode: raw?.itemcode,
      short_description: raw?.short_description,
      eancode: raw?.eancode,
      epcCode: raw?.epcCode
    };
    console.log('UPSTREAM_SAMPLE', JSON.stringify(sample, null, 2));
  } else {
    console.log('UPSTREAM_BODY', JSON.stringify(resp.data, null, 2));
  }
}

main().catch((e) => {
  console.error('LOOKUP_TEST_FAILED', e?.message || String(e));
  process.exit(1);
});
