#!/bin/sh
# Runs the library tests (no dependency, needs Node 20+). Extra arguments are passed to node, ex: ./test.sh --test-name-pattern=decimat
cd "$(dirname "$0")" && exec node --test "$@" 'tests/*.test.js'
