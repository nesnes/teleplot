// 020-connection, 021-connectionTeleplotServer, 030-dataInput, 031-dataInputUDP, 032-dataInputSerial (fake WebSocket)
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot, captureConsole } = require('./helpers/load');
const { FakeWebSocket } = require('./helpers/stubs');
const { PacketBuilder } = require('./helpers/packet');

function connect() {
    const T = loadTeleplot();
    T.connection.addConnectionTeleplotServer('localhost', 8080);
    return { T, conn: T.connection.connections[0], ws: FakeWebSocket.instances[0] };
}

test('abstract base classes cannot be instantiated', () => {
    const { T } = connect();
    const Conn = Object.getPrototypeOf(T.connection.connections[0].constructor);
    assert.throws(() => new Conn(), /abstract/);
    const Input = Object.getPrototypeOf(T.connection.connections[0].udp.constructor);
    assert.throws(() => new Input(null, 'x'), /abstract/);
});

test('connects a WebSocket with ordered binary messages', () => {
    const { conn, ws } = connect();
    assert.equal(ws.url, 'ws://localhost:8080');
    assert.equal(ws.binaryType, 'arraybuffer');
    assert.equal(conn.name, 'localhost:8080');
    assert.equal(conn.connected, false);
});

test('once open: connected, and nothing is sent to the server (what a page sends is a command for the device)', () => {
    const { T, conn, ws } = connect();
    ws.onopen();
    T.__timers.run();
    assert.equal(conn.connected, true);
    assert.equal(conn.udp.connected, true);
    assert.deepEqual(ws.sent, []);
});

test('binary WebSocket messages are decoded as binary packets', () => {
    const { T, ws } = connect();
    ws.onmessage({ data: new PacketBuilder(1).numbers(1, 1_000_000_000n, [[0, 2.5]]).build() });
    assert.deepEqual(T.datastore.getTelemetry(0x10001).data[20].data[0], [2.5]);
});

test('text WebSocket messages (json from the server) are decoded as V1 text', () => {
    const { T, ws } = connect();
    ws.onmessage({ data: JSON.stringify({ data: 'a:1000:5', fromSerial: false, timestamp: 1 }) });
    assert.deepEqual(T.datastore.getTelemetry('a').data[20].data[0], [5]);
});

test('text packets of the server: each one is dated when the server received it, on the clock of the page', () => {
    const { T, conn } = connect();
    const times = (name) => T.datastore.getTelemetry(name).data[20].timestamps.map(t => Math.round(t * 1e6) / 1e3); // ms
    // The clock of the server only counts (5000 ms here); the message took 20 ms to come
    conn.__receivePackets({ time: 5050, packets: [[5001, 'a:1'], [5002.5, 'a:2\nb:7'], [5049, 'a:3']] }, 1_000_000_020);
    assert.deepEqual(times('a'), [999_999_971, 999_999_972.5, 1_000_000_019], 'as far apart as the server received them');
    assert.deepEqual(times('b'), [999_999_972.5]);
    assert.equal(conn.stats.messages, 3, 'counted as packets');
    assert.equal(conn.stats.bytes, 3 + 7 + 3);
    // The next message takes 60 ms more: its samples are not pushed 60 ms later
    conn.__receivePackets({ time: 5100, packets: [[5051, 'a:4']] }, 1_000_000_130);
    assert.ok(Math.abs(times('a')[3] - 1_000_000_021) < 0.1, String(times('a')[3]));
    // A faster one than ever: the estimate improves, samples are never in the future
    conn.__receivePackets({ time: 5150, packets: [[5150, 'a:5']] }, 1_000_000_110);
    assert.equal(times('a')[4], 1_000_000_110);
    // A sample that has its own timestamp keeps it
    conn.__receivePackets({ time: 5200, packets: [[5199, 'c:1234:5']] }, 1_000_000_160);
    assert.deepEqual(times('c'), [1234]);
    // A clock that stopped for long (the computer slept): started again from that message
    conn.__receivePackets({ time: 5250, packets: [[5250, 'a:6']] }, 1_000_600_000);
    assert.equal(times('a')[5], 1_000_600_000);
    // A new connection (the server may have restarted: its clock too)
    conn.connect('localhost', 8080);
    conn.__receivePackets({ time: 10, packets: [[10, 'a:7']] }, 1_000_700_000);
    assert.equal(times('a')[6], 1_000_700_000);
});

