// 100-views, 101-viewLayout, 102-viewStack, 103-viewTelemetries, 150-dashboards, 998-update
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot, captureConsole } = require('./helpers/load');

test('Views and ViewTelemetries are abstract', () => {
    const T = loadTeleplot();
    assert.throws(() => new T.view.ViewTelemetries('x'), /abstract/);
});

test('views register once, get a unique id, and share a group state', () => {
    const T = loadTeleplot();
    const a = new T.view.ViewLayout(), b = new T.view.ViewLayout('', 'other');
    assert.notEqual(a.id, b.id);
    T.view.addView(a); T.view.addView(a);
    assert.equal(T.view.views.length, 1);
    assert.equal(T.view.getView(a.id), a);
    assert.deepEqual(Object.keys(T.view.groups).sort(), ['default', 'other']);
    assert.equal(T.view.groups.default.cursorActive, false);
    assert.equal(new T.view.ViewLayout('my-div').divId, 'my-div');
});

test('updateViews updates every registered view', () => {
    const T = loadTeleplot();
    const views = [new T.view.ViewLayout(), new T.view.ViewLayout()];
    let count = 0;
    views.forEach(v => { v.update = () => count++; T.view.addView(v); });
    T.view.updateViews();
    assert.equal(count, 2);
});

test('options and size', () => {
    const T = loadTeleplot();
    const v = new T.view.ViewLayout();
    v.setOption('foo', 1);
    assert.equal(v.getOption('foo'), 1);
    v.setSize(3, 5);
    assert.deepEqual([v.layout.width, v.layout.height], [3, 5]);
});

test('layout: add at index, find, remove', () => {
    const T = loadTeleplot();
    const layout = new T.view.ViewLayout();
    const [a, b, c] = [1, 2, 3].map(() => new T.view.ViewLayout());
    layout.addView(a); layout.addView(b); layout.addView(c, 1);
    assert.deepEqual(layout.views.map(v => v.id), [a.id, c.id, b.id]);
    assert.equal(layout.getViewFromId(c.id), c);
    layout.removeView(c.id);
    layout.removeView('unknown');
    assert.deepEqual(layout.views.map(v => v.id), [a.id, b.id]);
    assert.equal(T.view.getView(a.id), a, 'added views are registered globally');
});

test('stack: selects the first view, keeps a valid selection, falls back when it disappears', () => {
    const T = loadTeleplot();
    const stack = new T.view.ViewStack();
    const [a, b] = [1, 2].map(() => new T.view.ViewLayout());
    stack.update();
    assert.equal(stack.layout.selected, undefined);
    stack.addView(a); stack.addView(b);
    stack.update();
    assert.equal(stack.layout.selected, a.id);
    stack.selectView(b.id); stack.selectView('unknown');
    stack.update();
    assert.equal(stack.layout.selected, b.id);
    stack.removeView(b.id);
    stack.update();
    assert.equal(stack.layout.selected, a.id);
});

test('per-telemetry options override the view options', () => {
    const T = loadTeleplot();
    const telem = T.datastore.getOrCreateTelemetry('a');
    const chart = new T.view.ViewChart('x', ['a']);
    assert.equal(chart.getOption('displayNumberDecimals', 'a'), 3);
    chart.setOption('displayNumberDecimals', 1, 'a');
    assert.equal(chart.getOption('displayNumberDecimals', 'a'), 1);
    assert.equal(chart.getOption('displayNumberDecimals', telem.id), 1);
    assert.equal(chart.getOption('displayNumberDecimals'), 3);
    assert.equal(chart.setOption('displayNumberDecimals', 1, 'unknown'), false);
});

test('dropping a telemetry on a view adds it once', () => {
    const T = loadTeleplot();
    const a = T.datastore.getOrCreateTelemetry('a'), b = T.datastore.getOrCreateTelemetry('b');
    const chart = new T.view.ViewChart('x', ['a']);
    const dropEvent = id => ({ dataTransfer: { types: ['text/x-teleplot-drag-type-telemetry', 'text/x-teleplot-drag-id'], getData: () => String(id) } });
    captureConsole(() => {
        chart.onDragDrop(dropEvent(b.id), chart);
        chart.onDragDrop(dropEvent(b.id), chart);
        chart.onDragDrop(dropEvent(a.id), chart);
    });
    assert.deepEqual(chart.telemetryIdOrNameList, ['a', b.id]);
    assert.equal(chart.dragContext.isActive, false);
});

test('drag enter/leave highlight only for telemetries', () => {
    const T = loadTeleplot();
    const chart = new T.view.ViewChart('x', []);
    const evt = types => ({ dataTransfer: { types } });
    chart.onDragEnter(evt(['text/plain']), chart);
    assert.equal(chart.dragContext.isActive, false);
    chart.onDragEnter(evt(['text/x-teleplot-drag-type-telemetry']), chart);
    assert.equal(chart.dragContext.isActive, true);
    chart.onDragLeave(evt(['text/x-teleplot-drag-type-telemetry']), chart);
    assert.equal(chart.dragContext.isActive, false);
});

test('dashboards are created once per name and hold a view', () => {
    const T = loadTeleplot();
    const d = T.dashboards.getOrCreateDashboard('main');
    assert.equal(T.dashboards.getOrCreateDashboard('main'), d);
    assert.equal(d.getGroupName(), 'main');
    assert.equal(T.dashboards.hasDashboard('other'), false);
    const layout = new T.view.ViewLayout();
    d.setView(layout);
    assert.equal(d.getView(), layout);
    assert.equal(T.view.getView(layout.id), layout);
});

test('update loop: hooks run in isolation, timed-out data is pruned, interval can be changed', () => {
    const T = loadTeleplot();
    assert.equal(T.__timers.pending.size, 1, 'one update interval at start');
    // pruning through the real update hook
    T.state.dataTimeout = 1;
    const telem = T.datastore.getOrCreateTelemetry('a');
    telem.addData(20, [0, 1, 2, 3], [[0, 1, 2, 3]]);
    T.updates.update();
    assert.deepEqual(telem.data[20].timestamps, [2, 3]);
    // a failing hook doesn't stop the next ones
    let reached = false;
    T.updates.onUpdateHooks.unshift(() => { throw new Error('boom'); });
    T.updates.onUpdateHooks.push(() => { reached = true; });
    const out = captureConsole(() => T.updates.update());
    assert.equal(out.error.length, 1);
    assert.ok(reached);
    // changing the interval replaces the timer
    T.updates.setUpdateInterval(100);
    assert.equal(T.__timers.pending.size, 1);
    assert.equal([...T.__timers.pending.values()][0].ms, 100);
});
