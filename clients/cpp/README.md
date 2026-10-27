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

Start the Teleplot server ([packages/server](../../packages/server/README.md)), open the page, run an example (below).

## Examples, one step at a time

In [`examples/`](examples/): the same as in the other languages ([clients/README.md](../README.md#examples)), then its own from 30.
One file each: `c++ -std=c++17 -pthread examples/01_first_value.cpp -o first_value` (CMake builds them all).

| | |
| --- | --- |
| `01_first_value` | a value, charted as it comes |
| `02_describe` | a unit, a range (a gauge), a description, a limit; a value kept out of Live |
| `03_together` | values with the same label share a chart |
| `04_logs` | lines to read one after the other |
| `05_states` | a text whose latest value matters (a state) |
| `06_what_runs` | what runs, function by function, on a timeline |
| `07_map_position` | a position on a map, with more digits |
| `08_moving_shape` | a shape described once, then moved |
| `09_drawings` | a line, a polygon, a circle, an arrow, a text on a map |
| `10_scene_3d` | 3D shapes, one placed on the other, a quaternion, a point in space |
| `11_looks` | colors, opacity, an STL mesh, a picture on a shape |
| `12_lidar` | a point cloud, with intensities |
| `13_picture` | pixels encoded on a thread, then sent |
| `14_camera` | a camera: lens, pose, the scene over its pictures, drawings in its pixels |
| `15_depth_map` | a depth map (raw 16-bit numbers) |
| `16_settings` | a value the page can change |
| `17_buttons` | a button in the page, with an argument and a confirmation |
| `18_joystick` | a joystick that stops by itself |
| `19_setting_rules` | choices (an enum), refusing a value, a setting bound to a variable |
| `20_time_and_rate` | the time a value was measured, fewer samples of a fast value |
| `21_clock` | a clock of your own |
| `22_recording` | recording to a file the page opens |
| `23_dashboard` | choosing where values go (a dashboard) |
| `24_stats` | how the client is doing, in the page |
| `25_graphs` | a state machine and a behavior tree: their structure, where they are, the results of a tick |
| `30_threads` | a sending thread, its priority, a loop that never waits, a lane per thread |
| `31_long_action` | an action that answers later |
| `32_image_tools` | encode PNG and JPEG, shrink, a part of a picture, save and load |

## Tests

```bash
./test.sh
```

Needs a C++17 compiler and Node: the client alone ([`tests/test_client.cpp`](tests/test_client.cpp), [`tests/test_image.cpp`](tests/test_image.cpp)), and files written by the client
read back by the library of the page ([`tests/scenarios.cpp`](tests/scenarios.cpp), `tests/*.test.js`), and every example run
for a moment (stop a running Teleplot server first: its UDP port is taken by the test). `CMakeLists.txt` builds the same with CMake (MSVC in
the CI).
