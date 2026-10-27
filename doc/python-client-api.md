# Python client: API

**Status (2026-10-25): implemented.** [`clients/python/teleplot.py`](../clients/python/teleplot.py) (it replaced the first Python
client, which was not distributed), its examples and tests (`clients/python/test.sh`), with the API of the C++ client ([`cpp-client-api.md`](cpp-client-api.md)):
the same calls, the same names. Pure Python, no binding of the C++ client (why: one file that runs anywhere Python does, no wheels
per platform, and the speed of C++ is lost at the binding boundary anyway).

- One file, `clients/python/teleplot.py`, **Python 3.9+**, standard library only.
- Optional: NumPy (pictures from arrays, `shrink`, faster PNG), Pillow or OpenCV (JPEG). Used when installed, never required.
- Binary protocol over UDP by default, like the C++ client; the text protocol as an option.

## Choices behind it

- **The same API as C++, with the same names, in the same places.** `from teleplot import Teleplot, TeleplotImage`, and what is
  `Teleplot::X` in C++ is `Teleplot.X` in Python: `Teleplot::Cube` → `Teleplot.Cube`, `Teleplot::ms(1000)` → `Teleplot.ms(1000)`,
  `Teleplot::Stack` → `Teleplot.Stack`, `TeleplotImage::encode` → `TeleplotImage.encode`. Not the `snake_case` of PEP 8: OpenCV
  (`isOpened`, `imencode`) and Qt keep their C++ names in Python too, which is what roboticists already use; linters check the names a
  file defines, not the ones it calls, so users' code is not flagged.
- **One way to do each thing, the C++ way**: chained calls (`tp.telemetry("battery").unit("V").range(10.5, 12.6)`), no keyword
  duplicates. Keyword arguments only where C++ has a builder: the options of `Teleplot(...)` (C++ `Teleplot::Options`).
- **A setting holds its value** (`kp.value`), **or is bound** to an attribute of an object or a key of a dict: the closest Python has to
  the pointer of C++ (`tp.param("ki", controller, "ki")` for `tp.param("ki", &controller.ki)`).
- **A handler gets `Args`**, as in C++ (`args.number("speed", 0.3)`, `args.xy("target")`): argument names do not have to be Python
  identifiers (`"max speed"` is a valid name in the page).
- **What C++ checks when compiling, Python checks when running**: `at()` in the middle of a chain raises `TeleplotError` with the same
  message.
- **The same units as C++**: angles in radians, rates in Hz (`maxRate`, `rate`), `hold` in milliseconds (as C++ and the protocol:
  `hold=200`). Times and intervals as C++ writes them (`Teleplot.ms(20)`), or the Python way (a float of seconds, `datetime`,
  `timedelta`): see "Times".

## Samples

### 1. First number

```python
import math, time
from teleplot import Teleplot

tp = Teleplot.instance()                      # 127.0.0.1:47269, named after the program
t = 0
while True:
    tp.update("sin", math.sin(t))             # packed and sent every 20 ms
    t += 0.1
    time.sleep(0.01)
```

### 2. Describing telemetries

```python
tp.telemetry("battery").unit("V").range(10.5, 12.6).desc("Main battery").label("power") \
  .threshold("low", Teleplot.Below, 11.0, "orange")
tp.telemetry("imu.accel").unit("m/s²").maxRate(50)
tp.telemetry("gps").precise()                 # float64: no rounding to float32

tp.update("battery", 12.4)
tp.update("gps", Teleplot.Number2D(2.294481, 48.858370))   # or a tuple (x, y)
tp.update("drone", (1.0, 2.0, 0.5))           # a tuple of 3: a 3D point
tp.update("mode", "docking")                  # a text: a state
```

### 3. Logs and what runs

```python
tp.log("events", "docked at station 2")
tp.log("battery low")                         # the telemetry "log"
tp.stack("robot.task", "loop/plan/search")

with Teleplot.Stack(tp, "robot.task", "plan"):    # "loop/plan" inside the "loop" level, "loop" again after
    search()

@Teleplot.Stack(tp, "robot.task", "search")       # the same, for a whole function
def search():
    ...
```

