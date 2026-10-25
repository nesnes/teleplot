#!/bin/sh
# Python client tests: the client alone (tests/test_teleplot.py), then what it sends read back by the library of the page and compared
# with the C++ client and the Arduino library (the same scenario: tests/parity.py), its pictures compared with the C++ test's, and
# every example run for about a second. Needs Python 3.9+ (PYTHON, default python3), a C++17 compiler (CXX, default c++) and Node 16+.
set -e
cd "$(dirname "$0")"
CXX="${CXX:-c++}"
PYTHON="${PYTHON:-python3}"
mkdir -p build/images build/examples build/cpp-images
$PYTHON tests/test_teleplot.py
# What it is compared with: the same scenario through the C++ client and the Arduino library, the pictures of the C++ image test
$CXX -std=c++17 -pthread ../arduino/Teleplot/tests/parity_full.cpp -o build/parity_full
$CXX -std=c++11 -I../arduino/Teleplot/tests/arduino ../arduino/Teleplot/tests/parity_micro.cpp -o build/parity_micro
$CXX -std=c++17 -O2 -pthread ../cpp/tests/test_image.cpp -o build/test_image
./build/parity_full build/full.teleplot
./build/parity_micro build/micro.teleplot.txt build/serial.teleplot.txt
./build/test_image build/cpp-images > /dev/null
$PYTHON tests/parity.py build
$PYTHON tests/test_image.py build/cpp-images build/images
for example in examples/*.py; do
    name=$(basename "$example" .py)
    rm -f "build/examples/$name.skip" "build/examples/$name.teleplot"
    if [ "$name" = 33_numpy_pixels ] && ! $PYTHON -c "import numpy" 2> /dev/null; then
        echo "NumPy is not installed" > "build/examples/$name.skip"
        continue
    fi
    $PYTHON tests/run_example.py "$example" "build/examples/$name" > /dev/null
done
TELEPLOT_PYTHON_OUT="$PWD/build" TELEPLOT_CPP_IMAGES="$PWD/build/cpp-images" node tests/run.js "$@"
