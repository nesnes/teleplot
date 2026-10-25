// Every example in Bash, run for a moment by ./test.sh (clients/tools/capture_udp.py stands for the server): the library of the page
// understands every line it sent and gets the telemetries of the example, as in every language (clients/examples.js).
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../../packages/teleplot-js/tests/helpers/mini-test');
const { loadTeleplot } = require('../../../packages/teleplot-js/tests/helpers/load');
const { testExamples } = require('../../examples.js');

const OUT = path.join(process.env.TELEPLOT_BASH_OUT || path.join(__dirname, '..', 'build'), 'examples');
const names = fs.readdirSync(path.join(__dirname, '..', 'examples')).filter((n) => n.endsWith('.sh')).map((n) => n.slice(0, -3)).sort();

function read(name) {
    const U = loadTeleplot();
    const problems = U.files.importData(fs.readFileSync(path.join(OUT, name + '.teleplot.txt'), 'utf8')).problems;
    U.__timers.run();
    return { U, problems };
}

const NO_COMMANDS = 'a shell script sends, it does not read what the page sends back (settings and actions: the other clients)';
testExamples(test, names, read, {
    16: NO_COMMANDS, 17: NO_COMMANDS, 18: NO_COMMANDS, 19: NO_COMMANDS,
    21: 'no library to give a clock to: a line carries its own time, or none (see 20_time_and_rate)',
    24: 'no library, so no statistics of one',
}, {});
