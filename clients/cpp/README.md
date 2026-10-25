# Teleplot for C++

Two headers to copy into your project, no other file and no dependency:

- `Teleplot.h`: telemetry and commands, binary protocol over UDP (127.0.0.1:47269 by default, the Teleplot server), C++17, Linux,
  macOS and Windows. It packs what you give it and sends every 20 ms, from your thread or a thread of its own.
- `TeleplotImage.h`: the pixels of a camera (OpenCV, ROS, a webcam, a depth sensor) to JPEG or PNG, in the call or on a thread of its
  own.

```cpp
#include "Teleplot.h"

Teleplot& tp = Teleplot::instance();
tp.telemetry("battery").unit("V").range(10.5, 12.6);     // described once
tp.update("battery", 12.1);                               // a sample, dated now
```

The whole API, with samples and the reasons behind it: [doc/cpp-client-api.md](../../doc/cpp-client-api.md). The same calls work on
a board with the Arduino library ([clients/arduino/Teleplot](../arduino/Teleplot/README.md)).

`sample.cpp` is a small robot (numbers, a log, what runs, a moving shape, a setting and an action):

```bash
c++ -std=c++17 -pthread sample.cpp -o sample
```

Start the Teleplot server ([packages/server](../../packages/server/README.md)), open the page, run `./sample`.

## Tests

```bash
./test.sh
```

Needs a C++17 compiler and Node: the client alone ([`tests/test_client.cpp`](tests/test_client.cpp), [`tests/test_image.cpp`](tests/test_image.cpp)), and files written by the client
read back by the library of the page ([`tests/scenarios.cpp`](tests/scenarios.cpp), `tests/*.test.js`). `CMakeLists.txt` builds the same with CMake (MSVC in
the CI).
