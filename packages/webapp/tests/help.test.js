// components/panel-help.js: every message the Help panel shows must be understood by the library's text parser
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../teleplot-js/tests/helpers/load');

const code = fs.readFileSync(path.join(__dirname, '..', 'components', 'panel-help.js'), 'utf8');
const { HELP_EXAMPLES, HELP_SHORTCUTS, HELP_TILES, HELP_FAMILIES, HELP_CONCEPTS, HELP_SENDERS, helpLine, helpDescribe, helpPicture, helpParts, HELP_PART_TIPS, helpVary, helpFill } = new Function(code + '\nreturn { helpVary, helpFill, HELP_EXAMPLES, HELP_SHORTCUTS, HELP_TILES, HELP_FAMILIES, HELP_CONCEPTS, HELP_SENDERS, helpLine, helpDescribe, helpPicture, helpParts, HELP_PART_TIPS };')();
const tile = (id) => HELP_TILES.find(t => t.id == id);
// {now} in a message is the time of the page: here a fixed one (the time the expectations use)
const NOW = 1627551892437;
const templates = new Map(); // filled message -> its template (with {now})
for (const example of HELP_EXAMPLES) {
    templates.set(helpFill(example.code, NOW), example.code);
    example.code = helpFill(example.code, NOW);
    if (example.cycle) example.cycle = example.cycle.map(c => helpFill(c, NOW));
}
const lines = (id, more) => [...tile(id).examples, ...(more ? tile(id).more || [] : [])].map(e => e.code);

const find = (T, name) => Object.values(T.datastore.telemetries).find(t => t.attributes[T.protocol.TELEM_ATTR_NAME] === name);

