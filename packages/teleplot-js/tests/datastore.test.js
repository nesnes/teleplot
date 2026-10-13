const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot, captureConsole } = require('./helpers/load');

const NUMBER = 20;
function setup() {
    const T = loadTeleplot();
    return { T, telem: T.datastore.addTelemetry('t') };
}
const stamps = telem => telem.data[NUMBER].timestamps;
const values = telem => telem.data[NUMBER].data[0];

test('in-order data is appended, equal timestamps keep arrival order', () => {
    const { telem } = setup();
    telem.addData(NUMBER, [1, 2, 2, 3], [[10, 20, 21, 30]]);
    assert.deepEqual(stamps(telem), [1, 2, 2, 3]);
    assert.deepEqual(values(telem), [10, 20, 21, 30]);
    assert.equal(telem.data[NUMBER].lateInsertions, 0);
});

test('late data is inserted at the right place and counted', () => {
    const { telem } = setup();
    telem.addData(NUMBER, [1, 2, 4, 5], [[1, 2, 4, 5]]);
    telem.addData(NUMBER, [3, 0.5, 6], [[3, 0.5, 6]]);
    assert.deepEqual(stamps(telem), [0.5, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(values(telem), [0.5, 1, 2, 3, 4, 5, 6]);
    assert.equal(telem.data[NUMBER].lateInsertions, 2);
});

test('timestamps and every channel stay aligned (2D)', () => {
    const { telem } = setup();
    telem.addData(21, [1, 3], [[10, 30], [100, 300]]);
    telem.addData(21, [2], [[20], [200]]);
    assert.deepEqual(telem.data[21].timestamps, [1, 2, 3]);
    assert.deepEqual(telem.data[21].data, [[10, 20, 30], [100, 200, 300]]);
});

test('negative timestamps are ignored', () => {
    const { telem } = setup();
    telem.addData(NUMBER, [-1, 1], [[7, 8]]);
    assert.deepEqual(stamps(telem), [1]);
});

test('malformed input is rejected without storing anything', () => {
    const { telem } = setup();
    const out = captureConsole(() => {
        telem.addData(NUMBER, [1, 2], [[1, 2], [3, 4]]); // wrong channel count
        telem.addData(NUMBER, [1, 2], [[1]]);            // length mismatch
        telem.addData(999, [1], [[1]]);                  // unknown type
    });
    assert.ok(out.error.length >= 3, "each rejection is reported");
    assert.equal(telem.data[NUMBER], undefined);
});

test('nothing is stored while paused', () => {
    const { T, telem } = setup();
    T.state.isPaused = true;
    telem.addData(NUMBER, [1], [[1]]);
    assert.equal(telem.data[NUMBER], undefined);
});

test('getDataPoint returns the closest sample, or the latest without timestamp', () => {
    const { telem } = setup();
    telem.addData(NUMBER, [1, 2, 4, 8], [[1, 2, 4, 8]]);
    assert.equal(telem.getDataPoint(NUMBER).timestamp, 8);
    assert.equal(telem.getDataPoint(NUMBER, 2.9).timestamp, 2);
    assert.equal(telem.getDataPoint(NUMBER, 3.1).timestamp, 4);
    assert.equal(telem.getDataPoint(NUMBER, 100).timestamp, 8);
    assert.equal(telem.getDataPoint(NUMBER, 0).timestamp, 1);
    assert.equal(telem.getDataPoint(NUMBER + 1).index, undefined); // no such data
});

test('old data is pruned using the global timeout, or the telemetry attribute', () => {
    const { T, telem } = setup();
    T.state.dataTimeout = 5;
    telem.addData(NUMBER, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]);
    telem.__deleteTimedOutData();
    assert.deepEqual(stamps(telem), [5, 6, 7, 8, 9, 10]);
    assert.equal(values(telem).length, 6);

    telem.setAttribute(T.protocol.TELEM_ATTR_DATA_TIMEOUT, 2); // seconds
    telem.__deleteTimedOutData();
    assert.deepEqual(stamps(telem), [8, 9, 10]);

    telem.setAttribute(T.protocol.TELEM_ATTR_DATA_TIMEOUT, 0); // 0 = keep everything
    telem.addData(NUMBER, [1000], [[1]]);
    telem.__deleteTimedOutData();
    assert.equal(stamps(telem).length, 4);
});

test('clearData empties the telemetry', () => {
    const { telem } = setup();
    telem.addData(NUMBER, [1], [[1]]);
    telem.clearData();
    assert.deepEqual(telem.data, {});
});

test('telemetries are reachable by name and by generated id', () => {
    const { T } = setup();
    const a = T.datastore.getOrCreateTelemetry('a');
    assert.equal(T.datastore.getOrCreateTelemetry('a'), a);
    assert.equal(T.datastore.getTelemetry(a.id), a);
    assert.equal(a.getAttribute(T.protocol.TELEM_ATTR_NAME), 'a');
    assert.ok(a.id < 0, 'named telemetries get negative ids, numeric ids are for binary telemetries');
    assert.equal(T.datastore.getOrCreateTelemetry(42).id, 42);
    assert.equal(T.datastore.hasTelemetry('nope'), false);
});

test('stored data is marked raw so a reactive UI framework never wraps it (webapp ingestion perf)', () => {
    const { telem } = setup();
    telem.addData(NUMBER, [1], [[1]]);
    assert.equal(telem.data.__v_skip, true); // Vue's "do not proxy" flag
});

test('new telemetry hooks receive the telemetry that was created, even when several are created at once (regression: implicit global)', () => {
    const T = loadTeleplot();
    const seen = [];
    T.datastore.onNewTelemetryHooks.push(t => seen.push(t.getAttribute(T.protocol.TELEM_ATTR_NAME)));
    ['a', 'b', 'c'].forEach(n => T.datastore.getOrCreateTelemetry(n).addData(NUMBER, [1], [[1]]));
    T.__timers.run();
    assert.deepEqual(seen, ['a', 'b', 'c']);
});

test('a telemetry that has nothing to display yet (attributes, thresholds) is announced when its first data comes, once', () => {
    const T = loadTeleplot();
    const P = T.protocol, seen = [];
    T.datastore.onNewTelemetryHooks.push(t => seen.push(t.getAttribute(P.TELEM_ATTR_NAME)));
    const telem = T.datastore.getOrCreateTelemetry('battery');
    telem.setAttribute(P.TELEM_ATTR_RANGE, { min: 9, max: 12.6 });
    telem.addData(P.SECTION_TYPE_TELEM_DATA_THRESHOLD, [1], [[P.THRESHOLD_BELOW], [10.5], ['low'], ['']]);
    assert.equal(telem.hasContent(), false, 'a range and a threshold are nothing to display');
    T.__timers.run();
    assert.deepEqual(seen, [], 'nothing to place yet');
    telem.addData(NUMBER, [2], [[11.4]]);
    assert.deepEqual(seen, [], 'a moment after the data, as for a new telemetry');
    T.__timers.run();
    telem.addData(NUMBER, [3], [[11.3]]);
    T.__timers.run();
    assert.deepEqual(seen, ['battery']);
    // A shape is something to display without data
    const shape = T.datastore.getOrCreateTelemetry('box');
    T.__timers.run();
    shape.setAttribute(P.TELEM_ATTR_SHAPE, { type: 0, data: '' });
    T.__timers.run();
    assert.deepEqual(seen, ['battery', 'box']);
    // A hook that throws does not prevent the others
    T.datastore.onNewTelemetryHooks.unshift(() => { throw new Error('boom'); });
    const out = captureConsole(() => { T.datastore.getOrCreateTelemetry('c').addData(NUMBER, [1], [[1]]); T.__timers.run(); });
    assert.deepEqual([seen.at(-1), out.error.length], ['c', 1]);
});

test('thresholds: limits that hold from their timestamp, replaced by name, removed by a value that is not a number', () => {
    const T = loadTeleplot();
    const P = T.protocol, BELOW = P.THRESHOLD_BELOW, ABOVE = P.THRESHOLD_ABOVE;
    const telem = T.datastore.getOrCreateTelemetry('temp');
    const add = (t, operator, value, name, color = '') => telem.addData(P.SECTION_TYPE_TELEM_DATA_THRESHOLD, [t], [[operator], [value], [name], [color]]);
    const names = (t) => telem.getThresholds(t).map(x => x.name + (x.operator === ABOVE ? '>' : '<') + x.value);
    assert.deepEqual(telem.getThresholds(), []);
    assert.equal(telem.getThresholdStatus(100), undefined);
    add(10, ABOVE, 70, 'hot'); add(10, ABOVE, 85, 'critical', 'red'); add(10, BELOW, -10, 'cold');
    add(20, ABOVE, 75, 'hot');     // changed
    add(30, ABOVE, NaN, 'critical'); // removed
    assert.deepEqual(names(5), [], 'before the first one');
    assert.deepEqual(names(10), ['cold<-10', 'hot>70', 'critical>85'], 'lowest first');
    assert.deepEqual(names(25), ['cold<-10', 'hot>75', 'critical>85']);
    assert.deepEqual(names(30), ['cold<-10', 'hot>75']);
    assert.deepEqual(names(), ['cold<-10', 'hot>75'], 'without time: the latest');
    assert.deepEqual(telem.getThresholds(15).find(x => x.name == 'critical'), { name: 'critical', value: 85, operator: ABOVE, color: 'red', timestamp: 10 });
    // Status: the threshold a value is past; past several, the one it passed last
    assert.equal(telem.getThresholdStatus(60, 15), undefined);
    assert.equal(telem.getThresholdStatus(70, 15), undefined, 'at the limit is not past it');
    assert.equal(telem.getThresholdStatus(72, 15).name, 'hot');
    assert.equal(telem.getThresholdStatus(72, 25), undefined, 'the limit moved to 75');
    assert.equal(telem.getThresholdStatus(90, 15).name, 'critical');
    assert.equal(telem.getThresholdStatus(90, 35).name, 'hot', 'critical was removed');
    assert.equal(telem.getThresholdStatus(-20).name, 'cold');
    assert.equal(telem.getThresholdStatus(NaN), undefined);
    assert.equal(telem.getThresholdStatus('72'), undefined);
    // Steps over a period: a limit holds until the next sample of its name, the latest runs to the end
    const steps = (from, to) => Object.fromEntries(telem.getThresholdSteps(from, to).map(l => [l.name, l.steps.map(s => [s.from, s.to, s.value])]));
    assert.deepEqual(steps(0, 40), { hot: [[10, 20, 70], [20, 40, 75]], critical: [[10, 30, 85]], cold: [[10, 40, -10]] });
    assert.deepEqual(steps(15, 25), { hot: [[15, 20, 70], [20, 25, 75]], critical: [[15, 25, 85]], cold: [[15, 25, -10]] }, 'cut to the period');
    assert.deepEqual(steps(35, 40), { hot: [[35, 40, 75]], cold: [[35, 40, -10]] });
    assert.deepEqual(steps(0, 5), {});
    assert.deepEqual(telem.getThresholdSteps(5, 5), []);
    // A late sample is put in its place
    add(15, ABOVE, 72, 'hot');
    assert.deepEqual(steps(0, 40).hot, [[10, 15, 70], [15, 20, 72], [20, 40, 75]]);
});

test('range attribute: both ends, one end, none', () => {
    const T = loadTeleplot();
    const telem = T.datastore.getOrCreateTelemetry('a');
    assert.equal(telem.getRange(), undefined);
    telem.setAttribute(T.protocol.TELEM_ATTR_RANGE, { min: 0, max: 5 });
    assert.deepEqual(telem.getRange(), { min: 0, max: 5 });
    telem.setAttribute(T.protocol.TELEM_ATTR_RANGE, { min: undefined, max: 5 });
    assert.deepEqual(telem.getRange(), { min: undefined, max: 5 });
    telem.setAttribute(T.protocol.TELEM_ATTR_RANGE, { min: NaN, max: undefined });
    assert.equal(telem.getRange(), undefined);
});

test('data window: a state keeps its last sample before the window, a log does not, each threshold keeps its last sample', () => {
    const T = loadTeleplot();
    const P = T.protocol, TEXT = P.SECTION_TYPE_TELEM_DATA_TEXT, TH = P.SECTION_TYPE_TELEM_DATA_THRESHOLD;
    T.state.dataTimeout = 100;
    const state = T.datastore.getOrCreateTelemetry('state'), logs = T.datastore.getOrCreateTelemetry('logs'), temp = T.datastore.getOrCreateTelemetry('temp');
    logs.setAttribute(P.TELEM_ATTR_LOG, true);
    for (const telem of [state, logs]) telem.addData(TEXT, [1000, 1010, 1020, 1200], [['a', 'b', 'c', 'd']]);
    temp.addData(TH, [1000, 1000, 1010, 1020, 1030, 1200], [[1, 1, 1, 0, 1, 1], [70, 85, 72, -10, NaN, 74], ['hot', 'critical', 'hot', 'cold', 'critical', 'hot'], ['', 'red', '', '', '', '']]);
    T.datastore.__deleteTimedOutData();
    assert.deepEqual(state.data[TEXT].data[0], ['c', 'd'], 'the state in force when the window starts is kept');
    assert.deepEqual(logs.data[TEXT].data[0], ['d']);
    assert.deepEqual([temp.data[TH].timestamps, temp.data[TH].data[2]], [[1010, 1020, 1200], ['hot', 'cold', 'hot']], 'the last limit of each name; a removed one is gone');
    assert.deepEqual(temp.getThresholds(1150).map(x => x.name + x.value), ['cold-10', 'hot72']);
    T.datastore.__deleteTimedOutData();
    assert.deepEqual([state.data[TEXT].data[0], temp.data[TH].timestamps], [['c', 'd'], [1010, 1020, 1200]], 'nothing more to remove');
    // A threshold sent once stays, whatever comes after in the other data
    const once = T.datastore.getOrCreateTelemetry('once');
    once.addData(TH, [1], [[0], [10.5], ['low'], ['']]);
    once.addData(NUMBER, [1, 5000], [[11, 12]]);
    T.datastore.__deleteTimedOutData();
    assert.deepEqual([once.data[NUMBER].timestamps, once.getThresholds().length], [[5000], 1]);
});

test('memory: thresholds are neither thinned nor forgotten with the data they limit', () => {
    const T = loadTeleplot();
    const P = T.protocol, TH = P.SECTION_TYPE_TELEM_DATA_THRESHOLD;
    const telem = T.datastore.getOrCreateTelemetry('a');
    telem.addData(TH, [1, 1, 1, 1], [[0, 0, 1, 1], [1, 2, 3, 4], ['a', 'b', 'c', 'd'], ['', '', '', '']]);
    telem.addData(NUMBER, Array.from({ length: 400 }, (v, i) => 1 + i), [Array.from({ length: 400 }, (v, i) => i % 7)]);
    assert.ok(telem.thinOldest(0.5) > 0);
    assert.ok(telem.forgetOldest(0.5) > 0);
    assert.deepEqual(telem.getThresholds().map(x => x.name), ['a', 'b', 'c', 'd']);
    const only = T.datastore.getOrCreateTelemetry('only');
    only.addData(TH, [1, 2, 3, 4, 5, 6, 7, 8], [[0, 0, 0, 0, 0, 0, 0, 0], [1, 2, 3, 4, 5, 6, 7, 8], ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], ['', '', '', '', '', '', '', '']]);
    assert.deepEqual([only.thinOldest(1), only.forgetOldest(1), only.getThresholds().length], [0, 0, 8]);
});

