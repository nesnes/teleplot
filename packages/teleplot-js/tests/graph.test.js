// Graphs (doc/graph.md): structure samples (enum, edges), parts with the same time, stacks with several paths, the graph view
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');
const { PacketBuilder } = require('./helpers/packet');

const ENUM = 43, EDGES = 44, TEXT = 23;
const T0 = 1_800_000_000_000;

test('enum and edges lines: a structure sample per time, parts with the same time merged, a newer time replaces it', () => {
    const T = loadTeleplot();
    T.parseDataText([
        'robot.mode:1000:idle,mission/goto,mission/grasp|enum',
        'robot.mode:1000:error,idle|enum',
        'robot.mode:1000:idle>mission/goto=start,mission/goto>mission/grasp=arrived|edges',
        'robot.mode:1000:error>idle=reset|edges',
    ].join('\n'));
    const telem = T.datastore.getTelemetry('robot.mode');
    assert.equal(telem.data[ENUM].timestamps.length, 1, 'two parts, one sample');
    assert.equal(telem.data[ENUM].data[0][0], 'idle\nmission/goto\nmission/grasp\nerror');
    const structure = telem.getEnum();
    assert.deepEqual(structure.items.map((i) => i.path), ['idle', 'mission', 'mission/goto', 'mission/grasp', 'error'], 'a parent is declared by its children');
    assert.deepEqual(telem.getEdges().edges, [{ from: 'idle', to: 'mission/goto', event: 'start' }, { from: 'mission/goto', to: 'mission/grasp', event: 'arrived' }, { from: 'error', to: 'idle', event: 'reset' }]);
    assert.equal(telem.hasContent(), false, 'a structure alone has nothing to display');
    assert.equal(telem.hasStructure(), true);

    T.parseDataText('robot.mode:5000:scan,report|enum');
    assert.deepEqual(telem.getEnum().items.map((i) => i.path), ['scan', 'report'], 'a newer time: a whole new structure');
    assert.deepEqual(telem.getEnum(3).items.map((i) => i.path).slice(0, 2), ['idle', 'mission'], 'the one in force at a time');
    assert.equal(telem.getEnum(0.5), undefined, 'before the first one: none');
    T.parseDataText('robot.mode:1000:idle,mission/goto,mission/grasp|enum');
    assert.equal(telem.data[ENUM].timestamps.length, 2, 'a part sent again changes nothing');
});

test('kinds: "#kind" at the end of a path, free text; a path without one keeps the kind it had', () => {
    const T = loadTeleplot();
    T.parseDataText('robot.bt:1000:root#fallback,root/patrol#sequence,root/patrol/battery_ok#condition,root/dock|enum');
    T.parseDataText('robot.bt:1000:root/patrol,root/dock#an action%2C long|enum');
    const items = T.datastore.getTelemetry('robot.bt').getEnum().items;
    assert.deepEqual(items.map((i) => [i.path, i.kind]), [['root', 'fallback'], ['root/patrol', 'sequence'], ['root/patrol/battery_ok', 'condition'], ['root/dock', 'an action%2C long']]);
    assert.equal(T.protocol.decodeName('an action%2C long'), 'an action, long', 'names keep their %XX: read with decodeName');
});

test('edges lines must be from>to: a line that is not is not understood', () => {
    const T = loadTeleplot();
    assert.equal(T.parseDataText('m:1000:idle-run|edges'), 1);
    assert.equal(T.parseDataText('m:1000:idle>run=go|edges'), 0);
});

test('the same time again from a board (time since boot): the same date, so parts stay one sample', () => {
    const T = loadTeleplot();
    const board = T.connection.addConnectionLocal('Board');
    board.sendText('robot.bt:1000:root,root/a|enum', T0 + 50);
    board.sendText('robot.bt:1000:root/b|enum', T0 + 20); // (faster: the offset comes down, the part keeps the date of the first one)
    const entry = T.datastore.getTelemetry('robot.bt').data[ENUM];
    assert.equal(entry.timestamps.length, 1);
    assert.equal(entry.data[0][0], 'root\nroot/a\nroot/b');
    board.sendText('robot.bt:2000:root/a=failure|stack', T0 + 1030);
    board.sendText('robot.bt:2000:root/b|stack', T0 + 1025);
    assert.deepEqual(T.datastore.getTelemetry('robot.bt').data[TEXT].data[0], ['root/a=failure,root/b'], 'two lines of one tick: one sample with both paths');
});

