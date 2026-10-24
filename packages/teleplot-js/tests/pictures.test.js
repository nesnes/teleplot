// 108-pictures: pictures of values (depth maps): 16-bit gray PNG and plain buffers decoded, scale, colors, the depth map in a scene
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { loadTeleplot } = require('./helpers/load');
const { PacketBuilder } = require('./helpers/packet');

// A 16-bit grayscale PNG of these values (rows of numbers), each row with a filter of its own (0 to 4, in turn)
function png16(rows) {
    const width = rows[0].length, height = rows.length;
    const raw = [];
    let above = new Uint8Array(width * 2);
    rows.forEach((values, y) => {
        const line = new Uint8Array(width * 2);
        values.forEach((v, x) => { line[2*x] = v >> 8; line[2*x+1] = v & 255; });
        const filter = y % 5, out = new Uint8Array(line.length);
        for (let i = 0; i < line.length; i++) {
            const a = i >= 2 ? line[i-2] : 0, b = above[i], c = i >= 2 ? above[i-2] : 0;
            const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            const predicted = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
            out[i] = (line[i] - predicted) & 255;
        }
        raw.push(filter, ...out);
        above = line;
    });
    const chunk = (type, data) => {
        const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
        return Buffer.concat([length, Buffer.from(type, 'ascii'), Buffer.from(data), Buffer.alloc(4)]); // (CRC not checked by the page)
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 16; header[9] = 0;
    const idat = zlib.deflateSync(Buffer.from(raw));
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', header),
        chunk('IDAT', idat.subarray(0, 7)), chunk('IDAT', idat.subarray(7)), chunk('IEND', Buffer.alloc(0))]).toString('base64'); // (pixels in two IDAT chunks)
}
// A plain buffer: {width, height, format, 3 reserved bytes} then the pixels, little-endian
function raw(width, height, format, values) {
    const size = format === 1 ? 4 : 2, bytes = Buffer.alloc(8 + width * height * size);
    bytes.writeUInt16LE(width, 0); bytes.writeUInt16LE(height, 2); bytes[4] = format;
    values.forEach((v, i) => { if (format === 1) bytes.writeFloatLE(v, 8 + i * 4); else bytes.writeUInt16LE(v, 8 + i * 2); });
    return bytes.toString('base64');
}
const ROWS = [[0, 1, 2, 3], [1000, 65535, 0, 300], [4242, 4243, 4244, 9], [1, 0, 65534, 7], [256, 512, 1024, 2048], [9, 8, 7, 6]];

test('info: what a picture is from its first bytes (values or a picture to show as it is)', () => {
    const T = loadTeleplot();
    const P = T.protocol, pictures = T.pictures;
    assert.deepEqual(pictures.info(P.IMAGE_TYPE_PNG, png16(ROWS)), { values: true, width: 4, height: 6, format: 'gray16', error: '' });
    assert.deepEqual(pictures.info(P.IMAGE_TYPE_RAW, raw(3, 2, 1, [1, 2, 3, 4, 5, 6])), { values: true, width: 3, height: 2, format: 'float32', error: '' });
    assert.equal(pictures.info(P.IMAGE_TYPE_RAW, raw(1, 1, 0, [1]).replace(/^AQABAAA/, 'AQABAAc')).error, 'Unknown pixel format 7');
    const rgb = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    assert.deepEqual(pictures.info(P.IMAGE_TYPE_PNG, rgb), { values: false }, 'an 8-bit color PNG is shown by the browser');
    assert.deepEqual(pictures.info(P.IMAGE_TYPE_JPEG, '/9j/4AAQSkZJRgABAQ'), { values: false });
    assert.equal(pictures.info(P.IMAGE_TYPE_PNG, 'AAAA'), undefined);
});