for (const example of HELP_EXAMPLES) {
    test('help example is parsed: ' + example.code, () => {
        const T = loadTeleplot();
        T.parseDataText(example.code);
        const P = T.protocol, e = example.expect;
        if (e.dashboard) {
            T.__timers.run();
            assert.ok(T.dashboards.getDashboard(e.dashboard), 'dashboard ' + e.dashboard + ' exists');
            if (!e.name) return; // A dashboard line: no telemetry
        }
        if (e.log) {
            const logs = Object.values(T.datastore.telemetries).filter(t => t.data[P.SECTION_TYPE_TELEM_DATA_TEXT]);
            assert.equal(logs.length, 1);
            assert.equal(logs[0].data[P.SECTION_TYPE_TELEM_DATA_TEXT].data[0][0], example.code.slice(example.code.indexOf(':') + 1));
            return;
        }
        const telem = find(T, e.name);
        assert.ok(telem, 'telemetry ' + e.name + ' exists');
        const S = T.view.ViewScene3D;
        if (e.range) { assert.deepEqual(telem.getRange(), { min: e.range[0], max: e.range[1] }); return; }
        // Commands: what the page can change or call
        if (e.write) { assert.equal(T.commands.declaration(telem).type, e.write); if (e.view) assert.equal(T.view.suggestViewType(telem.id), e.view); return; }
        if (e.action) { assert.equal(T.commands.isAction(telem), true); return; }
        if (e.args) { assert.deepEqual(T.commands.args(telem).map((a) => a.name), e.args); return; }
        if (e.answer) { assert.deepEqual(telem.data[P.SECTION_TYPE_TELEM_DATA_TEXT].data[0], [e.answer]); return; }
        if (e.thresholds) { // "name<value,color", lowest first
            assert.deepEqual(telem.getThresholds().map(t => t.name + (t.operator === P.THRESHOLD_ABOVE ? '>' : '<') + t.value + (t.color ? ',' + t.color : '')), e.thresholds);
            return;
        }
        if ('label' in e) assert.equal(telem.attributes[P.TELEM_ATTR_VIEW_LABEL], e.label);
        if (e.position) assert.deepEqual(S.shapeState(telem).position, e.position);
        if (e.camera) {
            const camera = S.cameraState(telem);
            assert.deepEqual([camera.fx, camera.fy, camera.cx, camera.cy, camera.width, camera.height, camera.position], [55, 55, 32, 24, 64, 48, [0, 0, 1]]);
            return;
        }
        if (e.distortion) { // (alone it is not a camera yet: the intrinsics come with the K line)
            assert.deepEqual(telem.data[P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION].data.map(channel => channel[0]), e.distortion);
            return;
        }
        if (e.image) {
            const entry = telem.data[P.SECTION_TYPE_TELEM_DATA_IMAGE];
            assert.deepEqual([entry.timestamps.length, entry.data[0][0], entry.data[1][0]], [1, P.IMAGE_TYPE_PNG, example.code.slice(example.code.indexOf(':') + 1)]);
            assert.equal(T.view.suggestViewType(telem.id), 'image');
            return;
        }
        if (e.cloud) { // A point cloud: one sample holding that many points, displayed in a 3D view
            const entry = telem.data[P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD];
            assert.deepEqual([entry.timestamps.length, entry.data[0][0].length / 3, !!entry.data[1][0]], [1, e.cloud, !!e.intensity]);
            assert.equal(T.view.suggestViewType(telem.id), e.view || '3d');
            return;
        }
        if (e.shape) {
            const types = { cube: P.TELEM_ATTR_SHAPE_TYPE_CUBE, sphere: P.TELEM_ATTR_SHAPE_TYPE_SPHERE, rect: P.TELEM_ATTR_SHAPE_TYPE_RECT, line: P.TELEM_ATTR_SHAPE_TYPE_LINE,
                polygon: P.TELEM_ATTR_SHAPE_TYPE_POLYGON, arrow: P.TELEM_ATTR_SHAPE_TYPE_ARROW, text: P.TELEM_ATTR_SHAPE_TYPE_TEXT };
            if (e.position) return; // (a line that only moves a shape described before: its place was checked above)
            assert.equal(S.shapeState(telem).type, types[e.shape]);
            if (e.frame) assert.deepEqual(telem.attributes[P.TELEM_ATTR_FRAME], { type: P.FRAME_TYPE_POSE, name: e.frame });
            if (e.pixels) { assert.equal(S.pixelFrame(telem), e.pixels); return; }
            assert.equal(T.view.suggestViewType(telem.id), e.view || '3d');
            return;
        }
        if (!e.type) return; // (a line that only moves something: checked above)
        const type = { number: P.SECTION_TYPE_TELEM_DATA_NUMBER, '2d': P.SECTION_TYPE_TELEM_DATA_NUMBER_2D, '3d': P.SECTION_TYPE_TELEM_DATA_NUMBER_3D, text: P.SECTION_TYPE_TELEM_DATA_TEXT }[e.type];
        assert.ok(telem.data[type], 'has data of type ' + e.type);
        if (e.samples) assert.equal(telem.data[type].timestamps.length, e.samples);
        if ('text' in e) assert.deepEqual(telem.data[type].data[0], [e.text]);
        if (e.timestamp) assert.deepEqual(telem.data[type].timestamps, [e.timestamp]);
        if ('logText' in e) assert.equal(telem.attributes[P.TELEM_ATTR_LOG], e.logText, 'emitted as a log, or as a state');
        if (e.stack) assert.equal(telem.attributes[P.TELEM_ATTR_STACK], true, 'a stack');
        if (e.view) assert.equal(T.view.suggestViewType(telem.id), e.view);
        if (e.unit) assert.equal(telem.attributes[P.TELEM_ATTR_UNIT], e.unit);
        if (e.autoplot === false) assert.equal(telem.attributes[P.TELEM_ATTR_AUTOPLOT], false);
    });
}

