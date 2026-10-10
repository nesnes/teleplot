// 111-viewChart and 110-viewCurrentValue (data side: what is given to the chart / displayed), without DOM
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');

const NUMBER = 20;
function setup(names = ['a']) {
    const T = loadTeleplot();
    const telems = names.map(n => T.datastore.getOrCreateTelemetry(n));
    const chart = new T.view.ViewChart('chart-div', names);
    chart.chart = new T.uPlot({}, [], null); // stand-in for the created uPlot (no DOM here)
    return { T, telems, chart };
}
function fill(telem, count, step = 0.001, f = i => Math.sin(i / 10)) {
    const t = [], v = [];
    for (let i = 0; i < count; i++) { t.push(1 + i * step); v.push(f(i)); }
    telem.addData(NUMBER, t, [v]);
}

test('small data goes to the chart as is: [timestamps, values]', () => {
    const { telems, chart } = setup();
    telems[0].addData(NUMBER, [1, 2, 3], [[10, 20, 30]]);
    chart.update();
    assert.deepEqual(chart.chartData, [[1, 2, 3], [10, 20, 30]]);
    assert.equal(chart.chart.setDataCalls, 1);
});

test('large data is decimated, stored data is untouched, extent is kept', () => {
    const { telems, chart } = setup();
    fill(telems[0], 100000);
    chart.update();
    const [xs, ys] = chart.chartData;
    assert.ok(xs.length < 1000, `got ${xs.length} points`);
    assert.equal(telems[0].data[NUMBER].timestamps.length, 100000);
    assert.equal(xs[0], telems[0].data[NUMBER].timestamps[0]);
    assert.equal(xs.at(-1), telems[0].data[NUMBER].timestamps.at(-1));
    assert.equal(xs.length, ys.length);
});

test('a telemetry that gets data after the chart was created gets a series (chart is rebuilt once)', () => {
    const T = loadTeleplot();
    const chart = new T.view.ViewChart('chart-div', ['late', 'early']);
    let created = 0;
    chart.createChart = () => { created++; chart.seriesKey = chart.getSeriesTelemetries().map(t => t.id).join(); chart.chart = new T.uPlot({}, [], null); };
    T.datastore.getOrCreateTelemetry('early').addData(NUMBER, [1], [[1]]);
    chart.createChart(); // as init() does: only 'early' has data yet
    assert.equal(chart.getSeriesTelemetries().length, 1);
    chart.update();
    assert.equal(created, 1);
    T.datastore.getOrCreateTelemetry('late').addData(NUMBER, [1], [[2]]);
    chart.update();
    assert.equal(created, 2);
    assert.equal(chart.getSeriesTelemetries().length, 2);
    chart.update();
    assert.equal(created, 2); // nothing changed: no rebuild
    assert.equal(chart.chartData.length, 3);
});

test('decimation can be disabled', () => {
    const { telems, chart } = setup();
    chart.setOption('decimation', false);
    fill(telems[0], 5000);
    chart.update();
    assert.equal(chart.chartData[0].length, 5000);
});

test('several series share one chart, joined on a common time axis', () => {
    const { telems, chart } = setup(['a', 'b']);
    telems[0].addData(NUMBER, [1, 2], [[10, 20]]);
    telems[1].addData(NUMBER, [2, 3], [[200, 300]]);
    chart.update();
    assert.deepEqual(chart.chartData, [[1, 2, 3], [10, 20, null], [null, 200, 300]]);
});

test('chart is only updated when data, range or cursor changed', () => {
    const { telems, chart } = setup();
    telems[0].addData(NUMBER, [1, 2], [[1, 2]]);
    chart.update();
    chart.update();
    assert.equal(chart.chart.setDataCalls, 1, 'nothing changed');
    telems[0].addData(NUMBER, [3], [[3]]);
    telems[0].data[NUMBER].lastUpdate++; // Date.now() can be the same millisecond in a test
    chart.update();
    assert.equal(chart.chart.setDataCalls, 2);
    assert.deepEqual(chart.chartData[0], [1, 2, 3]);
});

test('zoomed range is applied to the chart and limits decimation to it', () => {
    const { T, telems, chart } = setup();
    fill(telems[0], 100000); // 1..101 s
    Object.assign(T.view.groups.default, { cursorActive: true, timestampFrom: 10, timestampTo: 11 });
    chart.update();
    assert.deepEqual(chart.chart.scales.x, { min: 10, max: 11 });
    const xs = chart.chartData[0];
    assert.ok(xs.length < 1000);
    assert.ok(xs.filter(x => x >= 10 && x <= 11).length > 50, 'visible range has detail');
});

