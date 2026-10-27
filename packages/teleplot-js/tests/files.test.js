// 160-files: data files (text and binary), written from the datastore and read back through the parsers of the protocols
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');
const { PacketBuilder, ATTR } = require('./helpers/packet');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Everything a datastore holds, in a form that can be compared: by telemetry name (and client), attributes and samples
function snapshot(T) {
    const out = {};
    for (const telem of Object.values(T.datastore.telemetries)) {
        const data = {};
        for (const type of Object.keys(telem.data).sort()) {
            const entry = telem.data[type];
            if (!entry.timestamps.length) continue;
            data[type] = { timestamps: entry.timestamps.slice(), data: entry.data.map((channel) => channel.map((v) => ArrayBuffer.isView(v) ? Array.from(v) : v)) };
        }
        const attributes = {};
        for (const code of Object.keys(telem.attributes).sort()) attributes[code] = JSON.parse(JSON.stringify(telem.attributes[code]));
        out[(telem.clientId === undefined ? '' : telem.clientId + '/') + telem.attributes[T.protocol.TELEM_ATTR_NAME]] = { attributes, data };
    }
    return out;
}
const joinText = (parts) => parts.join('');
const joinBytes = (parts) => { const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { all.set(p, at); at += p.length; } return all; };

// What the text protocol can say, with values a float32 cannot hold and timestamps of every kind
const TEXT = [
    'temp,env:1627551892437:25.3§°C',
    'temp,env:1627551892537.25:0.1;1627551893000:1e-7;1627551999999:123456789.123',
    'quiet:1000:1|np',
    'pos:12.5:4.2:1627551892437|xy',
    'drone:1.5:0.2:3:1627551892437|xyz',
    'state:1627551892437:forward|t',
    'state:1627551893437:|t',
    'state:1627551894437:error: code 12:30|t',
    'task:1627551892437.25:loop/plan/A*|stack',
    'task:1627551892439:|stack',
    'ATTR|temp|min=-40.5|max=85',
    'ATTR|quiet|max=1e21',
    'TH|temp:1627551892437:hot>70:critical>85.123456789,#ff0000:cold<-10,rgb(0, 0, 255);1627551899000:hot>75.5:critical>',
    'TH|temp:1627551899000.5:50%25 %3A half>0.1',
    'TH|only.limits:1627551892437:low<1',
    'nav,logs:1627551892437:Path clear|log',
    '>1627551892437:Motors armed; all: 4 | ok',
    'lidar:1627551892437;1:0:0:0.9;0.7:0.7:0:0.4;0:1:0.25:0.1|pc',
    'rgbcloud:1627551892437;1:2:3:10:20:30|pc',
    '3D|box,scene:1627551892437:S:cube:P:1:0:0.5:W:1:D:2:H:3:C:orange:O:0.5:R:0:0:1.57',
    '3D|box:1627551893437:P:2:0:0.5:Q:0:0:0.7071:0.7071',
    '3D|tex:1627551892437:S:stl:U:"http://x/a.stl":T:url:"http://x/t.png":C:"rgb(1, 2, 3)"',
    'PNG|camera,scene:1627551892437:' + PNG,
    '3D|camera:1627551892437:K:554.25:554:320:240:640:480:P:0:0:1:DC:-0.26:0.07:0:0:0',
    'speed,motion:1627551892437:1.2',
    'DASH|Robot/Motion:chart|w=4|h=3|follow=motion',
    'DASH|Robot/side/Log:log:nav,state|maxLines=50',
].join('\n');