Threads as in C++: the main thread sends to the stack as named, another thread to `robot.task.<its name>`
(`threading.current_thread().name`, or `Teleplot.threadName("control")`), all with the label of the stack; `.oneThread()` opts out.

### 4. A robot in 2D and 3D

```python
body = tp.telemetry("robot.body")
body.shape(Teleplot.Cube).size(0.4, 0.3, 0.2).color("#2ecc71").label("Robot/Map")
tp.telemetry("lidar").frame("robot.body").position(0.15, 0, 0.25)

body.position(x, y).yaw(theta)                # one chain, one time
body.at(timestamp).position(x, y).yaw(theta)  # a time of your own
body.yaw(Teleplot.deg(90))
tp.telemetry("lidar").cloud(points)           # [(x, y, z), ...] or an N x 3 NumPy array; also cloud(points, intensities, colors)
tp.telemetry("path").shape(Teleplot.Line).lineWidth(0.02).points([(0, 0), (1, 0.5), (2, 0.4)])
```

Shape types: `Cube`, `Sphere`, `Cylinder`, `Stl` (`.stl(url)`), and flat `Rect`, `Circle`, `Line`, `Polygon`, `Arrow`, `Text`.

### 5. Settings and actions

```python
kp = tp.param("kp", 0.4).range(0, 10).step(0.01).desc("Proportional gain")   # kp.value: what is applied
tp.param("ki", controller, "ki").range(0, 1)  # bound: controller.ki is published, and written when the page changes it
tp.param("speed", config, "speed")            # a key of a dict works the same
mode = tp.param("mode", "auto").enumValues(["auto", "manual#by hand"])  # the texts it can take (#: a caption)
drive = tp.param("cmd_vel", Teleplot.Pose2D(0, 0, 0)).axes(Teleplot.X | Teleplot.Yaw).rate(20).hold(200) \
    .onChange(lambda v: Teleplot.ok() if mode.value == "manual" else Teleplot.error("manual mode only"))

def goto(args):
    target = args.xy("target")
    drive_to(target, args.number("speed", 0.3))   # a default when the page did not send it
    return Teleplot.ok("arrived")                 # or Teleplot.error("why"); an exception is an error too (its text)

tp.action("goto", goto).title("Go to").confirm() \
    .arg(Teleplot.Arg("target", Teleplot.Arg.XY)) \
    .arg(Teleplot.Arg("speed").optional().defaultValue(0.3).range(0.1, 1).unit("m/s"))

@tp.action("stop").title("Stop").confirm()    # the same, as a decorator
def stop(args):
    motors.off()
    return Teleplot.ok()

while True:
    tp.poll()                                 # reads what the page wrote, applies, answers, publishes the settings
    controller.kp = kp.value
```

A bound setting is read when it is published (what the program changes itself is what the page shows) and written when the page's
value is applied, as the variable of `param(name, &variable)` in C++. A call that takes long: the handler keeps `args.call()` and
returns `Teleplot.running()`; later `tp.answer(call, Teleplot.ok())`. A handler that returns nothing answers `ok`.

### 6. Threads

```python
tp = Teleplot(sendFrom=Teleplot.Thread)       # sent by a thread of its own every 20 ms
current = tp.telemetry("motor.current").unit("A").nonBlocking()   # never waits for the lock: dropped and counted when busy
```

One lock, never held while user code runs (handlers, `onChange`, outputs) nor while sending, as in C++. Thread priority and
affinity: `threadPriority=`, `threadAffinity=` (options) or `tp.threadPriority(...)`, `tp.threadAffinity(...)`, with the values of
C++ (`Teleplot.BelowCaller`, `Teleplot.Normal`, `Teleplot.Low`, `Teleplot.ThreadPriority.realtime(p)`, `.value(v)`;
`Teleplot.ThreadAffinity.cpus([2, 3])`...), on Linux (`os.sched_setscheduler`, `os.setpriority` for the thread,
`os.sched_setaffinity`); on macOS and Windows Python has no way to set them without native code: what is asked is refused and counted (the default does nothing there), like what a
system refuses in C++.

