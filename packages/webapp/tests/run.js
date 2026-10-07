// Webapp tests (zero dependency, same runner as the library): ./test.sh from packages/webapp/, optional regex argument
require('../../teleplot-js/tests/run.js').runDir(__dirname, process.argv[2]);