function filled() {
    const T = loadTeleplot();
    assert.equal(T.parseDataText(TEXT), 0);
    // And what only the binary protocol sends: two clients, a telemetry name they share, r, g, b colors, an image in parts, attributes
    const ref = 1627551892437000000n;
    T.parseDataBinary(new PacketBuilder(3).clientName('left arm')
        .attrs(1, [[ATTR.NAME, 'joint'], [ATTR.UNIT, 'rad'], [ATTR.COLOR, '#ff0000'], [ATTR.TIMEOUT, 60000000000n], [6, 'arm'], [ATTR.SHAPE, { type: 1 }], [9, { min: -3.14 }]])
        .thresholds(1, ref, [[0, 1, 3, 'limit', ''], [1000, 0, -3, 'li:mit<', 'a,b']])
        .numbers(1, ref, [[0, 0.5], [1000, 0.25], [4000000000, -1.5]])
        .shapeColorRGB(1, ref, [[0, 255, 128, 0]])
        .shapeOpacity(1, ref, [[0, 200]])
        .attrs(2, [[ATTR.NAME, 'notes'], [7, true], [ATTR.AUTOPLOT, false]])
        .attrs(5, [[ATTR.NAME, 'calls'], [10, true]]).text(5, ref, [[0, 'main'], [250000, 'main/read'], [900000, 'main']])
        .text(2, ref, [[0, 'a: b; c | d § e'], [5, 'two\nlines']])
        .attrs(3, [[ATTR.NAME, 'pic']])
        .images(3, ref, [[0, 1, 0, 2, [1, 2, 3]], [0, 1, 1, 2, [4, 5]]])
        .build());
    T.parseDataBinary(new PacketBuilder(4).attrs(1, [[ATTR.NAME, 'joint']]).numbers(1, ref, [[7, 9]]).build());
    T.__timers.run();
    return T;
}

test('binary file: what is read back is exactly what was stored (values, timestamps, attributes, clients, dashboards)', () => {
    const T = filled();
    const out = T.files.exportBinary();
    assert.equal(out.skipped, 0);
    const bytes = joinBytes(out.parts);
    assert.deepEqual(Array.from(bytes.subarray(0, 8)), T.protocol.FILE_MAGIC);
    assert.equal(T.files.isBinary(bytes), true);

    const U = loadTeleplot();
    const result = U.files.importData(bytes);
    U.__timers.run();
    assert.deepEqual(snapshot(U), snapshot(T));
    assert.equal(result.format, 'binary');
    assert.equal(result.samples, out.samples);
    assert.equal(result.problems, 0);
    assert.deepEqual([result.from, result.to], [1.000, 1627551999.999]);
    assert.deepEqual(result.dashboards, ['Robot']);
    assert.equal(U.dashboards.exportText('Robot'), T.dashboards.exportText('Robot'));
    assert.equal(U.clients.getClient(3).name, 'left arm');
    assert.equal(U.clients.getClient(T.protocol.CLIENT_ID_NAMED), undefined, 'telemetries identified by their name have no client');
    // Telemetries of the text protocol are still found by their name, the others by client and id
    assert.equal(U.datastore.getTelemetry('temp').id < 0, true);
    assert.deepEqual(U.datastore.getTelemetry(3 * 0x10000 + 1).data[20].data[0], [0.5, 0.25, -1.5]);
    // Values a float32 cannot hold went through
    assert.deepEqual(U.datastore.getTelemetry('temp').data[20].data[0], [25.3, 0.1, 1e-7, 123456789.123]);
});

test('binary file: float32 sections when they are exact, float64 otherwise; sections split at 255 samples and at the reach of a time reference', () => {
    const T = loadTeleplot();
    const exact = T.datastore.getOrCreateTelemetry('exact'), precise = T.datastore.getOrCreateTelemetry('precise'), sparse = T.datastore.getOrCreateTelemetry('sparse');
    const N = T.protocol.SECTION_TYPE_TELEM_DATA_NUMBER;
    const t0 = 1700000000;
    const times = Array.from({ length: 600 }, (v, i) => t0 + i * 0.001);
    exact.addData(N, times, [times.map((t, i) => i * 0.5)]);
    precise.addData(N, times, [times.map((t, i) => i / 3)]);
    sparse.addData(N, [t0, t0 + 10, t0 + 3600], [[1, 2, 3]]);
    const bytes = joinBytes(T.files.exportBinary({ dashboards: false }).parts);
    assert.ok(bytes.length < 8 + 600 * 8 + 600 * 12 + 600, 'float32 samples take 8 bytes, float64 samples 12 (' + bytes.length + ')');
    const U = loadTeleplot();
    assert.equal(U.files.importData(bytes).samples, 1203);
    assert.deepEqual(snapshot(U), snapshot(T));
});