test('5 minutes of data are kept by default; with a lot of data, pruning waits for 1% of it to be too old', () => {
    const { T, telem } = setup();
    assert.equal(T.state.dataTimeout, 300);
    T.state.dataTimeout = 1000;
    const count = 50000, xs = Array.from({ length: count }, (_, i) => i); // one sample per second
    telem.addData(NUMBER, xs, [xs.slice()]);
    telem.__deleteTimedOutData();
    assert.equal(stamps(telem).length, 1001, 'the last 1000 s');
    assert.equal(stamps(telem)[0], 48999);

    const { telem: big } = setup();
    big.setAttribute(T.protocol.TELEM_ATTR_DATA_TIMEOUT, 10000);
    big.addData(NUMBER, xs, [xs.slice()]);
    big.__deleteTimedOutData();
    assert.equal(stamps(big).length, 10001);
    big.addData(NUMBER, [50000, 50001], [[1, 2]]);
    big.__deleteTimedOutData();
    assert.equal(stamps(big).length, 10003, 'only 2 samples are too old: left for later');
    const more = Array.from({ length: 200 }, (_, i) => 50002 + i);
    big.addData(NUMBER, more, [more.slice()]);
    big.__deleteTimedOutData();
    assert.equal(stamps(big).length, 10001, 'pruned once enough is too old');
});

