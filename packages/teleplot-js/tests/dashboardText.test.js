// 151-dashboardText: dashboards as lines of text (export, import, reception) and view labels that are paths
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');
const { PacketBuilder, ATTR } = require('./helpers/packet');

const namesOf = (T, view) => Array.from(view.telemetryIdOrNameList).map((e) => typeof e === 'string' ? e : T.datastore.getTelemetry(e).getAttribute(T.protocol.TELEM_ATTR_NAME));
const tree = (T, view) => Array.isArray(view.views)
    ? { [view.type === 'teleplot-stack' ? 'stack' : view.layout.type]: Array.from(view.views).map((v) => tree(T, v)) }
    : view.type.replace('teleplot-', '') + '(' + namesOf(T, view).join(',') + ')';

const ROBOT = [
    'DASH|Robot:grid',
    'DASH|Robot/top:row',
    'DASH|Robot/top/Motion:chart:speed,accel|w=3',
    'DASH|Robot/top/side:column',
    'DASH|Robot/top/side/State:values:state,battery',
    'DASH|Robot/top/side/Log:log:robot.log|maxLines=50',
];

test('names are escaped: % / : , | = and line breaks', () => {
    const T = loadTeleplot();
    const raw = 'a/b:c,d|e=f%g\nh é';
    const encoded = T.dashboards.textEncode(raw);
    assert.equal(encoded, 'a%2Fb%3Ac%2Cd%7Ce%3Df%25g%0Ah é');
    assert.equal(T.dashboards.textDecode(encoded), raw);
});

test('a line is parsed into a path, a type, telemetries and options', () => {
    const T = loadTeleplot();
    assert.deepEqual(T.dashboards.parseLine('DASH|Robot/top/Motion:chart:speed,accel|w=2|title=My%3Achart'),
        { name: 'Robot', segments: ['top', 'Motion'], type: 'chart', telemetries: ['speed', 'accel'], options: [['w', '2'], ['title', 'My%3Achart']] });
    assert.deepEqual(T.dashboards.parseLine('DASH|Robot'), { name: 'Robot', segments: [], type: '', telemetries: undefined, options: [] });
    assert.equal(T.dashboards.parseLine('speed:1'), undefined);
    assert.equal(T.dashboards.parseLine('DASH|'), undefined);
    assert.equal(T.dashboards.parseLine('DASH|Robot|nonsense'), undefined);
});

test('received lines build a dashboard: layouts, views, telemetries that do not exist yet, options', () => {
    const T = loadTeleplot();
    let shown = [];
    T.dashboards.onReceivedDashboardHooks.push((d) => shown.push(d.name));
    assert.equal(T.parseDataText(ROBOT.join('\n')), 0);
    const dashboard = T.dashboards.getDashboard('Robot');
    assert.deepEqual(shown, ['Robot'], 'applications are told once');
    assert.deepEqual(tree(T, dashboard.getView()), { grid: [{ row: ['chart(speed,accel)', { column: ['current-value(state,battery)', 'log(robot.log)'] }] }] });
    const row = dashboard.getView().views[0];
    const chart = row.views[0], log = row.views[1].views[1];
    assert.equal(chart.options.title, 'Motion', 'the last name of the path is the title');
    assert.equal(chart.layout.width, 3);
    assert.equal(log.options.maxLines, 50);
    assert.equal(row.layout.align, 'stretch');
    assert.ok(T.view.views.some((v) => v.id === log.id), 'views are registered: they get updated');
    // The telemetry shows up later: the view finds it by its name
    T.parseDataText('speed:1');
    assert.equal(T.datastore.getTelemetry(chart.telemetryIdOrNameList[0]).getAttribute(T.protocol.TELEM_ATTR_NAME), 'speed');
});

