# Graphs: state machines and behavior trees

**Status: built (2026-10-28), from the specification decided with the user on 2026-10-27.** Demos in `packages/teleplot-js/test.html` (section "Graphs"), tests in `packages/teleplot-js/tests/graph.test.js`, the robot sample of the webapp, Help tiles, and example 25 of every client.

A graph view draws a state machine, a nested state machine or a behavior tree, and shows what runs in it at the time shown. A device sends two things:

1. **The structure**: the nodes (`enum`) and the transitions (`edges`) of a telemetry. These are samples with a time, so a device can load a new structure, and replaying shows the structure that was in force at that time.
2. **What runs**: a stack (`|stack`), as today. It can now hold several paths (parallel states), each with an optional status (a result of a behavior tree node).

The rule of the project holds: **nothing is made up**.
- The view draws the nodes and edges that were sent, and the paths that were sent.
- A path that runs but was never declared is drawn anyway, and marked as not declared. Data is never hidden either.
- The view never decides a status: a parent of a failed node is not marked failed unless the device says so.
- The page computes the layout, which is display, not data.

## What to send

### A state machine

```
robot.mode:1000:idle,mission/goto,mission/grasp,dock,error|enum
robot.mode:1000:idle>mission=start,mission/goto>mission/grasp=arrived,mission/grasp>idle=done|edges
robot.mode:1000:mission>dock=battery low,dock>idle=charged,mission>error=fault,dock>error=fault,error>idle=reset|edges
robot.mode:idle|stack
robot.mode:mission/goto|stack
robot.mode:mission/grasp|stack
robot.mode:error|stack
```

- `mission` is a state that holds other states. It doesn't need a line of its own, because the paths say so.
- The two `|edges` lines have the same time (1000), so they are one structure, sent in two parts.
- The state is a stack: its path says which state runs, and which states hold it.

### A behavior tree

```
robot.bt:1000:root#fallback,root/patrol#sequence,root/patrol/battery_ok#condition|enum
robot.bt:1000:root/patrol/goto#action,root/dock#action|enum
robot.bt:2000.5:root/patrol/battery_ok=success,root/patrol/goto|stack
robot.bt:2100.5:root/patrol/battery_ok=failure,root/patrol=failure,root/dock|stack
```

- A tree needs no `edges`: the paths give each node its parent. Children are drawn in the order they were declared.
- `#fallback`, `#sequence`… are **kinds**: free text written next to the node. Teleplot knows no behavior tree vocabulary.
- **Tick 1:** the battery check succeeded and `goto` runs.
- **Tick 2:** the check failed, the sequence failed (the device says so), and `dock` runs.

### Loading a new structure

```
robot.bt:5000:root#sequence,root/scan#action,root/report#action|enum
```

A structure sample with a newer time **replaces** the whole structure: nodes and edges of the older one are no longer drawn from that time on. There is no clear line and no version number: the new time is the new version.

## The structure

### `enum`: the texts a telemetry can take

`enum` replaces `choices`. Teleplot isn't published yet, so `choices` is not kept as an alias. It means one thing everywhere: the texts this telemetry can take.
- For a setting (`write=text`), these are its choices.
- For a state, these are its states.
- For a stack, these are the paths it can take, so they are the nodes of its tree or of its nested states.

Its items:
- **A path:** levels are separated by `/`, as in stacks. Declaring `mission/goto` also makes `mission` a node.
- **A kind:** an optional free-text suffix after `#`, on the end of the path only: `root/patrol#sequence`. A suffix in the middle of a path (`root#fallback/patrol`) is refused.
  - The node is known by its path **without** the suffix.
  - Stack samples never carry kinds.
  - For a setting, the same suffix is a caption shown next to the choice: `auto#follows the line`.
- **Escaping:** inside an item, `, # / % ; |` are written `%XX`, as are a leading `=` or `>` and a whole item that is a number (`%35` for `5`, because a first field that is a number is a time).

The arguments of actions keep their own list (`ATTR|name|arg=x|enum=a,b`): the key is renamed, nothing else changes.

### `edges`: transitions

Each item is `from>to` or `from>to=event`, where `from` and `to` are paths. Either can be a state that holds others (`mission>dock`: from anywhere inside `mission`).
- An edge is known by `from>to=event`, so two transitions between the same states with different events are two edges.
- An edge whose ends are not in `enum` is still drawn, with its ends as nodes that were not declared.
- Inside an item, `, > = % ; |` in names and events are written `%XX`.

A tree needs no edges. A state machine without `edges` is drawn with its nodes only.

### Time

A structure is the set of `enum` (and `edges`) samples of a telemetry **with the same time**. It holds from that time until a sample with a newer time.