test('memory usage is estimated per telemetry: numbers, texts and images', () => {
    const T = loadTeleplot();
    const n = T.datastore.addTelemetry('n'), xy = T.datastore.addTelemetry('xy'), text = T.datastore.addTelemetry('text'), image = T.datastore.addTelemetry('image');
    const ts = Array.from({ length: 100 }, (_, i) => i);
    n.addData(NUMBER, ts, [ts.slice()]);
    xy.addData(21, ts, [ts.slice(), ts.slice()]);
    text.addData(23, ts, [ts.map(() => 'x'.repeat(50))]);
    image.addData(24, [1], [[0], ['A'.repeat(10000)]]);
    assert.deepEqual(n.getMemoryUsage(), { bytes: 1600, samples: 100 }, '8 bytes per timestamp and per value');
    assert.deepEqual(xy.getMemoryUsage(), { bytes: 2400, samples: 100 });
    assert.deepEqual(text.getMemoryUsage(), { bytes: 100 * (8 + 16 + 100), samples: 100 });
    assert.equal(image.getMemoryUsage().bytes, 8 + 8 + 16 + 20000);
    const usage = T.datastore.getMemoryUsage();
    assert.deepEqual(usage.telemetries.map(t => t.name), ['image', 'text', 'xy', 'n'], 'heaviest first');
    assert.equal(usage.bytes, usage.telemetries.reduce((sum, t) => sum + t.bytes, 0));
    assert.equal(usage.samples, 301);
});