test('text file: the lines of the text protocol, and what they say is read back the same', () => {
    const T = loadTeleplot();
    assert.equal(T.parseDataText(TEXT), 0);
    T.__timers.run();
    const out = T.files.exportText();
    assert.equal(out.skipped, 0);
    const text = joinText(out.parts);
    assert.ok(text.includes('temp,env:1627551892437:25.3;1627551892537.25:0.1;1627551893000:1e-7;1627551999999:123456789.123§°C\n'), text);
    assert.ok(text.includes('>1627551892437:Motors armed; all: 4 | ok\n'));
    assert.ok(text.includes('state:1627551892437:forward|t\nstate:1627551893437:|t\n'), 'an empty state is a line');
    assert.ok(text.includes('task:1627551892437.25:loop/plan/A*|stack\ntask:1627551892439:|stack\n'), 'a stack keeps its flag and its times');
    assert.ok(text.includes('ATTR|temp|min=-40.5|max=85\nTH|temp:1627551892437:hot>70;1627551892437:critical>85.123456789,#ff0000;1627551892437:cold<-10,rgb(0, 0, 255);1627551899000:hot>75.5;1627551899000:critical>;1627551899000.5:50%25 %3A half>0.1\n'), text);
    assert.ok(text.includes('ATTR|quiet|max=1e+21\n') && text.includes('TH|only.limits:1627551892437:low<1\n'));
    assert.ok(text.startsWith('DASH|Robot:grid\n'), 'dashboards first');
    const U = loadTeleplot();
    const result = U.files.importData(text);
    U.__timers.run();
    assert.deepEqual(snapshot(U), snapshot(T));
    assert.deepEqual([result.format, result.samples, result.problems, result.dashboards], ['text', out.samples, 0, ['Robot']]);
    assert.equal(U.dashboards.exportText('Robot'), T.dashboards.exportText('Robot'));
});

test('text file: what the text protocol cannot say is counted (texts with separators) or simplified (r, g, b colors), never invented', () => {
    const T = filled();
    const out = T.files.exportText();
    assert.equal(out.skipped, 2, 'the two texts of "notes"');
    assert.ok(joinText(out.parts).includes('ATTR|joint|min=-3.14\nTH|joint:1627551892437:limit>3;1627551892437.001:li%3Amit%3C<-3,a,b\n'), 'names of thresholds are escaped');
    const U = loadTeleplot();
    U.files.importData(joinText(out.parts));
    const joint = U.datastore.getTelemetry('joint');
    assert.deepEqual(joint.data[20].data[0], [0.5, 9, 0.25, -1.5], 'two clients, one name: one telemetry');
    assert.deepEqual(joint.data[T.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR].data[0], ['rgb(255,128,0)']);
    assert.equal(U.datastore.getTelemetry('notes'), undefined);
    assert.deepEqual(U.datastore.getTelemetry('pic').data[24].data[1], [Buffer.from([1, 2, 3, 4, 5]).toString('base64')]);
});

