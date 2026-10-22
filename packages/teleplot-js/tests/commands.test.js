// 025-commands (and what the parsers and connections do for it): settings, actions, continuous control. Spec: doc/telecmd.md
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot, captureConsole } = require('./helpers/load');
const { PacketBuilder, ATTR } = require('./helpers/packet');
const { FakeWebSocket } = require('./helpers/stubs');

const WRITE = 11, CHOICES = 12, ARGS = 13, DESC = 14, TITLE = 15;
const NUMBER = 20, NUMBER_2D = 21, NUMBER_3D = 22, TEXT = 23;

// A page with a device of its own (a local connection): what the page writes is in "written"
function setup(lines = '') {
    const T = loadTeleplot();
    const written = [];
    const device = T.connection.addConnectionLocal('Robot', (message) => written.push(message));
    if (lines) device.sendText(lines);
    return { T, device, written, telem: (name) => T.datastore.getTelemetry(name) };
}
const later = (ms) => Date.now() + ms;
const texts = (written) => written.map((m) => m.text);

test('ATTR lines declare settings: type, choices, step, rate, hold, axes; "write=" removes it', () => {
    const { T, telem } = setup([
        'ATTR|kp|write|min=0|max=10|step=0.01|desc=Proportional gain|unit=',
        'ATTR|motors|write=bool',
        'ATTR|mode|write|choices=idle,auto,manual%2C slow',
        'ATTR|cmd_vel|write=pose2d|axes=x,yaw|rate=20|hold=200',
        'ATTR|name|write=text|color=red',
    ].join('\n'));
    const C = T.commands;
    assert.deepEqual(C.declaration(telem('kp')), { kind: 'setting', type: 'number', step: 0.01, choices: undefined });
    assert.deepEqual(telem('kp').getRange(), { min: 0, max: 10 });
    assert.equal(telem('kp').getAttribute(DESC), 'Proportional gain');
    assert.equal(C.declaration(telem('motors')).type, 'bool');
    assert.deepEqual(C.declaration(telem('mode')).choices, ['idle', 'auto', 'manual, slow'], 'values are unescaped one by one');
    assert.equal(C.declaration(telem('mode')).type, 'text', 'choices are texts');
    assert.deepEqual(C.declaration(telem('cmd_vel')), { kind: 'setting', type: 'pose2d', axes: ['x', 'yaw'], rate: 20, hold: 200, choices: undefined });
    assert.equal(C.isContinuous(telem('cmd_vel')), true);
    assert.equal(telem('name').getAttribute(ATTR.COLOR), 'red');
    // The type of the data when none is declared
    T.parseDataText('ATTR|goal|write\ngoal:1:2|xy');
    assert.equal(C.declaration(telem('goal')).type, 'xy');
    // Completed, then removed
    T.parseDataText('ATTR|kp|confirm');
    assert.equal(C.declaration(telem('kp')).confirm, true);
    T.parseDataText('ATTR|kp|write=');
    assert.equal(C.declaration(telem('kp')), undefined);
    assert.equal(C.isWritable(telem('kp')), false);
    // Mistakes: counted, nothing applied
    captureConsole(() => {
        assert.equal(T.parseDataText('ATTR|speed|step=1'), 1, 'step needs write or action');
        assert.equal(T.parseDataText('ATTR|speed|write=complex'), 1);
        assert.equal(T.parseDataText('ATTR|speed|write|axes=x,z'), 1);
    });
    assert.equal(C.declaration(telem('speed')), undefined);
});