test('a stack line without a time is dated on arrival: never a part of another one', () => {
    const T = loadTeleplot();
    T.parseDataText({ data: 'task:loop/plan|stack\ntask:loop/act|stack', timestamp: T0 });
    assert.deepEqual(T.datastore.getTelemetry('task').data[TEXT].data[0], ['loop/plan', 'loop/act']);
});

test('binary: enum and edges sections, parts with the same time merged; stack texts with the same time merged', () => {
    const T = loadTeleplot();
    T.parseDataBinary(new PacketBuilder(4).attrs(1, [[0, 'robot.bt'], [10, true]])
        .enums(1, 1e9, [[0, 'root#fallback\nroot/patrol'], [0, 'root/dock']]).edges(1, 1e9, [[0, 'root>root/dock']])
        .text(1, 2e9, [[0, 'root/patrol=failure'], [0, 'root/dock']]).build());
    const telem = T.datastore.getTelemetry(4 * 0x10000 + 1);
    assert.deepEqual(telem.getEnum().items.map((i) => i.path + '#' + i.kind), ['root#fallback', 'root/patrol#', 'root/dock#']);
    assert.deepEqual(telem.getEdges().edges, [{ from: 'root', to: 'root/dock', event: '' }]);
    assert.deepEqual(telem.data[TEXT].data[0], ['root/patrol=failure,root/dock']);
});

test('structures are kept: not thinned, the one in force stays when the data window moves on', () => {
    const T = loadTeleplot();
    T.state.dataTimeout = 10;
    T.parseDataText('m:1000:a,b|enum\nm:2000:a,b,c|enum\nm:30000:a,b,c,d|enum\nm:1000:a|t\nm:50000:b|t');
    const telem = T.datastore.getTelemetry('m');
    telem.__deleteTimedOutData();
    assert.deepEqual(telem.data[ENUM].timestamps, [2, 30], 'the one in force when the window starts stays');
    assert.equal(telem.thinOldest(1), 0, 'the texts are too few, and a structure is never thinned');
});

const SM = [
    'robot.mode:1000:idle,mission/goto,mission/grasp,dock,error|enum',
    'robot.mode:1000:idle>mission=start,mission/goto>mission/grasp=arrived,mission/grasp>idle=done,mission>dock=battery low,dock>idle=charged,mission>error=fault,dock>error=fault,error>idle=reset|edges',
    'robot.mode:11000:idle|stack', 'robot.mode:12000:mission/goto|stack', 'robot.mode:15400:mission/grasp|stack', 'robot.mode:16100:error|stack',
].join('\n');
const BT = [
    'robot.bt:1000:root#fallback,root/patrol#sequence,root/patrol/battery_ok#condition,root/patrol/goto#action,root/dock#action|enum',
    'robot.bt:2000:root/patrol/battery_ok=success,root/patrol/goto|stack', 'robot.bt:2100:root/patrol/battery_ok=failure,root/patrol=failure,root/dock|stack',
].join('\n');

test('graph model: nodes of the structure and of what runs, the active path, statuses, the last change', () => {
    const T = loadTeleplot();
    T.parseDataText(SM);
    const G = T.view.ViewGraph, telem = T.datastore.getTelemetry('robot.mode');
    let model = G.model(telem);
    assert.deepEqual(model.order, ['idle', 'mission', 'mission/goto', 'mission/grasp', 'dock', 'error']);
    assert.deepEqual(model.roots, ['idle', 'mission', 'dock', 'error']);
    assert.deepEqual(model.order.filter((p) => model.nodes.get(p).active), ['error']);
    assert.deepEqual(model.edges.filter((e) => e.last).map((e) => e.from + '>' + e.to), ['mission>error'], 'from what held the previous state');
    model = G.model(telem, 15.5);
    assert.deepEqual(model.order.filter((p) => model.nodes.get(p).active), ['mission', 'mission/grasp'], 'the time shown: the last sample at or before it');
    assert.deepEqual(model.edges.filter((e) => e.last).map((e) => e.event), ['arrived']);
    assert.equal(G.model(telem, 12.5).edges.filter((e) => e.last).map((e) => e.event).join(), 'start', 'into a state that holds others');
    assert.equal(G.model(telem, 5).time, undefined, 'before the first sample: nothing runs');
    // A path that is not in the structure: drawn, marked as not declared
    T.parseDataText('robot.mode:17000:calibrate|stack');
    model = G.model(telem);
    assert.deepEqual([model.nodes.get('calibrate').declared, model.nodes.get('calibrate').active, model.nodes.get('idle').declared], [false, true, true]);
});

