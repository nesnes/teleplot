// Moments (doc/moments.md): the mom flag, the model, the line, replay and export; 119, 120, 100, 160
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');

function send(T, lines) { for (const line of lines) T.parseDataText(line); }
const list = (T, name = 'cycle') => T.moments.of(T.datastore.getTelemetry(name)).moments;

test('the mom flag makes a stack of moments: starts, results, levels, numbers', () => {
    const T = loadTeleplot();
    send(T, ['cycle:1000:run 7/pick#41|mom', 'cycle:2000:run 7/pick#41/grip|mom', 'cycle:3000:run 7/pick#41=ok|mom', 'cycle:4000:run 7/pick#42|mom', 'cycle:5000:run 7/pick#42=failed|mom', 'cycle:6000:run 7/pick#43|mom']);
    const telem = T.datastore.getTelemetry('cycle');
    assert.equal(telem.getAttribute(T.protocol.TELEM_ATTR_STACK), true);
    assert.equal(T.moments.isMoment(telem), true);
    const pick = list(T).filter((m) => m.kind === 'pick');
    assert.deepEqual(pick.map((m) => [m.number, m.from, m.to, m.result, m.failed]), [['41', 1, 3, 'ok', false], ['42', 4, 5, 'failed', true], ['43', 6, undefined, '', false]]);
    assert.equal(pick[0].parent.name, 'run 7');
    assert.deepEqual(pick[0].children.map((m) => m.name), ['grip']);
    assert.equal(T.moments.restLevel(telem), 1);
    assert.equal(T.moments.restLevel(telem, 1, 2.9), 2, 'zoomed on pick 41: what is inside it');
    assert.equal(T.moments.mark(pick[0]), '✓');
    assert.equal(T.moments.mark(pick[1]), '✕');
    assert.equal(T.moments.mark(pick[2]), '…');
    assert.equal(T.moments.describe(pick[1]), 'pick #42 ✕ 1 s');
    assert.equal(T.moments.pathText(pick[1]), 'run 7 \u203a pick #42 \u2715 1 s');
    const V = T.view.ViewTimeline;
    assert.deepEqual([0, 0.00000042, 0.0004, 0.00235, 0.0423, 0.5, 12.34].map(V.formatDuration), ['0 ms', '1 µs', '400 µs', '2.35 ms', '42.3 ms', '500 ms', '12.3 s'], 'a short period is never written as nothing');
});

test('a new text ends a moment with no result, an empty text ends everything', () => {
    const T = loadTeleplot();
    send(T, ['cycle:1000:a#1|mom', 'cycle:2000:a#2|mom', 'cycle:3000:|mom']);
    assert.deepEqual(list(T).map((m) => [m.name, m.to, m.result]), [['a#1', 2, ''], ['a#2', 3, '']]);
    assert.equal(T.moments.mark(list(T)[0]), '–');
});

test('a moment completed by later samples is the same object, and the cache follows appends', () => {
    const T = loadTeleplot();
    send(T, ['cycle:1000:a#1|mom']);
    const first = list(T)[0];
    assert.equal(first.to, undefined);
    send(T, ['cycle:2000:a#1=ok|mom']);
    assert.equal(list(T)[0], first);
    assert.equal(first.to, 2);
});

test('parallel moments of a level take rows of their own only while they overlap', () => {
    const T = loadTeleplot();
    send(T, ['v:1000:detect#1|mom', 'v:2000:detect#1,ocr#1|mom', 'v:3000:ocr#1|mom', 'v:4000:|mom', 'v:5000:detect#2|mom', 'v:6000:|mom']);
    const rows = T.moments.of(T.datastore.getTelemetry('v')).rows;
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].map((row) => row.map((m) => m.name)), [['detect#1', 'detect#2'], ['ocr#1']]);
});

test('a moment that a stop of reception cut is marked unknown and ends where the hole starts', () => {
    const T = loadTeleplot();
    send(T, ['cycle:1000:a#1|mom', 'cycle:2000:a#1/b|mom']);
    T.setReceiving(false);
    T.setReceiving(true);
    send(T, ['cycle:9000:a#2|mom']);
    const a = list(T).find((m) => m.name === 'a#1');
    assert.equal(a.unknown, true);
    assert.equal(a.to, 2);
    assert.equal(T.moments.mark(a), '?');
});