// A tile alone, on a fresh page (the Live dashboard on, as in the webapp): its lines one after the other, a second apart. Returns the
// library and what the dashboards show: "Dashboard: type[title](telemetries) ..."
const runTile = (id, more) => {
    const T = loadTeleplot();
    T.dashboards.enableAutoDashboard('Live');
    lines(id, more).forEach((code, i) => { assert.equal(T.parseDataText({ data: code, timestamp: 2000 + i * 1000 }), 0, code); T.__timers.run(); });
    const name = (id) => { const t = T.datastore.getTelemetry(id); return t ? t.getAttribute(T.protocol.TELEM_ATTR_NAME) : id; };
    const walk = (v) => Array.isArray(v.views) ? v.views.map(walk).join(' ') : v.type.replace('teleplot-', '') + '[' + (v.getOption('title') || '') + '](' + v.telemetryIdOrNameList.map(name).join(',') + ')';
    const shown = Object.values(T.dashboards.dashboards).map(d => d.name + ': ' + walk(d.getView())).sort();
    return { T, shown };
};

test('each tile shows what it says by itself, on a fresh page: it never needs what another tile sent', () => {
    const expected = {
        curve: ['Live: chart[](temperature)'],
        together: ['Live: chart[motors](left,right)'],
        gauge: ['Live: current-value[](battery)'],
        state: ['Live: current-value[](mode)'],
        log: ['Live: log[logs](nav) log[](_text_logs)'],
        timeline: ['Live: current-value[](mode)', 'Robot: timeline[States](mode)'],
        marks: ['Live: chart[](velocity) current-value[](mode)', 'Robot: chart[Drive](velocity,mode)'],
        stack: ['Live: timeline[](task)'],
        trail: ['Live: 2d[](position)'],
        map: ['Live: 2d[field](robot,route)'],
        scene: ['Live: 3d[scene](box,ball)'],
        frames: ['Live: 2d[field](robot,heading,bumper)'],
        cloud: ['Live: 2d[](lidar)'],
        picture: ['Live: image[](camera)'],
        pixels: ['Live: image[](camera,found,found.name)'],
        camera: ['Live: image[](camera,marker) 3d[scene](marker,camera)'],
        dashboard: ['Live: chart[](voltage) log[](events)', 'Robot: chart[Power](voltage) log[Events](events)'],
        place: ['Robot: chart[Motion](speed,accel)'],
        settings: ['Live: current-value[Commands](speed_limit)'],
        actions: ['Live: current-value[Commands](reset)'],
        joystick: ['Live: joystick[](cmd_vel)'],
        pose: ['Live: 2d[](target)'],
    };
    assert.deepEqual(Object.keys(expected).sort(), HELP_TILES.filter(t => t.examples).map(t => t.id).sort(), 'every tile is checked');
    for (const id in expected) assert.deepEqual(runTile(id).shown, expected[id], id);
    // What the lines say they do
    let { T } = runTile('gauge');
    const battery = find(T, 'battery');
    assert.deepEqual([battery.getRange(), battery.getThresholdStatus(10.2).name, battery.getThresholds().map(t => t.name + t.value)], [{ min: 9, max: 12.6 }, 'low', ['empty9.9', 'low10.5']]);
    assert.deepEqual(T.view.ViewCurrentValue.gauge(battery, 10.2).bar.ticks.map(t => t.name), ['empty', 'low']);
    ({ T } = runTile('gauge', true));
    assert.deepEqual(find(T, 'battery').getThresholds(NOW / 1000).map(t => t.name + t.value), ['empty9.9', 'low10.8'], 'the limit that changes, from its time on');
    ({ T } = runTile('curve', true));
    assert.deepEqual(find(T, 'temperature').data[T.protocol.SECTION_TYPE_TELEM_DATA_NUMBER].data[0], [25.3], 'clr forgot the samples sent before');
    ({ T } = runTile('together', true));
    assert.ok(find(T, 'debug') && runTile('together', true).shown.length == 1, 'debug is kept apart');
    ({ T } = runTile('map'));
    assert.deepEqual(T.view.ViewScene3D.shapeState(find(T, 'robot')).position, [1.5, 1, 0], 'the robot moved');
    ({ T } = runTile('frames'));
    assert.deepEqual(T.view.ViewScene3D.shapeState(find(T, 'bumper')).position.map(v => Math.round(v * 1000) / 1000), [1.639, 1.143, 0], 'the bumper followed the robot: in front of it, where it looks');
    ({ T } = runTile('scene'));
    assert.deepEqual([T.view.ViewScene3D.shapeState(find(T, 'box')).position, T.view.ViewScene3D.shapeState(find(T, 'box')).type, Math.round(T.view.ViewScene3D.shapeState(find(T, 'ball')).opacity * 10) / 10], [[2, 0, 0.5], T.protocol.TELEM_ATTR_SHAPE_TYPE_CUBE, 0.5], 'the box moved and is still a cube');
    ({ T } = runTile('cloud'));
    assert.deepEqual([T.view.ViewScene3D.kindOf(find(T, 'lidar')), T.view.ViewScene3D.shapeState(find(T, 'lidar')).position], ['cloud', [1, 2, 0.2]]);
    ({ T } = runTile('camera'));
    assert.deepEqual(T.view.ViewScene3D.cameraState(find(T, 'camera')).distortion, [-0.26, 0.07, 0, 0, 0]);
    ({ T } = runTile('dashboard', true));
    assert.deepEqual(T.dashboards.exportText('Robot').split('\n'), ['DASH|Robot:grid', 'DASH|Robot/side:column', 'DASH|Robot/side/Events:log:events|maxLines=50'], 'a layout, and Power removed');
    ({ T } = runTile('stack'));
    const tasks = T.dashboards.getDashboard('Live').getView().views[0];
    tasks.update();
    assert.deepEqual(tasks.lanes[0].rows.map(row => row.map(i => i.label + ' ' + i.from + '-' + i.to)), [['loop 2-5'], ['plan 3-5'], ['search 4-5']], 'loop is one band while what it runs changes; the empty text ends it');
});

