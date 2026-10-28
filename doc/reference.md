# Reference

What every value does, for every kind of telemetry, shape, view, dashboard and client call. Written from the entries of the Help
panel's Reference tab ([`help-reference.js`](../packages/webapp/components/help-reference.js)) by `node packages/webapp/tools/reference-md.js`:
do not edit it by hand (a test of the webapp fails when they differ). The text protocol is described in [`textProtocol.md`](textProtocol.md),
the clients in [`cpp-client-api.md`](cpp-client-api.md) and [`python-client-api.md`](python-client-api.md).

Calls: C++ and Arduino (when the Arduino library differs, both are given), Python. — : that language has none (the line can be sent as text).

## Telemetries

### Number

A value over time.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| value | `name:value` | `tp.update("name", v)` | `tp.update("name", v)` |  | A sample: the same name again adds one. Values: a number with a point for decimals (25.3, -4, 1e3); true and false are 1 and 0 in the clients. |
| time | `name:time:value` | `tp.update("name", v, Teleplot::ms(t))` | `tp.update("name", v, Teleplot.ms(t))` | when it arrives | When the sample was measured. Values: milliseconds since 1970, decimals allowed; below 1e11 (1973): milliseconds since the boot of a board, dated by the page; without it, when the server received it (or the page read the serial line). |
| several samples | `name:t:v;t:v` | — | — |  | Several samples of one telemetry in one line, each with its time. Values: separated by ;. In a client: one update per sample, each with its time (they are packed together anyway). |
| unit | `name:value§unit` | `.unit("V")` | `.unit("V")` | none | Written after its values; kept: once is enough. Values: any text without , ; : \| (also ATTR\|name\|unit=V). |
| group | `name,group:value` | `.label("motors")` | `.label("motors")` | none | Telemetries of a group share a view of the Live dashboard, and views can follow a group. Values: any text after a comma (a / means nothing special); one group per telemetry. |
| not on Live | `name:value\|np` | `.autoplot(false)` | `.autoplot(False)` | shown | Not put on the Live dashboard by itself (it stays in the Telemetries panel). Values: the flag np. |
| clear first | `name:value\|clr` | — | — |  | What the telemetry held is forgotten before this sample (a new run, a new scan). Values: the flag clr. No call in the clients: send the line as text. |
| data window | — | `.timeout(Teleplot::ms(5000))` | `.timeout(Teleplot.ms(5000))` | the page's (300 s) | How long the page keeps the samples of this telemetry. Values: a duration; 0: kept until the memory limit. Binary protocol only: the text protocol and the Arduino library (accepted, does nothing) have none. |
| most per second | — | `.maxRate(50)` | `.maxRate(50)` | 0: all | The client keeps at most that many samples per second (the others are not sent). Values: samples per second. |
| exact numbers | — | `.precise()` | `.precise()` | float32 | Numbers sent as float64: no rounding. Values: on or off. The text protocol writes numbers as given (the Arduino library: 9 significant digits, 15 with precise()). |

### 2D position

A point on a map, its trail.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| 2D position | `name:x:y\|xy` | `tp.update("name", Teleplot::Number2D{x, y})` | `tp.update("name", Teleplot.Number2D(x, y))` |  | A position on a map, with the trail of where it went. Values: x forward, y to the left, in your units; a time can follow: x:y:time. |
| time | `name:time:value` | `tp.update("name", v, Teleplot::ms(t))` | `tp.update("name", v, Teleplot.ms(t))` | when it arrives | When the sample was measured. Values: milliseconds since 1970, decimals allowed; below 1e11 (1973): milliseconds since the boot of a board, dated by the page; without it, when the server received it (or the page read the serial line). |
| group | `name,group:value` | `.label("motors")` | `.label("motors")` | none | Telemetries of a group share a view of the Live dashboard, and views can follow a group. Values: any text after a comma (a / means nothing special); one group per telemetry. |
| frame | `2D\|name:F:other` | `.frame("robot")` | `.frame("robot")` | the scene | The position is relative to another telemetry, which carries it along. Values: the name of a telemetry that has a place (up to 16 levels); F: empty: back in the scene. |
| not on Live | `name:value\|np` | `.autoplot(false)` | `.autoplot(False)` | shown | Not put on the Live dashboard by itself (it stays in the Telemetries panel). Values: the flag np. |
| clear first | `name:value\|clr` | — | — |  | What the telemetry held is forgotten before this sample (a new run, a new scan). Values: the flag clr. No call in the clients: send the line as text. |

### 3D point

A point in space, its trail.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| 3D point | `name:x:y:z\|xyz` | `tp.update("name", Teleplot::Number3D{x, y, z})` | `tp.update("name", Teleplot.Number3D(x, y, z))` |  | A point in a 3D view, with its trail. Values: x forward, y to the left, z up; a time can follow: x:y:z:time. |
| time | `name:time:value` | `tp.update("name", v, Teleplot::ms(t))` | `tp.update("name", v, Teleplot.ms(t))` | when it arrives | When the sample was measured. Values: milliseconds since 1970, decimals allowed; below 1e11 (1973): milliseconds since the boot of a board, dated by the page; without it, when the server received it (or the page read the serial line). |
| group | `name,group:value` | `.label("motors")` | `.label("motors")` | none | Telemetries of a group share a view of the Live dashboard, and views can follow a group. Values: any text after a comma (a / means nothing special); one group per telemetry. |
| frame | `2D\|name:F:other` | `.frame("robot")` | `.frame("robot")` | the scene | The position is relative to another telemetry, which carries it along. Values: the name of a telemetry that has a place (up to 16 levels); F: empty: back in the scene. |
| not on Live | `name:value\|np` | `.autoplot(false)` | `.autoplot(False)` | shown | Not put on the Live dashboard by itself (it stays in the Telemetries panel). Values: the flag np. |
| clear first | `name:value\|clr` | — | — |  | What the telemetry held is forgotten before this sample (a new run, a new scan). Values: the flag clr. No call in the clients: send the line as text. |

### State

A text whose latest value matters.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| state | `name:text\|t` | `tp.update("name", "text")` | `tp.update("name", "text")` |  | A text whose latest value matters (a mode, a status); the same text again continues it. Values: any text, colons included; a first field that is a number is its time. |
| nothing | `name:\|t` | `tp.update("name", "")` | `tp.update("name", "")` |  | An empty text: no state (a hole in a timeline). |
| time | `name:time:value` | `tp.update("name", v, Teleplot::ms(t))` | `tp.update("name", v, Teleplot.ms(t))` | when it arrives | When the sample was measured. Values: milliseconds since 1970, decimals allowed; below 1e11 (1973): milliseconds since the boot of a board, dated by the page; without it, when the server received it (or the page read the serial line). |
| choices | `name:a,b#caption\|enum` | `.enumValues({"a", "b#caption"})` | `.enumValues(["a", "b#caption"])` | any text | The texts a text setting can take; #caption: words shown with a choice. Values: an enum, as for a graph. |
| group | `name,group:value` | `.label("motors")` | `.label("motors")` | none | Telemetries of a group share a view of the Live dashboard, and views can follow a group. Values: any text after a comma (a / means nothing special); one group per telemetry. |

### Log

Lines to read in order.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| log line | `name:text\|log` | `tp.log("name", "text")` | `tp.log("name", "text")` |  | A line to read with the others, an instant. Values: any text. |
| general log | `>:text` | `tp.log("text")` | `tp.log("text")` |  | A line of the log named log (on a serial port, any line that does not start with >). Values: >time:text with its time (ms). |
| a log | `name:text\|log` | `.log()` | `.log()` | a state | Makes a text telemetry a log (its default view: a log view) without sending a line. |
| time | `name:time:value` | `tp.update("name", v, Teleplot::ms(t))` | `tp.update("name", v, Teleplot.ms(t))` | when it arrives | When the sample was measured. Values: milliseconds since 1970, decimals allowed; below 1e11 (1973): milliseconds since the boot of a board, dated by the page; without it, when the server received it (or the page read the serial line). |
| group | `name,group:value` | `.label("motors")` | `.label("motors")` | none | Telemetries of a group share a view of the Live dashboard, and views can follow a group. Values: any text after a comma (a / means nothing special); one group per telemetry. |

### Stack

What runs, as a path.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| what runs | `name:a/b/c\|stack` | `tp.stack("name", "a/b/c")` | `tp.stack("name", "a/b/c")` |  | The path of what runs, outer level first: a timeline row per level. Values: levels separated by /; empty: nothing runs. |
| status | `name:path=status\|stack` | `tp.stack("name", "path=failure")` | `tp.stack("name", "path=failure")` | runs | What a path ended with; a path without status runs. Values: any word: failure, error, fail (red); timeout, warning (yellow); success, ok, done (green); others gray. |
| at once | `name:a/b,c/d\|stack` | `tp.stack("name", "a/b,c/d")` | `tp.stack("name", "a/b,c/d")` |  | Several paths at once, separated by commas. |
| parts of a tick | `name:time:path\|stack` | `tp.stack("name", "path", Teleplot::ms(t))` | `tp.stack("name", "path", Teleplot.ms(t))` |  | Lines with the same time (yours) are parts of one sample: a tick too long for one message. Values: the same time on each part. |
| a stack | `name:path\|stack` | `.stack()` | `.stack()` | a state | Makes a text telemetry a stack without sending a path. |
| a level while it lives | — | `Teleplot::Stack(tp, "name", "level")` | `with Teleplot.Stack(tp, "name", "level"):` |  | A level pushed when the object is made, popped when it ends (other threads: name.thread). Clients only: the text protocol sends the paths (stack row). |
| one thread | — | `.oneThread()` | `.oneThread()` | named per thread | A stack used from one thread only: no thread names. |

### Graph structure

States, nodes, transitions.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| states, nodes | `name:a,b/c#kind\|enum` | `.enumValues({"a", "b/c#kind"})` | `.enumValues(["a", "b/c#kind"])` |  | The structure of a graph: its states or nodes, a path each (b/c: c inside b). Also the texts a setting can take. Values: paths separated by commas; same time = parts of one; a newer time replaces it. |
| kind | `name:node#kind\|enum` | `.enumValues({"node#kind"})` | `.enumValues(["node#kind"])` | none | Free text written above a node (fallback, sequence...); for a setting, a caption of the choice. Values: after #. |
| transitions | `name:from>to=event\|edges` | `.edges({"from>to=event"})` | `.edges(["from>to=event"])` | none: a tree | The transitions of a state machine and what makes them happen; without edges, the paths make a tree. Values: from>to or from>to=event, separated by commas. |
| status | `name:path=status\|stack` | `tp.stack("name", "path=failure")` | `tp.stack("name", "path=failure")` | runs | What a path ended with; a path without status runs. Values: any word: failure, error, fail (red); timeout, warning (yellow); success, ok, done (green); others gray. |
| special characters | `%XX` | — | — |  | In names of nodes, thresholds, dashboards and in ATTR\| values, these characters are written %XX (their code in hexadecimal). Values: % , ; \| # / > = : < and line breaks, depending on where (%2C for a comma). The clients escape by themselves. |

### Picture

PNG or JPEG.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| PNG picture | `PNG\|name:base64` | `tp.telemetry("name").image(Teleplot::Png, bytes, size)` | `tp.telemetry("name").image(Teleplot.Png, data)` |  | A picture: the bytes of a .png file, in base64. An image view shows the one of the time shown. Values: base64 of the file; a time can come first (PNG\|name:time:…). |
| JPEG picture | `JPG\|name:base64` | `tp.telemetry("name").image(Teleplot::Jpeg, bytes, size)` | `tp.telemetry("name").image(Teleplot.Jpeg, data)` |  | The same with the bytes of a .jpg file. Values: base64 of the file. |
| in parts | `PNG\|name:time:i/n:part` | — | — | one message | A picture cut in parts, each in its own message: part i of n, from 1. Values: the parts of one picture share its time; any order; a lost part loses that picture. The clients cut pictures in parts by themselves. |
| time | `name:time:value` | `tp.update("name", v, Teleplot::ms(t))` | `tp.update("name", v, Teleplot.ms(t))` | when it arrives | When the sample was measured. Values: milliseconds since 1970, decimals allowed; below 1e11 (1973): milliseconds since the boot of a board, dated by the page; without it, when the server received it (or the page read the serial line). |
| group | `name,group:value` | `.label("motors")` | `.label("motors")` | none | Telemetries of a group share a view of the Live dashboard, and views can follow a group. Values: any text after a comma (a / means nothing special); one group per telemetry. |
| camera | `K:fx:fy:cx:cy:w:h` | `.intrinsics(w, h, fx, fy, cx, cy)` | `.intrinsics(w, h, fx, fy, cx, cy)` | none | On an image telemetry: the pinhole model of its camera, so 3D shapes and points are drawn over its pictures. Values: in pixels: focal lengths, principal point, size of the picture they are for (OpenCV convention). |
| a picture | — | `.image(Teleplot::Jpeg, bytes, size)  or  .image(picture)` | `.image(Teleplot.Jpeg, data)  or  .image(picture)` |  | JPEG, PNG or RAW bytes, cut in parts by the client. |

