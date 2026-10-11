# Dashboards as text

A dashboard can be written as text: one line per view, addressed by its path in the dashboard. The same lines are

- a **file**: the dashboard menu of the webapp exports a dashboard as a `.teleplot.txt` file (the extension of text files: lines of the text protocol, here `DASH|` lines only); such files are opened in the Export and import panel (from "Import…" in the dashboard menu, or dropped on the page), like data files, which can hold dashboards too (`files.md`),
- a **message** of the text protocol: a device describes the dashboard it wants, next to its telemetry,
- the content of a **binary section** (`SECTION_TYPE_DASHBOARD`, see `binaryProtocol.md`).

```
DASH|Robot:grid
DASH|Robot/top:row
DASH|Robot/top/Motion:chart:speed,accel|w=3
DASH|Robot/top/side:column
DASH|Robot/top/side/State:values:state,battery
DASH|Robot/top/side/Log:log:robot.log|maxLines=50
```

For the simple cases there is an even shorter way, without any dashboard line: [a label that is a path](#a-label-that-is-a-path).

## A line

```
DASH|<dashboard>[/<view>...][:<type>[:<telemetry>,<telemetry>...]][|<option>=<value>...]
```

- **Path**: the name of the dashboard, then the names of the views down to the one the line describes. Layouts that are missing on the way are created (as grids), so lines can be sent **in any order**, and each line stands alone. The dashboard alone (`DASH|Robot:row`) is its top layout.
- **Name of a view** (the last name of the path): its key among its siblings, and for a view that shows telemetries, its title. A name that starts with `#` (`#1`) is only a key: the view has no title.
- **Type**: `row`, `column`, `grid`, `stack` (layouts), `chart`, `values`, `log`, `2d`, `3d`, `image`, or `none`, which removes the view (or the whole dashboard). Without a type, a view that exists keeps its own and a new one gets what suits its first telemetry (a grid when it has none): `DASH|Robot/top/Motion|h=6` only changes a height.
- **Telemetries**: by name, separated by commas. They do not have to exist yet: the view waits for them ("Waiting for data").
- **Options**: only what is written changes.

| Option | For | Value |
|---|---|---|
| `w`, `h` | everything | width and height (see the layouts in `dashboard-editing.md`: a column span in a grid, a share of the space in a row or column; a height step is 4 em) |
| `title` | views | the text in the corner of the view, when it is not the name of the path (`title=` for none) |
| `time` | everything | time group: `inherit` (default), `dashboard`, or the name of a group shared by the views that name it |
| `follow` | views | labels the view follows, separated by commas: new telemetries with one of these labels join the view |
| `align`, `justify`, `gap`, `columnWidth`, `appearance`, `accent` | layouts | as in the edit panel (`align=stretch` is the default of layouts made by lines) |
| any option of the view | views | `maxLines`, `displayGrid`, `displayNumberDecimals`, `decimation`, `trailLength`, `pointSize`... (the names of `view.options`); booleans are `true` / `false` |

**Escaping**: in names and values, the characters `% / : , | =` and line breaks are written `%XX`, the hexadecimal code of the character (`My%2Fboard` for "My/board"). Everything else is written as is, spaces and accents included.

## Receiving lines

- A line is applied **when it differs from the last one received for the same path**. A device can therefore send its dashboard again and again (every second, at each boot...): nothing happens, and what the user changed by hand stays. When the device changes a line, the view is updated in place (same view, new options, new telemetries).
- A dashboard that the user deleted stays deleted while its lines are repeated, and comes back whole as soon as one of them changes. A dashboard that the user renamed still gets the lines of its sender.
- Changing the type of a layout to another layout keeps the view; other changes replace it and keep what it holds (the children of a layout, the telemetries and the title of a view).
- A line that lists telemetries sets the list of its view; telemetries that a label path put there stay.
- Lines that are not understood are counted like any other bad line of the text protocol (`parseDataText` returns their number); what can be applied still is. On a serial port, a dashboard line starts with `>` like telemetry: `>DASH|Robot/Motion:chart:speed`.
- The webapp displays a dashboard when it is created this way, unless the user is looking at a dashboard of their own or editing.

## A label that is a path

The view label of a telemetry (`name,label:value`, see the README) can be a path: `dashboard/view`.

```
speed,Robot/Motion:12.5
accel,Robot/Motion:0.3
state,Robot/Motion:IDLE|t
note,Robot/side/Notes:started|log
```

The dashboard "Robot" and its views are created if needed, and the telemetry goes there instead of the automatic "Live" dashboard:

- telemetries of a path that are displayed the same way share one view, titled with the last name of the path (`speed` and `accel` share the chart "Motion");
- the others get a view of their own kind next to it (`state` gets a values view, also titled "Motion"; its key is `Motion#values`);
- as with any label, a camera joins the 3D scene of its path and shapes are drawn over the picture of the camera of their path;
- longer paths nest the view in layouts (`side`), and a path that ends with `/` (`temp,Robot/:21`) only names the dashboard: the telemetry gets a view of its own.

Like any label it only decides where a telemetry **first** goes, and telemetries with the `np` flag are left alone. Paths and lines work together, whichever comes first: `DASH|Robot/Motion:chart|w=4|h=3` sizes the chart that `speed,Robot/Motion:...` fills.

Since `/` now has a meaning in a label, a V1 label that contained one is read as a path.

## Export and import

- **Export** writes one line per view, parents first, with only what differs from the defaults. Views without a title get keys `#1`, `#2`...; so do views whose title is already taken among their siblings (they keep it with `title=`). Telemetries are written by name.
- **Import** creates a new dashboard for each dashboard of the text. Nothing that exists is replaced: when the name is taken, the dashboard is called "Robot 2". Empty lines and lines that start with `#` are skipped, so a file can be commented.
- An exported file can be sent as it is to the text protocol (`cat Robot.teleplot.txt | nc -u -w0 127.0.0.1 47269`), or pasted in the code of a device.

Not exported: the state of the page (which tab of a stack is open, zoom, hidden series).

## Library

`packages/teleplot-js/src/151-dashboardText.js`:

| Function | |
|---|---|
| `TELEPLOT.dashboards.exportText(name)` | the lines of a dashboard (of all of them without a name) |
| `TELEPLOT.dashboards.importText(text)` | creates the dashboards of a text; returns `{ dashboards: [names], problems }` |
| `TELEPLOT.dashboards.receiveLine(line)` / `receiveText(text)` | what the protocols call: applies a line when it changed |
| `TELEPLOT.dashboards.onReceivedDashboardHooks` | called with a dashboard created by what was received, to display it |
| `TELEPLOT.dashboards.placeTelemetry(telem)` | puts a telemetry where its label path says (done by itself for new telemetries) |
| `TELEPLOT.dashboards.parseLine(line)`, `getLabelPath(label)`, `textEncode(text)`, `textDecode(text)` | the pieces |

Views keep the key a line gave them in `view.key`. Tests: `tests/dashboardText.test.js`; demo: "Dashboards as text" in `test.html`.