test('ATTR lines declare actions and their arguments, in order; an argument line replaces or removes one', () => {
    const { T, telem } = setup([
        'ATTR|robot.goto|action|title=Go to|desc=Drive to a pose%3A avoiding obstacles|confirm',
        'ATTR|robot.goto|arg=target|type=pose2d|desc=Where to go',
        'ATTR|robot.goto|arg=speed|type=number|optional|default=0.5|min=0|max=2|unit=m/s',
        'ATTR|robot.goto|arg=avoid|type=text|choices=none,people,all|optional|default=people',
    ].join('\n'));
    const goto = telem('robot.goto');
    assert.equal(T.commands.isAction(goto), true);
    assert.equal(goto.getAttribute(TITLE), 'Go to');
    assert.equal(goto.getAttribute(DESC), 'Drive to a pose: avoiding obstacles');
    assert.equal(T.commands.declaration(goto).confirm, true);
    assert.deepEqual(T.commands.args(goto), [
        { name: 'target', type: 'pose2d', optional: false, desc: 'Where to go' },
        { name: 'speed', type: 'number', optional: true, default: '0.5', min: 0, max: 2, unit: 'm/s' },
        { name: 'avoid', type: 'text', optional: true, choices: ['none', 'people', 'all'], default: 'people' },
    ]);
    T.parseDataText('ATTR|robot.goto|arg=speed|type=number|max=3');
    assert.equal(T.commands.args(goto)[1].max, 3, 'the same name: replaced (what is not said is kept)');
    T.parseDataText('ATTR|robot.goto|arg=avoid|type=');
    assert.deepEqual(T.commands.args(goto).map((a) => a.name), ['target', 'speed']);
    captureConsole(() => assert.equal(T.parseDataText('ATTR|robot.goto|arg=x|kind=1'), 1));
    // An action has nothing to display until it is called, but it is announced (the auto dashboard shows its button)
    assert.equal(goto.hasContent(), true);
});

test('binary attributes: write, choices, arguments, description, title', () => {
    const T = loadTeleplot();
    T.parseDataBinary(new PacketBuilder(3).attrs(1, [[ATTR.NAME, 'mode'], [WRITE, { kind: 1, type: 3, flags: 1, rate: 10, hold: 300, axes: 0b101 }], [CHOICES, 'idle\nauto'], [DESC, 'The mode']]).build());
    T.parseDataBinary(new PacketBuilder(3).attrs(2, [[ATTR.NAME, 'goto'], [WRITE, { kind: 2, flags: 2 }], [TITLE, 'Go to'],
        [ARGS, { index: 0, type: 6, name: 'target' }], [ARGS, { index: 1, type: 1, flags: 1, min: 0, max: 2, name: 'speed', unit: 'm/s', default: '0.5', desc: 'Top speed' }]]).build());
    const mode = T.datastore.getTelemetry(3 * 0x10000 + 1), goto = T.datastore.getTelemetry(3 * 0x10000 + 2);
    assert.deepEqual(T.commands.declaration(mode), { kind: 'setting', type: 'text', confirm: true, longpress: false, rate: 10, hold: 300, axes: ['x', 'yaw'], choices: ['idle', 'auto'] });
    assert.equal(mode.getAttribute(DESC), 'The mode');
    assert.deepEqual(T.commands.declaration(goto), { kind: 'action', type: '', confirm: false, longpress: true, choices: undefined });
    assert.equal(goto.getAttribute(TITLE), 'Go to');
    assert.deepEqual(T.commands.args(goto), [{ name: 'target', type: 'pose2d', optional: false },
        { name: 'speed', type: 'number', optional: true, min: 0, max: 2, unit: 'm/s', default: '0.5', desc: 'Top speed' }]);
    T.parseDataBinary(new PacketBuilder(3).attrs(1, [[WRITE, { kind: 0 }]]).build());
    assert.equal(T.commands.declaration(mode), undefined);
});

test('nothing is sent while CMD is off, while paused, nor to a telemetry of a file; why is told', () => {
    const { T, written, telem } = setup('ATTR|kp|write\nkp:0.4');
    assert.match(T.commands.write(telem('kp'), 0.5), /Commands are off/);
    T.commands.setEnabled(true);
    T.state.isPaused = true;
    assert.match(T.commands.write(telem('kp'), 0.5), /Paused/);
    T.state.isPaused = false;
    T.parseDataText('ATTR|fromFile|write\nfromFile:1'); // (no source: as an imported file)
    assert.match(T.commands.write(telem('fromFile'), 2), /From a file/);
    assert.equal(T.commands.whyNot(telem('kp')), '');
    assert.equal(written.length, 0);
    assert.match(T.commands.write(T.datastore.getOrCreateTelemetry('plain'), 1), /Not writable/);
});