### Depth map

A picture of values.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| values picture | `RAW\|name:base64` | `tp.telemetry("name").image(Teleplot::Raw, bytes, size)` | `tp.telemetry("name").image(Teleplot.Raw, data)` |  | Plain numbers (a depth map): width and height (2 bytes each), the format (0 gray16, 1 float32), 3 bytes at 0, then the numbers, little-endian. Values: base64 of all of it; a 16-bit gray PNG works too. |
| value scale | `ATTR\|name\|scale=0.001` | `.depthMap(0.001)` | `.depthMap(0.001)` | 1 | What a number of the picture is worth: number x scale, in the unit of the telemetry. Values: a number, not 0. |
| no measure | `ATTR\|name\|nodata=0` | `.depthMap(0.001, 0)` | `.depthMap(0.001, 0)` | 0 | The number of a pixel that has no measure (NaN never is one). Values: a number; nodata= empty: every number is a measure (NAN in the clients). |
| distances | `ATTR\|name\|depth=1` | `.depthMap(s) / .pixelValues(s)` | `.depthMap(s) / .pixelValues(s)` | 1: distances | Distances along the camera's axis are placed in 3D and 2D views (when it has a camera); depth=0 for other values (a temperature). Values: 1 or 0. |
| unit | `ATTR\|name\|unit=L` | `.unit("L")` | `.unit("L")` | none | Its unit, without a sample. |
| camera | `K:fx:fy:cx:cy:w:h` | `.intrinsics(w, h, fx, fy, cx, cy)` | `.intrinsics(w, h, fx, fy, cx, cy)` | none | On an image telemetry: the pinhole model of its camera, so 3D shapes and points are drawn over its pictures. Values: in pixels: focal lengths, principal point, size of the picture they are for (OpenCV convention). |

### Point cloud

A scan: points as one sample.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| point cloud | `name:x:y:z;x:y:z\|pc` | `.cloud(points)`<br>Arduino: `.cloud(points, n)` | `.cloud(points)` |  | All the points of the line are one sample (a scan), in the frame of the sensor. Values: x:y:z per point, separated by ; (a flat scan: z = 0, shown in 2D). |
| intensity | `x:y:z:i` | `.cloud(points, intensities)`<br>Arduino: `.cloud(points, n, intensities)` | `.cloud(points, intensities)` | none | A value per point: points are colored from the lowest to the highest. Values: a 4th number per point. |
| point colors | `x:y:z:r:g:b` | `.cloud(points, colors)`<br>Arduino: `.cloud(points, n, colors)` | `.cloud(points, colors)` | of the telemetry | A color per point (x:y:z:i:r:g:b: both). Values: red, green, blue from 0 to 255. |
| time of a scan | `name:time;x:y:z…\|pc` | `.at(Teleplot::ms(t)).cloud(points)` | `.at(Teleplot.ms(t)).cloud(points)` | when it arrives | A field alone at the start: the time of the scan. Values: milliseconds. |
| position | `P:x:y[:z]` | `.position(x, y[, z])` | `.position(x, y[, z])` | 0, 0, 0 | Where its center is (the start of a line or an arrow). Values: in your units: x forward, y to the left, z up; P::2 changes y only. |
| rotation | `R:angle  or  R:roll:pitch:yaw` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | 0 | Turns it around its center (around its start for a line or an arrow). Values: radians, counterclockwise; 3D\|: around x, y, z. |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| clear first | `name:value\|clr` | — | — |  | What the telemetry held is forgotten before this sample (a new run, a new scan). Values: the flag clr. No call in the clients: send the line as text. |

## Shapes

### What applies to what

Every property, every shape.

| | Rectangle | Circle | Line | Polygon | Arrow | Text | Cube | Sphere | Cylinder | Mesh |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| position | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| rotation | ● |  | ● | ● | ● | ● | ● | ● | ● | ● |
| quaternion |  |  |  |  |  |  | ● |  | ● | ● |
| size | ● | ● |  |  |  |  | ● | ● | ● | ● |
| radius |  | ● |  |  |  |  |  | ● | ● |  |
| points |  |  | ● | ● |  |  |  |  |  |  |
| vector |  |  |  |  | ● |  |  |  |  |  |
| line width | ● | ● | ● | ● | ● |  |  |  |  |  |
| text |  |  |  |  |  | ● |  |  |  |  |
| text size |  |  |  |  |  | ● |  |  |  |  |
| color | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| opacity | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| picture on it | ● |  |  |  |  |  | ● | ● | ● |  |
| file |  |  |  |  |  |  |  |  |  | ● |
| frame | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| in the pixels of | ● | ● | ● | ● | ● | ● |  |  |  |  |

### Rectangle

2D, the default of 2D| lines.

```
2D|robot,field:S:rect:P:1.2:0.8:R:0.5:SC:0.3:0.2:C:blue
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| kind | `S:kind` | `.shape(Teleplot::Rect)` | `.shape(Teleplot.Rect)` | rect in 2D\|, cube in 3D\| | What the shape is. Values: rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl. |
| position | `P:x:y[:z]` | `.position(x, y[, z])` | `.position(x, y[, z])` | 0, 0, 0 | Where its center is (the start of a line or an arrow). Values: in your units: x forward, y to the left, z up; P::2 changes y only. |
| size | `SC:x:y[:z]  or  SC:s` | `.size(x, y[, z])  or  .size(s)` | `.size(x, y[, z])  or  .size(s)` | 1 | Its size along its own axes (an STL: its units times this). Values: SC:s: the same on every axis; SC:x:y keeps z; an empty value keeps. |
| rotation | `R:angle  or  R:roll:pitch:yaw` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | 0 | Turns it around its center (around its start for a line or an arrow). Values: radians, counterclockwise; 3D\|: around x, y, z. |
| line width | `LW:w` | `.lineWidth(w)` | `.lineWidth(w)` | 1.5 px on screen | Width of its lines, outlines included. Values: in your units: it follows the zoom (never thinner than 1 px); not sent: a steady thin line. |
| color | `C:color` | `.color("orange")` | `.color("orange")` | of the palette | Its color (of the whole shape). Values: a CSS name or #rrggbb (C++ also Teleplot::Rgb{r, g, b}). |
| opacity | `O:a` | `.opacity(a)` | `.opacity(a)` | 1 | 0 invisible, 1 solid. Values: 0 to 1. |
| picture on it | `T:url:"url"  or  T:telem:picture` | `.texture("url")  or  .textureFrom("picture")` | `.texture("url")  or  .textureFrom("picture")` | none | A picture on its faces: a file, or the pictures of an image telemetry (the one of the time shown). Multiplied by its color: white shows it as it is. Values: an url the browser can fetch, or the name of an image telemetry. |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| in the pixels of | `FPX:picture` | `.pixelsOf("picture")` | `.pixelsOf("picture")` |  | Drawn in the pixels of the pictures of an image telemetry (a box around what a detector found); sizes in pixels too. Values: the name of an image telemetry; u to the right, v down, 0:0 the center of the top left pixel. |
| a 2D\| or 3D\| line | `2D\|name,group:time:P…\|flags` | — | — |  | A shape is a telemetry: its properties, each followed by its values. Send everything once, then only what changes. Values: 2D\|: x:y and one angle, flat shapes seen from above; 3D\|: x:y:z; time: and ; for several updates. In a client every call of a chain is a property. |

### Circle

2D, a disc.

```
2D|spot,field:S:circle:P:2.5:1.5:RA:0.3:C:orange:O:0.5
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| kind | `S:kind` | `.shape(Teleplot::Rect)` | `.shape(Teleplot.Rect)` | rect in 2D\|, cube in 3D\| | What the shape is. Values: rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl. |
| position | `P:x:y[:z]` | `.position(x, y[, z])` | `.position(x, y[, z])` | 0, 0, 0 | Where its center is (the start of a line or an arrow). Values: in your units: x forward, y to the left, z up; P::2 changes y only. |
| radius | `RA:r` | `.size(2 * r)` | `.size(2 * r)` | 0.5 | Radius of a circle, a sphere or a cylinder (SC of twice that). Values: in your units. |
| size | `SC:x:y[:z]  or  SC:s` | `.size(x, y[, z])  or  .size(s)` | `.size(x, y[, z])  or  .size(s)` | 1 | Its size along its own axes (an STL: its units times this). Values: SC:s: the same on every axis; SC:x:y keeps z; an empty value keeps. |
| line width | `LW:w` | `.lineWidth(w)` | `.lineWidth(w)` | 1.5 px on screen | Width of its lines, outlines included. Values: in your units: it follows the zoom (never thinner than 1 px); not sent: a steady thin line. |
| color | `C:color` | `.color("orange")` | `.color("orange")` | of the palette | Its color (of the whole shape). Values: a CSS name or #rrggbb (C++ also Teleplot::Rgb{r, g, b}). |
| opacity | `O:a` | `.opacity(a)` | `.opacity(a)` | 1 | 0 invisible, 1 solid. Values: 0 to 1. |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| in the pixels of | `FPX:picture` | `.pixelsOf("picture")` | `.pixelsOf("picture")` |  | Drawn in the pixels of the pictures of an image telemetry (a box around what a detector found); sizes in pixels too. Values: the name of an image telemetry; u to the right, v down, 0:0 the center of the top left pixel. |

### Line

2D, through points.

```
2D|route,field:S:line:PT:0:0:1:0.5:2:2:3:2:C:green:LW:0.05
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| kind | `S:kind` | `.shape(Teleplot::Rect)` | `.shape(Teleplot.Rect)` | rect in 2D\|, cube in 3D\| | What the shape is. Values: rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl. |
| points | `PT:x:y:x:y…` | `.points(pts)`<br>Arduino: `.points(pts, n)` | `.points(pts)` | none | The points of a line or a polygon, in the frame of the shape. Values: as many as needed. |
| position | `P:x:y[:z]` | `.position(x, y[, z])` | `.position(x, y[, z])` | 0, 0, 0 | Where its center is (the start of a line or an arrow). Values: in your units: x forward, y to the left, z up; P::2 changes y only. |
| rotation | `R:angle  or  R:roll:pitch:yaw` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | 0 | Turns it around its center (around its start for a line or an arrow). Values: radians, counterclockwise; 3D\|: around x, y, z. |
| line width | `LW:w` | `.lineWidth(w)` | `.lineWidth(w)` | 1.5 px on screen | Width of its lines, outlines included. Values: in your units: it follows the zoom (never thinner than 1 px); not sent: a steady thin line. |
| color | `C:color` | `.color("orange")` | `.color("orange")` | of the palette | Its color (of the whole shape). Values: a CSS name or #rrggbb (C++ also Teleplot::Rgb{r, g, b}). |
| opacity | `O:a` | `.opacity(a)` | `.opacity(a)` | 1 | 0 invisible, 1 solid. Values: 0 to 1. |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| in the pixels of | `FPX:picture` | `.pixelsOf("picture")` | `.pixelsOf("picture")` |  | Drawn in the pixels of the pictures of an image telemetry (a box around what a detector found); sizes in pixels too. Values: the name of an image telemetry; u to the right, v down, 0:0 the center of the top left pixel. |

### Polygon

2D, a surface.

```
2D|zone,field:S:polygon:PT:0:0:1:0:1:1:0:1:C:red:O:0.3
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| kind | `S:kind` | `.shape(Teleplot::Rect)` | `.shape(Teleplot.Rect)` | rect in 2D\|, cube in 3D\| | What the shape is. Values: rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl. |
| points | `PT:x:y:x:y…` | `.points(pts)`<br>Arduino: `.points(pts, n)` | `.points(pts)` | none | The points of a line or a polygon, in the frame of the shape. Values: as many as needed. |
| position | `P:x:y[:z]` | `.position(x, y[, z])` | `.position(x, y[, z])` | 0, 0, 0 | Where its center is (the start of a line or an arrow). Values: in your units: x forward, y to the left, z up; P::2 changes y only. |
| rotation | `R:angle  or  R:roll:pitch:yaw` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | 0 | Turns it around its center (around its start for a line or an arrow). Values: radians, counterclockwise; 3D\|: around x, y, z. |
| line width | `LW:w` | `.lineWidth(w)` | `.lineWidth(w)` | 1.5 px on screen | Width of its lines, outlines included. Values: in your units: it follows the zoom (never thinner than 1 px); not sent: a steady thin line. |
| color | `C:color` | `.color("orange")` | `.color("orange")` | of the palette | Its color (of the whole shape). Values: a CSS name or #rrggbb (C++ also Teleplot::Rgb{r, g, b}). |
| opacity | `O:a` | `.opacity(a)` | `.opacity(a)` | 1 | 0 invisible, 1 solid. Values: 0 to 1. |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| in the pixels of | `FPX:picture` | `.pixelsOf("picture")` | `.pixelsOf("picture")` |  | Drawn in the pixels of the pictures of an image telemetry (a box around what a detector found); sizes in pixels too. Values: the name of an image telemetry; u to the right, v down, 0:0 the center of the top left pixel. |

