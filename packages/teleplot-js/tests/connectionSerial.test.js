// 022-connectionSerial: serial ports read by the browser (Web Serial), with a fake port. Also what every connection counts (020).
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot, captureConsole } = require('./helpers/load');

const tick = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

// What the page gets from navigator.serial.requestPort(): open/close, a readable and a writable stream of bytes
function fakePort(info = { usbVendorId: 0x10c4, usbProductId: 0xea60 }) {
    let controller;
    const port = {
        options: null, closes: 0, written: [], failOpen: false,
        getInfo: () => info,
        async open(options) {
            if (port.failOpen) throw Object.assign(new Error('Failed to open serial port'), { name: 'NetworkError' });
            if (port.readable) throw Object.assign(new Error('The port is already open.'), { name: 'InvalidStateError' });
            port.options = options;
            port.readable = new ReadableStream({ start(c) { controller = c; } });
            port.writable = new WritableStream({ write(chunk) { port.written.push(Buffer.from(chunk).toString()); } });
        },
        async close() { port.closes++; port.readable = null; port.writable = null; },
        feed(text) { controller.enqueue(new TextEncoder().encode(text)); },
        lose() { controller.error(Object.assign(new Error('The device has been lost.'), { name: 'NetworkError' })); },
    };
    return port;
}

async function open(baudRate) {
    const T = loadTeleplot();
    const port = fakePort();
    const conn = T.connection.addConnectionSerial(port, baudRate);
    await tick();
    return { T, port, conn };
}
const logOf = (T, conn) => T.datastore.getTelemetry(conn.name + '_text_logs');

test('a serial port is opened at its baud rate and listed with the connections', async () => {
    const { T, port, conn } = await open(57600);
    assert.deepEqual(port.options, { baudRate: 57600 });
    assert.equal(conn.connected, true);
    assert.equal(conn.type, 'serial');
    assert.equal(conn.name, 'CP210x 10c4:ea60');
    assert.deepEqual(T.connection.connections.map(c => c.id), [conn.id]);
    assert.equal(T.connection.addConnectionSerial(port, 57600).id, conn.id, 'a port has one connection');
    assert.equal(T.connection.connections.length, 1);
    const C = T.connection.ConnectionSerial;
    assert.equal(C.portName({ getInfo: () => ({}) }), 'Serial port');
    assert.equal(C.portName({ getInfo: () => ({ usbVendorId: 0x1234, usbProductId: 0x1 }) }), 'USB serial 1234:0001');
    await conn.disconnect();
});

test('lines are read whatever the chunks: ">" lines are telemetry, the others are log lines of the port', async () => {
    const { T, port, conn } = await open();
    port.feed('Booting\r\n>temp:24.5\n>gy');
    await tick();
    assert.equal(T.datastore.hasTelemetry('gyro'), false, 'a line is used once it is complete');
    port.feed('ro:1;2\nIMU ready\n');
    await tick();
    assert.deepEqual(T.datastore.getTelemetry('temp').data[20].data[0], [24.5]);
    assert.deepEqual(T.datastore.getTelemetry('gyro').data[20].data[0], [1, 2]);
    assert.deepEqual(logOf(T, conn).data[23].data[0], ['Booting', 'IMU ready'], 'no trailing \\r');
    assert.equal(T.datastore.getTelemetry('temp').sourceId, conn.id, 'telemetries know which connection sent them');
    assert.equal(logOf(T, conn).sourceId, conn.id);
    // The console keeps every line as it came
    assert.deepEqual(conn.console.lines.map(l => [l.text, l.telemetry, l.sent, l.problem]),
        [['Booting', false, false, false], ['>temp:24.5', true, false, false], ['>gyro:1;2', true, false, false], ['IMU ready', false, false, false]]);
    assert.deepEqual([conn.stats.messages, conn.stats.problems], [4, 0]);
    assert.equal(conn.stats.bytes, 'Booting\r\n>temp:24.5\n>gyro:1;2\nIMU ready\n'.length, 'every byte read from the port');
    assert.ok(Date.now() - conn.stats.lastMessage < 2000);
    await conn.disconnect();
});