test('a setting: the line the device would send, the echo applies it; the conversation is logged', () => {
    const { T, device, written, telem } = setup('ATTR|kp|write|min=0|max=10\nkp:0.4');
    T.commands.setEnabled(true);
    assert.equal(T.commands.write(telem('kp'), '0.42'), '', 'a text is read');
    assert.deepEqual(texts(written), ['kp:0.42']);
    assert.equal(written[0].telemetry.id, telem('kp').id);
    let request = T.commands.request(telem('kp'));
    assert.equal(request.status, 'pending');
    assert.equal(request.target, 0.42);
    // An old value comes meanwhile: still pending, sent again
    device.sendText('kp:0.4');
    T.commands.__update(later(300));
    assert.equal(request.status, 'pending');
    assert.deepEqual(texts(written), ['kp:0.42', 'kp:0.42']);
    // The echo
    device.sendText('kp:0.42');
    T.commands.__update(later(400));
    assert.equal(request.status, 'applied');
    T.commands.__update(later(3000));
    assert.equal(T.commands.request(telem('kp')), undefined, 'an applied request is forgotten after a while');
    // Logged once, as sent
    assert.deepEqual(telem('commands.sent').data[TEXT].data[0], ['kp:0.42']);
    assert.equal(telem('commands.sent').sourceId, 'page');
    assert.equal(T.commands.history(telem('kp')).length, 1);
    // Out of range or not of its type: refused by the page
    assert.match(T.commands.write(telem('kp'), 12), /Between 0 and 10/);
    assert.match(T.commands.write(telem('kp'), 'abc'), /A number/);
});

test('a setting not applied (the device keeps another value), refused (err), or without answer', () => {
    const { T, device, written, telem } = setup('ATTR|limit|write|step=0.1\nlimit:1.2\nATTR|mode|write|choices=idle,auto,manual\nmode:idle|t\nATTR|silent|write=bool');
    T.commands.setEnabled(true);
    T.commands.write(telem('limit'), 1.9);
    device.sendText('limit:1.5');
    T.commands.__update(later(2500));
    assert.deepEqual([T.commands.request(telem('limit')).status, T.commands.request(telem('limit')).reported], ['kept', 1.5]);
    assert.match(T.commands.request(telem('limit')).reason, /keeps 1.5/);
    // Within step / 2: applied (a device that rounds)
    T.commands.dismiss(telem('limit'));
    assert.equal(T.commands.request(telem('limit')), undefined);
    T.commands.write(telem('limit'), 1.44);
    device.sendText('limit:1.4');
    T.commands.__update(later(10));
    assert.equal(T.commands.request(telem('limit')).status, 'applied');
    // Refused
    T.commands.write(telem('mode'), 'manual');
    assert.deepEqual(texts(written).at(-1), 'mode:manual');
    device.sendText('ACK|mode:err:motors off');
    assert.deepEqual([T.commands.request(telem('mode')).status, T.commands.request(telem('mode')).reason], ['refused', 'motors off']);
    assert.match(T.commands.write(telem('mode'), 'fast'), /One of idle, auto, manual/);
    // No answer (on a clock that does not move by itself: a millisecond passing between two readings would move the 2 s boundary)
    const realNow = Date.now, start = realNow();
    Date.now = () => start;
    try {
        T.commands.write(telem('silent'), true);
        assert.equal(texts(written).at(-1), 'silent:1');
        for (let ms = 250; ms <= 2500; ms += 250) T.commands.__update(start + ms);
    } finally { Date.now = realNow; }
    assert.equal(T.commands.request(telem('silent')).status, 'noanswer');
    assert.equal(texts(written).filter((t) => t === 'silent:1').length, 9, 'sent again every 250 ms for 2 s');
});

test('settings are throttled: the latest value waits for its turn', () => {
    const { T, written, telem } = setup('ATTR|kp|write|rate=4\nkp:0');
    T.commands.setEnabled(true);
    T.commands.write(telem('kp'), 1);
    T.commands.write(telem('kp'), 2);
    T.commands.write(telem('kp'), 3);
    assert.deepEqual(texts(written), ['kp:1']);
    T.commands.__update(later(100));
    assert.deepEqual(texts(written), ['kp:1']);
    T.commands.__update(later(260));
    assert.deepEqual(texts(written), ['kp:1', 'kp:3'], 'the latest one, a quarter of a second later');
});

