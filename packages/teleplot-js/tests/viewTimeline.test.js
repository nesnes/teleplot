// 116-viewTimeline: lanes built from text telemetries (bands of states, ticks of logs), period displayed, colors (data side, without DOM)
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');

const NUMBER = 20, TEXT = 23;
function setup(names = ['state']) {
    const T = loadTeleplot();
    const telems = names.map(n => T.datastore.getOrCreateTelemetry(n));
    const view = new T.view.ViewTimeline('timeline-div', names);
    return { T, telems, view };
}
const entryOf = (timestamps, texts) => ({ timestamps, data: [texts] });
const show = (items) => items.map(i => (i.tick ? '|' : '') + i.from + (i.tick ? '' : '-' + i.to) + ':' + (i.mixed ? '~' + i.count : i.text + (i.count > 1 ? 'x' + i.count : '')));

test('a state is a band from each sample to the next different one; the same text again continues it; the last runs to the end', () => {
    const { T } = setup();
    const lane = T.view.ViewTimeline.buildLane;
    const entry = entryOf([10, 20, 30, 40, 50], ['idle', 'idle', 'moving', 'moving', 'error']);
    assert.deepEqual(show(lane(entry, false, 0, 100)), ['10-30:idle', '30-50:moving', '50-100:error']);
    assert.deepEqual(show(lane(entry, false, 25, 45)), ['25-30:idle', '30-45:moving'], 'cut to the period: the state in force when it starts, the one still in force when it ends');
    assert.deepEqual(show(lane(entry, false, 60, 70)), ['60-70:error'], 'nothing new in the period: still the last state');
    assert.deepEqual(show(lane(entry, false, 0, 10)), [], 'a sample at the very end has no duration yet');
    assert.deepEqual(show(lane(entry, false, 0, 5)), [], 'before the first sample: nothing is known');
    assert.deepEqual(show(lane(entry, false, 30, 50)), ['30-50:moving'], 'limits');
    assert.deepEqual(lane(entry, false, 50, 50), []);
    assert.deepEqual(lane(entryOf([], []), false, 0, 10), []);
});

test('an empty text is a hole: no band, and what comes after it is a new one', () => {
    const { T } = setup();
    const lane = T.view.ViewTimeline.buildLane;
    assert.deepEqual(show(lane(entryOf([10, 20, 30, 40], ['dock', '', '', 'dock']), false, 0, 100)), ['10-20:dock', '40-100:dock']);
    assert.deepEqual(show(lane(entryOf([10, 20], ['dock', '']), false, 0, 100)), ['10-20:dock'], 'ended by an empty text: it does not run to the end');
    assert.deepEqual(show(lane(entryOf([10], ['']), false, 0, 100)), []);
    assert.deepEqual(show(lane(entryOf([10, 20], [0, 1]), false, 0, 100)), ['10-20:0', '20-100:1'], 'whatever is stored is shown as text');
});

test('a log is a tick per line', () => {
    const { T } = setup();
    const lane = T.view.ViewTimeline.buildLane;
    const entry = entryOf([10, 20, 20, 30], ['a', 'b', 'c', '']);
    assert.deepEqual(show(lane(entry, true, 0, 100)), ['|10:a', '|20:b', '|20:c', '|30:'], 'lines do not last, and the same instant can hold two');
    assert.deepEqual(show(lane(entry, true, 10, 20)), ['|10:a', '|20:b', '|20:c'], 'limits included');
    assert.deepEqual(show(lane(entry, true, 11, 19)), []);
});

