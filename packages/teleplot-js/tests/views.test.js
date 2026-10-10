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
    v.setSize(undefined, 1); // undefined keeps the current value
    assert.deepEqual([v.layout.width, v.layout.height], [3, 1]);
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

test('dropping a group of telemetries adds each of them once', () => {
    const T = loadTeleplot();
    const a = T.datastore.getOrCreateTelemetry('a'), b = T.datastore.getOrCreateTelemetry('b'), c = T.datastore.getOrCreateTelemetry('c');
    const chart = new T.view.ViewChart('x', ['b']);
    const types = ['text/x-teleplot-drag-type-telemetry', 'text/x-teleplot-drag-id', 'text/x-teleplot-drag-ids'];
    const drop = ids => ({ dataTransfer: { types, getData: type => type.endsWith('-ids') ? ids.join(',') : String(ids[0]) } });
    chart.onDragDrop(drop([a.id, b.id, c.id, 123456]), chart); // 123456: unknown id, ignored
    assert.deepEqual(chart.telemetryIdOrNameList, ['b', a.id, c.id]);
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
    const delays = [...T.__timers.pending.values()].map(t => t.ms).filter(ms => ms != 100); // (the new telemetry also has its hooks waiting)
    assert.equal([...T.__timers.pending.values()].filter(t => t.ms == 100 && t.repeat !== false).length >= 1, true);
    assert.equal(delays.some(ms => Math.abs(ms - 1000 / 30) < 1), false, 'the previous interval is gone');
});

test('auto dashboard: new telemetries get a chart (numbers) or a value view (others), np is respected', () => {
    const T = loadTeleplot();
    let created = [];
    T.dashboards.enableAutoDashboard('Live', d => created.push(d));
    T.datastore.getOrCreateTelemetry('speed').addData(20, [1], [[1]]);
    T.datastore.getOrCreateTelemetry('state').addData(23, [1], [['on']]);
    const hidden = T.datastore.getOrCreateTelemetry('hidden');
    hidden.setAttribute(T.protocol.TELEM_ATTR_AUTOPLOT, false);
    hidden.addData(20, [1], [[1]]);
    T.datastore.getOrCreateTelemetry('empty'); // no data yet
    assert.equal(T.dashboards.hasDashboard('Live'), false, 'nothing before the hooks run');

    T.__timers.run(); // hooks are delayed to let attributes and data arrive

    assert.equal(created.length, 1, 'onCreated once');
    const layout = T.dashboards.getDashboard('Live').getView();
    assert.deepEqual(layout.views.map(v => v.type), ['teleplot-chart', 'teleplot-current-value']);
    assert.deepEqual(layout.views[0].telemetryIdOrNameList, [T.datastore.getTelemetry('speed').id]);
    assert.equal(T.view.getView(layout.id), layout);
});

test('auto dashboard: nothing is created without displayable telemetry', () => {
    const T = loadTeleplot();
    T.dashboards.enableAutoDashboard();
    T.datastore.getOrCreateTelemetry('empty');
    T.__timers.run();
    assert.equal(T.dashboards.hasDashboard('Live'), false);
});

test('a failing view does not stop the other views from updating', () => {
    const T = loadTeleplot();
    const [bad, good] = [new T.view.ViewLayout(), new T.view.ViewLayout()];
    let updated = false;
    bad.update = () => { throw new Error('boom'); };
    good.update = () => { updated = true; };
    T.view.addView(bad); T.view.addView(good);
    const out = captureConsole(() => T.view.updateViews());
    assert.equal(out.error.length, 1);
    assert.ok(updated);
});

test('containers have no minimum height by default, views keep theirs', () => {
    const T = loadTeleplot();
    assert.equal(new T.view.ViewLayout().layout.height, 0);
    assert.equal(new T.view.ViewStack().layout.height, 0);
    assert.equal(new T.view.ViewChart('', []).layout.height, 4);
});