test('lines can come in any order: missing layouts are created, then get their type', () => {
    const T = loadTeleplot();
    T.parseDataText(ROBOT.slice().reverse().join('\n'));
    const root = T.dashboards.getDashboard('Robot').getView();
    assert.deepEqual(tree(T, root), { grid: [{ row: [{ column: ['log(robot.log)', 'current-value(state,battery)'] }, 'chart(speed,accel)'] }] });
});

test('a line received again changes nothing, a line that changed updates its view in place', () => {
    const T = loadTeleplot();
    T.parseDataText(ROBOT.join('\n'));
    const row = T.dashboards.getDashboard('Robot').getView().views[0];
    const chart = row.views[0];
    chart.layout.width = 4;                  // changed by hand
    chart.addTelemetry('extra');
    T.parseDataText(ROBOT.join('\n'));
    assert.equal(chart.layout.width, 4, 'what the user changed stays while the sender repeats itself');
    assert.deepEqual(namesOf(T, chart), ['speed', 'accel', 'extra']);
    T.parseDataText('DASH|Robot/top/Motion:chart:speed|w=1|displayNumberDecimals=1');
    assert.equal(row.views[0].id, chart.id, 'same view');
    assert.deepEqual([chart.layout.width, chart.options.displayNumberDecimals, namesOf(T, chart)], [1, 1, ['speed']]);
    T.parseDataText('DASH|Robot/top/Motion|h=6');
    assert.deepEqual([chart.layout.height, namesOf(T, chart)], [6, ['speed']], 'only what is written changes');
});

test('types: a layout changes in place, other changes replace the view and keep what it holds; "none" removes', () => {
    const T = loadTeleplot();
    T.parseDataText(ROBOT.join('\n'));
    const root = T.dashboards.getDashboard('Robot').getView();
    const row = root.views[0];
    T.parseDataText('DASH|Robot/top:column');
    assert.equal(root.views[0].id, row.id);
    assert.equal(row.layout.type, 'column');
    T.parseDataText('DASH|Robot/top/side:stack');
    const stack = row.views[1];
    assert.equal(stack.type, 'teleplot-stack');
    assert.deepEqual(tree(T, stack), { stack: ['current-value(state,battery)', 'log(robot.log)'] });
    T.parseDataText('DASH|Robot/top/Motion:values');
    assert.deepEqual([tree(T, row.views[0]), row.views[0].options.title], ['current-value(speed,accel)', 'Motion']);
    T.parseDataText('DASH|Robot/top/side/Log:none');
    assert.deepEqual(tree(T, stack), { stack: ['current-value(state,battery)'] });
    T.parseDataText('DASH|Robot:none');
    assert.equal(T.dashboards.getDashboard('Robot'), undefined);
    assert.equal(T.view.views.length, 0, 'nothing is left to update');
});

test('a deleted dashboard stays deleted while its sender repeats itself, and comes back whole when a line changes', () => {
    const T = loadTeleplot();
    T.parseDataText(ROBOT.join('\n'));
    T.dashboards.removeDashboard('Robot');
    T.parseDataText(ROBOT.join('\n'));
    assert.equal(T.dashboards.getDashboard('Robot'), undefined);
    T.parseDataText('DASH|Robot/top/Motion:chart:speed');
    assert.deepEqual(tree(T, T.dashboards.getDashboard('Robot').getView()), { grid: [{ row: ['chart(speed)', { column: ['current-value(state,battery)', 'log(robot.log)'] }] }] });
});

test('a dashboard renamed by the user still gets the lines of its sender', () => {
    const T = loadTeleplot();
    T.parseDataText(ROBOT.join('\n'));
    T.dashboards.renameDashboard('Robot', 'Mine');
    T.parseDataText('DASH|Robot/top/Motion:chart:speed');
    assert.equal(T.dashboards.getDashboard('Robot'), undefined);
    assert.equal(tree(T, T.dashboards.getDashboard('Mine').getView()).grid[0].row[0], 'chart(speed)');
});