test('thinOldest keeps real samples: the lowest and highest of each group of 4 in the oldest half', () => {
    const { telem } = setup();
    const count = 80, ts = Array.from({ length: count }, (_, i) => i);
    const vs = ts.map(i => [5, 9, 1, 5][i % 4] + (i >= 40 ? 100 : 0)); // per group: highest second, lowest third
    telem.addData(NUMBER, ts, [vs]);
    const before = telem.data[NUMBER].lateInsertions;
    assert.equal(telem.thinOldest(0.5), 20);
    const entry = telem.data[NUMBER];
    assert.equal(entry.timestamps.length, 60);
    assert.deepEqual(entry.timestamps.slice(0, 6), [1, 2, 5, 6, 9, 10], 'the samples that held the highest and the lowest, in the order they came');
    assert.deepEqual(entry.data[0].slice(0, 6), [9, 1, 9, 1, 9, 1]);
    assert.deepEqual(entry.timestamps.slice(20), ts.slice(40), 'the recent half is untouched');
    assert.deepEqual(entry.data[0].slice(20), vs.slice(40));
    assert.equal(entry.thinnedBefore, 39, 'up to when the data has been thinned');
    assert.equal(entry.lateInsertions, before + 1, 'caches made from this data are outdated');
    for (let i = 0; i < entry.timestamps.length; i++) assert.equal(entry.data[0][i], vs[entry.timestamps[i]], 'every sample kept is one that was received');
    for (let i = 1; i < entry.timestamps.length; i++) assert.ok(entry.timestamps[i] > entry.timestamps[i - 1], 'still in order');

    // again and again: the oldest data gets thinner each time, and the newest thinned moment is remembered
    const { telem: long } = setup();
    const many = Array.from({ length: 320 }, (_, i) => i);
    long.addData(NUMBER, many, [many.map(i => Math.sin(i))]);
    assert.equal(long.thinOldest(0.5), 80);
    assert.equal(long.thinOldest(0.5), 60);
    assert.deepEqual([long.data[NUMBER].timestamps.length, long.data[NUMBER].thinnedBefore], [180, 199], 'the second pass went further: the thinned part grew');
});

