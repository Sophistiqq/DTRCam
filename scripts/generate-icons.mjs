import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = join(__dirname, '..', 'static');

const THEME = { r: 46, g: 27, b: 98 };
const ACCENT = { r: 237, g: 233, b: 71 };

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
	let c = i;
	for (let j = 0; j < 8; j++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	crcTable[i] = c;
}
function crc32(buf) {
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function createPNG(width, height, pixels) {
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

	function chunk(type, data) {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const typeData = Buffer.concat([Buffer.from(type), data]);
		const crcBuf = Buffer.alloc(4);
		crcBuf.writeUInt32BE(crc32(typeData) >>> 0);
		return Buffer.concat([len, typeData, crcBuf]);
	}

	const ihdrData = Buffer.alloc(13);
	ihdrData.writeUInt32BE(width, 0);
	ihdrData.writeUInt32BE(height, 4);
	ihdrData[8] = 8;
	ihdrData[9] = 2;

	const rawRows = [];
	for (let y = 0; y < height; y++) {
		const row = Buffer.alloc(1 + width * 3);
		for (let x = 0; x < width; x++) {
			const idx = 1 + x * 3;
			const px = pixels[y * width + x];
			row[idx] = px.r;
			row[idx + 1] = px.g;
			row[idx + 2] = px.b;
		}
		rawRows.push(row);
	}

	const compressed = deflateSync(Buffer.concat(rawRows));

	return Buffer.concat([
		signature,
		chunk('IHDR', ihdrData),
		chunk('IDAT', compressed),
		chunk('IEND', Buffer.alloc(0))
	]);
}

function drawCircle(pixels, w, h, cx, cy, r, color) {
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const dx = x - cx;
			const dy = y - cy;
			if (dx * dx + dy * dy <= r * r) {
				pixels[y * w + x] = color;
			}
		}
	}
}

const GLYPHS = {
	D: [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0]],
	T: [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
	C: [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,1],[0,1,1,1,0]],
	A: [[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1]],
	M: [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]]
};

function drawText(pixels, w, h, text, color) {
	const charW = Math.round(w * 0.18);
	const charH = Math.round(h * 0.22);
	const gap = Math.round(w * 0.04);
	const totalW = text.length * charW + (text.length - 1) * gap;
	const startX = Math.round((w - totalW) / 2);
	const startY = Math.round((h - charH) / 2);

	let offsetX = startX;
	for (const ch of text) {
		const glyph = GLYPHS[ch];
		if (!glyph) { offsetX += charW + gap; continue; }
		const gw = glyph[0].length;
		const gh = glyph.length;
		const cellW = charW / gw;
		const cellH = charH / gh;
		for (let gy = 0; gy < gh; gy++) {
			for (let gx = 0; gx < gw; gx++) {
				if (!glyph[gy][gx]) continue;
				const px0 = Math.round(offsetX + gx * cellW);
				const py0 = Math.round(startY + gy * cellH);
				const px1 = Math.round(offsetX + (gx + 1) * cellW);
				const py1 = Math.round(startY + (gy + 1) * cellH);
				for (let py = py0; py < py1 && py < h; py++) {
					for (let px = px0; px < px1 && px < w; px++) {
						if (py >= 0 && px >= 0) pixels[py * w + px] = color;
					}
				}
			}
		}
		offsetX += charW + gap;
	}
}

function generateIcon(size) {
	const pixels = new Array(size * size).fill(null).map(() => ({ ...THEME }));
	const cx = size / 2;
	const cy = size / 2;

	drawCircle(pixels, size, size, cx, cy, size * 0.42, { r: 60, g: 40, b: 130 });
	drawCircle(pixels, size, size, cx, cy, size * 0.36, THEME);
	drawText(pixels, size, size, 'DC', ACCENT);

	return createPNG(size, size, pixels);
}

for (const [size, file] of [[192, 'icon-192.png'], [512, 'icon-512.png']]) {
	const png = generateIcon(size);
	writeFileSync(join(STATIC_DIR, file), png);
	console.log(`Generated ${file} (${png.length} bytes)`);
}