### Arrow

2D and 3D, from a point along a vector.

```
2D|wind,field:S:arrow:P:0.5:2:V:0.8:0.3:C:purple:LW:0.05
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| kind | `S:kind` | `.shape(Teleplot::Rect)` | `.shape(Teleplot.Rect)` | rect in 2D\|, cube in 3D\| | What the shape is. Values: rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl. |
| position | `P:x:y[:z]` | `.position(x, y[, z])` | `.position(x, y[, z])` | 0, 0, 0 | Where its center is (the start of a line or an arrow). Values: in your units: x forward, y to the left, z up; P::2 changes y only. |
| vector | `V:x:y[:z]` | `.vector(x, y[, z])` | `.vector(x, y[, z])` | 0, 0: not drawn | Where an arrow points and how long it is, from its start; the head is a quarter of it. Values: in your units, turned by the rotation. |
| line width | `LW:w` | `.lineWidth(w)` | `.lineWidth(w)` | 1.5 px on screen | Width of its lines, outlines included. Values: in your units: it follows the zoom (never thinner than 1 px); not sent: a steady thin line. |
| rotation | `R:angle  or  R:roll:pitch:yaw` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | 0 | Turns it around its center (around its start for a line or an arrow). Values: radians, counterclockwise; 3D\|: around x, y, z. |
| color | `C:color` | `.color("orange")` | `.color("orange")` | of the palette | Its color (of the whole shape). Values: a CSS name or #rrggbb (C++ also Teleplot::Rgb{r, g, b}). |
| opacity | `O:a` | `.opacity(a)` | `.opacity(a)` | 1 | 0 invisible, 1 solid. Values: 0 to 1. |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| in the pixels of | `FPX:picture` | `.pixelsOf("picture")` | `.pixelsOf("picture")` |  | Drawn in the pixels of the pictures of an image telemetry (a box around what a detector found); sizes in pixels too. Values: the name of an image telemetry; u to the right, v down, 0:0 the center of the top left pixel. |

### Text

2D, words in the scene.

```
2D|goal,field:S:text:P:3:2:TX:"Goal A":TS:0.3
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| kind | `S:kind` | `.shape(Teleplot::Rect)` | `.shape(Teleplot.Rect)` | rect in 2D\|, cube in 3D\| | What the shape is. Values: rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl. |
| text | `TX:"text"` | `.text("text")` | `.text("text")` |  | What a text shape says. Values: between quotes it can hold : and \|. |
| position | `P:x:y[:z]` | `.position(x, y[, z])` | `.position(x, y[, z])` | 0, 0, 0 | Where its center is (the start of a line or an arrow). Values: in your units: x forward, y to the left, z up; P::2 changes y only. |
| text size | `TS:h` | `.textSize(h)` | `.textSize(h)` | steady on screen | Height of a text, in your units (it then follows the zoom). Values: in your units. |
| rotation | `R:angle  or  R:roll:pitch:yaw` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | 0 | Turns it around its center (around its start for a line or an arrow). Values: radians, counterclockwise; 3D\|: around x, y, z. |
| color | `C:color` | `.color("orange")` | `.color("orange")` | of the palette | Its color (of the whole shape). Values: a CSS name or #rrggbb (C++ also Teleplot::Rgb{r, g, b}). |
| opacity | `O:a` | `.opacity(a)` | `.opacity(a)` | 1 | 0 invisible, 1 solid. Values: 0 to 1. |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| in the pixels of | `FPX:picture` | `.pixelsOf("picture")` | `.pixelsOf("picture")` |  | Drawn in the pixels of the pictures of an image telemetry (a box around what a detector found); sizes in pixels too. Values: the name of an image telemetry; u to the right, v down, 0:0 the center of the top left pixel. |

### Cube

3D, the default of 3D| lines.

```
3D|box,scene:S:cube:P:1:0:0.5:SC:1:1:1:C:orange
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| kind | `S:kind` | `.shape(Teleplot::Rect)` | `.shape(Teleplot.Rect)` | rect in 2D\|, cube in 3D\| | What the shape is. Values: rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl. |
| position | `P:x:y[:z]` | `.position(x, y[, z])` | `.position(x, y[, z])` | 0, 0, 0 | Where its center is (the start of a line or an arrow). Values: in your units: x forward, y to the left, z up; P::2 changes y only. |
| size | `SC:x:y[:z]  or  SC:s` | `.size(x, y[, z])  or  .size(s)` | `.size(x, y[, z])  or  .size(s)` | 1 | Its size along its own axes (an STL: its units times this). Values: SC:s: the same on every axis; SC:x:y keeps z; an empty value keeps. |
| rotation | `R:angle  or  R:roll:pitch:yaw` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | 0 | Turns it around its center (around its start for a line or an arrow). Values: radians, counterclockwise; 3D\|: around x, y, z. |
| quaternion | `Q:x:y:z:w` | `.quaternion(w, x, y, z)` | `.quaternion(w, x, y, z)` | none | A rotation as a quaternion (the latest of R and Q is used). Values: w last in a line, first in the calls. |
| color | `C:color` | `.color("orange")` | `.color("orange")` | of the palette | Its color (of the whole shape). Values: a CSS name or #rrggbb (C++ also Teleplot::Rgb{r, g, b}). |
| opacity | `O:a` | `.opacity(a)` | `.opacity(a)` | 1 | 0 invisible, 1 solid. Values: 0 to 1. |
| picture on it | `T:url:"url"  or  T:telem:picture` | `.texture("url")  or  .textureFrom("picture")` | `.texture("url")  or  .textureFrom("picture")` | none | A picture on its faces: a file, or the pictures of an image telemetry (the one of the time shown). Multiplied by its color: white shows it as it is. Values: an url the browser can fetch, or the name of an image telemetry. |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| V1 sizes | `W:x  D:y  H:z` | `.size(x, y, z)` | `.size(x, y, z)` |  | Sizes of Teleplot V1, still understood (H is y in a 2D\| line). Values: SC replaces them. |
| a 2D\| or 3D\| line | `2D\|name,group:time:P…\|flags` | — | — |  | A shape is a telemetry: its properties, each followed by its values. Send everything once, then only what changes. Values: 2D\|: x:y and one angle, flat shapes seen from above; 3D\|: x:y:z; time: and ; for several updates. In a client every call of a chain is a property. |

### Sphere

3D.

```
3D|ball,scene:S:sphere:P:0:1:0.5:RA:0.5:C:red
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| kind | `S:kind` | `.shape(Teleplot::Rect)` | `.shape(Teleplot.Rect)` | rect in 2D\|, cube in 3D\| | What the shape is. Values: rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl. |
| position | `P:x:y[:z]` | `.position(x, y[, z])` | `.position(x, y[, z])` | 0, 0, 0 | Where its center is (the start of a line or an arrow). Values: in your units: x forward, y to the left, z up; P::2 changes y only. |
| radius | `RA:r` | `.size(2 * r)` | `.size(2 * r)` | 0.5 | Radius of a circle, a sphere or a cylinder (SC of twice that). Values: in your units. |
| size | `SC:x:y[:z]  or  SC:s` | `.size(x, y[, z])  or  .size(s)` | `.size(x, y[, z])  or  .size(s)` | 1 | Its size along its own axes (an STL: its units times this). Values: SC:s: the same on every axis; SC:x:y keeps z; an empty value keeps. |
| rotation | `R:angle  or  R:roll:pitch:yaw` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | 0 | Turns it around its center (around its start for a line or an arrow). Values: radians, counterclockwise; 3D\|: around x, y, z. |
| color | `C:color` | `.color("orange")` | `.color("orange")` | of the palette | Its color (of the whole shape). Values: a CSS name or #rrggbb (C++ also Teleplot::Rgb{r, g, b}). |
| opacity | `O:a` | `.opacity(a)` | `.opacity(a)` | 1 | 0 invisible, 1 solid. Values: 0 to 1. |
| picture on it | `T:url:"url"  or  T:telem:picture` | `.texture("url")  or  .textureFrom("picture")` | `.texture("url")  or  .textureFrom("picture")` | none | A picture on its faces: a file, or the pictures of an image telemetry (the one of the time shown). Multiplied by its color: white shows it as it is. Values: an url the browser can fetch, or the name of an image telemetry. |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| precision | `PR:n` | — | — |  | Accepted for Teleplot V1, ignored: spheres and cylinders are always smooth. Nothing to send: it does nothing. |

### Cylinder

3D, standing along z.

```
3D|post,scene:S:cylinder:P:-1:0:0.5:SC:0.4:0.4:1:C:gray
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| kind | `S:kind` | `.shape(Teleplot::Rect)` | `.shape(Teleplot.Rect)` | rect in 2D\|, cube in 3D\| | What the shape is. Values: rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl. |
| position | `P:x:y[:z]` | `.position(x, y[, z])` | `.position(x, y[, z])` | 0, 0, 0 | Where its center is (the start of a line or an arrow). Values: in your units: x forward, y to the left, z up; P::2 changes y only. |
| radius | `RA:r` | `.size(2 * r)` | `.size(2 * r)` | 0.5 | Radius of a circle, a sphere or a cylinder (SC of twice that). Values: in your units. |
| size | `SC:x:y[:z]  or  SC:s` | `.size(x, y[, z])  or  .size(s)` | `.size(x, y[, z])  or  .size(s)` | 1 | Its size along its own axes (an STL: its units times this). Values: SC:s: the same on every axis; SC:x:y keeps z; an empty value keeps. |
| rotation | `R:angle  or  R:roll:pitch:yaw` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | 0 | Turns it around its center (around its start for a line or an arrow). Values: radians, counterclockwise; 3D\|: around x, y, z. |
| quaternion | `Q:x:y:z:w` | `.quaternion(w, x, y, z)` | `.quaternion(w, x, y, z)` | none | A rotation as a quaternion (the latest of R and Q is used). Values: w last in a line, first in the calls. |
| color | `C:color` | `.color("orange")` | `.color("orange")` | of the palette | Its color (of the whole shape). Values: a CSS name or #rrggbb (C++ also Teleplot::Rgb{r, g, b}). |
| opacity | `O:a` | `.opacity(a)` | `.opacity(a)` | 1 | 0 invisible, 1 solid. Values: 0 to 1. |
| picture on it | `T:url:"url"  or  T:telem:picture` | `.texture("url")  or  .textureFrom("picture")` | `.texture("url")  or  .textureFrom("picture")` | none | A picture on its faces: a file, or the pictures of an image telemetry (the one of the time shown). Multiplied by its color: white shows it as it is. Values: an url the browser can fetch, or the name of an image telemetry. |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| precision | `PR:n` | — | — |  | Accepted for Teleplot V1, ignored: spheres and cylinders are always smooth. Nothing to send: it does nothing. |

### Mesh

3D, an STL file.

```
3D|pawn,scene:S:stl:U:"media/pawn.stl":P:0:0:0:C:orange
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| kind | `S:kind` | `.shape(Teleplot::Rect)` | `.shape(Teleplot.Rect)` | rect in 2D\|, cube in 3D\| | What the shape is. Values: rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl. |
| file | `U:"url"` | `.stl("url")` | `.stl("url")` |  | The STL file of an stl shape (binary or text). Values: between quotes: relative to the page, or on a site that allows it (CORS). |
| size | `SC:x:y[:z]  or  SC:s` | `.size(x, y[, z])  or  .size(s)` | `.size(x, y[, z])  or  .size(s)` | 1 | Its size along its own axes (an STL: its units times this). Values: SC:s: the same on every axis; SC:x:y keeps z; an empty value keeps. |
| position | `P:x:y[:z]` | `.position(x, y[, z])` | `.position(x, y[, z])` | 0, 0, 0 | Where its center is (the start of a line or an arrow). Values: in your units: x forward, y to the left, z up; P::2 changes y only. |
| rotation | `R:angle  or  R:roll:pitch:yaw` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | 0 | Turns it around its center (around its start for a line or an arrow). Values: radians, counterclockwise; 3D\|: around x, y, z. |
| quaternion | `Q:x:y:z:w` | `.quaternion(w, x, y, z)` | `.quaternion(w, x, y, z)` | none | A rotation as a quaternion (the latest of R and Q is used). Values: w last in a line, first in the calls. |
| color | `C:color` | `.color("orange")` | `.color("orange")` | of the palette | Its color (of the whole shape). Values: a CSS name or #rrggbb (C++ also Teleplot::Rgb{r, g, b}). |
| opacity | `O:a` | `.opacity(a)` | `.opacity(a)` | 1 | 0 invisible, 1 solid. Values: 0 to 1. |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |

### Camera

Of an image telemetry.

```
3D|camera:K:55:55:32:24:64:48:P:0:0:1
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| camera | `K:fx:fy:cx:cy:w:h` | `.intrinsics(w, h, fx, fy, cx, cy)` | `.intrinsics(w, h, fx, fy, cx, cy)` | none | On an image telemetry: the pinhole model of its camera, so 3D shapes and points are drawn over its pictures. Values: in pixels: focal lengths, principal point, size of the picture they are for (OpenCV convention). |
| lens distortion | `DC:k1:k2:p1:p2:k3` | `.distortion(k1, k2, p1, p2, k3)` | `.distortion(k1, k2, p1, p2, k3)` | none | The distortion of its lens: what is drawn over the picture is distorted the same (the picture never is). Values: Brown-Conrady coefficients, as OpenCV gives them. |
| camera pose | `P:x:y:z:R:… on the picture` | `.position(x, y, z).rotation(r, p, y)` | `.position(x, y, z).rotation(r, p, y)` | at the origin | Where the camera is in the scene: it looks along its x, y to the left of the picture, z up. SC: how far its pyramid is drawn. Values: as for a shape. |
| position | `P:x:y[:z]` | `.position(x, y[, z])` | `.position(x, y[, z])` | 0, 0, 0 | Where its center is (the start of a line or an arrow). Values: in your units: x forward, y to the left, z up; P::2 changes y only. |
| rotation | `R:angle  or  R:roll:pitch:yaw` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | `.yaw(a)  or  .rotation(roll, pitch, yaw)` | 0 | Turns it around its center (around its start for a line or an arrow). Values: radians, counterclockwise; 3D\|: around x, y, z. |
| quaternion | `Q:x:y:z:w` | `.quaternion(w, x, y, z)` | `.quaternion(w, x, y, z)` | none | A rotation as a quaternion (the latest of R and Q is used). Values: w last in a line, first in the calls. |
| size | `SC:x:y[:z]  or  SC:s` | `.size(x, y[, z])  or  .size(s)` | `.size(x, y[, z])  or  .size(s)` | 1 | Its size along its own axes (an STL: its units times this). Values: SC:s: the same on every axis; SC:x:y keeps z; an empty value keeps. |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |

### Frames

Moving together, drawing on pictures.

```
2D|heading,field:S:arrow:V:0.4:0:F:robot
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| in the pixels of | `FPX:picture` | `.pixelsOf("picture")` | `.pixelsOf("picture")` |  | Drawn in the pixels of the pictures of an image telemetry (a box around what a detector found); sizes in pixels too. Values: the name of an image telemetry; u to the right, v down, 0:0 the center of the top left pixel. |
| frame | `2D\|name:F:other` | `.frame("robot")` | `.frame("robot")` | the scene | The position is relative to another telemetry, which carries it along. Values: the name of a telemetry that has a place (up to 16 levels); F: empty: back in the scene. |

## Describe

### Unit, color, description

ATTR| lines.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| an ATTR\| line | `ATTR\|name\|key=value\|key…` | — | — |  | Describes a telemetry without a sample: sent once (again at will), before or after its data. A line with an unknown key is refused as a whole. Values: keys: unit color desc min max scale nodata depth, and those of commands. In a client every call of a chain is a key. |
| unit | `ATTR\|name\|unit=L` | `.unit("L")` | `.unit("L")` | none | Its unit, without a sample. |
| unit | `name:value§unit` | `.unit("V")` | `.unit("V")` | none | Written after its values; kept: once is enough. Values: any text without , ; : \| (also ATTR\|name\|unit=V). |
| color | `ATTR\|name\|color=teal` | `.color("teal")` | `.color("teal")` | of the palette | Its color in every view. Values: a CSS name or #rrggbb; color= empty gives it back its own. |
| description | `ATTR\|name\|desc=…` | `.desc("…")` | `.desc("…")` | none | A sentence: the tooltip of its name wherever it is shown. Values: any text (% \| , = : and line breaks written %XX). |
| special characters | `%XX` | — | — |  | In names of nodes, thresholds, dashboards and in ATTR\| values, these characters are written %XX (their code in hexadecimal). Values: % , ; \| # / > = : < and line breaks, depending on where (%2C for a comma). The clients escape by themselves. |

### Range

What a number is expected between.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| range | `ATTR\|name\|min=9\|max=12.6` | `.range(9, 12.6)` | `.range(9, 12.6)` | none | Both ends: a number with both gets a gauge on the Live dashboard. |
| lowest | `ATTR\|name\|min=9` | `.min(9)` | `.min(9)` | none | The value it is expected above: the start of its bar, the bottom of a chart in range scale. Values: a number; min= empty forgets it. |
| highest | `ATTR\|name\|max=12.6` | `.max(12.6)` | `.max(12.6)` | none | The value it is expected below. Values: a number. |

### Thresholds

Limits with a name.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| threshold | `TH\|name:low<10.5:hot>70` | `.threshold("low", Teleplot::Below, 10.5)` | `.threshold("low", Teleplot.Below, 10.5)` | none | A limit with a name: < past when below, > past when above. Charts draw it, values say which one is passed. Values: name<value or name>value; several separated by :. |
| threshold color | `TH\|name:hot>70,red` | `.threshold("hot", Teleplot::Above, 70, "red")` | `.threshold("hot", Teleplot.Above, 70, "red")` | the theme's | The color of a limit. Values: after a comma. |
| from when | `TH\|name:time:low<10.8` | `.at(Teleplot::ms(t)).threshold(…)` | `.at(Teleplot.ms(t)).threshold(…)` | when it arrives | Limits hold from their time on: what was drawn before keeps the limit it had. Values: milliseconds, before the limits. |
| remove a limit | `TH\|name:low<` | `.removeThreshold("low")` | `.removeThreshold("low")` |  | A limit without value is removed from then on; the same name again replaces it. |
| special characters | `%XX` | — | — |  | In names of nodes, thresholds, dashboards and in ATTR\| values, these characters are written %XX (their code in hexadecimal). Values: % , ; \| # / > = : < and line breaks, depending on where (%2C for a comma). The clients escape by themselves. |

### Groups

What goes together.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| group | `name,group:value` | `.label("motors")` | `.label("motors")` | none | Telemetries of a group share a view of the Live dashboard, and views can follow a group. Values: any text after a comma (a / means nothing special); one group per telemetry. |
| follows groups | `\|follow=motors` | — | — | none | The view takes the telemetries of these groups that it can display, those received and those to come. Values: groups separated by commas. |

### Showing and keeping

Live dashboard, data window.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| not on Live | `name:value\|np` | `.autoplot(false)` | `.autoplot(False)` | shown | Not put on the Live dashboard by itself (it stays in the Telemetries panel). Values: the flag np. |
| clear first | `name:value\|clr` | — | — |  | What the telemetry held is forgotten before this sample (a new run, a new scan). Values: the flag clr. No call in the clients: send the line as text. |
| data window | — | `.timeout(Teleplot::ms(5000))` | `.timeout(Teleplot.ms(5000))` | the page's (300 s) | How long the page keeps the samples of this telemetry. Values: a duration; 0: kept until the memory limit. Binary protocol only: the text protocol and the Arduino library (accepted, does nothing) have none. |

## Commands

### Setting

A value the page may change.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| writable | `ATTR\|name\|write[=type]` | `tp.param("name", &variable)` | `tp.param("name", initial)` | not writable | The page may change it (switch CMD on): it sends the line your device would send, your device applies it and sends it back. Values: write alone: the type of its data; write= empty: no more. |
| type | `write=number\|bool\|text\|xy\|xyz\|pose2d` | `float, double, int, bool, std::string, Number2D, Number3D, Pose2D`<br>Arduino: `float, double, int, bool, char[N], Number2D, Number3D, Pose2D` | `float, int, bool, str, Number2D, Number3D, Pose2D` | of its data | What it holds: number (a slider), bool (a switch: 0 or 1), text, xy, xyz, pose2d (x, y, an angle in radians). Values: number, bool, text, xy, xyz, pose2d. |
| lowest | `ATTR\|name\|min=9` | `.min(9)` | `.min(9)` | none | The value it is expected above: the start of its bar, the bottom of a chart in range scale. Values: a number; min= empty forgets it. |
| highest | `ATTR\|name\|max=12.6` | `.max(12.6)` | `.max(12.6)` | none | The value it is expected below. Values: a number. |
| step | `ATTR\|name\|write\|step=0.1` | `.step(0.1)` | `.step(0.1)` | none | What the slider moves by (also how close the echo must be). Values: a number. |
| choices | `name:a,b#caption\|enum` | `.enumValues({"a", "b#caption"})` | `.enumValues(["a", "b#caption"])` | any text | The texts a text setting can take; #caption: words shown with a choice. Values: an enum, as for a graph. |
| description | `ATTR\|name\|desc=…` | `.desc("…")` | `.desc("…")` | none | A sentence: the tooltip of its name wherever it is shown. Values: any text (% \| , = : and line breaks written %XX). |
| unit | `ATTR\|name\|unit=L` | `.unit("L")` | `.unit("L")` | none | Its unit, without a sample. |
| applied | `name:value` | — | — |  | What the page sends is the line your device would send, without a time; your device sends the value back: that is how the page knows. The clients apply, answer and publish by themselves in poll(). |
| refused | `ACK\|name:err:why` | `.onChange([](float v) { return Teleplot::error("why"); })` | `.onChange(lambda v: Teleplot.error("why"))` |  | Your device refuses a value (optional: its value already tells). For a joystick, answered to each value it cannot apply now. |
| a setting | — | `tp.param("name", &variable)` | `tp.param("name", initial)  or  tp.param("name", object, "attribute")` |  | A setting the page may write: Param<T> chains range, min, max, step, unit, desc, enumValues, rate, hold, axes, onChange. A number is clamped to the range and rounded to the step. |
| when it changes | — | `.onChange([](float const& v) { return Teleplot::ok(); })` | `.onChange(lambda v: Teleplot.ok())` | applied | Called with the value the page wrote: return ok, or error(why) to refuse. |

### Continuous setting

Driven by a joystick.