test('thinOldest: constant values and samples of several numbers keep the first and last of each group, texts the last one', () => {
    const T = loadTeleplot();
    const ts = Array.from({ length: 80 }, (_, i) => i);
    const flat = T.datastore.addTelemetry('flat'), xy = T.datastore.addTelemetry('xy'), text = T.datastore.addTelemetry('text');
    flat.addData(NUMBER, ts, [ts.map(() => 7)]);
    xy.addData(21, ts, [ts.map(i => i * 2), ts.map(i => -i)]);
    text.addData(23, ts, [ts.map(i => 'line ' + i)]);
    flat.thinOldest(); xy.thinOldest(); text.thinOldest();
    assert.deepEqual(flat.data[NUMBER].timestamps.slice(0, 4), [0, 3, 4, 7]);
    assert.deepEqual(xy.data[21].timestamps.slice(0, 4), [0, 3, 4, 7]);
    assert.deepEqual([xy.data[21].data[0].slice(0, 4), xy.data[21].data[1].slice(0, 4)], [[0, 6, 8, 14], [-0, -3, -4, -7]], 'the channels of a sample stay together');
    assert.deepEqual(text.data[23].timestamps.slice(0, 3), [3, 7, 11]);
    assert.deepEqual(text.data[23].data[0].slice(0, 3), ['line 3', 'line 7', 'line 11']);
    assert.equal(text.data[23].timestamps.length, 10 + 40);
    // A few big samples are thinned too (images are what fills the memory): one picture kept out of 4, type and picture together
    const image = T.datastore.addTelemetry('image');
    image.addData(24, ts.slice(0, 16), [ts.slice(0, 16).map(i => i % 2), ts.slice(0, 16).map(i => 'picture ' + i)]);
    assert.equal(image.thinOldest(), 6);
    assert.deepEqual([image.data[24].timestamps.slice(0, 3), image.data[24].data[0].slice(0, 2), image.data[24].data[1].slice(0, 2)], [[3, 7, 8], [1, 1], ['picture 3', 'picture 7']]);
    const tiny = T.datastore.addTelemetry('tiny');
    tiny.addData(NUMBER, [1, 2, 3], [[1, 2, 3]]);
    assert.equal(tiny.thinOldest(), 0, 'nothing to thin');
    assert.equal(T.datastore.addTelemetry('empty').thinOldest(), 0);
});

test('thinOldest: the other data types of a telemetry follow the heaviest one (an image keeps the pose it was taken from)', () => {
    const T = loadTeleplot();
    T.state.dataTimeout = 0;
    const P = T.protocol;
    const camera = T.datastore.addTelemetry('camera');
    const picture = 'x'.repeat(2000);
    // 64 images, and a pose that comes twice as often (not on the same times)
    for (let i = 0; i < 64; i++) camera.addData(P.SECTION_TYPE_TELEM_DATA_IMAGE, [10 + i], [[1], [picture + i]]);
    for (let i = 0; i < 128; i++) camera.addData(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION, [9.75 + i / 2], [[i], [0], [0]]);
    const images = camera.data[P.SECTION_TYPE_TELEM_DATA_IMAGE], poses = camera.data[P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION];
    const poseAt = (t) => { let found; poses.timestamps.forEach((stamp, i) => { if (stamp <= t) found = poses.data[0][i]; }); return found; };
    const before = new Map(images.timestamps.map((t) => [t, poseAt(t)]));
    camera.thinOldest(0.5);
    camera.forgetOldest(0.1); // (pruning moves the groups of the next round)
    camera.thinOldest(0.5);
    assert.ok(images.timestamps.length < 40 && poses.timestamps.length < 100, 'both were thinned');
    for (const t of images.timestamps) assert.equal(poseAt(t), before.get(t), `image of ${t} keeps its pose`);
    assert.equal(poses.thinnedBefore, images.thinnedBefore);
});