test('telemetry views: add and remove telemetries (by id or name, no duplicates)', () => {
    const T = loadTeleplot();
    const v = new T.view.ViewChart('', []);
    assert.equal(v.addTelemetry('a'), true);
    assert.equal(v.addTelemetry('a'), false);
    assert.equal(v.addTelemetry('b'), true);
    assert.deepEqual(Array.from(v.telemetryIdOrNameList), ['a', 'b']);
    assert.equal(v.removeTelemetry('a'), true);
    assert.equal(v.removeTelemetry('a'), false);
    assert.deepEqual(Array.from(v.telemetryIdOrNameList), ['b']);
});

test('telemetry views: moveTelemetry reorders the list, and the chart rebuilds its series in the new order', () => {
    const T = loadTeleplot();
    const v = new T.view.ViewChart('', ['a', 'b', 'c']);
    assert.equal(v.moveTelemetry(0, 2), true);
    assert.deepEqual(Array.from(v.telemetryIdOrNameList), ['b', 'c', 'a']);
    assert.equal(v.moveTelemetry(2, 1), true);
    assert.deepEqual(Array.from(v.telemetryIdOrNameList), ['b', 'a', 'c']);
    assert.equal(v.moveTelemetry(1, 1), true);
    assert.equal(v.moveTelemetry(3, 0), false);
    assert.equal(v.moveTelemetry(0, -1), false);
    assert.deepEqual(Array.from(v.telemetryIdOrNameList), ['b', 'a', 'c']);
});

test('clone copies content, options and layout but not identity', () => {
    const T = loadTeleplot();
    const row = new T.view.ViewLayout('', 'g');
    row.layout.type = 'column'; row.setSize(3, 2);
    const log = new T.view.ViewLog('', ['t1'], 'g');
    log.setOption('maxLines', 42); log.setOption('title', 'My log'); log.setSize(5, 1);
    const stack = new T.view.ViewStack('', 'g');
    stack.addView(new T.view.ViewChart('', ['x'], 'g'));
    row.addView(log); row.addView(stack);

    const copy = row.clone();
    assert.notEqual(copy.id, row.id);
    assert.equal(copy.layout.type, 'column');
    assert.deepEqual([copy.layout.width, copy.layout.height], [3, 2]);
    assert.equal(copy.views.length, 2);
    const logCopy = copy.views[0];
    assert.notEqual(logCopy, log);
    assert.equal(logCopy.type, 'teleplot-log');
    assert.equal(logCopy.getOption('maxLines'), 42);
    assert.equal(logCopy.getOption('title'), 'My log');
    assert.deepEqual([logCopy.layout.width, logCopy.layout.height], [5, 1]);
    assert.deepEqual(Array.from(logCopy.telemetryIdOrNameList), ['t1']);
    logCopy.addTelemetry('t2'); // independent copies
    assert.deepEqual(Array.from(log.telemetryIdOrNameList), ['t1']);
    assert.equal(copy.views[1].views.length, 1);
    assert.equal(copy.views[1].layout.selected, undefined);
});

test('removeView unregisters a view and its children, disposeView unmounts them', () => {
    const T = loadTeleplot();
    const row = new T.view.ViewLayout();
    const chart = new T.view.ViewChart('', []);
    row.addView(chart); T.view.addView(row);
    let disposed = [];
    row.dispose = () => disposed.push('row'); chart.dispose = () => disposed.push('chart');
    T.view.removeView(row);
    assert.equal(T.view.views.length, 0);
    assert.deepEqual(disposed.sort(), ['chart', 'row']);
});

test('options schema describes what a form can edit', () => {
    const T = loadTeleplot();
    const keys = (v) => v.getOptionsSchema().map(o => o.key);
    assert.ok(keys(new T.view.ViewChart('', [])).includes('decimation'));
    assert.ok(keys(new T.view.ViewLog('', [])).includes('maxLines'));
    assert.ok(keys(new T.view.ViewCurrentValue('', [])).includes('displayLayoutRow'));
    for (const o of new T.view.ViewLog('', []).getOptionsSchema()) assert.ok(['bool', 'int'].includes(o.type));
});

