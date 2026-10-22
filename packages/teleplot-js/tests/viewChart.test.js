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

test('telemetries without a series (text, positions, unknown) take no place in the data of the chart', () => {
    const { T, telems, chart } = setup(['a', 'text', 'ghost', 'xy']);
    telems[0].addData(NUMBER, [1], [[5]]);
    telems[1].addData(23, [1], [['hello']]);
    telems[3].addData(21, [1], [[1], [2]]);
    chart.update();
    assert.deepEqual(chart.chartData, [[1], [5]]);
    assert.deepEqual(chart.getSeriesTelemetries().map(t => t.id), [telems[0].id]);
    assert.equal(chart.telemetries[telems[3].id].actualStrValue.length, 0, 'what the chart cannot show has no value in the legend');
    assert.ok(!chart.telemetries[telems[3].id].isMarks);
    assert.ok(T.datastore.getTelemetry('ghost'));
});

const TEXT = 23, THRESHOLD = 40;
const marksOf = (chart, telem) => (chart.overlay.marks.find(m => m.id === telem.id) || { marks: [] }).marks.map(m => [m.t, m.text, m.count]);

test('a text telemetry in a chart is drawn as marks: a log gives one per line, a state one where it changes', () => {
    const { T, telems, chart } = setup(['a', 'state', 'events']);
    telems[0].addData(NUMBER, [0, 100], [[1, 2]]);
    telems[1].addData(TEXT, [10, 20, 30, 40, 50, 60, 70], [['idle', 'idle', 'moving', '', '', 'moving', 'idle']]);
    telems[2].setAttribute(T.protocol.TELEM_ATTR_LOG, true);
    telems[2].addData(TEXT, [15, 25, 90], [['armed', 'armed', '']]);
    chart.update();
    assert.deepEqual(chart.chartData, [[0, 100], [1, 2]], 'no series for them');
    assert.deepEqual(marksOf(chart, telems[1]), [[10, 'idle', 1], [30, 'moving', 1], [60, 'moving', 1], [70, 'idle', 1]], 'the same state again is no mark, an empty one neither (but what follows it is a change)');
    assert.deepEqual(marksOf(chart, telems[2]), [[15, 'armed', 1], [25, 'armed', 1]], 'every line of a log, but the empty ones');
    assert.deepEqual(chart.getMarkTelemetries().map(t => t.id), [telems[1].id, telems[2].id]);
    // Its legend entry: flagged as marks, and tells the text at the cursor (the last one at or before it)
    const legend = chart.telemetries[telems[1].id];
    assert.deepEqual([legend.isMarks, legend.actualStrValue], [true, ['idle']]);
    T.view.groups.default.cursorTimestamp = 35;
    chart.update();
    assert.deepEqual(legend.actualStrValue, ['moving']);
    T.view.groups.default.cursorTimestamp = 45;
    chart.update();
    assert.deepEqual(legend.actualStrValue, [''], 'an empty state');
    T.view.groups.default.cursorTimestamp = 5;
    chart.update();
    assert.deepEqual(legend.actualStrValue, [''], 'before the first sample');
    T.view.groups.default.cursorTimestamp = -1;
    // A long text does not take the whole legend
    telems[1].addData(TEXT, [80], [['x'.repeat(100)]]);
    chart.update();
    assert.deepEqual([legend.actualStrValue[0].length, legend.actualValue[0].length], [24, 100]);
    // A chart that only has texts has nothing to draw them on, and says so
    const lonely = new T.view.ViewChart('l', ['state']);
    assert.deepEqual([lonely.getEmptyState().text, chart.getEmptyState().text], ['No number to chart', '']);
    assert.deepEqual(chart.acceptedDataTypes, ['20', '23']);
    // New marks are drawn: the chart is given its data again
    const calls = chart.chart.setDataCalls;
    chart.update();
    assert.equal(chart.chart.setDataCalls, calls, 'nothing changed: nothing drawn again');
    telems[2].addData(TEXT, [95], [['landed']]);
    chart.update();
    assert.equal(chart.chart.setDataCalls, calls + 1);
    assert.deepEqual(marksOf(chart, telems[2]).at(-1), [95, 'landed', 1]);
    // Switched off from the legend: no marks; back on: they are back
    chart.toggleSeries(telems[2].id);
    chart.update();
    assert.deepEqual(marksOf(chart, telems[2]), []);
    chart.toggleSeries(telems[2].id);
    chart.update();
    assert.equal(marksOf(chart, telems[2]).length, 3);
});