test('at gives the deepest moment running at a time; the boundaries survive the memory policy', () => {
    const T = loadTeleplot();
    send(T, ['cycle:1000:a#1|mom', 'cycle:2000:a#1/b|mom', 'cycle:3000:a#1=ok|mom', 'cycle:5000:a#2|mom']);
    const telem = T.datastore.getTelemetry('cycle');
    assert.equal(T.moments.at(2.5, telem).name, 'b');
    assert.equal(T.moments.at(1.5, telem).name, 'a#1');
    assert.equal(T.moments.at(4, telem), undefined);
    assert.equal(telem.thinOldest(0.5), 0);
    assert.equal(telem.forgetOldest(0.5), 0);
});

test('a chart shows the moments of its labels when it has any, otherwise all of them; hidden ones are off', () => {
    const T = loadTeleplot();
    send(T, ['arm,arm:1000:a#1|mom', 'cart,cart:1000:b#1|mom', 'speed,arm:1:1000']);
    const names = (view) => T.moments.forView(view).map((t) => t.getName());
    assert.deepEqual(names(new T.view.ViewChart('', ['speed'])), ['arm']);
    assert.deepEqual(names(new T.view.ViewChart('', [])), ['arm', 'cart']);
    T.moments.hidden.add('arm');
    assert.deepEqual(names(new T.view.ViewChart('', [])), ['cart']);
});

test('the line: a map of time, tracks per telemetry, failures of the others at rest', () => {
    const T = loadTeleplot();
    send(T, ['arm:1000:p#1|mom', 'arm:2000:p#1=ok|mom', 'arm:3000:p#2|mom', 'cart:1000:c#1|mom', 'cart:2000:c#1=failed|mom']);
    const map = T.timeLine.window(1, 3, 200, 10);
    assert.equal(T.timeLine.px(map, 2), 110);
    assert.equal(T.timeLine.time(map, 110), 2);
    const telems = T.moments.telemetries();
    const layout = T.timeLine.layout(telems);
    assert.deepEqual(layout.blocks.map((b) => [b.telem.getName(), b.rows.length]), [['arm', 1], ['cart', 1]]);
    assert.equal(layout.blocks[1].rows[0].top - layout.blocks[0].rows[0].top, T.timeLine.ROW + T.timeLine.ROW_GAP + T.timeLine.BLOCK_GAP);
    const rest = T.timeLine.rest(telems);
    assert.deepEqual(rest.moments.map((m) => m.name), ['p#1', 'p#2']);
    assert.deepEqual(rest.failures.map((m) => m.name), ['c#1']);
    assert.deepEqual(T.timeLine.rest(telems, T.timeLine.window(3.5, 3.6, 100)).failures, [], 'failures out of the period are not drawn');
    T.moments.primary = 'cart';
    assert.equal(T.moments.primaryOf(telems).getName(), 'cart');
    assert.equal(T.timeLine.hit(map, rest.moments, 15).name, 'p#1');
});

test('showing a moment: held at its start, the window on it, a replay stops at its end or loops', () => {
    const T = loadTeleplot();
    T.view.ANIMATION_MS = 0;
    send(T, ['cycle:1000:a#1|mom', 'cycle:3000:a#1=ok|mom', 'cycle:4000:a#2|mom', 'cycle:6000:a#2=failed|mom', 'x:9000:1']);
    const [first, second] = list(T);
    assert.ok(T.view.showMoment('g', first));
    const g = T.view.groups.g;
    assert.equal(g.mode, 'held');
    assert.equal(g.at, 1);
    assert.ok(g.timestampFrom < 1 && g.timestampFrom > 0.9 && g.timestampTo > 3 && g.timestampTo < 3.1);
    const window = [g.timestampFrom, g.timestampTo];
    T.view.play('g');
    T.view.__updateTime(0);
    T.view.__updateTime(1000);
    assert.equal(g.at, 2);
    assert.deepEqual([g.timestampFrom, g.timestampTo], window, 'the window stays');
    T.view.__updateTime(3000);
    assert.equal(g.mode, 'held');
    assert.equal(g.at, 3);
    T.view.setLoop('g', true);
    T.view.play('g');
    assert.equal(g.at, 1, 'again from its start');
    T.view.__updateTime(4000);
    T.view.__updateTime(7000);
    assert.equal(g.mode, 'replay');
    assert.equal(g.at, 1);
    T.view.setLoop('g', false);
    assert.ok(T.view.stepMoment('g', 1));
    assert.equal(g.moment, second);
    assert.equal(T.view.stepMoment('g', 1), false);
    T.view.seek('g', 3.5);
    assert.equal(g.moment, undefined, 'out of the moment');
    assert.ok(T.view.stepMoment('g', -1));
    assert.equal(g.moment, first);
    T.view.backToLive('g');
    assert.equal(g.moment, undefined);
});

