// Time (doc/time.md): reception on and off, and the time shown per group (live, held, replay); 010, 012, 100, 111, 025
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');

const NUMBER = 20;

// A chart of "a" (registered: the time of a group is what its views show) with samples at 0, 1, ... 100 s
function setup(count = 101) {
    const T = loadTeleplot();
    const telem = T.datastore.getOrCreateTelemetry('a');
    const times = [], values = [];
    for (let i = 0; i < count; i++) { times.push(i); values.push(i % 7); }
    telem.addData(NUMBER, times, [values]);
    const chart = new T.view.ViewChart('chart-time', ['a']);
    chart.chart = new T.uPlot({}, [], null); // stand-in for the created uPlot (no DOM here)
    T.view.addView(chart);
    return { T, telem, chart, group: T.view.groups[chart.group], name: chart.group };
}

test('reception off: what comes is lost, why and since when is said, the period is remembered; isPaused is its older name', () => {
    const T = loadTeleplot();
    T.parseDataText('a:1');
    T.setReceiving(false);
    assert.deepEqual([T.state.receiving, T.state.isPaused, T.state.receivingOff.by], [false, true, 'user']);
    T.parseDataText('a:2');
    T.parseDataBinary(new Uint8Array([0x10, 1]));
    assert.equal(T.datastore.getTelemetry('a').data[NUMBER].timestamps.length, 1, 'nothing stored');
    assert.equal(T.datastore.offPeriods.length, 1);
    assert.equal(T.datastore.offPeriods[0].to, undefined, 'still off');
    T.state.isPaused = false;
    assert.deepEqual([T.state.receiving, T.state.receivingOff], [true, null]);
    assert.ok(T.datastore.offPeriods[0].to >= T.datastore.offPeriods[0].from, 'the period is closed');
    T.parseDataText('a:3');
    assert.equal(T.datastore.getTelemetry('a').data[NUMBER].timestamps.length, 2);
    assert.equal(T.datastore.offPeriodsIn(0, Infinity).length, 1);
    assert.equal(T.datastore.offPeriodsIn(0, 1).length, 0, 'not in 1970');
});

test('a file is read while reception is off, and the period not received goes on', () => {
    const T = loadTeleplot();
    T.setReceiving(false);
    const result = T.files.importData('f:1:5\nf:2:6\n');
    assert.equal(result.samples, 2);
    assert.equal(T.datastore.getTelemetry('f').data[NUMBER].timestamps.length, 2);
    assert.deepEqual([T.state.receiving, T.datastore.offPeriods.length, T.datastore.offPeriods[0].to], [false, 1, undefined]);
});

test('memory limit with the policy "stop" (or its older name "pause") stops reception, and says it was the memory', () => {
    for (const policy of ['stop', 'pause']) {
        const T = loadTeleplot();
        const telem = T.datastore.getOrCreateTelemetry('big');
        const times = []; for (let i = 0; i < 5000; i++) times.push(i);
        telem.addData(NUMBER, times, [times.slice()]);
        Object.assign(T.state, { memoryLimit: 1000, memoryPolicy: policy });
        T.datastore.checkMemory(true);
        assert.deepEqual([T.state.receiving, T.state.receivingOff.by, T.datastore.memory.action], [false, 'memory', 'stop'], policy);
    }
});

test('hold: the moment and a frozen window; Space again goes back to live when it was held at the latest data', () => {
    const { T, group, name } = setup();
    assert.equal(T.view.isLive(name), true);
    assert.deepEqual(T.view.timeOf(name), { mode: 'live', at: 100, from: 0, to: 100, speed: 1, span: 0, movedWithWindow: false });
    T.view.togglePlay(name);
    assert.deepEqual([group.mode, group.at, group.cursorTimestamp, group.cursorActive, group.timestampFrom, group.timestampTo], ['held', 100, 100, true, 0, 100]);
    assert.equal(T.view.isLive(name), false);
    T.view.togglePlay(name);
    assert.deepEqual([group.mode, group.cursorTimestamp, group.cursorActive], ['live', -1, false]);
});

test('seek and step land on real samples; a held moment resumes as a replay; moves asked are applied once per update', () => {
    const { T, group, name } = setup();
    T.view.seek(name, 40.4);
    assert.deepEqual([group.mode, group.at], ['held', 40.4]);
    T.view.step(name, 1);
    assert.equal(group.at, 41, 'the next sample');
    T.view.step(name, -1);
    T.view.step(name, -1);
    assert.equal(group.at, 39);
    T.view.move(name, { samples: 3 });
    T.view.move(name, { samples: 2 });
    assert.equal(group.at, 39, 'nothing moves before the update');
    T.view.__updateTime(0);
    assert.equal(group.at, 44, 'five samples later, in one update');
    T.view.move(name, { seconds: -4.5 });
    T.view.__updateTime(10);
    assert.equal(group.at, 39.5);
    T.view.seek(name, 1000);
    assert.equal(group.at, 100, 'never after the newest sample');
    T.view.togglePlay(name);
    assert.equal(group.mode, 'replay', 'held after a seek: Space replays');
});