test('values of every type, as text lines and as binary packets', () => {
    const { T, written, telem } = setup('ATTR|goal|write=xy\nATTR|pose|write=pose2d\nATTR|name|write=text');
    T.commands.setEnabled(true);
    T.commands.write(telem('goal'), [1.5, -2]);
    T.commands.write(telem('pose'), '3.2, 2.3, 0.61');
    T.commands.write(telem('name'), 'a:b%c\nd');
    assert.deepEqual(texts(written), ['goal:1.5:-2', 'pose:3.2:2.3:0.61', 'name:a:b%25c%0Ad']);
    assert.match(T.commands.write(telem('goal'), '1'), /2 numbers/);
    // A binary device: a packet of its client, the data section of the telemetry with the id the device gave
    T.parseDataBinary(new PacketBuilder(7).attrs(4, [[ATTR.NAME, 'speed'], [WRITE, { kind: 1, type: 1 }]]).build());
    const speed = T.datastore.getTelemetry(7 * 0x10000 + 4);
    speed.sourceId = T.connection.connections[0].id;
    T.commands.write(speed, 0.5);
    const bytes = written.at(-1).bytes;
    assert.equal(written.at(-1).text, undefined);
    const view = new DataView(bytes.buffer);
    assert.deepEqual([bytes[0], bytes[1], view.getUint16(2, true), bytes[4], view.getUint16(5, true)], [0x10, 1, 7, NUMBER, 4]);
    assert.deepEqual([bytes[15], view.getFloat32(20, true)], [1, 0.5], 'one sample, the value');
    assert.equal(bytes.length, 26);
});

test('an action: arguments checked, named and typed in the call; answers give its state and duration', () => {
    const { T, device, written, telem } = setup([
        'ATTR|robot.goto|action',
        'ATTR|robot.goto|arg=target|type=pose2d',
        'ATTR|robot.goto|arg=speed|type=number|optional|min=0|max=2',
        'ATTR|robot.goto|arg=note|type=text|optional',
    ].join('\n'));
    const goto = telem('robot.goto');
    T.commands.setEnabled(true);
    assert.deepEqual(T.commands.validate(goto, {}).errors, { target: 'Required' });
    assert.deepEqual(T.commands.validate(goto, { target: '1,2', speed: '5' }).errors, { target: '3 numbers', speed: 'Between 0 and 2' });
    assert.deepEqual(T.commands.call(goto, { speed: 1 }).errors, { target: 'Required' });
    assert.equal(written.length, 0);
    const { id, reason } = T.commands.call(goto, { target: '3.8, 2, 0.5', speed: '', note: 'a=b:c' });
    assert.equal(reason, '');
    assert.deepEqual(texts(written), [`!robot.goto#${id}:target=3.8,2,0.5:note=a%3Db%3Ac`], 'optional ones left empty are not sent');
    assert.equal(T.commands.lastCall(goto).status, 'sent');
    T.commands.__update(later(300));
    assert.equal(written.length, 2, 'sent again until answered');
    const t0 = Date.now() / 1000;
    device.sendText(`ACK|robot.goto#${id}:run`, t0 * 1000);
    T.commands.__update(later(600));
    assert.equal(written.length, 2, 'answered: not sent again');
    assert.equal(T.commands.lastCall(goto).status, 'run');
    device.sendText(`ACK|robot.goto#${id}:ok:arrived`, (t0 + 3.8) * 1000);
    const call = T.commands.lastCall(goto);
    assert.deepEqual([call.id, call.status, call.text, call.args], [id, 'ok', 'arrived', { target: [3.8, 2, 0.5], note: 'a=b:c' }]);
    assert.ok(Math.abs(call.end - call.run - 3.8) < 1e-6);
    // The answers are log samples of the action
    assert.deepEqual(goto.data[TEXT].data[0], [`#${id} run`, `#${id} ok arrived`]);
    // An error, and a call nobody answers
    const second = T.commands.call(goto, { target: [0, 0, 0] }).id;
    device.sendText(`ACK|robot.goto#${second}:err:unreachable`);
    assert.deepEqual([T.commands.lastCall(goto).status, T.commands.lastCall(goto).text], ['err', 'unreachable']);
    const third = T.commands.call(goto, { target: [1, 1, 0] }).id;
    T.commands.__update(later(2500));
    assert.equal(T.commands.calls(goto).find((c) => c.id === third).status, 'noanswer');
    assert.equal(T.commands.calls(goto).length, 3);
});

