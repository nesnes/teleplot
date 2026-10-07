// Minimal stand-ins for what the library expects from its environment (browser, Vue, uPlot, timers),
// so that views and connections can be exercised in Node. They record what the library does with them.

function makeElement() {
    return {
        textContent: '', children: [], classList: { add() {} },
        setAttribute() {}, hasAttribute() { return false; },
        append(c) { this.children.push(c); }, appendChild(c) { this.children.push(c); },
    };
}

class FakeWebSocket {
    constructor(url) { this.url = url; this.sent = []; this.closed = false; FakeWebSocket.instances.push(this); }
    send(data) { this.sent.push(data); }
    close() { this.closed = true; }
}
FakeWebSocket.instances = [];

// Globals used directly by the sources (installed once, they hold no state that matters)
function installGlobals() {
    if (globalThis.document && globalThis.document.__teleplotStub) return;
    if (!globalThis.crypto) globalThis.crypto = require('node:crypto'); // Node < 19 has no global crypto (randomUUID is used by the views)
    globalThis.document = { __teleplotStub: true, head: makeElement(), createElement: makeElement, getElementById: () => null };
    globalThis.WebSocket = FakeWebSocket;
}

// Vue is only used for reactivity: plain objects behave the same for the logic we test
const makeVue = () => ({
    reactive: x => x,
    nextTick: fn => Promise.resolve().then(fn),
    markRaw: x => Object.defineProperty(x, '__v_skip', { value: true, configurable: true }), // same flag as real Vue
    createApp: () => ({ component() {}, mount() {} }),
});

// Same API as the real uPlot for what the views use. join() merges [xs, ys] tables on a common sorted x axis (null = no sample)
class FakeUPlot {
    constructor(options, data) { this.options = options; this.data = data; this.setDataCalls = 0; this.scales = {}; }
    batch(fn) { fn(); }
    setData(data) { this.data = data; this.setDataCalls++; }
    setScale(key, range) { this.scales[key] = range; }
    setSize() {}
    static join(tables) {
        const xs = [...new Set(tables.flatMap(t => t[0]))].sort((a, b) => a - b);
        const index = new Map(xs.map((x, i) => [x, i]));
        const out = [xs];
        for (const [tx, ty] of tables) {
            const ys = new Array(xs.length).fill(null);
            tx.forEach((x, i) => { ys[index.get(x)] = ty[i]; });
            out.push(ys);
        }
        return out;
    }
}

// Fake timers: nothing runs by itself, tests decide when (run()) and see what was scheduled
function makeTimers() {
    const timers = { pending: new Map(), nextId: 1 };
    const add = (fn, ms, repeat) => { const id = timers.nextId++; timers.pending.set(id, { fn, ms, repeat }); return id; };
    timers.setTimeout = (fn, ms) => add(fn, ms, false);
    timers.setInterval = (fn, ms) => add(fn, ms, true);
    timers.clearTimeout = timers.clearInterval = id => { timers.pending.delete(id); };
    timers.run = () => { // fire everything pending once
        for (const [id, t] of [...timers.pending]) {
            if (!t.repeat) timers.pending.delete(id);
            t.fn();
        }
    };
    return timers;
}

module.exports = { FakeWebSocket, FakeUPlot, makeVue, makeTimers, installGlobals };