test('what is too short to be drawn is not drawn as something else: short states become a block that counts them, close ticks one tick', () => {
    const { T } = setup();
    const lane = T.view.ViewTimeline.buildLane;
    const entry = entryOf([0, 100, 101, 102, 103, 200, 201, 300], ['a', 'b', 'c', 'b', 'a', 'b', 'a', 'b']);
    assert.deepEqual(show(lane(entry, false, 0, 400, 5)), ['0-100:a', '100-103:~3', '103-200:a', '200-201:~1', '201-300:a', '300-400:b']);
    assert.deepEqual(show(lane(entry, false, 0, 400, 0)), ['0-100:a', '100-101:b', '101-102:c', '102-103:b', '103-200:a', '200-201:b', '201-300:a', '300-400:b']);
    // A long run of short states: blocks of about the shortest drawable duration each, every state counted once
    const fast = entryOf(Array.from({ length: 1000 }, (v, i) => i), Array.from({ length: 1000 }, (v, i) => 's' + i % 3));
    const blocks = lane(fast, false, 0, 1000, 10);
    assert.ok(blocks.every(b => b.mixed && b.to - b.from <= 20) && blocks.length >= 50, blocks.length + ' blocks');
    assert.equal(blocks.reduce((n, b) => n + b.count, 0), 1000);
    assert.equal(blocks[0].from, 0);
    assert.equal(blocks.at(-1).to, 1000);
    // Empty states are not counted in a block
    assert.deepEqual(show(lane(entryOf([0, 1, 2, 3], ['a', '', 'b', '']), false, 0, 100, 5)), ['0-3:~2'], 'counted: the states, not the holes between them');
    assert.deepEqual(show(lane(entryOf([0, 1, 2, 30, 31], ['a', 'b', 'c', 'd', 'e']), true, 0, 100, 5)), ['|0:ax3', '|30:dx2']);
});

test('the view builds a lane per text telemetry of its list, in its order, and only again when something changed', () => {
    const { T, telems, view } = setup(['state', 'speed', 'events', 'ghost', 'state']);
    telems[0].addData(TEXT, [10, 20], [['idle', 'moving']]);
    telems[1].addData(NUMBER, [10, 30], [[1, 2]]);
    telems[2].setAttribute(T.protocol.TELEM_ATTR_LOG, true);
    telems[2].addData(TEXT, [15], [['armed']]);
    view.update();
    assert.deepEqual(view.lanes.map(l => [l.name, l.kind, show(l.items)]), [['state', 'state', ['10-20:idle', '20-30:moving']], ['speed', 'line', []], ['events', 'log', ['|15:armed']]]);
    assert.deepEqual([view.period.from, view.period.to], [10, 30], 'the numbers of the view count in its period');
    const lanes = view.lanes.map(l => l.items);
    view.update();
    assert.deepEqual(view.lanes.map(l => l.items === lanes[view.lanes.indexOf(l)]), [true, true, true], 'nothing changed: nothing built again');
    telems[0].addData(TEXT, [40], [['error: stalled']]);
    view.update();
    assert.deepEqual(show(view.lanes[0].items), ['10-20:idle', '20-40:moving', '40-41.2:error: stalled'], 'the latest state has just shown up: it gets some room to be read');
    assert.deepEqual([view.period.from, view.period.to], [10, 41.2]);
    telems[1].addData(NUMBER, [60], [[3]]);
    view.update();
    assert.deepEqual([view.period.to, show(view.lanes[0].items).at(-1)], [60, '40-60:error: stalled'], 'time passed: no room is needed any more');
    telems[0].addData(TEXT, [60], [['']]);
    view.update();
    assert.deepEqual([view.period.to, show(view.lanes[0].items).at(-1)], [60, '40-60:error: stalled'], 'an empty state needs none');
});

