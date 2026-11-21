// components/telemetry-card.js: what the card of a telemetry says (value at the time shown, statistics of the window, attributes...)
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../teleplot-js/tests/helpers/load');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'components', file), 'utf8');
const C = new Function('Vue', read('panel-export.js') + '\n' + read('panel-telemetries.js') + '\n' + read('telemetry-card.js') +
    '\nreturn { tcardIndexAt, tcardSlice, tcardTimeShown, tcardValueAt, tcardValues, tcardKept, tcardData, tcardStrip, tcardAttributes, tcardSource, tcardShownIn, tcardCommands, tcardModel, tcardLegendModel, tcardPinLegend, tcardState, tcardClock, tcardNumber, tcardEvery, tcardTimeTitle, telemetryTypes };')({ reactive: (x) => x });

const LIVE = { mode: 'live', at: -1, from: -Infinity, to: Infinity };

test('a time is found at or before it, never the nearest sample after it', () => {
    const ts = [1, 2, 3, 10];
    assert.deepEqual([0.5, 1, 2.9, 9.99, 10, 50, -1].map((t) => C.tcardIndexAt(ts, t)), [-1, 0, 1, 2, 3, 3, 3]);
    assert.deepEqual(C.tcardSlice(ts, 2, 3), [1, 3], 'both ends are in');
    assert.deepEqual(C.tcardSlice(ts, -Infinity, Infinity), [0, 4]);
    assert.deepEqual(C.tcardSlice(ts, 4, 9), [3, 3], 'nothing between');
});

test('the time shown is the one of the default time group: live, pointer, held, with its window', () => {
    const T = loadTeleplot();
    assert.deepEqual(C.tcardTimeShown(T, undefined), Object.assign({ group: undefined }, LIVE), 'no dashboard: live, everything');
    T.view.ensureGroup('D');
    assert.equal(C.tcardTimeShown(T, 'D').mode, 'live');
    T.view.groups.D.cursorTimestamp = 12;
    assert.deepEqual([C.tcardTimeShown(T, 'D').mode, C.tcardTimeShown(T, 'D').at], ['pointer', 12], 'live, the pointer on a chart');
    Object.assign(T.view.groups.D, { mode: 'held', at: 15, cursorTimestamp: 15, cursorActive: true, timestampFrom: 10, timestampTo: 20 });
    const held = C.tcardTimeShown(T, 'D');
    assert.deepEqual([held.mode, held.at, held.from, held.to], ['held', 15, 10, 20]);
    assert.deepEqual(C.tcardTimeTitle(held, {}), { title: 'At ' + C.tcardClock(15), tag: 'held' });
});

test('the value is the last sample at or before the time shown; before the first, it says so', () => {
    const T = loadTeleplot();
    for (const line of ['v:1000:1§V', 'v:2000:2', 'v:3000:3']) T.parseDataText(line);
    const telem = T.datastore.getTelemetry('v');
    assert.deepEqual([C.tcardValueAt(T, telem, LIVE).big, C.tcardValueAt(T, telem, LIVE).unit], ['3', 'V']);
    const at = (t) => C.tcardValueAt(T, telem, { mode: 'held', at: t, from: -Infinity, to: Infinity });
    assert.equal(at(2.9).big, '2', 'not the nearest (3 is closer)');
    assert.equal(at(2.9).sampleAt, 2);
    assert.equal(at(0.5).big, undefined);
    assert.match(at(0.5).note, /^No sample yet: the first came at /);
});

test('a state says since when it holds its text', () => {
    const T = loadTeleplot();
    for (const line of ['s:1000:idle|t', 's:2000:run|t', 's:3000:run|t', 's:4000:run|t']) T.parseDataText(line);
    const value = C.tcardValueAt(T, T.datastore.getTelemetry('s'), LIVE);
    assert.deepEqual([value.big, value.since, value.sampleAt], ['run', 2, 4]);
});

test('statistics are those of the window of the time shown', () => {
    const T = loadTeleplot();
    for (const [t, v] of [[1, 5], [2, 5], [3, 7], [4, 6.5], [5, 100]]) T.parseDataText('n:' + t * 1000 + ':' + v);
    const telem = T.datastore.getTelemetry('n');
    const rows = (time) => Object.fromEntries(C.tcardValues(T, telem, time).rows.map((r) => [r.k, r.v]));
    const all = rows(LIVE);
    assert.equal(all['Window'], 'all the data kept');
    assert.equal(all['Min · max'], '5 · 100');
    assert.equal(all['Changes'], '3 of 4');
    assert.equal(all['Step'], '0.5 (smallest change)');
    const window = rows({ mode: 'held', at: 3, from: 1.5, to: 4 });
    assert.equal(window['Min · max'], '5 · 7', 'the 100 is out of the window');
    assert.equal(window['Mean'], '6.167');
    assert.match(window['Samples'], /^3 · /);
    assert.equal(window['Rate'], 'every 1 s (1 Hz)');
});

