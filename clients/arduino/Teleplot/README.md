# Teleplot for Arduino

Send telemetry to [Teleplot](https://github.com/nesnes/teleplot) from a board (Arduino, ESP32, RP2040, STM32...), and let the page
change settings and press buttons on it. It writes lines of the Teleplot text protocol on the serial port, over UDP, or into a file.
The calls are the ones of the C++ client for computers (`clients/cpp/Teleplot.h`): the whole API is in `doc/cpp-client-api.md`.

Install: copy this folder into the `libraries` folder of your Arduino sketchbook, then File > Examples > Teleplot.

```cpp
#include <Teleplot.h>
Teleplot tp(Serial);

void setup() { Serial.begin(115200); }
void loop() { tp.update("temperature", analogRead(A0) * 0.1); tp.poll(); delay(50); }
```

In the page: Sources, "Add a source", Serial port. Or start the Teleplot server on a computer and send over UDP (`09_WiFiUDP`).

## Examples, one step at a time

| | |
| --- | --- |
| `01_FirstValue` | a value, charted as it comes |
| `02_Describe` | a unit, a range (a gauge), a description, a limit |
| `03_Together` | values with the same label share a chart |
| `04_Logs` | lines to read one after the other |
| `05_WhatRuns` | what runs, function by function, on a timeline |
| `06_MovingShape` | a shape described once, then moved |
| `07_Settings` | a value the page can change |
| `08_Buttons` | a button in the page, with an argument |
| `09_WiFiUDP` | the same over WiFi (ESP32) |
| `10_States` | a text whose latest value matters |
| `11_MapPosition` | a position on a map, with more digits |
| `12_Scene3D` | 3D shapes, one placed on the other |
| `13_Drawings` | a path, an arrow, a text on a map |
| `14_Lidar` | a point cloud |
| `15_Picture` | a picture (PNG or JPEG bytes) |
| `16_Joystick` | a joystick that stops by itself |
| `17_SettingRules` | choices, and refusing a value |
| `18_TimeAndRate` | the time a value was measured, fewer samples of a fast value |
| `19_Dates` | real dates instead of the time since boot (ESP32) |
| `20_SDCard` | recording to an SD card |
| `21_Dashboard` | choosing where values go |
| `22_SmallBoards` | memory on small boards, and the stats in the page |

## What to know about this library

It runs on boards with a few KB of RAM, without a heap or the C++ standard library. That comes with rules the C++ client for
computers does not have:

- **Strings are kept, not copied.** Names, units, labels, descriptions, colors, frames, urls, titles: the library keeps a pointer to
  them, to send them again every 5 s (a page opened later still gets them). Give string literals (`"battery"`), or strings that live
  as long as the sketch: not a `String` that goes away, nor a `char` buffer you reuse. `F("...")` is not taken. Values (texts sent
  with `update()`, log lines) are written at once and can be anything.
- **Lists are static arrays.** `choices()` takes `static const char* const MODES[] = {"auto", "manual"};`, not `{"auto", "manual"}`.
- **Functions, not lambdas that capture.** A handler (`action()`), a check (`onChange()`) or a clock (`clock()`) is a plain function,
  or a lambda without capture. They use global variables.
- **Text settings are `char` arrays** (`char mode[12]`), not `String`.
- **Tables have a fixed size**, set before `#include <Teleplot.h>` (`22_SmallBoards`). What does not fit is counted in
  `stats().tooBig` and not kept (values are always sent):

  | | default | AVR (Uno, Mega...) |
  | --- | --- | --- |
  | `TELEPLOT_MAX_TELEMETRIES`: telemetries given a description | 16 | 4 |
  | `TELEPLOT_MAX_PARAMS`: settings | 8 | 2 |
  | `TELEPLOT_MAX_ACTIONS` / `TELEPLOT_MAX_ARGS`: buttons, and arguments of each | 4 / 4 | 1 / 2 |
  | `TELEPLOT_MAX_THRESHOLDS` | 8 | 2 |
  | `TELEPLOT_MAX_STACKS` / `TELEPLOT_STACK_SIZE`: stacks, longest path | 4 / 64 | 1 / 32 |
  | `TELEPLOT_LINE_SIZE`: longest line the page writes (longer: ignored) | 128 | 64 |
  | `TELEPLOT_RESULT_SIZE`: longest text an action answers | 40 | 16 |
  | Memory of a `Teleplot` | about 5 KB | about 0.6 KB |

- **`sendStats(Teleplot::ms(1000))`** sends, every second, the samples and bytes written per second and the totals of what did
  not fit (`teleplot.tooBig`) or could not be read (`teleplot.dropped`): the page charts them like any telemetry. Off by default.
- **Call `poll()` often** when the page can change something: it reads what the page wrote, applies it, answers, publishes the
  settings, and sends the descriptions again. Handlers and checks run inside it.
- **What is sent again every 5 s**: descriptions, settings and buttons, the kind and frame of a shape. With `TELEPLOT_RESEND` (on,
  except on AVR, where it would take about 100 bytes per telemetry): also the position, orientation, size and color of a shape, a
  camera, thresholds. Not: opacity, texture, vector, text, line width, points of a line: send them again yourself if a page may open
  later.
- **Times count from the boot** (`micros()`, which the library keeps counting past its 71 minutes). The page dates them when they
  arrive (option "Times since boot" of the source, on by default). A file read later needs a clock that gives the date: `clock()`
  (`19_Dates`). `at()` dates a sample when it was measured, on the same clock (`Teleplot::now()`, `18_TimeAndRate`).
- **Numbers** are written with 9 significant digits (any `float` exactly), 15 with `precise()`. On AVR a `double` is a `float`: more
  digits cannot be measured there.
- **Names** must not hold `:` `,` `|` `;` (they separate the parts of a line). Texts are kept on one line.
- **One thread.** Do not call the library from an interrupt: set a flag there, send from `loop()`.
- **Where lines go.** `Teleplot tp(Serial)`: lines start with `>` (the other lines of the port are logs), what the page writes is read
  from the port. `Teleplot tp(udp, host, port)`: lines go in UDP packets (sent at 1200 bytes, after 20 ms, or by `flush()` and
  `poll()`); give the socket a port with `udp.begin(port)` so that what the page writes comes back. `tp.addOutput(file)`: the same
  lines into a file (plain, without `>`).
- Not here (the C++ client for computers has them): `running()` / `answer()` for an action that finishes later, threads, data
  timeout. `nonBlocking()`, `oneThread()` and `timeout()` are accepted and do nothing, so that code can be shared.

## Tests

`./test.sh` (on a computer: a C++17 compiler and Node): the library alone, the same calls through both clients giving the page the
same telemetries, and every example run for a few simulated seconds, its lines read by the library of the page.
