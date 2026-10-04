// Runs every tests/*.test.js, in one process. Usage: node tests/run.js [pattern]
// pattern: only run tests whose "file > name" matches this regular expression (case-insensitive).
const fs = require('node:fs');
const path = require('node:path');
const registry = require('./helpers/mini-test');

const pattern = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
for (const file of fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort()) {
    registry.setCurrentFile(file);
    require(path.join(__dirname, file));
}

(async () => {
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