test('period: the zoom of the group, or what the views of the group cover, within the data window; a lone sample gets room', () => {
    const { T, telems, view } = setup(['state']);
    assert.equal(view.getTimeWindow(), undefined);
    telems[0].addData(TEXT, [1000], [['idle']]);
    assert.deepEqual(view.getTimeWindow(), { from: 999, to: 1009 }, 'one sample: shown, with some room');
    view.update();
    assert.deepEqual(view.lanes[0].items.map(i => [i.from, i.to, i.text]), [[1000, 1009, 'idle']]);
    // A chart of the same group makes time pass: a state that is not sent again still lasts
    const speed = T.datastore.getOrCreateTelemetry('speed');
    speed.addData(NUMBER, [1000, 1100], [[1, 2]]);
    const chart = new T.view.ViewChart('c', ['speed']);
    T.view.addView(view); T.view.addView(chart);
    assert.deepEqual(view.getTimeWindow(), { from: 1000, to: 1100 });
    view.update();
    assert.deepEqual(view.lanes[0].items.map(i => [i.from, i.to]), [[1000, 1100]]);
    // Views of another group do not count
    const other = new T.view.ViewChart('o', ['far'], 'elsewhere');
    T.datastore.getOrCreateTelemetry('far').addData(NUMBER, [5000], [[1]]);
    T.view.addView(other);
    assert.deepEqual(view.getTimeWindow(), { from: 1000, to: 1100 });
    // The data window: a state kept from before it is shown from where the window starts
    T.state.dataTimeout = 300;
    speed.addData(NUMBER, [2000], [[3]]);
    assert.deepEqual(view.getTimeWindow(), { from: 1700, to: 2000 });
    view.update();
    assert.deepEqual(view.lanes[0].items.map(i => [i.from, i.to, i.text]), [[1700, 2000, 'idle']]);
    // The room of the latest state is measured on the window, not on the data older than it (kept, or not pruned yet after the
    // window was lowered): it stays a small part of the period
    telems[0].addData(TEXT, [2000], [['run']]);
    T.state.dataTimeout = 10;
    let period = view.getTimeWindow();
    assert.deepEqual([period.to - period.from, Math.round((period.to - 2000) * 1000) / 1000], [10, 0.4], 'before: 40 of room (4 % of 1000), the whole window');
    T.state.dataTimeout = 300;
    assert.deepEqual(view.getTimeWindow(), { from: 1712, to: 2012 }, 'a latest state that started near the end: 4 % of the window');
    T.state.dataTimeout = 0;
    assert.deepEqual(view.getTimeWindow(), { from: 1000, to: 2040 }, 'no data window: everything (and 4 % of it for the latest state)');
    // Zoomed
    Object.assign(T.view.groups.default, { cursorActive: true, timestampFrom: 1500, timestampTo: 1600 });
    assert.deepEqual(view.getTimeWindow(), { from: 1500, to: 1600 });
    view.update();
    assert.deepEqual(view.lanes[0].items.map(i => [i.from, i.to]), [[1500, 1600]]);
});

test('colors: the texts of a view take different colors as they show up, errors and warnings the ones of the theme, logs none', () => {
    const { T, telems, view } = setup(['state', 'events']);
    const V = T.view.ViewTimeline;
    telems[0].addData(TEXT, [1, 2, 3, 4, 5, 6], [['idle', 'moving', 'idle', 'ERROR stalled', 'warning: slow', 'grasping']]);
    telems[1].setAttribute(T.protocol.TELEM_ATTR_LOG, true);
    telems[1].addData(TEXT, [1, 2], [['armed', '[WARN] hot']]);
    telems[0].addData(NUMBER, [1, 100], [[1, 1]]);
    view.update();
    const colors = view.lanes[0].items.map(i => i.color);
    assert.deepEqual([colors[0] === colors[2], colors[3], colors[4]], [true, 'error', 'warn']);
    assert.equal(new Set([colors[0], colors[1], colors[5]]).size, 3, 'three states, three colors');
    assert.deepEqual(Array.from(view.colors.keys()), ['idle', 'moving', 'grasping'], 'remembered in the order they showed up');
    assert.equal(view.lanes[1].items[1].color, 'warn');
    assert.equal(view.colors.has('armed'), false, 'log lines do not take the colors of the states');
    // The first twelve texts are told apart; a view remembers a limited number of texts, the others get a color from their text
    const known = new Map();
    assert.equal(new Set(Array.from({ length: V.PALETTE.length }, (v, i) => V.colorOf('s' + i, known))).size, V.PALETTE.length);
    for (let i = 0; i < V.COLOR_MEMORY + 10; i++) V.colorOf('t' + i, known);
    assert.equal(known.size, V.COLOR_MEMORY);
    assert.equal(V.colorOf('never seen', known), V.colorOf('never seen'), 'stable without memory');
});

