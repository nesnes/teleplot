// Runs every tests/*.test.js, in one process. Usage: node tests/run.js [pattern]
// pattern: only run tests whose "file > name" matches this regular expression (case-insensitive).
const fs = require('node:fs');
const path = require('node:path');
const registry = require('./helpers/mini-test');

// runDir(dir, pattern): runs the *.test.js of a folder (the webapp has its own tests/ folder and reuses this runner)
async function runDir(dir, patternText) {
const pattern = patternText ? new RegExp(patternText, 'i') : null;
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort()) {
    registry.setCurrentFile(file);
    require(path.join(dir, file));
}

await (async () => {
    const results = { pass: 0, fail: 0, skip: 0 };
    const started = Date.now();
    let lastFile = '';
    for (const t of registry.tests) {
        if (pattern && !pattern.test(`${t.file} > ${t.name}`)) continue;
        if (t.file !== lastFile) { console.log(`\n${t.file}`); lastFile = t.file; }
        if (t.skip) { results.skip++; console.log(`  - ${t.name} (skipped)`); continue; }
        try {
            await t.fn();
            results.pass++;
            console.log(`  ok   ${t.name}`);
        } catch (e) {
            results.fail++;
            console.log(`  FAIL ${t.name}`);
            console.log(String(e && e.stack || e).split('\n').slice(0, 12).map(l => '       ' + l).join('\n'));
        }
    }
    console.log(`\n${results.pass} passed, ${results.fail} failed, ${results.skip} skipped (${Date.now() - started} ms)`);
    process.exit(results.fail ? 1 : 0);
})();
}

module.exports = { runDir };
if (require.main === module) runDir(__dirname, process.argv[2]);
