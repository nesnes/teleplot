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

test('new dashboards and the auto dashboard are grids whose lines share their height', () => {
    const T = loadTeleplot();
    const created = T.dashboards.createDashboard().getView();
    assert.deepEqual([created.layout.type, created.layout.align], ['grid', 'stretch']);
    T.dashboards.enableAutoDashboard('Live');
    T.datastore.getOrCreateTelemetry('n').addData(T.protocol.SECTION_TYPE_TELEM_DATA_NUMBER, [Date.now() / 1000], [[1]]);
    T.__timers.run(); // hooks are delayed to let attributes and data arrive
    const live = T.dashboards.getDashboard('Live').getView();
    assert.deepEqual([live.layout.type, live.layout.align], ['grid', 'stretch']);
    assert.equal(live.views[0].layout.width, 2, 'a chart takes two columns');
});

test('removeDashboard forgets the dashboard and its views, and leaves the auto dashboard alone', () => {
    const T = loadTeleplot();
    const a = T.dashboards.createDashboard('A'), b = T.dashboards.createDashboard('B');
    const layout = a.getView();
    const chart = new T.view.ViewChart('', ['x'], a.getGroupName());
    layout.addView(chart);
    assert.equal(T.dashboards.removeDashboard('A'), true);
    assert.equal(T.dashboards.getDashboard('A'), undefined);
    assert.equal(a.getView(), undefined);
    assert.equal(T.view.views.some(v => v.id === layout.id || v.id === chart.id), false, 'views are not updated anymore');
    assert.ok(T.view.views.some(v => v.id === b.getView().id), 'other dashboards keep their views');
    assert.equal(T.dashboards.removeDashboard('A'), false, 'unknown name');
    b.isAuto = true;
    assert.equal(T.dashboards.removeDashboard('B'), false);
    assert.equal(T.dashboards.getDashboard('B'), b);
    assert.equal(T.dashboards.createDashboard('A').name, 'A', 'the name is free again');
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
    assert.ok(T.view.createView('3d', ['a']) instanceof T.view.ViewScene3D);
    assert.ok(T.view.createView('image', ['a']) instanceof T.view.ViewImage);
    assert.deepEqual(T.view.VIEW_TYPES, ['chart', 'values', 'log', '3d', 'image']);
});

test('auto dashboard: telemetries with the same view label share a view per kind of view, titled with the label', () => {
    const T = loadTeleplot();
    T.dashboards.enableAutoDashboard('Live');
    T.parseDataText({ data: 'speed,motors:1\nalone:2\ncurrent,motors:3\nstate,motors:on|t\n3D|arm,robot:S:cube\n3D|free:S:sphere\n3D|leg,robot:S:cube\nJPG|front,cams:1000:AAAA\nJPG|rear,cams:1000:BBBB', timestamp: 0 });
    T.__timers.run();
    const layout = T.dashboards.getDashboard('Live').getView();
    const id = (name) => T.datastore.getTelemetry(name).id;
    assert.deepEqual(layout.views.map(v => [v.type, v.getOption('title'), Array.from(v.telemetryIdOrNameList)]), [
        ['teleplot-chart', 'motors', [id('speed'), id('current')]],
        ['teleplot-chart', '', [id('alone')]],
        ['teleplot-current-value', 'motors', [id('state')]],     // same label, but text is not plotted
        ['teleplot-3d', 'robot', [id('arm'), id('leg')]],
        ['teleplot-3d', '', [id('free')]],                       // shapes without label keep sharing their scene
        ['teleplot-image', '', [id('front')]],                   // an image view shows one picture
        ['teleplot-image', '', [id('rear')]],
    ]);
    // The view of a label was removed by the user: the next telemetry of the label gets a new one
    layout.removeView(layout.views[0].id);
    T.parseDataText({ data: 'torque,motors:1', timestamp: 0 });
    T.__timers.run();
    assert.deepEqual([layout.views.at(-1).getOption('title'), Array.from(layout.views.at(-1).telemetryIdOrNameList)], ['motors', [id('torque')]]);
});