test('lines that are not understood are counted, what can be applied still is', () => {
    const T = loadTeleplot();
    assert.equal(T.parseDataText('DASH|Robot/a:chart:x|w=wide|nope=1|h=3\nDASH|Robot/b:pie:x\nDASH|\nDASH|Robot/top:row:x'), 4);
    const root = T.dashboards.getDashboard('Robot').getView();
    assert.equal(root.views[0].layout.height, 3);
    assert.equal(root.views.length, 2, 'the unknown type created nothing');
});

test('options: title, anonymous keys, time groups, followed labels, booleans', () => {
    const T = loadTeleplot();
    T.parseDataText(['DASH|D/#1:chart:a|time=Live', 'DASH|D/Named:3d|title=|displayGrid=false|follow=arm,leg', 'DASH|D/box:row|time=dashboard|appearance=flat|gap=0'].join('\n'));
    const [chart, scene, box] = T.dashboards.getDashboard('D').getView().views;
    assert.equal(chart.options.title, '', 'a key that starts with # is not a title');
    assert.deepEqual([chart.options.timeGroup, chart.options.timeGroupName], ['custom', 'Live']);
    assert.deepEqual([scene.options.title, scene.options.displayGrid, Array.from(scene.options.followLabels)], ['', false, ['arm', 'leg']]);
    assert.deepEqual([box.options.timeGroup, box.layout.appearance, box.layout.gap], ['dashboard', 'flat', 0]);
    T.dashboards.resolveTimeGroups();
    assert.equal(chart.group, 'D' + T.view.TIME_GROUP_SEPARATOR + 'Live');
});

test('export writes one line per view, only what differs from the defaults, and import gives the same dashboard back', () => {
    const T = loadTeleplot();
    T.parseDataText(ROBOT.join('\n'));
    assert.deepEqual(T.dashboards.exportText('Robot').split('\n'), ROBOT);
    assert.equal(T.dashboards.exportText('Nope'), '');

    // A dashboard made by hand: no keys, same titles, special characters, every kind of option
    const d = T.dashboards.createDashboard('My/board');
    T.datastore.getOrCreateTelemetry('x');
    const a = T.view.createView('chart', ['x', 'later'], 'g'); a.setOption('title', 'Same');
    const b = T.view.createView('log', [], 'g'); b.setOption('title', 'Same'); b.setOption('timeGroup', 'custom'); b.setOption('timeGroupName', 'T 2'); b.followLabel('a,b');
    const c = T.view.createView('values', ['x'], 'g'); c.setOption('displayLayoutRow', true); c.setSize(3, 2);
    const e = T.view.createView('3d', [], 'g'); e.setOption('title', '#hash');
    const stack = new T.view.ViewStack('', 'g');
    stack.addView(c); stack.addView(e);
    [a, b, stack].forEach((v) => d.getView().addView(v));
    const text = T.dashboards.exportText('My/board');
    assert.deepEqual(text.split('\n'), [
        'DASH|My%2Fboard:grid',
        'DASH|My%2Fboard/Same:chart:x,later',
        'DASH|My%2Fboard/#1:log|title=Same|follow=a%2Cb|time=T 2',
        'DASH|My%2Fboard/#2:stack',
        'DASH|My%2Fboard/#2/#1:values:x|w=3|h=2|displayLayoutRow=true',
        'DASH|My%2Fboard/#2/#2:3d|title=#hash',
    ]);
    assert.equal(T.dashboards.exportText().split('\n').length, ROBOT.length + 6, 'without a name: every dashboard');

    const result = T.dashboards.importText('# a comment\n\n' + text + '\n');
    assert.deepEqual(result, { dashboards: ['My/board 2'], problems: 0 }, 'a name that is taken: a new dashboard, nothing is replaced');
    assert.equal(T.dashboards.exportText('My/board 2'), text.split('My%2Fboard').join('My%2Fboard 2'));
    const again = T.dashboards.importText(text + '\nDASH|Other:grid\nnot a dashboard line');
    assert.deepEqual(again, { dashboards: ['My/board 3', 'Other'], problems: 1 });
});

