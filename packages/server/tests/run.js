// Server tests (same runner as the library): ./test.sh from packages/server/, optional regex argument
require('../../teleplot-js/tests/run.js').runDir(__dirname, process.argv[2]);