test('time groups: views inherit the group of their layout; a view or a layout can follow the dashboard or a custom group', () => {
    const T = loadTeleplot();
    const dash = T.dashboards.createDashboard('Bench');
    const root = dash.getView();
    const row = new T.view.ViewLayout('', 'Bench');
    const top = new T.view.ViewCurrentValue('', [], 'Bench');
    const inRow = new T.view.ViewCurrentValue('', [], 'Bench');
    const out = new T.view.ViewCurrentValue('', [], 'Bench');
    root.addView(top); root.addView(row); row.addView(inRow); row.addView(out);
    const SEP = T.view.TIME_GROUP_SEPARATOR;

    assert.deepEqual(T.dashboards.getTimeGroups('Bench'), [], 'everything on inherit: one group, the one of the dashboard');
    assert.deepEqual([root, row, top, inRow, out].map(v => v.group), ['Bench', 'Bench', 'Bench', 'Bench', 'Bench']);

    // A custom group is created with a generated name; the views inside the layout inherit it
    assert.equal(T.dashboards.setTimeGroup('Bench', row, 'custom'), 'Time 2');
    assert.deepEqual([row.group, inRow.group, out.group, top.group], ['Bench' + SEP + 'Time 2', 'Bench' + SEP + 'Time 2', 'Bench' + SEP + 'Time 2', 'Bench']);
    assert.deepEqual([row.timeGroupMark.label, row.timeGroupMark.parent, inRow.timeGroupMark.label], ['Time 2', 'Bench', ''], 'only the layout where the group starts is marked');
    assert.ok(T.view.groups['Bench' + SEP + 'Time 2']);

    // "dashboard" inside it goes back to the main group; another view creates its own group, a third one joins an existing group
    T.dashboards.setTimeGroup('Bench', out, 'dashboard');
    assert.deepEqual([out.group, out.timeGroupMark.label], ['Bench', 'Dashboard']);
    assert.equal(T.dashboards.setTimeGroup('Bench', top, 'custom'), 'Time 3');
    assert.equal(T.dashboards.setTimeGroup('Bench', top, 'custom', 'Time 2'), 'Time 2');
    assert.deepEqual(T.dashboards.getTimeGroups('Bench').map(g => [g.name, g.views]), [['Time 2', 2]]);
    assert.equal(T.view.groups['Bench' + SEP + 'Time 3'], undefined, 'a group goes away with its last view');
    assert.notEqual(T.view.timeGroupColor('Time 2'), T.view.timeGroupColor('Time 3'));

    // Zoom of one group only; renaming keeps it; back to live releases everything
    Object.assign(T.view.groups[row.group], { cursorActive: true, timestampFrom: 5, timestampTo: 9 });
    assert.equal(T.view.isZoomed('Bench'), false);
    assert.equal(T.dashboards.renameTimeGroup('Bench', 'Time 2', 'Arm'), 'Arm');
    assert.deepEqual([row.group, top.group, T.view.groups[row.group].timestampTo], ['Bench' + SEP + 'Arm', 'Bench' + SEP + 'Arm', 9]);
    assert.equal(T.view.groups['Bench' + SEP + 'Time 2'], undefined);
    assert.equal(T.view.backToLive(), true);

    // Back to inherit, and a renamed dashboard: the groups follow
    T.dashboards.setTimeGroup('Bench', row, 'inherit');
    T.dashboards.setTimeGroup('Bench', top, 'inherit');
    assert.deepEqual(T.dashboards.getTimeGroups('Bench'), []);
    T.dashboards.renameDashboard('Bench', 'Rig');
    T.dashboards.resolveTimeGroups();
    assert.deepEqual([root.group, inRow.group, T.view.groups.Bench], ['Rig', 'Rig', undefined]);

    // A copy keeps the choice of the view it was made from
    T.dashboards.setTimeGroup('Rig', top, 'custom', 'Arm');
    assert.deepEqual([top.clone().options.timeGroup, top.clone().options.timeGroupName], ['custom', 'Arm']);
});