test('calls are read back from the answers alone (an imported file, a reload)', () => {
    const T = loadTeleplot();
    T.parseDataText({ data: 'ACK|goto#5:run', timestamp: 1000 });
    T.parseDataText({ data: 'ACK|goto#5:ok', timestamp: 5100 });
    T.parseDataText({ data: 'ACK|goto#6:run', timestamp: 6000 });
    const calls = T.commands.calls(T.datastore.getTelemetry('goto'));
    assert.deepEqual(calls.map((c) => [c.id, c.status, c.run, c.end]), [[5, 'ok', 1, 5.1], [6, 'run', 6, undefined]]);
    captureConsole(() => assert.equal(T.parseDataText('ACK|goto#x:ok'), 1));
});

test('binary calls and answers', () => {
    const T = loadTeleplot();
    const written = [];
    const device = T.connection.addConnectionLocal('Arm', (m) => written.push(m));
    device.sendBinary(new PacketBuilder(2).attrs(9, [[ATTR.NAME, 'arm.move'], [WRITE, { kind: 2 }], [ARGS, { index: 0, type: 6, name: 'to' }], [ARGS, { index: 1, type: 2, flags: 1, name: 'fast' }]]).build());
    const move = T.datastore.getTelemetry(2 * 0x10000 + 9);
    T.commands.setEnabled(true);
    const { id } = T.commands.call(move, { to: [1, 2, 3], fast: 'on' });
    const bytes = written[0].bytes, view = new DataView(bytes.buffer);
    assert.deepEqual([bytes[4], view.getUint16(5, true), view.getUint16(7, true), bytes[9]], [41, 9, id, 2]);
    assert.deepEqual([bytes[10], view.getFloat64(11, true), view.getFloat64(19, true), view.getFloat64(27, true), bytes[35], bytes[36]], [0, 1, 2, 3, 1, 1]);
    device.sendBinary(new PacketBuilder(2).answer(9, id, 2).build());
    device.sendBinary(new PacketBuilder(2).answer(9, id, 1, 'blocked').build());
    assert.deepEqual([T.commands.lastCall(move).status, T.commands.lastCall(move).text], ['err', 'blocked']);
    // A setting refused (call id 0xFFFF)
    device.sendBinary(new PacketBuilder(2).attrs(10, [[ATTR.NAME, 'arm.speed'], [WRITE, { kind: 1, type: 1 }]]).build());
    const speed = T.datastore.getTelemetry(2 * 0x10000 + 10);
    T.commands.write(speed, 3);
    device.sendBinary(new PacketBuilder(2).answer(10, 0xFFFF, 1, 'too fast').build());
    assert.deepEqual([T.commands.request(speed).status, T.commands.request(speed).reason], ['refused', 'too fast']);
});

test('continuous control: sent at its rate while held, the rest value a few times on release; CMD off releases', () => {
    const { T, written, telem } = setup('ATTR|cmd_vel|write=pose2d|rate=20|hold=200\nATTR|kp|write');
    T.commands.setEnabled(true);
    assert.match(T.commands.hold(telem('kp'), () => 1), /Not a continuous/);
    let value = [0.4, 0, 0.3];
    assert.equal(T.commands.hold(telem('cmd_vel'), () => value), '');
    assert.equal(T.commands.isHeld(telem('cmd_vel')), true);
    T.commands.__update(later(20));
    assert.equal(written.length, 1, 'not before 1/rate');
    value = [0.5, 0, 0.3];
    T.commands.__update(later(60));
    assert.deepEqual(texts(written), ['cmd_vel:0.4:0:0.3', 'cmd_vel:0.5:0:0.3']);
    T.commands.release(telem('cmd_vel'));
    T.commands.__update(later(120));
    T.commands.__update(later(180));
    T.commands.__update(later(240));
    assert.deepEqual(texts(written).slice(2), ['cmd_vel:0:0:0', 'cmd_vel:0:0:0', 'cmd_vel:0:0:0']);
    assert.equal(T.commands.isHeld(telem('cmd_vel')), false);
    // Not logged: too many
    assert.equal(T.datastore.getTelemetry('commands.sent'), undefined);
    T.commands.hold(telem('cmd_vel'), () => [1, 0, 0]);
    T.commands.setEnabled(false);
    assert.deepEqual(texts(written).at(-1), 'cmd_vel:0:0:0', 'switched off: the rest value');
    T.commands.__update(later(500));
    assert.equal(written.length, 7, 'and then nothing');
});