test('export options: some telemetries, a time range, dashboards or not', () => {
    const T = filled();
    const only = (options) => { const U = loadTeleplot(); U.files.importData(joinBytes(T.files.exportBinary(options).parts)); return U; };
    let U = only({ telemetries: ['temp', 'unknown', 3 * 0x10000 + 1], dashboards: false });
    assert.deepEqual(Object.keys(snapshot(U)).sort(), ['-1/temp', '3/joint']);
    assert.deepEqual(Object.keys(U.dashboards.dashboards), []);
    U = only({ from: 1627551892.5, to: 1627551893 });
    assert.deepEqual(U.datastore.getTelemetry('temp').data[20].timestamps, [1627551892.53725, 1627551893], 'limits included');
    assert.equal(U.datastore.getTelemetry('state').data[23], undefined);
    const text = joinText(T.files.exportText({ telemetries: ['temp'], from: 1627551893, dashboards: ['Robot'] }).parts);
    assert.equal(text, 'DASH|Robot:grid\nDASH|Robot/Motion:chart:speed|w=4|h=3|follow=motion\nDASH|Robot/side:grid\nDASH|Robot/side/Log:log:nav,state|maxLines=50\n'
        + 'ATTR|temp|min=-40.5|max=85\n'
        + 'TH|temp:1627551892437:hot>70;1627551892437:critical>85.123456789,#ff0000;1627551892437:cold<-10,rgb(0, 0, 255);1627551899000:hot>75.5;1627551899000:critical>;1627551899000.5:50%25 %3A half>0.1\n'
        + 'temp,env:1627551893000:1e-7;1627551999999:123456789.123§°C\n', 'the thresholds in force when the period starts are written before its own');
    U = only({ telemetries: ['temp'], from: 1627551900, dashboards: false });
    assert.deepEqual(U.datastore.getTelemetry('temp').getThresholds().map((t) => t.name + t.value), ['cold-10', '50% : half0.1', 'hot75.5'], 'in a binary file too; one that was removed before is not');
});

test('a file can be read in pieces cut anywhere', () => {
    const T = filled();
    const bytes = joinBytes(T.files.exportBinary().parts);
    const text = joinText(T.files.exportText().parts);
    for (const [whole, size] of [[bytes, 7], [bytes, 1000], [new TextEncoder().encode(text), 13], [text, 50]]) {
        const U = loadTeleplot();
        const job = U.files.createImport();
        for (let at = 0; at < whole.length; at += size) job.add(whole.slice(at, at + size));
        const result = job.finish();
        const V = loadTeleplot();
        const once = V.files.importData(whole);
        assert.deepEqual(snapshot(U), snapshot(V));
        assert.deepEqual([result.samples, result.problems], [once.samples, 0]);
    }
});

test('importing: works while paused, dashboards of the file are new ones, problems are counted, the data window can follow', () => {
    const T = filled();
    const bytes = joinBytes(T.files.exportBinary().parts);
    const U = loadTeleplot();
    U.parseDataText('DASH|Robot/Mine:chart:x');
    U.state.isPaused = true;
    const result = U.files.importData(bytes, { extendWindow: true });
    assert.equal(U.state.isPaused, true);
    assert.deepEqual(result.dashboards, ['Robot 2'], 'the dashboard that exists is left alone');
    assert.equal(U.dashboards.exportText('Robot'), 'DASH|Robot:grid\nDASH|Robot/Mine:chart:x');
    assert.deepEqual([result.windowExtended, result.windowNeeded, U.state.dataTimeout], [false, 0, 300], 'no telemetry of the file lasts longer than the window');
    const long = 'slow:1000000:1\nslow:1900000:2\nfast:1000000:1';
    assert.deepEqual([loadTeleplot().files.importData(long).windowExtended, loadTeleplot().files.importData(long).windowNeeded], [false, 900]);
    const W = loadTeleplot();
    assert.deepEqual([W.files.importData(long, { extendWindow: true }).windowExtended, W.state.dataTimeout], [true, 900], 'the window follows the longest telemetry');

    const V = loadTeleplot();
    const bad = V.files.importData('speed:1000:1\nwhat is this\nDASH|Robot/x:pie\nspeed:2000:2');
    assert.deepEqual([bad.format, bad.samples, bad.problems, bad.from, bad.to], ['text', 2, 2, 1, 2]);
    const cut = loadTeleplot().files.importData(bytes.slice(0, bytes.length - 3));
    assert.equal(cut.problems, 1, 'the last packet is missing its end');
    const empty = loadTeleplot().files.importData('');
    assert.deepEqual([empty.samples, empty.from, empty.to, empty.dashboards], [0, undefined, undefined, []]);
});