test('marks widen the period of a live chart: a text that comes after the last number (or before the first) is shown', () => {
    const { T, telems, chart } = setup(['a', 'state']);
    telems[0].addData(NUMBER, [100, 200], [[1, 2]]);
    chart.update();
    assert.deepEqual([chart.getDisplayRange().widened, chart.chart.scales.x], [undefined, undefined], 'numbers only: uPlot takes their extent');
    telems[1].addData(TEXT, [250], [['turning']]);
    chart.update();
    assert.deepEqual([chart.getDisplayRange().from, chart.getDisplayRange().to], [100, 256]);
    assert.deepEqual(chart.chart.scales.x, { min: 100, max: 256 }, 'the chart goes as far as the mark, with 4 % of room after it (on the edge it would not be seen)');
    assert.deepEqual(marksOf(chart, telems[1]), [[250, 'turning', 1]], 'and the mark is drawn');
    telems[1].addData(TEXT, [50], [['parked']]);
    chart.update();
    assert.deepEqual(chart.chart.scales.x, { min: 50, max: 258 }, 'a mark before the first number too');
    // A state kept from before the data window does not stretch the period back
    T.state.dataTimeout = 120;
    chart.update();
    assert.deepEqual(chart.chart.scales.x, { min: 100, max: 256 }, 'the numbers start within the window: from them');
    telems[0].addData(NUMBER, [300], [[3]]);
    chart.update();
    assert.deepEqual([chart.getDisplayRange().widened, chart.getDisplayRange().to], [undefined, 300], 'a number after the marks: no room, uPlot takes the extent again');
    T.state.dataTimeout = 0;
    // Zoomed: the zoom decides
    Object.assign(T.view.groups.default, { cursorActive: true, timestampFrom: 120, timestampTo: 180 });
    chart.update();
    assert.deepEqual(chart.chart.scales.x, { min: 120, max: 180 });
    T.view.backToLive();
    // A chart with marks only says it has no number to chart (nothing widened)
    assert.equal(new T.view.ViewChart('l', ['state']).getDisplayRange().widened, undefined);
});

test('marks: only those of the period displayed, the state before it tells what a change is, close ones are folded and counted', () => {
    const T = loadTeleplot();
    const build = T.view.ViewChart.buildMarks;
    const entry = { timestamps: [1, 2, 3, 4, 5, 6], data: [['a', 'b', 'b', 'c', 'a', 'a']] };
    const list = (...args) => build(entry, ...args).map(m => m.t + m.text + (m.count > 1 ? 'x' + m.count : ''));
    assert.deepEqual(list(false, 0, 10), ['1a', '2b', '4c', '5a']);
    assert.deepEqual(list(true, 0, 10), ['1a', '2b', '3b', '4c', '5a', '6a']);
    assert.deepEqual(list(false, 3, 4.5), ['4c'], 'b was already the state before the period');
    assert.deepEqual(list(false, 2, 2), ['2b'], 'limits included');
    assert.deepEqual(list(true, 3, 4.5), ['3b', '4c']);
    assert.deepEqual(list(false, 7, 10), []);
    assert.deepEqual(list(true, 0, 10, 2.5), ['1ax3', '4cx3'], 'within 2.5 s of the first of the group');
    assert.deepEqual(list(false, 0, 10, 100), ['1ax4']);
    assert.deepEqual(build({ timestamps: [], data: [[]] }, true, 0, 10), []);
    // In a chart, the gap is a few pixels of the period displayed
    const chart = new T.view.ViewChart('c', ['a', 'log']);
    const a = T.datastore.getOrCreateTelemetry('a'), log = T.datastore.getOrCreateTelemetry('log');
    log.setAttribute(T.protocol.TELEM_ATTR_LOG, true);
    a.addData(NUMBER, [0, 1000], [[0, 1]]);
    log.addData(TEXT, Array.from({ length: 1001 }, (v, i) => i), [Array.from({ length: 1001 }, (v, i) => 'line ' + i)]);
    chart.update();
    const marks = chart.overlay.marks[0].marks;
    assert.ok(marks.length > 5 && marks.length <= 200 / T.view.ViewChart.MARK_GAP + 1, marks.length + ' marks for the 200 pixels of a chart that is not on a page');
    assert.equal(marks.reduce((n, m) => n + m.count, 0), 1001, 'every line is counted');
    T.view.groups.default.timestampFrom = 100; T.view.groups.default.timestampTo = 110; T.view.groups.default.cursorActive = true;
    chart.update();
    assert.deepEqual(chart.overlay.marks[0].marks.map(m => m.t), [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110], 'zoomed: each line has its mark');
});

