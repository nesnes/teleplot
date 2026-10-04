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
