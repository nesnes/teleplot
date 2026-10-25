#!/bin/sh
# Bash examples: each one run for a moment, what it sends received by clients/tools/capture_udp.py (it stands for the Teleplot server,
# so stop a server running on this computer first), then read back by the library of the page (tests/examples.test.js).
# Needs Bash, awk, base64, Python 3 and Node 16+.
set -e
cd "$(dirname "$0")"
mkdir -p build/examples
for example in examples/*.sh; do
    name=$(basename "$example" .sh)
    (cd build/examples && python3 ../../../tools/capture_udp.py 1.5 "$name" bash "../../$example")
done
TELEPLOT_BASH_OUT="$PWD/build" node tests/run.js "$@"