test('the Teleplot server: senders of packets, writes back to the sender, read-only, older servers', () => {
    const T = loadTeleplot();
    T.connection.addConnectionTeleplotServer('localhost', 8080);
    const conn = T.connection.connections[0], ws = FakeWebSocket.instances[0];
    ws.onopen(); conn.connected = true;
    assert.match(conn.whyNotWritable(), /older/);
    ws.onmessage({ data: JSON.stringify({ hello: { readOnly: false, senders: { 0: '10.0.0.5:4000' } } }) });
    ws.onmessage({ data: JSON.stringify({ time: 10, senders: { 1: '10.0.0.6:4001' }, packets: [[9, 'ATTR|kp|write\nkp:1', 0], [9, 'ATTR|ki|write\nki:2', 1]] }) });
    const kp = T.datastore.getTelemetry('kp'), ki = T.datastore.getTelemetry('ki');
    assert.deepEqual([kp.endpoint, ki.endpoint], [0, 1]);
    assert.equal(T.commands.deviceName(ki), '10.0.0.6:4001');
    T.commands.setEnabled(true);
    T.commands.write(ki, 3);
    assert.deepEqual(JSON.parse(ws.sent.at(-1)), { write: 'ki:3', to: 1 });
    // Binary packets: their senders come with the text message before them
    ws.onmessage({ data: JSON.stringify({ time: 11, packets: [], binary: [1] }) });
    ws.onmessage({ data: new PacketBuilder(4).attrs(1, [[ATTR.NAME, 'arm'], [WRITE, { kind: 1, type: 1 }]]).build() });
    const arm = T.datastore.getTelemetry(4 * 0x10000 + 1);
    assert.equal(arm.endpoint, 1);
    T.commands.write(arm, 2);
    const sent = JSON.parse(ws.sent.at(-1));
    assert.equal(sent.to, 1);
    assert.deepEqual([...Buffer.from(sent.writeBinary, 'base64').subarray(0, 5)], [0x10, 1, 4, 0, NUMBER]);
    ws.onmessage({ data: JSON.stringify({ hello: { readOnly: true } }) });
    assert.match(T.commands.write(kp, 2), /read-only/);
});

test('a serial port: commands are lines written to it', async () => {
    const T = loadTeleplot();
    const written = [];
    const port = {
        getInfo: () => ({}), async open() { port.readable = new ReadableStream({ start() {} }); port.writable = new WritableStream({ write(c) { written.push(Buffer.from(c).toString()); } }); },
        async close() {},
    };
    const conn = T.connection.addConnectionSerial(port);
    await new Promise((r) => setImmediate(r));
    conn.__onLine('>ATTR|led|write=bool');
    T.commands.setEnabled(true);
    assert.equal(T.commands.write(T.datastore.getTelemetry('led'), 1), '');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(written, ['led:1\n']);
    assert.ok(conn.console.lines.some((l) => l.sent && l.text === 'led:1'));
    await conn.disconnect();
});

test('summary: what can be commanded, per device', () => {
    const { T } = setup('ATTR|kp|write\nATTR|ki|write\nATTR|reset|action');
    assert.deepEqual(T.commands.summary(), { settings: 2, actions: 1, devices: [{ name: 'Robot', settings: 2, actions: 1 }] });
});

test('views: settings and actions go to a values view (one "Commands" view in the auto dashboard), continuous ones to a joystick', () => {
    const T = loadTeleplot();
    T.dashboards.enableAutoDashboard('Live');
    T.connection.addConnectionLocal('Robot', () => {}).sendText([
        'speed:1', 'ATTR|kp|write\nkp:0.4', 'ATTR|reset|action', 'ATTR|drive|write=pose2d|rate=20|hold=200', 'ATTR|pose|write=pose2d\npose:1:2:0|xyz', 'ATTR|gain|write\ngain,arm:2',
    ].join('\n'));
    T.__timers.run();
    const suggest = (name) => T.view.suggestViewType(name);
    assert.deepEqual(['speed', 'kp', 'reset', 'drive', 'pose', 'gain'].map(suggest), ['chart', 'values', 'values', 'joystick', '2d', 'values']);
    const id = (name) => T.datastore.getTelemetry(name).id;
    const views = T.dashboards.getDashboard('Live').getView().views.map((v) => [v.type, v.getOption('title'), Array.from(v.telemetryIdOrNameList)]);
    assert.deepEqual(views, [
        ['teleplot-chart', '', [id('speed')]],
        ['teleplot-current-value', 'Commands', [id('kp'), id('reset')]],
        ['teleplot-joystick', '', [id('drive')]],
        ['teleplot-2d', '', [id('pose')]],
        ['teleplot-current-value', 'arm', [id('gain')]],
    ]);
    // Text dashboards know the joystick
    assert.ok(T.dashboards.receiveLine('DASH|Robot/Drive:joystick:drive|keyboard=wasd'));
    const drive = T.dashboards.getDashboard('Robot').getView();
    assert.equal(drive.views[0].type, 'teleplot-joystick');
    assert.equal(drive.views[0].options.keyboard, 'wasd');
    // A values view with only an action is not empty
    const values = T.view.createView('values', [id('reset')]);
    assert.equal(values.getEmptyState().text, '');
});

