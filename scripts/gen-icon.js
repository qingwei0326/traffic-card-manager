/**
 * Generate app icons without external dependencies.
 *
 * Outputs:
 * - build/icon.png: 512px runtime icon for Electron tray/notifications
 * - build/icon.ico: multi-size Windows package icon
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BASE_SIZE = 512;
const PNG_SIZE = 512;
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function rgba(hex, alpha = 255) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    alpha,
  ];
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ];
}

function createCanvas(size) {
  return {
    size,
    pixels: Buffer.alloc(size * size * 4),
    samples: size <= 32 ? 4 : 3,
  };
}

function blendPixel(canvas, x, y, source, coverage) {
  if (coverage <= 0 || source[3] <= 0) return;
  if (x < 0 || x >= canvas.size || y < 0 || y >= canvas.size) return;

  const idx = (y * canvas.size + x) * 4;
  const srcA = (source[3] / 255) * coverage;
  const dstA = canvas.pixels[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);

  if (outA <= 0) return;

  canvas.pixels[idx] = Math.round((source[0] * srcA + canvas.pixels[idx] * dstA * (1 - srcA)) / outA);
  canvas.pixels[idx + 1] = Math.round((source[1] * srcA + canvas.pixels[idx + 1] * dstA * (1 - srcA)) / outA);
  canvas.pixels[idx + 2] = Math.round((source[2] * srcA + canvas.pixels[idx + 2] * dstA * (1 - srcA)) / outA);
  canvas.pixels[idx + 3] = Math.round(outA * 255);
}

function drawShape(canvas, bounds, contains, colorForPoint) {
  const samples = canvas.samples;
  const sampleCount = samples * samples;
  const minX = Math.max(0, Math.floor(bounds.x));
  const minY = Math.max(0, Math.floor(bounds.y));
  const maxX = Math.min(canvas.size - 1, Math.ceil(bounds.x + bounds.w));
  const maxY = Math.min(canvas.size - 1, Math.ceil(bounds.y + bounds.h));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          if (contains(px, py)) hits += 1;
        }
      }

      if (hits > 0) {
        const coverage = hits / sampleCount;
        const color = typeof colorForPoint === 'function'
          ? colorForPoint(x + 0.5, y + 0.5)
          : colorForPoint;
        blendPixel(canvas, x, y, color, coverage);
      }
    }
  }
}

function containsRoundedRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;

  const nearestX = Math.max(x + r, Math.min(px, x + w - r));
  const nearestY = Math.max(y + r, Math.min(py, y + h - r));
  const dx = px - nearestX;
  const dy = py - nearestY;

  return dx * dx + dy * dy <= r * r;
}

function drawRoundedRect(canvas, x, y, w, h, r, color) {
  drawShape(
    canvas,
    { x, y, w, h },
    (px, py) => containsRoundedRect(px, py, x, y, w, h, r),
    color,
  );
}

function drawGradientRoundedRect(canvas, x, y, w, h, r, top, bottom) {
  drawShape(
    canvas,
    { x, y, w, h },
    (px, py) => containsRoundedRect(px, py, x, y, w, h, r),
    (_, py) => {
      const t = Math.max(0, Math.min(1, (py - y) / h));
      return mix(top, bottom, t);
    },
  );
}

function containsCard(px, py, x, y, w, h, r, cut) {
  if (!containsRoundedRect(px, py, x, y, w, h, r)) return false;

  const cutX = x + w - cut;
  const relX = px - cutX;
  const relY = py - y;

  return !(relX > 0 && relY < cut && relY < relX);
}

function drawCard(canvas, x, y, w, h, r, cut, color) {
  drawShape(
    canvas,
    { x, y, w, h },
    (px, py) => containsCard(px, py, x, y, w, h, r, cut),
    color,
  );
}

function drawCircle(canvas, cx, cy, radius, color) {
  drawShape(
    canvas,
    { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 },
    (px, py) => {
      const dx = px - cx;
      const dy = py - cy;
      return dx * dx + dy * dy <= radius * radius;
    },
    color,
  );
}

function drawArc(canvas, cx, cy, radius, width, fromDeg, toDeg, color) {
  drawShape(
    canvas,
    {
      x: cx - radius - width,
      y: cy - radius - width,
      w: (radius + width) * 2,
      h: (radius + width) * 2,
    },
    (px, py) => {
      const dx = px - cx;
      const dy = py - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      return distance >= radius - width / 2
        && distance <= radius + width / 2
        && angle >= fromDeg
        && angle <= toDeg;
    },
    color,
  );
}

function renderIcon(size) {
  const canvas = createCanvas(size);
  const s = size / BASE_SIZE;
  const p = (value) => value * s;

  const bgTop = rgba('#FFFFFF');
  const bgBottom = rgba('#EEF3F8');
  const bgBorder = rgba('#D8E1EA');
  const card = rgba('#FFFFFF');
  const cardEdge = rgba('#E2E8F0');
  const chipFill = rgba('#F6F1E7');
  const chipLine = rgba('#B79A5A');
  const teal = rgba('#2AB7A9');

  drawRoundedRect(canvas, p(35), p(44), p(442), p(430), p(106), rgba('#111827', 24));
  drawRoundedRect(canvas, p(32), p(32), p(448), p(448), p(104), bgBorder);
  drawGradientRoundedRect(canvas, p(38), p(38), p(436), p(436), p(98), bgTop, bgBottom);

  drawCard(canvas, p(146), p(128), p(238), p(276), p(34), p(58), rgba('#0F172A', 28));
  drawCard(canvas, p(142), p(118), p(238), p(276), p(34), p(58), cardEdge);
  drawCard(canvas, p(150), p(126), p(222), p(260), p(28), p(54), card);

  drawRoundedRect(canvas, p(188), p(200), p(140), p(116), p(20), chipFill);
  drawRoundedRect(canvas, p(206), p(224), p(104), p(10), p(5), chipLine);
  drawRoundedRect(canvas, p(206), p(253), p(104), p(10), p(5), chipLine);
  drawRoundedRect(canvas, p(206), p(282), p(104), p(10), p(5), chipLine);
  drawRoundedRect(canvas, p(251), p(211), p(10), p(94), p(5), chipLine);

  drawCircle(canvas, p(302), p(340), p(10), teal);
  drawArc(canvas, p(302), p(340), p(30), p(8), p(-78), p(-16), teal);
  drawArc(canvas, p(302), p(340), p(50), p(8), p(-78), p(-16), teal);

  return canvas.pixels;
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  const table = new Int32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  for (let i = 0; i < buffer.length; i += 1) {
    crc = table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));

  return Buffer.concat([length, typeAndData, checksum]);
}

function createPNG(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const rows = [];
  for (let y = 0; y < size; y += 1) {
    rows.push(0);
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      rows.push(pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]);
    }
  }

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(Buffer.from(rows))),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = header.length + directory.length;

  entries.forEach((entry, index) => {
    const pos = index * 16;
    directory[pos] = entry.size >= 256 ? 0 : entry.size;
    directory[pos + 1] = entry.size >= 256 ? 0 : entry.size;
    directory[pos + 2] = 0;
    directory[pos + 3] = 0;
    directory.writeUInt16LE(1, pos + 4);
    directory.writeUInt16LE(32, pos + 6);
    directory.writeUInt32LE(entry.png.length, pos + 8);
    directory.writeUInt32LE(offset, pos + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

function main() {
  const buildDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(buildDir, { recursive: true });

  const runtimePng = createPNG(PNG_SIZE, renderIcon(PNG_SIZE));
  const icoEntries = ICO_SIZES.map((size) => ({
    size,
    png: createPNG(size, renderIcon(size)),
  }));
  const ico = createICO(icoEntries);

  const pngPath = path.join(buildDir, 'icon.png');
  const icoPath = path.join(buildDir, 'icon.ico');
  fs.writeFileSync(pngPath, runtimePng);
  fs.writeFileSync(icoPath, ico);

  console.log(`Generated: ${pngPath} (${runtimePng.length} bytes)`);
  console.log(`Generated: ${icoPath} (${ico.length} bytes)`);
}

main();
