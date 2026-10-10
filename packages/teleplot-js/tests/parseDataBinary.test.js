const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot, captureConsole } = require('./helpers/load');
const { PacketBuilder, ATTR } = require('./helpers/packet');

const NUMBER = 20, NUMBER_2D = 21, NUMBER_3D = 22, TEXT = 23;
const id = (client, telem) => client * 0x10000 + telem; // combined id used by the datastore
const entry = (T, client, telem, type = NUMBER) => T.datastore.getTelemetry(id(client, telem)).data[type];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('number samples: timestamps = reference + diff, values are float32', () => {
    const T = loadTeleplot();
    const packet = new PacketBuilder(7).numbers(3, 2_000_000_000n, [[0, 1.5], [500_000_000, -2.25]]).build();
    T.parseDataBinary(packet);
    const e = entry(T, 7, 3);
    assert.deepEqual(e.data[0], [1.5, -2.25]);
    near(e.timestamps[0], 2);
    near(e.timestamps[1], 2.5);
    assert.equal(T.datastore.getTelemetry(id(7, 3)).clientId, 7);
});

test('2D and 3D numbers, text', () => {
    const T = loadTeleplot();
    T.parseDataBinary(new PacketBuilder(1)
        .numbers2D(1, 1_000_000_000n, [[0, 1, 2], [1000, 3, 4]])
        .numbers3D(2, 1_000_000_000n, [[0, 1, 2, 3]])
        .text(3, 1_000_000_000n, [[0, 'héllo'], [10, 'world']])
        .build());
    assert.deepEqual(entry(T, 1, 1, NUMBER_2D).data, [[1, 3], [2, 4]]);
    assert.deepEqual(entry(T, 1, 2, NUMBER_3D).data, [[1], [2], [3]]);
    assert.deepEqual(entry(T, 1, 3, TEXT).data[0], ['héllo', 'world']);
});

test('little-endian byte layout, written by hand', () => {
    const T = loadTeleplot();
    const bytes = [
        0x10, 0x01, 0x02, 0x01,                          // marker, version, client id 0x0102
        20, 0x05, 0x00,                                  // NUMBER section, telemetry 5
        0x00, 0xCA, 0x9A, 0x3B, 0x00, 0x00, 0x00, 0x00,  // reference 1_000_000_000 ns
        1,                                               // count
        0x40, 0x42, 0x0F, 0x00,                          // diff 1_000_000 ns
        0x00, 0x00, 0x20, 0x41,                          // float32 10.0
        0x00, 0x00,                                      // checksum
    ];
    T.parseDataBinary(Uint8Array.from(bytes).buffer);
    const e = entry(T, 0x0102, 5);
    assert.deepEqual(e.data[0], [10]);
    near(e.timestamps[0], 1.001);
});

test('uint64 reference keeps nanosecond-level precision of unix times', () => {
    const T = loadTeleplot();
    const ref = 1_760_000_000_123_456_789n; // ~2025 in ns, above 2^32 and 2^53
    T.parseDataBinary(new PacketBuilder(1).numbers(1, ref, [[0, 1], [1000, 2]]).build());
    const t = entry(T, 1, 1).timestamps;
    near(t[0], 1_760_000_000.123456, 1e-6);
    near(t[1] - t[0], 1e-6, 1e-6); // a double holds about 200 ns at this magnitude
});

test('attributes: strings, autoplot, timeout converted from ns to seconds', () => {
    const T = loadTeleplot();
    T.parseDataBinary(new PacketBuilder(1)
        .attrs(4, [[ATTR.NAME, 'speed'], [ATTR.UNIT, 'm/s'], [ATTR.COLOR, '#ff0000'], [ATTR.AUTOPLOT, false], [ATTR.TIMEOUT, 2_500_000_000n]])
        .build());
    const telem = T.datastore.getTelemetry(id(1, 4));
    const p = T.protocol;
    assert.equal(telem.getAttribute(p.TELEM_ATTR_NAME), 'speed');
    assert.equal(telem.getAttribute(p.TELEM_ATTR_UNIT), 'm/s');
    assert.equal(telem.getAttribute(p.TELEM_ATTR_COLOR), '#ff0000');
    assert.equal(telem.getAttribute(p.TELEM_ATTR_AUTOPLOT), false);
    assert.equal(telem.getAttribute(p.TELEM_ATTR_DATA_TIMEOUT), 2.5);
});

