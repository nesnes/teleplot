# Text protocol

The human-readable protocol of Teleplot: one line per message, easy to write from any language. It is the protocol of Teleplot V1,
extended: every V1 line is still understood. The Help panel of the webapp is the same reference, with a tile per thing to display, the
lines to send it in your language, and a field to try a line.

Where lines go:

- **UDP** port `47269`, to the Teleplot server ([`server.md`](server.md)), which relays them to the page. Several lines can share a packet,
  separated by `\n`.
- **A serial port** read by the page itself ([`sources.md`](sources.md)): a line starting with `>` is telemetry (what follows the `>` is the line
  below), any other line is a log line.
- **A file** of such lines, opened in the page ([`files.md`](files.md)).

The binary protocol ([`binaryProtocol.md`](binaryProtocol.md)) says the same things, more compactly.

## Numbers

`name:time:value§unit|flags`

- **name**: the name of the telemetry (avoid `:` `|` `,` `;` in it). A comma starts a label (see "Display telemetries together").
- **time** (optional): the timestamp in milliseconds since 1970 (`1627551892437`, decimals allowed). Without it, the sample is dated when
  the server received its packet (or when the page read the serial line). A time below 1973 (under `1e11`) is taken as the time since
  the boot of a board without a date (`millis()`): the page dates it when it arrives, keeping the spacing the board measured, and notices
  reboots (option "Times since boot" of each source, on by default: see [`sources.md`](sources.md)).
- **value**: an integer or a floating point number, or a text (see "Texts").
- **unit** (optional): after `§` (avoid `,;:|.` in it). It can also be given once with `ATTR|` (see "Unit, color, description").
- **flags** (optional): how to read and display the data, separated by commas.

```
myValue:1234
myValue:1234|g
myValue:12.34e+2
myValue:1627551892437:1234
myValue:1234§km²
```

The format is inspired by `statsd` and to some extent compatible with it (`|g` is accepted).

### Several samples, several telemetries

Several samples of one telemetry can be sent in one line, separated by `;`. They arrive together, so give each its time:

```
myValue:1627551892444:1;1627551892555:2;1627551892666:3
myValue:1627551892444:1;1627551892555:2;1627551892666:3§rad
state:1627551892444:state_a;1627551892555:state_b|t
trajectory:1:1;2:2;3:3;4:4|xy
```

Several telemetries can be sent in one packet, a line each:

```
myValue:1234
mySecondValue:1234§m/s
myThirdValue:1627551892437:1234
state:state_a|t
trajectory:1:1;2:2;3:3;4:4|xy
```

A packet must fit in one UDP datagram, which can be limited to 512 (Internet), 1432 (local networks) or 8932 (jumbo frames) bytes
depending on the network.

### Flags

| Flag | Meaning |
| --- | --- |
| `xy` | two values: a position on a map (a 2D view), with the trail of where it went |
| `xyz` | three values: a point in a 3D view, with its trail |
| `pc` | a point cloud: all the points of the line are one sample |
| `t` | a text that is a state |
| `log` | a text that is a log |
| `stack` | a text that is the path of what runs (several at once separated by `,`, each with an optional `=status`) |
| `enum` | the states or nodes of a telemetry, or the texts a setting can take (its structure: see "Graphs") |
| `edges` | the transitions of a state machine (see "Graphs") |
| `np` | no plot: teleplot does not display it by itself |
| `clr` | clear the previous values of the telemetry first (cyclic data, like lidar points) |

## Positions and points

With the `xy` flag and two values, teleplot displays the position on a map (a 2D view), with the trail of where it went: an XY plot.
A time can follow the two values.

```
trajectory:12.3:45.67|xy
trajectoryTimestamped:1:1:1627551892437;2:2:1627551892448;3:3:1627551892459|xy
```

The line shows as soon as two values have been received (a single one is a dot).

With the `xyz` flag and three values, teleplot displays a point in a 3D view, followed by the trail of its latest positions. Like for
`xy`, a time can follow the three values.

```
drone:1.5:0.2:3|xyz
drone:1.5:0.2:3:1627551892437|xyz
```