test('memory limit: the heaviest telemetries are thinned (default), or lose their oldest data, or the data flow is paused', () => {
    const fill = (T) => {
        const ts = Array.from({ length: 4000 }, (_, i) => i);
        T.datastore.addTelemetry('big').addData(NUMBER, ts, [ts.slice()]);                         // 64 000 bytes
        T.datastore.addTelemetry('small').addData(NUMBER, ts.slice(0, 100), [ts.slice(0, 100)]);    //  1 600 bytes
    };
    let T = loadTeleplot();
    assert.deepEqual([T.state.memoryLimit, T.state.memoryPolicy], [1e9, 'thin']);
    fill(T);
    assert.equal(T.datastore.checkMemory(true).bytes, 65600);
    assert.equal(T.datastore.memory.action, '', 'far under the limit: nothing is done');

    T.state.memoryLimit = 60000;
    let usage = T.datastore.checkMemory(true);
    assert.ok(usage.bytes <= 54000, 'back under the limit, with a margin');
    assert.deepEqual([T.datastore.memory.action, T.datastore.memory.actedOn], ['thin', ['big']]);
    assert.ok(T.datastore.getTelemetry('big').data[NUMBER].thinnedBefore > 0);
    assert.equal(T.datastore.getTelemetry('big').data[NUMBER].timestamps.at(-1), 3999, 'the newest data is untouched');
    assert.equal(T.datastore.getTelemetry('small').data[NUMBER].timestamps.length, 100, 'small telemetries are left alone');
    assert.equal(T.datastore.checkMemory().bytes, usage.bytes, 'measured at most once per second');

    T = loadTeleplot(); fill(T);
    Object.assign(T.state, { memoryLimit: 60000, memoryPolicy: 'forget' });
    usage = T.datastore.checkMemory(true);
    const big = T.datastore.getTelemetry('big').data[NUMBER];
    assert.deepEqual([T.datastore.memory.action, big.timestamps[0], big.timestamps.length, big.thinnedBefore], ['forget', 1000, 3000, undefined], 'the oldest quarter is gone, the rest is as received');

    T = loadTeleplot(); fill(T);
    Object.assign(T.state, { memoryLimit: 60000, memoryPolicy: 'pause' });
    T.datastore.checkMemory(true);
    assert.deepEqual([T.state.isPaused, T.datastore.memory.action, T.datastore.getTelemetry('big').data[NUMBER].timestamps.length], [true, 'pause', 4000]);

    T = loadTeleplot(); fill(T);
    Object.assign(T.state, { memoryLimit: 0 });
    T.datastore.checkMemory(true);
    assert.equal(T.datastore.memory.action, '', '0: no limit');
});

test('time span: how far back a telemetry goes, and the one that goes the furthest for all the data', () => {
    const T = loadTeleplot();
    assert.equal(T.datastore.getTimeSpan(), undefined, 'no data yet');
    T.state.dataTimeout = 0;
    const long = T.datastore.addTelemetry('long'), short = T.datastore.addTelemetry('short'), empty = T.datastore.addTelemetry('empty');
    const times = Array.from({ length: 16 }, (_, i) => 100 + i * 10);
    long.addData(NUMBER, times, [times.map((t, i) => i)]);
    short.addData(NUMBER, [5000, 5020], [[1, 2]]); // (another clock: only its own duration counts)
    assert.equal(empty.getTimeSpan(), undefined);
    assert.deepEqual(short.getTimeSpan(), { oldest: 5000, newest: 5020, duration: 20, intact: 20 });
    assert.deepEqual(T.datastore.getTimeSpan(), { oldest: 100, newest: 250, duration: 150, intact: 150, id: long.id, name: 'long', thinned: [] });
    long.thinOldest(0.5);
    assert.equal(long.getTimeSpan().intact, 80, 'the first 8 samples were thinned (up to 170)');
    long.forgetOldest(0.5);
    assert.equal(long.getTimeSpan().intact, long.getTimeSpan().duration, 'the thinned part is gone');
    T.datastore.checkMemory(true);
    assert.equal(T.datastore.memory.span.name, 'long', 'measured with the memory');
});

