// V1 text protocol (must stay retro-compatible)
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot, captureConsole } = require('./helpers/load');

const NUMBER = 20, NUMBER_2D = 21, TEXT = 23;
const parse = (T, data, extra = {}) => T.parseDataText({ data, timestamp: 1000000, ...extra });
const entry = (T, name, type = NUMBER) => T.datastore.getTelemetry(name).data[type];

test('name:value uses the reception time (ms to seconds): the one given with the message, or now', () => {
    const T = loadTeleplot();
    parse(T, 'a:12.5');
    assert.deepEqual(entry(T, 'a').data[0], [12.5]);
    assert.deepEqual(entry(T, 'a').timestamps, [1000]);
    T.parseDataText('b:1');
    T.parseDataText({ data: 'c:1' });
    for (const name of ['b', 'c']) assert.ok(Math.abs(entry(T, name).timestamps[0] - Date.now() / 1000) < 5, name);
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
    assert.equal(entry(T, 'p', 22).timestamps[2], 1000, 'no timestamp: the reception time');
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

test('view label: "name,label" names the telemetry and keeps the label (numbers, text, xy, 3D shapes)', () => {
    const T = loadTeleplot();
    const LABEL = T.protocol.TELEM_ATTR_VIEW_LABEL;
    parse(T, 'speed,motors:1.5\ncurrent,motors:1000:0.4§A|np\nstate,motors:on|t\n3D|arm,robot:S:cube\nalone:1');
    assert.deepEqual(['speed', 'current', 'state', 'arm', 'alone'].map(n => T.datastore.getTelemetry(n).getAttribute(LABEL)), ['motors', 'motors', 'motors', 'robot', undefined]);
    assert.equal(T.datastore.hasTelemetry('speed,motors'), false, 'the label is not part of the name');
    assert.deepEqual(entry(T, 'current').data[0], [0.4]);
    assert.equal(T.datastore.getTelemetry('current').getAttribute(T.protocol.TELEM_ATTR_UNIT), 'A');
    parse(T, 'speed:2\nalone,:2');
    assert.equal(T.datastore.getTelemetry('speed').getAttribute(LABEL), 'motors', 'a line without label keeps the one the telemetry has');
    assert.equal(T.datastore.getTelemetry('alone').getAttribute(LABEL), undefined, 'an empty label is no label');
});


test('point cloud: every point of a "pc" line is one sample, with optional timestamp, intensity and color', () => {
    const T = loadTeleplot();
    const CLOUD = T.protocol.SECTION_TYPE_TELEM_DATA_POINT_CLOUD;
    T.datastore.addTelemetry('scan').setAttribute(T.protocol.TELEM_ATTR_DATA_TIMEOUT, 0); // (its second cloud is dated far in the past)
    assert.equal(T.parseDataText('scan:1:2:0;3:4:0;5:6:0.5|pc'), 0);
    let e = T.datastore.getTelemetry('scan').data[CLOUD];
    assert.equal(e.timestamps.length, 1, 'one sample for the whole line, at the time it was received');
    assert.ok(e.data[0][0] instanceof Float32Array);
    assert.deepEqual(Array.from(e.data[0][0]), [1, 2, 0, 3, 4, 0, 5, 6, 0.5]);
    assert.deepEqual([e.data[1][0], e.data[2][0]], [null, null], 'no intensity, no color');

    // A field alone is the timestamp (ms); 4 values: intensity; 6: color; 7: both. Unit and view label work as for other lines.
    T.parseDataText('scan,lidars:9000;1:2:3:0.5;4:5:6:0.25§m|pc');
    T.parseDataText('rgb:1:2:3:255:128:0;4:5:6:300:-4:7|pc');
    T.parseDataText('both:1:2:3:0.5:10:20:30|pc,np');
    e = T.datastore.getTelemetry('scan').data[CLOUD];
    assert.deepEqual([e.timestamps.length, e.timestamps[0]], [2, 9], 'the cloud dated 9 s goes before the one received now');
    assert.deepEqual([Array.from(e.data[0][0]), Array.from(e.data[1][0]), e.data[2][0]], [[1, 2, 3, 4, 5, 6], [0.5, 0.25], null]);
    assert.deepEqual([T.datastore.getTelemetry('scan').getAttribute(T.protocol.TELEM_ATTR_UNIT), T.datastore.getTelemetry('scan').getAttribute(T.protocol.TELEM_ATTR_VIEW_LABEL)], ['m', 'lidars']);
    const rgb = T.datastore.getTelemetry('rgb').data[CLOUD];
    assert.ok(rgb.data[2][0] instanceof Uint8Array);
    assert.deepEqual([rgb.data[1][0], Array.from(rgb.data[2][0])], [null, [255, 128, 0, 255, 0, 7]], 'colors are bytes');
    const both = T.datastore.getTelemetry('both');
    assert.deepEqual([Array.from(both.data[CLOUD].data[1][0]), Array.from(both.data[CLOUD].data[2][0]), both.getAttribute(T.protocol.TELEM_ATTR_AUTOPLOT)], [[0.5], [10, 20, 30], false]);

    // The pose of the sensor is sent like the one of a shape, on the same telemetry
    T.parseDataText('3D|scan:9000:P:1:2:0.3');
    assert.equal(T.view.ViewScene3D.kindOf(T.datastore.getTelemetry('scan')), 'cloud');
    assert.deepEqual(T.view.ViewScene3D.shapeState(T.datastore.getTelemetry('scan'), 9).position, [1, 2, 0.3]);

    // Points that do not all have the same number of values: the line is a problem, nothing is stored
    const log = captureConsole(() => assert.equal(T.parseDataText('bad:1:2:3;4:5|pc'), 1));
    assert.equal(T.datastore.getTelemetry('bad'), undefined);
    assert.equal(T.view.suggestViewType('scan'), '3d');
});


test('text emitted as a state ("t") or as a log ("log", and ">" lines): same data, another default view', () => {
    const T = loadTeleplot();
    const P = T.protocol, TEXT = P.SECTION_TYPE_TELEM_DATA_TEXT;
    assert.equal(T.parseDataText('state:forward|t\nevents:Motors armed|log\n>:Battery low\nnotes:1627551892437:hello|log,np'), 0);
    const state = T.datastore.getTelemetry('state'), events = T.datastore.getTelemetry('events'), notes = T.datastore.getTelemetry('notes');
    const lines = Object.values(T.datastore.telemetries).find(t => t !== state && t !== events && t !== notes);
    assert.deepEqual([state.data[TEXT].data[0], events.data[TEXT].data[0], lines.data[TEXT].data[0]], [['forward'], ['Motors armed'], ['Battery low']], 'all stored as text');
    assert.deepEqual([state, events, lines, notes].map(t => t.getAttribute(P.TELEM_ATTR_LOG)), [undefined, true, true, true]);
    assert.deepEqual([state, events, lines].map(t => T.view.suggestViewType(t.id)), ['values', 'log', 'log']);
    assert.deepEqual([notes.data[TEXT].timestamps, notes.getAttribute(P.TELEM_ATTR_AUTOPLOT)], [[1627551892.437], false], 'timestamp and other flags work as with "t"');

    // The last flag used tells: a text that is sent as a state again is a state again
    T.parseDataText('events:idle|t');
    assert.deepEqual([events.getAttribute(P.TELEM_ATTR_LOG), T.view.suggestViewType('events')], [false, 'values']);
    // The flag does not turn numbers into anything else, and both views take both kinds of text
    T.parseDataText('speed:1.5');
    assert.equal(T.view.suggestViewType('speed'), 'chart');
    assert.ok(new T.view.ViewLog('', ['state']).supportedDataTypes.includes(String(TEXT)));
});

test('an empty text is a sample: the state that says nothing ("name:|t", with or without a time)', () => {
    const T = loadTeleplot();
    assert.equal(parse(T, 'mode:driving|t\nmode:|t\nmode:3000000:|t\nmode:4000000:back|t'), 0);
    assert.deepEqual([entry(T, 'mode', TEXT).timestamps, entry(T, 'mode', TEXT).data[0]], [[1000, 1000, 3000, 4000], ['driving', '', '', 'back']]);
    // Only for texts, and only when the value is the whole message: an empty number is still nothing, as are the gaps of a list
    parse(T, 'n:\nlist:a;;b|t\nlist:|log');
    assert.equal(T.datastore.getTelemetry('n').data[NUMBER], undefined);
    assert.deepEqual(entry(T, 'list', TEXT).data[0], ['a', 'b', '']);
});

test('ATTR lines: the range of a telemetry, set, completed and forgotten; unknown keys are not understood', () => {
    const T = loadTeleplot();
    const range = (name) => T.datastore.getTelemetry(name).getRange();
    assert.equal(parse(T, 'ATTR|battery|min=9|max=12.6'), 0);
    assert.deepEqual(range('battery'), { min: 9, max: 12.6 });
    assert.equal(T.datastore.getTelemetry('battery').hasContent(), false, 'an attribute is not data');
    assert.equal(parse(T, 'ATTR|battery|max=13'), 0);
    assert.deepEqual(range('battery'), { min: 9, max: 13 }, 'what is not said is kept');
    parse(T, 'ATTR|battery|min=');
    assert.deepEqual(range('battery'), { min: undefined, max: 13 });
    parse(T, 'ATTR|battery|max=');
    assert.equal(range('battery'), undefined);
    assert.equal(T.datastore.getTelemetry('battery').getAttribute(T.protocol.TELEM_ATTR_RANGE), undefined);
    parse(T, 'ATTR|temp| min = -40 |max=1e2|');
    assert.deepEqual(range('temp'), { min: -40, max: 100 });
    assert.equal(parse(T, 'ATTR|late'), 0, 'a name alone says nothing, and is not a mistake');
    // Before or after the data, it is the same telemetry
    parse(T, 'battery:11.4\nATTR|battery|min=9|max=12.6');
    assert.deepEqual([entry(T, 'battery').data[0], range('battery')], [[11.4], { min: 9, max: 12.6 }]);
    // Not understood: counted, nothing changed
    const out = captureConsole(() => {
        assert.equal(parse(T, 'ATTR|battery|colour=red'), 1);
        assert.equal(parse(T, 'ATTR|battery|min=low'), 1);
        assert.equal(parse(T, 'ATTR||min=1'), 1);
        assert.equal(parse(T, 'ATTR|battery|min=0|oops=1'), 1, 'a line is taken as a whole');
    });
    assert.equal(out.log.length, 4);
    assert.deepEqual(range('battery'), { min: 9, max: 12.6 });
    // From a serial port, as every other line: after ">"
    T.parseDataText({ data: '>ATTR|serial|min=1|max=2', fromSerial: true });
    assert.deepEqual(range('serial'), { min: 1, max: 2 });
});

test('TH lines: thresholds with a name, < or >, a value, an optional color and an optional time', () => {
    const T = loadTeleplot();
    const P = T.protocol, TH = P.SECTION_TYPE_TELEM_DATA_THRESHOLD;
    const rows = (name) => { const e = entry(T, name, TH); return e.timestamps.map((t, i) => [t, e.data[2][i], e.data[0][i] === P.THRESHOLD_ABOVE ? '>' : '<', e.data[1][i], e.data[3][i]]); };
    assert.equal(parse(T, 'TH|battery:low<10.5:empty<9.9,red'), 0);
    assert.deepEqual(rows('battery'), [[1000, 'low', '<', 10.5, ''], [1000, 'empty', '<', 9.9, 'red']]);
    assert.equal(parse(T, 'TH|temp:5000:hot>70:critical>85,#ff0000;9000:hot>75,rgb(255, 128, 0)'), 0);
    assert.deepEqual(rows('temp'), [[5, 'hot', '>', 70, ''], [5, 'critical', '>', 85, '#ff0000'], [9, 'hot', '>', 75, 'rgb(255, 128, 0)']]);
    // Without value: removed from then on
    parse(T, 'TH|temp:12000:critical>');
    assert.ok(Number.isNaN(entry(T, 'temp', TH).data[1][3]));
    assert.deepEqual(T.datastore.getTelemetry('temp').getThresholds().map(t => t.name), ['hot']);
    assert.deepEqual(T.datastore.getTelemetry('temp').getThresholds(10).map(t => t.name), ['hot', 'critical']);
    // Names: spaces around are dropped, separators are written %XX; negative values, exponents
    parse(T, 'TH|x: too low <-1.5e1 : 50%25 %3A half>0.5');
    assert.deepEqual(rows('x').map(r => r.slice(1)), [['too low', '<', -15, ''], ['50% : half', '>', 0.5, '']]);
    // A telemetry that only has thresholds has nothing to display, and is a number for the views
    assert.equal(T.datastore.getTelemetry('battery').hasContent(), false);
    assert.equal(T.view.suggestViewType('battery'), 'chart');
    parse(T, 'battery:11');
    assert.equal(T.view.suggestViewType('battery'), 'chart');
    // Not understood: counted, and nothing of the line is stored
    const out = captureConsole(() => {
        assert.equal(parse(T, 'TH|battery:low=10'), 1);
        assert.equal(parse(T, 'TH|battery:low<ten'), 1);
        assert.equal(parse(T, 'TH|battery:<10'), 1);
        assert.equal(parse(T, 'TH|:low<10'), 1);
        assert.equal(parse(T, 'TH|battery'), 1);
        assert.equal(parse(T, 'TH|battery:ok<1:bad'), 1);
    });
    assert.equal(out.log.length, 6);
    assert.equal(rows('battery').length, 2);
    assert.equal(parse(T, 'TH|battery:'), 0, 'no threshold: nothing to do');
    T.parseDataText({ data: '>TH|serial:low<1', fromSerial: true });
    assert.equal(rows('serial').length, 1);
});

test('a text may hold colons: its time, when it has one, is a first field that is a number; nothing is stored at a time that is not one', () => {
    const T = loadTeleplot();
    assert.equal(parse(T, 'mode:error: motor stalled|t\nmode:3000000:error: code 12:30|t\nmode:4000000:plain|t\nmode:12:30|t\nnotes:a:b;e;5000000:c:d|log'), 0);
    assert.deepEqual([entry(T, 'mode', TEXT).timestamps, entry(T, 'mode', TEXT).data[0]],
        [[0.012, 1000, 3000, 4000], ['30', 'error: motor stalled', 'error: code 12:30', 'plain']], 'a text that starts with a number and a colon is read as its time');
    assert.deepEqual([entry(T, 'notes', TEXT).timestamps, entry(T, 'notes', TEXT).data[0]], [[1000, 1000, 5000], ['a:b', 'e', 'c:d']], 'several texts in a line, each with or without its time');
    // The datastore refuses what is not a time, whoever asks (it would break the order of the samples)
    const telem = T.datastore.getOrCreateTelemetry('n');
    telem.addData(NUMBER, [5, NaN, undefined, -1, 6], [[1, 2, 3, 4, 5]]);
    assert.deepEqual([telem.data[NUMBER].timestamps, telem.data[NUMBER].data[0]], [[5, 6], [1, 5]]);
});

test('a stack is a text state whose text is a path ("stack" flag); the device can date it, finer than a millisecond', () => {
    const T = loadTeleplot();
    const STACK = T.protocol.TELEM_ATTR_STACK;
    assert.equal(STACK, 10);
    assert.equal(parse(T, 'task:1627551892437:loop|stack\ntask:1627551892437.25:loop/plan|stack\ntask:1627551892438.5:loop/plan/A*|stack\ntask:1627551892440:|stack'), 0);
    const task = T.datastore.getTelemetry('task');
    assert.deepEqual([entry(T, 'task', TEXT).timestamps, entry(T, 'task', TEXT).data[0]], [[1627551892.437, 1627551892.43725, 1627551892.4385, 1627551892.44], ['loop', 'loop/plan', 'loop/plan/A*', '']]);
    assert.deepEqual([task.getAttribute(STACK), task.getAttribute(T.protocol.TELEM_ATTR_LOG) === true], [true, false]);
    assert.equal(T.view.suggestViewType('task'), 'timeline', 'a stack is read along the time');
    // Without a time: dated when received, like everything else; the flag used last tells what the telemetry is
    parse(T, 'now:loop/plan|stack\nplain:a/b|t\nnotes:a/b|log');
    assert.deepEqual([entry(T, 'now', TEXT).timestamps, T.datastore.getTelemetry('now').getAttribute(STACK)], [[1000], true]);
    assert.deepEqual(['plain', 'notes'].map(n => T.datastore.getTelemetry(n).getAttribute(STACK) === true), [false, false], 'a slash alone does not make a stack');
    parse(T, 'now:idle|t');
    assert.equal(T.datastore.getTelemetry('now').getAttribute(STACK), false);
    // Levels: for each depth, a run per path down to it
    const levels = T.stackRuns(entry(T, 'task', TEXT)).levels.map(l => l.timestamps.map((t, i) => Math.round((t - 1627551892.437) * 1e5) / 100 + ':' + l.data[0][i]));
    assert.deepEqual(levels, [['0:loop', '3:'], ['0.25:loop/plan', '3:'], ['1.5:loop/plan/A*', '3:']]);
});
