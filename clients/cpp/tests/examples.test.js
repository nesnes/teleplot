// Every example of the C++ client, run for a moment by ./test.sh (clients/tools/capture_udp.py stands for the server): the library of
// the page understands what it sent and gets the telemetries of the example, as in every language (clients/examples.js).
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../../packages/teleplot-js/tests/helpers/mini-test');
const { loadTeleplot } = require('../../../packages/teleplot-js/tests/helpers/load');
const { testExamples } = require('../../examples.js');

const OUT = path.join(process.env.TELEPLOT_CPP_OUT || path.join(__dirname, '..', 'build'), 'examples');
const names = fs.readdirSync(path.join(__dirname, '..', 'examples')).filter((n) => n.endsWith('.cpp')).map((n) => n.slice(0, -4)).sort();

function read(name) {
    const U = loadTeleplot();
    const problems = U.files.importData(new Uint8Array(fs.readFileSync(path.join(OUT, name + '.teleplot')))).problems;
    U.__timers.run();
    return { U, problems };
}

testExamples(test, names, read, {}, {
    '30_threads': { 'motor.current': 'number', task: 'stack', 'task.control': 'stack' },
    '31_long_action': { scan: 'action' },
    '32_image_tools': { small: 'image', view: 'image', file: 'image' },
});