- **Same time, several parts:** the parts are merged into one sample (union), in any order. A part sent twice changes nothing. A big structure is several lines, or several samples in one line separated by `;`, all with the same time. Pictures in several parts are already stored this way.
- **Newer time:** a whole new structure. To remove one node, send the whole structure again at a new time. A way to "add to the structure in force" could come later, if a real device needs it.
- **Resends:** clients resend the structure every 5 s with its **original time** (as for anything sent once), so a resend merges into the same sample. A device that writes no time (Bash) gets a new time on every resend, which replaces the structure with an identical one: harmless.
- **"The same time" means the device's time as sent, before the page dates it.** Times since boot are dated with an offset that drifts (100 ppm) and drops when a faster packet arrives (`Connection.lowestOffset`). So the same device time in two packets could get two dates. The parser groups the parts of one sample by the time as sent: when a telemetry sends the same time again, the part reuses the date the first part got.
- **A line without a time can't be split.** The server (or the page) dates it with the arrival of its packet. Lines in one packet get one time; lines in two packets get two times. To split a structure, write its time.

## What runs: stacks with several paths

A stack sample can hold several paths separated by `,`. Each path can have a status after `=`:

```
robot.bt:2100.5:root/patrol/battery_ok=failure,root/patrol=failure,root/dock|stack
```

- **A path without a status runs**, as in a stack today, and so do the nodes that hold it.
- **A status is free text.** Its color comes from shared word lists (see "Word lists"); a word in none of them is muted. Teleplot knows no behavior tree vocabulary: `success` / `failure` are only the convention of the examples.
- **A sample is a snapshot.** It holds until the next sample, as any state does. A node that is not listed has nothing to say at that time.
- **Parallel states** (orthogonal regions) are several paths that run: `nav/follow,arm/idle`.
- **Contradictions are shown as sent:** a running path under a failed node is drawn running under a failed node.
- **Same time, several parts:** stack samples merge too, like the structure. A tick that doesn't fit one datagram (about 1432 bytes on a local network, 512 on the Internet) is split across lines with the same time. Splitting needs an explicit time, as above. Until the last part arrives, the view shows the parts it has.
- **Two steps are never parts of one.** Since the same time means "parts of one sample", a device must give two samples that follow each other two different times. The clients do it for the stack samples they date themselves (`Teleplot::Stack`, `stack(name, path)` without a time): at least 1 µs after the previous one of that stack, even within the resolution of the clock (1 µs: what the page tells apart, its times being seconds in a double at the dates of today). A time given by the program is kept as it is: that is how a tick is split on purpose.
- `,` and `=` in a stack path are written `%2C` / `%3D`.

## How it is drawn

Decided with the user on 2026-10-27, from a reference mock-up (temporary, not kept). There is one view and one look. The view doesn't know whether it draws a state machine or a tree: every difference comes from what was sent.

| What was sent | How it is drawn |
| --- | --- |
| A node | A rectangle with 6 px corners, its name in the middle (timeline font, 11 px) |
| Its kind (`#sequence`) | Above the node, left aligned, muted, in the mono font (chart axis font, 10 px) |
| Its status (`=failure`) | Below the node, right aligned, in the status's color, in the mono font |
| A node on a running path (no status) | Blue: `--teleplot-primary` |
| A status in the failure words | Red: `--teleplot-error` |
| A status in the warning words | Yellow: `--teleplot-warn` |
| A status in the success words | Green: `--teleplot-ok` (new theme variable: `#23964f` light, `#3ccf7a` dark) |
| Any other status (`skipped`, `halted`…) | Muted outline and text: no meaning is invented for words Teleplot doesn't know |
| The active path (what runs, from the root down) | Emphasized: fill at 32 %, 2 px outline, bold name. Tree links on the path are blue and 2.4 px; the boxes that hold it are outlined in blue; other edges fade to 60 % |
| A node with a status, off the active path | Its status color, quieter: fill at 18 %, 1.2 px outline, regular name |
| Edges sent | Arrows with their event in the mono font; the hierarchy is drawn as **nested boxes** (a transition can leave or enter a state that holds others) |
| No edges | The hierarchy is drawn as **links** from parent to child (a tree); neither hierarchy nor edges: a row of nodes |
| The last change | The edges from a node of the previous sample (or a state that held it) to a node of the current one, in blue, with the event in bold. When several edges match, all are marked: the view doesn't pick an event |
| A path that is not in the structure | Drawn dashed, never hidden |