test('the rate is the usual interval, and a long gap is told with its time', () => {
    const T = loadTeleplot();
    for (let i = 0; i < 50; i++) T.parseDataText('r:' + (i < 25 ? i * 100 : 10000 + i * 100) + ':' + i);
    const rows = Object.fromEntries(C.tcardValues(T, T.datastore.getTelemetry('r'), LIVE).rows.map((r) => [r.k, r.v]));
    assert.equal(rows['Rate'], 'every 100 ms (10 Hz)', 'not spoiled by the gap');
    assert.equal(rows['Longest gap'], '10.1 s at ' + C.tcardClock(2.4));
});

test('texts: how many different, changes, the most frequent; stacks: depth and when nothing runs', () => {
    const T = loadTeleplot();
    for (const [t, s] of [[1, 'a'], [2, 'a'], [3, 'b'], [4, 'a'], [5, 'c']]) T.parseDataText('x:' + t * 1000 + ':' + s + '|t');
    const rows = Object.fromEntries(C.tcardValues(T, T.datastore.getTelemetry('x'), LIVE).rows.map((r) => [r.k, r.v]));
    assert.equal(rows['Different'], '3 texts · 3 changes');
    assert.equal(rows['Most frequent'], 'a 60 % · b 20 % · c 20 %');
    for (const [t, s] of [[1, 'main/plan'], [2, ''], [3, 'main/plan/search'], [4, '']]) T.parseDataText('k:' + t * 1000 + ':' + s + '|stack');
    const stack = Object.fromEntries(C.tcardValues(T, T.datastore.getTelemetry('k'), LIVE).rows.map((r) => [r.k, r.v]));
    assert.equal(stack['Deepest'], '3 levels');
    assert.equal(stack['Nothing runs'], '50 % of the samples');
    assert.equal(C.tcardValueAt(T, T.datastore.getTelemetry('k'), { mode: 'held', at: 3.5, from: -Infinity, to: Infinity }).big, 'main › plan › search');
});

test('kept and data received: a row per data type, its strip cut at the gaps, a tick per sample when few', () => {
    const T = loadTeleplot();
    for (let i = 0; i < 100; i++) T.parseDataText('g:' + (i < 50 ? i * 10 : 5000 + i * 10) + ':' + i);
    T.parseDataText('TH|g:1000:hot>70');
    const telem = T.datastore.getTelemetry('g');
    const kept = C.tcardKept(T, telem);
    assert.equal(kept.rows[0].v, '100');
    const data = C.tcardData(T, telem, { mode: 'held', at: 2.995, from: -Infinity, to: Infinity }, kept);
    assert.deepEqual(data.rows.map((r) => r.label), ['Number', 'Thresholds']);
    assert.equal(data.rows[0].pieces.length, 2, 'cut at the gap of 5 s');
    assert.equal(data.rows[0].ticks.length, 0);
    assert.equal(data.rows[1].ticks.length, 1, 'one threshold: one tick');
    assert.ok(Math.abs(data.rows[0].mark - 0.5) < 0.01, 'the time shown is in the middle');
});

test('the strips span the window of the time shown (the zoom), else all the time kept', () => {
    const T = loadTeleplot();
    for (let i = 0; i <= 1000; i++) T.parseDataText('z:' + i * 10 + ':' + i);
    const telem = T.datastore.getTelemetry('z'), kept = C.tcardKept(T, telem);
    const zoomed = C.tcardData(T, telem, { mode: 'held', at: 6, from: 5, to: 7 }, kept).rows[0];
    assert.deepEqual(zoomed.pieces, [[0, 1]], 'the samples fill the zoom');
    assert.equal(zoomed.mark, 0.5);
    assert.equal(zoomed.count, '1\u202F001', 'the count stays what is kept');
    const whole = C.tcardData(T, telem, { mode: 'held', at: 6, from: -Infinity, to: Infinity }, kept).rows[0];
    assert.ok(Math.abs(whole.mark - 0.6) < 1e-9);
    const late = C.tcardData(T, telem, { mode: 'held', at: 12, from: 9, to: 13 }, kept).rows[0];
    assert.deepEqual(late.pieces, [[0, 0.25]], 'no sample after 10 s');
});