test('telemetry lines that cannot be understood are counted and marked; the console is limited and can be cleared', async () => {
    const { T, port, conn } = await open();
    port.feed('>temp 24.5\n>ok:1\nplain text without colon\n');
    await tick();
    assert.deepEqual(conn.console.lines.map(l => l.problem), [true, false, false], 'a log line is never a problem');
    assert.equal(conn.stats.problems, 1);
    conn.maxConsoleLines = 3;
    const revision = conn.console.revision;
    port.feed('a\nb\n');
    await tick();
    assert.deepEqual(conn.console.lines.map(l => l.text), ['plain text without colon', 'a', 'b']);
    assert.ok(conn.console.revision > revision);
    conn.clearConsole();
    assert.equal(conn.console.lines.length, 0);
    assert.equal(logOf(T, conn).data[23].data[0].length, 3, 'clearing the console does not touch the data');
    await conn.disconnect();
});

test('send: the text and its line ending go to the port, and to the console as a sent line', async () => {
    const { port, conn } = await open();
    assert.equal(await conn.send('calibrate'), true);
    assert.equal(await conn.send('raw', ''), true);
    assert.equal(await conn.send('win', '\r\n'), true);
    assert.deepEqual(port.written, ['calibrate\n', 'raw', 'win\r\n']);
    assert.deepEqual(conn.console.lines.map(l => [l.text, l.sent]), [['calibrate', true], ['raw', true], ['win', true]]);
    await conn.disconnect();
    assert.equal(await conn.send('late'), false, 'nothing is sent to a closed port');
});

test('disconnect closes the port, connect opens it again; changing the baud rate reopens it', async () => {
    const { T, port, conn } = await open(9600);
    await conn.disconnect();
    assert.deepEqual([conn.connected, port.closes], [false, 1]);
    await conn.connect();
    port.feed('>a:1\n');
    await tick();
    assert.deepEqual(T.datastore.getTelemetry('a').data[20].data[0], [1]);
    assert.equal(await conn.setBaudRate(115200), true);
    assert.deepEqual([conn.connected, port.options, port.closes], [true, { baudRate: 115200 }, 2]);
    assert.equal(T.connection.removeConnection(conn), true);
    await tick();
    assert.deepEqual([T.connection.connections.length, port.closes, T.datastore.hasTelemetry('a')], [0, 3, true], 'removed: closed, its telemetries stay');
    assert.equal(T.connection.removeConnection(conn), false);
});

test('a port that is lost or cannot be opened says why, and can be opened again', async () => {
    const { T, port, conn } = await open();
    port.feed('half a li');
    port.lose();
    await tick();
    assert.deepEqual([conn.connected, conn.error], [false, 'The device was lost (unplugged ?)']);
    assert.deepEqual(conn.console.lines.map(l => l.text), ['half a li'], 'what was received before is kept');
    assert.equal(await conn.connect(), true, 'plugged again');
    assert.deepEqual([conn.connected, conn.error], [true, '']);
    await conn.disconnect();

    const broken = fakePort({});
    broken.failOpen = true;
    const failed = T.connection.addConnectionSerial(broken);
    await tick();
    assert.deepEqual([failed.connected, failed.error], [false, 'The device was lost (unplugged ?)']);
});

test('lines received while paused are shown in the console but not stored', async () => {
    const { T, port, conn } = await open();
    T.state.isPaused = true;
    port.feed('>a:1\n');
    await tick();
    assert.equal(T.datastore.hasTelemetry('a'), false);
    assert.equal(conn.console.lines.length, 1);
    await conn.disconnect();
});

