// 020 BootClock: "Times since boot", times of a board (ms since its boot) dated by the page, per source (doc/sources.md)
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');

const T0 = 1_800_000_000_000; // A date of the page (ms)
// Times dated by the page also move by the 100 ppm of drift allowed: compared within a ms
const near = (actual, expected) => {
    assert.equal(actual.length, expected.length);
    actual.forEach((t, i) => assert.ok(Math.abs(t - expected[i]) < 1, `${i}: ${t} != ${expected[i]}`));
};

function local() {
    const T = loadTeleplot();
    const board = T.connection.addConnectionLocal('Board');
    const times = (name) => T.datastore.getTelemetry(name).data[20].timestamps.map(t => Math.round(t * 1e6) / 1e3); // ms
    return { T, board, times, clock: board.bootClock() };
}

test('a time since boot is dated from the fastest line: smallest "arrival - device time", let go up by 100 ppm', () => {
    const { board, times, clock } = local();
    assert.equal(clock.enabled, true, 'on by default');
    board.sendText('a:1000:1', T0 + 50);   // took 50 ms
    board.sendText('a:2000:2', T0 + 1010); // took 10 ms: faster, the offset comes down
    board.sendText('a:3000:3', T0 + 2100); // took 100 ms: not later because of it
    const t = times('a');
    assert.equal(t[0], T0 + 50, 'the first one, as well as it can');
    assert.equal(t[1], T0 + 1010);
    assert.ok(Math.abs(t[2] - (T0 + 2010.109)) < 0.01, String(t[2])); // + 1090 ms * 100 ppm of drift
    assert.equal(clock.dated, 3);
});

test('telemetries out of order with each other (a picture exposed earlier, arriving later) change nothing', () => {
    const { board, times } = local();
    board.sendText('a:5000:1', T0);
    board.sendText('img:4000:2', T0 + 20);
    board.sendText('a:5100:3', T0 + 100);
    near(times('img'), [T0 - 1000]);
    near(times('a'), [T0, T0 + 100]);
});

test('a burst after an outage keeps the times the board measured', () => {
    const { board, times } = local();
    board.sendText('a:1000:1', T0);
    board.sendText('a:2000:2;3000:3;4000:4', T0 + 5000); // the WiFi came back
    near(times('a'), [T0, T0 + 1000, T0 + 2000, T0 + 3000]);
});

test('a board that kept running while nothing came is not another clock', () => {
    const { board, times, clock } = local();
    board.sendText('a:1000:1', T0);
    board.sendText('a:61000:2', T0 + 60000);
    assert.deepEqual(times('a'), [T0, T0 + 60000]);
    assert.equal(clock.jumps, 0);
});

test('reboot: a telemetry going back below its own previous time, by any amount', () => {
    const { board, times } = local();
    board.sendText('a:50000:1', T0);
    board.sendText('a:49990:2', T0 + 300); // restarted 290 ms ago... measured again from here
    assert.deepEqual(times('a'), [T0, T0 + 300]);
});

test('reboot: a time more than 10 s before the latest time of the source (a telemetry seen for the first time)', () => {
    const { board, times } = local();
    board.sendText('a:50000:1', T0);
    board.sendText('b:30:1', T0 + 200);
    board.sendText('a:40:2', T0 + 210);
    assert.deepEqual(times('b'), [T0 + 200]);
    assert.deepEqual(times('a'), [T0, T0 + 210]);
});

test('rapid resets with a short uptime (serial debugging): every boot is dated, never counted nor limited', () => {
    const { board, times, clock } = local();
    let arrival = T0, expected = [];
    for (let boot = 0; boot < 50; boot++) {
        for (let ms = 5; ms <= 400; ms += 50) {
            arrival += 50;
            board.sendText(`a:${ms}.125:1\nb:${ms}.125:2`, arrival);
            expected.push(arrival);
        }
        arrival += 700; // the reset
    }
    const t = times('a');
    assert.equal(t.length, expected.length);
    for (let i = 0; i < t.length; i++) assert.ok(Math.abs(t[i] - expected[i]) < 0.1, `${i}: ${t[i]} != ${expected[i]}`);
    assert.equal(clock.enabled, true);
    assert.equal(clock.jumps, 0);
});

