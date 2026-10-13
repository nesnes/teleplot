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
    assert.deepEqual(view.lanes.map(l => [l.name, l.isLog, show(l.items)]), [['state', false, ['10-20:idle', '20-30:moving']], ['events', true, ['|15:armed']]]);
    assert.deepEqual([view.period.from, view.period.to], [10, 30], 'the numbers of the view count in its period');
    const lanes = view.lanes.map(l => l.items);
    view.update();
    assert.deepEqual(view.lanes.map(l => l.items === lanes[view.lanes.indexOf(l)]), [true, true], 'nothing changed: nothing built again');
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
    T.state.dataTimeout = 0;
    assert.deepEqual(view.getTimeWindow(), { from: 1000, to: 2000 }, 'no data window: everything');
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
    assert.deepEqual([view.suitsTelemetry(telems[0]), view.suitsTelemetry(speed)], [true, false]);
    assert.equal(T.view.suggestViewType('state'), 'values', 'a state is still a value by default: a timeline is asked for');
    assert.deepEqual(view.getOptionsSchema().map(o => o.key), ['displayTelemetryName']);
    const copy = view.clone();
    assert.ok(copy instanceof T.view.ViewTimeline);
    assert.deepEqual(Array.from(copy.telemetryIdOrNameList), ['state']);
    // Empty states of the view (no telemetry, no data, not text)
    assert.equal(new T.view.ViewTimeline('x', []).getEmptyState().text, 'No telemetry');
    assert.equal(new T.view.ViewTimeline('x', ['ghost']).getEmptyState().text, 'Waiting for data');
    assert.equal(new T.view.ViewTimeline('x', ['speed']).getEmptyState().text, 'Nothing to display');
    assert.equal(view.getEmptyState().text, '');
});