test('time span: data types are measured one by one, and a thinned telemetry shows even when another one goes further back', () => {
    const T = loadTeleplot();
    T.state.dataTimeout = 0;
    // A shape: its color was sent once, long ago; its position comes all the time. They are not one span of 1000 s.
    T.parseDataText('3D|box:1000:S:cube:C:red\n3D|box:1990000:P:1:0:0\n3D|box:2000000:P:2:0:0');
    assert.equal(T.datastore.getTelemetry('box').getTimeSpan().duration, 10);
    const times = Array.from({ length: 16 }, (_, i) => 100 + i * 10);
    T.datastore.addTelemetry('steady').addData(NUMBER, times.concat([260]), [times.concat([260]).map(() => 1)]);
    const heavy = T.datastore.addTelemetry('heavy');
    heavy.addData(NUMBER, times, [times.map((t, i) => i)]);
    heavy.thinOldest(0.5);
    const span = T.datastore.getTimeSpan();
    assert.equal(span.name, 'steady');
    assert.equal(span.duration, 160);
    assert.equal(span.intact, 80, 'heavy is thinned before its last 80 s');
    assert.deepEqual(span.thinned, ['heavy']);
});

test('clearing: all the data, all but some telemetries, or forgetting the telemetries (names keep their ids)', () => {
    const T = loadTeleplot();
    T.parseDataText('a:1\nb:2\nc:3');
    const idOfA = T.datastore.getTelemetry('a').id;
    T.datastore.clearData(telem => telem.getAttribute(T.protocol.TELEM_ATTR_NAME) == 'b');
    assert.deepEqual(['a', 'b', 'c'].map(n => Object.keys(T.datastore.getTelemetry(n).data).length), [0, 1, 0]);
    T.datastore.clearData();
    assert.equal(Object.keys(T.datastore.getTelemetry('b').data).length, 0);

    T.datastore.forgetTelemetries();
    assert.deepEqual([Object.keys(T.datastore.telemetries).length, T.datastore.hasTelemetry('a')], [0, false]);
    T.parseDataText('a:5');
    assert.equal(T.datastore.getTelemetry('a').id, idOfA, 'views that displayed it find it again');
});