test('graph model of a tree: results, kinds, implied running parents; colors from the status only', () => {
    const T = loadTeleplot();
    T.parseDataText(BT);
    const G = T.view.ViewGraph, telem = T.datastore.getTelemetry('robot.bt');
    let model = G.model(telem);
    const show = (m) => m.order.map((p) => { let n = m.nodes.get(p); return n.name + (n.kind ? '#' + n.kind : '') + ':' + (n.state === undefined ? '-' : n.state === '' ? 'run' : n.state); });
    assert.deepEqual(show(model), ['root#fallback:run', 'patrol#sequence:failure', 'battery_ok#condition:failure', 'goto#action:-', 'dock#action:run']);
    assert.equal(model.hasEdges, false);
    assert.deepEqual(model.order.map((p) => G.colorOf(model.nodes.get(p))), ['primary', 'error', 'error', undefined, 'primary']);
    assert.deepEqual(show(G.model(telem, 2.05)), ['root#fallback:run', 'patrol#sequence:run', 'battery_ok#condition:success', 'goto#action:run', 'dock#action:-']);
    assert.equal(G.colorOf({ state: 'skipped' }), 'muted', 'a word not known: muted');
    assert.equal(G.colorOf({ state: 'timeout' }), 'warn');
    assert.equal(G.colorOf({ state: 'done' }), 'ok');
});

test('graph layout: a tree top-down, parents over their children; a graph in layers, boxes around what they hold', () => {
    const T = loadTeleplot();
    T.parseDataText(BT + '\n' + SM);
    const G = T.view.ViewGraph;
    let tree = G.layout(G.model(T.datastore.getTelemetry('robot.bt')));
    const b = (layout, path) => layout.boxes.get(path);
    assert.equal(tree.tree, true);
    assert.ok(b(tree, 'root').y < b(tree, 'root/patrol').y && b(tree, 'root/patrol').y < b(tree, 'root/patrol/goto').y, 'a level per depth');
    assert.ok(b(tree, 'root/patrol/battery_ok').x + b(tree, 'root/patrol/battery_ok').w <= b(tree, 'root/patrol/goto').x, 'children side by side, in order');
    const center = (box) => box.x + box.w / 2;
    assert.ok(Math.abs(center(b(tree, 'root/patrol')) - (b(tree, 'root/patrol/battery_ok').x + b(tree, 'root/patrol/goto').x + b(tree, 'root/patrol/goto').w) / 2) < 1, 'a parent over its children');
    let graph = G.layout(G.model(T.datastore.getTelemetry('robot.mode')));
    assert.equal(graph.tree, false);
    let mission = b(graph, 'mission'), goto = b(graph, 'mission/goto'), grasp = b(graph, 'mission/grasp');
    assert.equal(mission.composite, true);
    for (const inner of [goto, grasp]) assert.ok(inner.x >= mission.x && inner.x + inner.w <= mission.x + mission.w && inner.y >= mission.y && inner.y + inner.h <= mission.y + mission.h, 'inside its box');
    assert.ok(goto.y + goto.h <= grasp.y, 'goto before grasp (arrived): inside a box, layers go top to bottom');
    assert.ok(b(graph, 'idle').x + b(graph, 'idle').w < mission.x && mission.x + mission.w < b(graph, 'dock').x, 'layers follow the edges: idle, mission, dock');
    assert.ok(graph.width > 0 && graph.height > 0);
});

