// One API, two headers: the same calls (shared.inc) through the C++ client (binary) and through this library (text lines, also as a
// serial port writes them) give the page the same telemetries. Files written by ./test.sh.
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../../../packages/teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../../../packages/teleplot-js/tests/helpers/load');

const OUT = process.env.TELEPLOT_MICRO_OUT || path.join(__dirname, '..', 'build');

function load(file, options = {}) {
    const U = loadTeleplot();
    const data = file.endsWith('.txt') ? fs.readFileSync(path.join(OUT, file), 'utf8') : new Uint8Array(fs.readFileSync(path.join(OUT, file)));
    const result = U.files.importData(data, options);
    U.__timers.run();
    assert.equal(result.problems, 0, `${file}: every line or packet is understood`);
    return U;
}

// What the page holds, by telemetry name: the attributes that say what it is, and every sample
function snapshot(U) {
    const P = U.protocol;
    const ATTRS = { unit: P.TELEM_ATTR_UNIT, color: P.TELEM_ATTR_COLOR, label: P.TELEM_ATTR_VIEW_LABEL, desc: P.TELEM_ATTR_DESC, range: P.TELEM_ATTR_RANGE,
        log: P.TELEM_ATTR_LOG, stack: P.TELEM_ATTR_STACK, frame: P.TELEM_ATTR_FRAME, shape: P.TELEM_ATTR_SHAPE, write: P.TELEM_ATTR_WRITE, args: P.TELEM_ATTR_ARGS, title: P.TELEM_ATTR_TITLE };
    const out = {};
    for (const telem of Object.values(U.datastore.telemetries)) {
        const name = telem.getAttribute(P.TELEM_ATTR_NAME);
        const entry = { attributes: {}, data: {} };
        for (const [key, code] of Object.entries(ATTRS)) {
            let value = telem.getAttribute(code);
            if (value === false || value === undefined) continue; // (not set, or set to its default)
            if (key === 'label' && telem.getAttribute(P.TELEM_ATTR_STACK) === true && value === name) continue; // (the C++ client labels a stack with its name, for the lanes of its threads)
            if (key === 'write') { value = Object.assign({}, value); for (const flag of ['confirm', 'longpress']) if (value[flag] === false) delete value[flag]; } // (the binary parser writes them false, the text one leaves them out)
            entry.attributes[key] = value;
        }
        for (const [type, d] of Object.entries(telem.data)) {
            entry.data[type] = d.timestamps.map((t, i) => [Math.round(t * 1e6) / 1e6, ...d.data.map((channel) => {
                const v = channel[i];
                return ArrayBuffer.isView(v) ? Array.from(v) : v;
            })]);
        }
        out[name] = entry;
    }
    return out;
}

test('the same calls give the same telemetries: C++ client (binary) and microcontroller library (text)', () => {
    const full = snapshot(load('full.teleplot'));
    const micro = snapshot(load('micro.teleplot.txt'));
    assert.deepEqual(Object.keys(micro).sort(), Object.keys(full).sort());
    for (const name of Object.keys(full)) assert.deepEqual(micro[name], full[name], name);
});

test('as a serial port writes them (lines after ">"), the lines give the same', () => {
    const micro = snapshot(load('micro.teleplot.txt'));
    const serial = snapshot(load('serial.teleplot.txt', { serial: true }));
    assert.deepEqual(serial, micro);
});
