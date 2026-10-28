# Teleplot clients

Libraries and samples that send telemetry to Teleplot, one folder per language. Any language that can send a UDP packet, or write to a
serial port, needs none: one line of the text protocol ([doc/textProtocol.md](../doc/textProtocol.md)) is enough.

| Folder | What |
| --- | --- |
| [cpp](cpp/README.md) | `Teleplot.h`: C++17, binary protocol over UDP, Linux / macOS / Windows; `TeleplotImage.h`: camera pictures to JPEG or PNG |
| [arduino/Teleplot](arduino/Teleplot/README.md) | The Arduino library: the same API on a board (text protocol on Serial, UDP or a file), with the examples |
| [arduino/commands](arduino/commands/commands.ino) | Settings and actions by hand on a serial port, without the library |
| [python](python/README.md) | `teleplot.py`: the same API in one Python file (binary or text, UDP or a file), pictures, with the examples |
| [bash](bash/README.md) | No library: lines of the text protocol written to `/dev/udp`, the examples it can do |

## Examples

Every language has the same examples, with the same numbers and the same telemetry names, so that one is easy to find in another
language: 01 to 25 below. A language that cannot do one says why (Bash cannot read what the page sends back, so it has no settings or
buttons). From 30 on, what only that language has (threads, WiFi, NumPy...).

| | What it shows | C++ | Arduino | Python | Bash |
| --- | --- | :-: | :-: | :-: | :-: |
| 01 | a value, charted as it comes | yes | yes | yes | yes |
| 02 | a unit, a range (a gauge), a description, a limit; a value kept out of Live | yes | yes | yes | yes |
| 03 | values with the same label share a chart | yes | yes | yes | yes |
| 04 | lines to read one after the other | yes | yes | yes | yes |
| 05 | a text whose latest value matters (a state) | yes | yes | yes | yes |
| 06 | what runs, function by function, on a timeline | yes | yes | yes | yes |
| 07 | a position on a map, with more digits | yes | yes | yes | yes |
| 08 | a shape described once, then moved | yes | yes | yes | yes |
| 09 | a line, a polygon, a circle, an arrow, a text on a map | yes | yes | yes | yes |
| 10 | 3D shapes, one placed on the other, a quaternion, a point in space | yes | yes | yes | yes |
| 11 | colors, opacity, an STL mesh, a picture on a shape | yes | yes | yes | yes |
| 12 | a point cloud, with intensities | yes | yes | yes | yes |
| 13 | a picture | yes | yes | yes | yes |
| 14 | a camera: lens, pose, the scene over its pictures, drawings in its pixels | yes | yes | yes | yes |
| 15 | a depth map (raw 16-bit numbers) | yes | yes | yes | yes |
| 16 | a value the page can change | yes | yes | yes | - |
| 17 | a button in the page, with an argument and a confirmation | yes | yes | yes | - |
| 18 | a joystick that stops by itself | yes | yes | yes | - |
| 19 | choices (an enum), refusing a value | yes | yes | yes | - |
| 20 | the time a value was measured, fewer samples of a fast value | yes | yes | yes | yes |
| 21 | a clock of your own | yes | yes | yes | - |
| 22 | recording to a file the page opens | yes | yes | yes | yes |
| 23 | choosing where values go (a dashboard) | yes | yes | yes | yes |
| 24 | how the client is doing, in the page | yes | yes | yes | - |
| 25 | a state machine and a behavior tree (graphs) | yes | yes | yes | yes |

The lines of the Help panel of the page are written with these clients too: [`tools/help_lines.js`](tools/help_lines.js) makes a program of them per language, which each test suite runs and checks (the page must get what the text lines give).

Each test suite runs every example of its language for a moment and reads what it sent with the library of the page:
[`examples.js`](examples.js) holds the common set (what each example must give the page) and checks that a language has all of it,
or says why not. [`tools/capture_udp.py`](tools/capture_udp.py) stands for the Teleplot server while an example runs (it takes UDP
port 47269: stop a running server before the C++ and Bash tests).

The API of the C++ and Arduino clients: [doc/cpp-client-api.md](../doc/cpp-client-api.md); of the Python client: [doc/python-client-api.md](../doc/python-client-api.md). Commands from the page:
[doc/telecmd.md](../doc/telecmd.md).