test('sending a line again shows a change: texts go through their cycle, numbers are nudged', () => {
    // (What does not change on purpose: descriptions said once, pictures, the steps of a stack, nothing, the lens of a camera)
    const changing = HELP_EXAMPLES.filter(e => !/^(ATTR|TH|DASH|PNG|JPG)\|/.test(e.code) && !/^task:/.test(e.code) && !/:\|t$/.test(e.code) && !/:DC:/.test(e.code));
    for (const example of changing) {
        const again = example.cycle ? example.cycle[0] : helpVary(templates.get(example.code) || example.code);
        assert.notEqual(helpFill(again, NOW), example.code, 'sent again, it changes: ' + example.code);
    }
    for (const example of HELP_EXAMPLES.filter(e => e.cycle)) for (const code of example.cycle) {
        const T = loadTeleplot();
        assert.equal(T.parseDataText(code), 0, code);
        assert.equal(helpDescribe(T, code, 0).ok, true, code);
        assert.deepEqual(helpParts(code).filter(p => p.label == 'name').map(p => p.text), helpParts(example.code).filter(p => p.label == 'name').map(p => p.text), 'the same telemetry: ' + code);
    }
    // A state cycled on a timeline: a band per send
    const T = loadTeleplot();
    const timeline = tile('timeline').examples[1];
    T.parseDataText(tile('timeline').examples[0].code);
    [timeline.code, ...timeline.cycle].forEach((code, i) => T.parseDataText({ data: code, timestamp: 1000 * (i + 1) }));
    T.__timers.run();
    const view = T.dashboards.getDashboard('Robot').getView().views[0];
    view.update();
    assert.deepEqual(view.lanes[0].items.map(i => i.text), ['driving', 'turning', 'parked']);
});

test('More ways have a title each', () => {
    for (const t of HELP_TILES) for (const m of t.more || []) assert.ok(m.title && m.title.length <= 24, t.id + ': ' + m.code);
});