test('telemetries without supported data (text, unknown) are ignored by the chart', () => {
    const { T, telems, chart } = setup(['a', 'text', 'ghost']);
    telems[0].addData(NUMBER, [1], [[5]]);
    telems[1].addData(23, [1], [['hello']]);
    chart.update();
    assert.deepEqual(chart.chartData, [[1], [5]]);
    assert.equal(chart.telemetries[telems[1].id].actualStrValue.length, 0);
    assert.ok(T.datastore.getTelemetry('ghost'));
});

test('legend data: name, unit, color, formatted value; value follows the cursor', () => {
    const { T, telems, chart } = setup(['a', 'b']);
    telems[0].setAttribute(T.protocol.TELEM_ATTR_UNIT, 'V');
    telems[1].setAttribute(T.protocol.TELEM_ATTR_COLOR, 'rgb(1,2,3)');
    telems[0].addData(NUMBER, [1, 2], [[1.23456, 2.5]]);
    telems[1].addData(NUMBER, [1, 2], [[7, 8]]);
    chart.update();
    const a = chart.telemetries[telems[0].id], b = chart.telemetries[telems[1].id];
    assert.deepEqual([a.name, a.unit], ['a', 'V']);
    assert.deepEqual(a.actualStrValue, ['2.5']);
    assert.equal(b.color, 'rgb(1,2,3)');
    assert.equal(a.color, T.colors.getColor(1).toStrRGB());
    T.view.groups.default.cursorTimestamp = 1;
    chart.update();
    assert.deepEqual(a.actualValue, [1.23456]);
    assert.deepEqual(a.actualStrValue, ['1.235']); // 3 decimals by default
    chart.setOption('displayNumberDecimals', 1, 'a');
    T.view.groups.default.cursorTimestamp = 1.0001; // forces an update
    chart.update();
    assert.deepEqual(a.actualStrValue, ['1.2']);
});

test('legend value slots only grow, so entries do not shake as values change', () => {
    const { T, telems, chart } = setup(['a']);
    telems[0].addData(NUMBER, [1], [[1234.5]]);
    chart.update();
    const a = chart.telemetries[telems[0].id];
    assert.equal(a.valueChars, 7);
    telems[0].addData(NUMBER, [2], [[7]]);
    chart.update();
    assert.deepEqual(a.actualStrValue, ['7']);
    assert.equal(a.valueChars, 7); // narrower value, same slot
    telems[0].addData(NUMBER, [3], [[-1234567.25]]);
    chart.update();
    assert.equal(a.valueChars, 13); // wider value, slot grows
});

test('series can be switched off from the legend: shown flag follows, hidden state is shared with the list', () => {
    const { telems, chart } = setup(['a', 'b']);
    telems[0].addData(NUMBER, [1], [[1]]);
    telems[1].addData(NUMBER, [1], [[2]]);
    chart.update();
    const calls = [];
    chart.chart = { setSeries: (i, o) => calls.push([i, o]), batch: (f) => f(), destroy() {} };
    const idB = telems[1].id;
    chart.toggleSeries(idB);
    assert.equal(chart.hidden[idB], true);
    assert.deepEqual(calls, [[2, { show: false }], [null, { focus: false }]]); // switched off: no highlight left behind
    calls.length = 0;
    chart.toggleSeries(idB);
    assert.ok(!chart.hidden[idB]);
    assert.deepEqual(calls, [[2, { show: true }], [2, { focus: true }]]);
    calls.length = 0;
    chart.highlightSeries(idB);
    assert.deepEqual(calls.pop(), [2, { focus: true }]);
    chart.highlightSeries(undefined);
    assert.deepEqual(calls.pop(), [null, { focus: false }]);
    chart.toggleSeries(idB);
    chart.highlightSeries(idB); // switched off: nothing to highlight
    assert.deepEqual(calls.pop(), [null, { focus: false }]);
});

test('current value rows can be made interactive (handlers, dimmed rows)', () => {
    const T = loadTeleplot();
    const view = new T.view.ViewCurrentValue('v', []);
    assert.deepEqual(view.rowHandlers, {});
    assert.deepEqual(view.dimmed, {});
});