test('text packets of the server through the WebSocket; packets the server dropped are counted', () => {
    const { T, conn, ws } = connect();
    ws.onmessage({ data: JSON.stringify({ time: 100, packets: [[90, 'a:1'], [95, 'nope']], dropped: 4 }) });
    assert.ok(Math.abs(T.datastore.getTelemetry('a').data[20].timestamps[0] - (Date.now() - 10) / 1000) < 5);
    ws.onmessage({ data: JSON.stringify({ time: 150, packets: [], dropped: 2 }) });
    assert.deepEqual([conn.stats.messages, conn.stats.problems, conn.stats.dropped], [2, 1, 6]);
});

test('a Teleplot V1 server (one text per batch, dated on its own clock): the time of reception is used', () => {
    const { T, ws } = connect();
    ws.onmessage({ data: JSON.stringify({ data: 'a:5', fromSerial: false, timestamp: 1 }) });
    assert.ok(Math.abs(T.datastore.getTelemetry('a').data[20].timestamps[0] - Date.now() / 1000) < 5);
});

test('several binary packets in one message, framed like a binary file; a cut one is a problem', () => {
    const { T, conn, ws } = connect();
    const packets = [1, 2, 3].map(v => new Uint8Array(new PacketBuilder(4).numbers(v, 1_000_000_000n, [[0, v * 1.5]]).build()));
    const frame = (list, cut = 0) => {
        const bytes = [...T.protocol.FILE_MAGIC];
        for (const packet of list) bytes.push(packet.length & 0xff, packet.length >> 8, 0, 0, ...packet);
        return Uint8Array.from(bytes.slice(0, bytes.length - cut)).buffer;
    };
    ws.onmessage({ data: frame(packets) });
    assert.deepEqual([1, 2, 3].map(v => T.datastore.getTelemetry(0x40000 + v).data[20].data[0]), [[1.5], [3], [4.5]]);
    assert.deepEqual([conn.stats.messages, conn.stats.problems], [3, 0]);
    assert.equal(conn.stats.bytes, packets.reduce((sum, p) => sum + p.length, 0), 'the packets, not the framing');
    ws.onmessage({ data: frame(packets.slice(0, 2), 3) });
    assert.deepEqual(T.datastore.getTelemetry(0x40001).data[20].data[0], [1.5, 1.5], 'the whole packets before the cut are read');
    assert.equal(conn.stats.problems, 1);
    ws.onmessage({ data: frame([]) });
    assert.equal(conn.stats.problems, 1, 'an empty batch is nothing');
});

test('messages with an input id are routed to that input', () => {
    const { T, conn, ws } = connect();
    conn.createInput('serial');
    const serial = conn.inputs[1];
    ws.onmessage({ data: JSON.stringify({ id: serial.id, data: 'plain', timestamp: 1000 }) });
    const logs = Object.values(T.datastore.telemetries).find(t => t.getAttribute(T.protocol.TELEM_ATTR_NAME).endsWith('_text_logs'));
    assert.deepEqual(logs.data[23].data[0], ['plain']); // serial lines are logs
});

test('serial input: port list filtered, connection state, commands sent through the server', () => {
    const { conn, ws } = connect();
    conn.createInput('serial');
    const serial = conn.inputs[1];
    ws.sent.length = 0;
    serial.onMessage({ cmd: 'serialPortList', list: [{ path: 'a', vendorId: '1' }, { path: 'b' }] });
    assert.deepEqual(serial.portList.map(p => p.path), ['a']);
    serial.onMessage({ cmd: 'serialPortConnect' });
    assert.equal(serial.connected, true);
    serial.onMessage({ cmd: 'serialPortDisconnect' });
    assert.equal(serial.connected, false);

    serial.port = 'COM1'; serial.baudrate = '9600';
    serial.connect();
    serial.sendText('hi', '\\r\\n');
    assert.deepEqual(ws.sent.map(s => JSON.parse(s)), [
        { id: serial.id, cmd: 'connectSerialPort', port: 'COM1', baud: 9600 },
        { id: serial.id, cmd: 'sendToSerial', text: 'hi\r\n' },
    ]);
});

test('closing the socket disconnects the inputs and schedules a reconnection', () => {
    const { T, conn, ws } = connect();
    ws.onopen(); T.__timers.run();
    ws.onclose();
    assert.equal(conn.connected, false);
    assert.equal(conn.udp.connected, false);
    assert.equal(FakeWebSocket.instances.length, 1);
    T.__timers.run(); // reconnect timer
    assert.equal(FakeWebSocket.instances.length, 2);
});

