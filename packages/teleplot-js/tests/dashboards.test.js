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