// ---- look: appearance, top color, empty states, time axis, theme

test('layout appearance and top color become CSS variables that inherit down the page', () => {
    const T = loadTeleplot();
    const L = T.view.ViewLayout;
    assert.deepEqual(L.appearanceStyle({ appearance: 'inherit', accent: 'inherit' }), {});
    const flat = L.appearanceStyle({ appearance: 'flat', accent: 'off' });
    assert.equal(flat['--teleplot-card-bg'], 'var(--teleplot-surface)');
    assert.equal(flat['--teleplot-flat-gap'], '0');
    assert.equal(flat['--teleplot-accent-w'], '0px');
    const card = L.appearanceStyle({ appearance: 'card', accent: 'on' }); // explicit card: undoes a flat parent
    assert.equal(card['--teleplot-card-radius'], '8px');
    assert.equal(card['--teleplot-flat-gap'], 'initial');
    assert.equal(card['--teleplot-accent-w'], '2px');
    assert.equal(new L().layout.appearance, 'inherit');
    assert.equal(new T.view.ViewStack().layout.accent, 'inherit');
});

test('the top color is the color of the first telemetry shown', () => {
    const T = loadTeleplot();
    const a = T.datastore.getOrCreateTelemetry('a'), b = T.datastore.getOrCreateTelemetry('b');
    b.setAttribute(T.protocol.TELEM_ATTR_COLOR, 'rgb(1,2,3)');
    assert.equal(new T.view.ViewChart('', []).getAccentColor(), '');
    assert.equal(new T.view.ViewChart('', ['unknown']).getAccentColor(), '');
    assert.equal(new T.view.ViewChart('', ['unknown', 'b']).getAccentColor(), 'rgb(1,2,3)');
    assert.equal(new T.view.ViewChart('', [a.id]).getAccentColor(), T.colors.getColor(1).toStrRGB());
});

test('empty states say why a view shows nothing, and say nothing when there is something to show', () => {
    const T = loadTeleplot();
    const NUMBER = T.protocol.SECTION_TYPE_TELEM_DATA_NUMBER, TEXT = T.protocol.SECTION_TYPE_TELEM_DATA_TEXT;
    const num = T.datastore.getOrCreateTelemetry('num'), txt = T.datastore.getOrCreateTelemetry('txt');
    num.addData(NUMBER, [1], [[5]]); txt.addData(TEXT, [1], [['hello']]);
    T.datastore.getOrCreateTelemetry('nodata');

    assert.equal(new T.view.ViewChart('', []).getEmptyState().text, 'No telemetry');
    let waiting = new T.view.ViewChart('', ['x', 'y']).getEmptyState();
    assert.deepEqual([waiting.text, waiting.hint], ['Waiting for data', 'x, y']);
    assert.equal(new T.view.ViewChart('', ['nodata']).getEmptyState().text, 'Waiting for data');
    const wrong = new T.view.ViewChart('', ['txt']).getEmptyState();
    assert.equal(wrong.text, 'Nothing to display');
    assert.match(wrong.hint, /number data.*txt/);
    assert.match(new T.view.ViewLog('', ['num']).getEmptyState().hint, /text data/);
    assert.equal(new T.view.ViewChart('', ['txt', 'num']).getEmptyState().text, ''); // one telemetry is enough
    assert.equal(new T.view.ViewLog('', ['txt']).getEmptyState().text, '');
    assert.equal(new T.view.ViewCurrentValue('', ['txt']).getEmptyState().text, ''); // any kind of data
    assert.equal(new T.view.ViewCurrentValue('', ['nodata']).getEmptyState().text, 'Waiting for data');
    assert.match(new T.view.ViewChart('', ['a', 'b', 'c', 'd']).getEmptyState().hint, /a, b, c, …/); // long lists are cut
});