test('what is under the pointer: the band that holds a time, the closest tick within reach, and how long a state really lasts', () => {
    const { T } = setup();
    const V = T.view.ViewTimeline;
    const entry = entryOf([10, 20, 30, 40, 50, 60], ['idle', 'idle', 'moving', '', 'idle', 'idle']);
    const lane = { items: V.buildLane(entry, false, 15, 55) };
    assert.deepEqual([12, 15, 25, 30, 35, 45, 52, 55, 70].map(t => (V.itemAt(lane, t) || {}).text), [undefined, 'idle', 'idle', 'moving', 'moving', undefined, 'idle', undefined, undefined]);
    const ticks = { items: V.buildLane(entryOf([10, 20, 21], ['a', 'b', 'c']), true, 0, 100) };
    assert.deepEqual([9, 12, 14, 20.4, 20.6, 50].map(t => (V.itemAt(ticks, t, 3) || {}).text), ['a', 'a', undefined, 'b', 'c', undefined]);
    assert.equal(V.itemAt({ items: [] }, 5, 3), undefined);
    // The band is cut to the period displayed, the state is not
    assert.deepEqual(V.extentOf(entry, 15), { start: 10, end: 30 });
    assert.deepEqual(V.extentOf(entry, 30), { start: 30, end: 40 });
    assert.deepEqual(V.extentOf(entry, 55), { start: 50, end: undefined }, 'still the latest');
    assert.equal(V.extentOf(entry, 5), undefined);
    assert.deepEqual([0.85, 12.34, 125, 3725].map(V.formatDuration), ['850 ms', '12.3 s', '2 min 05 s', '1 h 02 min']);
});

test('time axis: round steps, far enough from each other', () => {
    const { T } = setup();
    const ticks = T.view.ViewTimeline.timeTicks;
    assert.deepEqual(ticks(100, 160, 600), { step: 10, splits: [100, 110, 120, 130, 140, 150, 160] });
    assert.deepEqual([ticks(100.2, 100.9, 600).step, ticks(100.2, 100.9, 600).splits.length], [0.2, 4]);
    assert.equal(ticks(0, 86400 * 30, 600).step, 86400 * 5);
    assert.deepEqual(ticks(5, 5, 600).splits, []);
    assert.deepEqual(ticks(0, 10, 0).splits, []);
});

test('a timeline takes text telemetries: it suits them, and is a view type like the others', () => {
    const { T, telems, view } = setup(['state']);
    telems[0].addData(TEXT, [1], [['idle']]);
    const speed = T.datastore.getOrCreateTelemetry('speed');
    speed.addData(NUMBER, [1], [[1]]);
    assert.deepEqual([view.suitsTelemetry(telems[0]), view.suitsTelemetry(speed)], [true, false], 'a timeline that follows a label only takes texts: numbers are added on purpose');
    assert.equal(T.view.suggestViewType('state'), 'values', 'a state is still a value by default: a timeline is asked for');
    assert.deepEqual(view.getOptionsSchema().map(o => o.key), ['displayTelemetryName', 'stackDepth', 'numbers']);
    const copy = view.clone();
    assert.ok(copy instanceof T.view.ViewTimeline);
    assert.deepEqual(Array.from(copy.telemetryIdOrNameList), ['state']);
    // Empty states of the view (no telemetry, no data, not text)
    assert.equal(new T.view.ViewTimeline('x', []).getEmptyState().text, 'No telemetry');
    assert.equal(new T.view.ViewTimeline('x', ['ghost']).getEmptyState().text, 'Waiting for data');
    assert.equal(new T.view.ViewTimeline('x', ['speed']).getEmptyState().text, '', 'a number can be given a lane');
    T.datastore.getOrCreateTelemetry('xy').addData(21, [1], [[1], [2]]);
    assert.equal(new T.view.ViewTimeline('x', ['xy']).getEmptyState().text, 'Nothing to display');
    assert.equal(view.getEmptyState().text, '');
});

const THRESHOLD = 40;