test('helpFill gives {now} the time of the page', () => {
    assert.equal(helpFill('a:{now}:1', 5000), 'a:5000:1');
    assert.equal(helpFill('a:{now-200}:1;{now+50}:2', 5000.4), 'a:4800:1;5050:2');
    assert.equal(helpFill('no time:1'), 'no time:1');
});

test('shortcuts listed in the help exist in the top menu', () => {
    const menu = fs.readFileSync(path.join(__dirname, '..', 'components', 'top-menu.js'), 'utf8');
    for (const key of ['T', 'S', 'X', 'H', 'E', 'C']) assert.ok(HELP_SHORTCUTS.some(s => s.keys === key), key + ' is documented');
    for (const key of ['T', 'S', 'X', 'H']) assert.ok(menu.includes('key: "' + key + '"'), key + ' is bound');
    assert.ok(menu.includes('key == "c"'), 'C is bound');
});


test('the gallery starts with one number; every tile has a family, a picture, and what it needs', () => {
    assert.equal(HELP_TILES[0].examples[0].code, 'temperature:25.3');
    assert.equal(HELP_EXAMPLES.length, HELP_TILES.reduce((n, t) => n + (t.examples || []).length + (t.more || []).length, 0));
    assert.equal(new Set(HELP_TILES.map(t => t.id)).size, HELP_TILES.length, 'ids are unique');
    for (const t of HELP_TILES) {
        assert.ok(HELP_FAMILIES.some(f => f.id == t.family), t.id + ': family');
        assert.ok(t.title && t.sub && t.how && t.picture, t.id + ': text and picture');
        if (t.family == 'page') assert.ok(!t.examples && (t.keys || t.action), t.id + ': a tile of the page has no message');
        else assert.ok(t.examples.length > 0, t.id + ': lines to send');
    }
    for (const c of HELP_CONCEPTS) assert.ok(c.title && c.text.length && c.schema, c.id);
    for (const f of HELP_FAMILIES) assert.ok(HELP_TILES.some(t => t.family == f.id), f.id + ' has tiles');
});

test('every picture and schematic is drawn', () => {
    for (const kind of [...HELP_TILES.map(t => t.picture), ...HELP_CONCEPTS.map(c => c.schema)]) {
        const svg = helpPicture(kind);
        assert.match(svg, /^<svg [^]*<\/svg>$/, kind);
        assert.doesNotMatch(svg, /undefined|NaN/, kind);
        assert.ok(svg.replace(/<defs>.*?<\/defs>/g, '').length > 150, kind + ' has a drawing');
        for (const tag of svg.match(/<text [^>]*>/g) || []) for (const attr of ['font-size', 'fill']) assert.ok((tag.match(new RegExp(' ' + attr + '=', 'g')) || []).length <= 1, kind + ': ' + attr + ' given once in ' + tag);
    }
});

