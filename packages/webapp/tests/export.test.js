// components/panel-export.js: what the Export panel says (sizes, periods, file names) and what it asks the library
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../teleplot-js/tests/helpers/load');

const code = fs.readFileSync(path.join(__dirname, '..', 'components', 'panel-export.js'), 'utf8');
const E = new Function('Vue', code + '\nreturn { exportFormatBytes, exportFormatCount, exportFormatDuration, exportFormatPeriod, exportFileName, exportOnScreen, exportZoom, EXPORT_FORMATS, EXPORT_SEPARATORS, EXPORT_TIMES };')({ reactive: (x) => x });

test('sizes, counts and durations are written for people', () => {
    assert.deepEqual([12, 4700, 45000, 1.24e6, 12e6, 2.5e9].map(E.exportFormatBytes), ['12 B', '4.7 kB', '45 kB', '1.2 MB', '12 MB', '2.5 GB']);
    assert.deepEqual([0, 305, 2945, 18000, 1.24e6, 21e6].map(E.exportFormatCount), ['0', '305', '2 945', '18 k', '1.24 M', '21.0 M']);
    assert.deepEqual([0, 0.4, 12, 90, 300, 4080, 3600, 90000].map(E.exportFormatDuration), ['0 s', '0.4 s', '12 s', '1 min 30 s', '5 min', '1 h 8 min', '1 h', '1 d 1 h']);
});

test('a period is said as someone would say it now', () => {
    const at = (y, mo, d, h, mi, s = 0) => new Date(y, mo, d, h, mi, s).getTime() / 1000;
    const now = new Date(2026, 9, 11, 15, 0).getTime();
    assert.equal(E.exportFormatPeriod(at(2026, 9, 11, 14, 2, 10), at(2026, 9, 11, 14, 7, 10), now), '14:02:10 → 14:07:10');
    assert.equal(E.exportFormatPeriod(at(2026, 9, 10, 16, 41), at(2026, 9, 10, 17, 49, 5), now), 'Yesterday 16:41:00 → 17:49:05');
    assert.equal(E.exportFormatPeriod(at(2026, 9, 10, 23, 50), at(2026, 9, 11, 0, 10), now), 'Yesterday 23:50:00 → 00:10:00');
    assert.equal(E.exportFormatPeriod(at(2026, 2, 12, 9, 14, 2), at(2026, 2, 12, 9, 27, 44), now), '12 Mar 2026 09:14:02 → 09:27:44');
    assert.equal(E.exportFormatPeriod(at(2026, 2, 12, 9, 14, 2), at(2026, 2, 13, 9, 0), now), '12 Mar 2026 09:14:02 → 13 Mar 2026 09:00:00');
    assert.equal(E.exportFormatPeriod(0, 750, now), '0:00:00 → 0:12:30 after the device started', 'a device that counts from its start');
    assert.match(E.exportFormatPeriod(1, at(2026, 9, 11, 14, 0), now), /^0:00:01 after the device started, and lines dated now \(14:00:00\)$/);
    assert.equal(E.exportFormatPeriod(undefined, undefined, now), '');
});

test('file names carry the time and the extension of the format', () => {
    const date = new Date(2026, 9, 11, 14, 7);
    assert.deepEqual(['binary', 'text', 'csv'].map((f) => E.exportFileName(f, date)), ['session-1407.teleplot', 'session-1407.teleplot.txt', 'session-1407.teleplot.csv']);
    assert.deepEqual(E.EXPORT_FORMATS.map((f) => f.id), ['binary', 'text', 'csv'], 'binary first: the default');
});

test('the separators and time formats offered are the ones the library knows', () => {
    const T = loadTeleplot();
    T.parseDataText('a:1000:1.5\nb:1000:2.5');
    for (const [separator] of E.EXPORT_SEPARATORS) {
        const text = T.files.exportCSV({ separator, time: 'ms' }).parts.join('');
        assert.equal(text, ['time', 'a', 'b'].join(separator) + '\r\n' + ['1000', '1.5', '2.5'].join(separator) + '\r\n');
        assert.equal(loadTeleplot().files.importData(text).csv.separator, separator, 'and it is found again when the file is opened');
    }
    for (const [time] of E.EXPORT_TIMES) assert.equal(loadTeleplot().files.importData(T.files.exportCSV({ time }).parts.join('')).samples, 2);
});

test('"On screen" is what the dashboard shows, "Zoomed" the period one of its time groups is zoomed on', () => {
    const T = loadTeleplot();
    T.parseDataText('a:1000:1\nb:1000:2\nc:1000:3');
    const dashboard = T.dashboards.createDashboard('D');
    const row = new T.view.ViewLayout('', 'D');
    row.addView(T.view.createView('chart', ['a', 'missing'], 'D'));
    dashboard.getView().addView(row);
    dashboard.getView().addView(T.view.createView('values', ['b', 'a'], 'D'));
    assert.deepEqual(E.exportOnScreen(T, dashboard).sort(), [T.datastore.getTelemetry('a').id, T.datastore.getTelemetry('b').id].sort());
    assert.deepEqual(E.exportOnScreen(T, null), []);
    assert.equal(E.exportZoom(T, dashboard), undefined);
    Object.assign(T.view.ensureGroup('Other'), { cursorActive: true, timestampFrom: 1, timestampTo: 2 });
    assert.equal(E.exportZoom(T, dashboard), undefined, 'the zoom of another dashboard');
    Object.assign(T.view.ensureGroup('D' + T.view.TIME_GROUP_SEPARATOR + 'Mine'), { cursorActive: true, timestampFrom: 5, timestampTo: 9 });
    assert.deepEqual(E.exportZoom(T, dashboard), { from: 5, to: 9 });
    assert.equal(E.exportZoom(T, null), undefined);
});
