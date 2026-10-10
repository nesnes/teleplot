// V1 text protocol (must stay retro-compatible)
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot, captureConsole } = require('./helpers/load');

const NUMBER = 20, NUMBER_2D = 21, TEXT = 23;
const parse = (T, data, extra = {}) => T.parseDataText({ data, timestamp: 1000000, ...extra });
const entry = (T, name, type = NUMBER) => T.datastore.getTelemetry(name).data[type];

test('name:value uses the reception time (ms to seconds)', () => {
    const T = loadTeleplot();
    parse(T, 'a:12.5');
    assert.deepEqual(entry(T, 'a').data[0], [12.5]);
    assert.ok(Math.abs(entry(T, 'a').timestamps[0] - Date.now() / 1000) < 5);
});

test('name:timestamp:value uses the given timestamp in ms', () => {
    const T = loadTeleplot();
    parse(T, 'a:1500:3');
    assert.deepEqual(entry(T, 'a').timestamps, [1.5]);
    assert.deepEqual(entry(T, 'a').data[0], [3]);
});

test('several samples in one message, with and without timestamps', () => {
    const T = loadTeleplot();
    parse(T, 'a:1000:1;2000:2;3000:3');
    assert.deepEqual(entry(T, 'a').timestamps, [1, 2, 3]);
    assert.deepEqual(entry(T, 'a').data[0], [1, 2, 3]);
});

test('several lines in one message', () => {
    const T = loadTeleplot();
    parse(T, 'a:1000:1\nb:1000:2\na:2000:3');
    assert.deepEqual(entry(T, 'a').data[0], [1, 3]);
    assert.deepEqual(entry(T, 'b').data[0], [2]);
});

test('unit is stored as an attribute and removed from the value', () => {
    const T = loadTeleplot();
    parse(T, 'a:1000:5§m/s');
    assert.equal(T.datastore.getTelemetry('a').getAttribute(T.protocol.TELEM_ATTR_UNIT), 'm/s');
    assert.deepEqual(entry(T, 'a').data[0], [5]);
    parse(T, 'a:2000:6§V|np');
    assert.equal(T.datastore.getTelemetry('a').getAttribute(T.protocol.TELEM_ATTR_UNIT), 'V');
});

test('flags: np disables autoplot, clr clears the data', () => {
    const T = loadTeleplot();
    parse(T, 'a:1000:1;2000:2|np');
    assert.equal(T.datastore.getTelemetry('a').getAttribute(T.protocol.TELEM_ATTR_AUTOPLOT), false);
    parse(T, 'a:3000:9|clr');
    assert.deepEqual(entry(T, 'a').data[0], [9]);
});

test('xy flag stores 2D samples, with and without timestamp', () => {
    const T = loadTeleplot();
    parse(T, 'p:1:2:3000|xy');
    assert.deepEqual(entry(T, 'p', NUMBER_2D).data, [[1], [2]]);
    assert.deepEqual(entry(T, 'p', NUMBER_2D).timestamps, [3]);
    parse(T, 'p:5:6|xy');
    assert.deepEqual(entry(T, 'p', NUMBER_2D).data, [[1, 5], [2, 6]]);
});

test('t flag stores text values', () => {
    const T = loadTeleplot();
    parse(T, 'state:1000:Turned On|t');
    assert.deepEqual(entry(T, 'state', TEXT).data[0], ['Turned On']);
});

test('widget label is not part of the telemetry name', () => {
    const T = loadTeleplot();
    parse(T, 'a,chart1:1000:1');
    assert.ok(T.datastore.hasTelemetry('a'));
    assert.ok(!T.datastore.hasTelemetry('a,chart1'));
});

test('logs: >text and >timestamp:text', () => {
    const T = loadTeleplot();
    parse(T, '>:hello');
    parse(T, '>2000:world');
    const logs = entry(T, '_text_logs', TEXT);
    assert.deepEqual(logs.data[0].sort(), ['hello', 'world']);
    assert.ok(logs.timestamps.includes(2));
});

test('serial input: plain lines are logs, > lines are variables', () => {
    const T = loadTeleplot();
    parse(T, 'plain text', { fromSerial: true });
    parse(T, '>a:1000:4', { fromSerial: true });
    assert.deepEqual(entry(T, '_text_logs', TEXT).data[0], ['plain text']);
    assert.deepEqual(entry(T, 'a').data[0], [4]);
});