test('requestSerialPort and getGrantedSerialPorts go through the browser (navigator.serial)', async () => {
    const T = loadTeleplot();
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const set = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
    try {
        set({});
        assert.equal(T.connection.serialSupported(), false);
        await assert.rejects(T.connection.requestSerialPort(), /cannot open serial ports/);
        assert.deepEqual(await T.connection.getGrantedSerialPorts(), []);

        const chosen = fakePort(), other = fakePort({ usbVendorId: 0x1a86, usbProductId: 0x7523 });
        let cancel = true;
        set({ serial: {
            async requestPort() { if (cancel) throw Object.assign(new Error('No port selected by the user.'), { name: 'NotFoundError' }); return chosen; },
            async getPorts() { return [chosen, other]; },
        } });
        assert.equal(T.connection.serialSupported(), true);
        assert.equal(await T.connection.requestSerialPort(), undefined, 'the dialog was closed: nothing happens');
        cancel = false;
        const conn = await T.connection.requestSerialPort(9600);
        await tick();
        assert.deepEqual([conn.connected, chosen.options], [true, { baudRate: 9600 }]);
        assert.deepEqual((await T.connection.getGrantedSerialPorts()).map(p => p.name), ['CH340 1a86:7523'], 'ports already read are not offered again');
        await conn.disconnect();
    }
    finally { if (saved) Object.defineProperty(globalThis, 'navigator', saved); else delete globalThis.navigator; }
});

// A navigator.serial that tells which ports come and go, as the browser does (only ports the user allowed)
function fakeSerial(ports = []) {
    const listeners = { connect: [], disconnect: [] };
    const serial = {
        ports, requested: [], chosen: undefined,
        addEventListener(type, fn) { listeners[type].push(fn); },
        async getPorts() { return serial.ports.slice(); },
        async requestPort(options) {
            serial.requested.push(options);
            if (!serial.chosen) throw Object.assign(new Error('No port selected by the user.'), { name: 'NotFoundError' });
            return serial.chosen;
        },
        // The device is unplugged: its port is lost for good. Plugged again: a new SerialPort with the same USB ids.
        unplug(port) { serial.ports = serial.ports.filter(p => p !== port); port.lose(); port.failOpen = true; listeners.disconnect.forEach(fn => fn({ target: port })); },
        plug(port) { serial.ports.push(port); listeners.connect.forEach(fn => fn({ target: port })); },
    };
    return serial;
}
async function withSerial(serial, fn) {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { serial }, configurable: true, writable: true });
    try { await fn(); }
    finally { if (saved) Object.defineProperty(globalThis, 'navigator', saved); else delete globalThis.navigator; }
}

test('a device plugged again is read again by the same connection: its telemetries and commands keep working', async () => {
    const T = loadTeleplot();
    const first = fakePort(), serial = fakeSerial([first]);
    await withSerial(serial, async () => {
        const conn = T.connection.addConnectionSerial(first);
        await tick();
        first.feed('>ATTR|speed|write|min=0|max=10\n>speed:1\n');
        await tick();
        T.state.commands = true;
        assert.equal(T.commands.whyNot(T.datastore.getTelemetry('speed')), '');

        serial.unplug(first);
        await tick();
        assert.deepEqual([conn.connected, conn.gone], [false, true]);
        assert.equal(T.commands.whyNot(T.datastore.getTelemetry('speed')), 'The port is not open');
        assert.equal(await first.open({}).catch(e => e.name), 'NetworkError', 'the old port can never be opened again');

        const second = fakePort();
        serial.plug(second);
        await tick();
        assert.deepEqual([conn.connected, conn.gone, conn.port === second, T.connection.connections.length], [true, false, true, 1]);
        assert.equal(T.commands.whyNot(T.datastore.getTelemetry('speed')), '', 'commands go to the new port');
        second.feed('>speed:2\n');
        await tick();
        assert.deepEqual(T.datastore.getTelemetry('speed').data[20].data[0], [1, 2]);

        // A port of another kind of device, or a connection closed on purpose, is left alone
        await conn.disconnect();
        assert.equal(T.connection.serialPortAppeared(fakePort()), undefined);
        assert.equal(T.connection.serialPortAppeared(fakePort({ usbVendorId: 0x1a86, usbProductId: 0x7523 })), undefined);
        assert.equal(conn.port, second);
    });
});