test('a text file logged by a device: lines without time are dated when read; serial style with the option', () => {
    const T = loadTeleplot();
    const before = Date.now() / 1000;
    T.files.importData('temp:21.5\ntemp:1000:22\r\n');
    assert.deepEqual(T.datastore.getTelemetry('temp').data[20].data[0], [22, 21.5]);
    assert.ok(T.datastore.getTelemetry('temp').data[20].timestamps[1] >= before - 1);
    const U = loadTeleplot();
    const result = U.files.importData('>temp:1000:22\nBooting...\n>DASH|Robot/T:chart:temp\n', { serial: true });
    assert.deepEqual(U.datastore.getTelemetry('temp').data[20].data[0], [22]);
    assert.deepEqual([result.problems, result.dashboards], [0, ['Robot']]);
    assert.equal(Object.values(U.datastore.telemetries).filter((t) => t.data[23]).length, 1, 'the other line is a log');
});

test('a binary file written by a device: the header, then each packet after its length', () => {
    const T = loadTeleplot();
    const packets = [new PacketBuilder(2).attrs(1, [[ATTR.NAME, 'rpm']]).numbers(1, 5000000000n, [[0, 1200], [1000000, 1250]]).build(), new PacketBuilder(2).numbers(1, 6000000000n, [[0, 1300]]).build()];
    const file = [Uint8Array.from(T.protocol.FILE_MAGIC)];
    for (const packet of packets) { const length = new Uint8Array(4); new DataView(length.buffer).setUint32(0, packet.byteLength, true); file.push(length, new Uint8Array(packet)); }
    const result = T.files.importData(joinBytes(file).buffer);
    assert.deepEqual([result.format, result.samples, result.from, result.to], ['binary', 3, 5, 6]);
    assert.deepEqual(T.datastore.getTelemetry(2 * 0x10000 + 1).data[20].data[0], [1200, 1250, 1300]);
});

test('CSV export: a column per telemetry, empty cells where there is no sample; or a line per sample; separators and time formats', () => {
    const T = loadTeleplot();
    T.parseDataText('left:1627551892437:0.4;1627551892457:0.41;1627551892477:0.43\nright:1627551892437:0.38;1627551892477:0.39\nstate:1627551892457:going, fast|t\npos:1:2:1627551892437|xy\n3D|box:1627551892437:P:1:0:0');
    const csv = (options) => T.files.exportCSV(options).parts.join('');
    assert.equal(csv(), [
        'time,left,right,state,pos.x,pos.y',
        '2021-07-29T09:44:52.437Z,0.4,0.38,,1,2',
        '2021-07-29T09:44:52.457Z,0.41,,"going, fast",,',
        '2021-07-29T09:44:52.477Z,0.43,0.39,,,',
        ''].join('\r\n'));
    const out = T.files.exportCSV();
    assert.deepEqual([out.samples, out.leftOut, out.skipped], [8, 1, 1], 'the shape is left out, with its sample');
    assert.equal(csv({ separator: ';', time: 'ms', telemetries: ['left', 'state'] }), 'time;left;state\r\n1627551892437;0.4;\r\n1627551892457;0.41;going, fast\r\n1627551892477;0.43;\r\n');
    assert.equal(csv({ separator: '\t', time: 's', telemetries: ['right'], from: 1627551892.45 }), 'time\tright\r\n1627551892.477\t0.39\r\n');
    assert.equal(csv({ layout: 'lines', telemetries: ['left', 'right'], to: 1627551892.457 }), 'time,name,value\r\n2021-07-29T09:44:52.437Z,left,0.4\r\n2021-07-29T09:44:52.437Z,right,0.38\r\n2021-07-29T09:44:52.457Z,left,0.41\r\n');
    assert.equal(csv({ separator: 'x' }).split('\r\n')[0], 'time,left,right,state,pos.x,pos.y', 'an unknown separator: a comma');
    // Numbers always use a point, whatever the separator: with a comma between fields they cannot be mistaken
    assert.ok(/,0\.41,/.test(csv()));
    assert.deepEqual(T.files.previewCSV({ telemetries: ['left', 'right'] }, 2), { header: ['time', 'left', 'right'], rows: [['2021-07-29T09:44:52.437Z', 0.4, 0.38], ['2021-07-29T09:44:52.457Z', 0.41, '']] });
});