test('log lines that look like errors and warnings are classified', () => {
    const T = loadTeleplot();
    const level = T.view.ViewLog.getLevel;
    assert.deepEqual(['[ERROR] x', 'fatal: y', 'Err 5', 'critical!'].map(level), [2, 2, 2, 2]);
    assert.deepEqual(['[WARN] x', 'Warning: y'].map(level), [1, 1]);
    assert.deepEqual(['[INFO] terror level low', 'errors are fine', 'all good', ''].map(level), [0, 0, 0, 0]); // whole words only
});

test('time axis labels use one format: decimals only when ticks are closer than a second, the day only for long ranges', () => {
    const T = loadTeleplot();
    const fmt = T.view.ViewChart.formatTimeTicks;
    const t0 = new Date(2026, 0, 5, 12, 34, 56).getTime() / 1000;
    assert.deepEqual(fmt(null, [t0, t0 + 1, t0 + 2], 0, 0, 1), ['12:34:56', '12:34:57', '12:34:58']);
    assert.deepEqual(fmt(null, [t0, t0 + 0.5], 0, 0, 0.5), ['12:34:56.0', '12:34:56.5']);
    assert.deepEqual(fmt(null, [t0, t0 + 0.05], 0, 0, 0.05), ['12:34:56.00', '12:34:56.05']);
    assert.deepEqual(fmt(null, [t0 - 56, t0 + 4], 0, 0, 60), ['12:34', '12:35']);
    assert.deepEqual(fmt(null, [t0, t0 + 86400 * 2], 0, 0, 86400), ['01-05 12:34', '01-07 12:34']);
    assert.deepEqual(fmt(null, [], 0, 0, 1), []);
});

test('theme: dark is chosen by data-theme, light/dark helpers do not need a DOM', () => {
    const T = loadTeleplot();
    assert.ok(['light', 'dark'].includes(T.theme.key()));
    assert.equal(T.theme.color('--teleplot-text', undefined, 'fallback'), 'fallback'); // no DOM in tests
});

test('grid layout: columns come by pairs from the width, views span columns without exceeding them', () => {
    const T = loadTeleplot();
    const L = T.view.ViewLayout;
    // width, column width and gap in em
    assert.deepEqual([10, 16, 33, 34, 50, 67, 68, 135].map(w => L.gridColumns(w, 16, 1)), [1, 1, 2, 2, 2, 4, 4, 8]);
    assert.equal(L.gridColumns(100, 10), 10);
    assert.equal(L.gridColumns(0, 16, 1), 1);
    assert.equal(L.gridColumns(100, 0, 1), 1);

    const grid = new L('', 'g');
    assert.equal(grid.layout.columnWidth, 16);
    grid.layout.type = 'grid';
    const style = L.containerStyle(grid.layout, 6);
    assert.equal(style.display, 'grid');
    assert.equal(style['grid-template-columns'], 'repeat(6, minmax(0, 1fr))');
    assert.equal(style['flex-direction'], undefined);
    assert.equal(L.childStyle(grid.layout, { width: 2 }, 6)['grid-column'], 'span 2');
    assert.equal(L.childStyle(grid.layout, { width: 8 }, 6)['grid-column'], 'span 6', 'never wider than the grid');
    assert.equal(L.childStyle(grid.layout, { width: 0 }, 6)['grid-column'], 'span 1');

    // Rows and columns are unchanged: flex, widths are weights
    grid.layout.type = 'column';
    assert.equal(L.containerStyle(grid.layout, 6)['flex-direction'], 'column');
    assert.equal(L.containerStyle(grid.layout, 6).display, undefined);
    assert.equal(L.childStyle(grid.layout, { width: 3 }, 6).flex, '3 3 1em');

    grid.layout.type = 'grid'; grid.layout.columnWidth = 20;
    assert.deepEqual([grid.clone().layout.type, grid.clone().layout.columnWidth], ['grid', 20]);
});