## Point clouds

With the `pc` flag, all the points of a line are one sample: a point cloud (lidar scan, depth camera...), shown in a 3D view (or a 2D
view when it is flat).

```
lidar:1:0:0;0.7:0.7:0;0:1:0|pc
lidar:1627551892437;1:0:0;0:1:0|pc
```

Points are `x:y:z` in the frame of the sensor (a 2D scan sets z to 0). They can carry an intensity (`x:y:z:i`), a color (`x:y:z:r:g:b`)
or both (`x:y:z:i:r:g:b`). A field alone at the start is the time of the cloud. The pose of the sensor is sent like the one of a
shape: `3D|lidar:P:1:2:0.2:R:0:0:1.57`. See [`3d.md`](3d.md) "Point clouds".

## Texts

Text sent with `t` is a **state**: what matters is its latest value, and it is shown as a value by default. Text that is a **log**
(lines to read one after the other) uses the `log` flag instead and gets a log view by default:

```
motor_4_state:Turned On|t
motor_4_state:1627551892437:Off|t
motor_4_events:Overcurrent detected|log
motor_4_events:1627551892437:Back to normal|log
```

Both are the same kind of data and both views display both: the flag only chooses the view a telemetry gets when nobody arranged it.

A state lasts until it changes: sending the same text again changes nothing. An empty text is a state too (`motor_4_state:|t`:
nothing). A text may hold colons (`motor_4_state:error: stalled|t`); its time, when it has one, is a first field that is a number.

A state can be a **stack**: the path of what is running, a slash between levels, with the `stack` flag. It is displayed on a timeline,
a row per level, like a profiler:

```
task:loop/plan/search|stack
task:1627551892437.25:loop/plan|stack
```

Several things can run at once: their paths separated by commas, each with an optional status after `=` (what it ended with, any
word: `failure`, `success`...). A path without status runs, and so do the levels that hold it. Lines with the same time (written by
your device) are parts of one sample: a tick too long for one message can be split.

```
bt:root/patrol/battery_ok=failure,root/patrol=failure,root/dock|stack
nav:1627551892437:nav/follow|stack
nav:1627551892437:arm/idle|stack          (the same time: nav/follow and arm/idle run at once)
```

Text telemetries can also be seen along the time: as bands in a **timeline** view (a tick per line for a log), and as **marks** on a
chart they are added to. Both are views you ask for (edit mode, or a `DASH|` line): see [`time-views.md`](time-views.md).

### Graphs: state machines and behavior trees

A state or a stack can have a **structure**: its states or nodes (`|enum`: paths, a slash between levels, an optional `#kind` at the
end of one) and its transitions (`|edges`: `from>to` or `from>to=event`). A graph view draws it, and what runs in it. A structure is
a sample: it holds from its time until a newer one; lines with the same time are parts of one (a big structure in several messages).
In names, `,` `;` `|` `#` `/` `>` `=` `%` are written `%XX`. Everything is in [`graph.md`](graph.md).

```
mode:idle,mission/goto,mission/grasp,error|enum                     its states: mission holds goto and grasp
mode:idle>mission=start,mission/goto>mission/grasp=arrived|edges    its transitions, with what makes them happen
mode:mission/goto|stack                                             where it is
bt:root#fallback,root/patrol#sequence,root/dock#action|enum         a behavior tree: no edges, the paths make the tree
```

### Log lines

A line that starts with `>` is a log line of its own, displayed in a console-like manner. A time in milliseconds keeps it in step with
the charts:

```
>:Hello world
>1627551892437:Hello world
```

## Ranges and thresholds

What a number is expected between is an attribute of its telemetry, sent once with an `ATTR|` line. Its value then gets a bar, and a
chart can use the range as its scale:

```
ATTR|battery|min=9|max=12.6
```

The limits a number should not pass are thresholds: a name, `<` or `>` (the side that is past the limit), a value, and a color if you
want one. Charts draw them as dashed lines, values tell which one is passed:

