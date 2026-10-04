// 112-viewLog: rows built from text telemetries, time window, cursor, line limit (data side, without DOM)
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');

const TEXT = 23;
function setup(names = ['log']) {
    const T = loadTeleplot();
    const telems = names.map(n => T.datastore.getOrCreateTelemetry(n));
    const view = new T.view.ViewLog('log-div', names);
    return { T, telems, view };
}
const texts = view => view.state.rows.map(r => r.text);

test('text telemetries are listed oldest first, newest last', () => {
    const { telems, view } = setup();
    telems[0].addData(TEXT, [1, 2, 3], [['a', 'b', 'c']]);
    view.update();
    assert.deepEqual(texts(view), ['a', 'b', 'c']);
    assert.equal(view.state.hidden, 0);
    assert.equal(view.state.multi, false);
});

test('new text is appended on the next update, nothing is rebuilt when nothing changed', () => {
    const { telems, view } = setup();
    telems[0].addData(TEXT, [1], [['a']]);
    view.update();
    const rows = view.state.rows;
    view.update();
    assert.equal(view.state.rows, rows);
    telems[0].addData(TEXT, [2], [['b']]);
    view.update();
    assert.deepEqual(texts(view), ['a', 'b']);
});

test('several telemetries are merged in time order and carry their name', () => {
    const { telems, view } = setup(['x', 'y']);
    telems[0].addData(TEXT, [1, 3], [['x1', 'x3']]);
    telems[1].addData(TEXT, [2, 4], [['y2', 'y4']]);
    view.update();
    assert.deepEqual(texts(view), ['x1', 'y2', 'x3', 'y4']);
    assert.equal(view.state.multi, true);
    assert.deepEqual(view.state.rows.map(r => r.name), ['x', 'y', 'x', 'y']);
});

test('only text data is listed (numbers and unknown telemetries are ignored)', () => {
    const { T, telems, view } = setup(['log', 'num']);
    telems[0].addData(TEXT, [1], [['a']]);
    telems[1].addData(20, [1], [[42]]);
    view.telemetryIdOrNameList.push('does.not.exist');
    view.update();
    assert.deepEqual(texts(view), ['a']);
    assert.equal(view.state.multi, false);
});

test('the zoomed time window of the group limits the lines', () => {
    const { T, telems, view } = setup();
    telems[0].addData(TEXT, [1, 2, 3, 4, 5], [['a', 'b', 'c', 'd', 'e']]);
    const group = T.view.groups.default;
    group.cursorActive = true; group.timestampFrom = 2; group.timestampTo = 4;
    view.update();
    assert.deepEqual(texts(view), ['b', 'c', 'd']); // bounds included
    group.cursorActive = false;
    view.update();
    assert.equal(view.state.rows.length, 5);
});

test('maxLines keeps the newest lines and reports the hidden ones', () => {
    const { telems, view } = setup();
    const t = [], v = [];
    for (let i = 0; i < 20; i++) { t.push(i + 1); v.push('l' + i); }
    telems[0].addData(TEXT, t, [v]);
    view.setOption('maxLines', 5);
    view.update();
    assert.deepEqual(texts(view), ['l15', 'l16', 'l17', 'l18', 'l19']);
    assert.equal(view.state.hidden, 15);
});

test('the line closest to the group cursor is highlighted, none without cursor', () => {
    const { T, telems, view } = setup();
    telems[0].addData(TEXT, [10, 20, 30], [['a', 'b', 'c']]);
    const group = T.view.groups.default;
    view.update();
    assert.equal(view.state.cursorIndex, -1);
    group.cursorTimestamp = 22;
    view.update();
    assert.equal(view.state.cursorIndex, 1);
    group.cursorTimestamp = 28;
    view.update();
    assert.equal(view.state.cursorIndex, 2);
    group.cursorTimestamp = 1000; // after the last line
    view.update();
    assert.equal(view.state.cursorIndex, 2);
    group.cursorTimestamp = -1;
    view.update();
    assert.equal(view.state.cursorIndex, -1);
});

test('hovering a line moves the group cursor, leaving the view clears it', () => {
    const { T, telems, view } = setup();
    telems[0].addData(TEXT, [10, 20], [['a', 'b']]);
    view.update();
    view.hoverRow(view.state.rows[1]);
    assert.equal(T.view.groups.default.cursorTimestamp, 20);
    view.update();
    assert.equal(view.state.cursorIndex, 1);
    view.hoverEnd();
    assert.equal(T.view.groups.default.cursorTimestamp, -1);
    view.update();
    assert.equal(view.state.cursorIndex, -1);
});

test('leaving the cursor goes back to live: the view follows the latest line again', () => {
    const { T, telems, view } = setup();
    telems[0].addData(TEXT, [10, 20], [['a', 'b']]);
    view.update();
    view.followLatest = false; // the user had scrolled up
    T.view.groups.default.cursorTimestamp = 10;
    view.update();
    assert.equal(view.followLatest, false);
    T.view.groups.default.cursorTimestamp = -1;
    view.update();
    assert.equal(view.followLatest, true);
});

test('lines are formatted with a local time', () => {
    const f = loadTeleplot().view.ViewLog.formatTime;
    const d = new Date(2026, 9, 4, 13, 5, 9, 42);
    assert.equal(f(d.getTime() / 1000), '13:05:09.042');
});

test('bound() finds the first index at or after / after a value', () => {
    const { bound } = loadTeleplot().view.ViewLog;
    const a = [1, 2, 2, 4];
    assert.equal(bound(a, 2), 1);
    assert.equal(bound(a, 2, true), 3);
    assert.equal(bound(a, 0), 0);
    assert.equal(bound(a, 9), 4);
    assert.equal(bound([], 1), 0);
});