test('pruning works on a telemetry with a timeout attribute (regression: BigInt timeout threw on every update)', () => {
    const T = loadTeleplot();
    T.parseDataBinary(new PacketBuilder(1)
        .attrs(1, [[ATTR.TIMEOUT, 1_000_000_000n]])
        .numbers(1, 10_000_000_000n, [[0, 1], [500_000_000, 2], [1_000_000_000, 3], [2_000_000_000, 4]])
        .build());
    assert.doesNotThrow(() => T.datastore.__deleteTimedOutData());
    assert.deepEqual(entry(T, 1, 1).data[0], [3, 4]); // kept: the last second (12 s - 1 s)
});

test('client name and several sections in one packet', () => {
    const T = loadTeleplot();
    T.parseDataBinary(new PacketBuilder(9).clientName('robot')
        .numbers(1, 1_000_000_000n, [[0, 1]])
        .numbers(2, 1_000_000_000n, [[0, 2]])
        .build());
    assert.equal(T.clients.getClient(9).name, 'robot');
    assert.deepEqual(entry(T, 9, 1).data[0], [1]);
    assert.deepEqual(entry(T, 9, 2).data[0], [2]);
});

test('different clients with the same telemetry id do not collide', () => {
    const T = loadTeleplot();
    T.parseDataBinary(new PacketBuilder(1).numbers(1, 1_000_000_000n, [[0, 1]]).build());
    T.parseDataBinary(new PacketBuilder(2).numbers(1, 1_000_000_000n, [[0, 2]]).build());
    assert.deepEqual(entry(T, 1, 1).data[0], [1]);
    assert.deepEqual(entry(T, 2, 1).data[0], [2]);
});

test('Uint8Array views with a byteOffset are decoded correctly', () => {
    const T = loadTeleplot();
    const packet = new Uint8Array(new PacketBuilder(1).numbers(1, 1_000_000_000n, [[0, 4]]).build());
    const padded = new Uint8Array(packet.length + 13);
    padded.set(packet, 13);
    T.parseDataBinary(padded.subarray(13));
    assert.deepEqual(entry(T, 1, 1).data[0], [4]);
});

test('invalid packets are reported but never throw nor store data', () => {
    const T = loadTeleplot();
    const good = new Uint8Array(new PacketBuilder(1).numbers(1, 1_000_000_000n, [[0, 1], [1, 2]]).build());
    const bad = [
        new ArrayBuffer(0),
        Uint8Array.from([0x10, 1, 0, 0, 0]).buffer,                      // no data
        Uint8Array.from([0x11, 1, 0, 0, 20, 0, 0]).buffer,               // wrong marker
        Uint8Array.from([0x10, 9, 0, 0, 20, 0, 0]).buffer,               // wrong version
        Uint8Array.from([0x10, 1, 0, 0, 0, 0, 0, 0]).buffer,             // RESERVED section
        Uint8Array.from([0x10, 1, 0, 0, 200, 0, 0, 0]).buffer,           // unknown section
        good.slice(0, good.length - 6).buffer,                           // truncated
        "text", null, {},
    ];
    captureConsole(() => bad.forEach((b, i) => assert.doesNotThrow(() => T.parseDataBinary(b), `case ${i}`)));
    assert.deepEqual(T.datastore.telemetries[id(1, 1)] && T.datastore.telemetries[id(1, 1)].data[NUMBER], undefined);
});

