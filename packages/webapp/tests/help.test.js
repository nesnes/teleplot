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
        if (e.log) {
            const logs = Object.values(T.datastore.telemetries).filter(t => t.data[P.SECTION_TYPE_TELEM_DATA_TEXT]);
            assert.equal(logs.length, 1);
            assert.equal(logs[0].data[P.SECTION_TYPE_TELEM_DATA_TEXT].data[0][0], example.code.slice(example.code.indexOf(':') + 1));
            return;
        }
        const telem = find(T, e.name);
        assert.ok(telem, 'telemetry ' + e.name + ' exists');
        const S = T.view.ViewScene3D;
        if ('label' in e) assert.equal(telem.attributes[P.TELEM_ATTR_VIEW_LABEL], e.label);
        if (e.position) assert.deepEqual(S.shapeState(telem).position, e.position);
        if (e.camera) {
            const camera = S.cameraState(telem);
            assert.deepEqual([camera.fx, camera.fy, camera.cx, camera.cy, camera.width, camera.height, camera.position], [554, 554, 320, 240, 640, 480, [0, 0, 1]]);
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
            assert.equal(T.view.suggestViewType(telem.id), '3d');
            return;
        }
        if (e.shape) {
            const types = { cube: P.TELEM_ATTR_SHAPE_TYPE_CUBE, sphere: P.TELEM_ATTR_SHAPE_TYPE_SPHERE };
            assert.equal(S.shapeState(telem).type, types[e.shape]);
            assert.equal(T.view.suggestViewType(telem.id), '3d');
            return;
        }
        if (!e.type) return; // (a line that only moves something: checked above)
        const type = { number: P.SECTION_TYPE_TELEM_DATA_NUMBER, '2d': P.SECTION_TYPE_TELEM_DATA_NUMBER_2D, '3d': P.SECTION_TYPE_TELEM_DATA_NUMBER_3D, text: P.SECTION_TYPE_TELEM_DATA_TEXT }[e.type];
        assert.ok(telem.data[type], 'has data of type ' + e.type);
        if (e.samples) assert.equal(telem.data[type].timestamps.length, e.samples);
        if (e.timestamp) assert.deepEqual(telem.data[type].timestamps, [e.timestamp]);
        if ('logText' in e) assert.equal(telem.attributes[P.TELEM_ATTR_LOG], e.logText, 'emitted as a log, or as a state');
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
    assert.deepEqual(kinds('>:Motors armed'), ['flags=>', 'value=Motors armed']);
    assert.deepEqual(kinds('left,motors:0.4'), ['name=left,motors', 'value=0.4']);
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
    assert.match(say('left,motors:0.4'), /named left\./);
    assert.match(say('debug:42|np'), /not charted automatically/);
    assert.match(say('>:Motors armed'), /a log line/);
    for (const wrong of ['hello', 'value:abc', 'bad:1:2:3;4:5|pc']) {
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
