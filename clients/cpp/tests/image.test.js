// TeleplotImage.h, checked against decoders that are not ours: every PNG is decompressed (zlib of Node) and compared pixel by pixel;
// every JPEG is decoded by libjpeg (djpeg) and compared with what libjpeg's own encoder (cjpeg) makes of the same pixels: as close
// to the pixels, about as small. Without djpeg / cjpeg (libjpeg-turbo-progs) the JPEG checks are skipped. Files: tests/test_image.cpp.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const test = require('../../../packages/teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../../packages/teleplot-js/tests/helpers/load');

const OUT = path.join(process.env.TELEPLOT_CPP_OUT || path.join(__dirname, '..', 'build'), 'images');
const FORMATS = ['gray8', 'gray16', 'rgb8', 'bgr8', 'rgba8', 'bgra8', 'yuyv'];
const size = (name) => name === 'yuyv' ? [38, 23] : [37, 23];
const read = (file) => fs.readFileSync(path.join(OUT, file));
const has = (tool) => { try { execFileSync('sh', ['-c', `command -v ${tool}`]); return true; } catch (e) { return false; } };
const LIBJPEG = has('djpeg') && has('cjpeg');

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xFFFFFFFF; for (const b of bytes) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

// A PNG read by hand: chunks and their CRC, then the rows unfiltered
function decodePng(bytes) {
    assert.deepEqual(Array.from(bytes.subarray(0, 8)), [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    let at = 8, header, idat = [];
    while (at < bytes.length) {
        const length = bytes.readUInt32BE(at), type = bytes.toString('latin1', at + 4, at + 8), data = bytes.subarray(at + 8, at + 8 + length);
        assert.equal(bytes.readUInt32BE(at + 8 + length), crc32(bytes.subarray(at + 4, at + 8 + length)), `CRC of ${type}`);
        if (type === 'IHDR') header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9] };
        if (type === 'IDAT') idat.push(data);
        at += 12 + length;
    }
    const channels = { 0: 1, 2: 3, 6: 4 }[header.color], bpp = channels * header.depth / 8, line = header.width * bpp;
    const raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(line * header.height);
    for (let y = 0; y < header.height; y++) {
        const filter = raw[y * (line + 1)];
        for (let i = 0; i < line; i++) {
            const v = raw[y * (line + 1) + 1 + i], a = i >= bpp ? out[y * line + i - bpp] : 0, b = y ? out[(y - 1) * line + i] : 0, c = i >= bpp && y ? out[(y - 1) * line + i - bpp] : 0;
            const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
            const predicted = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
            out[y * line + i] = (v + predicted) & 0xFF;
        }
    }
    return { header, pixels: out };
}
// What the PNG of a format must hold, from the pixels given (.raw) and their RGB (.rgb)
function expected(name, base) {
    const raw = read(base + '.raw'), rgb = read(base + '.rgb');
    if (name === 'gray8' || name === 'rgb8' || name === 'rgba8') return raw;
    if (name === 'gray16') { const out = Buffer.from(raw); out.swap16(); return out; } // (stored big endian)
    if (name === 'bgra8') { const out = Buffer.from(raw); for (let i = 0; i < out.length; i += 4) { out[i] = raw[i + 2]; out[i + 2] = raw[i]; } return out; }
    return rgb; // bgr8, yuyv
}

for (const name of FORMATS) {
    for (const variant of ['', '-stride']) {
        test(`PNG ${name}${variant}: the pixels exactly`, () => {
            const base = name + variant, [w, h] = size(name);
            const { header, pixels } = decodePng(read(base + '.png'));
            assert.deepEqual([header.width, header.height], [w, h]);
            assert.deepEqual({ depth: header.depth, color: header.color }, name === 'gray16' ? { depth: 16, color: 0 } : name === 'gray8' ? { depth: 8, color: 0 } : name.startsWith('rgba') || name.startsWith('bgra') ? { depth: 8, color: 6 } : { depth: 8, color: 2 });
            assert.ok(pixels.equals(expected(name, base)), 'every pixel');
        });
    }
}

const psnr = (a, b) => { let sum = 0; for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2; return 10 * Math.log10(255 * 255 / (sum / a.length)); };
const pnmPixels = (bytes) => { let lines = 0, at = 0; while (lines < 3) { if (bytes[at++] === 0x0A) lines++; } return bytes.subarray(at); };

