// components/panel-help.js: every message the Help panel shows must be understood by the library's text parser
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../teleplot-js/tests/helpers/load');

const code = fs.readFileSync(path.join(__dirname, '..', 'components', 'panel-help.js'), 'utf8');
const { HELP_EXAMPLES, HELP_SHORTCUTS, HELP_STEPS, HELP_SENDERS, helpColorize, helpLine, helpDescribe } = new Function(code + '\nreturn { HELP_EXAMPLES, HELP_SHORTCUTS, HELP_STEPS, HELP_SENDERS, helpColorize, helpLine, helpDescribe };')();

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

test('examples of a step build on each other: sent in order, a step gives what it says', () => {
    const run = (title) => { const T = loadTeleplot(); T.dashboards.enableAutoDashboard('Live'); const step = HELP_STEPS.find(s => s.title == title); assert.equal(T.parseDataText(step.examples.map(e => e.code).join('\n')), 0); T.__timers.run(); return T; };
    const views = (T) => T.dashboards.getDashboard('Live').getView().views.map(v => v.type.replace('teleplot-', '') + ':' + (v.getOption('title') || '') + ':' + v.telemetryIdOrNameList.length);
    assert.deepEqual(views(run('Shown together: labels')), ['chart:motors:2'], 'the two motors share a chart, debug is left out');
    assert.deepEqual(views(run('3D shapes')), ['3d:scene:2'], 'both shapes in one scene');
    assert.deepEqual(views(run('2D drawings')), ['2d:field:4'], 'the four drawings on one map');
    let field = run('2D drawings');
    assert.deepEqual(field.view.ViewScene3D.shapeState(find(field, 'robot')).position, [1.5, 1, 0], 'the robot moved');
    field.parseDataText(HELP_STEPS.find(s => s.title == 'Frames: relative to something').examples.map(e => e.code).join('\n'));
    field.__timers.run();
    assert.deepEqual(views(field), ['2d:field:6']);
    assert.deepEqual(field.view.ViewScene3D.shapeState(find(field, 'bumper')).position.map(v => Math.round(v * 1000) / 1000), [1.639, 1.143, 0], 'in front of the robot, where it looks');
    let T = run('3D shapes');
    const S = T.view.ViewScene3D;
    assert.deepEqual([S.shapeState(find(T, 'box')).position, S.shapeState(find(T, 'box')).type, Math.round(S.shapeState(find(T, 'ball')).opacity * 10) / 10], [[2, 0, 0.5], T.protocol.TELEM_ATTR_SHAPE_TYPE_CUBE, 0.5], 'the box moved and is still a cube');
    T = run('A point cloud');
    assert.deepEqual([S.kindOf(find(T, 'lidar')), find(T, 'lidar').data[T.protocol.SECTION_TYPE_TELEM_DATA_POINT_CLOUD].timestamps.length, S.shapeState(find(T, 'lidar')).position], ['cloud', 2, [1, 2, 0.2]]);
    T = run('An image and its camera');
    assert.deepEqual(S.cameraState(find(T, 'camera')).distortion, [-0.26, 0.07, 0, 0, 0]);
    T = run('Several values, your own time');
    assert.deepEqual(find(T, 'speed').data[T.protocol.SECTION_TYPE_TELEM_DATA_NUMBER].data[0], [0], 'clr forgot the samples sent before');
    T = run('Text: states and logs');
    assert.deepEqual(views(T), ['current-value::1', 'log:logs:1', 'log::1']);
    // Ranges and thresholds: one telemetry, charted once, below its "low" limit; the limit sent with a time holds from that time only
    T = run('Ranges and thresholds');
    const battery = find(T, 'battery');
    assert.deepEqual(views(T), ['chart::1']);
    assert.deepEqual([battery.getRange(), battery.getThresholdStatus(10.2).name, battery.getThresholds().map(t => t.name + t.value)], [{ min: 9, max: 12.6 }, 'low', ['empty9.9', 'low10.5']]);
    assert.deepEqual(battery.getThresholds(1627551892.437).map(t => t.name + t.value), ['low10.8'], 'the one of 2021, at that time');
    assert.deepEqual(T.view.ViewCurrentValue.gauge(battery, 10.2).bar.ticks.map(t => t.name), ['empty', 'low']);
    // States over time: a timeline and a chart described by lines, the state as bands with a hole after it, and as marks
    T = loadTeleplot();
    T.dashboards.enableAutoDashboard('Live');
    assert.equal(T.parseDataText({ data: 'speed:1\nnav:Path clear|log\n' + HELP_STEPS.find(s => s.title == 'States over time, marks on a chart').examples.map(e => e.code).join('\n'), timestamp: 5000 }), 0);
    T.parseDataText({ data: 'speed:2', timestamp: 9000 });
    T.__timers.run();
    const robot = T.dashboards.getDashboard('Robot').getView().views;
    assert.deepEqual(robot.map(v => v.type), ['teleplot-timeline', 'teleplot-chart']);
    robot.forEach(v => v.update());
    assert.deepEqual(robot[0].lanes.map(l => [l.name, l.isLog, l.items.length]), [['mode', false, 0], ['nav', true, 1]], 'driving, then nothing at the same instant: no band');
    T.parseDataText({ data: 'mode:6000:driving|t\nmode:7000:|t\nmode:8000:parked|t' });
    robot.forEach(v => v.update());
    assert.deepEqual(robot[0].lanes[0].items.map(i => [i.from, i.to, i.text]), [[6, 7, 'driving'], [8, 9, 'parked']], 'a hole between the two');
    assert.deepEqual(robot[1].overlay.marks[0].marks.map(m => m.t + ' ' + m.text), ['5 driving', '6 driving', '8 parked'], 'the marks of the chart: where the state changes to something');
    // Stacks: the examples sent one after the other are a stack that goes down, comes back up and ends, in a timeline with a row per level
    T = loadTeleplot();
    HELP_STEPS.find(s => s.title == 'Stacks: what is running').examples.forEach((example, i) => T.parseDataText({ data: example.code.replace(':1627551892437.25:', ':'), timestamp: 10000 + i * 1000 }));
    T.__timers.run();
    const tasks = T.dashboards.getDashboard('Robot').getView().views[0];
    assert.deepEqual([tasks.type, tasks.getOption('stackDepth')], ['teleplot-timeline', 4]);
    tasks.update();
    assert.deepEqual(tasks.lanes[0].rows.map(row => row.map(i => i.label + ' ' + i.from + '-' + i.to)), [['loop 10-14'], ['plan 11-14'], ['search 12-13']], 'loop is one band while what it runs changes; the empty text ends it');
    // The dashboard step: the telemetries place themselves, the lines size their chart and add a column with a log
    T = loadTeleplot();
    T.dashboards.enableAutoDashboard('Live');
    assert.equal(T.parseDataText(HELP_STEPS.find(s => s.title == 'Your own dashboard').examples.map(e => e.code).join('\n')), 0);
    T.__timers.run();
    assert.equal(T.dashboards.getDashboard('Live'), undefined, 'nothing went to the Live dashboard');
    assert.deepEqual(T.dashboards.exportText('Robot').split('\n'), ['DASH|Robot:grid', 'DASH|Robot/Motion:chart:speed,accel|w=4|h=3', 'DASH|Robot/side:column', 'DASH|Robot/side/Log:log:nav,state|maxLines=50']);
});