test('CSV: two samples of a telemetry at the same time are two lines; times finer than a millisecond are kept', () => {
    const T = loadTeleplot();
    T.datastore.getOrCreateTelemetry('a').addData(20, [10, 10, 10.0000005], [[1, 2, 3]]);
    const text = T.files.exportCSV().parts.join('');
    assert.equal(text.split('\r\n').length, 5);
    const U = loadTeleplot();
    U.files.importData(text);
    assert.deepEqual(U.datastore.getTelemetry('a').data[20], Object.assign(U.datastore.getTelemetry('a').data[20], { timestamps: [10, 10, 10.0000005], data: [[1, 2, 3]] }));
});

test('CSV import: what was exported is read back; the separator, the time column and its unit are found, or given', () => {
    const T = loadTeleplot();
    T.parseDataText('left:1627551892437:0.4;1627551892457:0.41\nright:1627551892437:0.38');
    T.datastore.getOrCreateTelemetry('state').addData(23, [1627551892.457], [['going; "fast", now']]);
    for (const options of [{}, { separator: ';' }, { separator: '\t', time: 'ms' }, { time: 's' }, { layout: 'lines' }, { layout: 'lines', separator: ';', time: 'ms' }]) {
        const U = loadTeleplot();
        const result = U.files.importData(T.files.exportCSV(options).parts.join(''));
        assert.deepEqual(snapshot(U), snapshot(T), JSON.stringify(options));
        assert.deepEqual([result.format, result.samples, result.problems, result.created, result.csv.separator, result.csv.layout],
            ['csv', 4, 0, 3, options.separator || ',', options.layout || 'columns']);
    }
    // A file from elsewhere: its own column names, the time in the second column, seconds, a prefix, bad lines
    const U = loadTeleplot();
    const result = U.files.importData('rpm;t_ms;comment\n1200;1000;start\n1250,5;2000;\nabc;x;oops\n1300;3000;"a ""b"";\nc"\n', { prefix: 'bench.' });
    assert.deepEqual(result.csv, { separator: ';', timeColumn: 1, timeUnit: 's', columns: ['rpm', 't_ms', 'comment'], layout: 'columns' });
    assert.equal(result.problems, 1, 'a line without a time');
    assert.deepEqual(U.datastore.getTelemetry('bench.rpm').data[20], Object.assign(U.datastore.getTelemetry('bench.rpm').data[20], { timestamps: [1000, 3000], data: [[1200, 1300]] }));
    assert.deepEqual(U.datastore.getTelemetry('bench.rpm').data[23].data[0], ['1250,5'], 'not a number (a decimal comma): kept as text, not guessed');
    assert.deepEqual(U.datastore.getTelemetry('bench.comment').data[23].data[0], ['start', 'a "b";\nc']);
    const V = loadTeleplot();
    V.files.importData('a,when\n5,1000\n', { timeColumn: 1, timeUnit: 'ms' });
    assert.deepEqual(V.datastore.getTelemetry('a').data[20].timestamps, [1]);
    // Lines of the text protocol are not taken for a CSV, even with commas; the format can be forced
    assert.equal(loadTeleplot().files.importData('a,label:1000:5\n').format, 'text');
    assert.equal(loadTeleplot().files.importData('time,a\n').format, 'csv');
    assert.equal(loadTeleplot().files.importData('time,a\n1000,5\n', { format: 'text' }).format, 'text');
    // Read in pieces cut anywhere
    const whole = T.files.exportCSV().parts.join('');
    const W = loadTeleplot();
    const job = W.files.createImport();
    for (let at = 0; at < whole.length; at += 5) job.add(whole.slice(at, at + 5));
    job.finish();
    assert.deepEqual(snapshot(W), snapshot(T));
});