test('plain buffers: gray16 and float32 read as they are, a size that does not match says so', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    T.parseDataText({ data: 'RAW|depth:1000:' + raw(3, 2, 0, [0, 1, 2, 65535, 1000, 7]) + '§mm', timestamp: 0 });
    const telem = T.datastore.getTelemetry('depth');
    const entry = telem.data[P.SECTION_TYPE_TELEM_DATA_IMAGE];
    assert.deepEqual(entry.data[0], [P.IMAGE_TYPE_RAW], 'stored as received: type and base64');
    assert.equal(telem.getAttribute(P.TELEM_ATTR_UNIT), 'mm');
    const decoded = T.pictures.decode(entry, 0);
    assert.ok(decoded.values instanceof Uint16Array, 'decoded at once (no inflating)');
    assert.deepEqual([decoded.width, decoded.height, decoded.format, Array.from(decoded.values)], [3, 2, 'gray16', [0, 1, 2, 65535, 1000, 7]]);
    assert.equal(T.pictures.decode(entry, 0), decoded, 'kept: decoded once');

    T.parseDataText({ data: 'RAW|meters:1000:' + raw(2, 2, 1, [0.5, NaN, 1.25, Infinity]), timestamp: 0 });
    const floats = T.pictures.decode(T.datastore.getTelemetry('meters').data[P.SECTION_TYPE_TELEM_DATA_IMAGE], 0);
    assert.ok(floats.values instanceof Float32Array);
    assert.deepEqual(Array.from(floats.values), [0.5, NaN, 1.25, Infinity]);

    T.parseDataText({ data: 'RAW|short:1000:' + raw(3, 2, 0, [1, 2, 3, 4, 5, 6]).slice(0, -4), timestamp: 0 });
    const short = T.pictures.decode(T.datastore.getTelemetry('short').data[P.SECTION_TYPE_TELEM_DATA_IMAGE], 0);
    assert.equal(short.values, undefined);
    assert.match(short.error, /bytes of pixels for 3 x 2 gray16/);
});

test('16-bit PNG: inflated by the browser API, every PNG filter undone, numbers exact (big-endian in the file)', async () => {
    const T = loadTeleplot();
    const P = T.protocol;
    T.parseDataText({ data: 'PNG|depth:1000:' + png16(ROWS), timestamp: 0 });
    const entry = T.datastore.getTelemetry('depth').data[P.SECTION_TYPE_TELEM_DATA_IMAGE];
    assert.equal(T.pictures.isValues(entry, 0), true);
    assert.equal(T.pictures.decode(entry, 0), undefined, 'not ready on the first ask: decoded without blocking the page');
    const decoded = await T.pictures.decodeAsync(entry, 0);
    assert.deepEqual(Array.from(decoded.values), ROWS.flat());
    assert.equal(T.pictures.decode(entry, 0), decoded);
    assert.equal(entry.data[1][0], png16(ROWS), 'the stored sample is untouched');
});

test('PNG pictures that come faster than they are decoded: the one in progress finishes, only the latest one asked waits', async () => {
    const T = loadTeleplot();
    const P = T.protocol;
    for (let i = 0; i < 4; i++) T.parseDataText({ data: `PNG|depth:${1000 + i}:` + png16([[i, i + 1]]), timestamp: 0 });
    const entry = T.datastore.getTelemetry('depth').data[P.SECTION_TYPE_TELEM_DATA_IMAGE];
    T.pictures.decode(entry, 0); T.pictures.decode(entry, 1); T.pictures.decode(entry, 2);
    const last = await T.pictures.decodeAsync(entry, 2);
    assert.deepEqual(Array.from(last.values), [2, 3]);
    assert.deepEqual(Array.from((await T.pictures.decodeAsync(entry, 0)).values), [0, 1]);
    assert.deepEqual(Array.from((await T.pictures.decodeAsync(entry, 1)).values), [1, 2], 'one that was skipped is decoded when asked again');
});