test('replay: the moment moves by elapsed x speed on each update, and the group is live again when it reaches the newest sample', () => {
    const { T, group, name } = setup();
    T.view.seek(name, 90);
    T.view.setSpeed(name, 2);
    assert.deepEqual([group.mode, group.speed], ['replay', 2]);
    T.view.__updateTime(1000); // The first update starts the clock
    T.view.__updateTime(2000);
    assert.equal(group.at, 92);
    assert.equal(group.cursorTimestamp, 92, 'the views show it');
    T.view.changeSpeed(name, 1); // 2 -> 5
    T.view.__updateTime(3000);
    assert.equal(group.at, 97);
    T.view.__updateTime(4000);
    assert.deepEqual([group.mode, group.cursorTimestamp, group.cursorActive], ['live', -1, false], 'caught up');
    assert.equal(T.view.play(name), true, 'from live: replays from the start of what is on screen');
    assert.equal(group.at, 0);
});

test('a span places the moment at 70 % of the window, within the data; the oldest sample gets some room before it', () => {
    const { T, group, name } = setup();
    T.view.seek(name, 50);
    T.view.setSpan(name, 10);
    assert.deepEqual([group.timestampFrom, group.timestampTo], [43, 53]);
    T.view.seek(name, 99);
    assert.deepEqual([group.timestampFrom, group.timestampTo], [90, 100], 'not after the newest sample');
    T.view.seek(name, 2);
    assert.deepEqual([group.timestampFrom, group.timestampTo], [0, 10], 'not before the oldest one');
    T.view.seek(name, 0);
    assert.ok(group.timestampFrom < 0 && group.timestampTo === 10, 'room before the oldest sample');
    assert.ok(Math.abs((0 - group.timestampFrom) / (group.timestampTo - group.timestampFrom) - T.view.ROOM) < 1e-9);
    T.view.setSpan(name, 0);
    assert.deepEqual([group.mode, group.timestampTo], ['held', 100], 'the whole window, still held');
});

test('live with a span: the window follows the newest sample; zoomTo holds the group on a period', () => {
    const { T, telem, group, name } = setup();
    T.view.setSpan(name, 10);
    assert.deepEqual([group.mode, group.cursorActive, group.timestampFrom, group.timestampTo], ['live', true, 90, 100]);
    telem.addData(NUMBER, [101], [[1]]);
    T.view.__updateTime(0);
    assert.deepEqual([group.timestampFrom, group.timestampTo], [91, 101]);
    T.view.zoomTo(name, 20, 30);
    assert.deepEqual([group.mode, group.at, group.span, group.timestampFrom, group.timestampTo], ['held', 30, 10, 20, 30]);
    T.view.backToLive(name);
    assert.deepEqual([group.mode, group.span, group.cursorActive], ['live', 0, false]);
});

test('a held moment older than the data window moves with the oldest sample', () => {
    const { T, telem, group, name } = setup();
    T.view.seek(name, 5);
    telem.data[NUMBER].timestamps.splice(0, 10); // (what pruning does)
    telem.data[NUMBER].data[0].splice(0, 10);
    T.view.__updateTime(0);
    assert.deepEqual([group.at, group.movedWithWindow, T.view.timeOf(name).movedWithWindow], [10, true, true]);
});

test('every group of a dashboard live again; the pointer leaving a view gives the moment of its group back', () => {
    const T = loadTeleplot();
    const SEP = T.view.TIME_GROUP_SEPARATOR;
    for (const name of ['D', 'D' + SEP + 'Cam', 'Other']) Object.assign(T.view.ensureGroup(name), { mode: 'held', at: 3, cursorActive: true });
    T.view.allLive('D');
    assert.deepEqual(['D', 'D' + SEP + 'Cam', 'Other'].map((n) => T.view.groups[n].mode), ['live', 'live', 'held']);
    const other = T.view.groups.Other;
    other.cursorTimestamp = 8; // (a preview)
    T.view.pointerLeft('Other');
    assert.equal(other.cursorTimestamp, 3);
});

