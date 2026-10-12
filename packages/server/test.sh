#!/bin/sh
# Runs the server tests (needs its dependencies: npm ci). Optional argument: regex selecting tests
cd "$(dirname "$0")" && exec node tests/run.js "$@"
