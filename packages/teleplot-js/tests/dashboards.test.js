// 150-dashboards: dashboard listing helpers (stats, creation, unique names)
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');

test('dashboard stats count views and distinct telemetries, createDashboard makes unique empty dashboards', () => {
    const T = loadTeleplot();
    const a = T.dashboards.createDashboard();
    const b = T.dashboards.createDashboard();
    assert.deepEqual([a.name, b.name], ['Dashboard 1', 'Dashboard 2']);
    assert.deepEqual(a.getStats(), { viewCount: 0, telemetryCount: 0 });
    assert.equal(T.dashboards.addDashboard('Dashboard 1').name, 'Dashboard 1 2', 'names stay unique');
    const t1 = T.datastore.getOrCreateTelemetry('x');
    T.datastore.getOrCreateTelemetry('y');
    const layout = a.getView();
    layout.addView(new T.view.ViewChart('', ['x', t1.id, 'y'], a.getGroupName()));
    layout.addView(new T.view.ViewCurrentValue('', ['y'], a.getGroupName()));
    assert.deepEqual(a.getStats(), { viewCount: 2, telemetryCount: 2 });
    assert.equal(a.isAuto, false);
});

test('renaming keeps names unique and leaves the auto dashboard alone', () => {
    const T = loadTeleplot();
    const a = T.dashboards.createDashboard('A'), b = T.dashboards.createDashboard('B');
    assert.equal(T.dashboards.renameDashboard('A', 'C'), 'C');
    assert.equal(a.name, 'C');
    assert.equal(T.dashboards.getDashboard('A'), undefined);
    assert.equal(T.dashboards.getDashboard('C'), a);
    assert.equal(T.dashboards.renameDashboard('B', 'C'), 'C 2');
    assert.equal(T.dashboards.renameDashboard('C 2', '  '), 'C 2');
    b.isAuto = true;
    assert.equal(T.dashboards.renameDashboard('C 2', 'Z'), 'C 2');
});

test('suggestViewType: numbers are plotted, everything else is shown as values, unknown or empty telemetries default to a chart', () => {
    const T = loadTeleplot();
    const now = Date.now() / 1000;
    T.datastore.addTelemetry('n').addData(T.protocol.SECTION_TYPE_TELEM_DATA_NUMBER, [now], [[1]]);
    T.datastore.addTelemetry('t').addData(T.protocol.SECTION_TYPE_TELEM_DATA_TEXT, [now], [['hi']]);
    T.datastore.addTelemetry('p').addData(T.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D, [now], [[1], [2]]);
    T.datastore.addTelemetry('empty');
    assert.deepEqual(['n', 't', 'p', 'empty', 'unknown'].map(T.view.suggestViewType), ['chart', 'values', 'values', 'chart', 'chart']);
    assert.equal(T.view.suggestViewType(T.datastore.getTelemetry('t').id), 'values', 'ids work like names');
});

test('createView builds a view of a known type with its telemetries and a size that suits it', () => {
    const T = loadTeleplot();
    const chart = T.view.createView('chart', ['a', 'b'], 'g');
    assert.ok(chart instanceof T.view.ViewChart);
    assert.deepEqual(Array.from(chart.telemetryIdOrNameList), ['a', 'b']);
    assert.equal(chart.group, 'g');
    assert.deepEqual([chart.layout.width, chart.layout.height], [2, 4]);
    assert.ok(T.view.createView('values', ['a']) instanceof T.view.ViewCurrentValue);
    assert.ok(T.view.createView('log') instanceof T.view.ViewLog);
    assert.equal(T.view.createView('nope'), undefined);
    assert.deepEqual(T.view.VIEW_TYPES, ['chart', 'values', 'log']);
});
