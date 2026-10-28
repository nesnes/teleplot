// Writes doc/reference.md from the Reference of the Help panel (components/help-reference.js): node packages/webapp/tools/reference-md.js
// A test of the webapp (tests/reference.test.js) fails when the file is not what this writes.
const fs = require('node:fs');
const path = require('node:path');

const WEBAPP = path.join(__dirname, '..');
const FILE = path.join(WEBAPP, '..', '..', 'doc', 'reference.md');

// The Reference and what it uses of the Help panel, as the page loads them
function loadReference() {
    const code = ['panel-help.js', 'help-reference.js'].map((f) => fs.readFileSync(path.join(WEBAPP, 'components', f), 'utf8')).join('\n');
    return new Function(code + '\nreturn { REF_FAMILIES, REF_THINGS, REF_ROWS, REF_OPTIONS, REF_DRAWINGS, REF_VIEW_COMMON, refRow, refViewRows, refCall, refExample, refRowsOf, refThingsOf, refOptionRows, refSearch, refMatrix, refDrawing, refMarkdown, HELP_SENDERS, HELP_EXAMPLES, helpLine, helpFill, helpPython };')();
}
// The page: CRLF, as the other files of doc/
function markdown() {
    const { loadTeleplot } = require(path.join(WEBAPP, '..', 'teleplot-js', 'tests', 'helpers', 'load'));
    return loadReference().refMarkdown(loadTeleplot()).replace(/\r?\n/g, '\r\n');
}

module.exports = { loadReference, markdown, FILE };

if (require.main === module) {
    fs.writeFileSync(FILE, markdown());
    console.log('Written: ' + path.relative(process.cwd(), FILE));
}