test('packets are ignored while paused', () => {
    const T = loadTeleplot();
    T.state.isPaused = true;
    T.parseDataBinary(new PacketBuilder(1).numbers(1, 1_000_000_000n, [[0, 1]]).build());
    assert.deepEqual(T.datastore.telemetries, {});
});

test('3D shapes: attribute and every shape section', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    const printed = captureConsole(() => T.parseDataBinary(new PacketBuilder(2)
        .attrs(1, [[ATTR.NAME, 'robot'], [ATTR.SHAPE, { type: 2 }]])
        .attrs(2, [[ATTR.SHAPE, { type: 10, url: 'http://host/part.stl' }]])
        .shapeFloats('SHAPE_POSITION', 1, 1_000_000_000n, [[0, 1, 2, 3], [1000, 4, 5, 6]])
        .shapeFloats('SHAPE_ROTATION', 1, 1_000_000_000n, [[0, 0.5, 0.25, -1]])
        .shapeFloats('SHAPE_QUATERNION', 1, 1_000_000_000n, [[0, 1, 0, 0.5, 0]])
        .shapeFloats('SHAPE_SIZE', 1, 1_000_000_000n, [[0, 2, 4, 8]])
        .shapeColorStr(1, 1_000_000_000n, [[0, '#2ecc71']])
        .shapeColorRGB(1, 1_000_000_000n, [[0, 255, 128, 0]])
        .shapeOpacity(1, 1_000_000_000n, [[0, 128]])
        .shapeTexture(1, 1_000_000_000n, [[0, P.TEXTURE_TYPE_URL, 'http://host/t.png'], [10, P.TEXTURE_TYPE_IMAGE, 'camera']])
        .numbers(3, 1_000_000_000n, [[0, 7]])
        .build()));
    assert.deepEqual(printed.error, [], 'nothing is rejected');
    const telem = T.datastore.getTelemetry(id(2, 1));
    assert.deepEqual(telem.getAttribute(P.TELEM_ATTR_SHAPE), { type: P.TELEM_ATTR_SHAPE_TYPE_CYLINDER, data: '' });
    assert.deepEqual(T.datastore.getTelemetry(id(2, 2)).getAttribute(P.TELEM_ATTR_SHAPE), { type: P.TELEM_ATTR_SHAPE_TYPE_STL, data: 'http://host/part.stl' });
    assert.deepEqual(entry(T, 2, 1, P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION).data, [[1, 4], [2, 5], [3, 6]]);
    assert.deepEqual(entry(T, 2, 1, P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION).data, [[0.5], [0.25], [-1]]);
    assert.deepEqual(entry(T, 2, 1, P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION).data, [[1], [0], [0.5], [0]], 'w, x, y, z');
    assert.deepEqual(entry(T, 2, 1, P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE).data, [[2], [4], [8]]);
    assert.deepEqual(entry(T, 2, 1, P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR).data, [['#2ecc71']]);
    assert.deepEqual(entry(T, 2, 1, P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB).data, [[255], [128], [0]]);
    assert.deepEqual(entry(T, 2, 1, P.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY).data, [[128]]);
    assert.deepEqual(entry(T, 2, 1, P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE).data, [[P.TEXTURE_TYPE_URL, P.TEXTURE_TYPE_IMAGE], ['http://host/t.png', 'camera']], 'type and value (regression: textures were rejected)');
    assert.deepEqual(entry(T, 2, 3).data[0], [7], 'the sections after the shapes are still read');
});