test('shortcuts listed in the help exist in the top menu', () => {
    const menu = fs.readFileSync(path.join(__dirname, '..', 'components', 'top-menu.js'), 'utf8');
    for (const key of ['T', 'S', 'H', 'E']) assert.ok(HELP_SHORTCUTS.some(s => s.keys === key), key + ' is documented');
    for (const key of ['T', 'S', 'H']) assert.ok(menu.includes('key: "' + key + '"'), key + ' is bound');
});


test('the ladder goes from one number to images, and every example belongs to a step', () => {
    assert.equal(HELP_STEPS[0].examples[0].code, 'temperature:25.3');
    assert.equal(HELP_EXAMPLES.length, HELP_STEPS.reduce((n, step) => n + step.examples.length, 0));
    assert.ok(HELP_STEPS.every(step => step.title && step.examples.length > 0));
});

test('helpColorize cuts a message in its parts without changing it', () => {
    const kinds = (message) => helpColorize(message).filter(p => p.kind).map(p => p.kind + '=' + p.text);
    for (const example of HELP_EXAMPLES) assert.equal(helpColorize(example.code).map(p => p.text).join(''), example.code);
    assert.deepEqual(kinds('temperature:25.3'), ['name=temperature', 'value=25.3']);
    assert.deepEqual(kinds('temperature:1627551892437:25.3§°C|np'), ['name=temperature', 'time=1627551892437', 'value=25.3', 'unit=°C', 'flags=np']);
    assert.deepEqual(kinds('speed:1000:1.2;1010:1.3'), ['name=speed', 'time=1000', 'value=1.2', 'time=1010', 'value=1.3']);
    assert.deepEqual(kinds('position:12.5:4.2|xy'), ['name=position', 'value=12.5:4.2', 'flags=xy']);
    assert.deepEqual(kinds('position:12.5:4.2:1000|xy'), ['name=position', 'value=12.5:4.2', 'time=1000', 'flags=xy']);
    assert.deepEqual(kinds('drone:1:2:3:1000|xyz'), ['name=drone', 'value=1:2:3', 'time=1000', 'flags=xyz']);
    assert.deepEqual(kinds('state:forward|t'), ['name=state', 'value=forward', 'flags=t']);
    assert.deepEqual(kinds('events:1000:Motors armed|log'), ['name=events', 'value=1000:Motors armed', 'flags=log']);
    assert.deepEqual(kinds('lidar:9000;1:0:0;0:1:0|pc'), ['name=lidar', 'time=9000', 'value=1:0:0', 'value=0:1:0', 'flags=pc']);
    assert.deepEqual(kinds('3D|box:S:cube:P:1:0:0.5'), ['flags=3D|', 'name=box', 'value=S:cube:P:1:0:0.5']);
    assert.deepEqual(kinds('2D|robot,field:S:rect:P:1:2'), ['flags=2D|', 'name=robot,field', 'value=S:rect:P:1:2']);
    assert.deepEqual(kinds('>:Motors armed'), ['flags=>', 'value=Motors armed']);
    assert.deepEqual(kinds('DASH|Robot/Motion:chart:speed,accel|w=2|h=3'), ['flags=DASH|', 'name=Robot/Motion', 'value=chart:speed,accel', 'flags=w=2|h=3']);
    assert.deepEqual(kinds('DASH|Robot'), ['flags=DASH|', 'name=Robot']);
    assert.deepEqual(kinds('left,motors:0.4'), ['name=left,motors', 'value=0.4']);
    assert.deepEqual(kinds('ATTR|battery|min=9|max=12.6'), ['flags=ATTR|', 'name=battery', 'value=min=9|max=12.6']);
    assert.deepEqual(kinds('ATTR|battery'), ['flags=ATTR|', 'name=battery']);
    assert.deepEqual(kinds('TH|battery:low<10.5:empty<9.9,red'), ['flags=TH|', 'name=battery', 'value=low<10.5', 'value=empty<9.9,red']);
    assert.deepEqual(kinds('TH|temp:1000:hot>70;2000:hot>75'), ['flags=TH|', 'name=temp', 'time=1000', 'value=hot>70', 'time=2000', 'value=hot>75']);
    assert.deepEqual(kinds('TH|temp'), ['flags=TH|', 'name=temp']);
    assert.deepEqual(kinds('mode:|t'), ['name=mode', 'flags=t']);
    assert.deepEqual(kinds('task:loop/plan/search|stack'), ['name=task', 'value=loop/plan/search', 'flags=stack']);
    assert.deepEqual(kinds('half'), ['name=half'], 'a message being typed');
    assert.deepEqual(kinds(''), []);
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
    const step = HELP_STEPS.find(s => s.examples.some(e => e.expect.image));
    const image = step.examples.find(e => e.expect.image), camera = step.examples.find(e => e.expect.camera);
    assert.equal(image.expect.name, camera.expect.name);
    const T = loadTeleplot();
    assert.equal(T.parseDataText(image.code + '\n' + camera.code), 0);
    const telem = find(T, image.expect.name);
    assert.ok(telem.data[T.protocol.SECTION_TYPE_TELEM_DATA_IMAGE] && T.view.ViewScene3D.cameraState(telem), 'an image telemetry that has a camera');
    assert.equal(Object.keys(T.datastore.telemetries).length, 1);
    assert.equal(T.view.suggestViewType(telem.id), 'image');
});


test('the camera of the help joins the scene of the 3D shapes: one label for both steps', () => {
    const T = loadTeleplot();
    T.dashboards.enableAutoDashboard('Live');
    for (const title of ['3D shapes', 'An image and its camera']) {
        assert.equal(T.parseDataText(HELP_STEPS.find(s => s.title == title).examples.map(e => e.code).join('\n')), 0);
        T.__timers.run();
    }
    const names = (view) => view.telemetryIdOrNameList.map(id => T.datastore.getTelemetry(id).getAttribute(T.protocol.TELEM_ATTR_NAME)).sort().join(',');
    const views = T.dashboards.getDashboard('Live').getView().views;
    assert.deepEqual(views.map(v => v.type.replace('teleplot-', '') + ' ' + names(v)).sort(), ['3d ball,box,camera', 'image ball,box,camera']);
    assert.deepEqual(views.find(v => v.type == 'teleplot-3d').__collectSources(-1).sources.map(s => s.kind).sort(), ['camera', 'shape', 'shape'], 'the camera is drawn in the scene');
});
