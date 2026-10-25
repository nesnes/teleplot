// One API, three clients: the scenario of clients/arduino/Teleplot/tests/shared.inc, written in Python (parity.py), gives the page the
// same telemetries as the C++ client (binary) and as the Arduino library (text). Files written by ./test.sh.
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../../packages/teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../../packages/teleplot-js/tests/helpers/load');

const OUT = process.env.TELEPLOT_PYTHON_OUT || path.join(__dirname, '..', 'build');

function load(file) {
    const U = loadTeleplot();
    const data = file.endsWith('.txt') ? fs.readFileSync(path.join(OUT, file), 'utf8') : new Uint8Array(fs.readFileSync(path.join(OUT, file)));
    const result = U.files.importData(data);
    U.__timers.run();
    assert.equal(result.problems, 0, `${file}: every line or packet is understood`);
    return U;
}

// What the page holds, by telemetry name: the attributes that say what it is, and every sample (as parity.test.js of the Arduino library)
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
            if (value === false || value === undefined) continue;
            if (key === 'label' && telem.getAttribute(P.TELEM_ATTR_STACK) === true && value === name) continue; // (a stack is labelled with its name, for the lanes of its threads)
            if (key === 'write') { value = Object.assign({}, value); for (const flag of ['confirm', 'longpress']) if (value[flag] === false) delete value[flag]; }
            entry.attributes[key] = value;
        }
        for (const [type, d] of Object.entries(telem.data)) {
            entry.data[type] = d.timestamps.map((t, i) => [Math.round(t * 1e6) / 1e6, ...d.data.map((channel) => { const v = channel[i]; return ArrayBuffer.isView(v) ? Array.from(v) : v; })]);
        }
        out[name] = entry;
    }
    return out;
}
function same(a, b) {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
    for (const name of Object.keys(b)) assert.deepEqual(a[name], b[name], name);
}

test('Python, binary: the same telemetries as the C++ client', () => same(snapshot(load('python.teleplot')), snapshot(load('full.teleplot'))));
test('Python, text: the same telemetries as the Arduino library', () => same(snapshot(load('python.teleplot.txt')), snapshot(load('micro.teleplot.txt'))));