```
TH|battery:low<10.5:empty<9.9,red
TH|motor_temp:1627551892437:hot>70           (with a time, in ms, before the name)
TH|battery:low<                              (without value: removed)
```

A threshold holds from its time until another one of the same name: limits can change, and what was drawn before keeps the limit it
had. See [`time-views.md`](time-views.md).

## Unit, color, description

`ATTR|` lines also describe any telemetry, once (again at will), before or after its data:

```
ATTR|tank|unit=L|color=teal|desc=Water left in the tank
```

`unit` is shown after its values (like `§unit`), `color` is its color in every view, and `desc` is the tooltip of its name wherever it is
shown: chart and scene legends, values, log lines, timeline lanes, joysticks, and the Telemetries, Edit, Sources and Export panels. In the values of `ATTR|` lines, `% | , = :` and line breaks are written `%XX`.

Other keys of `ATTR|` lines: `write`, `action`, `arg` and their options declare commands (see "Commands"); `scale`, `nodata` and
`depth` tell how to read a depth map (see "Images").

## Where telemetries are displayed

### Not displayed by itself

By default, teleplot displays every incoming telemetry (the Live dashboard). This is handy with a few telemetries, less with many. The
`np` flag (no plot) prevents it:

```
myValue:1627551892437:1234|np
trajectory:12.3:45.67|xy,np
```

### Display telemetries together

A label can follow the name of a telemetry, after a comma: `name,label:value`. Telemetries that have the same label are displayed in
the same view when teleplot displays them by itself: numbers of a label share a chart, its 3D shapes a 3D view, the rest a values view.

```
left,motors:0.42
right,motors:0.40
state,motors:running|t
```

The label is not part of the name (the telemetries above are `left`, `right` and `state`). It only decides where a telemetry first
goes: views can be rearranged freely afterwards. In the Telemetries panel each label has a card of its own, to drag all its telemetries
on a dashboard at once. A view that received a label this way (and the views teleplot made for a label by itself) follows it:
telemetries that show up later with the same label are added to it. This can be stopped per view in the edit panel.

### Choosing the dashboard, describing dashboards

A label that is a path says in which dashboard and which view a telemetry goes; both are created if needed:

```
speed,Robot/Motion:12.5
accel,Robot/Motion:0.3
```

A whole dashboard can be described with `DASH|` lines, one per view, addressed by the same paths:

```
DASH|Robot/Motion:chart:speed,accel|w=4|h=3
DASH|Robot/side/Log:log:robot.log|maxLines=50
DASH|Robot/side:column
DASH|Robot/States:timeline:state,robot.log
```

Lines can come in any order and be sent again at will (a line only does something when it changed). The dashboard menu exports any
dashboard as a file of such lines and imports them. The format is described in [`dashboard-text.md`](dashboard-text.md).

## Images

`PNG|` or `JPG|`, the name, then the file itself (the bytes of the .png or .jpg) in base64. A time in milliseconds can come before it,
as for numbers:

```
PNG|camera:iVBORw0KGgoAAAANSUhEUg...
JPG|camera:1627551892437:/9j/4AAQSkZJRg...
```

An image view shows the picture of the time shown (drag on a chart: the picture follows). A picture is often bigger than one message
should be: a UDP packet holds 65 kB at most and is more likely lost above about 1.4 kB (a network frame), and a serial line or the
buffer of a microcontroller holds less. Cut the base64 in parts and send each in its own message with `i/n` before it, part i of n,
numbered from 1:

```
PNG|camera:1627551892437:1/3:iVBORw0KGgo...
PNG|camera:1627551892437:2/3:...
PNG|camera:1627551892437:3/3:...
```

The parts can arrive in any order; the picture is stored when all n are there, and a lost part only loses that picture. With a time,
every part of a picture has the same one (a part with another time starts a new picture).

Pictures can be placed in 2D and 3D scenes and drawn over (see "3D shapes" and "2D drawings, frames"). A **depth map** (a picture of
distances: a 16-bit gray PNG, or plain numbers with `RAW|`) is shown in colors, with the value under the pointer, and placed in 3D when
it has a camera: see [`depth.md`](depth.md).