test('dry run: tells what a file holds and what opening it would do, and leaves everything as it was', () => {
    const T = filled();
    const files = [joinBytes(T.files.exportBinary().parts), joinText(T.files.exportText().parts), 'time,temp,fresh\n1000,5,6\n2999,7,8\n'];
    const U = loadTeleplot();
    U.parseDataText('temp:500:1§K\nDASH|Robot/Mine:chart:temp');
    U.parseDataBinary(new PacketBuilder(3).clientName('mine').attrs(1, [[ATTR.NAME, 'joint']]).numbers(1, 1000000000n, [[0, 1]]).build());
    U.__timers.run();
    const before = JSON.stringify([snapshot(U), Object.keys(U.dashboards.dashboards), U.clients.clients, U.datastore.telemetriesNameMap, U.state.dataTimeout]);
    const describe = (file, size) => { const job = U.files.createImport({ dryRun: true, extendWindow: true }); for (let at = 0; at < file.length; at += size) job.add(file.slice(at, at + size)); return job.finish(); };
    const [binary, text, csv] = files.map((file) => describe(file, file.length));
    for (const [i, whole] of [binary, text, csv].entries()) { // In pieces: the same description
        const pieces = describe(files[i], 97);
        assert.deepEqual([pieces.samples, pieces.telemetries.length, pieces.created, pieces.from, pieces.to, pieces.dashboards], [whole.samples, whole.telemetries.length, whole.created, whole.from, whole.to, whole.dashboards], 'file ' + i);
    }
    assert.equal(U.__timers.run(), undefined);
    assert.equal(JSON.stringify([snapshot(U), Object.keys(U.dashboards.dashboards), U.clients.clients, U.datastore.telemetriesNameMap, U.state.dataTimeout]), before, 'nothing changed');
    const real = loadTeleplot().files.importData(files[0]);
    assert.deepEqual([binary.format, binary.samples, binary.from, binary.to, binary.problems], ['binary', real.samples, real.from, real.to, 0]);
    assert.deepEqual([binary.dashboards, binary.dashboardNames], [['Robot 2'], { Robot: 'Robot 2' }], 'the name it would get');
    assert.equal(binary.telemetries.length - binary.created, 2, 'temp and joint of client 3 are already here');
    assert.deepEqual([text.format, text.dashboards], ['text', ['Robot 2']]);
    assert.deepEqual([csv.format, csv.samples, csv.created, csv.windowNeeded, csv.windowExtended], ['csv', 4, 1, 1999, false]);
    // And then the real thing still works
    const opened = U.files.importData(files[2], { extendWindow: true });
    assert.deepEqual([opened.samples, opened.windowExtended, U.state.dataTimeout], [4, true, 1999]);
    assert.equal(U.datastore.getTelemetry('temp').getAttribute(U.protocol.TELEM_ATTR_UNIT), 'K');
});

test('removeImported takes back what a file brought: its period in each telemetry', () => {
    const T = loadTeleplot();
    T.parseDataText('temp:500:1;5000000:9\nother:1000:1');
    const result = T.files.importData('temp:1000:5;2000:6\nfresh:1000:7\n3D|fresh:1000:P:1:2:3');
    assert.deepEqual(result.ranges.map((r) => [T.datastore.getTelemetry(r.id).getAttribute(0), r.dataType, r.from, r.to, r.count]), [['temp', 20, 1, 2, 2], ['fresh', 20, 1, 1, 1], ['fresh', 25, 1, 1, 1]]);
    assert.equal(T.files.removeImported(result), 4);
    assert.deepEqual(T.datastore.getTelemetry('temp').data[20].timestamps, [0.5, 5000]);
    assert.equal(T.datastore.getTelemetry('fresh'), undefined, 'a telemetry the file created and that is left empty is forgotten');
    assert.ok(T.datastore.getTelemetry('temp'), 'the others stay');
    assert.deepEqual(T.datastore.getTelemetry('other').data[20].data[0], [1]);
    assert.equal(T.files.removeImported(result), 0, 'once');
});