test('several clocks on one source: after two jumps ahead, the option turns itself off and times are kept as sent', () => {
    const { board, times, clock } = local();
    board.sendText('a:5000000:1', T0);
    board.sendText('b:100000:1', T0 + 10);  // behind: taken as a reboot
    board.sendText('a:5000020:2', T0 + 20); // ahead of what the clock can have reached: a jump
    assert.equal(clock.enabled, true);
    assert.equal(clock.jumps, 1);
    board.sendText('b:100030:2', T0 + 30);
    board.sendText('a:5000040:3', T0 + 40); // the second jump
    assert.equal(clock.enabled, false);
    assert.match(clock.offReason, /clocks/);
    board.sendText('b:100050:3', T0 + 50);
    assert.equal(times('a')[0], 5000040, 'kept as sent (stored in time order: first)');
    assert.equal(times('b')[0], 100050);
    // The user turns it back on: dated again from what comes next
    clock.setEnabled(true);
    assert.equal(clock.offReason, '');
    board.sendText('b:100070:4', T0 + 70);
    assert.equal(times('b')[3], T0 + 70);
    assert.equal(times('b')[0], 100050, 'what came before stays');
});

test('times of 1973 or later from the same source are kept as sent; samples without a time are dated on arrival', () => {
    const { board, times } = local();
    board.sendText('a:1000:1', T0);
    board.sendText('a:1627551892437:2', T0 + 10);
    board.sendText('a:3', T0 + 20);
    board.sendText('a:2000:4', T0 + 1000);
    assert.deepEqual(times('a'), [1627551892437, T0, T0 + 20, T0 + 1000]);
});

test('option off: times kept as sent, from what comes next', () => {
    const { board, times, clock } = local();
    board.sendText('a:1000:1', T0);
    clock.setEnabled(false);
    board.sendText('a:2000:2', T0 + 1000);
    assert.deepEqual(times('a'), [2000, T0]);
});

test('every kind of line with a time is dated: logs, texts, xy, xyz, thresholds, clouds, 3D, images', () => {
    const { T, board, times } = local();
    board.sendText([
        'a:1000:1', '>1000:hello', 's:1000:on|t', 'p:1:2:1000|xy', 'q:1:2:3:1000|xyz', 'TH|a:1000:hot>3',
        'c:1000;1:2:3|pc', '3D|cube:1000:S:cube', 'PNG|pic:1000:iVBORw0KGgo=',
    ].join('\n'), T0);
    for (const [name, type] of [['a', 20], ['_text_logs', 23], ['s', 23], ['p', 21], ['q', 22], ['a', 40], ['c', 35], ['pic', 24]]) {
        const entry = T.datastore.getTelemetry(name).data[type];
        assert.equal(Math.round(entry.timestamps[0] * 1000), T0, `${name} ${type}`);
    }
    const shape = T.datastore.getTelemetry('cube');
    assert.ok(Object.values(shape.data).every(e => Math.round(e.timestamps[0] * 1000) === T0), '3D');
    assert.deepEqual(times('a'), [T0]);
});

test('one clock per sender of the Teleplot server', () => {
    const T = loadTeleplot();
    const conn = T.connection.addConnectionTeleplotServer('localhost', 8080);
    const times = (name) => T.datastore.getTelemetry(name).data[20].timestamps.map(t => Math.round(t * 1e3));
    // The server clock: 5000 ms when the page clock reads T0
    conn.__receivePackets({ time: 5000, packets: [[5000, 'a:3000000:1', 0], [5000, 'b:20:1', 1]] }, T0);
    conn.__receivePackets({ time: 5100, packets: [[5100, 'a:3000100:2', 0], [5100, 'b:120:2', 1]] }, T0 + 100);
    assert.deepEqual(times('a'), [T0, T0 + 100]);
    assert.deepEqual(times('b'), [T0, T0 + 100]);
    assert.equal(conn.bootClock(0).enabled, true);
    assert.equal(conn.bootClock(1).enabled, true);
    conn.bootClock(1).setEnabled(false);
    conn.__receivePackets({ time: 5200, packets: [[5200, 'a:3000200:3', 0], [5200, 'b:220:3', 1]] }, T0 + 200);
    assert.deepEqual(times('a'), [T0, T0 + 100, T0 + 200]);
    assert.deepEqual(times('b'), [220, T0, T0 + 100]);
});

test('files are never shifted', () => {
    const T = loadTeleplot();
    T.files.importData('a:1000:1\na:2000:2\n');
    assert.deepEqual(T.datastore.getTelemetry('a').data[20].timestamps, [1, 2]);
});