test('statsd lines, lines without ":" and paused state are ignored', () => {
    const T = loadTeleplot();
    parse(T, 'statsd.x:1|c\nno separator');
    assert.deepEqual(T.datastore.telemetries, {});
    T.state.isPaused = true;
    parse(T, 'a:1');
    assert.equal(T.datastore.hasTelemetry('a'), false);
});

test('garbage never throws', () => {
    const T = loadTeleplot();
    const garbage = [':', '::', 'a:', 'a:;;;', '|', '>', '>:', 'a:b:c:d:e', 'JPG|', '\n\n', 'a:1|', '§', 'a:§|'];
    captureConsole(() => garbage.forEach(g => assert.doesNotThrow(() => parse(T, g), g)));
    assert.doesNotThrow(() => T.parseDataText('a:1'));
});

test('xyz flag stores 3D samples, with and without timestamp', () => {
    const T = loadTeleplot();
    parse(T, 'p:1:2:3:4000|xyz');
    assert.deepEqual(entry(T, 'p', 22).data, [[1], [2], [3]]);
    assert.deepEqual(entry(T, 'p', 22).timestamps, [4]);
    parse(T, 'p:8:9:10:5000;5:6:7|xyz,np');
    assert.deepEqual(entry(T, 'p', 22).data, [[1, 8, 5], [2, 9, 6], [3, 10, 7]]);
    assert.equal(entry(T, 'p', 22).timestamps[1], 5);
    assert.ok(Math.abs(entry(T, 'p', 22).timestamps[2] - Date.now() / 1000) < 5, 'no timestamp: the reception time');
    assert.equal(T.datastore.getTelemetry('p').getAttribute(T.protocol.TELEM_ATTR_AUTOPLOT), false);
    assert.equal(entry(T, 'p', NUMBER_2D), undefined, 'xyz is not xy');
});

test('3D shapes: each property goes to the attribute or data type the binary protocol has for it', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    parse(T, '3D|box:2000:S:cube:P:1:2:3:R:0.1:0.2:0.3:W:2:H:4:D:6:C:#2ecc71:O:0.5');
    const telem = T.datastore.getTelemetry('box');
    assert.deepEqual(telem.getAttribute(P.TELEM_ATTR_SHAPE), { type: P.TELEM_ATTR_SHAPE_TYPE_CUBE, data: '' });
    assert.deepEqual(entry(T, 'box', P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION).data, [[1], [2], [3]]);
    assert.deepEqual(entry(T, 'box', P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION).timestamps, [2], 'timestamp in ms');
    assert.deepEqual(entry(T, 'box', P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION).data, [[0.1], [0.2], [0.3]]);
    assert.deepEqual(entry(T, 'box', P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE).data, [[2], [6], [4]], 'width on x, depth on y, height on z (up)');
    assert.deepEqual(entry(T, 'box', P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR).data, [['#2ecc71']]);
    assert.deepEqual(entry(T, 'box', P.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY).data, [[128]], '0..1 becomes 0..255');
    assert.equal(telem.data[P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION], undefined, 'only what was sent is stored');
});

test('3D shapes: long property names, quaternion order, sphere radius, textures, quoted urls', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    parse(T, '3D|ball:shape:sphere:radius:2:quaternion:0.1:0.2:0.3:0.9:precision:20:texture:telem:camera');
    assert.equal(T.datastore.getTelemetry('ball').getAttribute(P.TELEM_ATTR_SHAPE).type, P.TELEM_ATTR_SHAPE_TYPE_SPHERE);
    assert.deepEqual(entry(T, 'ball', P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE).data, [[4], [4], [4]], 'the size is the diameter');
    assert.deepEqual(entry(T, 'ball', P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION).data, [[0.9], [0.1], [0.2], [0.3]], 'written x:y:z:w, stored w, x, y, z');
    assert.deepEqual(entry(T, 'ball', P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE).data, [[P.TEXTURE_TYPE_IMAGE], ['camera']]);

    parse(T, `3D|pot:S:stl:U:"https://host:8080/a;b|c.stl":T:url:'http://host/t.png':C:white|np`);
    const pot = T.datastore.getTelemetry('pot');
    assert.deepEqual(pot.getAttribute(P.TELEM_ATTR_SHAPE), { type: P.TELEM_ATTR_SHAPE_TYPE_STL, data: 'https://host:8080/a;b|c.stl' }, 'separators inside quotes belong to the url');
    assert.deepEqual(entry(T, 'pot', P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE).data, [[P.TEXTURE_TYPE_URL], ['http://host/t.png']]);
    assert.equal(pot.getAttribute(P.TELEM_ATTR_AUTOPLOT), false);
    parse(T, '3D|pot:S:cylinder');
    assert.deepEqual(pot.getAttribute(P.TELEM_ATTR_SHAPE), { type: P.TELEM_ATTR_SHAPE_TYPE_CYLINDER, data: 'https://host:8080/a;b|c.stl' });
});

