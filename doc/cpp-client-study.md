# C++ client: study of its API (before the missing features)

The API that came out of it is `cpp-client-api.md`; the proposals below (`describe()`, options structs...) are superseded by it.

`clients/cpp/Teleplot.h` had two lives:

- **V1** (up to `25b91ac`): text protocol over UDP. `Teleplot teleplot("127.0.0.1")`, `update(key, value, unit, maxFrequencyHz, flags)`,
  `updateAt(key, timestamp_ms, ...)`, `update2D(key, x, y)`, `update3D(ShapeTeleplot("arm", "cube").setPos(..).setRot(..))`,
  `log(text)`, `Teleplot::localhost()`, buffering per key at 30 Hz, `TELEPLOT_DISABLE`. Commands in a separate `Telecmd.h`.
- **V2** (`61c0720`, then `be8a029` and `2cc56c1`): binary protocol. `TeleplotOptions` (address, port, client name and id,
  `sendPacketFunction`), `Teleplot::instance()`, `update(name, value, timestamp, TelemetryAttributes)` that only queues,
  `flush()`, and the commands (`param`, `action`, `poll`, `handlePacket`).

Everything below was checked on the current header (Apple clang 21, `-std=c++20`), with small probes.

## What it can send today, against the protocol

| Protocol | C++ today |
| --- | --- |
| Numbers, 2D, 3D numbers, text (20 to 23) | yes (numbers rounded to float32) |
| Name, unit, color, autoplot, data timeout (attr 0 to 4) | yes |
| Shape attribute (5), STL url | the attribute only: no shape section can be sent, so a shape is a cube at 0 |
| Image (24) | **broken**: queued, then written without its type, part and bytes (a corrupt section) |
| Range (9), description (14) | only through `param()` |
| Commands (11 to 15, 41, 42) | yes |
| View label (6), log (7), frame (8), stack (10) | no |
| Shape sections (25 to 32, 37 to 39), flat shape types 3 to 8 | no |
| Camera (33, 34), point cloud (35, multi-part) | no |
| Thresholds (40), float64 (36), dashboards (2) | no |

## Bugs found while studying

1. **Endless loop**: a text longer than a packet (or attributes that do not fit, an STL url, an action with many arguments) never
   fits, so `flush()` sends empty packets forever (probe: a 2000-character text).
2. **Images are corrupt** (above), and `Image` keeps a raw pointer until the flush: the buffer of the caller may be gone by then.
3. **Image types are swapped**: `PNG = 0, JPG = 1` in the header, `JPEG = 0, PNG = 1` in the spec and in the JS parser.
4. **A refused write is applied anyway**: `onChange` is called after the value was written, and returning a text answers "refused"
   but keeps and publishes the new value (probe: refused 5, the variable is 5). The comment says the opposite. `onChange` also does not
   get the value, so it cannot judge it. Text choices are not enforced (Python refuses a text outside its choices).
5. **Telemetry ids collide**: an id is `std::hash(name)` cut to 16 bits: 7 collisions in 1000 names (probe); two telemetries then
   merge without a word. `std::hash` is also not the same between standard libraries. Same for the client id, which can also hit
   `0xFFFF` (reserved: telemetries identified by name). Without a client name, every program is client 0.
6. **Prints on every packet**: `connected` and `sent N` on `std::cout`.
7. Small ones: `remainingCapacity() - CHECKSUM_SIZE - ...` can wrap below zero (unsigned); `lastFlushTime_` unused; `Telemetry` is
   public but useless; `TelemetryAttributes` shows its inner state (`hasChanged`, `extra` as encoded bytes) to the user.

## Keep, change, drop

### Keep

- **One header, no dependency**, `#include "Teleplot.h"` and go.
- **The binary protocol**: it is the reason for V2 (compact, exact timestamps in ns, images and clouds as bytes). Packing several
  telemetries per packet already works and is fast enough: 77 ns per sample, update and flush included, 8 bytes per sample (`-O2`).
- **`Teleplot::instance()`** for the simple case, and plain objects for several destinations.
- **`TeleplotOptions`** with designated initializers, **`sendPacketFunction`** (any transport: serial, file, test) and
  **`handlePacket`** (what comes back, from any transport).
- **`TELEPLOT_DISABLE`**, `enable()` / `disable()`.
- **Commands**: `param(name, &variable, options)` (the variable is the truth, applied in `poll()`), `action(name, handler, options)`,
  `ok()` / `error()`, `poll()`. It matches what `doc/telecmd.md` asks of a device, and the Python client.
- **Timestamps in `std::chrono`**, device time, default "now".

### Change

- **Data model**: a telemetry has one type and one queue of a `std::variant`. A shape (position + size + color, each at its own
  rate), a camera (images + intrinsics + pose) or a point cloud sensor (clouds + pose) is one telemetry with several data types. So:
  per telemetry, one queue per section type, of samples **already encoded** at `update()` time (an image or a cloud already cut in
  parts). `flush()` only packs bytes; no variant; an image is copied once, when given.
- **Describe once, update often**: attributes passed to every `update()` are compared on every call and force the
  `update(name, v, std::nullopt, {...})` form. Proposed: `tp.describe("speed", { .unit = "m/s", .label = "motion", .min = 0, .max = 2 })`
  once (or whenever it changes), and `update(name, value[, time])` for samples. `update(name, v, t, attrs)` can stay as a shortcut.
- **Ids**: FNV-1a of the name (the same on every compiler and every run), on 16 bits, with a check: a name whose id is taken gets the
  next free one. Client id: FNV-1a of the name too, never `0xFFFF`; without a name, the name of the program (so that two programs do
  not merge, and a restart finds its telemetries again).
