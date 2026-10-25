// Every example of the Python client, run for about a second by ./test.sh (run_example.py): the library of the page understands
// everything it sent and gets the telemetries of the example, as in every language (clients/examples.js).
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../../packages/teleplot-js/tests/helpers/mini-test');
const { loadTeleplot } = require('../../../packages/teleplot-js/tests/helpers/load');
const { testExamples } = require('../../examples.js');

const OUT = path.join(process.env.TELEPLOT_PYTHON_OUT || path.join(__dirname, '..', 'build'), 'examples');
const names = fs.readdirSync(path.join(__dirname, '..', 'examples')).filter((n) => n.endsWith('.py')).map((n) => n.slice(0, -3)).sort();

function read(name) {
    const U = loadTeleplot();
    let problems = 0;
    problems += U.files.importData(new Uint8Array(fs.readFileSync(path.join(OUT, name + '.teleplot')))).problems;
    const text = fs.readFileSync(path.join(OUT, name + '.teleplot.txt'), 'utf8');
    if (text !== '') problems += U.files.importData(text).problems;
    U.__timers.run();
    return { U, problems };
}

// test.sh writes NAME.skip instead of running an example that cannot run here (NumPy not installed), with the reason
const skip = {};
for (const name of names) {
    const file = path.join(OUT, name + '.skip');
    if (fs.existsSync(file) && !fs.existsSync(path.join(OUT, name + '.teleplot'))) skip[name] = fs.readFileSync(file, 'utf8').trim();
}

testExamples(test, names, read, {}, {
    '30_threads': { 'motor.current': 'number', task: 'stack', 'task.control': 'stack' },
    '31_long_action': { scan: 'action' },
    '32_text_protocol': { wave: 'number' },
    '33_numpy_pixels': { frame: 'image', corner: 'image', small: 'image' },
}, skip);