test('after a moment was shown, the window moves through the data; live gives charts their gestures back', () => {
    const T = loadTeleplot();
    T.view.ANIMATION_MS = 0;
    send(T, ['cycle:1000:a#1|mom', 'cycle:3000:a#1=ok|mom', 'cycle:4000:a#2|mom', 'cycle:6000:a#2=ok|mom', 'cycle:9000:a#3|mom', 'cycle:20000:a#3=ok|mom']);
    const g = T.view.ensureGroup('g');
    assert.ok(!g.browsing);
    T.view.showMoment('g', list(T)[1]);
    assert.equal(g.browsing, true);
    const before = [g.timestampFrom, g.timestampTo];
    T.view.pointAt('g', 5);
    assert.equal(g.at, 5);
    assert.deepEqual([g.timestampFrom, g.timestampTo], before, 'a click does not move the window');
    assert.equal(g.moment, list(T)[1]);
    T.view.pointAt('g', 3.97);
    assert.equal(g.at, 4, 'the room around the moment is not the moment');
    assert.equal(g.moment, list(T)[1]);
    T.view.pointAt('g', 5);
    const span = g.timestampTo - g.timestampFrom;
    T.view.panBy('g', 1);
    assert.ok(Math.abs(g.timestampFrom - (4 - 0.04 + 1)) < 1e-9);
    assert.ok(Math.abs(g.timestampTo - g.timestampFrom - span) < 1e-9);
    T.view.panBy('g', -100);
    assert.equal(g.timestampFrom, 1, 'never before the data');
    T.view.panBy('g', 100);
    assert.equal(g.timestampTo, 20, 'never after it');
    assert.equal(g.moment, undefined, 'out of the moment');
    assert.equal(g.browsing, true, 'still moving through time');
    T.view.zoomAround('g', 2, 20);
    assert.ok(Math.abs(g.timestampTo - 20) < 1e-9);
    assert.ok(Math.abs(g.timestampTo - g.timestampFrom - span / 2) < 1e-9);
    T.view.backToLive('g');
    assert.ok(!g.browsing);
});

test('the window reaches a moment in a blink, and a section is shown the same way', () => {
    const T = loadTeleplot();
    send(T, ['cycle:1000:a#1|mom', 'cycle:3000:a#1=ok|mom', 'cycle:9000:a#2|mom', 'cycle:10000:a#2=ok|mom']);
    const g = T.view.ensureGroup('g');
    T.view.showMoment('g', list(T)[0]);
    assert.deepEqual([g.timestampFrom, g.timestampTo], [1, 10], 'it starts from what was shown');
    T.view.__updateTime(0);
    T.view.__updateTime(110);
    assert.ok(g.timestampTo < 10 && g.timestampTo > 3.04);
    T.view.__updateTime(220);
    assert.ok(Math.abs(g.timestampFrom - 0.96) < 1e-9 && Math.abs(g.timestampTo - 3.04) < 1e-9);
    assert.equal(g.animation, undefined);
    T.view.showPeriod('g', 9, 10);
    assert.equal(g.moment, undefined);
    assert.equal(g.at, 9);
    T.view.panBy('g', 0);
    assert.equal(g.animation, undefined, 'a gesture takes over');
});

