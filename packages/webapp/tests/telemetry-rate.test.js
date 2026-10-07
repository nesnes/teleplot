// components/telemetry-rate.js: update rate estimated from the latest samples
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');

const code = fs.readFileSync(path.join(__dirname, '..', 'components', 'telemetry-rate.js'), 'utf8');
const estimateRate = new Function(code + '\nreturn estimateRate;')();

// n samples every `period` seconds, the last one received `silenceMs` ago
function entry(n, period, silenceMs = 0) {
    return { timestamps: Array.from({ length: n }, (_, i) => i * period), lastUpdate: Date.now() - silenceMs };
}

test('rate is unknown without enough samples', () => {
    assert.equal(estimateRate(undefined), 0);
    assert.equal(estimateRate(entry(0, 0.02)), 0);
    assert.equal(estimateRate(entry(1, 0.02)), 0);
    assert.equal(estimateRate({ timestamps: [5, 5, 5], lastUpdate: Date.now() }), 0); // no time elapsed
});

test('rate follows the spacing of the samples', () => {
    assert.ok(Math.abs(estimateRate(entry(100, 0.02)) - 50) < 1e-6);
    assert.ok(Math.abs(estimateRate(entry(3, 2)) - 0.5) < 1e-6);
});

test('only the latest 32 samples count', () => {
    const e = { timestamps: [...Array.from({ length: 50 }, (_, i) => i), ...Array.from({ length: 32 }, (_, i) => 50 + i * 0.01)], lastUpdate: Date.now() };
    assert.ok(Math.abs(estimateRate(e) - 100) < 1e-6);
});

test('data that stopped coming is idle', () => {
    assert.equal(estimateRate(entry(100, 0.02, 5000)), -1);
    assert.ok(estimateRate(entry(100, 0.02, 500)) > 0);
    assert.equal(estimateRate(entry(5, 10, 31000)), -1); // slow streams get a longer grace
});