test('thresholds of the series: steps over the period, kept in view by the scale, hidden with their series or by the option', () => {
    const { T, telems, chart } = setup(['a', 'b']);
    const P = T.protocol;
    telems[0].addData(NUMBER, [0, 50, 100], [[10, 12, 11]]);
    telems[1].addData(NUMBER, [0, 100], [[1, 2]]);
    telems[0].addData(THRESHOLD, [0, 0, 60], [[P.THRESHOLD_ABOVE, P.THRESHOLD_BELOW, P.THRESHOLD_ABOVE], [20, 5, 25], ['high', 'low', 'high'], ['', 'red', '']]);
    chart.update();
    assert.deepEqual(chart.overlay.thresholds.map(t => [t.id, t.lines.map(l => [l.name, l.operator, l.color, l.steps.map(s => [s.from, s.to, s.value])])]),
        [[telems[0].id, [['high', P.THRESHOLD_ABOVE, '', [[0, 60, 20], [60, 100, 25]]], ['low', P.THRESHOLD_BELOW, 'red', [[0, 100, 5]]]]]]);
    assert.deepEqual(chart.chartData, [[0, 50, 100], [10, 12, 11], [1, null, 2]], 'thresholds are not series');
    // Scale: what uPlot found in the series, widened to the thresholds ("fit", the default)
    assert.deepEqual(chart.getScaleRange(1, 12), [1, 25]);
    assert.deepEqual(chart.getScaleRange(null, null), [5, 25]);
    chart.setOption('thresholds', 'show');
    chart.update();
    assert.deepEqual(chart.getScaleRange(1, 12), [1, 12]);
    assert.equal(chart.overlay.thresholds.length, 1, 'still drawn');
    chart.setOption('thresholds', 'hide');
    chart.update();
    assert.deepEqual([chart.overlay.thresholds, chart.getScaleRange(null, null)], [[], [0, 1]]);
    chart.setOption('thresholds', 'fit');
    chart.toggleSeries(telems[0].id);
    chart.update();
    assert.deepEqual(chart.overlay.thresholds, [], 'the thresholds of a series go with it');
    chart.toggleSeries(telems[0].id);
    // The limit changes: drawn again
    chart.update();
    const calls = chart.chart.setDataCalls;
    telems[0].addData(THRESHOLD, [90], [[P.THRESHOLD_ABOVE], [30], ['high'], ['']]);
    chart.update();
    assert.equal(chart.chart.setDataCalls, calls + 1);
    assert.deepEqual(chart.overlay.thresholds[0].lines[0].steps.at(-1), { from: 90, to: 100, value: 30 });
    // Legend: the entry tells the threshold its value is past, at the cursor
    assert.deepEqual([chart.telemetries[telems[0].id].status, chart.telemetries[telems[1].id].status], ['', '']);
    telems[0].addData(NUMBER, [101], [[3]]);
    chart.update();
    assert.deepEqual([chart.telemetries[telems[0].id].status, chart.telemetries[telems[0].id].statusColor], ['low', 'red']);
    T.view.groups.default.cursorTimestamp = 50;
    chart.update();
    assert.equal(chart.telemetries[telems[0].id].status, '');
    assert.ok(chart.getOptionsSchema().some(o => o.key === 'thresholds' && o.type === 'choice') && chart.getOptionsSchema().some(o => o.key === 'scale'));
});