test('a number with thresholds is read as a state: a band where it is past a threshold, from the sample that passed it', () => {
    const { T, telems, view } = setup(['temp']);
    const P = T.protocol, V = T.view.ViewTimeline;
    const limit = (t, operator, value, name, color = '') => telems[0].addData(THRESHOLD, [t], [[operator], [value], [name], [color]]);
    limit(0, P.THRESHOLD_ABOVE, 70, 'hot'); limit(0, P.THRESHOLD_ABOVE, 90, 'critical', 'red'); limit(0, P.THRESHOLD_BELOW, 10, 'cold', '#00f');
    telems[0].addData(NUMBER, [10, 20, 30, 40, 50, 60, 70, 80], [[50, 75, 80, 95, 72, 60, 5, NaN]]);
    const runs = () => { const r = V.limitRuns(telems[0]); return r.timestamps.map((t, i) => t + ':' + r.data[0][i]); };
    assert.deepEqual(runs(), ['10:', '20:hot', '40:critical', '50:hot', '60:', '70:cold', '80:'], 'a run starts at the sample that passed the limit, not where a line between two samples would cross it');
    view.update();
    assert.deepEqual([view.lanes[0].kind, show(view.lanes[0].items)], ['limits', ['20-40:hot', '40-50:critical', '50-60:hot', '70-80:cold']]);
    assert.deepEqual(view.lanes[0].items.map(i => i.color), ['warn', 'red', 'warn', '#00f'], 'the color of the threshold, or the one of the theme');
    // Completed as samples come, not built again
    const first = V.limitRuns(telems[0]);
    telems[0].addData(NUMBER, [90, 100], [[71, 72]]);
    assert.deepEqual(runs().slice(-1), ['90:hot']);
    assert.equal(V.limitRuns(telems[0]), first);
    // Each sample is compared with the limits in force at its own time: a limit that moves does not rewrite the past
    limit(95, P.THRESHOLD_ABOVE, 80, 'hot');
    assert.deepEqual(runs().slice(-2), ['90:hot', '100:'], '71 was past 70 at 90; 72 is not past 80 at 100');
    limit(105, P.THRESHOLD_ABOVE, NaN, 'critical');
    telems[0].addData(NUMBER, [110], [[99]]);
    assert.deepEqual(runs().slice(-1), ['110:hot'], 'critical was removed');
    // A limit that is given late (a time before samples already read) is taken into account too
    limit(55, P.THRESHOLD_BELOW, 65, 'cool');
    assert.deepEqual(runs().slice(4), ['60:cool', '70:cold', '80:', '90:hot', '100:', '110:hot'], '60 is below 65 from 55 on; before it nothing changed');
    assert.deepEqual(runs().slice(0, 4), ['10:', '20:hot', '40:critical', '50:hot']);
    // What is under the pointer: how long it was really past it
    view.update();
    assert.deepEqual(V.extentOf(view.lanes[0].runs, 45), { start: 40, end: 50 });
    telems[0].setAttribute(P.TELEM_ATTR_UNIT, '°C');
    assert.deepEqual([V.describeLimit(telems[0], 'critical', 45), V.describeLimit(telems[0], 'cold', 75), V.describeLimit(telems[0], 'hot', 25), V.describeLimit(telems[0], 'hot', 100), V.describeLimit(telems[0], 'nope', 45)],
        ['above 90 °C, ', 'below 10 °C, ', 'above 70 °C, ', 'above 80 °C, ', ''], 'what the tip says of a band: the limit as it was at that time');
    // Late samples and pruning are followed
    telems[0].addData(NUMBER, [15], [[100]]);
    assert.deepEqual(runs().slice(0, 3), ['10:', '15:critical', '20:hot']);
    // The data window removes old samples: their runs go with them, the rest is not read again
    T.state.dataTimeout = 1000;
    const rolling = T.datastore.getOrCreateTelemetry('rolling');
    rolling.addData(THRESHOLD, [0], [[P.THRESHOLD_ABOVE], [0.5], ['high'], ['']]);
    rolling.addData(NUMBER, Array.from({ length: 3000 }, (v, i) => i), [Array.from({ length: 3000 }, (v, i) => Math.floor(i / 100) % 2)]);
    const kept = V.limitRuns(rolling);
    let read = 0; const all = rolling.getThresholds.bind(rolling); rolling.getThresholds = (t) => { read++; return all(t); };
    T.datastore.__deleteTimedOutData();
    rolling.addData(NUMBER, [3000, 3001], [[1, 0]]);
    const rolled = V.limitRuns(rolling);
    const reference = () => { const fresh = { data: rolling.data, getThresholds: all }; const list = []; let last; rolling.data[NUMBER].timestamps.forEach((t, i) => { const name = rolling.data[NUMBER].data[0][i] > 0.5 ? 'high' : ''; if (name !== last) { list.push(t + ':' + name); last = name; } }); return list; };
    assert.equal(rolled, kept);
    assert.equal(rolling.data[NUMBER].timestamps[0], 1999, 'the window removed the first two thirds');
    assert.deepEqual(rolled.timestamps.map((t, i) => t + ':' + rolled.data[0][i]).slice(1), reference().slice(1), 'the same runs as read from scratch');
    assert.deepEqual([rolled.timestamps[0] <= 1999, rolled.data[0][0], read], [true, 'high', 1], 'the run in force when the data starts is kept; only the new samples were read');
    T.state.dataTimeout = 0;
    // What a new limit costs: only the samples from its time on are read again
    const many = T.datastore.getOrCreateTelemetry('many');
    many.addData(THRESHOLD, [0], [[P.THRESHOLD_ABOVE], [0.5], ['high'], ['']]);
    many.addData(NUMBER, Array.from({ length: 5000 }, (v, i) => i), [Array.from({ length: 5000 }, (v, i) => Math.floor(i / 100) % 2)]);
    const before = V.limitRuns(many), length = before.timestamps.length;
    let asked = 0; const original = many.getThresholds.bind(many); many.getThresholds = (t) => { asked++; return original(t); };
    many.addData(THRESHOLD, [4950], [[P.THRESHOLD_ABOVE], [2], ['high'], ['']]);
    const after = V.limitRuns(many);
    assert.equal(after, before, 'the same runs, completed');
    assert.deepEqual([after.timestamps.slice(0, length - 1).every((t, i) => t === i * 100), after.timestamps.at(-1), after.data[0].at(-1), asked], [true, 4950, '', 1], 'past "high" until 4950, where the limit rose above it');
    // Too short to be drawn: a block, as for states
    const fast = T.datastore.getOrCreateTelemetry('fast');
    fast.addData(THRESHOLD, [0], [[P.THRESHOLD_ABOVE], [0.5], ['high'], ['']]);
    fast.addData(NUMBER, Array.from({ length: 1000 }, (v, i) => i), [Array.from({ length: 1000 }, (v, i) => i % 2)]);
    const blocks = V.buildLane(V.limitRuns(fast), false, 0, 1000, 10);
    assert.ok(blocks.length > 20 && blocks.every(b => b.mixed), blocks.length + ' blocks');
});