test('helpParts names the parts of a message, which join back to it', () => {
    const named = (message) => helpParts(message).filter(p => p.label).map(p => p.label + '=' + p.text);
    for (const example of HELP_EXAMPLES) {
        const parts = helpParts(example.code);
        assert.equal(parts.map(p => p.text).join(''), example.code);
        assert.ok(parts.some(p => ['name', 'dashboard/view', 'log'].includes(p.label)), example.code + ': what it is about');
        for (const p of parts) if (p.label) assert.ok(HELP_PART_TIPS[p.label], example.code + ': a tip for ' + p.label);
    }
    assert.deepEqual(named('temperature:25.3'), ['name=temperature', 'value=25.3']);
    assert.deepEqual(named('temperature:1627551892437:25.3§°C|np'), ['name=temperature', 'time=1627551892437', 'value=25.3', 'unit=°C', 'not charted=np']);
    assert.deepEqual(named('left,motors:0.4'), ['name=left', 'label=motors', 'value=0.4']);
    assert.deepEqual(named('speed:1000:1.2;1010:1.3'), ['name=speed', 'time=1000', 'value=1.2'], 'only the first sample is named');
    assert.deepEqual(named('mode:1627551892437:turning|t'), ['name=mode', 'time=1627551892437', 'text=turning', 'state=t']);
    assert.deepEqual(named('nav:Path: clear|log'), ['name=nav', 'log line=Path: clear', 'log=log']);
    assert.deepEqual(named('position:12.5:4.2:1000|xy'), ['name=position', 'x:y=12.5:4.2', 'time=1000', '2D point=xy']);
    assert.deepEqual(named('lidar:9000;1:0:0;0:1:0|pc'), ['name=lidar', 'time=9000', 'x:y:z=1:0:0', 'point cloud=pc']);
    assert.deepEqual(named('3D|box,scene:S:cube:P:1:0:0.5:W:1:C:orange'), ['3D shape=3D|', 'name=box', 'label=scene', 'kind=S:cube', 'position=P:1:0:0.5', 'width=W:1', 'color=C:orange']);
    assert.deepEqual(named('2D|goal:S:text:P:3:2:TX:"Goal: A"'), ['2D shape=2D|', 'name=goal', 'kind=S:text', 'position=P:3:2', 'text=TX:"Goal: A"'], 'a quoted text holds its colon');
    assert.deepEqual(named('ATTR|battery|min=9|max=12.6'), ['attributes=ATTR|', 'name=battery', 'lowest=min=9', 'highest=max=12.6']);
    assert.deepEqual(named('TH|battery:1000:low<10.5:empty<9.9,red'), ['thresholds=TH|', 'name=battery', 'time=1000', 'limit=low<10.5', 'limit=empty<9.9', 'color=red']);
    assert.deepEqual(named('DASH|Robot/Motion:chart:speed,mode|w=3'), ['dashboard=DASH|', 'dashboard/view=Robot/Motion', 'view type=chart', 'telemetries=speed,mode', 'option=w=3']);
    assert.deepEqual(named('ACK|reset#12:ok'), ['answer=ACK|', 'name=reset', 'call number=#12', 'result=ok']);
    assert.deepEqual(named('>:Motors armed'), ['log=>', 'text=Motors armed']);
    assert.deepEqual(named('TH|temp:1000:hot>70;2000:hot>75'), ['thresholds=TH|', 'name=temp', 'time=1000', 'limit=hot>70', 'time=2000', 'limit=hot>75']);
    assert.deepEqual(named('mode:|t'), ['name=mode', 'state=t'], 'an empty text: nothing to name');
    assert.deepEqual(named('task:loop/plan/search|stack'), ['name=task', 'path=loop/plan/search', 'stack=stack']);
    assert.deepEqual(named('DASH|Robot'), ['dashboard=DASH|', 'dashboard/view=Robot']);
    assert.deepEqual(named('drone:1:2:3:1000|xyz'), ['name=drone', 'x:y:z=1:2:3', 'time=1000', '3D point=xyz']);
    for (const typing of ['', 'te', 'temperature:', 'ATTR|', '3D|box:Q', 'TH|x:', 'a:1|']) assert.equal(helpParts(typing).map(p => p.text).join(''), typing, 'while typing: ' + typing);
});

