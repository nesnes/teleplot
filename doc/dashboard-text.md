# Dashboards as text

A dashboard can be written as text: one line per view, addressed by its path in the dashboard. The same lines are

- a **file**: the dashboard menu of the webapp exports a dashboard as a `.teleplot.txt` file (the extension of text files: lines of the text protocol, here `DASH|` lines only); such files are opened in the Export and import panel (from "Import…" in the dashboard menu, or dropped on the page), like data files, which can hold dashboards too ([`files.md`](files.md)),
- a **message** of the text protocol: a device describes the dashboard it wants, next to its telemetry,
- the content of a **binary section** (`SECTION_TYPE_DASHBOARD`, see [`binaryProtocol.md`](binaryProtocol.md)).

```
DASH|Robot:grid
DASH|Robot/top:row
DASH|Robot/top/Motion:chart:speed,accel|w=3
DASH|Robot/top/side:column
DASH|Robot/top/side/State:values:state,battery
DASH|Robot/top/side/Log:log:robot.log|maxLines=50
```

A view can also take the telemetries of a group instead of naming them: [following groups](#following-groups).

## A line

```
DASH|<dashboard>[/<view>...][:<type>[:<telemetry>,<telemetry>...]][|<option>=<value>...]
```

- **Path**: the name of the dashboard, then the names of the views down to the one the line describes. Layouts that are missing on the way are created (as grids), so lines can be sent **in any order**, and each line stands alone. The dashboard alone (`DASH|Robot:row`) is its top layout.
- **Name of a view** (the last name of the path): its key among its siblings, and for a view that shows telemetries, its title. A name that starts with `#` (`#1`) is only a key: the view has no title.
- **Type**: `row`, `column`, `grid`, `stack` (layouts), `chart`, `values`, `log`, `timeline`, `graph`, `2d`, `3d`, `image`, `joystick`, or `none`, which removes the view (or the whole dashboard). Without a type, a view that exists keeps its own and a new one gets what suits its first telemetry (a grid when it has none): `DASH|Robot/top/Motion|h=6` only changes a height.
- **Telemetries**: by name, separated by commas. They do not have to exist yet: the view waits for them ("Waiting for data").
- **Options**: only what is written changes.

| Option | For | Value |
|---|---|---|
| `w`, `h` | everything | width and height (see the layouts in [`dashboard-editing.md`](dashboard-editing.md): a column span in a grid, a share of the space in a row or column; a height step is 4 em) |
| `title` | views | the text in the corner of the view, when it is not the name of the path (`title=` for none) |
| `time` | everything | time group: `inherit` (default), `dashboard`, or the name of a group shared by the views that name it |
| `follow` | views | labels the view follows, separated by commas: the telemetries with one of these labels join the view, those already received and those to come |
| `align`, `justify`, `gap`, `columnWidth`, `appearance`, `accent` | layouts | as in the edit panel (`align=stretch` is the default of layouts made by lines) |
| any option of the view | views | `maxLines`, `displayGrid`, `displayNumberDecimals`, `decimation`, `thresholds` (`fit` / `show` / `hide`), `scale` (`auto` / `range`), `numbers` (`auto` / `text`) and `stackDepth` (of a timeline), `trail`, `events`, `kinds` (of a graph), `trailLength`, `pointSize`... (the names of `view.options`); booleans are `true` / `false` |

**Escaping**: in names and values, the characters `% / : , | =` and line breaks are written `%XX`, the hexadecimal code of the character (`My%2Fboard` for "My/board"). Everything else is written as is, spaces and accents included.

## Receiving lines

- A line is applied **when it differs from the last one received for the same path**. A device can therefore send its dashboard again and again (every second, at each boot...): nothing happens, and what the user changed by hand stays. When the device changes a line, the view is updated in place (same view, new options, new telemetries).
- A dashboard that the user deleted stays deleted while its lines are repeated, and comes back whole as soon as one of them changes. A dashboard that the user renamed still gets the lines of its sender.
- Changing the type of a layout to another layout keeps the view; other changes replace it and keep what it holds (the children of a layout, the telemetries and the title of a view).
- A line that lists telemetries sets the list of its view; telemetries it has from the groups it follows stay. A line without `follow=` leaves the groups followed alone.
- Lines that are not understood are counted like any other bad line of the text protocol (`parseDataText` returns their number); what can be applied still is. On a serial port, a dashboard line starts with `>` like telemetry: `>DASH|Robot/Motion:chart:speed`.
- The webapp displays a dashboard when it is created this way, unless the user is looking at a dashboard of their own or editing.

## Following groups

The view label of a telemetry (`name,label:value`, see [`textProtocol.md`](textProtocol.md)) is its **group**: the device says what goes together (a depth map, the boxes drawn over it, the points it makes in 3D), and says nothing about where it is shown. One group per telemetry; a `/` in a group means nothing (`Robot/depth` is a group name, it chooses no dashboard).

A view follows groups with `follow=`, and the dashboard decides where they go:

```
DASH|Robot/top/Depth:image|follow=depth
DASH|Robot/Scene:3d|follow=depth
depth.map,depth:...
depth.boxes,depth:...
```

- The view takes every telemetry of these groups that it can display: numbers and texts for a chart (texts are its marks), anything that has a value for a values view (numbers, texts, positions, pictures, commands), texts for a log, texts and numbers for a timeline, structures and stacks for a graph, shapes, points and clouds for a 2D or 3D view (and the pictures of the group for a 3D view: its cameras), what is drawn over a picture for an image view, and a picture while it has none.
- The views that Teleplot makes by itself for a group, one per kind of view (the automatic "Live" dashboard, a label card dropped in the editor), take only what their kind shows by default (`view.followOwnKinds`): nothing is shown twice.
- Those already received and those to come: the result does not depend on what came first, data or dashboard.
- The name of the view and its place are free: only the group ties it to the data. A view can follow several groups (`follow=depth,camera`) and several views can follow one group.
- Without dashboard lines, the automatic "Live" dashboard gives each group its views (titled with the group), and they follow it.

## Export and import

- **Export** writes one line per view, parents first, with only what differs from the defaults. Views without a title get keys `#1`, `#2`...; so do views whose title is already taken among their siblings (they keep it with `title=`). Telemetries are written by name.
- **Import** creates a new dashboard for each dashboard of the text. Nothing that exists is replaced: when the name is taken, the dashboard is called "Robot 2". Empty lines and lines that start with `#` are skipped, so a file can be commented.
- An exported file can be sent as it is to the text protocol (`cat Robot.teleplot.txt | nc -u -w0 127.0.0.1 47269`), or pasted in the code of a device.

Not exported: the state of the page (which tab of a stack is open, zoom, hidden series).

## Library

[`packages/teleplot-js/src/151-dashboardText.js`](../packages/teleplot-js/src/151-dashboardText.js):

| Function | |
|---|---|
| `TELEPLOT.dashboards.exportText(name)` | the lines of a dashboard (of all of them without a name) |
| `TELEPLOT.dashboards.importText(text)` | creates the dashboards of a text; returns `{ dashboards: [names], problems }` |
| `TELEPLOT.dashboards.receiveLine(line)` / `receiveText(text)` | what the protocols call: applies a line when it changed |
| `TELEPLOT.dashboards.onReceivedDashboardHooks` | called with a dashboard created by what was received, to display it |
| `TELEPLOT.dashboards.parseLine(line)`, `textEncode(text)`, `textDecode(text)` | the pieces |
| `view.followLabel(label)` / `unfollowLabel(label)`, `view.suitsTelemetry(telem)` | following a group, and what a view takes of it ([`103-viewTelemetries.js`](../packages/teleplot-js/src/103-viewTelemetries.js)) |

Views keep the key a line gave them in `view.key`. Tests: [`tests/dashboardText.test.js`](../packages/teleplot-js/tests/dashboardText.test.js); demo: "Dashboards as text" in `test.html`.

---

[All documentation](README.md) · [Teleplot](../README.md)