test('a number without thresholds is a line: real samples, a few per pixel, with the one before and the one after the period', () => {
    const { T, telems, view } = setup(['n', 'ranged', 'flat']);
    const V = T.view.ViewTimeline;
    telems[0].addData(NUMBER, [0, 10, 20, 30, 40], [[0, 1, 0, 1, 5]]);
    telems[1].addData(NUMBER, [0, 40], [[2, 3]]);
    telems[1].setAttribute(T.protocol.TELEM_ATTR_RANGE, { min: 0, max: 10 });
    telems[2].addData(NUMBER, [5], [[7]]);
    view.update();
    assert.deepEqual(view.lanes.map(l => [l.kind, l.items.length, l.line.timestamps, l.line.values, l.line.min, l.line.max]),
        [['line', 0, [0, 10, 20, 30, 40], [0, 1, 0, 1, 5], 0, 5], ['line', 0, [0, 40], [2, 3], 0, 10], ['line', 0, [5], [7], 7, 7]], 'scaled on what is drawn, or on the range of the telemetry');
    assert.ok(view.lanes.every(l => l.color), 'each line has its color');
    // A period inside the data: the line comes in from the sample before and goes out to the sample after
    const decimator = view.decimators[telems[0].id];
    const line = V.buildLine(telems[0].data[NUMBER], decimator, 12, 28, 100);
    assert.deepEqual([line.timestamps, line.values], [[10, 20, 30], [1, 0, 1]]);
    const between = V.buildLine(telems[0].data[NUMBER], decimator, 22, 28, 100);
    assert.deepEqual([between.timestamps, between.values], [[20, 30], [0, 1]], 'no sample in the period: still the segment that goes through it');
    assert.deepEqual(V.buildLine(telems[0].data[NUMBER], decimator, 50, 60, 100).timestamps, [40], 'after the last sample: nothing is drawn further');
    assert.deepEqual(V.buildLine({ timestamps: [], data: [[]] }, decimator, 0, 10, 100), { timestamps: [], values: [], min: Infinity, max: -Infinity });
    // Many samples: a few per pixel, all of them real, the extremes kept
    const big = T.datastore.getOrCreateTelemetry('big');
    big.addData(NUMBER, Array.from({ length: 100000 }, (v, i) => i * 0.001), [Array.from({ length: 100000 }, (v, i) => i === 54321 ? 99 : Math.sin(i / 50))]);
    const few = V.buildLine(big.data[NUMBER], new view.decimators[telems[0].id].constructor(), 0, 100, 300);
    assert.ok(few.timestamps.length < 2500, few.timestamps.length + ' points for 300 pixels');
    assert.equal(few.max, 99);
    assert.ok(few.timestamps.every((t, i) => big.data[NUMBER].data[0][Math.round(t * 1000)] === few.values[i]), 'every point is a sample');
    // Something that is not a number is not a point of the line
    telems[2].addData(NUMBER, [6, 7], [[NaN, 8]]);
    view.update();
    assert.deepEqual(view.lanes[2].line.values, [7, 8]);
});