test('current value view: latest value, decimals, image data URI', () => {
    const T = loadTeleplot();
    const n = T.datastore.getOrCreateTelemetry('n'), img = T.datastore.getOrCreateTelemetry('img');
    n.addData(NUMBER, [1, 2], [[1, 3.14159]]);
    img.addData(24, [1], [[1], ['QUJD']]); // PNG, base64
    const view = new T.view.ViewCurrentValue('v', ['n', 'img']);
    view.update();
    assert.deepEqual(view.telemetries[n.id].data[NUMBER].lastDisplayValue, ['3.142']);
    assert.equal(view.telemetries[n.id].data[NUMBER].timestamp, 2);
    assert.deepEqual(view.telemetries[img.id].data[24].lastDisplayValue[1], 'data:image/png;base64,QUJD');
    view.setOption('displayNumberDecimals', 0, 'n');
    view.update();
    assert.deepEqual(view.telemetries[n.id].data[NUMBER].lastDisplayValue, ['3']);
});

test('a chart that is not mounted yet (no uPlot) or has no data does not throw (regression: hidden stack views broke every update)', () => {
    const T = loadTeleplot();
    T.datastore.getOrCreateTelemetry('a').addData(20, [1, 2], [[1, 2]]);
    const unmounted = new T.view.ViewChart('x', ['a']);   // chart is {} until init() creates uPlot
    const empty = new T.view.ViewChart('y', ['ghost']);
    assert.doesNotThrow(() => { unmounted.update(); empty.update(); });
    assert.deepEqual(unmounted.chartData, [[1, 2], [1, 2]]);
    assert.deepEqual(empty.chartData, [[]]);
});

test('charts the pointer is not on follow the cursor of the group (vertical line, hidden without cursor or out of range)', () => {
    const { T, chart } = setup(['a']);
    const calls = [];
    chart.chart = { cursor: { left: -10 }, scales: { x: { min: 10, max: 20 } }, valToPos: (v) => (v - 10) * 10, setCursor: (o, fire) => { calls.push([o.left, o.top, fire]); chart.chart.cursor.left = o.left; } };
    T.view.groups.default.cursorTimestamp = 15;
    chart.syncCursor();
    assert.deepEqual(calls.pop(), [50, -10, false]);
    chart.syncCursor();
    assert.equal(calls.length, 0); // already there: nothing to do
    T.view.groups.default.cursorTimestamp = 25; // outside of this chart's range
    chart.syncCursor();
    assert.deepEqual(calls.pop(), [-10, -10, false]);
    T.view.groups.default.cursorTimestamp = 15;
    chart.pointerInside = true; // the pointer is on this chart: it owns the cursor
    chart.syncCursor();
    assert.equal(calls.length, 0);
});

test('views display telemetries in the order of their list, and drop the ones removed from it', () => {
    const T = loadTeleplot();
    const [a, b, c] = ['a', 'b', 'c'].map((n) => { const t = T.datastore.getOrCreateTelemetry(n); t.addData(NUMBER, [1], [[1]]); return t; });
    for (const view of [new T.view.ViewCurrentValue('v', ['a', 'b', 'c']), new T.view.ViewChart('c', ['a', 'b', 'c'])]) {
        view.update();
        assert.deepEqual(Array.from(view.displayOrder), [a.id, b.id, c.id]);
        view.moveTelemetry(0, 2);
        view.update();
        assert.deepEqual(Array.from(view.displayOrder), [b.id, c.id, a.id]);
        view.removeTelemetry('c');
        view.update();
        assert.deepEqual(Array.from(view.displayOrder), [b.id, a.id]);
        assert.equal(view.telemetries[c.id], undefined);
    }
});

test('a chart knows up to when its series were thinned out (to mark that part)', () => {
    const T = loadTeleplot();
    const ts = Array.from({ length: 200 }, (_, i) => i);
    T.datastore.addTelemetry('a').addData(20, ts, [ts.slice()]);
    T.datastore.addTelemetry('b').addData(20, ts, [ts.slice()]);
    const chart = new T.view.ViewChart('', ['a', 'b', 'missing']);
    assert.equal(chart.getThinnedBefore(), 0);
    T.datastore.getTelemetry('b').thinOldest(0.5);
    assert.equal(chart.getThinnedBefore(), 99);
    T.datastore.getTelemetry('a').thinOldest(0.25);
    assert.equal(chart.getThinnedBefore(), 99, 'the series thinned the furthest');
    // nothing is drawn when the thinned part is before what the chart shows (and a chart without canvas does not fail)
    chart.drawThinned({ ctx: null });
    chart.drawThinned({ ctx: {}, bbox: {}, scales: { x: { min: 150, max: 199 } } });
});

test('decimators are never proxied by a reactive UI framework (webapp: a proxied one rescans all the data on every update)', () => {
    const T = loadTeleplot();
    const chart = new T.view.ViewChart('chart-raw', []);
    assert.equal(chart.decimators.__v_skip, true); // Vue's "do not proxy" flag
});
