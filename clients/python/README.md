# Teleplot for Python

[`teleplot.py`](teleplot.py): one file, Python 3.9+, standard library only. Telemetry, pictures, and the settings and actions the
page can use, with the API of the C++ client: the same calls, the same names ([doc/python-client-api.md](../../doc/python-client-api.md)).

```python
from teleplot import Teleplot

tp = Teleplot.instance()                                   # 127.0.0.1:47269, the Teleplot server; sent every 20 ms
tp.telemetry("battery").unit("V").range(10.5, 12.6)        # described once
tp.update("battery", 12.4)
tp.telemetry("robot").shape(Teleplot.Cube).size(0.4, 0.3, 0.2)
tp.telemetry("robot").position(x, y).yaw(theta)            # one chain, one time

kp = tp.param("kp", 0.4).range(0, 10).step(0.01)           # a setting the page can change (kp.value)

@tp.action("reset").title("Reset")                         # a button
def reset(args):
    odometry.reset()

while True:
    tp.poll()                                              # what the page wrote, applied and answered
```

Install: copy `teleplot.py` next to your program (a package to install is a later topic). To run the examples from this folder:
`PYTHONPATH=. python3 examples/01_first_value.py`.

## Examples, one step at a time

| | |
| --- | --- |
| `01_first_value` | a value, charted as it comes |
| `02_describe` | a unit, a range (a gauge), a description, a limit |
| `03_together` | values with the same label share a chart |
| `04_logs` | lines to read one after the other |
| `05_what_runs` | what runs, function by function, on a timeline (`with Teleplot.Stack`, or as a decorator) |
| `06_moving_shape` | a shape described once, then moved |
| `07_settings` | a value the page can change |
| `08_buttons` | a button in the page, with an argument |
| `09_states` | a text whose latest value matters |
| `10_map_position` | a position on a map, with more digits |
| `11_scene_3d` | 3D shapes, one placed on the other |
| `12_drawings` | a path, an arrow, a text on a map |
| `13_lidar` | a point cloud |
| `14_picture` | pixels encoded on a thread, then sent |
| `15_joystick` | a joystick that stops by itself |
| `16_setting_rules` | choices, refusing a value, a setting bound to an attribute |
| `17_time_and_rate` | the time a value was measured, fewer samples of a fast value |
| `18_threads` | a sending thread, a loop that never waits, a lane per thread |
| `19_file` | recording to a file the page opens |
| `20_dashboard` | choosing where values go |
| `21_stats` | how the client is doing, in the page |
| `22_text_protocol` | the same as text lines (a terminal, a pipe) |

## What to know

- **The names are the ones of C++** (`maxRate`, `sendStats`...), not the `snake_case` of PEP 8: code goes from one language to the
  other without a dictionary. `Teleplot::X` in C++ is `Teleplot.X` here, `TeleplotImage::X` is `TeleplotImage.X`.
- **Times**: a `Teleplot.Time` (`Teleplot.ms(20)`), seconds since 1970 (`time.time()`), or a `datetime`. Intervals: a
  `Teleplot.Time`, a `timedelta` or seconds; `hold` is in milliseconds and rates in Hz, as in C++.
- **A setting** holds its value (`kp.value`), or is bound to an attribute or a dict key: `tp.param("ki", controller, "ki")`.
- **A handler gets `Args`** (`args.number("speed", 0.3)`, `args.xy("target")`) and returns `Teleplot.ok()`, `Teleplot.error("why")`
  (an exception is an error too), `Teleplot.running()`, or nothing (ok).
- **Pictures**: PNG and `Raw` with nothing installed; JPEG needs Pillow or OpenCV (`encode()` says so otherwise); `shrink()` needs
  NumPy. NumPy arrays are taken as pixels, and make the conversions and the PNG filters fast.
- **Threads**: one lock, never held while your code runs; `sendFrom=Teleplot.Thread` sends from a thread of its own; `nonBlocking()`
  never waits. Thread priority and CPUs are set on Linux only (Python cannot set them elsewhere without native code: what is asked is
  refused and counted, the default does nothing).
- **The end**: `Teleplot.instance()` sends what is queued when the program exits; another client does on `close()`, or at the end
  of `with Teleplot(...) as tp:`.
- **Speed**: about the cost of Python itself per sample; for heavy loads (many telemetries at kHz), the C++ client.

## Tests

`./test.sh` (Python 3.9+, a C++17 compiler, Node): the client alone (`tests/test_teleplot.py`, commands through a real UDP socket),
then what it sends read back by the library of the page: the same telemetries as the C++ client and the Arduino library for the same
scenario (`tests/parity.py`), its PNGs pixel by pixel as the C++ client makes them, and every example run for about a second.