- **Sending without being asked**: V1 sent by itself at 30 Hz; V2 sends nothing until `flush()` or `poll()`, and the queues grow
  without end if nobody calls them. Proposed: `update()` sends when a packet is full or when the last send is older than
  `flushInterval` (default 20 ms, 0 = only on `flush()`), plus a cap on what is queued (`maxQueuedBytes`: the oldest samples go first,
  as the page does with its memory limit).
- **Too big for a packet**: images and clouds in parts (the protocol has them); a text or an attribute that cannot fit is cut to fit
  for a text (and counted in `stats()`), refused with a message for an attribute, never an endless loop.
- **Numbers**: float32 by default (as today, half the size); `.precise = true` on a telemetry sends float64 (section 36) for the values
  float32 would round (GPS coordinates, counters above 16 million).
- **`onChange(value)`** called before applying: a text refuses it, nothing is applied. Choices enforced.
- **Arguments of an action**: helpers to read them, `args.number("speed", 0.3)`, `args.xy("target")`, instead of `std::get`.
- **Silent by default**: no `std::cout`; errors (socket, too big) counted in `stats()`.
- **Threads**: today nothing is protected, and robot code publishes from several threads. A `std::mutex` around the queues (an
  uncontended lock is cheap next to the 77 ns of a sample, to be measured); proposed on by default, `TELEPLOT_NO_MUTEX` to drop it.

### Drop

- **`ShapeTeleplot` and its text output** (V1): replaced by a shape in binary, see below.
- **Per-call `maxFrequencyHz`** (V1): a per-telemetry `maxRate` in `describe()` does the same without a map lookup per call, if it
  is wanted at all (the page never thins, but a device that sends less is the user's choice). Proposal: keep it as `maxRate`.
- **Text flags strings** (`"t"`, `"np"`, `"xy"`): the type of the value and the attributes say it (`.log`, `.stack`,
  `.autoplot = false`).
- **`updateAt` / `update2D` / `update3D`** names: one `update()` with overloads (`Number2D`, `Number3D`), `shape()` for shapes.
- **`Telecmd.h`** (V1, already gone).
- **The public `Telemetry` struct** and the inner fields of `TelemetryAttributes`.

## Proposed API for what is missing

```cpp
Teleplot& tp = Teleplot::instance();             // 127.0.0.1:47269; tp.setOptions({ .clientName = "robot" })

tp.update("battery", 12.4);                      // numbers, Number2D, Number3D, texts
tp.describe("battery", { .unit = "V", .min = 10.5, .max = 12.6, .label = "power", .desc = "Main battery" });
tp.threshold("battery", "low", Teleplot::Below, 11.0, "orange");   // TH|battery:low<11,orange
tp.log("robot.events", "docked");                // a text with the log attribute
tp.stack("robot.task", "loop/plan/search");      // a text with the stack attribute, device time
tp.update("robot.zone", "");                     // a state with nothing: a hole

// A shape: each call queues only its own section, at its own rate
tp.shape("robot.body", Teleplot::Cube).size(0.4, 0.3, 0.2).color("#2ecc71");   // once
tp.shape("robot.body").position(x, y, 0).yaw(theta);                            // 50 times per second
tp.shape("robot.lidar").frame("robot.body").position(0.15, 0, 0.25);           // in the frame of the body
tp.shape("goal", Teleplot::Arrow).position(1, 2).vector(0.5, 0);               // flat shapes: rect, circle, line, polygon, arrow, text
tp.shape("path", Teleplot::Line).points({{0, 0}, {1, 0.5}, {2, 0.4}}).lineWidth(0.02);

tp.cloud("robot.lidar", points);                 // std::vector<Number3D> (+ intensities, + colors); cut in parts
tp.image("robot.camera", Teleplot::Jpeg, bytes, size);   // copied, cut in parts
tp.camera("robot.camera", { .width = 640, .height = 480, .fx = 520, .fy = 520, .cx = 320, .cy = 240 }, distortion);
tp.dashboard("DASH|Robot/Motion:chart:battery,speed|w=2");   // section 2, the lines of dashboard-text.md
```

The names of the properties follow the text protocol where it has them (frame, label, log, stack, min, max, desc), so a user can go
from the Help (which shows the text lines) to C++ without a dictionary.

## How it would be tested

A C++ test writes what it sends to a binary file (`FILE_MAGIC` + length + packet, as `doc/files.md`), and a test of the lib
(`packages/teleplot-js/tests`) opens it with `TELEPLOT.files.importData` and compares the store with what the C++ said it sent: the
same parser as a live connection, nothing pretended. The C++ tests also run in CI (a compiler is on every runner). The Help's C++
lines (`cpp:` of the examples in `panel-help.js`) grow with the API: today only three tiles have one.

## Questions

1. **C++17 or C++20?** It needs C++20 today (`std::endian`, designated initializers): it fails to build in C++17 (16 errors). Many
   embedded Linux toolchains and ROS 2 Humble default to C++17. Supporting C++17 costs a few lines (`std::endian`) and examples without
   designated initializers.
2. **Windows?** The header uses POSIX sockets only. Winsock behind an `#ifdef` is about 20 lines.
3. **Text protocol too?** Microcontrollers (Arduino, ESP32 on Serial) cannot take this header (`std::function`, `std::variant`,
   sockets). A separate tiny header that prints text lines would serve them; or they keep writing lines by hand as the Help shows.
4. **`maxRate`**: keep it (V1 had it) or leave throttling to the user?
5. **Mutex on by default?**