for (const name of FORMATS.filter((n) => n !== 'gray16')) {
    for (const quality of [80, 100]) {
        test(`JPEG ${name} q${quality}: decoded by libjpeg, as close to the pixels and about as small as libjpeg makes it`, { skip: LIBJPEG ? undefined : 'no djpeg / cjpeg' }, () => {
            const [w, h] = size(name), gray = name === 'gray8';
            const source = gray ? read(name + '.raw') : read(name + '.rgb');
            const pnm = path.join(OUT, `${name}-q${quality}.${gray ? 'pgm' : 'ppm'}`);
            fs.writeFileSync(pnm, Buffer.concat([Buffer.from(`${gray ? 'P5' : 'P6'}\n${w} ${h}\n255\n`), source]));
            const ours = read(`${name}-q${quality}.jpg`);
            const theirs = execFileSync('cjpeg', ['-quality', String(quality), ...(gray ? ['-grayscale'] : ['-sample', '2x2']), pnm]);
            const decode = (bytes) => pnmPixels(execFileSync('djpeg', ['-pnm'], { input: bytes }));
            const mine = psnr(source, decode(ours)), reference = psnr(source, decode(theirs));
            assert.ok(mine >= reference - 0.5, `PSNR ${mine.toFixed(2)} dB, libjpeg ${reference.toFixed(2)} dB`);
            assert.ok(ours.length <= theirs.length * 1.1, `${ours.length} bytes, libjpeg ${theirs.length}`);
        });
    }
}

test('the page stores what send() encoded on its thread: the latest picture always, each dated when it was asked', () => {
    const U = loadTeleplot();
    assert.equal(U.files.importData(new Uint8Array(fs.readFileSync(path.join(OUT, 'send.teleplot')))).problems, 0);
    const cam = U.datastore.findByName('cam'), images = cam.data[U.protocol.SECTION_TYPE_TELEM_DATA_IMAGE];
    const frames = images.timestamps.map((t, i) => ({ t, value: decodePng(Buffer.from(images.data[1][i], 'base64')).pixels[0] }));
    assert.ok(frames.length >= 1 && frames.length <= 5);
    assert.deepEqual(frames[frames.length - 1], { t: 1.004, value: 200 }, 'the last one asked');
    for (const f of frames) assert.ok(Math.abs(f.t - (1 + f.value / 50 * 0.001)) < 1e-9, `picture ${f.value} dated when it was asked`);
    const encoded = U.datastore.findByName('teleplot.images.encoded');
    assert.ok(encoded && encoded.getAttribute(U.protocol.TELEM_ATTR_VIEW_LABEL) === 'teleplot images', 'sendStats(): the encoding thread sends its own');
});

test('depth maps: Raw gray16 and float32, a 16-bit PNG, their scale; the page reads the same numbers', async () => {
    const U = loadTeleplot();
    assert.equal(U.files.importData(new Uint8Array(fs.readFileSync(path.join(OUT, 'depth.teleplot')))).problems, 0);
    const P = U.protocol;
    const values = async (name) => { const entry = U.datastore.findByName(name).data[P.SECTION_TYPE_TELEM_DATA_IMAGE]; return U.pictures.decodeAsync(entry, entry.timestamps.length - 1); };
    const mm = await values('depth.mm'), png = await values('depth.png');
    const expected = []; for (let y = 0; y < 23; y++) for (let x = 0; x < 37; x++) expected.push((x * 997 + y * 131) & 0xFFFF);
    assert.deepEqual([mm.width, mm.height, mm.format], [37, 23, 'gray16']);
    assert.deepEqual(Array.from(mm.values), expected, 'Raw gray16: the numbers (rows given with padding)');
    assert.deepEqual(Array.from(png.values), expected, 'the same numbers through a 16-bit PNG');
    const metres = Array.from({ length: 19 * 7 }, (_, i) => i % 5 === 0 ? NaN : 0.25 * i);
    for (const name of ['depth.m', 'depth.sent']) {
        const m = await values(name);
        assert.deepEqual([m.width, m.height, m.format, Array.from(m.values)], [19, 7, 'float32', metres], name);
    }
    assert.deepEqual(U.pictures.settings(U.datastore.findByName('depth.mm')), { scale: 0.001, invalid: 0, depth: true });
    assert.deepEqual(U.pictures.settings(U.datastore.findByName('depth.m')), { scale: 1, invalid: undefined, depth: true }, 'NAN: every number is a measure');
    assert.deepEqual(U.pictures.settings(U.datastore.findByName('thermal')), { scale: 0.01, invalid: 0, depth: false }, 'pixelValues: not distances');
    assert.equal(U.pictures.valueAt(mm, 3, 2, U.pictures.settings(U.datastore.findByName('depth.mm'))), (3 * 997 + 2 * 131) * 0.001);
});
