// Tiny test registry (the runner is tests/run.js). It replaces node:test, which needs Node 18+, so tests run on Node 16.
// API: test(name, fn) or test(name, { skip: reason }, fn); fn may be async.
const tests = [];
let currentFile = '';

function test(name, options, fn) {
    if (typeof options === 'function') { fn = options; options = {}; }
    tests.push({ file: currentFile, name, fn, skip: options.skip });
}

module.exports = test;
module.exports.tests = tests;
module.exports.setCurrentFile = file => { currentFile = file; };