test('views that follow a view label get the new telemetries of that label that they can display', () => {
    const T = loadTeleplot();
    const send = (data) => { T.parseDataText({ data, timestamp: 0 }); T.__timers.run(); };
    send('left,motors:1\nlog.a,logs:hello|t');
    const chart = new T.view.ViewChart('', ['left']), values = new T.view.ViewCurrentValue('', []), log = new T.view.ViewLog('', ['log.a']);
    const scene = new T.view.ViewScene3D('', []), image = new T.view.ViewImage('', []), other = new T.view.ViewChart('', []);
    [chart, values, log, scene, image, other].forEach(v => T.view.addView(v));
    assert.equal(chart.followLabel('motors'), true);
    assert.equal(chart.followLabel('motors'), false, 'already followed');
    assert.equal(chart.followLabel(''), false);
    [values, scene, image].forEach(v => v.followLabel('motors'));
    log.followLabel('logs'); values.followLabel('logs');

    send('right,motors:2\nstate,motors:on|t\n3D|arm,motors:S:cube\nJPG|cam,motors:1000:AAAA\nfree:3\nlog.b,logs:world|t');
    const names = (view) => Array.from(view.telemetryIdOrNameList).map(e => typeof e == 'number' ? T.datastore.getTelemetry(e).getAttribute(T.protocol.TELEM_ATTR_NAME) : e);
    assert.deepEqual(names(chart), ['left', 'right'], 'numbers of the label; the telemetries that existed before are not added');
    assert.deepEqual(names(values), ['state', 'log.b'], 'what a values view displays, for both labels it follows');
    assert.deepEqual(names(log), ['log.a', 'log.b'], 'a log takes text');
    assert.deepEqual(names(scene), ['arm']);
    assert.deepEqual(names(image), ['arm'], 'an image view takes what can be drawn over its picture, not another picture');
    assert.deepEqual(names(other), [], 'a view that follows nothing');

    // Not followed anymore; copies follow the same labels (and have their own list)
    const copy = chart.clone();
    T.view.addView(copy);
    assert.equal(chart.unfollowLabel('motors'), true);
    assert.equal(chart.unfollowLabel('motors'), false);
    send('torque,motors:4');
    assert.deepEqual([names(chart), names(copy)], [['left', 'right'], ['left', 'right', 'torque']]);
    assert.deepEqual(Array.from(chart.options.followLabels), []);
});

test('a label dropped on a view (drag-label): its telemetries are added and the view follows the label', () => {
    const T = loadTeleplot();
    T.parseDataText({ data: 'left,motors:1\nright,motors:2', timestamp: 0 });
    T.__timers.run();
    const chart = new T.view.ViewChart('', []);
    T.view.addView(chart);
    const ids = ['left', 'right'].map(n => T.datastore.getTelemetry(n).id);
    const data = { 'text/x-teleplot-drag-type-telemetry': '', 'text/x-teleplot-drag-id': String(ids[0]), 'text/x-teleplot-drag-ids': ids.join(','), 'text/x-teleplot-drag-label': 'motors' };
    chart.onDragDrop({ dataTransfer: { types: Object.keys(data), getData: (type) => data[type] } }, chart);
    assert.deepEqual(Array.from(chart.telemetryIdOrNameList), ids);
    assert.deepEqual(Array.from(chart.options.followLabels), ['motors']);
    T.parseDataText({ data: 'torque,motors:3', timestamp: 0 });
    T.__timers.run();
    assert.equal(chart.telemetryIdOrNameList.length, 3);
});

test('backToLive drops the zoom and the cursor of a group, or of all of them', () => {
    const T = loadTeleplot();
    new T.view.ViewCurrentValue('a', [], 'one'); new T.view.ViewCurrentValue('b', [], 'two');
    Object.assign(T.view.groups.one, { cursorActive: true, cursorTimestamp: 5, timestampFrom: 1, timestampTo: 9 });
    assert.equal(T.view.isZoomed(), true);
    assert.equal(T.view.isZoomed('two'), false);
    assert.equal(T.view.backToLive('two'), false);
    assert.equal(T.view.backToLive(), true);
    assert.deepEqual(T.view.groups.one, { cursorActive: false, cursorTimestamp: -1, timestampFrom: -1, timestampTo: -1 });
    assert.equal(T.view.isZoomed(), false);
});