test('recent path: the last runs with their events and durations; a tree: the leaves and the results', () => {
    const T = loadTeleplot();
    T.parseDataText(SM + '\n' + BT);
    const G = T.view.ViewGraph;
    const runs = G.trail(T.datastore.getTelemetry('robot.mode'));
    assert.deepEqual(runs.map((r) => [r.event, r.leaves.join(), r.end === undefined ? 'now' : Math.round((r.end - r.time) * 10) / 10]), [['', 'idle', 1], ['start', 'goto', 3.4], ['arrived', 'grasp', 0.7], ['fault', 'error', 'now']]);
    assert.deepEqual(G.trail(T.datastore.getTelemetry('robot.mode'), 13).map((r) => r.leaves.join()), ['idle', 'goto'], 'up to the time shown');
    const tree = G.trail(T.datastore.getTelemetry('robot.bt'));
    assert.deepEqual(tree.map((r) => [r.leaves.join(), r.results.map((x) => x.name + ' ' + x.status).join()]), [['goto', 'battery_ok success'], ['dock', 'battery_ok failure,patrol failure']]);
    const ran = G.runsOf(T.datastore.getTelemetry('robot.mode'), 'mission');
    assert.deepEqual([ran.count, Math.round(ran.last * 10) / 10, ran.running], [1, 4.1, false], 'how long a node ran, for its tip');
});

test('graph: the view of a state or a stack with a structure; the auto dashboard gives a stack its lane too; values view of a stack', () => {
    const T = loadTeleplot();
    let created = [];
    T.dashboards.enableAutoDashboard('Live', (d) => created.push(d));
    T.parseDataText(SM + '\n' + BT + '\nplain:a/b|stack\nm2:0:x,y|enum\nm2:x|t');
    T.__timers.run();
    assert.deepEqual(['robot.mode', 'robot.bt', 'plain', 'm2'].map((n) => T.view.suggestViewType(n)), ['graph', 'graph', 'timeline', 'graph']);
    const views = T.dashboards.getDashboard('Live').getView().views;
    const types = views.map((v) => v.type + ':' + v.telemetryIdOrNameList.map((id) => T.datastore.getTelemetry(id).getAttribute(0)).join('+'));
    assert.deepEqual(types, ['teleplot-graph:robot.mode', 'teleplot-timeline:robot.mode+robot.bt+plain', 'teleplot-graph:robot.bt', 'teleplot-graph:m2']);
    assert.ok(new T.view.ViewGraph('', []).suitsTelemetry(T.datastore.getTelemetry('robot.bt')));
    assert.equal(T.view.createView('graph', ['robot.bt']).type, 'teleplot-graph');
    // The values view: what runs is the value, where it runs and the results under it
    const V = T.view.ViewCurrentValue;
    assert.deepEqual(V.stackSummary('mission/grasp'), { value: 'grasp', where: 'mission', results: [] });
    assert.deepEqual(V.stackSummary('root/patrol/battery_ok=failure,root/patrol=failure,root/dock'), { value: 'dock', where: 'root', results: [{ name: 'battery_ok', status: 'failure', level: 2 }, { name: 'patrol', status: 'failure', level: 2 }] });
    assert.deepEqual(V.stackSummary('nav/follow,arm/idle').value, 'follow, idle');
});

test('files: structures and stacks with several paths come back as they were, in text and binary; a period gets the structure in force', () => {
    const T = loadTeleplot();
    T.parseDataText(SM + '\n' + BT + '\nrobot.bt:5000:root#sequence,root/scan%2Cfast#action|enum');
    const store = (X) => ['robot.mode', 'robot.bt'].map((name) => { let t = X.datastore.getTelemetry(name); return [ENUM, EDGES, TEXT].map((type) => t.data[type] ? [t.data[type].timestamps, t.data[type].data[0]] : null); });
    const text = T.files.exportText().parts.join('');
    assert.match(text, /robot\.bt:5000:root#sequence,root\/scan%2Cfast#action\|enum/);
    assert.match(text, /robot\.bt:2100:root\/patrol\/battery_ok=failure,root\/patrol=failure,root\/dock\|stack/);
    const U = loadTeleplot();
    assert.equal(U.files.importData(text).problems, 0);
    assert.deepEqual(store(U), store(T));
    const parts = T.files.exportBinary().parts, bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0; for (const p of parts) { bytes.set(p, at); at += p.length; }
    const V = loadTeleplot();
    assert.equal(V.files.importData(bytes).problems, 0);
    assert.deepEqual(store(V), store(T));
    const period = T.files.exportText({ from: 2.05, to: 3 }).parts.join('');
    assert.match(period, /robot\.bt:1000:root#fallback/, 'the structure in force when the period starts');
});