test('scale, no measure and depth: ATTR|name|scale=|nodata=|depth= (text) and TELEM_ATTR_PIXELS (binary)', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    T.parseDataText({ data: 'RAW|depth:1000:' + raw(2, 1, 0, [0, 1500]), timestamp: 0 });
    const telem = T.datastore.getTelemetry('depth');
    assert.deepEqual(T.pictures.settings(telem), { scale: 1, invalid: 0, depth: true }, 'by default: the numbers, 0 is no measure, a depth map');
    T.parseDataText('ATTR|depth|scale=0.001|unit=m');
    assert.deepEqual(T.pictures.settings(telem), { scale: 0.001, invalid: 0, depth: true });
    assert.equal(telem.getAttribute(P.TELEM_ATTR_UNIT), 'm');
    const decoded = T.pictures.decode(telem.data[P.SECTION_TYPE_TELEM_DATA_IMAGE], 0);
    assert.equal(T.pictures.valueAt(decoded, 1, 0, T.pictures.settings(telem)), 1.5);
    assert.equal(T.pictures.valueAt(decoded, 0, 0, T.pictures.settings(telem)), undefined, 'no measure');
    assert.equal(T.pictures.valueAt(decoded, 2, 0, T.pictures.settings(telem)), undefined, 'outside the picture');
    T.parseDataText('ATTR|depth|nodata=|depth=0');
    assert.deepEqual(T.pictures.settings(telem), { scale: 0.001, invalid: undefined, depth: false }, '"nodata=": every number is a measure');
    assert.equal(T.pictures.valueAt(decoded, 0, 0, T.pictures.settings(telem)), 0);
    assert.equal(T.parseDataText('ATTR|depth|scale=0'), 1, 'a scale of 0 is refused');
    assert.equal(T.parseDataText('ATTR|depth|scale=2|unknown=1'), 1, 'a line with an unknown key is refused as a whole');
    assert.equal(T.pictures.settings(telem).scale, 0.001);

    const packet = new PacketBuilder(3).attrs(1, [[0, 'tof'], [16, { scale: 0.00025, invalid: 65535, depth: true }]]).build();
    T.parseDataBinary(packet);
    const tof = T.datastore.findByName('tof');
    assert.deepEqual(tof.getAttribute(P.TELEM_ATTR_PIXELS), { scale: 0.00025, invalid: 65535, depth: true });
    assert.deepEqual(T.pictures.settings(tof), { scale: 0.00025, invalid: 65535, depth: true });
    T.parseDataBinary(new PacketBuilder(3).attrs(1, [[16, { scale: 1, invalid: undefined, depth: false }]]).build());
    assert.deepEqual(T.pictures.settings(tof), { scale: 1, invalid: undefined, depth: false });
});

test('a plain buffer in several binary parts is stored once complete', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    const bytes = Buffer.from(raw(4, 3, 1, [...Array(12).keys()].map((i) => i / 4)), 'base64');
    T.parseDataBinary(new PacketBuilder(5).attrs(1, [[0, 'depth']]).images(1, 1000000, [[0, 2, 1, 2, [...bytes.subarray(30)]], [0, 2, 0, 2, [...bytes.subarray(0, 30)]]]).build());
    const entry = T.datastore.findByName('depth').data[P.SECTION_TYPE_TELEM_DATA_IMAGE];
    assert.deepEqual(entry.data[0], [P.IMAGE_TYPE_RAW]);
    assert.deepEqual(Array.from(T.pictures.decode(entry, 0).values), [...Array(12).keys()].map((i) => i / 4));
});