```
ATTR|cmd_vel|write=pose2d|axes=x,yaw|rate=20|hold=200
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| rate | `ATTR\|name\|write=…\|rate=20` | `.rate(20)` | `.rate(20)` | none | Continuous: while it is held, the page sends the value that many times per second (a joystick). Values: per second. |
| hold | `ATTR\|name\|write=…\|hold=200` | `.hold(200)` | `.hold(200)` | none | Your device stops by itself when nothing came for that long: the safety is on the device. Values: milliseconds. |
| axes | `ATTR\|name\|write=pose2d\|axes=x,yaw` | `.axes(Teleplot::X \| Teleplot::Yaw)` | `.axes(Teleplot.X \| Teleplot.Yaw)` | x, y, yaw | Which axes of a pose2d move: x,yaw is a base that cannot go sideways (one stick). Values: x, y, yaw separated by commas. |
| type | `write=number\|bool\|text\|xy\|xyz\|pose2d` | `float, double, int, bool, std::string, Number2D, Number3D, Pose2D`<br>Arduino: `float, double, int, bool, char[N], Number2D, Number3D, Pose2D` | `float, int, bool, str, Number2D, Number3D, Pose2D` | of its data | What it holds: number (a slider), bool (a switch: 0 or 1), text, xy, xyz, pose2d (x, y, an angle in radians). Values: number, bool, text, xy, xyz, pose2d. |
| refused | `ACK\|name:err:why` | `.onChange([](float v) { return Teleplot::error("why"); })` | `.onChange(lambda v: Teleplot.error("why"))` |  | Your device refuses a value (optional: its value already tells). For a joystick, answered to each value it cannot apply now. |

### Action

A button that calls your device.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| action | `ATTR\|name\|action` | `tp.action("name", handler)` | `tp.action("name", handler)` |  | A button: the page calls it, your device answers. Values: action= empty: no more. |
| button text | `ATTR\|name\|action\|title=…` | `.title("…")` | `.title("…")` | its name | The text of the button. Values: any text. |
| asks first | `ATTR\|name\|action\|confirm` | `.confirm()` | `.confirm()` | no | The button asks before calling. Values: a flag (confirm=0: no). |
| hold to press | `ATTR\|name\|action\|longpress` | `.longpress()` | `.longpress()` | no | The button must be held 1 s. Values: a flag. |
| button color | `ATTR\|name\|action\|color=red` | `.color("red")` | `.color("red")` | the theme's | The color of the button. Values: a CSS name or #rrggbb. |
| description | `ATTR\|name\|desc=…` | `.desc("…")` | `.desc("…")` | none | A sentence: the tooltip of its name wherever it is shown. Values: any text (% \| , = : and line breaks written %XX). |
| a call | `!name#id:a=v:b=v` | — | — |  | What the page sends: an id that grows, then the arguments by name (several numbers separated by commas: target=1.5,2). The clients read it in poll() and call the handler with its Args. |
| the answer | `ACK\|name#id:run \| ok[:result] \| err:why` | `Teleplot::ok(), Teleplot::error("why"), Teleplot::running()`<br>Arduino: `Teleplot::ok(), Teleplot::error("why")` | `Teleplot.ok(), Teleplot.error("why"), Teleplot.running()` |  | Started, done (with a short result), failed. A call sent again with its id is answered again, never run twice. |
| an action | — | `tp.action("name", [](Teleplot::Args const& args) { return Teleplot::ok(); })` | `tp.action("name", handler)  or  @tp.action("name")` |  | An action the page may call: Action chains title, desc, color, confirm, longpress, arg. |
| the arguments | — | `args.has("a"), args.number("a"), args.flag("a"), args.text("a"), args.xy("a"), args.xyz("a"), args.pose2d("a"), args.call()`<br>Arduino: `args.has("a"), args.number("a"), args.flag("a"), args.text("a"), args.xy("a"), args.xyz("a"), args.pose2d("a")` | `args.has("a"), args.number("a"), args.flag("a"), args.text("a"), args.xy("a"), args.xyz("a"), args.pose2d("a"), args.call()` |  | What the handler gets: the arguments by name; call() keeps the call to answer it later. |
| answers | — | `Teleplot::ok("text"), Teleplot::error("why"), Teleplot::running()`<br>Arduino: `Teleplot::ok("text"), Teleplot::error("why")` | `Teleplot.ok("text"), Teleplot.error("why"), Teleplot.running()` |  | What a handler returns; running(): finished later with tp.answer(call, result). |
| answer later | — | `tp.answer(call, Teleplot::ok())`<br>Arduino: — | `tp.answer(call, Teleplot.ok())` |  | Finishes a call whose handler returned running(). |

### Argument

A field of an action's form.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| argument | `ATTR\|name\|arg=a\|type=…` | `.arg(Teleplot::Arg("a", Teleplot::Arg::Number))` | `.arg(Teleplot.Arg("a", Teleplot.Arg.Number))` | none | One line per argument, in order: the button opens a form. Values: type= empty removes it. |
| argument type | `type=number` | `Teleplot::Arg("a", Teleplot::Arg::XY)` | `Teleplot.Arg("a", Teleplot.Arg::XY)` | number | What the argument holds. Values: number, bool, text, xy, xyz, pose2d. |
| optional | `optional` | `.optional()` | `.optional()` | needed | The form can leave it empty. Values: a flag. |
| default | `default=…` | `.defaultValue(v)` | `.defaultValue(v)` | none | What the form starts with. Values: a value of its type. |
| argument choices | `enum=a,b` | `.enumValues({"a", "b"})` | `.enumValues(["a", "b"])` | any text | The texts a text argument can take. Values: separated by commas. |
| limits of an argument | `min= max= step= unit= desc=` | `.range(0, 1).step(0.1).unit("m").desc("…")` | `.range(0, 1).step(0.1).unit("m").desc("…")` | none | As for a setting. |
| an argument | — | `Teleplot::Arg("speed", Teleplot::Arg::Number).optional().defaultValue(0.5).range(0, 1).step(0.1).unit("m/s").enumValues({}).desc("…")` | `Teleplot.Arg("speed", Teleplot.Arg.Number).optional().defaultValue(0.5)` |  | An argument of an action. Values: types Number, Bool, Text, XY, XYZ, Pose2D. |

## Views

### Chart

Numbers over time.

Drag: zoom (the views of its time group follow) · double click: back to live · a legend entry: click to hide, point to highlight.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| unit | `name:value§unit` | `.unit("V")` | `.unit("V")` | none | Written after its values; kept: once is enough. Values: any text without , ; : \| (also ATTR\|name\|unit=V). |
| color | `ATTR\|name\|color=teal` | `.color("teal")` | `.color("teal")` | of the palette | Its color in every view. Values: a CSS name or #rrggbb; color= empty gives it back its own. |
| threshold | `TH\|name:low<10.5:hot>70` | `.threshold("low", Teleplot::Below, 10.5)` | `.threshold("low", Teleplot.Below, 10.5)` | none | A limit with a name: < past when below, > past when above. Charts draw it, values say which one is passed. Values: name<value or name>value; several separated by :. |
| range | `ATTR\|name\|min=9\|max=12.6` | `.range(9, 12.6)` | `.range(9, 12.6)` | none | Both ends: a number with both gets a gauge on the Live dashboard. |
| state | `name:text\|t` | `tp.update("name", "text")` | `tp.update("name", "text")` |  | A text whose latest value matters (a mode, a status); the same text again continues it. Values: any text, colons included; a first field that is a number is its time. |
| log line | `name:text\|log` | `tp.log("name", "text")` | `tp.log("name", "text")` |  | A line to read with the others, an instant. Values: any text. |
| decimals | `\|displayNumberDecimals=` | `\|displayNumberDecimals=` | `\|displayNumberDecimals=` | 3 | Digits after the point of the values written. Values: from 0 to 10. |
| decimation | `\|decimation=` | `\|decimation=` | `\|decimation=` | true | Draws the lowest and highest sample of each pixel instead of every sample: fast with millions of samples, nothing hidden. Values: true or false. |
| thresholds | `\|thresholds=` | `\|thresholds=` | `\|thresholds=` | fit | In view: the scale includes the limits; If in view: drawn when the scale reaches them; Hidden. Values: fit (In view), show (If in view), hide (Hidden). |
| scale | `\|scale=` | `\|scale=` | `\|scale=` | auto | Auto: the scale fits what is drawn; Range: the range of the telemetries (ATTR min max). Values: auto (Auto), range (Range). |
| width | `\|w=4` | — | — | 2 (a chart), 1 (values) | Columns of a grid, a share of a row. Values: a whole number. |
| height | `\|h=3` | — | — | what it needs | Steps of 4 em (a share of a column). Values: a whole number. |
| title | `\|title=…` | — | — | the last name of the path | The text in the corner. Values: title= empty: none. |
| time group | `\|time=Live` | — | — | inherit | Views of a group zoom and point at the same time; another group stays on its own. Values: inherit, dashboard, or a name shared by the views that zoom together. |
| follows groups | `\|follow=motors` | — | — | none | The view takes the telemetries of these groups that it can display, those received and those to come. Values: groups separated by commas. |

### Values

The latest value of each.

With CMD on, a setting is changed in place: drag its bar or type a value.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| unit | `name:value§unit` | `.unit("V")` | `.unit("V")` | none | Written after its values; kept: once is enough. Values: any text without , ; : \| (also ATTR\|name\|unit=V). |
| range | `ATTR\|name\|min=9\|max=12.6` | `.range(9, 12.6)` | `.range(9, 12.6)` | none | Both ends: a number with both gets a gauge on the Live dashboard. |
| threshold | `TH\|name:low<10.5:hot>70` | `.threshold("low", Teleplot::Below, 10.5)` | `.threshold("low", Teleplot.Below, 10.5)` | none | A limit with a name: < past when below, > past when above. Charts draw it, values say which one is passed. Values: name<value or name>value; several separated by :. |
| description | `ATTR\|name\|desc=…` | `.desc("…")` | `.desc("…")` | none | A sentence: the tooltip of its name wherever it is shown. Values: any text (% \| , = : and line breaks written %XX). |
| writable | `ATTR\|name\|write[=type]` | `tp.param("name", &variable)` | `tp.param("name", initial)` | not writable | The page may change it (switch CMD on): it sends the line your device would send, your device applies it and sends it back. Values: write alone: the type of its data; write= empty: no more. |
| decimals | `\|displayNumberDecimals=` | `\|displayNumberDecimals=` | `\|displayNumberDecimals=` | 3 | Digits after the point of the values written. Values: from 0 to 10. |
| values in a row | `\|displayLayoutRow=` | `\|displayLayoutRow=` | `\|displayLayoutRow=` | false | The values side by side instead of one under the other. Values: true or false. |
| telemetry names | `\|displayTelemetryName=` | `\|displayTelemetryName=` | `\|displayTelemetryName=` | true | The name of each telemetry is written. Values: true or false. |
| telemetry colors | `\|displayTelemetryColor=` | `\|displayTelemetryColor=` | `\|displayTelemetryColor=` | true | The color of each telemetry is shown. Values: true or false. |
| range labels | `\|displayScale=` | `\|displayScale=` | `\|displayScale=` | true | The ends of the range and the names of the limits under the bar. Values: true or false. |
| width | `\|w=4` | — | — | 2 (a chart), 1 (values) | Columns of a grid, a share of a row. Values: a whole number. |
| height | `\|h=3` | — | — | what it needs | Steps of 4 em (a share of a column). Values: a whole number. |
| title | `\|title=…` | — | — | the last name of the path | The text in the corner. Values: title= empty: none. |
| time group | `\|time=Live` | — | — | inherit | Views of a group zoom and point at the same time; another group stays on its own. Values: inherit, dashboard, or a name shared by the views that zoom together. |
| follows groups | `\|follow=motors` | — | — | none | The view takes the telemetries of these groups that it can display, those received and those to come. Values: groups separated by commas. |

### Log

Text lines in order.

Follows the time of its group: pointing at a chart shows the line of that moment.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| log line | `name:text\|log` | `tp.log("name", "text")` | `tp.log("name", "text")` |  | A line to read with the others, an instant. Values: any text. |
| general log | `>:text` | `tp.log("text")` | `tp.log("text")` |  | A line of the log named log (on a serial port, any line that does not start with >). Values: >time:text with its time (ms). |
| state | `name:text\|t` | `tp.update("name", "text")` | `tp.update("name", "text")` |  | A text whose latest value matters (a mode, a status); the same text again continues it. Values: any text, colons included; a first field that is a number is its time. |
| color | `ATTR\|name\|color=teal` | `.color("teal")` | `.color("teal")` | of the palette | Its color in every view. Values: a CSS name or #rrggbb; color= empty gives it back its own. |
| timestamps | `\|displayTimestamp=` | `\|displayTimestamp=` | `\|displayTimestamp=` | true | The time of each line is written. Values: true or false. |
| telemetry names | `\|displayTelemetryName=` | `\|displayTelemetryName=` | `\|displayTelemetryName=` | true | The name of each telemetry is written. Values: true or false. |
| telemetry colors | `\|displayTelemetryColor=` | `\|displayTelemetryColor=` | `\|displayTelemetryColor=` | true | The color of each telemetry is shown. Values: true or false. |
| max lines | `\|maxLines=` | `\|maxLines=` | `\|maxLines=` | 500 | The lines kept on screen (the data window keeps the samples). Values: from 10 to 100000. |
| width | `\|w=4` | — | — | 2 (a chart), 1 (values) | Columns of a grid, a share of a row. Values: a whole number. |
| height | `\|h=3` | — | — | what it needs | Steps of 4 em (a share of a column). Values: a whole number. |
| title | `\|title=…` | — | — | the last name of the path | The text in the corner. Values: title= empty: none. |
| time group | `\|time=Live` | — | — | inherit | Views of a group zoom and point at the same time; another group stays on its own. Values: inherit, dashboard, or a name shared by the views that zoom together. |
| follows groups | `\|follow=motors` | — | — | none | The view takes the telemetries of these groups that it can display, those received and those to come. Values: groups separated by commas. |