### 7. Several destinations, the text protocol

```python
tp = Teleplot(udp=("192.168.1.10", 47269), file="run.teleplot", output=lambda packet: link.write(packet))
lines = Teleplot(protocol=Teleplot.TEXT_PROTOCOL, output=sys.stdout.buffer.write)   # text lines (a pipe, a .teleplot.txt file)
```

The text protocol says what the Arduino library says (the same lines), not: a data timeout (`timeout()` is ignored), the name of the
client (the page shows the sender's address), float64 (`precise()` writes 17 digits), an `Rgb` color sample (written `#rrggbb`). What
the page writes back is read by `poll()` in either protocol (a packet starts with 0x10, a line does not).

### 8. Pictures

```python
from teleplot import Teleplot, TeleplotImage

frame = TeleplotImage.Pixels(array, format=TeleplotImage.BGR8)    # a NumPy array (H x W, H x W x 3 or 4): its width and height
frame = TeleplotImage.Pixels(buffer, 640, 480, TeleplotImage.YUYV, 1280)   # or bytes: data, width, height, format, stride (C++ order)
tp.telemetry("camera").image(TeleplotImage.encode(frame))         # JPEG 80 (Pillow or OpenCV), in the call
TeleplotImage.send(tp.telemetry("camera"), frame)                 # encoded on a thread: the call only copies
TeleplotImage.send(tp.telemetry("depth"), depth, TeleplotImage.Raw())   # uint16 / float32 numbers as they are
tp.telemetry("depth").depthMap(0.001)                             # a pixel is worth 1 mm
tp.telemetry("map").image(TeleplotImage.load("floor-plan.png"))   # a file, as it is
TeleplotImage.send(tp.telemetry("camera"), TeleplotImage.shrink(frame, 2))   # needs NumPy
```

As `TeleplotImage.h`: formats `Gray8`, `Gray16`, `Float32`, `RGB8`, `BGR8`, `RGBA8`, `BGRA8`, `YUYV`; `encode(pixels[, Jpeg(q) |
Png() | Raw()])` → `Picture(type, bytes, error)` (empty bytes and why when it cannot: no Pillow nor OpenCV for a JPEG, `Gray16` in a
JPEG...); `load`, `typeOf`, `shrink`, `copy`, `send(telemetry, pixels[, time][, encoding])` (one encoding thread per Teleplot, a slot per
telemetry: the picture being encoded is always sent, only the latest waits), `stats(tp)`. PNG: `zlib` of the standard library (rows
filtered with NumPy when it is there, not filtered otherwise: bigger, never wrong). Pillow, OpenCV and `zlib` release the GIL while
they encode: the encoding thread really runs beside the program.

### 9. Stats in the page

```python
tp.sendStats(Teleplot.ms(1000))               # every second: teleplot.packets, .bytes, .samples, .queued, the problems
print(tp.stats())                             # Stats(packets=..., bytes=..., samples=..., dropped=..., ...)
```

## Times

A time is a `Teleplot.Time` (nanoseconds, as in C++: `Teleplot.ns(int)`, `Teleplot.us(x)`, `Teleplot.ms(x)`, `Teleplot.now()`), a
`float` of seconds since 1970 (`time.time()`: exact to about 0.2 µs only) or a `datetime`. An interval (`sendStats`, `timeout`, the
options `flushInterval`, `describeInterval`, `publishInterval`) is a `Teleplot.Time` (`Teleplot.ms(20)`, as C++ code writes it), a
`timedelta`, or a float of seconds. `hold` is milliseconds (an int, as in C++), `maxRate` and `rate` are Hz. `Teleplot.now()` is
`time.time_ns()`; `tp.clock(fn)` replaces it (simulation time, ROS time: `fn` gives one of the times above); `tp.currentTime()`.

## Values

| Python | Sent as |
| --- | --- |
| `int`, `float`, NumPy scalars | a number |
| `bool` | a number, 0 or 1 |
| `str` | a text (a state; a log with `log()`, a stack with `stack()`) |
| `Teleplot.Number2D(x, y)`, or a tuple / list of 2 numbers | a 2D point |
| `Teleplot.Number3D(x, y, z)`, or a tuple / list of 3 numbers | a 3D point |
| `Teleplot.Pose2D(x, y, yaw)` | a 3D point that is a pose (as in C++) |

`Number2D`, `Number3D`, `Pose2D`, `Rgb` are named tuples. `log([name,] text[, time])`: a second argument that is a `str` is the text
(the first is then the name), anything else is a time.

## What differs from the C++ client

| | C++ | Python |
| --- | --- | --- |
| Options | `Teleplot::Options().udp(...).name(...)` | keyword arguments, the same names: `Teleplot(udp=..., name=..., flushInterval=...)`, `tp.setOptions(...)`, `tp.options()` |
| Outputs | `output(fn(data, size))` | `output=fn(bytes)` |
| A setting | `param(name, &variable)` | `param(name, initial)` → its `.value`; or `param(name, object, attribute)` (bound) |
| Sizes | `image(type, bytes, size)`, `cloud(pts, n)`, `points(pts, n)` | `image(type, bytes)`, `cloud(points)`, `points(points)`: the length of what is given |
| `at()` mid-chain | does not compile | raises `TeleplotError` |
| Stack levels | `Teleplot::Stack level(...)` (the end of its block) | `with Teleplot.Stack(...)`, or as a decorator |
| Thread priority, affinity | Linux, macOS, Windows | Linux only (refused and counted elsewhere) |
| Protocols | binary | binary, or text (`protocol=Teleplot.TEXT_PROTOCOL`) |
| Pictures | `TeleplotImage.h`, its own encoders | `TeleplotImage` of the same file: JPEG by Pillow or OpenCV, PNG by `zlib` |
| End | the destructor sends what is queued | `tp.close()` or `with Teleplot(...) as tp:`; `Teleplot.instance()` is flushed when the program exits |
| `TELEPLOT_DISABLE` | compiled out | `tp.disable()`, or the environment variable `TELEPLOT_DISABLE=1` |
| Not in Python | `extension<T>()`, `Scheduling` (for companion headers: `TeleplotImage` is in the same file), `TELEPLOT_SINGLE_THREAD` | |
| Speed | 50 to 90 ns per sample (measured) | see "Speed" below (measured) |

## Names

The same as C++, in every case: `Teleplot::X` → `Teleplot.X`, `TeleplotImage::X` → `TeleplotImage.X`, a method `x()` → `x()`; the
options are the keyword arguments of the same names (`flushInterval=`, `sendFrom=`...). One name C++ does not have: the protocols,
`Teleplot.BINARY_PROTOCOL` (the default) and `Teleplot.TEXT_PROTOCOL` (the shape is `Teleplot.Text`).

## Reference

### `Teleplot` (class: its constants, types and static functions as in C++)

| | |
| --- | --- |
| `Teleplot(**options)`, `Teleplot.instance()` | a client; the default one |
| `Teleplot.ns(x)`, `us(x)`, `ms(x)`, `now()`, `deg(degrees)` | times, angles |
| `Teleplot.ok([text])`, `error(why)`, `running()` → `Result` | what a handler or `onChange` answers |
| `Teleplot.Number2D`, `Number3D`, `Pose2D`, `Rgb`, `Time`, `Result`, `Call`, `Stats`, `Samples`, `Telemetry`, `Param`, `Action`, `Args` | types |
| `Teleplot.Stack(tp, name, level)` | a level of a stack (`with`, or a decorator) |
| `Teleplot.threadName(name)` | the name of the calling thread, for its stacks |
| `Teleplot.Arg(name[, type])` | an argument of an action; types `Arg.Number` (default), `Arg.Bool`, `Arg.Text`, `Arg.XY`, `Arg.XYZ`, `Arg.Pose2D` |
| Constants | `Below`, `Above`; `Cube`, `Sphere`, `Cylinder`, `Rect`, `Circle`, `Line`, `Polygon`, `Arrow`, `Text`, `Stl`; `Jpeg`, `Png`, `Raw`; `X`, `Y`, `Yaw`; `Caller`, `Thread`; `BelowCaller`, `Normal`, `Low`; `BINARY_PROTOCOL`, `TEXT_PROTOCOL` |
| `Teleplot.ThreadPriority`, `Teleplot.ThreadAffinity` | as in C++ (`realtime(p[, roundRobin])`, `value(v)`; `automatic()`, `followCaller()`, `any()`, `cpus(list)`) |
| `TeleplotError` (module) | what a misuse raises |

### Options (keyword arguments of `Teleplot(...)` and `setOptions(...)`)

`udp=(host, port)` (several: a list; none given: `("127.0.0.1", 47269)`), `file=path`, `output=fn(bytes)` (several: a list),
`protocol=BINARY_PROTOCOL | TEXT_PROTOCOL`, `name=""` (empty: the name of the program), `clientId=0` (0: from the name),
`flushInterval=Teleplot.ms(20)` (0: only on `flush()` / `poll()`), `sendFrom=Caller | Thread`, `describeInterval=Teleplot.ms(5000)`,
`publishInterval=Teleplot.ms(200)`, `maxQueuedBytes=1 << 20`, `nonBlocking=False`, `threadPriority=BelowCaller`,
`threadAffinity=ThreadAffinity.automatic()`.

### `Teleplot` methods

`telemetry(name)` → `Telemetry`, `update(name, value[, time])`, `log([name,] text[, time])`, `stack(name, path[, time])`,
`dashboard(lines)`, `param(name, initial)` / `param(name, object, attribute)` → `Param`, `action(name[, handler])` → `Action`,
`answer(call, result)`, `poll()`, `flush()`, `handlePacket(bytes)` / `handleLine(text)`, `stats()` → `Stats`, `sendStats(every)`,
`statsInterval()`, `enable()`, `disable()`, `clock(fn)`, `currentTime()`, `threadPriority([p])`, `threadAffinity([a])`,
`setOptions(**options)`, `options()`, `close()` (and `with Teleplot(...) as tp:`).

### `Telemetry` (chainable; `at(time)` first)

The same calls as C++, with the same names and rules (one chain, one time; `color()` is the color of the telemetry until it is a
shape, a color sample after; describing after a sample is allowed): `unit`, `color`, `label`, `desc`, `range`, `min`, `max`,
`autoplot`, `timeout`, `log`, `stack`, `frame`, `pixelsOf`, `depthMap(scale[, noData])`, `pixelValues(scale[, noData])`, `maxRate`,
`precise`, `nonBlocking`, `oneThread`, `threshold`, `removeThreshold`, `enumValues`, `edges` (its structure, [`graph.md`](graph.md)), `update`, `shape`, `stl`, `position`, `rotation`, `yaw`,
`quaternion(w, x, y, z)`, `size`, `opacity`, `texture`, `textureFrom`, `vector`, `text`, `textSize`, `lineWidth`, `points(points)`,
`cloud(points[, intensities][, colors])`, `image(type, bytes)` / `image(picture)`, `intrinsics`, `distortion`, `at`, `name()`,
`teleplot()`. Sample calls and `at()` return `Samples` (the same calls, with the time of the chain, no `at`).

### `Param` (chainable; what `param()` returns)

`.value`, `range`, `min`, `max`, `step`, `unit`, `desc`, `enumValues(list)`, `rate(hz)`, `hold(ms)`, `axes(X | Y | Yaw)`,
`onChange(fn(value) → Result)` (called before the value is applied; `error(why)` refuses it, nothing changes; an exception refuses it
too). The type comes from the initial value (for a bound setting, the value it holds): `bool`, number (`int` stays `int`: the value
is rounded), `str`, `Number2D` (xy), `Number3D` (xyz), `Pose2D` (pose2d). A number is clamped to the range and rounded to the step; a
text outside the choices is refused.

### `Action`, `Arg`, `Args`

- `Action`: `title`, `desc`, `color`, `confirm`, `longpress`, `arg(Arg)`; callable as a decorator when `action(name)` was given no
  handler.
- `Arg(name[, type])`: `optional`, `defaultValue`, `range`, `min`, `max`, `step`, `unit`, `enumValues`, `desc`.
- `Args` (what a handler gets): `has(name)`, `number(name[, fallback])`, `flag(name[, fallback])`, `text(name[, fallback])`,
  `xy(name[, fallback])`, `xyz`, `pose2d`, `call()`.

### `TeleplotImage` (class: as the namespace of `TeleplotImage.h`)

`Pixels(data, width, height, format, stride=0)` (a NumPy array: width and height from it), `Image`, `Picture(type, bytes, error)`,
`Jpeg(quality=80)`, `Png()`, `Raw()`, formats `Gray8`, `Gray16`, `Float32`, `RGB8`, `BGR8`, `RGBA8`, `BGRA8`, `YUYV`,
`encode(pixels[, encoding])`, `load(path)`, `typeOf(bytes)`, `shrink(pixels, factor)`, `copy(pixels)`,
`send(telemetry, pixels[, time][, encoding])`, `stats(tp)` (`encoded`, `replaced`, `failed`, `priorityRefused`).

## Speed

Measured (Apple M-series, Python 3.9, packing and sending included): 3.0 µs per `tp.update(name, number)`, 2.5 µs with a handle
(`h = tp.telemetry(name)`, then `h.update(v)`), 4.7 µs for `position(x, y).yaw(a)` (two samples), 3.8 µs in the text protocol: about
300 000 samples per second for one thread, 30 to 60 times the cost of the C++ client. For heavy loads (many telemetries at kHz), the
C++ client.

## Tests

[`clients/python/test.sh`](../clients/python/test.sh) (Python 3.9+, a C++17 compiler, Node):

- [`tests/test_teleplot.py`](../clients/python/tests/test_teleplot.py): the client alone. Commands in both protocols through a real UDP socket written to
  as the server writes, refusals, bound settings, calls run once, limits, threads, stacks, times; with NumPy, `shrink` and the same
  pixels with and without it.
- [`tests/parity.py`](../clients/python/tests/parity.py): the scenario of the Arduino library's `shared.inc`, line by line; the page must get from it the
  same telemetries as from the C++ client (binary) and the Arduino library (text) (`parity.test.js`).
- [`tests/test_image.py`](../clients/python/tests/test_image.py): PNGs of the input pixels of the C++ image test, compared pixel by pixel with what the C++ test
  expects (BGR, YUYV included), a `Raw` picture byte for byte, `send()` on its thread (`image.test.js`).
- Every example, run for about a second ([`tests/run_example.py`](../clients/python/tests/run_example.py)), what it sends read back (`examples.test.js`). They are the
  examples of every language (01 to 24, the same numbers and names: [clients/README.md](../clients/README.md#examples)), then its own from
  30 (threads, an action that answers later, the text protocol, NumPy pixels: skipped when NumPy is missing).
- CI: Python 3.9 with nothing else, the latest with NumPy and Pillow.

## Decisions

- Names: the same as C++, in the same places (`Teleplot.X`, `TeleplotImage.X`) (2026-10-25).
- One way to do each thing, as in C++; no compatibility with the current Python client (not distributed).
- Handlers get `Args`; settings hold `.value` or are bound to an attribute or a dict key.
- Units as in C++ (`hold` in ms, rates in Hz), times as C++ writes them or the Python way.
- Python 3.9+ (decorators that are chains); the text protocol as `Teleplot.TEXT_PROTOCOL`.
- One file to copy; distribution (PyPI, and the packages of the other languages) is a later topic.
- The current samples are replaced by samples of the client.

---

[All documentation](README.md) · [Teleplot](../README.md)
