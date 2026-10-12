// main.js: a real server on free ports, real UDP packets and WebSocket pages ("ws" comes with express-ws)
const test = require('../../teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const WebSocket = require('ws');
const { startServer, parseArguments, parseServed, isOriginAllowed, helpText, DEFAULTS } = require('../main.js');
const { loadTeleplot } = require('../../teleplot-js/tests/helpers/load');

const sleep = (ms) => new Promise(done => setTimeout(done, ms));
async function until(condition, what, timeout = 3000) {
    for (const start = Date.now(); !condition();) {
        if (Date.now() - start > timeout) assert.fail('timeout waiting for ' + what);
        await sleep(5);
    }
}

// A server on free ports, with what it printed. Commands go to a UDP socket of the test.
async function start(options = {}) {
    const device = dgram.createSocket('udp4');
    const commands = [];
    device.on('message', (m) => commands.push(m.toString()));
    await new Promise(done => device.bind(0, '127.0.0.1', done));
    const printed = [];
    const server = await startServer({ port: 0, udpPort: 0, host: '127.0.0.1', cmdPort: device.address().port, batch: 10, www: __dirname, log: (line) => printed.push(line), ...options });
    const sender = dgram.createSocket('udp4');
    const pages = [];
    return {
        server, printed, commands,
        send: (data) => new Promise(done => sender.send(data, server.udpPort, '127.0.0.1', done)),
        // A page: its messages are in .received (text ones parsed)
        page: async (headers = {}) => {
            const page = new WebSocket(`ws://127.0.0.1:${server.port}`, { headers });
            page.received = [];
            page.on('message', (data) => page.received.push(typeof data == 'string' ? JSON.parse(data) : data));
            pages.push(page);
            await new Promise((done, failed) => { page.on('open', done); page.on('error', failed); });
            return page;
        },
        stop: async () => {
            for (const page of pages) page.terminate();
            sender.close(); device.close();
            await server.close();
        },
    };
}

test('command line: every option, with = or a space; mistakes are told', () => {
    assert.deepEqual(parseArguments([]).options, {});
    assert.deepEqual(parseArguments(['--port', '9000', '--host=127.0.0.1', '--udp-port=1', '--udp-host', '::1', '--cmd-port', '2', '--cmd-host', 'robot.local',
        '--allow-origin', 'https://a.b, null', '--allow-origin=c', '--batch', '0', '--max-buffer', '0.5', '--www', '/x=y', '--serve', 'a,b', '--serve=/maps=/data/maps']).options,
        { port: 9000, host: '127.0.0.1', udpPort: 1, udpHost: '::1', cmdPort: 2, cmdHost: 'robot.local', allowOrigin: ['https://a.b', 'null', 'c'], batch: 0, maxBuffer: 0.5, www: '/x=y', serve: ['a,b', '/maps=/data/maps'] });
    assert.match(parseArguments(['--nope']).error, /Unknown option --nope/);
    assert.match(parseArguments(['--port']).error, /needs a value/);
    for (const bad of ['abc', '70000', '1.5', '-1', '']) assert.match(parseArguments(['--port', bad]).error, /--port needs/, bad);
    assert.match(parseArguments(['--batch', 'x']).error, /needs a number/);
    assert.equal(parseArguments(['-h']).help, true);
    assert.equal(parseArguments(['--version']).version, true);
    for (const name of ['--port', '--host', '--udp-port', '--cmd-host', '--allow-origin', '--batch', '--max-buffer', '--www', '--serve']) assert.ok(helpText().includes(name), name);
    assert.ok(helpText().includes('(default: 8080)'));
    assert.deepEqual([DEFAULTS.port, DEFAULTS.udpPort, DEFAULTS.cmdPort], [8080, 47269, 47268]);
});

test('origins: pages of this machine and what is listed, not the other sites', () => {
    const own = Object.values(require('node:os').networkInterfaces()).flat().find(a => a.family == 'IPv4' && !a.internal);
    for (const origin of [undefined, 'http://localhost:8080', 'http://127.0.0.1:5500', 'http://[::1]:8080', 'http://app.localhost', own && `http://${own.address}:8080`]) {
        assert.equal(isOriginAllowed(origin), true, String(origin));
    }
    for (const origin of ['http://evil.example', 'https://localhost.evil.example', 'null', 'file://', 'not an origin']) assert.equal(isOriginAllowed(origin), false, origin);
    assert.equal(isOriginAllowed('https://my.site', ['https://my.site']), true);
    assert.equal(isOriginAllowed('https://my.site:8443', ['my.site']), true, 'a host name alone: any port and scheme');
    assert.equal(isOriginAllowed('http://my.site', ['https://my.site']), false);
    assert.equal(isOriginAllowed('null', ['null']), true);
    assert.equal(isOriginAllowed('http://evil.example', ['*']), true);
});

test('text packets reach every page with the time each one was received, and the library dates the samples with it', async () => {
    const t = await start({ batch: 80 });
    try {
        const pages = [await t.page(), await t.page()];
        await t.send('a:1');
        await sleep(30);
        await t.send('a:2\nb:5');
        await until(() => pages.every(p => p.received.length), 'the batch');
        for (const page of pages) {
            assert.equal(page.received.length, 1, 'one message for the batch');
            const { time, packets, dropped } = page.received[0];
            assert.deepEqual(packets.map(p => p[1]), ['a:1', 'a:2\nb:5'], 'the packets as they came');
            assert.equal(dropped, undefined);
            const gap = packets[1][0] - packets[0][0];
            assert.ok(gap > 20 && gap < 70, `received 30 ms apart: ${gap}`);
            assert.ok(time >= packets[1][0]);
        }
        // What the library makes of it: two samples of "a", as far apart as the packets, not one instant
        const T = loadTeleplot();
        T.connection.addConnectionTeleplotServer('localhost', 8080);
        T.connection.connections[0].socket.onmessage({ data: JSON.stringify(pages[0].received[0]) });
        const [first, second] = T.datastore.getTelemetry('a').data[20].timestamps;
        assert.ok(second - first > 0.02 && second - first < 0.07, String(second - first));
        assert.ok(second <= Date.now() / 1000 && second > Date.now() / 1000 - 5);
    } finally { await t.stop(); }
});

test('binary packets: one as it is, several in one message framed like a binary file; nothing is kept without a page', async () => {
    const t = await start({ batch: 60 });
    try {
        await t.send('before:1'); // nobody is there
        await t.send(Buffer.from([0x10, 1, 0, 0]));
        await sleep(20);
        const page = await t.page();
        const one = Buffer.from([0x10, 1, 2, 3, 4]);
        await t.send(one);
        await until(() => page.received.length == 1, 'a packet');
        assert.deepEqual([...page.received[0]], [...one]);
        await sleep(70);
        await t.send(one);
        await t.send(Buffer.from([0x10, 9]));
        await t.send(Buffer.alloc(0));
        await until(() => page.received.length == 2, 'a batch');
        assert.deepEqual([...page.received[1]], [0x54, 0x50, 0x4C, 0x54, 0x0A, 0x01, 0, 0, 5, 0, 0, 0, ...one, 2, 0, 0, 0, 0x10, 9]);
        await sleep(80);
        assert.equal(page.received.length, 2);
    } finally { await t.stop(); }
});

test('batch 0: each packet is sent as it arrives', async () => {
    const t = await start({ batch: 0 });
    try {
        const page = await t.page();
        await t.send('a:1');
        await until(() => page.received.length == 1, 'the first');
        await t.send('a:2');
        await until(() => page.received.length == 2, 'the second');
        assert.deepEqual(page.received.map(m => m.packets.map(p => p[1])), [['a:1'], ['a:2']]);
    } finally { await t.stop(); }
});

test('commands of a page go to the device; those for a V1 server and what is not a command do not', async () => {
    const t = await start();
    try {
        const page = await t.page();
        page.send(JSON.stringify({ cmd: 'listSerialPorts' }));
        page.send(JSON.stringify({ id: 'x', cmd: 'connectSerialPort', port: 'COM1' }));
        page.send('not json');
        page.send(JSON.stringify({ cmd: 12 }));
        page.send(JSON.stringify(null));
        page.send(JSON.stringify({ id: 'data-input-1', cmd: '|sayHello|you|' }));
        await until(() => t.commands.length, 'the command');
        await sleep(30);
        assert.deepEqual(t.commands, ['|sayHello|you|']);
        assert.equal(t.printed.filter(line => /not JSON/.test(line)).length, 1);
        assert.equal(t.printed.filter(line => /no "cmd"/.test(line)).length, 1, 'the same warning is not repeated');
    } finally { await t.stop(); }
});

test('an invalid WebSocket frame from a page does not stop the server', async () => {
    const t = await start();
    try {
        const page = await t.page();
        const socket = net.connect(t.server.port, '127.0.0.1');
        socket.write('GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
        await sleep(50);
        socket.write(Buffer.from([0xF1, 0x80, 0, 0, 0, 0])); // reserved bits set
        await until(() => t.printed.some(line => /A page was disconnected/.test(line)), 'the report');
        // and a message that is too big
        const big = await t.page();
        big.send(JSON.stringify({ cmd: 'x'.repeat(100000) }));
        await new Promise(done => big.on('close', done));
        await t.send('a:1');
        await until(() => page.received.length == 1, 'data after the bad page');
        assert.deepEqual(t.commands, []);
        socket.destroy();
    } finally { await t.stop(); }
});

test('pages of another site are refused, unless their origin is allowed', async () => {
    const t = await start({ allowOrigin: ['https://my.site'] });
    try {
        await assert.rejects(t.page({ Origin: 'http://evil.example' }), /403/);
        await assert.rejects(t.page({ Origin: 'null' }), /403/);
        assert.ok(t.printed.some(line => line.includes('--allow-origin http://evil.example')), t.printed.join('\n'));
        await t.page({ Origin: 'https://my.site' });
        await t.page({ Origin: `http://localhost:${t.server.port}` });
        await t.page({ Origin: 'http://127.0.0.1:5500' });
    } finally { await t.stop(); }
});

test('a port that is taken: the server does not start, says which one and how to choose another, and leaves nothing open', async () => {
    const t = await start();
    try {
        const free = await start();
        const freePorts = [free.server.port, free.server.udpPort];
        await free.stop();
        await assert.rejects(startServer({ port: t.server.port, host: '127.0.0.1', udpPort: freePorts[1], log() {} }),
            new RegExp(`Port ${t.server.port} \\(web page and WebSocket\\) is already in use.*--port`));
        await assert.rejects(startServer({ port: freePorts[0], host: '127.0.0.1', udpPort: t.server.udpPort, log() {} }),
            new RegExp(`Port ${t.server.udpPort} \\(telemetry, UDP\\) is already in use.*--udp-port`));
        await sleep(20);
        const again = await startServer({ port: freePorts[0], host: '127.0.0.1', udpPort: freePorts[1], log() {} }); // the other port of each try was released
        await again.close();
    } finally { await t.stop(); }
});

test('a page that does not read: packets are dropped for it above the limit, it is told how many, the others get everything', async () => {
    const t = await start({ maxBuffer: 0.25, batch: 5 });
    try {
        const slow = await t.page(), fast = await t.page();
        slow._socket.pause();
        const packet = 'big:' + 'x'.repeat(8000); // (under the size some systems limit UDP packets to)
        let sent = 0;
        for (; sent < 3000 && !t.printed.some(line => /too slow/.test(line)); sent++) {
            await t.send(packet);
            if (sent % 20 == 19) await sleep(6);
        }
        assert.ok(t.printed.some(line => /too slow.*0.25 MB/.test(line)), `no drop after ${sent} packets`);
        for (let i = 0; i < 40; i++) await t.send('more:' + i);
        await sleep(30);
        slow._socket.resume();
        await until(() => slow.received.some(m => m.dropped > 0), 'the count of dropped packets', 10000);
        await t.send('last:1');
        await until(() => slow.received.some(m => m.packets.some(p => p[1] == 'last:1')), 'data again');
        const count = (page) => page.received.reduce((sum, m) => sum + m.packets.length, 0);
        const dropped = slow.received.reduce((sum, m) => sum + (m.dropped || 0), 0);
        await until(() => fast.received.some(m => m.packets.some(p => p[1] == 'last:1')), 'the fast page');
        assert.ok(dropped >= 40, String(dropped));
        assert.equal(count(slow) + dropped, count(fast), 'every packet is either received or counted as dropped');
        assert.equal(fast.received.some(m => m.dropped), false);
    } finally { await t.stop(); }
});

test('serves the webapp folder; says so when there is none', async () => {
    const t = await start({ www: path.join(__dirname, '..') });
    try {
        const body = await new Promise((done, failed) => http.get(`http://127.0.0.1:${t.server.port}/package.json`, (answer) => {
            let text = ''; answer.on('data', d => text += d); answer.on('end', () => done(text));
        }).on('error', failed));
        assert.equal(JSON.parse(body).main, 'main.js');
        assert.equal(t.server.www, path.join(__dirname, '..'));
    } finally { await t.stop(); }
    const none = await start({ www: path.join(__dirname, 'nowhere') });
    try {
        assert.equal(none.server.www, undefined);
        assert.ok(none.printed.some(line => /does not exist: no web page is served/.test(line)));
        const page = await none.page();
        await none.send('a:1');
        await until(() => page.received.length == 1, 'data without a webapp');
    } finally { await none.stop(); }
});

test('other folders are served: at an address of their own, or next to the webapp, whose files come first', async () => {
    assert.deepEqual(parseServed('/maps=/data/maps'), { url: '/maps', folder: path.resolve('/data/maps') });
    assert.deepEqual(parseServed('/a/b=x=y'), { url: '/a/b', folder: path.resolve('x=y') });
    assert.deepEqual(parseServed('some/folder'), { url: '/', folder: path.resolve('some/folder') });
    assert.deepEqual(parseServed('C:\\data=1'), { url: '/', folder: path.resolve('C:\\data=1') }, 'an address starts with /');
    const lib = path.join(__dirname, '..', '..', 'teleplot-js');
    // www = the server folder (package.json, test.sh); the tests of the library under /lib, the library folder at the root
    const t = await start({ www: path.join(__dirname, '..'), serve: ['/lib/tests=' + path.join(lib, 'tests'), lib, path.join(__dirname, 'nowhere')] });
    const get = (file) => new Promise((done, failed) => http.get(`http://127.0.0.1:${t.server.port}${file}`, (answer) => {
        let text = ''; answer.on('data', d => text += d); answer.on('end', () => done([answer.statusCode, text]));
    }).on('error', failed));
    try {
        assert.deepEqual(t.server.served, [{ url: '/lib/tests', folder: path.join(lib, 'tests') }, { url: '/', folder: lib }]);
        assert.ok(t.printed.some(line => /nowhere does not exist: it is not served/.test(line)));
        assert.match((await get('/lib/tests/run.js'))[1], /runDir/);
        assert.match((await get('/build.sh'))[1], /teleplot-js\.js/, 'at the root');
        assert.match((await get('/test.sh'))[1], /server tests/, 'in both: the one of the webapp folder');
        assert.equal((await get('/lib/tests/nope.js'))[0], 404);
        assert.equal((await get('/lib/tests/..%2f..%2f..%2fserver/main.js'))[0] == 200, false, 'nothing outside the folder');
    } finally { await t.stop(); }
});
