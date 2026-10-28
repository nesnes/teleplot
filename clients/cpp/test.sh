#!/bin/sh
# C++ client tests: builds tests/test_client.cpp (the client alone), tests/scenarios.cpp (files read back by the library of the page,
# tests/client.test.js) and tests/test_image.cpp (TeleplotImage.h: pictures decoded by Node and libjpeg, tests/image.test.js), checks that misuse does not compile, then runs them. Needs a C++17 compiler (CXX, default c++) and Node 16+.
set -e
cd "$(dirname "$0")"
CXX="${CXX:-c++}"
FLAGS="-std=c++17 -Wall -Wextra -Wpedantic -Werror -pthread"
mkdir -p build
$CXX $FLAGS tests/test_client.cpp -o build/test_client
$CXX $FLAGS tests/scenarios.cpp -o build/scenarios
$CXX $FLAGS -O2 tests/test_image.cpp -o build/test_image
# at() in the middle of a chain must not compile, with a message that says why
printf '#include "../Teleplot.h"\nint main() { Teleplot tp; tp.telemetry("a").position(1, 2).at(Teleplot::ms(1)); }\n' > build/misuse.cpp
if $CXX $FLAGS build/misuse.cpp -o build/misuse 2> build/misuse.log; then echo "FAIL: at() in the middle of a chain compiled"; exit 1; fi
grep -q "at() must be the first call of a chain" build/misuse.log || { echo "FAIL: no clear message for at() in the middle of a chain"; cat build/misuse.log; exit 1; }
echo "ok   at() in the middle of a chain does not compile"
./build/test_client
./build/scenarios build
mkdir -p build/images
./build/test_image build/images
# Every example, run for a moment, what it sends received by a stand-in for the server (port 47269: stop a running Teleplot server)
mkdir -p build/examples
for example in examples/*.cpp; do
    name=$(basename "$example" .cpp)
    $CXX $FLAGS "$example" -o "build/examples/$name"
    (cd build/examples && python3 ../../../tools/capture_udp.py 1.5 "$name" "./$name")
done
# The lines of the Help panel written with this client: a file per tile, compared with the text lines (tests/help.test.js)
rm -rf build/help
node ../tools/help_lines.js cpp build/help_lines.cpp build/help
$CXX $FLAGS build/help_lines.cpp -o build/help_lines
./build/help_lines build/help
TELEPLOT_CPP_OUT="$PWD/build" node tests/run.js "$@"
