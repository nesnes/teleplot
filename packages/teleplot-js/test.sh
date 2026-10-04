#!/bin/sh
# Runs the library tests (no dependency, needs Node 16+). Optional argument: regex selecting tests, ex: ./test.sh decimat
cd "$(dirname "$0")" && exec node tests/run.js "$@"