test('helpVary nudges the numbers of a message, so that sending it again shows a change; what it changes is still understood', () => {
    let seed = 1;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const example of HELP_EXAMPLES) {
        const varied = helpVary(example.code, random);
        const T = loadTeleplot();
        assert.equal(T.parseDataText(varied), 0, varied);
        assert.deepEqual(helpParts(varied).map(p => p.label), helpParts(example.code).map(p => p.label), 'same parts: ' + varied);
    }
    const nums = (message) => helpVary(message, random);
    assert.notEqual(nums('temperature:25.3'), 'temperature:25.3');
    assert.match(nums('temperature:25.3'), /^temperature:[0-9]+\.[0-9]$/, 'same decimals');
    assert.match(nums('debug:42|np'), /^debug:[0-9]+\|np$/, 'an integer stays one');
    assert.match(nums('temperature:1627551892437:25.3§°C'), /^temperature:1627551892437:[0-9.]+§°C$/, 'the time is kept');
    assert.match(nums('2D|robot:P:1.5:1:R:0.8'), /^2D\|robot:P:[0-9.-]+:[0-9.-]+:R:[0-9.-]+$/);
    assert.notEqual(nums('2D|robot:P:1.5:1:R:0.8'), '2D|robot:P:1.5:1:R:0.8');
    for (const fixed of ['ATTR|battery|min=9|max=12.6', 'TH|battery:low<10.5:empty<9.9,red', 'mode:driving|t', 'DASH|Robot/Motion:chart|w=4|h=3', 'ACK|reset#12:ok', '>:Motors armed', '3D|box,scene:S:cube:W:1:D:1:H:1:C:orange'])
        assert.equal(nums(fixed), fixed, 'nothing to nudge: ' + fixed);
});

test('helpLine writes the line of each way to send; what a serial port receives is understood the same', () => {
    const text = (sender, example) => helpLine(sender, example).parts.map(p => p.text).join('');
    const number = HELP_EXAMPLES[0], log = HELP_EXAMPLES.find(e => e.expect.log), cloud = HELP_EXAMPLES.find(e => e.expect.cloud);
    assert.deepEqual(HELP_SENDERS.map(s => s.id), ['sh', 'py', 'cpp', 'ino']);
    assert.equal(text('sh', number), 'echo "temperature:25.3" | nc -u -w0 127.0.0.1 47269');
    assert.equal(text('py', number), 'sock.sendto("temperature:25.3".encode(), ("127.0.0.1", 47269))');
    assert.equal(text('cpp', number), 'Teleplot::instance().update("temperature", 25.3);');
    assert.equal(text('ino', number), 'Serial.println(">temperature:25.3");');
    assert.equal(text('ino', log), 'Serial.println("Motors armed");');
    assert.deepEqual([text('cpp', cloud), /C\+\+ client/.test(helpLine('cpp', cloud).note)], [cloud.code, true], 'no C++ call for it: the text line, and a word about it');
    assert.equal(helpLine('py', cloud).note, '');
    // The part between the quotes of every Arduino line, received on a serial port, gives the same telemetry as the UDP line
    for (const example of HELP_EXAMPLES) {
        const sent = /^Serial\.println\("(.*)"\);$/.exec(text('ino', example))[1];
        const T = loadTeleplot();
        assert.equal(T.parseDataText({ data: sent, fromSerial: true }), 0, sent);
        if (example.expect.log) continue;
        if (!example.expect.name) { assert.ok(T.dashboards.getDashboard(example.expect.dashboard), 'serial: ' + sent); continue; }
        assert.ok(find(T, example.expect.name), 'serial: ' + sent);
    }
});