### Timeline

States over time.

Drag: zoom (its time group follows) · double click: back to live · point at a band: its text and how long it lasted.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| state | `name:text\|t` | `tp.update("name", "text")` | `tp.update("name", "text")` |  | A text whose latest value matters (a mode, a status); the same text again continues it. Values: any text, colons included; a first field that is a number is its time. |
| log line | `name:text\|log` | `tp.log("name", "text")` | `tp.log("name", "text")` |  | A line to read with the others, an instant. Values: any text. |
| what runs | `name:a/b/c\|stack` | `tp.stack("name", "a/b/c")` | `tp.stack("name", "a/b/c")` |  | The path of what runs, outer level first: a timeline row per level. Values: levels separated by /; empty: nothing runs. |
| status | `name:path=status\|stack` | `tp.stack("name", "path=failure")` | `tp.stack("name", "path=failure")` | runs | What a path ended with; a path without status runs. Values: any word: failure, error, fail (red); timeout, warning (yellow); success, ok, done (green); others gray. |
| threshold | `TH\|name:low<10.5:hot>70` | `.threshold("low", Teleplot::Below, 10.5)` | `.threshold("low", Teleplot.Below, 10.5)` | none | A limit with a name: < past when below, > past when above. Charts draw it, values say which one is passed. Values: name<value or name>value; several separated by :. |
| telemetry names | `\|displayTelemetryName=` | `\|displayTelemetryName=` | `\|displayTelemetryName=` | true | The name of each telemetry is written. Values: true or false. |
| stack rows | `\|stackDepth=` | `\|stackDepth=` | `\|stackDepth=` | 4 | Levels of a stack drawn as full rows; deeper ones get thinner rows (0: no limit). Values: from 0 to 64. |
| numbers | `\|numbers=` | `\|numbers=` | `\|numbers=` | auto | Auto: a number is a line (bands when it has limits); As text: its values as states. Values: auto (Auto), text (As text). |
| width | `\|w=4` | — | — | 2 (a chart), 1 (values) | Columns of a grid, a share of a row. Values: a whole number. |
| height | `\|h=3` | — | — | what it needs | Steps of 4 em (a share of a column). Values: a whole number. |
| title | `\|title=…` | — | — | the last name of the path | The text in the corner. Values: title= empty: none. |
| time group | `\|time=Live` | — | — | inherit | Views of a group zoom and point at the same time; another group stays on its own. Values: inherit, dashboard, or a name shared by the views that zoom together. |
| follows groups | `\|follow=motors` | — | — | none | The view takes the telemetries of these groups that it can display, those received and those to come. Values: groups separated by commas. |

### Graph

A state machine or a behavior tree.