test('scale option "range": the range of the telemetries is the scale, on the sides they give', () => {
    const { T, telems, chart } = setup(['a', 'b']);
    telems[0].addData(NUMBER, [0, 1], [[10, 12]]);
    telems[1].addData(NUMBER, [0, 1], [[1, 2]]);
    chart.update();
    telems[0].setAttribute(T.protocol.TELEM_ATTR_RANGE, { min: 0, max: 20 });
    assert.deepEqual(chart.getScaleRange(1, 12), [1, 12], 'not asked for: the scale fits the data');
    chart.setOption('scale', 'range');
    assert.deepEqual(chart.getSeriesRange(), { min: 0, max: 20 });
    assert.deepEqual(chart.getScaleRange(1, 12), [0, 20]);
    assert.deepEqual(chart.getScaleRange(null, null), [0, 20]);
    const calls = chart.chart.setDataCalls;
    chart.update();
    assert.equal(chart.chart.setDataCalls, calls + 1, 'drawn again with the new scale');
    telems[1].setAttribute(T.protocol.TELEM_ATTR_RANGE, { min: -5, max: undefined });
    assert.deepEqual(chart.getSeriesRange(), { min: -5, max: 20 }, 'what the ranges cover together');
    telems[0].setAttribute(T.protocol.TELEM_ATTR_RANGE, undefined);
    assert.deepEqual(chart.getScaleRange(1, 12), [-5, 12], 'one side given: the other fits the data');
    assert.deepEqual(chart.getScaleRange(-9, -7), [-9, -7], 'a side that would turn the scale over is left out');
    chart.toggleSeries(telems[1].id);
    assert.equal(chart.getSeriesRange(), undefined, 'a hidden series does not count');
});