test('export of the automatic dashboard can be imported as a plain dashboard', () => {
    const T = loadTeleplot();
    T.dashboards.enableAutoDashboard('Live');
    T.parseDataText('a,motors:1\nb,motors:2\nc:3\nmsg:hello|t');
    T.__timers.run();
    const text = T.dashboards.exportText('Live');
    assert.deepEqual(text.split('\n'), ['DASH|Live:grid', 'DASH|Live/motors:chart:a,b|follow=motors', 'DASH|Live/#1:chart:c', 'DASH|Live/#2:values:msg']);
    assert.deepEqual(T.dashboards.importText(text).dashboards, ['Live 2']);
    assert.equal(T.dashboards.getDashboard('Live 2').isAuto, false);
});

test('a view label that is a path places its telemetry: dashboard and view are created, one view per kind', () => {
    const T = loadTeleplot();
    T.dashboards.enableAutoDashboard('Live');
    let shown = [];
    T.dashboards.onReceivedDashboardHooks.push((d) => shown.push(d.name));
    T.parseDataText('speed,Robot/Motion:1\naccel,Robot/Motion:2\nstate,Robot/Motion:IDLE|t\nnote,Robot/side/Notes:started|log\nplain:1\nalone,Robot/:5');
    T.__timers.run();
    assert.deepEqual(shown, ['Robot']);
    const root = T.dashboards.getDashboard('Robot').getView();
    assert.deepEqual(tree(T, root), { grid: ['chart(speed,accel)', 'current-value(state)', { grid: ['log(note)'] }, 'chart(alone)'] });
    assert.deepEqual(root.views.slice(0, 2).map((v) => [v.key, v.options.title]), [['Motion', 'Motion'], ['Motion#values', 'Motion']]);
    assert.equal(root.views[3].options.title, '', 'a path that ends with / only names the dashboard');
    assert.deepEqual(tree(T, T.dashboards.getDashboard('Live').getView()), { grid: ['chart(plain)'] }, 'the automatic dashboard leaves them alone');
    assert.deepEqual(T.dashboards.exportText('Robot').split('\n'), [
        'DASH|Robot:grid', 'DASH|Robot/Motion:chart:speed,accel', 'DASH|Robot/Motion#values:values:state|title=Motion',
        'DASH|Robot/side:grid', 'DASH|Robot/side/Notes:log:note', 'DASH|Robot/#1:chart:alone']);
});

test('label paths and lines work together: the line sets the view up, telemetries join it, whichever comes first', () => {
    const T = loadTeleplot();
    T.parseDataText('DASH|Robot/Motion:chart|w=3|h=2');
    T.parseDataText('speed,Robot/Motion:1');
    T.__timers.run();
    const root = T.dashboards.getDashboard('Robot').getView();
    assert.deepEqual([tree(T, root), root.views[0].layout.width], [{ grid: ['chart(speed)'] }, 3]);
    // A line that lists telemetries keeps the ones their label put there
    T.parseDataText('DASH|Robot/Motion:chart:other');
    assert.deepEqual(namesOf(T, root.views[0]), ['other', 'speed']);

    const U = loadTeleplot();
    U.parseDataText('speed,Robot/Motion:1');
    U.__timers.run();
    U.parseDataText('DASH|Robot/Motion:chart|w=3');
    const view = U.dashboards.getDashboard('Robot').getView().views[0];
    assert.deepEqual([tree(U, view), view.layout.width], ['chart(speed)', 3]);
});

test('a path label ties a camera to its scene, like a label does', () => {
    const T = loadTeleplot();
    T.parseDataText('3D|box,Lab/Scene:S:cube:P:1:0:0\nPNG|cam,Lab/Scene:iVBORw0KGgo=');
    T.__timers.run();
    const root = T.dashboards.getDashboard('Lab').getView();
    assert.deepEqual(tree(T, root), { grid: ['3d(box,cam)', 'image(cam,box)'] });
});