- **Color comes from the status only.** A running state named `error` is blue; its name is just a name.
- **The colors of nodes are not those of the palette.** A state's color says where it stands (runs, failed, succeeded), not which state it is: no colored dots, no color per name.
- **The recent path** (option `trail`, on by default) is a line under the drawing: the last runs, oldest first, each with how long it lasted and the event between two runs (`idle 8.0s › start › goto 3.4s › arrived › grasp 0.7s`). Names are muted and the current one is bold, with no colors. For a tree, a run is the last level of the running path, with its status when it ended with one (`goto 0.1s › patrol failure › dock now`). Pointing at a run moves the cursor of the time group to it.
- **Pointer over a node:** the timeline's tooltip (`.teleplot-js-timeline-tip`): the telemetry and the kind, the path and its status, how many times it ran in the window and how long it lasted.
- **Big graphs:** zoom and pan only. No folding of subtrees, and no other display modes (an indented tree and a "focus on the current state" look were tried and dropped).
- **Options** (`getOptionsSchema`, the Edit panel, `DASH|` lines): `trail` (recent path), `events` (events on edges), `kinds`, and the time group, like every view.

## Word lists

One set of lists, used everywhere: the graph, the timeline and the log view (`ViewLog.getLevel` gains a "success" level, and its lists grow).

| Level | Words (whole words, any case) | Color |
| --- | --- | --- |
| Failure | `error err fail failed failure fatal critical crit` | `--teleplot-error` |
| Warning | `warn warning timeout` | `--teleplot-warn` |
| Success | `ok success succeeded done pass passed` | `--teleplot-ok` |

Today only error and warning words are recognized. So with this change, `failed` turns red, `timeout` turns yellow, and `done` turns green in logs and timelines too.

## The timeline: stack lanes by branch

The stack lane of a graph telemetry takes the graph's colors: blue while a path runs, and the status's color for a result. A node and its band then look the same in both views.

- **A band continues** while its path and its status don't change: a parent is one band while its children change under it. `stackRuns` already does this for one path at a time.
- **Rows follow the branches, depth first:** a node's row comes first, then the rows of its children.
  - **Siblings that follow each other share a row**, so a stack that never runs two things at once keeps one row per depth, exactly as today.
  - **Siblings that overlap in time get a row each**, placed under their parent. A result counts as overlapping: `patrol` failing while `dock` runs gives two rows under `root`.
  - **Several roots** (parallel states: `nav/…,arm/…`) each start their own group of rows, with a thin line between groups.
- **The gutter draws the tree:** a connector from each row to its parent's row, and the node's name when the row holds only one node in the time shown. A row that holds several nodes in sequence shows a dot, and the names are on the bands.
- **Band text** is `name` or `name: status`, cut with "…" when it doesn't fit.
- **Heights:** `stackDepth` and `ROW_MIN` limit the rows as today.

## Binary protocol

| Section | Content of a sample |
| --- | --- |
| `SECTION_TYPE_TELEM_DATA_ENUM` (43) | Its items as text, separated by line feeds (kinds as `#` suffixes) |
| `SECTION_TYPE_TELEM_DATA_EDGES` (44) | Its items as text, separated by line feeds |
| `SECTION_TYPE_TELEM_DATA_TEXT` (23) with `TELEM_ATTR_STACK` | The text is the paths, as in the text protocol |

- Samples with the same timestamp merge, as in text. Binary timestamps are never shifted, so they always match.
- `TELEM_ATTR_CHOICES` (12) is retired: the structure is data now, not an attribute. Action arguments carry their `enum` as before, in `TELEM_ATTR_ARGS`.

## In the library

- **Parser (040, 041):**
  - the `|enum` and `|edges` flags;
  - the merging of parts with the same time (by time as sent) for sets: enum, edges, and stacks with several paths;
  - `ATTR|…|choices=` becomes a sample (`enum`), and `arg=…|choices=` becomes `arg=…|enum=`.
- **Datastore (012):**
  - `telem.getEnum(t)` / `telem.getEdges(t)` give the structure in force at `t`, parsed once and cached per sample;
  - these types are kept like thresholds: the data window keeps the last structure before it, the memory policy never thins them, and a time-range export writes the structure in force at its start (`_files_indexes`);
  - a telemetry that only has a structure has no content (`hasContent`), and `suggestViewType` skips these types.
