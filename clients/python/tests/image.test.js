// TeleplotImage of the Python client, against what the C++ test expects of the same pixels: every PNG decompressed (zlib of Node) and
// compared pixel by pixel, a Raw picture read by the page, send() on its thread read back. Files: tests/test_image.py.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const test = require('../../../packages/teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../../packages/teleplot-js/tests/helpers/load');

const OUT = path.join(process.env.TELEPLOT_PYTHON_OUT || path.join(__dirname, '..', 'build'), 'images');
const CPP = process.env.TELEPLOT_CPP_IMAGES || path.join(__dirname, '..', '..', 'cpp', 'build', 'images');
const read = (folder, file) => fs.readFileSync(path.join(folder, file));
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xFFFFFFFF; for (const b of bytes) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

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
    const bpp = { 0: 1, 2: 3, 6: 4 }[header.color] * header.depth / 8, line = header.width * bpp;
    const raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(line * header.height);
    for (let y = 0; y < header.height; y++) {
        const filter = raw[y * (line + 1)];
        for (let i = 0; i < line; i++) {
            const v = raw[y * (line + 1) + 1 + i], a = i >= bpp ? out[y * line + i - bpp] : 0, b = y ? out[(y - 1) * line + i] : 0, c = i >= bpp && y ? out[(y - 1) * line + i - bpp] : 0;
            const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
            out[y * line + i] = (v + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]) & 0xFF;
        }
    }
    return { header, pixels: out };
}
function expected(name) { // what the C++ test expects a PNG of these pixels to hold
    const raw = read(CPP, name + '.raw'), rgb = read(CPP, name + '.rgb');
    if (name === 'gray8' || name === 'rgb8' || name === 'rgba8') return raw;
    if (name === 'gray16') { const out = Buffer.from(raw); out.swap16(); return out; }
    if (name === 'bgra8') { const out = Buffer.from(raw); for (let i = 0; i < out.length; i += 4) { out[i] = raw[i + 2]; out[i + 2] = raw[i]; } return out; }
    return rgb;
}

for (const name of ['gray8', 'gray16', 'rgb8', 'bgr8', 'rgba8', 'bgra8', 'yuyv']) {
    for (const variant of ['', '-stride']) {
        test(`PNG ${name}${variant}: the pixels exactly, as the C++ client makes them`, () => {
            const { header, pixels } = decodePng(read(OUT, `py-${name}${variant}.png`));
            assert.deepEqual([header.width, header.height], [name === 'yuyv' ? 38 : 37, 23]);
            assert.ok(pixels.equals(expected(name)), 'every pixel');
        });
    }
}

test('Raw: a Gray16 picture as the C++ client writes it', () => {
    const ours = read(OUT, 'py-gray16.rawpicture');
    assert.deepEqual(Array.from(ours.subarray(0, 8)), [37, 0, 23, 0, 0, 0, 0, 0]);
    assert.ok(ours.subarray(8).equals(read(CPP, 'gray16.raw')), 'the numbers, little-endian');
});

test('send(): the latest picture always, each dated when it was asked', () => {
    const U = loadTeleplot();
    assert.equal(U.files.importData(new Uint8Array(read(OUT, 'py-send.teleplot'))).problems, 0);
    const images = U.datastore.findByName('cam').data[U.protocol.SECTION_TYPE_TELEM_DATA_IMAGE];
    const frames = images.timestamps.map((t, i) => ({ t, value: decodePng(Buffer.from(images.data[1][i], 'base64')).pixels[0] }));
    assert.ok(frames.length >= 3 && frames.length <= 5, `${frames.length} pictures`);
    const last = frames[frames.length - 1];
    assert.equal(last.value, 200, 'the last one asked');
    assert.ok(Math.abs(last.t - 1.004) < 1e-9);
    for (const f of frames) assert.ok(Math.abs(f.t - (1 + f.value / 50 * 0.001)) < 1e-9, `picture ${f.value} dated when it was asked`);
});