test('colors: between the range of the telemetry or what the picture holds (1st to 99th percentile), no measure = transparent', () => {
    const T = loadTeleplot();
    const P = T.protocol, pictures = T.pictures;
    const values = [0, ...Array.from({ length: 198 }, (_, i) => 1000 + i), 60000]; // 0: no measure; 60000: an outlier
    T.parseDataText({ data: 'RAW|depth:1000:' + raw(200, 1, 0, values), timestamp: 0 });
    const telem = T.datastore.getTelemetry('depth');
    const decoded = pictures.decode(telem.data[P.SECTION_TYPE_TELEM_DATA_IMAGE], 0);
    const settings = pictures.settings(telem);
    const spread = pictures.spread(decoded, settings);
    assert.ok(spread.min >= 1000 && spread.min <= 1003 && spread.max >= 1194 && spread.max <= 1197, JSON.stringify(spread) + ': the outlier and the hole do not stretch the colors');
    assert.deepEqual(pictures.colorRange(decoded, settings, telem), spread, 'no range: what the picture holds');
    T.parseDataText('ATTR|depth|min=500|max=5000');
    assert.deepEqual(pictures.colorRange(decoded, settings, telem), { min: 500, max: 5000 });
    assert.deepEqual(pictures.colorRange(decoded, settings, telem, 'picture'), spread);

    const out = new Uint8ClampedArray(200 * 4), lut = {};
    pictures.colorize(decoded, { min: 1000, max: 1197, colormap: 'gray', scale: 1, invalid: 0 }, out, lut);
    assert.deepEqual(Array.from(out.subarray(0, 8)), [0, 0, 0, 0, 0, 0, 0, 255], 'no measure: transparent; the low end: the first color');
    assert.deepEqual(Array.from(out.subarray(198 * 4, 200 * 4)), [255, 255, 255, 255, 255, 255, 255, 255], 'the high end and above: the last color');
    const table = lut.table;
    pictures.colorize(decoded, { min: 1000, max: 1197, colormap: 'gray', scale: 1, invalid: 0 }, out, lut);
    assert.equal(lut.table, table, 'the table of a 16-bit picture is kept while the options do not change');

    T.parseDataText({ data: 'RAW|meters:1000:' + raw(3, 1, 1, [NaN, 1, 2]), timestamp: 0 });
    const floats = pictures.decode(T.datastore.getTelemetry('meters').data[P.SECTION_TYPE_TELEM_DATA_IMAGE], 0);
    pictures.colorize(floats, { min: 1, max: 2, colormap: 'gray', scale: 1, invalid: 0 }, out);
    assert.deepEqual(Array.from(out.subarray(0, 12)), [0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255]);
    assert.deepEqual(pictures.spread(floats, pictures.settings(T.datastore.getTelemetry('meters'))), { min: 1, max: 2 });
    assert.equal(pictures.COLORMAPS.turbo.length, 256);
    assert.match(pictures.gradient('viridis'), /^linear-gradient\(to right, rgb\(/);
});

test('depth map in a scene: each pixel along its ray, distance along the axis of the camera, lens distortion followed back', () => {
    const T = loadTeleplot();
    const S = T.view.ViewScene3D, V = T.view.ViewImage;
    const camera = { width: 640, height: 480, fx: 500, fy: 480, cx: 319.5, cy: 239.5, distortion: [-0.2, 0.05, 0.001, -0.002, 0] };
    // A picture half the size of the intrinsics: same proportions
    const rays = S.depthRays(camera, 320, 240, 1);
    assert.equal(rays.count, 320 * 240);
    const values = new Uint16Array(320 * 240).fill(2000);
    values[0] = 0;
    const positions = new Float32Array(rays.count * 3), colors = new Uint8Array(rays.count * 3);
    const box = S.depthPoints({ values, width: 320, height: 240 }, { scale: 0.001, invalid: 0, depth: true }, rays, positions, colors, { min: 0, max: 4 });
    assert.equal(box.count, 320 * 240 - 1, 'the pixel without measure is left out');
    assert.ok(Math.abs(box.min[0] - 2) < 1e-6 && Math.abs(box.max[0] - 2) < 1e-6, 'distance along the axis: x is the value for every pixel');
    // Each point is seen back by the camera on its pixel (pixel (u, v) of the small picture is at 2u + 0.5 in the intrinsics)
    for (const [u, v] of [[1, 0], [100, 50], [319, 239], [160, 120]]) {
        const n = rays.pixels.indexOf(v * 320 + u) - 1; // (the first pixel was left out)
        const seen = V.projectPoint(camera, [positions[n*3], positions[n*3+1], positions[n*3+2]]);
        assert.ok(Math.abs(seen[0] - (2 * u + 0.5)) < 1e-3 && Math.abs(seen[1] - (2 * v + 0.5)) < 1e-3, `${u},${v} -> ${seen}`);
    }
    assert.deepEqual(Array.from(colors.subarray(0, 3)), T.pictures.COLORMAPS.turbo[128], 'colored by its value');
    assert.equal(S.depthRays(camera, 320, 240, 3).count, 107 * 80, 'one pixel every 3 along both axes');
});

test('3D and 2D views place the depth map of a camera; a picture that is not a depth map is not placed', async () => {
    const T = loadTeleplot();
    T.parseDataText({ data: 'RAW|cam:1000:' + raw(4, 2, 0, [1000, 1000, 2000, 0, 1000, 1000, 1000, 1000]), timestamp: 0 });
    T.parseDataText({ data: '3D|cam:1000:K:4:4:1.5:0.5:4:2:P:1:2:0\nATTR|cam|scale=0.001', timestamp: 0 });
    const view = T.view.createView('3d', ['cam']);
    let source = view.__collectSources(-1).sources[0];
    assert.equal(source.kind, 'camera');
    assert.equal(source.depth.count, 7);
    assert.deepEqual(Array.from(source.depth.positions.subarray(0, 3)), [1, Math.fround(1.5 / 4), Math.fround(0.5 / 4)], 'top left pixel: to the left and above the axis');
    const first = view.__collectSources(-1);
    assert.equal(view.__collectSources(-1).key, first.key, 'nothing changed: same key (the view does not redraw)');

    const items = T.view.ViewScene2D.buildItems([source], {});
    const points = items.find((item) => item.kind === 'points');
    assert.equal(points.positions.length, 14);
    assert.deepEqual([points.positions[0], points.positions[1]], [2, 2 + Math.fround(1.5 / 4)], 'seen from above, where the camera is');

    T.parseDataText('ATTR|cam|depth=0');
    source = view.__collectSources(-1).sources[0];
    assert.equal(source.depth, undefined, 'depth=0: values that are not distances');

    T.parseDataText({ data: 'PNG|png:1000:' + png16([[500, 600]]) + '\n3D|png:1000:K:2:2:0.5:0.5:2:1', timestamp: 0 });
    const other = T.view.createView('3d', ['png']);
    assert.equal(other.__collectSources(-1).sources[0].depth, undefined, 'being decoded');
    await T.pictures.decodeAsync(T.datastore.getTelemetry('png').data[T.protocol.SECTION_TYPE_TELEM_DATA_IMAGE], 0);
    assert.equal(other.__collectSources(-1).sources[0].depth.count, 2, 'decoded: placed on the next update');
});

test('files: pictures of values and their settings come back from text and binary files', () => {
    const T = loadTeleplot();
    T.parseDataText({ data: 'RAW|depth:1000:' + raw(2, 1, 1, [0.5, 2]) + '§m\nATTR|depth|scale=1|nodata=|depth=0\nPNG|png:1000:' + png16([[1, 2]]) + '\nATTR|png|scale=0.001', timestamp: 0 });
    const P = T.protocol;
    for (const format of ['text', 'binary']) {
        const U = loadTeleplot();
        const out = format === 'text' ? T.files.exportText().parts.join('') : (() => { const parts = T.files.exportBinary().parts; return Buffer.concat(parts.map((p) => Buffer.from(p))); })();
        U.files.importData(format === 'text' ? out : new Uint8Array(out));
        for (const name of ['depth', 'png']) {
            const a = T.datastore.getTelemetry(name), b = U.datastore.getTelemetry(name);
            assert.deepEqual(b.data[P.SECTION_TYPE_TELEM_DATA_IMAGE].data, a.data[P.SECTION_TYPE_TELEM_DATA_IMAGE].data, format + ' ' + name);
            assert.deepEqual(b.getAttribute(P.TELEM_ATTR_PIXELS), a.getAttribute(P.TELEM_ATTR_PIXELS), format + ' ' + name);
        }
        assert.equal(U.datastore.getTelemetry('depth').getAttribute(P.TELEM_ATTR_UNIT), 'm', format);
    }
});