- **Stack runs (107):** `stackRuns` keeps runs per node path (with its status) instead of per depth, so several paths can run at one time. The lane packs siblings into rows: they share a row unless they overlap in time.
- **Timeline (116):** stack lanes by branch, with the gutter tree and the graph's colors (see "The timeline: stack lanes by branch").
- **Word lists (112, 116):** `ViewLog.getLevel` gets the success level and the longer lists; `--teleplot-ok` is added to the theme (104) in both themes.
- **Commands (025) and the values view (110):** a setting's choices come from `getEnum()` (the latest), with the kinds as captions.
- **The view: `118-viewGraph.js`** (`ViewGraph`, type `teleplot-graph`, `"graph"` in `createView`, `VIEW_TYPES`, `DASH|` lines and the editor menus). It is a 2D canvas like the timeline.
  - **Time:** it draws the structure in force at the time shown and the stack sample at that time, following the cursor and zoom of its time group.
  - **Layout:** computed by the page (`ViewGraph.layout`), cached per structure sample, and written in the library; no dependency is added (dagre is unmaintained; elkjs is about 1.5 MB). Without edges: a tidy tree, top-down, a parent centered over its children. With edges: each level of the hierarchy is layered on the edges between its nodes (an edge between nodes of two boxes counts for the boxes that hold them), cycles broken by reversing the edges that go back in a depth-first walk in the order of the structure, a layer per longest path, nodes ordered in their layer by where their neighbours are (two sweeps). Layers go left to right at the top level and top to bottom inside a box, and so on (a state machine on one line was too small to read). Edges that leave or reach the same side of a box are spread along it (`ViewGraph.anchors`), so that their events do not start from one point; back edges are arcs under the boxes.
  - **Pan and zoom:** the wheel zooms, a drag pans, a double click fits the drawing again. A canvas mounted again (a tab of a stack) is drawn on the next update.
  - **Drawing:** see "How it is drawn". The drawing is computed without a canvas (like `ViewTimeline.buildLane`), so that it can be tested.
  - **Default view:** `suggestViewType` answers `"graph"` for a stack or state that has an `enum` structure.

## Clients

The same calls in C++, Arduino, Python (and lines in Bash):
- `enumValues(...)` replaces `choices(...)` on settings and states;
- `edges(...)`;
- a stack with several paths and statuses.

The structure is sent once with its time and resent with the descriptions (`describeInterval`); a structure bigger than a packet goes in parts with the same time, and the same structure again is not sent. A setting's `enumValues` is its enum structure, its value checked against the texts (the `#caption` and the `%XX` of an item are not part of its text). With the microcontroller header, lists are static arrays (also accepted by the full one: one API). Common example 25 (graphs) in every language: a state machine and a behavior tree.

## Webapp

- **Help tiles** "A state machine" and "A behavior tree", whose fields are checked by the Help test like every other tile.
- **Edit panel:** the options `trail`, `events` and `kinds`, plus the time group.
- **Telemetries panel:** a telemetry with a structure gets a graph icon, and dropping it on a "+" slot offers "Graph" first.
- **Auto dashboard:** a stack with an `enum` gets a graph view, and keeps its lane in the shared timeline.
- **The robot sample:** its state (`robot.state`) is a state machine (states and transitions), and what it decides 5 times per second is a behavior tree (`robot.bt`), both in graph tabs ("Behavior", "States") at the bottom of its dashboard. Its mode setting takes its choices from an enum with captions.

## Not decided yet

- Whether to allow adding to the structure in force without resending it, for devices that edit a big tree a little at a time.
- Hints from the device for the layout (positions, direction).
- What the values view shows for a stack with several paths: the mock-up shows the running path as the value and the results under it.
- Initial states (a dot before the first state) and final states.
- Clicking a node of a writable state (`write=text`) to request it, through the commands (`doc/telecmd.md`).

## Why this design

Nine designs were compared on the same state machine and the same tree (in a temporary mock-up, not kept). The others:
- **Graph seen only from the data:** too little. States never reached and failed checks never appear.
- **One attribute line per node.**
- **Two new line families (`GR|` / `ST|`):** the most new protocol.
- **Nodes as telemetries grouped by a label:** a label can't say which node a telemetry is, and it has side effects (one label per telemetry, auto-dashboard grouping, `/` meaning a dashboard placement). A state change also took several lines.
- **Telemetries bound to nodes.**
- **The structure as an option of the view:** lost from data files, and it can't be split.
- **Drawing it with `2D|` lines:** the device does the layout.
- **Transitions as samples.**

The display was chosen the same way (2026-10-27), from proposals for state machines (a diagram, the diagram with its recent path, a focus on the current state) and for trees (top-down, indented), then a reference mock-up. The choices were: the diagram with its recent path; one set of rules for every graph; color from the status and the word lists, not from names; no folding.

The chosen protocol is the "two lists on the telemetry" one, with the structure made into timestamped samples so that it has a history. A new time replaced the version number and the `+=` / `-=` that a structure kept as attributes would have needed.

---

[All documentation](README.md) · [Teleplot](../README.md)
