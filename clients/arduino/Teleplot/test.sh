#!/bin/sh
# Microcontroller library tests, on a computer (tests/arduino/Arduino.h stands for the Arduino core): tests/test_micro.cpp (the
# library alone), then shared.inc built with this library and with the C++ client (clients/cpp/Teleplot.h), read back by the library
# of the page (tests/parity.test.js): one API, the same telemetries. And every example, run on the computer (tests/examples.test.js). Needs a C++17 compiler (CXX, default c++) and Node 16+.
set -e
cd "$(dirname "$0")"
CXX="${CXX:-c++}"
FLAGS="-Wall -Wextra -Wpedantic -Werror"
mkdir -p build
$CXX -std=c++11 $FLAGS -Itests/arduino tests/test_micro.cpp -o build/test_micro
$CXX -std=c++11 $FLAGS -Itests/arduino tests/parity_micro.cpp -o build/parity_micro
$CXX -std=c++17 $FLAGS -pthread tests/parity_full.cpp -o build/parity_full
./build/test_micro
./build/parity_micro build/micro.teleplot.txt build/serial.teleplot.txt
./build/parity_full build/full.teleplot
# Every example, run for 6 simulated seconds (tests/run_example.cpp): examples.test.js reads what it wrote
mkdir -p build/examples
for dir in examples/*/; do
    name=$(basename "$dir")
    extra=""
    if grep -q "WiFiUDP udp" "$dir$name.ino"; then extra="-DTELEPLOT_TEST_UDP"; fi
    $CXX -std=c++11 $FLAGS -Itests/arduino -Isrc $extra "-DEXAMPLE=\"../examples/$name/$name.ino\"" -x c++ tests/run_example.cpp -o "build/examples/$name"
    "./build/examples/$name" "build/examples/$name"
done
# The lines of the Help panel written with this library: a file per tile, compared with the text lines (tests/help.test.js)
rm -rf build/help
node ../../tools/help_lines.js ino build/help_lines.cpp build/help
$CXX -std=c++11 $FLAGS -Itests -Itests/arduino -Isrc build/help_lines.cpp -o build/help_lines
./build/help_lines build/help
TELEPLOT_MICRO_OUT="$PWD/build" node tests/run.js "$@"