test('3D shapes: values left out keep what the shape had, several updates in one line', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    parse(T, '3D|cube:1000:S:cube:P:1:2:3:W:1:D:1:H:1');
    parse(T, '3D|cube:2000:P::5::W:1.5;3000:P:::9:R::0.2:');
    assert.deepEqual(entry(T, 'cube', P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION).data, [[1, 1, 1], [2, 5, 5], [3, 3, 9]]);
    assert.deepEqual(entry(T, 'cube', P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION).timestamps, [1, 2, 3]);
    assert.deepEqual(entry(T, 'cube', P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE).data, [[1, 1.5], [1, 1], [1, 1]]);
    assert.deepEqual(entry(T, 'cube', P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION).data, [[0], [0.2], [0]]);
    parse(T, '3D|cube:4000:P:0:0:0|clr');
    assert.deepEqual(entry(T, 'cube', P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION).timestamps, [4], 'clr forgets the previous data');
    assert.equal(T.datastore.getTelemetry('cube').data[P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE], undefined);
});

test('3D shapes: the widget label is ignored, a shape alone is enough, invalid lines store nothing and never throw', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    parse(T, '3D|myCube,widget0:S:cube');
    assert.equal(T.datastore.getTelemetry('myCube').getAttribute(P.TELEM_ATTR_SHAPE).type, P.TELEM_ATTR_SHAPE_TYPE_CUBE);
    assert.equal(T.datastore.hasTelemetry('myCube,widget0'), false);
    const printed = captureConsole(() => {
        parse(T, '3D|bad:S:cube:ZZ:1\n3D|worse:S:pyramid\n3D|\n3D|noproperties\nafter:1');
    });
    assert.equal(printed.log.length, 2, 'the unknown property and the unknown shape are reported');
    assert.equal(T.datastore.getTelemetry('worse').getAttribute(P.TELEM_ATTR_SHAPE), undefined);
    assert.deepEqual(entry(T, 'after').data[0], [1], 'the following lines are still parsed');
});

test('camera of an image telemetry: K (intrinsics) and DC (distortion) on a 3D line', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    parse(T, '3D|cam:2000:K:554.3:553.1:320:240:640:480:P:1.2:0.4:0.25:Q:0:0:0.7071:0.7071');
    assert.deepEqual(entry(T, 'cam', P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS).data, [[640], [480], [554.3], [553.1], [320], [240]], 'written fx:fy:cx:cy:width:height, stored like the binary protocol');
    assert.deepEqual(entry(T, 'cam', P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS).timestamps, [2]);
    assert.deepEqual(entry(T, 'cam', P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION).data, [[1.2], [0.4], [0.25]]);
    parse(T, '3D|cam:3000:distortion:-0.28:0.07:0.0002:0.0001:0');
    assert.deepEqual(entry(T, 'cam', P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION).data, [[-0.28], [0.07], [0.0002], [0.0001], [0]]);
    parse(T, '3D|cam:4000:intrinsics:600:::::;5000:DC::0.1');
    assert.deepEqual(entry(T, 'cam', P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS).data.map(c => c[1]), [640, 480, 600, 553.1, 320, 240], 'values left out keep the previous ones');
    assert.deepEqual(entry(T, 'cam', P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION).data.map(c => c[1]), [-0.28, 0.1, 0.0002, 0.0001, 0]);
    const printed = captureConsole(() => parse(T, '3D|other:K:500:500:320:240'));
    assert.equal(printed.log.length, 1, 'intrinsics without the image size are refused');
    assert.equal(T.datastore.getTelemetry('other').data[P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS], undefined);
});