test('charts: a held group draws nothing again for data that keeps coming nor for a moment that moves; its lines break where nothing was received', () => {
    const { T, telem, chart, name } = setup();
    chart.update();
    const calls = () => chart.chart.setDataCalls;
    const before = calls();
    telem.addData(NUMBER, [101], [[1]]);
    telem.data[NUMBER].lastUpdate++;
    chart.update();
    assert.equal(calls(), before + 1, 'live: new data is drawn');
    T.view.hold(name);
    chart.update();
    const held = calls();
    telem.addData(NUMBER, [102], [[1]]);
    telem.data[NUMBER].lastUpdate++;
    chart.update();
    T.view.groups[name].cursorTimestamp = 50; // (a preview)
    chart.update();
    assert.equal(calls(), held, 'held: nothing drawn again');
    // A hole between two samples: a null in it
    assert.deepEqual(T.view.ViewChart.breakAt([[1, 2, 5, 6], [10, 20, 50, 60]], [{ from: 2, to: 5 }]), [[1, 2, 3.5, 5, 6], [10, 20, null, 50, 60]]);
    assert.deepEqual(T.view.ViewChart.breakAt([[1, 5, 6], [10, 50, 60]], [{ from: 2, to: 4 }]), [[1, 3, 5, 6], [10, null, 50, 60]], 'decimated: the samples kept around the hole');
    assert.deepEqual(T.view.ViewChart.breakAt([[1, 2], [10, 20]], [{ from: 2, to: Infinity }]), [[1, 2], [10, 20]], 'still open: nothing after it to break');
});

test('a stop of reception leaves a hole in the time of the data, whatever the clock of the device; not for a file read meanwhile', () => {
    const T = loadTeleplot();
    T.parseDataText('x:5000:1\nx:5001:2\ny:5000:7'); // (times far from the page's clock: a device that dates its data itself)
    const x = T.datastore.getTelemetry('x'), entry = x.data[NUMBER];
    T.setReceiving(false);
    T.files.importData('f:1:5\n');
    assert.deepEqual(T.datastore.gapsIn(['x'], 0, Infinity), [{ from: 5.001, to: Infinity }], 'off: open from the last sample');
    T.setReceiving(true);
    T.parseDataText('x:5009:3\nx:5010:4');
    assert.deepEqual(T.datastore.gapsIn(['x'], 0, Infinity), [{ from: 5.001, to: 5.009 }], 'from the last sample before to the first after');
    assert.deepEqual(T.datastore.gapsIn(['x'], 6, 7), [], 'not in that window');
    assert.deepEqual(T.datastore.gapsIn(['x', 'y'], 0, Infinity), [{ from: 5.001, to: 5.009 }], 'y has not received since: its hole is not known yet');
    T.parseDataText('y:5020:8');
    assert.deepEqual(T.datastore.gapsIn(['x', 'y'], 0, Infinity), [{ from: 5, to: 5.02 }]);
    T.parseDataText('x:5011:5');
    assert.equal(entry.gaps.length, 1, 'one hole per stop');
    T.files.importData('g:1:5\n');
    assert.deepEqual(T.datastore.gapsIn(['f', 'g'], 0, Infinity), [], 'files: no hole');
});

test('the real uPlot.join keeps the null of a break and puts undefined where a series has no sample at a time of another', () => {
    // (the tests run on a stub of uPlot: the real one is loaded here with what it reads of a browser when it loads)
    const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
    const win = { devicePixelRatio: 1, matchMedia: () => ({ addListener() {}, addEventListener() {}, removeEventListener() {} }),
        addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, CustomEvent: function () {} };
    const context = Object.assign({ TELEPLOT: {}, window: win, document: { createElement: () => ({ style: {}, classList: { add() {} } }) }, navigator: { userAgent: '' }, Intl, Date, Math }, win);
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/001-lib-uPlot.js'), 'utf8'), context);
    const joined = Array.from(context.TELEPLOT.uPlot.join([[[1, 2, 3], [10, null, 30]], [[1, 4], [5, 6]]]), (column) => Array.from(column)); // (arrays of this realm)
    assert.deepEqual(joined, [[1, 2, 3, 4], [10, null, 30, undefined], [5, undefined, undefined, 6]]);
});

test('commands: a view of a group that is not live sends nothing and says why', () => {
    const T = loadTeleplot();
    T.commands.setEnabled(true);
    T.parseDataText('ATTR|kp|write\nkp:0.4');
    const telem = T.datastore.getTelemetry('kp');
    T.commands.whyNot = () => ''; // (as if its device could be written to)
    Object.assign(T.view.ensureGroup('G'), { mode: 'held', at: 1 });
    assert.equal(T.commands.whyNotIn(telem, 'G'), T.commands.NOT_LIVE);
    const state = T.view.ViewCurrentValue.commandState(telem, undefined, 'G');
    assert.deepEqual([state.editable, state.notLive], [false, true]);
    T.view.backToLive('G');
    assert.equal(T.commands.whyNotIn(telem, 'G'), '');
});
