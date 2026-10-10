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

test('once open: connected, and serial ports are requested', () => {
    const { T, conn, ws } = connect();
    ws.onopen();
    T.__timers.run();
    assert.equal(conn.connected, true);
    assert.equal(conn.udp.connected, true);
    assert.deepEqual(ws.sent.map(s => JSON.parse(s)), [{ cmd: 'listSerialPorts' }]);
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