test('option "numbers": "text" writes each value as a state; a telemetry that has text is shown by its text', () => {
    const { T, telems, view } = setup(['gear', 'temp', 'both']);
    const P = T.protocol;
    telems[0].addData(NUMBER, [10, 20, 30, 40, 50], [[0, 1, 1, 2, 1]]);
    telems[1].addData(NUMBER, [10, 50], [[20, 80]]);
    telems[1].addData(THRESHOLD, [0], [[P.THRESHOLD_ABOVE], [70], ['hot'], ['']]);
    telems[2].addData(NUMBER, [10, 50], [[1, 2]]);
    telems[2].addData(TEXT, [10, 50], [['a', 'b']]);
    view.update();
    assert.deepEqual(view.lanes.map(l => l.kind), ['line', 'limits', 'state']);
    view.setOption('numbers', 'text');
    view.update();
    assert.deepEqual(view.lanes.map(l => [l.kind, show(l.items)]), [['values', ['10-20:0', '20-40:1', '40-50:2', '50-51.6:1']], ['values', ['10-50:20', '50-51.6:80']], ['state', ['10-50:a', '50-51.6:b']]], 'the same value again continues its band; thresholds are not used');
    assert.equal(new Set(view.lanes[0].items.map(i => i.color)).size, 3, 'a color per value');
    assert.equal(view.lanes[0].items[1].color, view.lanes[0].items[3].color, 'the same value, the same color');
    // For one telemetry only
    view.setOption('numbers', 'auto');
    view.setOption('numbers', 'text', 'gear');
    view.update();
    assert.deepEqual(view.lanes.map(l => l.kind), ['values', 'limits', 'state']);
    // The latest state gets room at the end; numbers do not ask for any
    assert.deepEqual([view.period.from, view.period.to], [10, 51.6], 'room for the state "b" only');
});