test('attributes are written in the words of the protocol, with what could be set', () => {
    const T = loadTeleplot();
    T.parseDataText('ATTR|a|min=0|max=5|desc=Battery voltage');
    T.parseDataText('a,Power:1000:3.2§V');
    const attrs = C.tcardAttributes(T, T.datastore.getTelemetry('a'), LIVE);
    assert.deepEqual(attrs.rows.map((r) => r.k + '=' + r.v), ['unit=V', 'label=Power', 'desc=Battery voltage', 'min · max=0 · 5']);
    assert.deepEqual(attrs.notSet, ['thresholds']);
    T.parseDataText('b:1000:1');
    assert.deepEqual(C.tcardAttributes(T, T.datastore.getTelemetry('b'), LIVE).notSet, ['desc', 'label', 'unit', 'min / max', 'thresholds']);
});

test('the source says how the page knows a telemetry, and when another one has its name', () => {
    const T = loadTeleplot();
    T.parseDataText('a:1000:1');
    const rows = C.tcardSource(T, T.datastore.getTelemetry('a')).rows;
    assert.deepEqual(rows.map((r) => r.k + '=' + r.v), ['Known by=its name (text)', 'Came from=a file']);
    const twin = T.datastore.addTelemetry(4242);
    twin.setAttribute(T.protocol.TELEM_ATTR_NAME, 'a');
    twin.clientId = 7;
    const source = C.tcardSource(T, T.datastore.getTelemetry('a'));
    assert.equal(source.warn, true);
    assert.match(source.rows.at(-1).v, /^1 other telemetry is named a \(client 7\)$/);
});

test('the card model keeps its statistics for a second, the time shown moves at once', () => {
    const T = loadTeleplot();
    for (let i = 1; i <= 5; i++) T.parseDataText('m:' + i * 1000 + ':' + i);
    const telem = T.datastore.getTelemetry('m');
    const first = C.tcardModel(T, telem, LIVE, undefined, 10000);
    T.parseDataText('m:6000:60');
    const soon = C.tcardModel(T, telem, LIVE, first, 10500);
    assert.equal(soon.value.big, '60', 'the value follows');
    assert.equal(soon.values, first.values, 'statistics kept');
    const later = C.tcardModel(T, telem, LIVE, soon, 11100);
    assert.notEqual(later.values, first.values);
    assert.match(later.values.summary, /^1 → 60/);
    const held = C.tcardModel(T, telem, { mode: 'held', at: 2, from: 1, to: 3 }, later, 11200);
    assert.match(held.values.summary, /^1 → 3/, 'a held window is a new question');
});

test('numbers and times are written for people', () => {
    assert.deepEqual([3, 54.6491, 0.123456, 1234.5678, 1e-7].map(C.tcardNumber), ['3', '54.649', '0.1235', '1234.57', '1e-7']);
    assert.equal(C.tcardClock(750.25, 2), '0:12:30.25', 'a device that counts from its start');
    assert.equal(C.tcardEvery(0.0331), 'every 33.1 ms (30.2 Hz)');
    assert.equal(C.tcardEvery(5.6), 'every 5.6 s');
});

test('a pinned legend: one window per view, named after the view and its dashboard, with the rows of a scene', () => {
    const T = loadTeleplot();
    const view = { id: 'v1', name: '3d', options: { title: 'Arm' }, divId: 'nowhere', hidden: { 2: true },
        state: { legend: [{ id: 1, name: 'hand', value: '0.1, 0.2, 0', color: 'red' }, { id: 2, name: 'elbow', unit: 'm', color: 'blue' }] } };
    const model = C.tcardLegendModel(T, view);
    assert.deepEqual([model.name, model.badge, model.sub, model.isChart], ['Arm', '3D', '3D view', false]);
    assert.deepEqual(model.rows.map((r) => [r.name, r.value, r.hidden]), [['hand', '0.1, 0.2, 0', false], ['elbow', '', true]]);
    assert.equal(C.tcardLegendModel(T, { id: 'c', name: 'chart', options: {} }).name, 'Chart', 'no title: its kind');
    C.tcardState.pinned.splice(0);
    C.tcardPinLegend('v1', { left: 50, top: 70, width: 300, height: 200 });
    C.tcardPinLegend('v1', { left: 400, top: 70, width: 300, height: 200 });
    assert.equal(C.tcardState.pinned.length, 1, 'pinned again: the same window, to the front');
    assert.deepEqual([C.tcardState.pinned[0].kind, C.tcardState.pinned[0].x, C.tcardState.pinned[0].y], ['legend', 50, 70], 'where the list was');
});
