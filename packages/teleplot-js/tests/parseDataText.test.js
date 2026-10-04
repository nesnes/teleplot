// V1 text protocol (must stay retro-compatible)
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTeleplot, captureConsole } = require('./helpers/load');

const NUMBER = 20, NUMBER_2D = 21, TEXT = 23;
const parse = (T, data, extra = {}) => T.parseDataText({ data, timestamp: 1000000, ...extra });
const entry = (T, name, type = NUMBER) => T.datastore.getTelemetry(name).data[type];

test('name:value uses the reception time (ms to seconds)', () => {
    const T = loadTeleplot();
    parse(T, 'a:12.5');
    assert.deepEqual(entry(T, 'a').data[0], [12.5]);
    assert.ok(Math.abs(entry(T, 'a').timestamps[0] - Date.now() / 1000) < 5);
});

test('name:timestamp:value uses the given timestamp in ms', () => {
    const T = loadTeleplot();
    parse(T, 'a:1500:3');
    assert.deepEqual(entry(T, 'a').timestamps, [1.5]);
    assert.deepEqual(entry(T, 'a').data[0], [3]);
});

test('several samples in one message, with and without timestamps', () => {
    const T = loadTeleplot();
    parse(T, 'a:1000:1;2000:2;3000:3');
    assert.deepEqual(entry(T, 'a').timestamps, [1, 2, 3]);
    assert.deepEqual(entry(T, 'a').data[0], [1, 2, 3]);
});

test('several lines in one message', () => {
    const T = loadTeleplot();
    parse(T, 'a:1000:1\nb:1000:2\na:2000:3');
    assert.deepEqual(entry(T, 'a').data[0], [1, 3]);
    assert.deepEqual(entry(T, 'b').data[0], [2]);
});

test('unit is stored as an attribute and removed from the value', () => {
    const T = loadTeleplot();
    parse(T, 'a:1000:5§m/s');
    assert.equal(T.datastore.getTelemetry('a').getAttribute(T.protocol.TELEM_ATTR_UNIT), 'm/s');
    assert.deepEqual(entry(T, 'a').data[0], [5]);
    parse(T, 'a:2000:6§V|np');
    assert.equal(T.datastore.getTelemetry('a').getAttribute(T.protocol.TELEM_ATTR_UNIT), 'V');
});

test('flags: np disables autoplot, clr clears the data', () => {
    const T = loadTeleplot();
    parse(T, 'a:1000:1;2000:2|np');
    assert.equal(T.datastore.getTelemetry('a').getAttribute(T.protocol.TELEM_ATTR_AUTOPLOT), false);
    parse(T, 'a:3000:9|clr');
    assert.deepEqual(entry(T, 'a').data[0], [9]);
});

test('xy flag stores 2D samples, with and without timestamp', () => {
    const T = loadTeleplot();
    parse(T, 'p:1:2:3000|xy');
    assert.deepEqual(entry(T, 'p', NUMBER_2D).data, [[1], [2]]);
    assert.deepEqual(entry(T, 'p', NUMBER_2D).timestamps, [3]);
    parse(T, 'p:5:6|xy');
    assert.deepEqual(entry(T, 'p', NUMBER_2D).data, [[1, 5], [2, 6]]);
});

test('t flag stores text values', () => {
    const T = loadTeleplot();
    parse(T, 'state:1000:Turned On|t');
    assert.deepEqual(entry(T, 'state', TEXT).data[0], ['Turned On']);
});

test('widget label is not part of the telemetry name', () => {
    const T = loadTeleplot();
    parse(T, 'a,chart1:1000:1');
    assert.ok(T.datastore.hasTelemetry('a'));
    assert.ok(!T.datastore.hasTelemetry('a,chart1'));
});

test('logs: >text and >timestamp:text', () => {
    const T = loadTeleplot();
    parse(T, '>:hello');
    parse(T, '>2000:world');
    const logs = entry(T, '_text_logs', TEXT);
    assert.deepEqual(logs.data[0].sort(), ['hello', 'world']);
    assert.ok(logs.timestamps.includes(2));
});

test('serial input: plain lines are logs, > lines are variables', () => {
    const T = loadTeleplot();
    parse(T, 'plain text', { fromSerial: true });
    parse(T, '>a:1000:4', { fromSerial: true });
    assert.deepEqual(entry(T, '_text_logs', TEXT).data[0], ['plain text']);
    assert.deepEqual(entry(T, 'a').data[0], [4]);
});

test('statsd lines, lines without ":" and paused state are ignored', () => {
    const T = loadTeleplot();
    parse(T, 'statsd.x:1|c\nno separator');
    assert.deepEqual(T.datastore.telemetries, {});
    T.state.isPaused = true;
    parse(T, 'a:1');
    assert.equal(T.datastore.hasTelemetry('a'), false);
});

test('garbage never throws', () => {
    const T = loadTeleplot();
    const garbage = [':', '::', 'a:', 'a:;;;', '|', '>', '>:', 'a:b:c:d:e', 'JPG|', '\n\n', 'a:1|', '§', 'a:§|'];
    captureConsole(() => garbage.forEach(g => assert.doesNotThrow(() => parse(T, g), g)));
    assert.doesNotThrow(() => T.parseDataText('a:1'));
});
