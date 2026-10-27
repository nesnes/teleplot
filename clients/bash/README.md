# Teleplot from Bash

No library: a line of the text protocol ([doc/textProtocol.md](../../doc/textProtocol.md)) sent over UDP to the Teleplot server
(port 47269) is enough. Bash writes to `/dev/udp/HOST/PORT` by itself (`sh` and `zsh` do not: there, `nc -u -w0 127.0.0.1 47269`).

```bash
echo "temperature:21.5" > /dev/udp/127.0.0.1/47269
```

## Examples

The ones of the other languages ([clients/README.md](../README.md#examples)) that a script can do: it sends, and does not read what
the page sends back (no settings, buttons or joystick: 16 to 19), and has no library to give a clock to or to count what it sent (21,
24). Numbers are computed by `awk` (Bash only counts in integers).

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
| `13_picture` | a picture |
| `14_camera` | a camera: lens, pose, the scene over its pictures, drawings in its pixels |
| `15_depth_map` | a depth map (raw 16-bit numbers) |
| `20_time_and_rate` | the time a value was measured, several samples in one line |
| `22_recording` | the same lines into a file (tee) |
| `23_dashboard` | choosing where values go (a dashboard) |
| `25_graphs` | a state machine and a behavior tree (`|enum`, `|edges`, stacks with results) |

- `printf` writes to `/dev/udp` in pieces of 1 KB, each a datagram: a longer line arrives broken. `12_lidar` writes its scan with
  `cat` instead.
- A line without a time is dated when the server gets it; a time is in ms since 1970 (`date +%s` gives seconds).

## Tests

[`./test.sh`](test.sh) (Bash, awk, base64, Python 3, Node): every example run for a moment, its lines read by the library of the page
(stop a running Teleplot server first: its UDP port is taken by the test).