test('helpDescribe tells what Teleplot made of a message sent from the panel', () => {
    for (const example of HELP_EXAMPLES) {
        const T = loadTeleplot();
        const answer = helpDescribe(T, example.code, T.parseDataText(example.code));
        assert.equal(answer.ok, true, example.code + ': ' + answer.text);
    }
    const say = (message) => { const T = loadTeleplot(); return helpDescribe(T, message, T.parseDataText(message)).text; };
    assert.match(say('temperature:25.3'), /a number named temperature.*Live dashboard/);
    assert.match(say('speed:1000:1.2;1010:1.3;1020:1.4'), /3 numbers named speed/);
    assert.match(say('position:12.5:4.2|xy'), /a position named position/);
    assert.match(say('state:forward|t'), /some text named state/);
    assert.match(say('events:Motors armed|log'), /a log line named events/);
    assert.match(say('lidar:1:0:0;0.7:0.7:0;0:1:0|pc'), /a point cloud of 3 points named lidar/);
    assert.match(say('3D|box:S:cube:P:1:0:0.5'), /a 3D shape named box/);
    assert.match(say('2D|robot:S:rect:P:1:2'), /a 2D shape named robot/);
    assert.match(say('2D|only:S:circle'), /a 2D shape named only/);
    assert.match(say('left,motors:0.4'), /named left\./);
    assert.match(say('debug:42|np'), /not charted automatically/);
    assert.match(say('>:Motors armed'), /a log line/);
    assert.match(say('speed,Robot/Motion:1.2'), /named speed\..*on the Robot dashboard/);
    assert.match(say('DASH|Robot/top/Motion:chart:speed'), /the view top\/Motion of the dashboard Robot/);
    assert.match(say('DASH|Robot:row'), /the layout of the dashboard Robot/);
    assert.match(say('DASH|Robot/Motion:none'), /is removed/);
    assert.match(say('ATTR|battery|min=9|max=12.6'), /battery is expected between 9 and 12\.6\. Now send its value, for example battery:9/);
    assert.match(say('ATTR|load|max=100'), /load is expected up to 100/);
    assert.match(say('ATTR|battery'), /has no range any more/);
    assert.match(say('TH|battery:low<10.5:empty<9.9,red'), /the thresholds of battery are empty below 9\.9, low below 10\.5\. Now send its value/);
    assert.match(say('TH|temp:hot>70'), /the threshold of temp is hot above 70/);
    assert.match(say('TH|temp:hot>'), /temp has no threshold any more/);
    assert.match(say('mode:|t'), /some text named mode/);
    assert.match(say('ATTR|kp|write|min=0|max=10'), /kp can be changed from the page \(number\)/);
    assert.match(say('ATTR|reset|action'), /reset is an action/);
    assert.match(say('ATTR|go|arg=to|type=xy'), /go takes 1 argument: to/);
    assert.match(say('ATTR|drive|write=xy|rate=20|hold=200'), /joystick/);
    assert.match(say('ACK|reset#3:ok'), /an answer of your device/);
    { // With its value already there, nothing more is asked for
        const T = loadTeleplot();
        T.parseDataText('battery:11');
        assert.doesNotMatch(helpDescribe(T, 'TH|battery:low<10.5', T.parseDataText('TH|battery:low<10.5')).text, /Now send/);
        assert.match(helpDescribe(T, 'ATTR|battery|min=9|max=12.6', T.parseDataText('ATTR|battery|min=9|max=12.6')).text, /has a bar/);
    }
    for (const wrong of ['hello', 'value:abc', 'bad:1:2:3;4:5|pc', 'DASH|Robot/Motion:pie', 'DASH|Robot/Motion:chart|w=wide', 'ATTR|battery|colour=red', 'ATTR|battery|min=low', 'TH|battery:low=10', 'TH|battery']) {
        const T = loadTeleplot();
        const answer = helpDescribe(T, wrong, T.parseDataText(wrong));
        assert.equal(answer.ok, false, wrong);
    }
});


test('the image and the camera of the help go together: sent one after the other, they make one telemetry', () => {
    const image = HELP_EXAMPLES.find(e => e.expect.image), camera = HELP_EXAMPLES.find(e => e.expect.camera);
    assert.equal(image.expect.name, camera.expect.name);
    const T = loadTeleplot();
    assert.equal(T.parseDataText(image.code + '\n' + camera.code), 0);
    const telem = find(T, image.expect.name);
    assert.ok(telem.data[T.protocol.SECTION_TYPE_TELEM_DATA_IMAGE] && T.view.ViewScene3D.cameraState(telem), 'an image telemetry that has a camera');
    assert.equal(Object.keys(T.datastore.telemetries).length, 1);
    assert.equal(T.view.suggestViewType(telem.id), 'image');
});