Drag: move · wheel: zoom · double click: fit.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| states, nodes | `name:a,b/c#kind\|enum` | `.enumValues({"a", "b/c#kind"})` | `.enumValues(["a", "b/c#kind"])` |  | The structure of a graph: its states or nodes, a path each (b/c: c inside b). Also the texts a setting can take. Values: paths separated by commas; same time = parts of one; a newer time replaces it. |
| kind | `name:node#kind\|enum` | `.enumValues({"node#kind"})` | `.enumValues(["node#kind"])` | none | Free text written above a node (fallback, sequence...); for a setting, a caption of the choice. Values: after #. |
| transitions | `name:from>to=event\|edges` | `.edges({"from>to=event"})` | `.edges(["from>to=event"])` | none: a tree | The transitions of a state machine and what makes them happen; without edges, the paths make a tree. Values: from>to or from>to=event, separated by commas. |
| what runs | `name:a/b/c\|stack` | `tp.stack("name", "a/b/c")` | `tp.stack("name", "a/b/c")` |  | The path of what runs, outer level first: a timeline row per level. Values: levels separated by /; empty: nothing runs. |
| status | `name:path=status\|stack` | `tp.stack("name", "path=failure")` | `tp.stack("name", "path=failure")` | runs | What a path ended with; a path without status runs. Values: any word: failure, error, fail (red); timeout, warning (yellow); success, ok, done (green); others gray. |
| recent path | `\|trail=` | `\|trail=` | `\|trail=` | true | The recent path is drawn: where it went before reaching the current state. Values: true or false. |
| events on edges | `\|events=` | `\|events=` | `\|events=` | true | The events of the transitions are written on them. Values: true or false. |
| kinds | `\|kinds=` | `\|kinds=` | `\|kinds=` | true | The kinds of the nodes (#kind) are written above them. Values: true or false. |
| width | `\|w=4` | — | — | 2 (a chart), 1 (values) | Columns of a grid, a share of a row. Values: a whole number. |
| height | `\|h=3` | — | — | what it needs | Steps of 4 em (a share of a column). Values: a whole number. |
| title | `\|title=…` | — | — | the last name of the path | The text in the corner. Values: title= empty: none. |
| time group | `\|time=Live` | — | — | inherit | Views of a group zoom and point at the same time; another group stays on its own. Values: inherit, dashboard, or a name shared by the views that zoom together. |
| follows groups | `\|follow=motors` | — | — | none | The view takes the telemetries of these groups that it can display, those received and those to come. Values: groups separated by commas. |

### 2D map

The scene from above.

Drag: move · wheel: zoom · double click: fit · with CMD on, a writable pose is moved and turned.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| 2D position | `name:x:y\|xy` | `tp.update("name", Teleplot::Number2D{x, y})` | `tp.update("name", Teleplot.Number2D(x, y))` |  | A position on a map, with the trail of where it went. Values: x forward, y to the left, in your units; a time can follow: x:y:time. |
| kind | `S:kind` | `.shape(Teleplot::Rect)` | `.shape(Teleplot.Rect)` | rect in 2D\|, cube in 3D\| | What the shape is. Values: rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl. |
| point cloud | `name:x:y:z;x:y:z\|pc` | `.cloud(points)`<br>Arduino: `.cloud(points, n)` | `.cloud(points)` |  | All the points of the line are one sample (a scan), in the frame of the sensor. Values: x:y:z per point, separated by ; (a flat scan: z = 0, shown in 2D). |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| color | `C:color` | `.color("orange")` | `.color("orange")` | of the palette | Its color (of the whole shape). Values: a CSS name or #rrggbb (C++ also Teleplot::Rgb{r, g, b}). |
| group | `name,group:value` | `.label("motors")` | `.label("motors")` | none | Telemetries of a group share a view of the Live dashboard, and views can follow a group. Values: any text after a comma (a / means nothing special); one group per telemetry. |
| grid | `\|displayGrid=` | `\|displayGrid=` | `\|displayGrid=` | true | The grid of the ground. Values: true or false. |
| axes | `\|displayAxes=` | `\|displayAxes=` | `\|displayAxes=` | true | The axes of the scene at its origin. Values: true or false. |
| to the right | `\|axisRight=` | `\|axisRight=` | `\|axisRight=` | x | Which axis of the scene goes to the right of the map (also decides what is drawn on top). Values: x, -x (−x), y, -y (−y), z, -z (−z). |
| to the top | `\|axisUp=` | `\|axisUp=` | `\|axisUp=` | y | Which axis of the scene goes to the top of the map. Values: x, -x (−x), y, -y (−y), z, -z (−z). |
| legend | `\|displayLegend=` | `\|displayLegend=` | `\|displayLegend=` | true | The names and values of what it shows. Values: true or false. |
| decimals | `\|displayNumberDecimals=` | `\|displayNumberDecimals=` | `\|displayNumberDecimals=` | 2 | Digits after the point of the values written. Values: from 0 to 10. |
| trail length | `\|trailLength=` | `\|trailLength=` | `\|trailLength=` | 200 | Positions drawn behind a moving point (0: none). Values: from 0 to 100000. |
| point size (px) | `\|pointSize=` | `\|pointSize=` | `\|pointSize=` | 3 | Size of the points of positions and clouds, in pixels. Values: from 1 to 20. |
| points colored by height | `\|pointColorByHeight=` | `\|pointColorByHeight=` | `\|pointColorByHeight=` | false | Points of clouds colored by their height instead of their intensity or color. Values: true or false. |
| clouds drawn together | `\|cloudCount=` | `\|cloudCount=` | `\|cloudCount=` | 1 | Clouds drawn together: the latest and the ones before it. Values: from 1 to 500. |
| time between them (s) | `\|cloudInterval=` | `\|cloudInterval=` | `\|cloudInterval=` | 0 | Time between the clouds drawn together (0: the ones that came). Values: from 0 to 3600. |
| points of a depth map (max) | `\|depthPoints=` | `\|depthPoints=` | `\|depthPoints=` | 250000 | Most points drawn from a depth map (it is thinned to that). Values: from 1000 to 4000000. |
| width | `\|w=4` | — | — | 2 (a chart), 1 (values) | Columns of a grid, a share of a row. Values: a whole number. |
| height | `\|h=3` | — | — | what it needs | Steps of 4 em (a share of a column). Values: a whole number. |
| title | `\|title=…` | — | — | the last name of the path | The text in the corner. Values: title= empty: none. |
| time group | `\|time=Live` | — | — | inherit | Views of a group zoom and point at the same time; another group stays on its own. Values: inherit, dashboard, or a name shared by the views that zoom together. |
| follows groups | `\|follow=motors` | — | — | none | The view takes the telemetries of these groups that it can display, those received and those to come. Values: groups separated by commas. |

### 3D scene

Shapes, points and clouds.

Drag: turn · right drag: move · wheel: zoom.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| 3D point | `name:x:y:z\|xyz` | `tp.update("name", Teleplot::Number3D{x, y, z})` | `tp.update("name", Teleplot.Number3D(x, y, z))` |  | A point in a 3D view, with its trail. Values: x forward, y to the left, z up; a time can follow: x:y:z:time. |
| kind | `S:kind` | `.shape(Teleplot::Rect)` | `.shape(Teleplot.Rect)` | rect in 2D\|, cube in 3D\| | What the shape is. Values: rect, circle, line, polygon, arrow, text, cube, sphere, cylinder, stl. |
| point cloud | `name:x:y:z;x:y:z\|pc` | `.cloud(points)`<br>Arduino: `.cloud(points, n)` | `.cloud(points)` |  | All the points of the line are one sample (a scan), in the frame of the sensor. Values: x:y:z per point, separated by ; (a flat scan: z = 0, shown in 2D). |
| camera | `K:fx:fy:cx:cy:w:h` | `.intrinsics(w, h, fx, fy, cx, cy)` | `.intrinsics(w, h, fx, fy, cx, cy)` | none | On an image telemetry: the pinhole model of its camera, so 3D shapes and points are drawn over its pictures. Values: in pixels: focal lengths, principal point, size of the picture they are for (OpenCV convention). |
| frame | `F:other` | `.frame("other")` | `.frame("other")` | the scene | Positions and rotations relative to another telemetry: it moves, this follows. Values: the name of a telemetry with a place; up to 16 levels; F: empty: back in the scene. |
| group | `name,group:value` | `.label("motors")` | `.label("motors")` | none | Telemetries of a group share a view of the Live dashboard, and views can follow a group. Values: any text after a comma (a / means nothing special); one group per telemetry. |
| grid | `\|displayGrid=` | `\|displayGrid=` | `\|displayGrid=` | true | The grid of the ground. Values: true or false. |
| axes | `\|displayAxes=` | `\|displayAxes=` | `\|displayAxes=` | true | The axes of the scene at its origin. Values: true or false. |
| legend | `\|displayLegend=` | `\|displayLegend=` | `\|displayLegend=` | true | The names and values of what it shows. Values: true or false. |
| decimals | `\|displayNumberDecimals=` | `\|displayNumberDecimals=` | `\|displayNumberDecimals=` | 2 | Digits after the point of the values written. Values: from 0 to 10. |
| trail length | `\|trailLength=` | `\|trailLength=` | `\|trailLength=` | 200 | Positions drawn behind a moving point (0: none). Values: from 0 to 100000. |
| point size (px) | `\|pointSize=` | `\|pointSize=` | `\|pointSize=` | 3 | Size of the points of positions and clouds, in pixels. Values: from 1 to 20. |
| points colored by height | `\|pointColorByHeight=` | `\|pointColorByHeight=` | `\|pointColorByHeight=` | false | Points of clouds colored by their height instead of their intensity or color. Values: true or false. |
| clouds drawn together | `\|cloudCount=` | `\|cloudCount=` | `\|cloudCount=` | 1 | Clouds drawn together: the latest and the ones before it. Values: from 1 to 500. |
| time between them (s) | `\|cloudInterval=` | `\|cloudInterval=` | `\|cloudInterval=` | 0 | Time between the clouds drawn together (0: the ones that came). Values: from 0 to 3600. |
| points of a depth map (max) | `\|depthPoints=` | `\|depthPoints=` | `\|depthPoints=` | 250000 | Most points drawn from a depth map (it is thinned to that). Values: from 1000 to 4000000. |
| width | `\|w=4` | — | — | 2 (a chart), 1 (values) | Columns of a grid, a share of a row. Values: a whole number. |
| height | `\|h=3` | — | — | what it needs | Steps of 4 em (a share of a column). Values: a whole number. |
| title | `\|title=…` | — | — | the last name of the path | The text in the corner. Values: title= empty: none. |
| time group | `\|time=Live` | — | — | inherit | Views of a group zoom and point at the same time; another group stays on its own. Values: inherit, dashboard, or a name shared by the views that zoom together. |
| follows groups | `\|follow=motors` | — | — | none | The view takes the telemetries of these groups that it can display, those received and those to come. Values: groups separated by commas. |

### Image

A picture, drawn over.

Point at a values picture: the value under the pointer.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| PNG picture | `PNG\|name:base64` | `tp.telemetry("name").image(Teleplot::Png, bytes, size)` | `tp.telemetry("name").image(Teleplot.Png, data)` |  | A picture: the bytes of a .png file, in base64. An image view shows the one of the time shown. Values: base64 of the file; a time can come first (PNG\|name:time:…). |
| camera | `K:fx:fy:cx:cy:w:h` | `.intrinsics(w, h, fx, fy, cx, cy)` | `.intrinsics(w, h, fx, fy, cx, cy)` | none | On an image telemetry: the pinhole model of its camera, so 3D shapes and points are drawn over its pictures. Values: in pixels: focal lengths, principal point, size of the picture they are for (OpenCV convention). |
| lens distortion | `DC:k1:k2:p1:p2:k3` | `.distortion(k1, k2, p1, p2, k3)` | `.distortion(k1, k2, p1, p2, k3)` | none | The distortion of its lens: what is drawn over the picture is distorted the same (the picture never is). Values: Brown-Conrady coefficients, as OpenCV gives them. |
| in the pixels of | `FPX:picture` | `.pixelsOf("picture")` | `.pixelsOf("picture")` |  | Drawn in the pixels of the pictures of an image telemetry (a box around what a detector found); sizes in pixels too. Values: the name of an image telemetry; u to the right, v down, 0:0 the center of the top left pixel. |
| values picture | `RAW\|name:base64` | `tp.telemetry("name").image(Teleplot::Raw, bytes, size)` | `tp.telemetry("name").image(Teleplot.Raw, data)` |  | Plain numbers (a depth map): width and height (2 bytes each), the format (0 gray16, 1 float32), 3 bytes at 0, then the numbers, little-endian. Values: base64 of all of it; a 16-bit gray PNG works too. |
| value scale | `ATTR\|name\|scale=0.001` | `.depthMap(0.001)` | `.depthMap(0.001)` | 1 | What a number of the picture is worth: number x scale, in the unit of the telemetry. Values: a number, not 0. |
| outlines only | `\|outline=` | `\|outline=` | `\|outline=` | true | Shapes over the picture drawn as outlines only. Values: true or false. |
| outline width (px) | `\|outlineWidth=` | `\|outlineWidth=` | `\|outlineWidth=` | 3 | Width of those outlines, in pixels. Values: from 1 to 20. |
| overlay opacity (%) | `\|overlayOpacity=` | `\|overlayOpacity=` | `\|overlayOpacity=` | 70 | How much of the shapes and points is drawn over the picture. Values: from 0 to 100. |
| takes what is drawn in its pixels | `\|pixelDrawings=` | `\|pixelDrawings=` | `\|pixelDrawings=` | true | Draws what is sent in the pixels of its picture (FPX). Values: true or false. |
| colors of values (depth) | `\|colormap=` | `\|colormap=` | `\|colormap=` | turbo | Colors of a values picture. Values: turbo (Turbo), viridis (Viridis), gray (Gray). |
| colors between | `\|valueRange=` | `\|valueRange=` | `\|valueRange=` | range | Colors spread over the range of the telemetry, or over what each picture holds. Values: range (The range of the telemetry), picture (What each picture holds). |
| color scale | `\|displayColorScale=` | `\|displayColorScale=` | `\|displayColorScale=` | true | The scale of the colors with its values. Values: true or false. |
| legend | `\|displayLegend=` | `\|displayLegend=` | `\|displayLegend=` | true | The names and values of what it shows. Values: true or false. |
| decimals | `\|displayNumberDecimals=` | `\|displayNumberDecimals=` | `\|displayNumberDecimals=` | 2 | Digits after the point of the values written. Values: from 0 to 10. |
| trail length | `\|trailLength=` | `\|trailLength=` | `\|trailLength=` | 200 | Positions drawn behind a moving point (0: none). Values: from 0 to 100000. |
| point size (px) | `\|pointSize=` | `\|pointSize=` | `\|pointSize=` | 3 | Size of the points of positions and clouds, in pixels. Values: from 1 to 20. |
| points colored by height | `\|pointColorByHeight=` | `\|pointColorByHeight=` | `\|pointColorByHeight=` | false | Points of clouds colored by their height instead of their intensity or color. Values: true or false. |
| clouds drawn together | `\|cloudCount=` | `\|cloudCount=` | `\|cloudCount=` | 1 | Clouds drawn together: the latest and the ones before it. Values: from 1 to 500. |
| time between them (s) | `\|cloudInterval=` | `\|cloudInterval=` | `\|cloudInterval=` | 0 | Time between the clouds drawn together (0: the ones that came). Values: from 0 to 3600. |
| points of a depth map (max) | `\|depthPoints=` | `\|depthPoints=` | `\|depthPoints=` | 250000 | Most points drawn from a depth map (it is thinned to that). Values: from 1000 to 4000000. |
| width | `\|w=4` | — | — | 2 (a chart), 1 (values) | Columns of a grid, a share of a row. Values: a whole number. |
| height | `\|h=3` | — | — | what it needs | Steps of 4 em (a share of a column). Values: a whole number. |
| title | `\|title=…` | — | — | the last name of the path | The text in the corner. Values: title= empty: none. |
| time group | `\|time=Live` | — | — | inherit | Views of a group zoom and point at the same time; another group stays on its own. Values: inherit, dashboard, or a name shared by the views that zoom together. |
| follows groups | `\|follow=motors` | — | — | none | The view takes the telemetries of these groups that it can display, those received and those to come. Values: groups separated by commas. |

### Joystick

Drives a continuous setting.

Drag the pad or the rocker; with keyboard=arrows, the arrows while the view has the focus.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| type | `write=number\|bool\|text\|xy\|xyz\|pose2d` | `float, double, int, bool, std::string, Number2D, Number3D, Pose2D`<br>Arduino: `float, double, int, bool, char[N], Number2D, Number3D, Pose2D` | `float, int, bool, str, Number2D, Number3D, Pose2D` | of its data | What it holds: number (a slider), bool (a switch: 0 or 1), text, xy, xyz, pose2d (x, y, an angle in radians). Values: number, bool, text, xy, xyz, pose2d. |
| rate | `ATTR\|name\|write=…\|rate=20` | `.rate(20)` | `.rate(20)` | none | Continuous: while it is held, the page sends the value that many times per second (a joystick). Values: per second. |
| hold | `ATTR\|name\|write=…\|hold=200` | `.hold(200)` | `.hold(200)` | none | Your device stops by itself when nothing came for that long: the safety is on the device. Values: milliseconds. |
| axes | `ATTR\|name\|write=pose2d\|axes=x,yaw` | `.axes(Teleplot::X \| Teleplot::Yaw)` | `.axes(Teleplot.X \| Teleplot.Yaw)` | x, y, yaw | Which axes of a pose2d move: x,yaw is a base that cannot go sideways (one stick). Values: x, y, yaw separated by commas. |
| refused | `ACK\|name:err:why` | `.onChange([](float v) { return Teleplot::error("why"); })` | `.onChange(lambda v: Teleplot.error("why"))` |  | Your device refuses a value (optional: its value already tells). For a joystick, answered to each value it cannot apply now. |
| keyboard | `\|keyboard=` | `\|keyboard=` | `\|keyboard=` | off | Drive it with the keyboard while the view has the focus. Values: off (Off), arrows (Arrows), wasd (WASD). |
| rocker | `\|orientation=` | `\|orientation=` | `\|orientation=` | horizontal | Rocker of a number: horizontal (right for +) or vertical (up for +). Values: horizontal (Horizontal), vertical (Vertical). |
| width | `\|w=4` | — | — | 2 (a chart), 1 (values) | Columns of a grid, a share of a row. Values: a whole number. |
| height | `\|h=3` | — | — | what it needs | Steps of 4 em (a share of a column). Values: a whole number. |
| title | `\|title=…` | — | — | the last name of the path | The text in the corner. Values: title= empty: none. |
| time group | `\|time=Live` | — | — | inherit | Views of a group zoom and point at the same time; another group stays on its own. Values: inherit, dashboard, or a name shared by the views that zoom together. |
| follows groups | `\|follow=motors` | — | — | none | The view takes the telemetries of these groups that it can display, those received and those to come. Values: groups separated by commas. |

## Dashboards

### DASH| lines

A view per line.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| a DASH\| line | `DASH\|dashboard/…/view:type:telemetries\|option=value` | `tp.dashboard("DASH\|…")` | `tp.dashboard("DASH\|…")` |  | One line per view, addressed by its path: missing layouts are created. Lines can come in any order and again: a line only does something when it changed. Values: the last name is the title of the view; #1 is a name without title. |
| type | `:chart` | — | — | what suits its first telemetry | What it is. Values: chart, values, log, timeline, graph, 2d, 3d, image, joystick; row, column, grid, stack (layouts); none removes it. |
| telemetries | `:speed,accel` | — | — | none | What it shows, by name: they do not have to exist yet. Values: names separated by commas. |
| width | `\|w=4` | — | — | 2 (a chart), 1 (values) | Columns of a grid, a share of a row. Values: a whole number. |
| height | `\|h=3` | — | — | what it needs | Steps of 4 em (a share of a column). Values: a whole number. |
| title | `\|title=…` | — | — | the last name of the path | The text in the corner. Values: title= empty: none. |
| time group | `\|time=Live` | — | — | inherit | Views of a group zoom and point at the same time; another group stays on its own. Values: inherit, dashboard, or a name shared by the views that zoom together. |
| follows groups | `\|follow=motors` | — | — | none | The view takes the telemetries of these groups that it can display, those received and those to come. Values: groups separated by commas. |
| the dashboard alone | `DASH\|dashboard:type` | — | — | grid | Its top layout. Values: row, column, grid, stack. |
| special characters | `%XX` | — | — |  | In names of nodes, thresholds, dashboards and in ATTR\| values, these characters are written %XX (their code in hexadecimal). Values: % , ; \| # / > = : < and line breaks, depending on where (%2C for a comma). The clients escape by themselves. |

### Layouts

Row, column, grid, stack.

```
DASH|Robot/side:column|align=stretch|gap=0.5
```

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| type | `:chart` | — | — | what suits its first telemetry | What it is. Values: chart, values, log, timeline, graph, 2d, 3d, image, joystick; row, column, grid, stack (layouts); none removes it. |
| justify | `\|justify=start` | — | — | start | Of a row or a column: where its views go along it. Values: start, center, end, space-between, space-around. |
| align | `\|align=stretch` | — | — | stretch (start in the editor) | Of a row or a column: where its views go across it. Values: start, center, end, stretch. |
| gap | `\|gap=1` | — | — | 1 | Of a layout: the space between its views. Values: in em. |
| column width | `\|columnWidth=16` | — | — | 16 | Of a grid: the minimum width of a column; the number of columns follows the width. Values: in em, 8 to 40. |
| appearance | `\|appearance=flat` | — | — | card at the top | Of a layout: views as cards, flat (hairlines, no gap), or as the layout around. Values: card, flat, inherit. |
| top color | `\|accent=off` | — | — | on at the top | Of a layout: the colored line on top of its views. Values: on, off, inherit. |
| width | `\|w=4` | — | — | 2 (a chart), 1 (values) | Columns of a grid, a share of a row. Values: a whole number. |
| height | `\|h=3` | — | — | what it needs | Steps of 4 em (a share of a column). Values: a whole number. |

## Client

### Set-up

Where it sends.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| the client | — | `Teleplot& tp = Teleplot::instance()`<br>Arduino: `Teleplot tp(Serial)` | `tp = Teleplot.instance()` | 127.0.0.1:47269 | The default client: UDP to the Teleplot server (Arduino: the serial port). |
| a client of your own | — | `Teleplot tp(Teleplot::Options().udp("10.0.0.2", 47269).file("run.teleplot").output(fn))`<br>Arduino: `Teleplot tp(udp, host, port)` | `tp = Teleplot(udp=("10.0.0.2", 47269), file="run.teleplot", output=fn)` |  | Where it sends: as many outputs as wanted. Values: Options: udp(host, port), file(path) (a binary data file), output(function). |
| options | — | `Teleplot::Options().name("rover").clientId(0).flushInterval(Teleplot::ms(20)).sendFrom(Teleplot::Thread).describeInterval(Teleplot::ms(5000)).publishInterval(Teleplot::ms(200)).maxQueuedBytes(1 << 20).nonBlocking(false)`<br>Arduino: — | `Teleplot(name="rover", flushInterval=0.02, sendFrom=Teleplot.Thread, describeInterval=5.0, publishInterval=0.2, maxQueuedBytes=1 << 20, nonBlocking=False)` |  | name (default: the program's), clientId (0: from the name), flushInterval (20 ms; 0: on flush() and poll()), sendFrom (the caller or a thread of its own), describeInterval (descriptions sent again, 5 s), publishInterval (settings, 200 ms), maxQueuedBytes (1 MB: beyond, the oldest go first), nonBlocking. setOptions(Options) changes them later, options() reads them. |
| change the options | — | `tp.setOptions(Teleplot::Options().flushInterval(Teleplot::ms(0))); tp.options()`<br>Arduino: — | `tp.setOptions(flushInterval=0); tp.options()` |  | Options changed later; tp.options() reads them. |
| another destination | — | —<br>Arduino: `tp.addOutput(file)` | — |  | A second Print (a file on an SD card): it gets the plain lines. |
| the clock | — | `tp.clock(fn)` | `tp.clock(fn)` | system_clock / micros() | Where now comes from (a simulation or ROS time). Values: a function giving a Time; tp.currentTime() reads it. |
| now | — | `tp.currentTime()`<br>Arduino: — | `tp.currentTime()` |  | Now, on the clock of this client. |
| off | — | `tp.disable() / tp.enable()` | `tp.disable() / tp.enable()` | on | Off at run time; #define TELEPLOT_DISABLE compiles it out. |
| lines | `line\nline` | — | — |  | Several lines in one packet or one write, separated by a line break. A UDP packet should stay under about 1400 bytes. The clients pack lines by themselves. |
| on a serial port | `>line` | — | — |  | Telemetry starts with >; any other line is a log line of the port. The Arduino library writes the > by itself. |

### Sending

Samples, times, rates.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| a sample | — | `tp.update("name", value[, time])` | `tp.update("name", value[, time])` |  | A number, bool, text, Number2D or Number3D. |
| a log line | — | `tp.log(["name",] "text"[, time])` | `tp.log(["name",] "text"[, time])` |  | A log line (default name: log). |
| what runs | — | `tp.stack("name", "path"[, time])` | `tp.stack("name", "path"[, time])` |  | The path of a stack. |
| dashboard lines | — | `tp.dashboard("DASH\|…")` | `tp.dashboard("DASH\|…")` |  | Sends DASH\| lines (several separated by \n). |
| a handle | — | `Teleplot::Telemetry speed = tp.telemetry("speed")`<br>Arduino: `auto speed = tp.telemetry("speed")` | `speed = tp.telemetry("speed")` |  | The handle of a telemetry: faster than by name in a loop; its calls chain; name() gives the name back. |
| a time of yours | — | `.at(Teleplot::ms(t))` | `.at(Teleplot.ms(t))` | now (one for the chain) | Every sample of the chain gets that time: first in a chain only. Values: a Teleplot::Time. |
| times | — | `Teleplot::now(), Teleplot::ms(x), Teleplot::us(x), Teleplot::ns(x)` | `Teleplot.now(), Teleplot.ms(x), Teleplot.us(x), Teleplot.ns(x)` |  | Times: now() is the clock of the client (system time; micros() since boot on Arduino). |
| degrees | — | `Teleplot::deg(90)` | `Teleplot.deg(90)` |  | Degrees to radians (angles are radians). |
| send now | — | `tp.flush()` | `tp.flush()` | every 20 ms | Sends what is queued now. |
| read and answer | — | `tp.poll()` | `tp.poll()` |  | Reads what the page sent, applies settings, answers calls, publishes settings, sends: call it in your loop when the page can change something. |
| most per second | — | `.maxRate(50)` | `.maxRate(50)` | 0: all | The client keeps at most that many samples per second (the others are not sent). Values: samples per second. |
| exact numbers | — | `.precise()` | `.precise()` | float32 | Numbers sent as float64: no rounding. Values: on or off. The text protocol writes numbers as given (the Arduino library: 9 significant digits, 15 with precise()). |
| never wait | — | `.nonBlocking()`<br>Arduino: — | `.nonBlocking()` | Options' (false) | Never waits for the lock of the client: a sample that cannot be queued at once is dropped (counted). |
| what came back | — | `tp.handlePacket(data, size)`<br>Arduino: `tp.handleLine("text")` | `tp.handlePacket(data)` |  | What the page sent, when it reaches you by another way. |

### Commands

Settings and actions in code.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| a setting | — | `tp.param("name", &variable)` | `tp.param("name", initial)  or  tp.param("name", object, "attribute")` |  | A setting the page may write: Param<T> chains range, min, max, step, unit, desc, enumValues, rate, hold, axes, onChange. A number is clamped to the range and rounded to the step. |
| when it changes | — | `.onChange([](float const& v) { return Teleplot::ok(); })` | `.onChange(lambda v: Teleplot.ok())` | applied | Called with the value the page wrote: return ok, or error(why) to refuse. |
| an action | — | `tp.action("name", [](Teleplot::Args const& args) { return Teleplot::ok(); })` | `tp.action("name", handler)  or  @tp.action("name")` |  | An action the page may call: Action chains title, desc, color, confirm, longpress, arg. |
| an argument | — | `Teleplot::Arg("speed", Teleplot::Arg::Number).optional().defaultValue(0.5).range(0, 1).step(0.1).unit("m/s").enumValues({}).desc("…")` | `Teleplot.Arg("speed", Teleplot.Arg.Number).optional().defaultValue(0.5)` |  | An argument of an action. Values: types Number, Bool, Text, XY, XYZ, Pose2D. |
| the arguments | — | `args.has("a"), args.number("a"), args.flag("a"), args.text("a"), args.xy("a"), args.xyz("a"), args.pose2d("a"), args.call()`<br>Arduino: `args.has("a"), args.number("a"), args.flag("a"), args.text("a"), args.xy("a"), args.xyz("a"), args.pose2d("a")` | `args.has("a"), args.number("a"), args.flag("a"), args.text("a"), args.xy("a"), args.xyz("a"), args.pose2d("a"), args.call()` |  | What the handler gets: the arguments by name; call() keeps the call to answer it later. |
| answers | — | `Teleplot::ok("text"), Teleplot::error("why"), Teleplot::running()`<br>Arduino: `Teleplot::ok("text"), Teleplot::error("why")` | `Teleplot.ok("text"), Teleplot.error("why"), Teleplot.running()` |  | What a handler returns; running(): finished later with tp.answer(call, result). |
| answer later | — | `tp.answer(call, Teleplot::ok())`<br>Arduino: — | `tp.answer(call, Teleplot.ok())` |  | Finishes a call whose handler returned running(). |
| read and answer | — | `tp.poll()` | `tp.poll()` |  | Reads what the page sent, applies settings, answers calls, publishes settings, sends: call it in your loop when the page can change something. |

### Pictures

Pixels to JPEG or PNG.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| a picture | — | `.image(Teleplot::Jpeg, bytes, size)  or  .image(picture)` | `.image(Teleplot.Jpeg, data)  or  .image(picture)` |  | JPEG, PNG or RAW bytes, cut in parts by the client. |
| encode pixels | — | `TeleplotImage::encode(pixels[, TeleplotImage::Jpeg{80}])`<br>Arduino: — | `TeleplotImage.encode(pixels, TeleplotImage.Jpeg(80))` | JPEG 80 | Pixels to a JPEG or PNG (or RAW for depth): Pixels{data, width, height, format, stride}; formats Gray8, Gray16, Float32, RGB8, BGR8, RGBA8, BGRA8, YUYV. Values: Png{} keeps the pixels exactly (16-bit gray for depth). |
| send pixels | — | `TeleplotImage::send(tp.telemetry("camera"), pixels)`<br>Arduino: — | `TeleplotImage.send(tp.telemetry("camera"), pixels)` |  | Encoded on a thread of the client then sent: the picture being encoded always finishes, only the latest one waits. |
| picture tools | — | `TeleplotImage::load(path), TeleplotImage::typeOf(bytes, size), TeleplotImage::shrink(pixels, factor), TeleplotImage::copy(pixels), TeleplotImage::stats(tp)`<br>Arduino: — | `TeleplotImage.load(path), TeleplotImage.typeOf(data), TeleplotImage.shrink(pixels, factor), TeleplotImage.stats(tp)` |  | A file as it is, its type, smaller by a whole factor, a copy, the counts of the encoder. |

### Threads and statistics

How the client runs.

| Value | Text | C++ / Arduino | Python | Default | What it does |
|---|---|---|---|---|---|
| statistics | — | `tp.sendStats(Teleplot::ms(1000)); tp.statsInterval()` | `tp.sendStats(Teleplot.ms(1000)); tp.statsInterval()` | off | The counts of the client as telemetries (groups teleplot sent, teleplot problems, teleplot images). Values: how often; Teleplot::ms(0): off; tp.statsInterval() reads it. |
| counts | — | `tp.stats()` | `tp.stats()` |  | packets, bytes, samples, dropped, tooBig, sendErrors, wrongThread. |
| threads | — | `tp.threadPriority(Teleplot::Low); tp.threadAffinity(Teleplot::ThreadAffinity::cpus({3}))`<br>Arduino: — | `tp.threadPriority(Teleplot.Low)` | BelowCaller, automatic | Priority and CPUs of the threads of the client (sending, encoding pictures). Values: BelowCaller, Normal, Low, ThreadPriority::realtime(p), ThreadPriority::value(v); ThreadAffinity::automatic(), followCaller(), any(), cpus({…}). |
| a thread's name | — | `Teleplot::threadName("camera")`<br>Arduino: — | `Teleplot.threadName("camera")` |  | The name of the calling thread, for the telemetries of its stacks (name.thread). |
| one thread | — | `.oneThread()` | `.oneThread()` | named per thread | A stack used from one thread only: no thread names. |
| companions | — | `tp.extension<T>()`<br>Arduino: — | — |  | The state a companion header keeps in the client (TeleplotImage.h's thread). |
| a level while it lives | — | `Teleplot::Stack(tp, "name", "level")` | `with Teleplot.Stack(tp, "name", "level"):` |  | A level pushed when the object is made, popped when it ends (other threads: name.thread). Clients only: the text protocol sends the paths (stack row). |

---

[All documentation](README.md) · [Teleplot](../README.md)
