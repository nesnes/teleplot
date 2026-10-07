#!/bin/sh
# Runs the webapp logic tests (no browser: the editor commands run on the library with stubs). Optional argument: regex selecting tests
cd "$(dirname "$0")" && exec node tests/run.js "$@"