test('joystick: how a setting is driven, values from the pad and the rocker and back, keys', () => {
    const T = loadTeleplot();
    const J = T.view.ViewJoystick;
    assert.deepEqual([J.modeOf({ kind: 'setting', type: 'xy' }), J.modeOf({ kind: 'setting', type: 'pose2d' }), J.modeOf({ kind: 'setting', type: 'pose2d', axes: ['x', 'yaw'] }),
        J.modeOf({ kind: 'setting', type: 'number' }), J.modeOf({ kind: 'setting', type: 'text' }), J.modeOf({ kind: 'action' })], ['pad', 'pad+rocker', 'stick', 'rocker', '', '']);
    const range = { min: -0.5, max: 2 };
    // pose2d: pad up = +x (forward), left = +y; rocker left = +wz
    assert.deepEqual(J.toValue('pad+rocker', [-0.5, 1], 0.5, range), [2, 1, -0.25]);
    assert.deepEqual(J.toValue('stick', [0.5, -1], 0, undefined), [-1, 0, -0.5]);
    assert.deepEqual(J.toValue('pad', [1, -1], 0, undefined), [1, -1]);
    assert.equal(J.toValue('rocker', [0, 0], -0.5, { min: -4, max: 4 }), -2);
    assert.deepEqual(J.toValue('pad+rocker', [0, 0], 0, undefined), [0, 0, 0], 'rest: zeros, no -0');
    // And back, where the report is drawn
    assert.deepEqual(J.toPlace('pad+rocker', [2, 1, -0.25], range), { pad: [-0.5, 1], rocker: 0.5 });
    assert.deepEqual(J.toPlace('stick', [-1, 0, -0.5], undefined), { pad: [0.5, -1], rocker: 0 });
    assert.deepEqual(J.inCircle(3, 4), [0.6, 0.8]);
    // Keys: by position
    assert.deepEqual(J.fromKeys('pad+rocker', new Set(['KeyW', 'KeyD']), 'wasd'), { pad: [0, 1], rocker: 1 }, 'D turns');
    assert.deepEqual(J.fromKeys('pad', new Set(['ArrowUp', 'ArrowRight']), 'arrows').pad.map((v) => Math.round(v * 1000) / 1000), [0.707, 0.707]);
    assert.deepEqual(J.fromKeys('rocker', new Set(['ArrowLeft']), 'arrows'), { pad: [0, 0], rocker: -1 });
});

test('values view: what a row shows of a setting or an action (no DOM)', () => {
    const { T, device, telem } = setup('ATTR|kp|write|min=0|max=10|desc=Gain\nkp:4\nATTR|go|action|title=Go|confirm\nATTR|go|arg=to|type=xy\nATTR|led|write=bool\nled:1');
    const V = T.view.ViewCurrentValue;
    const bar = { min: 0, max: 10 };
    assert.deepEqual(V.commandState(telem('kp'), bar), { kind: 'setting', type: 'number', on: false, why: '', editable: false, continuous: false, choices: [],
        title: 'kp', desc: 'Gain', confirm: false, longpress: false, color: '', reportedText: '4', status: '' }, 'CMD off: nothing asked, nothing editable');
    T.commands.setEnabled(true);
    T.commands.write(telem('kp'), 5);
    let state = V.commandState(telem('kp'), bar);
    assert.deepEqual([state.editable, state.status, state.targetAt, state.reason], [true, 'pending', 0.5, 'Sent: 5, waiting for the device']);
    assert.equal(V.commandState(telem('led'), undefined).reportedText, 'on');
    assert.deepEqual([V.commandState(telem('go')).title, V.commandState(telem('go')).confirm, V.commandState(telem('go')).call], ['Go', true, undefined]);
    const { id } = T.commands.call(telem('go'), { to: '1,2' });
    device.sendText(`ACK|go#${id}:run`, 1000);
    device.sendText(`ACK|go#${id}:ok`, 4800);
    assert.deepEqual(V.commandState(telem('go')).call, { id, status: 'ok', text: '', duration: '3.8 s' });
    // The value under the pointer, on the step of the setting
    assert.equal(V.valueAt({ min: 0, max: 10 }, 0.4321, 0.5), 4.5);
    assert.equal(V.valueAt({ min: 0, max: 2 }, 0.61234), 1.225);
    assert.equal(V.valueAt({ min: -1, max: 1 }, 2), 1);
    assert.deepEqual([V.formatDuration(0.05), V.formatDuration(12.34), V.formatDuration(75)], ['0.05 s', '12.3 s', '1 min 15 s']);
});