test('a port that appears but does not open at once is tried again', async () => {
    const T = loadTeleplot();
    const first = fakePort(), serial = fakeSerial([first]);
    await withSerial(serial, async () => {
        const conn = T.connection.addConnectionSerial(first);
        await tick();
        serial.unplug(first);
        await tick();
        const second = fakePort();
        second.failOpen = true; // (the system is not ready yet)
        const planned = T.__timers.pending.size;
        serial.plug(second);
        await tick();
        assert.equal(conn.connected, false);
        assert.equal(T.__timers.pending.size, planned + 1, 'one more try is planned');
        second.failOpen = false;
        T.__timers.run();
        await tick();
        assert.equal(conn.connected, true);
        await conn.disconnect();
    });
});

test('Reconnect takes a port with the same USB ids the user allowed, else asks the browser for one', async () => {
    const T = loadTeleplot();
    const first = fakePort(), serial = fakeSerial([first]);
    await withSerial(serial, async () => {
        const conn = T.connection.addConnectionSerial(first);
        await tick();
        serial.unplug(first);
        await tick();
        // Not allowed again (no "connect" event): the dialog, filtered on the device
        assert.equal(await conn.reconnect(), false, 'the dialog was closed');
        assert.deepEqual(serial.requested, [{ filters: [{ usbVendorId: 0x10c4, usbProductId: 0xea60 }] }]);
        serial.chosen = fakePort();
        assert.equal(await conn.reconnect(), true);
        assert.equal(conn.port, serial.chosen);
        serial.unplug(serial.chosen);
        await tick();
        // Already allowed: no dialog
        const granted = fakePort();
        serial.ports.push(granted);
        assert.equal(await conn.reconnect(), true);
        assert.deepEqual([conn.port === granted, serial.requested.length], [true, 2], 'no third dialog');
        await conn.disconnect();
    });
});

test('a port chosen again in Add a source replaces the gone port of its connection', async () => {
    const T = loadTeleplot();
    const first = fakePort(), serial = fakeSerial([first]);
    await withSerial(serial, async () => {
        const conn = T.connection.addConnectionSerial(first);
        await tick();
        serial.unplug(first);
        await tick();
        const second = fakePort();
        serial.ports.push(second); // (no "connect" event: the browser forgot the permission)
        assert.deepEqual((await T.connection.getGrantedSerialPorts()).map(p => p.name), ['CP210x 10c4:ea60']);
        assert.equal(T.connection.addConnectionSerial(second).id, conn.id);
        await tick();
        assert.deepEqual([conn.connected, T.connection.connections.length], [true, 1]);
        await conn.disconnect();
    });
});

test('telemetries follow the source that sends them: a device read again by a new connection gets its commands back', async () => {
    const { T, port, conn } = await open();
    port.feed('>ATTR|gain|write\n>gain:1\n');
    await tick();
    T.connection.removeConnection(conn);
    await tick();
    T.state.commands = true;
    const gain = T.datastore.getTelemetry('gain');
    assert.equal(T.commands.whyNot(gain), 'Its source is gone');
    const again = fakePort({ usbVendorId: 0x1a86, usbProductId: 0x7523 });
    const other = T.connection.addConnectionSerial(again);
    await tick();
    again.feed('>gain:2\n');
    await tick();
    assert.deepEqual([gain.sourceId, T.commands.whyNot(gain)], [other.id, '']);
    T.files.importData('gain:3:4\n');
    assert.equal(gain.sourceId, other.id, 'what a file adds does not change where commands go');
    await other.disconnect();
});

test('Reconnect right after the port was lost waits for it to be closed', async () => {
    const { T, port, conn } = await open();
    const close = port.close;
    let release;
    port.close = () => new Promise(r => { release = r; }).then(() => { port.close = close; return close(); });
    port.lose();
    await tick();
    assert.deepEqual([conn.connected, port.readable !== null], [false, true], 'lost, not closed yet');
    const opening = conn.connect();
    release();
    assert.equal(await opening, true, 'not "already open"');
    port.feed('>a:1\n');
    await tick();
    assert.equal(T.datastore.hasTelemetry('a'), true);
    await conn.disconnect();
});