test('telemetries with autoplot off are not placed by their label', () => {
    const T = loadTeleplot();
    T.parseDataText('quiet,Robot/Motion:1|np');
    T.__timers.run();
    assert.equal(T.dashboards.getDashboard('Robot'), undefined);
});

test('binary protocol: a dashboard section carries the same lines, telemetries are found by their name attribute', () => {
    const T = loadTeleplot();
    T.parseDataBinary(new PacketBuilder(1).dashboard(ROBOT.slice(0, 3).join('\n')).build());
    const chart = T.dashboards.getDashboard('Robot').getView().views[0].views[0];
    assert.deepEqual(Array.from(chart.telemetryIdOrNameList), ['speed', 'accel']);
    T.parseDataBinary(new PacketBuilder(1).attrs(5, [[ATTR.NAME, 'speed']]).numbers(5, 1000000000n, [[0, 1.5]]).build());
    T.__timers.run();
    assert.equal(typeof chart.telemetryIdOrNameList[0], 'number', 'the name gave its place to the telemetry');
    assert.deepEqual(namesOf(T, chart), ['speed', 'accel']);
    assert.equal(T.dashboards.exportText('Robot').split('\n')[2], ROBOT[2]);
    // A label that is a path, as an attribute
    T.parseDataBinary(new PacketBuilder(1).attrs(6, [[ATTR.NAME, 'temp'], [6, 'Robot/top/Temp']]).numbers(6, 1000000000n, [[0, 20]]).build());
    T.__timers.run();
    assert.deepEqual(tree(T, T.dashboards.getDashboard('Robot').getView().views[0]), { row: ['chart(speed,accel)', 'chart(temp)'] });
});

test('the automatic dashboard uses the layout of a dashboard received under its name', () => {
    const T = loadTeleplot();
    T.dashboards.enableAutoDashboard('Live');
    T.parseDataText('DASH|Live/Mine:chart:x');
    T.parseDataText('y:1');
    T.__timers.run();
    const live = T.dashboards.getDashboard('Live');
    assert.equal(live.isAuto, true);
    assert.deepEqual(tree(T, live.getView()), { grid: ['chart(x)', 'chart(y)'] });
});

test('a timeline is a view type of the lines; options of the chart for thresholds and scale are written when they differ', () => {
    const T = loadTeleplot();
    assert.ok(T.dashboards.receiveLine('DASH|Robot/States:timeline:mode,nav|h=3|displayTelemetryName=false'));
    assert.ok(T.dashboards.receiveLine('DASH|Robot/Motion:chart:speed,mode|thresholds=show|scale=range'));
    const layout = T.dashboards.getDashboard('Robot').getView();
    const [timeline, chart] = layout.views;
    assert.ok(timeline instanceof T.view.ViewTimeline);
    assert.deepEqual([namesOf(T, timeline), timeline.layout.height, timeline.options.displayTelemetryName], [['mode', 'nav'], 3, false]);
    assert.deepEqual([chart.getOption('thresholds'), chart.getOption('scale')], ['show', 'range']);
    assert.deepEqual(T.dashboards.exportText('Robot').split('\n'), ['DASH|Robot:grid', 'DASH|Robot/States:timeline:mode,nav|h=3|displayTelemetryName=false', 'DASH|Robot/Motion:chart:speed,mode|thresholds=show|scale=range']);
    // Read back in another page
    const U = loadTeleplot();
    U.dashboards.importText(T.dashboards.exportText('Robot'));
    assert.deepEqual(tree(U, U.dashboards.getDashboard('Robot').getView()), { grid: ['timeline(mode,nav)', 'chart(speed,mode)'] });
    // A chart then a timeline at the same place: the view is replaced, its telemetries stay
    assert.ok(T.dashboards.receiveLine('DASH|Robot/Motion:timeline'));
    assert.deepEqual(tree(T, T.dashboards.getDashboard('Robot').getView()), { grid: ['timeline(mode,nav)', 'timeline(speed,mode)'] });
});