test('a stack is a lane with a row per level: bands nest under what they run in', () => {
    const { T, telems, view } = setup(['task', 'mode']);
    const V = T.view.ViewTimeline;
    T.parseDataText('task:10000:loop|stack\ntask:20000:loop/read|stack\ntask:30000:loop/plan|stack\ntask:40000:loop/plan/search|stack\ntask:45000:loop/plan/search|stack\ntask:50000:loop/plan|stack\ntask:60000:|stack\ntask:70000:loop|stack\ntask:80000:idle|stack\nmode:10000:on|t');
    telems[1].addData(NUMBER, [10, 100], [[1, 1]]); // (what makes time pass up to 100)
    view.update();
    const lane = view.lanes[0];
    assert.deepEqual([lane.kind, view.lanes[1].kind, lane.items], ['stack', 'state', []]);
    assert.deepEqual(lane.rows.map(show), [['10-60:loop', '70-80:loop', '80-100:idle'], ['20-30:loop/read', '30-60:loop/plan'], ['40-50:loop/plan/search']]);
    assert.deepEqual(lane.rows.map(row => row.map(i => i.label)), [['loop', 'loop', 'idle'], ['read', 'plan'], ['search']], 'a band is written with what runs at its level');
    assert.equal(lane.rows[0][0].color, lane.rows[0][1].color, 'the same name, the same color');
    assert.notEqual(lane.rows[1][0].color, lane.rows[1][1].color);
    // Levels that nothing reaches in the period take no room; the period cuts bands like any state
    Object.assign(T.view.groups.default, { cursorActive: true, timestampFrom: 52, timestampTo: 75 });
    view.update();
    assert.deepEqual(view.lanes[0].rows.map(show), [['52-60:loop', '70-75:loop'], ['52-60:loop/plan']]);
    assert.deepEqual(V.extentOf(view.lanes[0].levels[1], 55), { start: 30, end: 60 }, 'what the pointer tells: how long the level really lasted');
    T.view.groups.default.cursorActive = false;
    // Calls too short to be drawn are a block at their level, as for states
    const fast = T.datastore.getOrCreateTelemetry('fast');
    fast.setAttribute(T.protocol.TELEM_ATTR_STACK, true);
    fast.addData(TEXT, Array.from({ length: 1000 }, (v, i) => i), [Array.from({ length: 1000 }, (v, i) => i % 2 ? 'main/work' + i % 3 : 'main')]);
    const levels = T.stackRuns(fast.data[TEXT]).levels;
    assert.deepEqual(show(V.buildLane(levels[0], false, 0, 1000, 10)), ['0-1000:main'], 'the level above is one band, whatever happens under it');
    assert.ok(V.buildLane(levels[1], false, 0, 1000, 10).every(b => b.mixed));
    // The latest level gets room to be read, like the latest state
    const lone = new V('l', ['solo']);
    T.parseDataText('solo:10000:a|stack\nsolo:20000:a/b|stack');
    lone.update();
    assert.deepEqual([lone.period.to, lone.lanes[0].rows.map(show)], [20.4, [['10-20.4:a'], ['20-20.4:a/b']]]);
});

test('height of a stack lane: it opens with the stack up to "stackDepth" rows, then its rows get thinner down to a minimum, then it grows again', () => {
    const { T, view } = setup(['task']);
    const size = T.view.ViewTimeline.laneSize, MIN = T.view.ViewTimeline.ROW_MIN;
    assert.equal(view.options.stackDepth, 4);
    assert.deepEqual([1, 2, 4].map(d => size(d, 4, 20, MIN)), [{ height: 20, rowHeight: 20 }, { height: 40, rowHeight: 20 }, { height: 80, rowHeight: 20 }], 'a row of full height per level');
    assert.deepEqual([5, 8, 11].map(d => size(d, 4, 20, MIN)), [{ height: 80, rowHeight: 16 }, { height: 80, rowHeight: 10 }, { height: 80, rowHeight: 80 / 11 }], 'deeper: the same height, thinner rows');
    assert.deepEqual([12, 20].map(d => size(d, 4, 20, MIN)), [{ height: 12 * MIN, rowHeight: MIN }, { height: 20 * MIN, rowHeight: MIN }], 'rows at their minimum: the lane grows again');
    assert.deepEqual([1, 6, 30].map(d => size(d, 0, 20, MIN)), [{ height: 20, rowHeight: 20 }, { height: 120, rowHeight: 20 }, { height: 600, rowHeight: 20 }], 'no limit: always full rows');
    assert.deepEqual(size(0, 4, 20, MIN), { height: 20, rowHeight: 20 }, 'an empty stack is one row');
    assert.deepEqual(size(3, 1, 20, MIN), { height: 3 * MIN, rowHeight: MIN });
    // The option is part of what the lanes are built from
    T.parseDataText('task:1000:a/b/c/d/e/f|stack');
    view.update();
    const key = view.lastKey;
    view.setOption('stackDepth', 2);
    view.update();
    assert.notEqual(view.lastKey, key);
});
