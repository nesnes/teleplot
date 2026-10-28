// The lines of the Help panel written with this library (clients/tools/help_lines.js): ./test.sh builds them into build/help_lines and
// runs it on the computer, the serial lines of each tile of the Help in a file; the library of the page must make of each what it makes
// of the text lines of the tile.
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../../../packages/teleplot-js/tests/helpers/mini-test');
const { loadTeleplot } = require('../../../../packages/teleplot-js/tests/helpers/load');
const { testHelp } = require('../../../tools/help_lines.js');

testHelp(test, 'ino', path.join(process.env.TELEPLOT_MICRO_OUT || path.join(__dirname, '..', 'build'), 'help'), (file) => {
    const U = loadTeleplot();
    const problems = U.files.importData(fs.readFileSync(file + '.teleplot.txt', 'utf8'), { serial: true }).problems;
    U.__timers.run();
    return { U, problems };
});