test('current value: a number with a range gets a bar, one with thresholds tells which one it is past', () => {
    const T = loadTeleplot();
    const P = T.protocol, gauge = T.view.ViewCurrentValue.gauge;
    const battery = T.datastore.getOrCreateTelemetry('battery'), plain = T.datastore.getOrCreateTelemetry('plain'), state = T.datastore.getOrCreateTelemetry('state');
    battery.addData(NUMBER, [1, 2, 3], [[12, 10.2, 9.5]]);
    plain.addData(NUMBER, [1], [[1]]);
    state.addData(TEXT, [1], [['on']]);
    const view = new T.view.ViewCurrentValue('v', ['battery', 'plain', 'state']);
    view.update();
    assert.deepEqual([view.telemetries[battery.id].bar, view.telemetries[battery.id].status], [undefined, undefined]);
    assert.equal(gauge(plain, 1), T.view.ViewCurrentValue.NO_GAUGE);
    battery.setAttribute(P.TELEM_ATTR_RANGE, { min: 9, max: 13 });
    battery.addData(THRESHOLD, [0, 0, 0], [[P.THRESHOLD_BELOW, P.THRESHOLD_BELOW, P.THRESHOLD_ABOVE], [10.5, 9.9, 14], ['low', 'empty', 'over'], ['', 'red', '']]);
    view.update();
    assert.deepEqual(view.telemetries[battery.id].status, { name: 'empty', color: 'red' });
    assert.deepEqual(view.telemetries[battery.id].bar, { fill: 0.125, min: 9, max: 13, ticks: [{ at: 0.2250000000000001, name: 'empty', color: 'red' }, { at: 0.375, name: 'low', color: '' }] }, 'the thresholds inside the range are ticks');
    assert.equal(view.telemetries[plain.id].bar, undefined);
    assert.equal(view.telemetries[state.id].status, undefined);
    // At the cursor: the value and the limits of that time
    T.view.groups.default.cursorTimestamp = 2;
    view.update();
    assert.deepEqual([view.telemetries[battery.id].status.name, view.telemetries[battery.id].bar.fill], ['low', (10.2 - 9) / 4]);
    T.view.groups.default.cursorTimestamp = 1;
    view.update();
    assert.deepEqual([view.telemetries[battery.id].status, view.telemetries[battery.id].bar.fill], [undefined, 0.75]);
    T.view.groups.default.cursorTimestamp = -1;
    // Out of the range: the bar is full or empty, never more; a range with one end or upside down gives no bar
    assert.deepEqual([gauge(battery, 20).bar.fill, gauge(battery, -5).bar.fill, gauge(battery, undefined).bar.fill, gauge(battery, NaN).status], [1, 0, 0, undefined]);
    battery.setAttribute(P.TELEM_ATTR_RANGE, { min: 9, max: undefined });
    assert.equal(gauge(battery, 12).bar, undefined);
    battery.setAttribute(P.TELEM_ATTR_RANGE, { min: 13, max: 9 });
    assert.equal(gauge(battery, 12).bar, undefined);
    assert.equal(gauge(battery, 9.5).status.name, 'empty', 'the status needs no range');
    // A telemetry that only has thresholds yet shows as "no data", not as a value
    const waiting = T.datastore.getOrCreateTelemetry('waiting');
    waiting.addData(THRESHOLD, [0], [[0], [1], ['low'], ['']]);
    view.addTelemetry('waiting');
    view.update();
    assert.deepEqual([view.telemetries[waiting.id].empty, Object.keys(view.telemetries[waiting.id].data)], [true, []]);
    assert.equal(view.telemetries[battery.id].empty, false);
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

test('a zoom stays when the pointer leaves the chart, and is reset when the chart goes back to all its data (double click)', () => {
    const T = loadTeleplot();
    const chart = new T.view.ViewChart('chart-zoom', []);
    chart.createChart();
    const group = T.view.groups[chart.group];
    const hooks = chart.chartOptions.hooks;
    const u = { data: [[10, 11, 12, 13, 14]], scales: { x: { min: 11, max: 12 } }, cursor: { left: 40 }, posToIdx: () => 1, posToVal: () => 11.2 };
    hooks.setScale[0](u, 'x');
    assert.deepEqual([group.cursorActive, group.timestampFrom, group.timestampTo], [true, 11, 12]);
    hooks.setCursor[0](u);
    assert.equal(group.cursorTimestamp, 11, 'the sample under the pointer');
    hooks.setCursor[0](Object.assign({}, u, { posToIdx: () => 4, posToVal: () => 16.5 }));
    assert.equal(group.cursorTimestamp, 16.5, 'beyond the last number (where marks widened the chart): the time pointed at');
    hooks.setCursor[0](u);
    u.cursor.left = -10; // The pointer leaves
    hooks.setCursor[0](u);
    assert.equal(group.cursorActive, true, 'still zoomed');
    assert.equal(group.cursorTimestamp, 11, 'the views of the group stay on the last moment pointed at');
    u.scales.x = { min: 10, max: 14 }; // Double click: back to the extent of the data
    hooks.setScale[0](u, 'x');
    assert.deepEqual([group.cursorActive, group.cursorTimestamp], [false, -1], 'back to the latest data');
    // Without a zoom, the cursor goes with the pointer
    u.cursor.left = 40;
    hooks.setCursor[0](u);
    assert.equal(group.cursorTimestamp, 11);
    u.cursor.left = -10;
    hooks.setCursor[0](u);
    assert.equal(group.cursorTimestamp, -1);
});

test('current value: labels under a bar (ends of the range, names of the thresholds) are dropped when they would overlap, thresholds first', () => {
    const T = loadTeleplot();
    const V = T.view.ViewCurrentValue;
    assert.deepEqual([9, 12.6, 0.1 + 0.2, 25.2000001, -3, 1e6].map(V.formatEnd), ['9', '12.6', '0.3', '25.2', '-3', '1000000']);
    // In order of importance: the first labels keep their place, the next ones need room (4 pixels between two)
    assert.deepEqual(V.fitLabels([{ left: 40, width: 30 }, { left: 60, width: 30 }, { left: 0, width: 20 }, { left: 170, width: 30 }]), [true, false, true, true]);
    assert.deepEqual(V.fitLabels([{ left: 0, width: 30 }, { left: 0, width: 20 }, { left: 33, width: 20 }, { left: 34, width: 20 }]), [true, false, false, true]);
    assert.deepEqual(V.fitLabels([]), []);
    // The option, and the list of series of a chart (which stays compact)
    const view = new V('v', []);
    assert.equal(view.options.displayScale, true);
    assert.ok(view.getOptionsSchema().some(o => o.key === 'displayScale'));
    assert.doesNotThrow(() => { view.update(); view.fitScales(); });
});
