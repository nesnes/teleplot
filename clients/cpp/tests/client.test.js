// What the C++ client sends, read back by the library of the page (its own parser, as for a live connection). The files are written
// by scenarios.cpp: run ./test.sh from clients/cpp/, which builds and runs it first.
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../../packages/teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../../packages/teleplot-js/tests/helpers/load');

const OUT = process.env.TELEPLOT_CPP_OUT || path.join(__dirname, '..', 'build');
const T0 = 1760000000; // seconds (scenarios.cpp: ns)
const f32 = Math.fround;

function load(name) {
    const U = loadTeleplot();
    const result = U.files.importData(new Uint8Array(fs.readFileSync(path.join(OUT, name))));
    U.__timers.run();
    assert.equal(result.problems, 0, 'the file is read without problems');
    return U;
}
function get(U, name) {
    const telem = U.datastore.findByName(name);
    assert.ok(telem, `telemetry ${name}`);
    return telem;
}
function samples(telem, type) {
    const d = telem.data[type];
    assert.ok(d, `${telem.getAttribute(0)}: data of type ${type}`);
    return d.timestamps.map((t, i) => [t, ...d.data.map((channel) => channel[i])]);
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} is not ${b}`);

test('numbers, texts, 2D and 3D numbers, with their times', () => {
    const U = load('basics.teleplot');
    const P = U.protocol;
    assert.deepEqual(samples(get(U, 'count'), P.SECTION_TYPE_TELEM_DATA_NUMBER), [[T0, 7]]);
    assert.deepEqual(samples(get(U, 'flag'), P.SECTION_TYPE_TELEM_DATA_NUMBER), [[T0, 1]]);
    assert.deepEqual(samples(get(U, 'mode'), P.SECTION_TYPE_TELEM_DATA_TEXT), [[T0, 'docking']]);
    assert.deepEqual(samples(get(U, 'xy'), P.SECTION_TYPE_TELEM_DATA_NUMBER_2D), [[T0, 1.5, -2]]);
    assert.deepEqual(samples(get(U, 'p3'), P.SECTION_TYPE_TELEM_DATA_NUMBER_3D), [[T0, 1, 2, 3]]);
    assert.deepEqual(samples(get(U, 'explicit'), P.SECTION_TYPE_TELEM_DATA_NUMBER), [[T0 - 1, 4.25]]);
    assert.equal(U.clients.getClient(get(U, 'count').clientId).name, 'cpp_test');
});

test('600 samples over 6 s: several sections, every time and value exact', () => {
    const U = load('basics.teleplot');
    const s = samples(get(U, 'speed'), U.protocol.SECTION_TYPE_TELEM_DATA_NUMBER);
    assert.equal(s.length, 600);
    s.forEach(([t, v], i) => { near(t, T0 + i * 0.01, 'time'); assert.equal(v, f32(i * 0.5)); });
});

test('descriptions: unit, range, description, label, thresholds, autoplot, timeout, color', () => {
    const U = load('basics.teleplot');
    const P = U.protocol;
    const battery = get(U, 'battery');
    assert.equal(battery.getAttribute(P.TELEM_ATTR_UNIT), 'V');
    assert.deepEqual(battery.getRange(), { min: 10.5, max: 12.6 });
    assert.equal(battery.getDescription(), 'Main battery');
    assert.equal(battery.getAttribute(P.TELEM_ATTR_VIEW_LABEL), 'power');
    assert.deepEqual(battery.getThresholds(T0).map((th) => [th.name, th.operator, th.value, th.color]).sort(), [['empty', P.THRESHOLD_BELOW, 10.8, ''], ['low', P.THRESHOLD_BELOW, 11, 'orange']]);
    assert.equal(get(U, 'hidden').getAttribute(P.TELEM_ATTR_AUTOPLOT), false);
    assert.equal(get(U, 'tmo').getAttribute(P.TELEM_ATTR_DATA_TIMEOUT), 1.5);
    assert.equal(get(U, 'colored').getAttribute(P.TELEM_ATTR_COLOR), 'red');
});

test('precise(): float64, exact; maxRate(10): one sample per 100 ms', () => {
    const U = load('basics.teleplot');
    const P = U.protocol;
    assert.deepEqual(samples(get(U, 'gps'), P.SECTION_TYPE_TELEM_DATA_NUMBER_2D), [[T0, 2.294481, 48.858370]]);
    const rated = samples(get(U, 'rated'), P.SECTION_TYPE_TELEM_DATA_NUMBER);
    assert.deepEqual(rated.map(([, v]) => v), [0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
});

test('logs, stacks (Stack levels), a text too long is cut, a dashboard', () => {
    const U = load('basics.teleplot');
    const P = U.protocol;
    const events = get(U, 'events');
    assert.equal(events.getAttribute(P.TELEM_ATTR_LOG), true);
    assert.deepEqual(samples(events, P.SECTION_TYPE_TELEM_DATA_TEXT).map(([, v]) => v), ['docked']);
    assert.deepEqual(samples(get(U, 'log'), P.SECTION_TYPE_TELEM_DATA_TEXT).map(([, v]) => v), ['plain line']);
    assert.equal(get(U, 'task').getAttribute(P.TELEM_ATTR_STACK), true);
    assert.deepEqual(samples(get(U, 'task'), P.SECTION_TYPE_TELEM_DATA_TEXT).map(([, v]) => v), ['loop/plan']);
    assert.deepEqual(samples(get(U, 'task2'), P.SECTION_TYPE_TELEM_DATA_TEXT).map(([, v]) => v), ['loop', 'loop/plan', 'loop', '']);
    assert.equal(samples(get(U, 'long'), P.SECTION_TYPE_TELEM_DATA_TEXT)[0][1].length, 1380);
    assert.ok(U.dashboards.dashboards.Robot, 'the dashboard line was received');
});

test('1000 names: as many telemetries, each with its own value (names whose hashes collide get another id)', () => {
    const U = load('basics.teleplot');
    for (let i = 0; i < 1000; i++) assert.deepEqual(samples(get(U, 'c' + i), U.protocol.SECTION_TYPE_TELEM_DATA_NUMBER).map(([, v]) => v), [i]);
});

test('shapes: type, size, color (attribute before shape(), a sample after), position and orientation at their times', () => {
    const U = load('scene.teleplot');
    const P = U.protocol;
    const body = get(U, 'robot.body');
    assert.deepEqual(body.getAttribute(P.TELEM_ATTR_SHAPE), { type: P.TELEM_ATTR_SHAPE_TYPE_CUBE, data: '' });
    assert.deepEqual(samples(body, P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE), [[T0, f32(0.4), f32(0.3), f32(0.2)]]);
    assert.deepEqual(samples(body, P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR), [[T0, '#2ecc71']]);
    assert.deepEqual(samples(body, P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION), [[T0 + 1, 1, 2, 0]]);
    assert.deepEqual(samples(body, P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION), [[T0 + 1, 0, 0, 0.5]]);
    assert.deepEqual(samples(body, P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION), [[T0 + 2, 1, 0, 0, 0]]);
    const arm = get(U, 'arm');
    assert.equal(arm.getAttribute(P.TELEM_ATTR_COLOR), 'blue');
    assert.equal(arm.data[P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR], undefined);
    assert.deepEqual(samples(get(U, 'rgb'), P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB), [[T0, 10, 20, 30]]);
    assert.deepEqual(get(U, 'stl').getAttribute(P.TELEM_ATTR_SHAPE), { type: P.TELEM_ATTR_SHAPE_TYPE_STL, data: 'http://x/a.stl' });
    assert.deepEqual(samples(get(U, 'tex'), P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE), [[T0, P.TEXTURE_TYPE_URL, 'http://x/a.png']]);
    assert.deepEqual(samples(get(U, 'tex2'), P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE), [[T0, P.TEXTURE_TYPE_IMAGE, 'cam']]);
});

test('frames, flat shapes: line points, arrow vector, text, opacity, size(x, y) keeps z', () => {
    const U = load('scene.teleplot');
    const P = U.protocol;
    assert.deepEqual(get(U, 'lidar').getAttribute(P.TELEM_ATTR_FRAME), { type: P.FRAME_TYPE_POSE, name: 'robot.body' });
    assert.deepEqual(get(U, 'detection').getAttribute(P.TELEM_ATTR_FRAME), { type: P.FRAME_TYPE_PIXELS, name: 'cam' });
    const pathTelem = get(U, 'path');
    assert.equal(pathTelem.getAttribute(P.TELEM_ATTR_SHAPE).type, P.TELEM_ATTR_SHAPE_TYPE_LINE);
    assert.deepEqual(samples(pathTelem, P.SECTION_TYPE_TELEM_DATA_SHAPE_LINE_WIDTH), [[T0, f32(0.02)]]);
    const line = samples(pathTelem, P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD);
    assert.equal(line.length, 1);
    assert.deepEqual(Array.from(line[0][1]), [0, 0, 0, 1, 0.5, 0, 2, 0.25, 0]);
    assert.deepEqual(samples(get(U, 'goal'), P.SECTION_TYPE_TELEM_DATA_SHAPE_VECTOR), [[T0, 0.5, 0, 0]]);
    assert.deepEqual(samples(get(U, 'goal'), P.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY), [[T0, 128]]);
    assert.deepEqual(samples(get(U, 'label'), P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXT), [[T0, 'goal']]);
    assert.deepEqual(samples(get(U, 'label'), P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE), [[T0, f32(0.1), f32(0.1), f32(0.1)]]);
    assert.deepEqual(samples(get(U, 'flat'), P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE), [[T0, 2, 3, 1]]);
});

test('a cloud of 500 points with intensities and colors, sent in parts, is one sample', () => {
    const U = load('scene.teleplot');
    const lidar = get(U, 'lidar');
    const clouds = samples(lidar, U.protocol.SECTION_TYPE_TELEM_DATA_POINT_CLOUD);
    assert.equal(clouds.length, 1);
    const [t, positions, intensities, colors] = clouds[0];
    assert.equal(t, T0);
    assert.equal(positions.length, 1500);
    for (let i = 0; i < 500; i++) {
        assert.deepEqual([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]], [f32(i * 0.01), i ? f32(-i * 0.02) : 0, 0.5]);
        assert.equal(intensities[i], i);
        assert.deepEqual([colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]], [i % 256, 20, 30]);
    }
    assert.deepEqual(samples(lidar, U.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION), [[T0, f32(0.15), 0, f32(0.25)]]);
});

test('a picture in parts is stored whole, byte for byte; the camera has its intrinsics and distortion', () => {
    const U = load('scene.teleplot');
    const P = U.protocol;
    const cam = get(U, 'cam');
    const pictures = samples(cam, P.SECTION_TYPE_TELEM_DATA_IMAGE);
    assert.equal(pictures.length, 1);
    assert.equal(pictures[0][1], P.IMAGE_TYPE_JPEG);
    const bytes = Buffer.from(pictures[0][2], 'base64');
    assert.equal(bytes.length, 5000);
    for (let i = 0; i < bytes.length; i++) if (bytes[i] !== i % 251) assert.fail(`byte ${i}`);
    assert.deepEqual(samples(cam, P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS), [[T0, 640, 480, 520, 521, 320, 240]]);
    assert.deepEqual(samples(cam, P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION), [[T0, -0.25, 0.0625, f32(0.001), f32(0.002), 0]]);
});

test('settings and actions are declared as the page reads them', () => {
    const U = load('commands.teleplot');
    const P = U.protocol;
    const kp = get(U, 'kp');
    assert.deepEqual(kp.getAttribute(P.TELEM_ATTR_WRITE), { kind: 'setting', type: 'number', confirm: false, longpress: false, step: 0.01 });
    assert.deepEqual(kp.getRange(), { min: 0, max: 10 });
    assert.equal(kp.getDescription(), 'Proportional gain');
    assert.equal(kp.getAttribute(P.TELEM_ATTR_UNIT), '1/s');
    assert.deepEqual(samples(kp, P.SECTION_TYPE_TELEM_DATA_NUMBER).map(([, v]) => v), [f32(0.4)]);
    assert.deepEqual(get(U, 'mode').getAttribute(P.TELEM_ATTR_CHOICES), ['auto', 'manual']);
    assert.deepEqual(get(U, 'cmd_vel').getAttribute(P.TELEM_ATTR_WRITE), { kind: 'setting', type: 'pose2d', confirm: false, longpress: false, rate: 20, hold: 200, axes: ['x', 'yaw'] });
    const go = get(U, 'goto');
    assert.deepEqual(go.getAttribute(P.TELEM_ATTR_WRITE), { kind: 'action', type: '', confirm: true, longpress: false });
    assert.equal(go.getAttribute(P.TELEM_ATTR_TITLE), 'Go to');
    assert.deepEqual(go.getAttribute(P.TELEM_ATTR_ARGS), [
        { name: 'target', type: 'xy', optional: false },
        { name: 'speed', type: 'number', optional: true, min: 0.1, max: 1, unit: 'm/s', default: '0.3' },
    ]);
});

test('samples sent once are sent again (a page opened later gets them), streams are not; stored once', () => {
    const U = load('resend.teleplot');
    const P = U.protocol;
    const box = get(U, 'box');
    assert.deepEqual(samples(box, P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE), [[T0, 1, 2, 3]]);
    assert.deepEqual(samples(box, P.SECTION_TYPE_TELEM_DATA_THRESHOLD).map(([, op, v, name]) => [op, v, name]), [[P.THRESHOLD_ABOVE, 70, 'hot']]);
    assert.equal(samples(get(U, 'stream'), P.SECTION_TYPE_TELEM_DATA_NUMBER).length, 1);
    // (and the file holds the size several times: what the page receives, not what it stores)
    const bytes = fs.readFileSync(path.join(OUT, 'resend.teleplot'));
    let sizes = 0;
    for (let i = 0; i < bytes.length; i++) if (bytes[i] === P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE && bytes.readFloatLE(i + 16) === 1 && bytes.readFloatLE(i + 20) === 2) sizes++;
    assert.ok(sizes >= 2, `the size was sent ${sizes} time(s)`);
});

test('stacks of threads: the main thread keeps the name, a worker has its own telemetry with the label of the stack', () => {
    const U = load('threads.teleplot');
    const P = U.protocol;
    assert.deepEqual(samples(get(U, 'task'), P.SECTION_TYPE_TELEM_DATA_TEXT).map(([, v]) => v), ['main', '']);
    const worker = get(U, 'task.worker');
    assert.deepEqual(samples(worker, P.SECTION_TYPE_TELEM_DATA_TEXT).map(([, v]) => v), ['work', '']);
    assert.equal(worker.getAttribute(P.TELEM_ATTR_STACK), true);
    assert.equal(worker.getAttribute(P.TELEM_ATTR_VIEW_LABEL), 'task');
});