test('disconnect closes the socket; sending without socket does nothing', () => {
    const { conn, ws } = connect();
    conn.disconnect();
    assert.equal(ws.closed, true);
    assert.doesNotThrow(() => conn.sendServerCommand({ cmd: 'x' }));
});

test('UDP input: binary and text; unknown messages are ignored', () => {
    const { T, conn } = connect();
    const udp = conn.udp;
    udp.onMessage(new PacketBuilder(2).numbers(1, 1_000_000_000n, [[0, 1]]).build());
    udp.onMessage({ data: 'x:1000:1' });
    assert.doesNotThrow(() => udp.onMessage({ cmd: 'whatever' }));
    assert.ok(T.datastore.getTelemetry(0x20001));
    assert.ok(T.datastore.getTelemetry('x'));
});

test('what a connection receives is counted and attributed to it (telemetries, clients, problems)', () => {
    const { T, conn, ws } = connect();
    assert.deepEqual([conn.stats.messages, conn.stats.problems, conn.stats.bytes, conn.stats.lastMessage], [0, 0, 0, 0]);
    ws.onmessage({ data: JSON.stringify({ data: 'a:1\nnot a telemetry\nb:2', timestamp: 1 }) });
    assert.equal(conn.stats.bytes, 23, 'text: the size of the lines received');
    const packet = new PacketBuilder(3).numbers(1, 1_000_000_000n, [[0, 2.5]]).build();
    ws.onmessage({ data: packet });
    assert.equal(conn.stats.bytes, 23 + packet.byteLength, 'binary: the size of the packet');
    const printed = captureConsole(() => ws.onmessage({ data: new Uint8Array([1, 2, 3, 4, 5, 6]).buffer }));
    assert.equal(conn.stats.bytes, 23 + packet.byteLength + 6, 'a packet that cannot be read was received all the same');
    const Conn = Object.getPrototypeOf(conn.constructor);
    assert.deepEqual(['abc', 'é', '€', '😀', 'a°C\n'].map(Conn.byteLength), [3, 2, 3, 4, 5], 'bytes of a text in UTF-8');
    assert.equal(printed.log.length, 1);
    assert.deepEqual([conn.stats.messages, conn.stats.problems], [3, 2], 'a line without "name:value" and an invalid packet');
    assert.ok(conn.stats.lastMessage > 0);
    assert.deepEqual(['a', 'b', 0x30001].map(n => T.datastore.getTelemetry(n).sourceId), [conn.id, conn.id, conn.id]);
    assert.equal(T.clients.getClient(3).sourceId, conn.id);
    assert.equal(T.datastore.getOrCreateTelemetry('local').sourceId, undefined, 'created by the application: no source');
    // parsers tell what they could not read
    assert.equal(T.parseDataText('c:1\n\n   \nd:2'), 0, 'empty lines are not problems');
    assert.equal(T.parseDataText('nope'), 1);
    assert.equal(T.parseDataBinary(new PacketBuilder(3).numbers(1, 1_000_000_000n, [[0, 1]]).build()), true);
    // clearData empties every telemetry and keeps them
    T.datastore.clearData();
    assert.deepEqual([T.datastore.hasTelemetry('a'), Object.keys(T.datastore.getTelemetry('a').data).length], [true, 0]);
});

test('a server that closes is tried again later; retry() does it now; disconnect() and removeConnection() stop it', () => {
    const { T, conn, ws } = connect();
    ws.onopen();
    T.__timers.run();
    assert.deepEqual([conn.connected, conn.everConnected, conn.nextRetryAt], [true, true, 0]);
    ws.onclose();
    assert.equal(conn.connected, false);
    assert.ok(conn.nextRetryAt > Date.now(), 'a try is planned');
    conn.retry();
    assert.equal(FakeWebSocket.instances.length, 2, 'tried right away');
    assert.equal(conn.nextRetryAt, 0);
    T.__timers.run();
    assert.equal(FakeWebSocket.instances.length, 2, 'the planned try was cancelled: no second socket');

    const second = FakeWebSocket.instances[1];
    conn.disconnect();
    assert.deepEqual([second.closed, conn.closed, conn.connected], [true, true, false]);
    second.onclose();
    T.__timers.run();
    assert.equal(FakeWebSocket.instances.length, 2, 'closed on purpose: no more tries');

    assert.equal(T.connection.removeConnection(conn), true);
    assert.equal(T.connection.connections.length, 0);
});
