// Loads the library sources (src/NNN-*.js) into a fresh, isolated Teleplot instance, without any browser.
// Everything is loaded except the embedded third-party libraries (001-003: Vue, uPlot), replaced by the light
// stubs of helpers/stubs.js. Timers are fake (nothing runs unless the test calls T.__timers.run()).
// Everything shares one closure, like in the real bundle.
const fs = require('node:fs');
const path = require('node:path');
const stubs = require('./stubs');

const SRC = path.join(__dirname, '..', '..', 'src');
const THIRD_PARTY = ['001', '002', '003'];

function loadTeleplot() {
    stubs.installGlobals();
    stubs.FakeWebSocket.instances.length = 0;
    const files = fs.readdirSync(SRC).filter(f => /^\d{3}-.*\.js$/.test(f) && !THIRD_PARTY.includes(f.slice(0, 3))).sort();
    const code = files.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
    const timers = stubs.makeTimers();
    const TELEPLOT = { Vue: stubs.makeVue(), uPlot: stubs.FakeUPlot };
    // Timer functions are shadowed by parameters: the library only ever sees the fake ones
    new Function('TELEPLOT_INSTANCE', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
        code + '\ninitTeleplot(TELEPLOT_INSTANCE);')(TELEPLOT, timers.setTimeout, timers.setInterval, timers.clearTimeout, timers.clearInterval);
    Object.defineProperty(TELEPLOT, '__timers', { value: timers });
    return TELEPLOT;
}

// Run fn() with console.log/warn/error silenced, returns what was printed (to assert on error reporting)
function captureConsole(fn) {
    const saved = {};
    const printed = { log: [], warn: [], error: [] };
    for (const level of Object.keys(printed)) {
        saved[level] = console[level];
        console[level] = (...args) => printed[level].push(args);
    }
    try { fn(); } finally { Object.assign(console, saved); }
    return printed;
}

module.exports = { loadTeleplot, captureConsole };