## 3D shapes

`3D|name:time:properties|flags`: the name of the shape telemetry (a comma starts a label, as for numbers: shapes with the same label
are displayed in the same 3D view by default, shapes without label all share one), an optional time, then the properties of the shape,
each followed by its values, all separated by colons.

Shapes live in a right-handed frame: **x forward, y left, z up** (the grid of the 3D view is the ground, z = 0). Angles are in radians.
Each shape is a telemetry: it is listed with the others, and several of them can be put in the same 3D view. How they are displayed is
described in [`3d.md`](3d.md).

| Property | Values |
| --- | --- |
| `shape` or `S` | the type: `cube`, `sphere`, `cylinder`, `stl`, and the flat ones of `2D|` lines (`rect`, `circle`, `line`, `polygon`, `arrow`, `text`) |
| `url` or `U` | the url of the STL file of an `stl` shape, between quotes (an url holds colons): `U:"http://my.url/file.stl"` |
| `position` or `P` | x, y, z of the center of the shape |
| `rotation` or `R` | Euler angles: roll (around x), pitch (around y), yaw (around z). A quaternion is preferred |
| `quaternion` or `Q` | x, y, z, w |
| `color` or `C` | a color: `blue`, `#2ecc71`... |
| `opacity` or `O` | between 0 (transparent) and 1 (opaque, the default) |
| `texture` or `T` | `url` and an url (`T:url:"http://my.url/file.jpg"`), or `telem` and the name of an image telemetry (`T:telem:myImageTelem`). The color blends with the texture: use `white` to see it as it is |
| `scale` or `SC` | the size along the shape's own x, y and z, written like a position. Every shape is 1 by default (a cube 1 per side, a sphere 1 across, a cylinder 1 across and 1 high); an STL file is in its own units (`SC:0.001` turns millimeters into meters). `SC:x:y` keeps z, one value alone (`SC:2`) is the same on every axis, an empty value keeps what the shape had (`SC::2:`) |
| `radius` or `RA` | the radius of a sphere or a cylinder (the same as `SC` of twice the radius on every axis) |
| `width` or `W`, `depth` or `D`, `height` or `H` | Teleplot V1 sizes, still understood: the size along x, y and z (y in a `2D|` line for `H`). `SC` replaces them |
| `precision` or `PR` | accepted for compatibility with Teleplot V1, ignored (spheres and cylinders are always drawn smooth) |
| `frame` or `F` | the name of another telemetry: positions are relative to it (see "2D drawings, frames") |

A cylinder stands along the z axis: `SC` x and y are its diameters, z its height.

To leave out some values of a property, keep the colons: `P::-1:1` does not give x. A property that is not given keeps its previous
value; properties never given have a default: a cube of 1 at the origin, not rotated, opaque, in the color of its telemetry. Every
property can be changed at any time, including the shape and the color.

```
3D|mySimpleCube:S:cube:P:1:1:1:R:0:0:0:SC:2:2:2:C:#2ecc71
3D|mySimpleSphere:1627551892437:S:sphere:P::2::RA:2:C:red
```

A cube that grows and rotates: the shape first, then only what changes.

```
3D|my_super_cube:S:cube:SC:1:1:1:C:blue
3D|my_super_cube:SC:1.2::R::0.2:
3D|my_super_cube:SC:1.4::R::0.4:
```

Two shapes in the same view, by their label:

```
3D|myCube,widget0:S:cube
3D|mySphere,widget0:S:sphere
```

An STL file (it must be downloadable by the page: online with the right CORS policy, or served next to the webapp with
`--serve`, see [`server.md`](server.md)):

```
3D|myBlueTeapot:S:stl:U:"https://upload.wikimedia.org/wikipedia/commons/9/93/Utah_teapot_%28solid%29.stl":SC:0.3:C:#3498db
```

- A page opened later, or reloaded, knows nothing of what was sent before it: send every property from time to time (the client
  libraries do it by themselves every 5 s), or it uses defaults, or draws nothing when it does not know the type of the shape.