test('timeline: a band per call (from run to its end, growing while it runs), a tick per request of a setting', () => {
    const { T, device, telem } = setup('ATTR|goto|action\nATTR|kp|write\nkp:1');
    const TL = T.view.ViewTimeline;
    const calls = [{ id: 1, sent: 10, run: 10.2, end: 14, status: 'ok' }, { id: 2, sent: 20, status: 'noanswer' }, { id: 3, run: 30, status: 'run' }, { id: 4, sent: 1, run: 1, end: 2, status: 'ok' }];
    assert.deepEqual(TL.buildCalls(calls, 5, 40, 33).map((c) => [c.id, c.from, c.to, c.status]), [[1, 10, 14, 'ok'], [2, 20, 20, 'noanswer'], [3, 30, 33, 'run']]);
    T.commands.setEnabled(true);
    T.commands.write(telem('kp'), 2);
    const t = Date.now() / 1000;
    assert.deepEqual(TL.buildRequests(T.commands.history(telem('kp')), 'number', t - 10, t + 10).map((r) => [r.status, r.target]), [['pending', '2']]);
    assert.deepEqual(TL.buildRequests(T.commands.history(telem('kp')), 'number', t + 5, t + 10), []);
    // The lanes of a timeline: "calls" for an action, a number keeps its kind and gets the requests
    const view = T.view.createView('timeline', [telem('goto').id, telem('kp').id]);
    assert.deepEqual(view.getSources().map((s) => s.kind), ['calls', 'line']);
    const { id } = T.commands.call(telem('goto'));
    device.sendText(`ACK|goto#${id}:run`);
    view.update();
    assert.deepEqual(view.lanes.map((l) => [l.kind, (l.calls || []).length, (l.requests || []).length]), [['calls', 1, 0], ['line', 0, 1]]);
});

test('2D view: a writable pose2d is drawn as a pose (not a point with z = yaw); a ghost gives the value to send', () => {
    const { T } = setup('ATTR|robot.pose|write=pose2d\nrobot.pose:1:2:1.5707963|xyz\ngoal:3:4|xy');
    const view = new T.view.ViewScene2D('', ['robot.pose', 'goal']);
    const items = T.view.ViewScene2D.buildItems(view.__collectSources(-1).sources, { timestamp: -1, since: -Infinity, trailLength: 200 });
    const pose = items.find((i) => i.kind === 'pose');
    assert.deepEqual(pose.at, [1, 2]);
    assert.ok(Math.abs(pose.dir[0]) < 1e-6 && Math.abs(pose.dir[1] - 1) < 1e-6, 'looks along +y');
    assert.ok(items.some((i) => i.kind === 'dot'), 'a plain point stays a point');
    const S = T.view.ViewScene2D, axes = S.axes(), side = S.axes('-y', 'x');
    assert.deepEqual(S.ghostValue('pose2d', [3.21234, 2.3], 0.6123456, axes), [3.212, 2.3, 0.612]);
    assert.deepEqual(S.ghostValue('xy', [3, 2], 0, axes), [3, 2]);
    assert.deepEqual(S.ghostValue('xy', [1, 2], 0, side), [2, -1], 'seen with x up and -y to the right');
    assert.ok(Math.abs(S.yawOf(0, 1, axes) - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(S.yawOf(0, 1, side)) < 1e-9, 'up is x');
});
