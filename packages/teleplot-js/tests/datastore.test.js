const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot, captureConsole } = require('./helpers/load');

const NUMBER = 20;
function setup() {
    const T = loadTeleplot();
    return { T, telem: T.datastore.addTelemetry('t') };
}
const stamps = telem => telem.data[NUMBER].timestamps;
const values = telem => telem.data[NUMBER].data[0];

test('in-order data is appended, equal timestamps keep arrival order', () => {
    const { telem } = setup();
    telem.addData(NUMBER, [1, 2, 2, 3], [[10, 20, 21, 30]]);
    assert.deepEqual(stamps(telem), [1, 2, 2, 3]);
    assert.deepEqual(values(telem), [10, 20, 21, 30]);
    assert.equal(telem.data[NUMBER].lateInsertions, 0);
});

test('late data is inserted at the right place and counted', () => {
    const { telem } = setup();
    telem.addData(NUMBER, [1, 2, 4, 5], [[1, 2, 4, 5]]);
    telem.addData(NUMBER, [3, 0.5, 6], [[3, 0.5, 6]]);
    assert.deepEqual(stamps(telem), [0.5, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(values(telem), [0.5, 1, 2, 3, 4, 5, 6]);
    assert.equal(telem.data[NUMBER].lateInsertions, 2);
});

test('timestamps and every channel stay aligned (2D)', () => {
    const { telem } = setup();
    telem.addData(21, [1, 3], [[10, 30], [100, 300]]);
    telem.addData(21, [2], [[20], [200]]);
    assert.deepEqual(telem.data[21].timestamps, [1, 2, 3]);
    assert.deepEqual(telem.data[21].data, [[10, 20, 30], [100, 200, 300]]);
});

test('negative timestamps are ignored', () => {
    const { telem } = setup();
    telem.addData(NUMBER, [-1, 1], [[7, 8]]);
    assert.deepEqual(stamps(telem), [1]);
});

test('malformed input is rejected without storing anything', () => {
    const { telem } = setup();
    const out = captureConsole(() => {
        telem.addData(NUMBER, [1, 2], [[1, 2], [3, 4]]); // wrong channel count
        telem.addData(NUMBER, [1, 2], [[1]]);            // length mismatch
        telem.addData(999, [1], [[1]]);                  // unknown type
    });
    assert.ok(out.error.length >= 3, "each rejection is reported");
    assert.equal(telem.data[NUMBER], undefined);
});

test('nothing is stored while paused', () => {
    const { T, telem } = setup();
    T.state.isPaused = true;
    telem.addData(NUMBER, [1], [[1]]);
    assert.equal(telem.data[NUMBER], undefined);
});

test('getDataPoint returns the closest sample, or the latest without timestamp', () => {
    const { telem } = setup();
    telem.addData(NUMBER, [1, 2, 4, 8], [[1, 2, 4, 8]]);
    assert.equal(telem.getDataPoint(NUMBER).timestamp, 8);
    assert.equal(telem.getDataPoint(NUMBER, 2.9).timestamp, 2);
    assert.equal(telem.getDataPoint(NUMBER, 3.1).timestamp, 4);
    assert.equal(telem.getDataPoint(NUMBER, 100).timestamp, 8);
    assert.equal(telem.getDataPoint(NUMBER, 0).timestamp, 1);
    assert.equal(telem.getDataPoint(NUMBER + 1).index, undefined); // no such data
});

test('old data is pruned using the global timeout, or the telemetry attribute', () => {
    const { T, telem } = setup();
    T.state.dataTimeout = 5;
    telem.addData(NUMBER, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]);
    telem.__deleteTimedOutData();
    assert.deepEqual(stamps(telem), [5, 6, 7, 8, 9, 10]);
    assert.equal(values(telem).length, 6);

    telem.setAttribute(T.protocol.TELEM_ATTR_DATA_TIMEOUT, 2); // seconds
    telem.__deleteTimedOutData();
    assert.deepEqual(stamps(telem), [8, 9, 10]);

    telem.setAttribute(T.protocol.TELEM_ATTR_DATA_TIMEOUT, 0); // 0 = keep everything
    telem.addData(NUMBER, [1000], [[1]]);
    telem.__deleteTimedOutData();
    assert.equal(stamps(telem).length, 4);
});

test('clearData empties the telemetry', () => {
    const { telem } = setup();
    telem.addData(NUMBER, [1], [[1]]);
    telem.clearData();
    assert.deepEqual(telem.data, {});
});

test('telemetries are reachable by name and by generated id', () => {
    const { T } = setup();
    const a = T.datastore.getOrCreateTelemetry('a');
    assert.equal(T.datastore.getOrCreateTelemetry('a'), a);
    assert.equal(T.datastore.getTelemetry(a.id), a);
    assert.equal(a.getAttribute(T.protocol.TELEM_ATTR_NAME), 'a');
    assert.ok(a.id < 0, 'named telemetries get negative ids, numeric ids are for binary telemetries');
    assert.equal(T.datastore.getOrCreateTelemetry(42).id, 42);
    assert.equal(T.datastore.hasTelemetry('nope'), false);
});
