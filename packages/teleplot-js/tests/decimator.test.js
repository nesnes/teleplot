const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');

const { MinMaxDecimator } = loadTeleplot();

// Seeded random numbers: failures are reproducible
function rng(seed) {
    return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const makeSource = () => ({ timestamps: [], data: [[]], lateInsertions: 0 });
function push(src, t, v) { src.timestamps.push(t); src.data[0].push(v); }
function insertSorted(src, t, v) { // late insertion, like the datastore does
    let i = src.timestamps.findIndex(x => x > t);
    if (i < 0) i = src.timestamps.length;
    src.timestamps.splice(i, 0, t);
    src.data[0].splice(i, 0, v);
    src.lateInsertions++;
}
const maxBuckets = 100;

// Independent, naive implementation: group by bucket, keep first/min/max/last
function reference(src, from, to) {
    const width = MinMaxDecimator.bucketWidthFor(from, to, maxBuckets);
    const first = Math.floor(from / width) * width, end = (Math.floor(to / width) + 1) * width;
    const buckets = new Map();
    src.timestamps.forEach((t, i) => {
        if (t < first || t >= end || !Number.isFinite(src.data[0][i])) return;
        const b = Math.floor(t / width);
        if (!buckets.has(b)) buckets.set(b, []);
        buckets.get(b).push(i);
    });
    const out = [];
    for (const idx of [...buckets.keys()].sort((a, b) => a - b)) {
        const ids = buckets.get(idx);
        let min = ids[0], max = ids[0];
        for (const i of ids) { if (src.data[0][i] < src.data[0][min]) min = i; if (src.data[0][i] > src.data[0][max]) max = i; }
        for (const i of [...new Set([ids[0], min, max, ids.at(-1)])].sort((a, b) => a - b)) out.push([src.timestamps[i], src.data[0][i]]);
    }
    return out;
}
const asPairs = v => v.timestamps.map((t, i) => [t, v.values[i]]);

test('bucket width is a power of two giving at most maxBuckets', () => {
    for (const [from, to] of [[0, 1], [0, 10], [5, 5.001], [0, 86400], [1e9, 1e9 + 3]]) {
        const w = MinMaxDecimator.bucketWidthFor(from, to, maxBuckets);
        assert.ok(Number.isInteger(Math.log2(w)));
        assert.ok((to - from) / w <= maxBuckets);
        assert.ok((to - from) / w > maxBuckets / 2 || to - from < 1e-6 * maxBuckets);
    }
});

test('output matches the naive reference on a static signal', () => {
    const r = rng(1), src = makeSource();
    for (let i = 0; i < 5000; i++) push(src, i * 0.01, r() * 10 - 5);
    for (const [from, to] of [[0, 50], [10, 20], [0, 1], [-5, 100]]) {
        const view = new MinMaxDecimator().getView(src, from, to, maxBuckets);
        assert.deepEqual(asPairs(view), reference(src, from, to), `range ${from}..${to}`);
    }
});

test('size is bounded (4 points per bucket) whatever the amount of data', () => {
    const src = makeSource();
    for (let i = 0; i < 200000; i++) push(src, i * 0.001, Math.sin(i / 7));
    const view = new MinMaxDecimator().getView(src, 0, 200, maxBuckets);
    assert.ok(view.timestamps.length <= 4 * (maxBuckets + 2), `got ${view.timestamps.length}`);
});

test('extremes are preserved', () => {
    const src = makeSource();
    for (let i = 0; i < 10000; i++) push(src, i * 0.001, i === 4321 ? 1000 : i === 7777 ? -1000 : 0);
    const view = new MinMaxDecimator().getView(src, 0, 10, maxBuckets);
    assert.equal(Math.max(...view.values), 1000);
    assert.equal(Math.min(...view.values), -1000);
});

test('NaN and Infinity are ignored', () => {
    const src = makeSource();
    [1, NaN, 3, Infinity, -Infinity, 2].forEach((v, i) => push(src, i, v));
    const view = new MinMaxDecimator().getView(src, 0, 5, maxBuckets);
    assert.ok(view.values.every(Number.isFinite));
    assert.deepEqual(view.values, [1, 3, 2]);
});

test('empty and out-of-range sources give empty views', () => {
    const d = new MinMaxDecimator();
    assert.deepEqual(d.getView(makeSource(), 0, 10, maxBuckets), { timestamps: [], values: [] });
    const src = makeSource();
    push(src, 1000, 1);
    assert.deepEqual(d.getView(src, 0, 10, maxBuckets), { timestamps: [], values: [] });
});

test('incremental updates always equal a from-scratch computation (scrolling, late data, pruning)', () => {
    const r = rng(42), src = makeSource(), inc = new MinMaxDecimator();
    let t = 0;
    for (let frame = 0; frame < 300; frame++) {
        for (let k = 0; k < 20; k++) { t += 0.002 + r() * 0.002; push(src, t, r() * 2 - 1); }
        if (frame % 7 === 0 && src.timestamps.length > 10) insertSorted(src, t - r() * 0.5, r() * 4 - 2); // late sample
        if (frame % 50 === 49) { // pruning (data removed at the start)
            const cut = src.timestamps.findIndex(x => x > t - 3);
            src.timestamps.splice(0, cut); src.data[0].splice(0, cut);
        }
        const span = frame < 150 ? 5 : frame < 220 ? 20 : 2; // visible range changes: bucket width changes too
        const from = Math.max(src.timestamps[0], t - span), to = t; // like a chart: never wider than the data
        const got = asPairs(inc.getView(src, from, to, maxBuckets));
        const expected = asPairs(new MinMaxDecimator().getView(src, from, to, maxBuckets));
        assert.deepEqual(got.slice(4), expected.slice(4), `frame ${frame}`); // first bucket may keep a few pruned samples (< 1 px stale)
        assert.deepEqual(got.slice(4), reference(src, from, to).slice(4), `frame ${frame} vs reference`);
    }
});

test('a replaced source or a view starting earlier rebuilds the cache', () => {
    const a = makeSource(), b = makeSource();
    for (let i = 0; i < 1000; i++) { push(a, i, i); push(b, i, -i); }
    const d = new MinMaxDecimator();
    d.getView(a, 500, 900, maxBuckets);
    assert.deepEqual(asPairs(d.getView(b, 500, 900, maxBuckets)), reference(b, 500, 900));
    assert.deepEqual(asPairs(d.getView(b, 0, 900, maxBuckets)), reference(b, 0, 900)); // zoom out
});
