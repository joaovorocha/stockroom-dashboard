const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'icons');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = u32be(data.length);
  const crc = u32be(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function writePng(filePath, width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, png);
}

function setPixel(rgba, w, x, y, r, g, b, a = 255) {
  const idx = (y * w + x) * 4;
  rgba[idx] = r;
  rgba[idx + 1] = g;
  rgba[idx + 2] = b;
  rgba[idx + 3] = a;
}

function drawFilledRect(rgba, w, h, x0, y0, x1, y1, r, g, b, a = 255) {
  const xa = Math.max(0, Math.min(w, x0));
  const xb = Math.max(0, Math.min(w, x1));
  const ya = Math.max(0, Math.min(h, y0));
  const yb = Math.max(0, Math.min(h, y1));
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      setPixel(rgba, w, x, y, r, g, b, a);
    }
  }
}

// 5x7 bitmap "S"
const S_5x7 = [
  '01110',
  '10000',
  '10000',
  '01110',
  '00001',
  '00001',
  '11110'
];

function drawBitmap(rgba, w, h, bitmap, x, y, scale, r, g, b, a = 255) {
  for (let row = 0; row < bitmap.length; row++) {
    for (let col = 0; col < bitmap[row].length; col++) {
      if (bitmap[row][col] !== '1') continue;
      drawFilledRect(
        rgba, w, h,
        x + col * scale,
        y + row * scale,
        x + (col + 1) * scale,
        y + (row + 1) * scale,
        r, g, b, a
      );
    }
  }
}

function makeIcon(size) {
  const w = size, h = size;
  const rgba = Buffer.alloc(w * h * 4);

  // Background: black
  drawFilledRect(rgba, w, h, 0, 0, w, h, 0, 0, 0, 255);

  // Draw a subtle inner border on larger icons
  if (size >= 128) {
    drawFilledRect(rgba, w, h, 0, 0, w, 3, 20, 20, 20, 255);
    drawFilledRect(rgba, w, h, 0, h - 3, w, h, 20, 20, 20, 255);
    drawFilledRect(rgba, w, h, 0, 0, 3, h, 20, 20, 20, 255);
    drawFilledRect(rgba, w, h, w - 3, 0, w, h, 20, 20, 20, 255);
  }

  // White "S" centered
  const bitmapW = S_5x7[0].length;
  const bitmapH = S_5x7.length;
  const scale = Math.floor(size / 10);
  const drawW = bitmapW * scale;
  const drawH = bitmapH * scale;
  const x = Math.floor((w - drawW) / 2);
  const y = Math.floor((h - drawH) / 2);
  drawBitmap(rgba, w, h, S_5x7, x, y, scale, 255, 255, 255, 255);

  return rgba;
}

function writeIco(filePath, png32) {
  // ICO header (single image) with PNG data
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(1, 4); // count

  const dir = Buffer.alloc(16);
  dir[0] = 32; // width
  dir[1] = 32; // height
  dir[2] = 0; // colors
  dir[3] = 0; // reserved
  dir.writeUInt16LE(1, 4); // planes
  dir.writeUInt16LE(32, 6); // bit count
  dir.writeUInt32LE(png32.length, 8); // bytes in resource
  dir.writeUInt32LE(6 + 16, 12); // offset

  fs.writeFileSync(filePath, Buffer.concat([header, dir, png32]));
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const sizes = [32, 180, 192, 512];
  for (const size of sizes) {
    const rgba = makeIcon(size);
    writePng(path.join(OUT_DIR, `icon-${size}.png`), size, size, rgba);
  }

  // Apple expects exactly this filename by convention in many setups.
  fs.copyFileSync(path.join(OUT_DIR, 'icon-180.png'), path.join(OUT_DIR, 'apple-touch-icon.png'));

  // favicon.ico (32x32)
  const png32 = fs.readFileSync(path.join(OUT_DIR, 'icon-32.png'));
  writeIco(path.join(ROOT, 'public', 'favicon.ico'), png32);

  console.log('Generated icons in public/icons and public/favicon.ico');
}

main();

