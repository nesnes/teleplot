# C++ clients: API

Two headers, **one API**: code written for one compiles with the other as long as it uses what both have (marked below).

- [`clients/cpp/Teleplot.h`](../clients/cpp/Teleplot.h): computers (Linux, macOS, Windows), binary protocol over UDP, C++17.
- [`clients/arduino/Teleplot/src/Teleplot.h`](../clients/arduino/Teleplot/src/Teleplot.h) (an Arduino library: `library.properties`, `examples/`): microcontrollers (AVR, ESP32,
  RP2040, STM32...), text protocol on any `Print` (Serial, a UDP socket, an SD file), C++11, no heap, no STL.

Both declare a class named `Teleplot`.

Tests: [`clients/cpp/test.sh`](../clients/cpp/test.sh) for the full header, [`clients/arduino/Teleplot/test.sh`](../clients/arduino/Teleplot/test.sh) for the Arduino library (among them, the same
calls built with both headers must give the page the same telemetries). What to know on a small board: the README of the Arduino
library ([`clients/arduino/Teleplot/README.md`](../clients/arduino/Teleplot/README.md)).

Examples: [`clients/cpp/examples/`](../clients/cpp/examples/) and the Arduino library's `examples/`, numbered as in every language (01 to 24 the
same everywhere, 30 and up what only that client has: [clients/README.md](../clients/README.md#examples)).

## Choices behind it

- **Chained calls, no options structs**: `tp.telemetry("battery").unit("V").range(10.5, 12.6)`. Designated initializers
  (`{ .unit = "V" }`) need C++20, and Arduino AVR builds in C++11; chains work everywhere, read the same, and each call is what a protocol already says: an attribute or a
  section of the binary one; in text an `ATTR|` key (`ATTR|battery|unit=V`), a flag or the label of the sample lines (`log`, `np`,
  `name,label`), or a property of a `3D|` line (`F:robot.body`).
- **Names in the API are the words of the text protocol** (label, frame, log, stack, range, desc, threshold...), which the Help panel
  shows: a user goes from a tile of the Help to C++ without a dictionary.
- **One handle type, `Teleplot::Telemetry`**: everything a telemetry can carry, as in the protocol (a camera is images + intrinsics
  + a pose; a lidar is clouds + a pose). `tp.update(name, value)` and the like are shortcuts for the common case.
- **Time**: without one, a sample is dated "now" (`tp.clock()`). A time of your own is given with `at(time)` at the start of a chain
  (`body.at(t).position(x, y)`), or as the last argument of the shortcuts `tp.update`, `tp.log`, `tp.stack`. `Teleplot::Time` is built
  from any `std::chrono` duration or time point (full header), or `Teleplot::ms(x)`, `Teleplot::us(x)`, `Teleplot::ns(x)` (both
  headers).

## Samples

### 1. First number (both headers)

```cpp
#include "Teleplot.h"

int main() {
    for (float i = 0;; i += 0.1f) {
        Teleplot::instance().update("sin", std::sin(i));   // 127.0.0.1:47269 (on a board: the same line in loop(), on Serial)
        usleep(10000);
    }
}
```

Nothing else to call: samples are packed and sent every 20 ms (`flushInterval`) or as soon as a packet is full (microcontroller:
each call writes its line at once).

### 2. Describing telemetries (both headers)

```cpp
Teleplot& tp = Teleplot::instance();
tp.telemetry("battery")
    .unit("V").range(10.5, 12.6).desc("Main battery").label("power")   // a gauge, in the "power" view
    .threshold("low", Teleplot::Below, 11.0, "orange")
    .threshold("empty", Teleplot::Below, 10.8, "red");
tp.telemetry("imu.accel").unit("m/s²").maxRate(50);                     // keeps at most 50 samples per second
tp.telemetry("gps").precise();                                          // float64 (section 36): no rounding to float32
tp.telemetry("debug.raw").autoplot(false);                              // not put on the Live dashboard by itself

for (;;) {
    tp.update("battery", readBattery());
    tp.update("imu.accel", accelX);
    tp.update("gps", Teleplot::Number2D{lon, lat});            // a 2D point: on a map, with its trail
    tp.update("drone", Teleplot::Number3D{x, y, z});           // a 3D point, with its trail
    tp.update("mode", "docking");           // a text: a state
}
```

Descriptions are sent with the first sample and again every 5 s (a page opened later still gets them). Calling them again with
other values updates them.

### 3. Logs and what runs (both headers)

```cpp
tp.log("events", "docked at station 2");    // a log line (the "log" attribute is set by the first call)
tp.log("battery low");                      // without a name: the telemetry "log"
tp.stack("robot.task", "loop/plan/search"); // a stack: what runs, drawn on a timeline
tp.stack("robot.task", "");                 // nothing runs

void loop()   { Teleplot::Stack level(tp, "robot.task", "loop");   plan(); }
void plan()   { Teleplot::Stack level(tp, "robot.task", "plan");   search(); }   // "loop/plan" when called from loop()
void search() { Teleplot::Stack level(tp, "robot.task", "search"); /* ... */ }  // "loop/plan/search"; "loop/plan" again when it returns
```

A function names only its own level: `Teleplot::Stack` adds it to the path of the stack while it lives, and sends the path back
without it when it is destroyed (the end of the block, an exception too). `tp.stack(name, path)` still sends a whole path.

Samples of a stack with the same time are parts of one for the page (several paths at once, [`graph.md`](graph.md)). So when the
client dates a stack sample itself (`Teleplot::Stack`, `tp.stack(name, path)` without a time), it is at least 1 µs after the previous
one of that stack, even within the resolution of the clock: one step and the next never look like parts of one.

Graphs ([`graph.md`](graph.md)): a structure is sent once (and again with the descriptions, with its own time); what runs is a stack.

```cpp
tp.telemetry("mode").stack()
    .enumValues({ "idle", "mission/goto", "mission/grasp", "error" })                         // its states: mission holds goto and grasp
    .edges({ "idle>mission=start", "mission/goto>mission/grasp=arrived", "mission>error=fault" }); // its transitions, with their events
tp.stack("mode", "mission/goto");                                                            // where it is
tp.telemetry("bt").stack().enumValues({ "root#fallback", "root/patrol#sequence", "root/patrol/goto#action", "root/dock#action" });
tp.update("bt", "root/patrol=failure,root/dock");                                            // a tick: results, and what runs
```

A structure bigger than a packet goes in parts with the same time; the same structure again is not sent. With the microcontroller
header, lists are static arrays (`static const char* const STATES[] = {...};`).

Threads (full header): each thread has its own path. The main thread (the one that runs `main()`) sends to the stack as named;
every other thread to a telemetry of its own, the name of the stack and the name of the thread, all with the label of the stack
(unless it was given another one), so one timeline shows a lane per thread:

```cpp
Teleplot::Stack level(tp, "robot.task", "loop");   // from main(): telemetry robot.task (label robot.task)

Teleplot::threadName("control");            // once, at the start of a thread (else: the name the OS has, else "thread 2"...)
Teleplot::Stack level(tp, "robot.task", "loop");   // from "control": telemetry robot.task.control, label robot.task
```

The main thread is known from the start (its id is taken while static objects are built, before `main()` runs), so a name never
depends on which thread used the stack first. A stack declared `tp.telemetry("robot.task").stack().oneThread()` never gets thread
names: it belongs to the first thread that uses it (the main one or not); using it from another thread is counted in `stats()` and
those samples are dropped, never mixed into its path.

### 4. A robot in 2D and 3D (both headers)

```cpp
auto body  = tp.telemetry("robot.body");
auto lidar = tp.telemetry("robot.lidar");
auto cam   = tp.telemetry("robot.camera");

// Once
body.shape(Teleplot::Cube).size(0.4, 0.3, 0.2).color("#2ecc71").label("Robot/Map");
lidar.frame("robot.body").position(0.15, 0, 0.25);                  // fixed on the body
cam.frame("robot.body").position(0.2, 0, 0.3)
   .intrinsics(640, 480, 520, 520, 320, 240).distortion(-0.28, 0.07, 0, 0, 0);
tp.telemetry("goal").shape(Teleplot::Arrow).position(2, 1).vector(0.5, 0).color("orange");
tp.telemetry("path").shape(Teleplot::Line).lineWidth(0.02);
tp.telemetry("label").shape(Teleplot::Text).position(2, 1.2).text("goal").textSize(0.1);

// In the loop: each call sends only what it names, at its own rate
body.position(x, y).yaw(theta);                         // 2D: z = 0; or .position(x, y, z).quaternion(w, qx, qy, qz)
body.yaw(Teleplot::deg(90));                            // angles are radians; deg() converts degrees
lidar.cloud(points, count);                             // Number3D*, count; full header: also std::vector<Number3D>
lidar.cloud(points, count, intensities);                // a float per point; or colors: Teleplot::Rgb per point
tp.telemetry("path").points(waypoints, n);              // the points of the line (Number2D or Number3D)
cam.image(Teleplot::Jpeg, jpegBytes, jpegSize);         // copied, cut in parts; drawn with the shapes over it
tp.telemetry("detection").pixelsOf("robot.camera")      // drawn in the pixels of the picture
   .shape(Teleplot::Rect).position(320, 200).size(80, 60);

// Several properties at one time
body.position(x, y).yaw(theta);                         // one chain, one time: both samples get the same "now"
body.at(timestamp).position(x, y).yaw(theta);           // or a time of your own (the sensor's, a replay...)
```

Shape types: `Cube`, `Sphere`, `Cylinder`, `Stl` (`.stl(url)`), and flat `Rect`, `Circle`, `Line`, `Polygon`, `Arrow`, `Text`.

### 5. Settings and actions (both headers)

```cpp
float kp = 0.4f;
bool motors = false;
std::string mode = "auto";                    // microcontroller: char mode[16]
Teleplot::Pose2D cmdVel;                      // x, y, yaw

tp.param("kp", &kp).range(0, 10).step(0.01).desc("Proportional gain");
tp.param("motors", &motors);
tp.param("mode", &mode).enumValues({"auto", "manual#by hand"});  // the texts it can take (#: a caption); microcontroller: an array of const char*
tp.param("cmd_vel", &cmdVel).axes(Teleplot::X | Teleplot::Yaw).rate(20).hold(200)   // a joystick
  .onChange([&](Teleplot::Pose2D const&) {              // called before applying: refuse, nothing changes (micro: no capture, globals)
      return mode == "manual" ? Teleplot::ok() : Teleplot::error("manual mode only");
  });

tp.action("goto", [](Teleplot::Args const& args) {
        Teleplot::Number2D target = args.xy("target");
        double speed = args.number("speed", 0.3);         // a default when the page did not send it
        return driveTo(target, speed) ? Teleplot::ok("arrived") : Teleplot::error("blocked");
    })
    .title("Go to").confirm()           // (the handler runs in poll(), on the thread that calls it)
    .arg(Teleplot::Arg("target", Teleplot::Arg::XY))
    .arg(Teleplot::Arg("speed").optional().defaultValue(0.3).range(0.1, 1).unit("m/s"));

for (;;) {
    tp.poll();          // reads what the page wrote, applies, answers, publishes the settings
    controller.kp = kp;
}
```

Argument types: `Teleplot::Arg::Number` (default), `Arg::Bool`, `Arg::Text`, `Arg::XY`, `Arg::XYZ`, `Arg::Pose2D` (in `Arg`: `Teleplot::Text`
is a shape and `Teleplot::Pose2D` a type). Reading them: `args.has(name)`,
`args.number(name, fallback)`, `args.flag(name, fallback)`, `args.text(name, fallback)`, `args.xy(name)`, `args.xyz(name)`,
`args.pose2d(name)`.

A call that takes long (full header): the handler returns `Teleplot::running()` and keeps `args.call()`; later
`tp.answer(call, Teleplot::ok())`. The page shows it running until then.

### 6. Threads and real time (full header)

```cpp
Teleplot tp(Teleplot::Options().udp("192.168.1.10", 47269).name("robot").sendFrom(Teleplot::Thread));

// 1 kHz control loop: never waits, never makes a system call
auto current = tp.telemetry("motor.current").unit("A").nonBlocking();   // or Options().nonBlocking(): every telemetry,
                                                                        // and .nonBlocking(false) for the ones that must not lose a sample
void controlLoop() { current.update(readCurrent()); }

// Any other thread
void planner() { tp.update("plan.cost", cost); tp.log("events", "replanned"); }
```

How the lock avoids trouble:

- **No deadlock**: user code (handlers, `onChange`) is never called with the lock held, so it can call anything of `tp`; there is
  one lock, never held across a call that takes another one.
- **Short**: the lock covers copying a sample into its queue (tens of ns), or taking a packet out of the queues; sending
  (`sendto`) happens after it is released.
- **Priority inversion**: on Linux and macOS the lock is a `pthread_mutex` with `PTHREAD_PRIO_INHERIT` (a low priority thread holding
  it is raised to the priority of the one waiting; Windows has no such lock: a plain one there); a telemetry marked `.nonBlocking()` uses `try_lock` and, when the lock is taken,
  drops that sample and counts it in `stats()` instead of waiting.
- **No system call in the loop**: `sendFrom(Teleplot::Thread)` sends from an inner thread every `flushInterval`; the default
  (`Teleplot::Caller`) sends from the thread that calls `update()` when it is time, which is simpler and right for most programs.
- `#define TELEPLOT_SINGLE_THREAD` removes it (a program that uses `tp` from one thread only).

### 7. Several destinations at once

```cpp
// Full header: each packet goes to every output
Teleplot tp(Teleplot::Options()
    .udp("127.0.0.1", 47269)                 // the Teleplot server (the default when no output is given)
    .file("run-2026-10-24.teleplot")         // a binary data file: the webapp opens it (Export and import panel)
    .output([](const std::byte* data, size_t size) { /* serial, socket, ring buffer... */ }));

// Microcontroller: each line goes to every Print
Teleplot tp(Serial);
tp.addOutput(sdFile);                        // a .teleplot.txt file on an SD card
tp.clock(rtcMillis);                         // a date (ms since 1970: RTC, NTP) for a file read later; see "The clock of a microcontroller"
```

What comes back (settings, calls) is read from the UDP sockets (full) or the `Stream` given to the constructor (micro), and from
`handlePacket` / `handleLine`. A file gets what the server gets, timestamps included (full header: the ns of each sample).

### 8. A microcontroller (microcontroller header)

```cpp
#include <Teleplot.h>
Teleplot tp(Serial);                       // or Teleplot tp(udp, "192.168.1.10", 47269) with a WiFiUDP (ESP32)

float speed = 0.2;
Teleplot::Result blink(Teleplot::Args const& args) { /* ... */ return Teleplot::ok(); }

void setup() {
    Serial.begin(115200);
    tp.telemetry("temperature").unit("°C").range(0, 50);
    tp.param("speed", &speed).range(0, 1).step(0.05);
    tp.action("blink", blink).arg(Teleplot::Arg("times").optional().defaultValue(3));
}

void loop() {
    tp.update("temperature", analogRead(A0) * 0.1);      // >temperature:52341.207:23.4 (time since boot, in ms)
    tp.poll();                                           // reads the lines the page sent on Serial
}
```

What differs from the full header (it compiles the same code as long as it avoids these; explained for users in [`clients/arduino/Teleplot/README.md`](../clients/arduino/Teleplot/README.md)):

| | Full header | Microcontroller header |
| --- | --- | --- |
| Protocol | binary, UDP or `send` function | text lines on a `Print` (Serial lines start with `>`) |
| Time without one given | now (`system_clock`) | the time since boot (`micros()`): dated on arrival by the page (option "Times since boot" of the source, on by default), else shown in 1970 |
| Sending | packed, every `flushInterval` or when a packet is full | each call writes its line at once |
| Descriptions | sent before the samples of their packet | written before the next line of that telemetry (one `ATTR|` line for all of them) |
| Callbacks | lambdas with captures (`std::function`) | functions and lambdas without captures |
| Texts and lists | `std::string`, `std::vector` overloads too | `const char*`, Arduino `String`, pointer + count |
| Strings given to descriptions | copied | kept as pointers: literals, or strings that live as long (`F("...")` is not taken) |
| Lists (`enumValues`, `edges`) | `{"auto", "manual"}` (or a static array) | a static array: `static const char* const MODES[] = {"auto", "manual"};` |
| Text settings | `std::string` | `char[N]` |
| How many | no limit | `TELEPLOT_MAX_TELEMETRIES` (16; 4 on AVR), `_PARAMS` (8; 2), `_ACTIONS` (4; 1), `_ARGS` (4; 2), `_THRESHOLDS` (8; 2), `_STACKS` (4; 1). About 5 KB of RAM with the defaults, about 0.6 KB on AVR |
| Sent again every 5 s | descriptions and every sample sent once | descriptions, shape type and frame; with `TELEPLOT_RESEND` (not on AVR): position, orientation, size, color of a shape, camera, thresholds. Not: opacity, texture, vector, text, line width, points |
| Threads (a `Stack` path per thread), `running()` / `answer()`, `stats()` details, `Options` | yes | no (`nonBlocking()`, `oneThread()` are accepted and do nothing) |
| Images | `image()` | `image()` too (base64, in parts: ESP32-CAM) |
| Numbers | float32, `precise()`: float64 | 9 significant digits (a float32 exactly), `precise()`: 15; on AVR `double` is a float32 anyway |
| `timeout()` | yes | accepted, does nothing (the text protocol has no data timeout) |
| A Rgb color of a shape | its own section | written `#rrggbb`: the same color, stored as text |
| Outputs | `Options().udp()`, `.file()`, `.output()` | `addOutput(Print&)` |

### 9. Pictures (full header, with `TeleplotImage.h`)

```cpp
#include "Teleplot.h"
#include "TeleplotImage.h"

TeleplotImage::Pixels frame{ mat.data, mat.cols, mat.rows, TeleplotImage::BGR8, mat.step };  // a view: nothing is copied
tp.telemetry("camera").image(TeleplotImage::encode(frame));                 // JPEG, quality 80, encoded in the call
tp.telemetry("camera").image(TeleplotImage::encode(frame, TeleplotImage::Jpeg{ 60 }));
TeleplotImage::send(tp.telemetry("camera"), frame);                         // encoded on a thread: the call only copies
TeleplotImage::send(tp.telemetry("depth"), depth, TeleplotImage::Png{});    // Gray16: lossless, 16 bits
tp.telemetry("depth").unit("m").depthMap(0.001);                             // its numbers are millimetres, 0 is no measure
TeleplotImage::send(tp.telemetry("depth"), depth, TeleplotImage::Raw{});    // Gray16 or Float32 as they are: no encoding at all
TeleplotImage::send(tp.telemetry("camera"), TeleplotImage::shrink(frame, 2)); // half the width and height
tp.telemetry("map").image(TeleplotImage::load("floor-plan.png"));           // a file, as it is
```

See "Pictures" below.

## Pictures (`TeleplotImage.h`)

A companion of the full header for the pixels a program has (a camera, OpenCV, ROS, a depth sensor): `image()` takes JPEG or PNG
bytes, this makes them. Nothing more: no decoding (the page does it), no processing (drawings over a picture are shapes in its
pixels, `pixelsOf()`), no undistortion (pictures are never modified). C++17, no dependency, no Arduino version.

| | |
| --- | --- |
| `Pixels{data, width, height, format, stride}` | a view of pixels (stride: bytes from a row to the next, 0: packed) |
| Formats | `Gray8`, `Gray16` (machine byte order: a depth image), `Float32` (machine byte order: a depth map in metres, ROS 32FC1; `Raw` only), `RGB8`, `BGR8` (OpenCV), `RGBA8`, `BGRA8`, `YUYV` (webcams, BT.601) |
| `encode(pixels[, Jpeg{quality}])` → `Picture` | JPEG baseline 4:2:0 (gray: one channel), quality 80 by default; alpha is dropped; `Gray16` is refused |
| `encode(pixels, Png{})` → `Picture` | the pixels exactly; `Gray16` stays 16 bits, RGBA keeps its alpha; `Float32` is refused |
| `encode(pixels, Raw{})` → `Picture` | `Gray16` or `Float32` as they are, little-endian, after a header of 8 bytes (`IMAGE_TYPE_RAW`, [`doc/depth.md`](depth.md)): nothing to compute, 4/3 bigger in base64 than in bytes |
| `Picture{type, bytes, error}` | what `image(picture)` sends; empty bytes: it failed, `error` says why (nothing is sent) |
| `load(path)` → `Picture` | a .jpg / .png file as it is (recognized by its first bytes, not by its name) |
| `typeOf(bytes, size)` | `Jpeg`, `Png`, or nothing |
| `shrink(pixels, factor)` → `Image` | smaller by a whole factor, each pixel the average of a square (the camera's intrinsics stay right: the protocol takes any size of the same proportions); `YUYV` gives `RGB8`; not `Float32` (an empty `Image`) |
| `copy(pixels)` → `Image` | pixels it holds (an `Image` is also a `Pixels`) |
| `send(telemetry, pixels[, time][, Jpeg{} \| Png{} \| Raw{}])` | encoded on the encoding thread of the Teleplot, then sent; dated when asked (or at `time`); the pixels are copied first (an `Image&&` is taken without copy) |
| `stats(tp)` | `encoded`, `replaced`, `failed`, `priorityRefused` |

The encoding thread (one per Teleplot, started by the first `send()`, kept by `Teleplot::extension()` and stopped first when the
Teleplot goes): a slot per telemetry. The picture being encoded always finishes and is sent; of the pictures asked meanwhile for the
same telemetry only the latest waits (the others are counted as replaced); telemetries take turns. Its priority follows
`threadPriority()`: `BelowCaller` gives it, for each picture, the priority of the thread that called `send()` one step under, and
that thread's CPUs. With `TELEPLOT_SINGLE_THREAD`, `send()` encodes in the call.

Measured (Apple M-series, -O2): 640 x 480 BGR8, JPEG q80 4 ms, PNG 14 ms. JPEGs are checked against libjpeg (same quality of
pixels, same size within 10 %), PNGs decoded and compared pixel by pixel ([`clients/cpp/tests/image.test.js`](../clients/cpp/tests/image.test.js)).

## Threads of Teleplot

The full header starts threads only when asked: the sending thread (`sendFrom(Thread)`) and the encoding thread of `TeleplotImage.h`.
Their priority and their CPUs: `Options().threadPriority(...)` and `.threadAffinity(...)`, changed at run time with
`tp.threadPriority(...)` and `tp.threadAffinity(...)`.

```cpp
Teleplot tp(Teleplot::Options().sendFrom(Teleplot::Thread)
    .threadPriority(Teleplot::ThreadPriority::realtime(20))      // SCHED_FIFO 20
    .threadAffinity(Teleplot::ThreadAffinity::cpus({ 3 })));      // on CPU 3 only
tp.threadPriority(Teleplot::Low);                                 // later: under normal threads
```

| Priority | Linux | macOS | Windows |
| --- | --- | --- | --- |
| `BelowCaller` (default) | the caller's policy; real-time: priority - 1; otherwise nice + 1 | the caller's QoS class, relative priority - 1 | the caller's level - 1 |
| `Normal` | `SCHED_OTHER`, the process's nice | QoS default | normal |
| `Low` | `SCHED_OTHER`, nice + 10 | QoS utility | lowest |
| `ThreadPriority::realtime(p[, roundRobin])` | `SCHED_FIFO` (or `SCHED_RR`) priority p, 1 to 99 | `SCHED_FIFO` (or `SCHED_RR`) priority p, its own range | refused |
| `ThreadPriority::value(v)` | nice v (-20 to 19) | relative priority v in QoS default (-15 to 0) | level v (`THREAD_PRIORITY_*`, -15 to 15) |

| Affinity | Linux | macOS | Windows |
| --- | --- | --- | --- |
| `ThreadAffinity::automatic()` (default) | the caller's CPUs with `BelowCaller`, any otherwise | (nothing to set) | the same |
| `followCaller()` | the caller's CPU set | (nothing to set) | the caller's group affinity |
| `any()` | the CPUs of the process | (nothing to set) | the CPUs of the process |
| `cpus({2, 3})` | these CPUs | refused (macOS has no affinity) | these CPUs of the current group (0 to 63) |

Values are given to the system as they are: Teleplot does not translate them. The caller: for the sending thread, the thread that set
the options (or the priority, or the affinity); for the encoding thread, the thread that called `send()`, picture by picture.
Under a real-time caller, `BelowCaller` makes a real-time thread, which delays every normal thread on its CPUs: choose `Normal`,
`Low` or a value to avoid it. When the system refuses (no right to that priority, a CPU that is not there), the thread keeps what it
had for that part and `stats().priorityRefused` (`TeleplotImage::stats()` for the encoding thread) counts it.
`Teleplot::Scheduling` (`ofCurrentThread()`, `applyToCurrentThread(priority, affinity)`) is what does it, for companion headers.

## The clock of a microcontroller

A board has no date, but it has a clock that counts from its boot. The microcontroller header dates samples with `micros()` made 64
bits (it counts the wrap-arounds of the 32-bit counter, every 71 min, at each call), written in ms with three decimals:
`>speed:52341.207:0.5`. The protocol does not change: these times are ms since 1970 for the protocol, so as sent they are displayed
at the start of 1970 plus the time since boot, with the spacing the board measured; the page dates them on arrival instead when the
option below is on. `tp.clock(fn)` gives a real date (RTC, NTP).

Decided (a change of the lib, not of the C++ headers): **"Times since boot"**, an option per source (Sources panel), on by default.
A source whose times are before 1973 (under 1e11 ms) is dated by the page from when they arrive:

- Per source (a serial port, a UDP sender), offset = the smallest "received - sent" seen, let go up by 100 ppm for drift, as
  `ConnectionTeleplotServer.__serverClockOffset` does for the server. A sample that arrives late (a picture dated at its exposure, a
  burst after WiFi came back) only gives a bigger difference, which the minimum ignores: telemetries sent out of time order are dated
  right, whatever their order.
- Reboot (a board restarts near 0; while debugging over serial, many times a minute, which must just work): a telemetry whose time
  goes back below its own previous time (a device sends the samples of one telemetry in order), or a time more than 10 s before the
  latest time of the source (a telemetry seen for the first time after the restart). The offset is measured again from that sample.
  Telemetries out of order with each other (a picture that arrives after faster numbers) change nothing: each one stays in order. A
  burst after an outage is not backwards either (its times are after the latest seen). Reboots are never counted nor limited.
- Several clocks on one source (a gateway forwarding several boards, a sensor with its own clock) is told by what a reboot never
  does: a time more than 10 s ahead of what the clock of the source can have reached (its latest time + the time elapsed since it
  arrived). Twice: the option turns itself off for that source, times are kept as sent, and the Sources panel says why (the user can
  turn it on again). Clocks less than 10 s apart cannot be told from latency: one source should have one clock (a gateway sends
  times of its own clock, or none).
- Times of 1973 or later from the same source (a board that got its date from NTP) are kept as sent. Files are not shifted (no
  reception time). Stored times are the dates, not what the device sent; turning the option off applies to what comes next.

## Order of calls

- **In one chain** (`a.f(x).g(y)`) the calls always run left to right, in both headers. C++17 also evaluates the arguments in that
  order; in C++11 / 14 the arguments of `g` may be evaluated before `f` runs. It only matters for arguments with side effects
  (`body.position(readX()).yaw(readYaw())`): read them into variables first.
- **One chain, one time**: sample calls (`update`, `position`, `yaw`, `image`...) return a `Teleplot::Samples`, a small value that
  carries the time of its chain: the first sample call takes "now" (`tp.clock()`: `system_clock` on a computer, `micros()` on a
  microcontroller, unless replaced), the next ones of the chain reuse it, so a position and a yaw sent together are never a few nanoseconds apart.
  `at(time)` is only needed for a time of your own; it starts a chain with that time. A handle kept in a variable (`body`) carries no
  time: each new chain takes a new "now".
- **The compiler checks one thing**: `at()` in the middle of a chain (`body.position(x, y).at(t)`) would give two times to one chain,
  so it does not compile: "Teleplot: at() must be the first call of a chain: telemetry.at(t).position(...)" (a `static_assert` in an
  `at()` of `Samples`). Describing after a sample in a chain (`body.position(x, y).unit("m")`) is allowed: within a packet the
  descriptions go first anyway, so it is harmless, and refusing it would only puzzle.
- **`color()`**: on a telemetry that is not a shape yet, it is the color of the telemetry (an attribute: the chart line, the default
  color of a shape); once it is a shape (`shape()` or any shape call before, on this line or an earlier one), it is a color sample of
  the shape, which can change over time. `color("red").shape(Cube)` and `shape(Cube).color("red")` both draw a red cube; only the
  second can be changed later by a new sample.
- **Describe before the first sample**: the page decides some things when the first data of a telemetry comes (the view the Live
  dashboard gives it: a gauge needs both ends of its range, a label groups it, `autoplot(false)` keeps it out). Full header: within
  one packet the descriptions always go before the samples, so a description given right after the first `update()` still arrives
  first; one given later (after a send) only changes what is displayed from then on. Microcontroller header: a line is written when
  it is called, so describe first (in `setup()`).
- Everything else can come in any order, on any line: samples carry their time, and each kind of sample is independent.

## Reference

### `Teleplot`

| Call | What | Both |
| --- | --- | --- |
| `Teleplot()`, `Teleplot(Options)` | a client (full) | |
| `Teleplot(Print&)`, `Teleplot(Stream&)`, `Teleplot(udp, host, port)` | a client (microcontroller; a `Stream` is also read by `poll()`) | |
| `static Teleplot& instance()` | the default one: 127.0.0.1:47269, or Serial | ✓ |
| `setOptions(Options)` / `options()` | change them later | |
| `telemetry(name)` → `Telemetry` | the handle of a telemetry (created on first use; a handle stays valid; `name()` gives it back). Faster than by name in a loop | ✓ |
| `update(name, value[, time])` | a sample: number, bool, text, `Number2D`, `Number3D` | ✓ |
| `log([name,] text[, time])` | a log line (default name `log`) | ✓ |
| `stack(name, path[, time])` | what runs | ✓ |
| `dashboard(lines)` | dashboard lines (`DASH|Robot/Motion:chart:battery|w=2`, see [`dashboard-text.md`](dashboard-text.md)) | ✓ |
| `param(name, &variable)` → `Param` | a setting the page may write | ✓ |
| `action(name, handler)` → `Action` | an action the page may call | ✓ |
| `poll()` | read what came back, apply, answer, publish settings, send | ✓ |
| `flush()` | send what is queued now | ✓ |
| `answer(call, result)` | finish a call that returned `running()` | |
| `handlePacket(data, size)` / `handleLine(text)` | what came back by another way | full / micro |
| `sendStats(every)` / `statsInterval()` | the stats as telemetries every `every` (`Teleplot::ms(0)`: off, the default). Full: `teleplot.packets`, `.bytes`, `.samples` (per second) and `.queued` (bytes) labelled "teleplot sent"; `teleplot.dropped`, `.tooBig`, `.sendErrors`, `.wrongThread`, `.priorityRefused` (totals) labelled "teleplot problems"; `teleplot.images.encoded`, `.replaced` (per second), `.failed` labelled "teleplot images" with `TeleplotImage.h`. Micro: `teleplot.samples`, `.bytes`, `.tooBig`, `.dropped`, written directly (no table slot). They count themselves in what they report | ✓ |
| `stats()` → `Stats` | `packets`, `bytes`, `samples`; `dropped` (queue full, lock busy), `tooBig` (cut texts), `sendErrors`, `wrongThread` | ✓ (fewer fields) |
| `enable()` / `disable()`, `#define TELEPLOT_DISABLE` | off at run time / compiled out | ✓ |
| `static ok([text])`, `error(why)`, `running()` → `Result` | answers | ✓ (`running` full) |
| `static now()`, `ms(x)`, `us(x)`, `ns(x)` → `Time` | times; `now()` is the default clock: `system_clock` (full), `micros()` since boot (micro) | ✓ |
| `static deg(degrees)` → radians | angles | ✓ |
| `threadPriority(p)` / `threadAffinity(a)` (and their getters) | the priority and the CPUs of the threads of Teleplot (full) | |
| `currentTime()` | now, on the clock of this Teleplot (full) | |
| `extension<T>()` | the state of a companion header, kept by the Teleplot (full) | |
| `clock(fn)` | where "now" comes from: full header default `system_clock` (a simulation or ROS time can replace it), microcontroller default the time since boot | ✓ |
| `addOutput(Print&)` | another destination (micro) | micro |
| `Stack(tp, name, level)` | a level of a stack while it lives | ✓ |
| `static threadName(name)` | the name of the calling thread, for the telemetries of its stacks | |

### `Teleplot::Options` (full header)

Outputs, as many as wanted: `udp(host, port)` (none given: `udp("127.0.0.1", 47269)`), `file(path)` (binary data file, see
[`files.md`](files.md)), `output(function<void(const std::byte*, size_t)>)`. Then `name("")` (client name; empty: the name of the program), `clientId(0)` (0: from the name),
`flushInterval(ms 20)` (0: only on `flush()` / `poll()`), `sendFrom(Caller | Thread)`, `describeInterval(ms 5000)`,
`publishInterval(ms 200)` (settings), `maxQueuedBytes(1 MB)` (beyond: the oldest samples go first, counted),
`nonBlocking(false)` (the default of every telemetry), `threadPriority(...)` and `threadAffinity(...)` (see "Threads of Teleplot").

### `Teleplot::Telemetry` (all chainable; a time of your own: `at(time)` first)

| Group | Calls |
| --- | --- |
| Describe | `unit(text)`, `color(text)`, `label(text)` (a path places it: `Robot/Motion`), `desc(text)`, `range(min, max)`, `min(v)`, `max(v)`, `autoplot(bool)`, `timeout(Time)`, `log()`, `stack()`, `frame(name)`, `pixelsOf(name)`, `depthMap(scale[, noData])` / `pixelValues(scale[, noData])` (pictures of numbers: a pixel is worth number x scale; `noData` 0 by default, `NAN`: none; a depth map is placed in 3D views, other values are not) |
| Sending | `maxRate(hz)` (0: all), `precise()` (float64), `nonBlocking([bool])` (full; default from `Options`) |
| Limits | `threshold(name, Below \| Above, value[, color])`, `removeThreshold(name)` (samples: from their time on) |
| Structure | `enumValues(list)` (states, nodes: paths, `#kind`; the choices of a setting), `edges(list)` (`from>to=event`): samples from their time on, [`graph.md`](graph.md) |
| Samples | `update(value)` (number, bool, text, `Number2D`, `Number3D`) |
| Shape | `shape(type)`, `stl(url)`, `position(x, y[, z])`, `rotation(roll, pitch, yaw)`, `yaw(a)`, `quaternion(w, x, y, z)`, `size(x, y[, z])`, `size(s)`, `color(text)` / `color(Rgb)` (a sample; `color` before any shape call is the attribute), `opacity(0..1)`, `texture(url)`, `textureFrom(imageTelemetry)`, `vector(x, y[, z])`, `text(text)`, `textSize(h)`, `lineWidth(w)`, `points(pts, n)` |
| Cloud | `cloud(pts, n)`, `cloud(pts, n, intensities)`, `cloud(pts, n, colors)`, `cloud(pts, n, intensities, colors)` |
| Camera | `image(Jpeg \| Png \| Raw, bytes, size)`, `image(picture)` (anything with `.type` and `.bytes`: `TeleplotImage::Picture`), `intrinsics(width, height, fx, fy, cx, cy)`, `distortion(k1, k2, p1, p2, k3)` |
| Time | `at(time)` → `Samples` whose samples all get that time (first in a chain only; without it, the chain shares one "now") |
| Threads | `oneThread()` (a stack used from one thread only, the first that uses it: no thread names) |

Angles in radians. Frame of the scene: x forward, y left, z up.

### `Teleplot::Param<T>` (chainable; what `param()` returns)

`range(min, max)`, `min(v)`, `max(v)`, `step(s)`, `unit(text)`, `desc(text)`, `enumValues(list)` (its enum: the texts it can take, `#caption`), `rate(hz)`, `hold(ms)` (an int or a `std::chrono` duration),
`axes(X | Y | Yaw)`, `onChange(fn(value const&) → Result)`. Variable types: `float`, `double`, integers, `bool`, `std::string` (micro:
`char[N]`), `Number2D` (xy), `Number3D` (xyz), `Pose2D` (pose2d). A written number is clamped to the range and rounded to the step;
a text outside the choices is refused.

### `Teleplot::Action`, `Teleplot::Arg`, `Teleplot::Args`

- `Action`: `title(text)`, `desc(text)`, `color(text)`, `confirm()`, `longpress()`, `arg(Arg)`.
- `Arg(name[, Arg::Type])`: `optional()`, `defaultValue(v)`, `range(min, max)`, `step(s)`, `unit(text)`, `enumValues(list)`, `desc(text)`.
- `Args`: `has`, `number`, `flag`, `text`, `xy`, `xyz`, `pose2d`, `call()` (full).

### Types

`Number2D {x, y}`, `Number3D {x, y, z}`, `Pose2D {x, y, yaw}` (doubles; sent as float32 unless `precise()`), `Rgb {r, g, b}` (0 to 255), `Time`, `Result`, `Stats`, `Telemetry`
(describe, samples, `at`), `Samples` (what a sample call and `at()` return: the same calls with the time of its chain, no `at`).

## Decisions

- `tp.telemetry("x")` for the handle; `color()` as described in "Order of calls"; no client name = the name of the program;
  `flushInterval` 20 ms.
- C++17 (full header), C++11 (microcontroller header, same API); Linux, macOS and Windows (Winsock); a lock that never calls user code
  nor sends while held, priority inheritance on POSIX, `nonBlocking` per telemetry or for all (`TELEPLOT_SINGLE_THREAD` removes it);
  `maxRate` per telemetry; `precise()` = float64 (section 36); `Teleplot::deg()`.
- Stacks: `Teleplot::Stack` levels; the main thread keeps the name, other threads get `.thread` added, `oneThread()` opts out.
- Time: one chain, one time; `at()` only first in a chain (checked by the compiler), describing after a sample is allowed.
- Several outputs (UDP, file, function; micro: several `Print`).
- Microcontroller clock: `micros()` since boot, no protocol change; the page dates it on arrival (per-source option, on by default:
  [`sources.md`](sources.md) "Times since boot").

## Samples sent once

Descriptions are sent again every 5 s (`describeInterval`); so is the latest sample of what is usually sent once, when nothing newer of
it was sent in that time: the shape sections (position, orientation, size, color, opacity, texture, vector, text, line width), camera
intrinsics and distortion, each threshold (by name), the points of a line or polygon, a structure (`enumValues`, `edges`: all its parts). It keeps its own time, so a page opened later
draws the scene as it is, and a page that already has it keeps it once: `addData` drops a repeat of its latest sample (same time, same
values). Streams (numbers, texts, pictures, clouds) are not sent again.

---

[All documentation](README.md) · [Teleplot](../README.md)