test('point clouds: their memory is counted, and thinning keeps whole clouds (the last of each group)', () => {
    const T = loadTeleplot();
    T.state.dataTimeout = 0;
    const CLOUD = T.protocol.SECTION_TYPE_TELEM_DATA_POINT_CLOUD;
    const telem = T.datastore.addTelemetry('lidar');
    for (let i = 0; i < 16; i++) telem.addData(CLOUD, [i], [[new Float32Array(300).fill(i)], [new Float32Array(100)], [null]]);
    assert.equal(telem.getMemoryUsage().bytes, 16 * (8 + (16 + 1200) + (16 + 400) + 16), 'timestamps + positions + intensities + nothing');
    telem.thinOldest(0.5);
    const e = telem.data[CLOUD];
    assert.deepEqual(e.timestamps, [3, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    assert.ok(e.data[0][0] instanceof Float32Array && e.data[0][0][0] === 3 && e.data[0][0].length === 300, 'a cloud that stays is untouched');
    assert.equal(e.data.__v_skip || telem.data.__v_skip, true, 'never proxied');
});

test('telemetries dated from the start of a device (small timestamps) are not pruned before the window is full', () => {
    const T = loadTeleplot();
    const telem = T.datastore.getOrCreateTelemetry('boot');
    const N = T.protocol.SECTION_TYPE_TELEM_DATA_NUMBER;
    telem.addData(N, Array.from({ length: 50 }, (v, i) => 1 + i), [Array.from({ length: 50 }, (v, i) => i)]);
    T.datastore.__deleteTimedOutData();
    assert.equal(telem.data[N].timestamps.length, 50, 'regression: every sample but the last one was removed');
    telem.addData(N, [400], [[99]]);
    T.datastore.__deleteTimedOutData();
    assert.deepEqual(telem.data[N].timestamps, [400], 'once the window (300 s) is exceeded, what is older than it goes');
    telem.addData(N, [100.5, 450], [[1, 2]]);
    T.datastore.__deleteTimedOutData();
    assert.deepEqual(telem.data[N].timestamps, [400, 450]);
});

test('runs of a text entry: one item per run of the same text, completed as samples come, built again when samples are inserted or removed', () => {
    const T = loadTeleplot();
    const TEXT = T.protocol.SECTION_TYPE_TELEM_DATA_TEXT;
    T.state.dataTimeout = 100;
    const telem = T.datastore.getOrCreateTelemetry('state');
    const runs = () => { const r = T.textRuns(telem.data[TEXT]); return r.timestamps.map((t, i) => t + r.data[0][i]); };
    telem.addData(TEXT, [1000, 1001, 1002, 1003, 1004], [['a', 'a', 'b', '', 'a']]);
    assert.deepEqual(runs(), ['1000a', '1002b', '1003', '1004a']);
    const first = T.textRuns(telem.data[TEXT]);
    telem.addData(TEXT, [1005, 1006], [['a', 'c']]);
    assert.deepEqual(runs(), ['1000a', '1002b', '1003', '1004a', '1006c']);
    assert.equal(T.textRuns(telem.data[TEXT]), first, 'completed, not built again');
    assert.deepEqual(telem.data[TEXT].data[0], ['a', 'a', 'b', '', 'a', 'a', 'c'], 'the data is untouched');
    telem.addData(TEXT, [1001.5], [['z']]); // late
    assert.deepEqual(runs(), ['1000a', '1001.5z', '1002b', '1003', '1004a', '1006c']);
    telem.addData(TEXT, [1200], [['d']]);
    T.datastore.__deleteTimedOutData(); // the window removes the oldest (and keeps the state in force when it starts)
    assert.deepEqual(runs(), ['1006c', '1200d']);
    telem.addData(TEXT, [1201, 1202, 1203, 1204], [['d', 'e', 'e', 'f']]);
    telem.forgetOldest(0.5);
    assert.deepEqual(runs(), ['1202e', '1204f']);
    telem.removeRange(TEXT, 1202, 1203);
    assert.deepEqual(runs(), ['1204f']);
    // A state sent again a great many times is one run, whatever is asked about it
    const busy = T.datastore.getOrCreateTelemetry('busy');
    busy.addData(TEXT, Array.from({ length: 50000 }, (v, i) => i), [Array.from({ length: 50000 }, (v, i) => i < 25000 ? 'idle' : 'moving')]);
    assert.deepEqual(T.textRuns(busy.data[TEXT]).timestamps, [0, 25000]);
});

test('thresholds are found per name without going through all of them: appended, inserted late and pruned samples are followed', () => {
    const T = loadTeleplot();
    const P = T.protocol, TH = P.SECTION_TYPE_TELEM_DATA_THRESHOLD;
    T.state.dataTimeout = 100;
    const telem = T.datastore.getOrCreateTelemetry('n');
    const add = (t, value, name) => telem.addData(TH, [t], [[P.THRESHOLD_ABOVE], [value], [name], ['']]);
    const at = (t) => telem.getThresholds(t).map(x => x.name + x.value);
    add(1000, 1, 'fixed');
    for (let i = 0; i < 2000; i++) add(1000 + i * 0.01, 10 + i, 'moving');
    assert.deepEqual(at(), ['fixed1', 'moving2009']);
    assert.deepEqual(at(1005), ['fixed1', 'moving510']);
    assert.deepEqual(at(999), []);
    add(1020, 5000, 'moving'); // appended after the index was built
    assert.deepEqual(at(), ['fixed1', 'moving5000']);
    add(1005.005, 7, 'moving'); // late
    assert.deepEqual(at(1005.006), ['fixed1', 'moving7']);
    add(1200, 2, 'fixed');
    T.datastore.__deleteTimedOutData();
    assert.deepEqual([telem.data[TH].timestamps, at(), at(1150)], [[1000, 1020, 1200], ['fixed2', 'moving5000'], ['fixed1', 'moving5000']], 'the limit of each name that was in force when the window starts is kept');
});

test('new telemetries are announced when the datastore hands out wrapped objects (a reactive framework around the library: regression)', () => {
    const T = loadTeleplot();
    // What Vue does to an application that keeps the library in its data: reading a telemetry gives a proxy, never the object that was stored
    const raw = T.datastore.telemetries;
    T.datastore.telemetries = new Proxy(raw, { get: (target, key) => (target[key] && typeof target[key] === 'object') ? new Proxy(target[key], {}) : target[key] });
    const seen = [];
    T.datastore.onNewTelemetryHooks.push(t => seen.push(t.getAttribute(T.protocol.TELEM_ATTR_NAME)));
    T.dashboards.enableAutoDashboard('Live');
    T.parseDataText('ATTR|battery|min=9|max=12.6');
    T.__timers.run();
    T.parseDataText('battery:11.4\nspeed:1');
    T.__timers.run();
    assert.deepEqual(seen, ['battery', 'speed']);
    assert.equal(T.dashboards.getDashboard('Live').getView().views.length, 2, 'both are charted');
    // A telemetry that was forgotten and came back under the same id before its hooks ran is announced once
    T.datastore.getOrCreateTelemetry('again').addData(NUMBER, [1], [[1]]);
    T.datastore.forgetTelemetries();
    T.datastore.getOrCreateTelemetry('again').addData(NUMBER, [2], [[2]]);
    T.__timers.run();
    assert.deepEqual(seen, ['battery', 'speed', 'again']);
});