test('camera of an image telemetry: intrinsics and distortion sections', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    const printed = captureConsole(() => T.parseDataBinary(new PacketBuilder(3)
        .cameraIntrinsics(1, 1_000_000_000n, [[0, 640, 480, 554.25, 553.5, 320, 240.5], [1000, 320, 240, 277, 277, 160, 120]])
        .cameraDistortion(1, 1_000_000_000n, [[0, -0.25, 0.5, 0.001, -0.002, 0.125]])
        .shapeFloats('SHAPE_POSITION', 1, 1_000_000_000n, [[0, 1, 2, 3]])
        .numbers(2, 1_000_000_000n, [[0, 7]])
        .build()));
    assert.deepEqual(printed.error, []);
    assert.deepEqual(entry(T, 3, 1, P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS).data, [[640, 320], [480, 240], [554.25, 277], [553.5, 277], [320, 160], [240.5, 120]], 'width, height, fx, fy, cx, cy');
    const distortion = entry(T, 3, 1, P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION).data.map(c => c[0]);
    [-0.25, 0.5, 0.001, -0.002, 0.125].forEach((v, i) => near(distortion[i], v, 1e-7));
    assert.deepEqual(entry(T, 3, 2).data[0], [7], 'the sections after the camera are still read');
    assert.equal(T.view.ViewScene3D.isCamera(T.datastore.getTelemetry(id(3, 1))), true);
});

test('images: stored as base64 like the text protocol, an image in several parts is stored once complete', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    const IMAGE = P.SECTION_TYPE_TELEM_DATA_IMAGE;
    T.parseDataBinary(new PacketBuilder(4).images(1, 1_000_000_000n, [[0, P.IMAGE_TYPE_PNG, 0, 1, [1, 2, 3]]]).build());
    assert.deepEqual(entry(T, 4, 1, IMAGE).data, [[P.IMAGE_TYPE_PNG], [Buffer.from([1, 2, 3]).toString('base64')]]);
    assert.deepEqual(T.view.ViewScene3D.imageAt(T.datastore.getTelemetry(id(4, 1))), { t: 1, url: 'data:image/png;base64,AQID' });

    // Three parts, received out of order and in different packets
    T.parseDataBinary(new PacketBuilder(4).images(2, 2_000_000_000n, [[0, P.IMAGE_TYPE_JPEG, 2, 3, [7, 8]], [0, P.IMAGE_TYPE_JPEG, 0, 3, [1, 2, 3]]]).build());
    assert.equal(T.datastore.getTelemetry(id(4, 2)).data[IMAGE], undefined, 'not complete yet');
    T.parseDataBinary(new PacketBuilder(4).images(2, 2_000_000_000n, [[0, P.IMAGE_TYPE_JPEG, 1, 3, [4, 5, 6]]]).numbers(3, 1_000_000_000n, [[0, 7]]).build());
    assert.deepEqual(entry(T, 4, 2, IMAGE).data, [[P.IMAGE_TYPE_JPEG], [Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString('base64')]]);
    assert.deepEqual(entry(T, 4, 3).data[0], [7], 'the sections after the image are still read');

    // A new image starts before the previous one is complete: the incomplete one is dropped
    T.parseDataBinary(new PacketBuilder(4).images(2, 3_000_000_000n, [[0, P.IMAGE_TYPE_JPEG, 0, 2, [9]]]).build());
    T.parseDataBinary(new PacketBuilder(4).images(2, 4_000_000_000n, [[0, P.IMAGE_TYPE_JPEG, 0, 2, [1]], [0, P.IMAGE_TYPE_JPEG, 1, 2, [2]]]).build());
    assert.deepEqual(entry(T, 4, 2, IMAGE).timestamps, [2, 4]);
});

test('view label attribute', () => {
    const T = loadTeleplot();
    T.parseDataBinary(new PacketBuilder(5).attrs(1, [[ATTR.NAME, 'speed'], [6, 'motors']]).numbers(1, 1_000_000_000n, [[0, 1]]).build());
    assert.equal(T.datastore.getTelemetry(id(5, 1)).getAttribute(T.protocol.TELEM_ATTR_VIEW_LABEL), 'motors');
    assert.deepEqual(entry(T, 5, 1).data[0], [1], 'the sections after the attribute are still read');
});