test('the time of a group includes moments that no view shows', () => {
    const T = loadTeleplot();
    send(T, ['cycle:1000:a#1|mom', 'cycle:5000:a#1=ok|mom']);
    T.view.ensureGroup('g');
    assert.deepEqual(T.view.groupExtent('g'), { from: 1, to: 5 });
});

test('moments go through files, in both formats', () => {
    for (const format of ['exportText', 'exportBinary']) {
        const T = loadTeleplot();
        send(T, ['cycle:1000:a#1|mom', 'cycle:2000:a#1=ok|mom']);
        const result = T.files[format]({ dashboards: false });
        const data = format === 'exportText' ? result.parts.join('') : Buffer.concat(result.parts.map((p) => Buffer.from(p)));
        if (format === 'exportText') assert.ok(data.includes('|mom'));
        const U = loadTeleplot();
        U.files.importData(format === 'exportText' ? data : new Uint8Array(data).buffer);
        assert.deepEqual(list(U).map((m) => [m.name, m.from, m.to, m.result]), [['a#1', 1, 2, 'ok']]);
    }
});

test('an export of several periods: overlaps once, what is between them left out, in every format', () => {
    const T = loadTeleplot();
    send(T, ['v:1000:1', 'v:2000:2', 'v:3000:3', 'v:4000:4', 'v:5000:5']);
    assert.deepEqual(T.files.mergeRanges([{ from: 4, to: 5 }, { from: 1, to: 2 }, { from: 1.5, to: 2.5 }]), [{ from: 1, to: 2.5 }, { from: 4, to: 5 }]);
    const options = { ranges: [{ from: 1, to: 2 }, { from: 4, to: 5 }], dashboards: false };
    assert.equal(T.files.exportText(options).samples, 4);
    assert.equal(T.files.exportBinary(options).samples, 4);
    assert.equal(T.files.exportCSV(options).samples, 4);
    assert.equal(T.files.estimate('text', options).samples, 4);
    const binary = T.files.exportBinary(options);
    const U = loadTeleplot();
    U.files.importData(new Uint8Array(Buffer.concat(binary.parts.map((p) => Buffer.from(p)))).buffer);
    assert.deepEqual(Array.from(U.datastore.getTelemetry('v').data[T.protocol.SECTION_TYPE_TELEM_DATA_NUMBER].timestamps), [1, 2, 4, 5]);
});

test('a vertical scale moved by hand holds until back to live, which counts as zoomed', () => {
    const T = loadTeleplot();
    T.parseDataText('v:1000:1');
    const chart = new T.view.ViewChart('', ['v'], 'g');
    T.view.views.push(chart);
    T.view.ensureGroup('g');
    assert.equal(T.view.isZoomed('g'), false);
    chart.yZoom = { min: 2, max: 3 };
    assert.deepEqual(chart.getScaleRange(0, 10), [2, 3]);
    assert.equal(T.view.isZoomed('g'), true);
    assert.equal(T.view.backToLive('g'), true);
    assert.equal(chart.yZoom, undefined);
    assert.notDeepEqual(chart.getScaleRange(0, 10), [2, 3]);
    assert.equal(T.view.isZoomed('g'), false);
});

test('the attribute reaches the page in binary', () => {
    const P = loadTeleplot().protocol;
    assert.equal(P.TELEM_ATTR_MOMENT, 17);
});

test('a log marks its lines while its group is not live, and a view of another group says its moment', () => {
    const T = loadTeleplot();
    send(T, ['cycle:1000:a#1|mom', 'cycle:2000:a#1=failed|mom', 'cycle:3000:a#2|mom', 'cycle:4000:a#2=ok|mom', 'events:1500:one|log', 'events:3500:two|log']);
    const log = new T.view.ViewLog('', ['events'], 'g');
    log.update();
    T.view.ensureGroup('g');
    assert.equal(log.momentSource(), undefined, 'live: no mark');
    T.view.hold('g', 1.5);
    const source = log.momentSource();
    assert.equal(source.getName(), 'cycle');
    log.state.rows = [{ t: 1.5 }, { t: 3.5 }];
    log.markRows(source);
    assert.deepEqual(log.state.rows.map((r) => [r.moment.name, r.momentFirst, r.moment.failed]), [['a#1', true, true], ['a#2', true, false]]);
});