- Views are drawn 30 times per second: sending a shape more often than that is not visible live (every update is stored though, and
  can be seen again by hovering a chart of the same dashboard: the 3D view shows the shapes as they were at that time).

### The camera of an image

A `3D|` line sent to the name of an image telemetry describes its camera. 3D shapes and points can then be drawn over its images, as
the camera saw them (image view).

| Property | Values |
| --- | --- |
| `intrinsics` or `K` | the pinhole model, in pixels: fx, fy (focal lengths), cx, cy (principal point), width, height (size of the image they are given for) |
| `distortion` or `DC` | lens distortion coefficients (optional): k1, k2, p1, p2, k3 |
| `position`, `rotation`, `quaternion` | where the camera is, in the same frame as the shapes: the camera looks along its x axis, y is to the left of the image, z to its top |
| `scale` or `SC` | how far the camera is drawn in 3D views (as the pyramid of what it sees), its x |

Intrinsics and distortion follow the usual image convention (the one of OpenCV and ROS: pixel 0,0 is the center of the top left pixel,
u to the right, v down; Brown-Conrady distortion model). Images are displayed as received, never undistorted: what is drawn over them is
distorted like the lens does.

```
JPG|camera:1627551892437:<base64 image>
3D|camera:K:554.3:554.3:320:240:640:480
3D|camera:1627551892437:P:1.2:0.4:0.25:Q:0:0:0.38:0.92
3D|camera:DC:-0.28:0.07:0.0002:0.0001:0
```

## 2D drawings, frames

A line starting with `2D|` is a `3D|` line written flat: `x:y` positions, one angle. Flat shapes (`rect`, `circle`, `line`,
`polygon`, `arrow`, `text`) are seen from above in a 2D view, and lie on the ground of a 3D view; 3D shapes show in a 2D view as what
they cover. Nothing is sent twice.

```
2D|robot,field:S:rect:P:1.2:0.8:R:1.57:SC:0.3:0.2:C:blue
2D|route,field:S:line:PT:0:0:1:0.5:2:2:C:green              (add LW:0.2 for a real width, in your units)
2D|zone,field:S:polygon:PT:0:0:1:0:1:1:0:1:C:red:O:0.3
2D|goal,field:S:text:P:3:1:TX:"Goal A"
```

With a frame, positions are relative to another telemetry, which carries them along; it works for shapes, cameras, points and point
clouds, in 2D and in 3D lines:

```
2D|heading,field:S:arrow:V:0.4:0:F:robot
```

A pixel frame draws in the pixels of the pictures of an image telemetry, without knowing anything about its camera (a box around what a
detector found):

```
2D|det1:S:rect:P:120:80:SC:40:60:C:red:FPX:camera
```

Everything is described in [`2d.md`](2d.md).

## Commands

The page can also change settings of your program and call its functions. Declare them once with `ATTR|` lines, keep sending the
values, and switch **CMD** on in the top menu of the page (it is off at every start, and only shown when something can be commanded).
The page sends back the line your program would send: read it from the socket you send from (the Teleplot server answers to the
address and port your packets come from), or from the serial port.

```
ATTR|kp|write|min=0|max=10|step=0.01          a setting: the page shows a slider; it sends kp:0.42
kp:0.4                                        keep sending the value: when it comes back as asked, the page knows it was applied
ATTR|mode|write=text                          a text…
mode:auto,manual#by hand|enum                 …among these (its enum; #: a caption)
ATTR|cmd_vel|write=pose2d|axes=x,yaw|rate=20|hold=200    driven by a joystick view; stop when nothing came for 200 ms
ATTR|goto|action|title=Go to                  an action: a button
ATTR|goto|arg=target|type=xy                  its arguments, one line each: the button opens a form
                                              the page sends !goto#12:target=1.5,2 (a call and its number)
ACK|goto#12:run                               answer run when it starts, then ok (or err:why)
ACK|goto#12:ok
```

Everything about them: [`telecmd.md`](telecmd.md).

---

[All documentation](README.md) · [Teleplot](../README.md)