test('estimate tells what an export would hold before writing it', () => {
    const T = filled();
    for (const [format, run] of [['binary', (o) => T.files.exportBinary(o)], ['text', (o) => T.files.exportText(o)], ['csv', (o) => T.files.exportCSV(o)]]) {
        for (const options of [{}, { telemetries: ['temp', 'pos', 'state'] }, { from: 1627551892.5 }]) {
            const guess = T.files.estimate(format, options), out = run(Object.assign({ dashboards: false }, options));
            const size = out.parts.reduce((n, p) => n + p.length, 0);
            if (format !== 'text') assert.equal(guess.samples, out.samples, format + ' ' + JSON.stringify(options));
            if (size > 2000) assert.ok(guess.bytes > size * 0.4 && guess.bytes < size * 2.5, format + ' ' + JSON.stringify(options) + ': ' + guess.bytes + ' for ' + size);
        }
    }
    const csv = T.files.estimate('csv');
    assert.ok(csv.leftOut > 5 && csv.skipped > 5 && csv.telemetries >= 5, JSON.stringify(csv));
    assert.deepEqual(T.files.estimate('binary', { telemetries: [] }), { samples: 0, bytes: 0, telemetries: 0, leftOut: 0, skipped: 0 });
});

test('a file that holds data and dashboards: one can be opened without the other', () => {
    const T = filled();
    for (const file of [joinBytes(T.files.exportBinary().parts), joinText(T.files.exportText().parts)]) {
        let U = loadTeleplot();
        let result = U.files.importData(file, { data: false });
        U.__timers.run();
        assert.deepEqual([result.samples, result.telemetries, result.ranges, result.dashboards, Object.keys(U.datastore.telemetries), Object.keys(U.clients.clients)], [0, [], [], ['Robot'], [], []], 'dashboards only: no telemetry, no client');
        assert.equal(U.dashboards.exportText('Robot'), T.dashboards.exportText('Robot'));
        U = loadTeleplot();
        result = U.files.importData(file, { dashboards: false });
        U.__timers.run();
        assert.deepEqual([result.dashboards, result.dashboardNames], [[], {}]);
        assert.equal(result.samples > 0, true);
        // (the telemetry that says its own dashboard with its label still creates it when it shows up: that is data)
        if (typeof file !== 'string') assert.deepEqual(snapshot(U), snapshot(T));
        U = loadTeleplot();
        result = U.files.importData(file, { dashboards: false, data: false });
        assert.deepEqual([result.samples, result.dashboards, Object.keys(U.datastore.telemetries), Object.keys(U.dashboards.dashboards)], [0, [], [], []]);
    }
});

test('thresholds and ranges in files: what a text file cannot say is counted, a CSV has none, estimates count them', () => {
    const T = loadTeleplot();
    const P = T.protocol, TH = P.SECTION_TYPE_TELEM_DATA_THRESHOLD;
    const telem = T.datastore.getOrCreateTelemetry('temp');
    telem.addData(20, [1, 2], [[20, 21]]);
    telem.addData(TH, [1, 1, 1, 1, 1], [[1, 1, 1, 1, 0], [70, 80, 90, 95, NaN], ['hot', ' padded ', 'two\nlines', 'bad color', 'gone'], ['', '', '', 'a:b', '']]);
    const text = T.files.exportText({ dashboards: false });
    assert.equal(text.skipped, 3, 'names that would not come back the same, a color with a separator');
    assert.equal(joinText(text.parts), 'TH|temp:1000:hot>70;1000:gone<\ntemp:1000:20;2000:21\n');
    const binary = T.files.exportBinary({ dashboards: false });
    assert.equal(binary.skipped, 0);
    const U = loadTeleplot();
    U.files.importData(joinBytes(binary.parts));
    assert.deepEqual(snapshot(U), snapshot(T), 'the binary file holds them all');
    assert.equal(U.datastore.getTelemetry('temp').getThresholds().length, 4);
    const csv = T.files.exportCSV();
    assert.deepEqual([csv.samples, csv.skipped, joinText(csv.parts).split('\r\n')[0]], [2, 5, 'time,temp']);
    assert.deepEqual([T.files.estimate('binary').samples, T.files.estimate('csv').skipped], [7, 5]);
    // A dry run counts them as it counts the rest, and stores nothing
    const V = loadTeleplot();
    const report = V.files.createImport({ dryRun: true });
    report.add('ATTR|x|min=0|max=1\nTH|x:1000:low<0.2\nx:1000:0.5\n');
    const result = report.finish();
    assert.deepEqual([result.samples, Object.keys(V.datastore.telemetries).length], [2, 0]);
});
