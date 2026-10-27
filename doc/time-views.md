# States over time, marks, ranges and thresholds

Four things that go together: they show what a telemetry *was* and what it *should be*, along the time.

1. **A timeline** (`ViewTimeline`): text telemetries as lanes, a band per state, a tick per log line.
2. **Marks on a chart**: a text telemetry added to a chart is drawn as vertical lines on the curves.
3. **A range**: what a number is expected between. An attribute of the telemetry: said once.
4. **Thresholds**: the limits a number should not pass. Data, with a timestamp: they can change over time.

The rule of the project holds: **nothing is made up**. A band starts and ends at the timestamps of samples; a limit is a step from one
sample to the next, never a slope; what is too short to be drawn is drawn as "several things here", never as one of them.

Everything is in the library ([`packages/teleplot-js`](../packages/teleplot-js/)): the parsers (`040`, `041`), the datastore (`012`: `getThresholds`,
`getThresholdStatus`, `getThresholdSteps`, `getRange`), the runs of a text (`107-textRuns.js`), the views (`110`, `111`,
`116-viewTimeline.js`). `test.html` has a section for them; the robot sample of the webapp uses them all.

## What to send

### States and logs: nothing new

A timeline and the marks of a chart display the text telemetries the protocols already have.

```
mode:driving|t                       a state: it lasts from this message until the state changes
mode:1627551892437:parked|t          with its own time
mode:|t                              an empty text is a state too: nothing (a hole in the timeline)
mode:error: motor stalled|t          a text may hold colons
task:loop/plan/search|stack          a stack: the path of what is running (see "Stacks")
nav:Path clear|log                   a log line: an instant
```

- The same text sent again continues the state: a device can send its state at every loop.
- **An empty text** is a sample (`name:|t`, or an empty string in the binary protocol). It ends the state before it.
- **Colons in a text.** The time of a text, when it has one, is a first field that is a number; the rest is the text. A text that itself
  starts with a number and a colon needs its time written: `clock:1627551892437:12:30|t`.

### Stacks: `stack`

A stack is a state whose text is **the path of what is running**, a [`/`](./) between levels: `loop/plan/search` says that `search` runs
in `plan`, which runs in `loop`. Send it each time something starts or ends; an empty text says nothing runs.

```
task:loop|stack
task:loop/plan|stack
task:loop/plan/search|stack
task:loop/plan|stack                       search is over
task:1627551892437.25:loop/drive|stack     with the time of the device: milliseconds, decimals welcome
task:|stack
```

- It is still a text telemetry: values, logs and marks show it as any state. Only the timeline reads the path.
- **It gets a timeline by itself.** On the automatic dashboard, stacks without a label share one timeline (a lane each: what runs at
  the same time is seen side by side), stacks with a label share the timeline of that label; a stack dropped on a dashboard in Edit
  mode gets a timeline too (`suggestViewType` answers `"timeline"`).
- The flag `stack` (the attribute `TELEM_ATTR_STACK`, 10, in the binary protocol) says the text is a path: a `/` in an ordinary
  state ("N/A") is not a level.
- **Time.** For function timing the device should date its messages: in text, the time before the path, in milliseconds with as
  many decimals as it measures; in binary, the timestamp of the text sample (nanoseconds). Without a time a message is dated when
  it is received, which is fine for slow things and too coarse for short calls.
- **Several things at once**: their paths separated by `,`, each with an optional status after `=` (what it ended with: a result of a
  behavior tree node, any word), `bt:root/patrol=failure,root/dock|stack`. A path without status runs, and the levels that hold it.
  Lines with the same time written by the device are parts of one sample (a tick split in several messages). Threads that run on
  their own are better sent as one telemetry each. A stack with a structure (`|enum`, `|edges`) is a graph: see [`graph.md`](graph.md).

### A range: `ATTR|`

```
ATTR|battery|min=9|max=12.6
ATTR|load|max=100                    one end is enough
ATTR|battery|min=                    given empty, an end is forgotten
```

`ATTR|name|key=value|key=value` describes a telemetry. It is not a sample: send it once (again at will), before or after the values.
Keys: `min`, `max`. An unknown key makes the line "not understood" (counted, nothing changed), so that a mistake does not go unnoticed.
In the binary protocol: the attribute `TELEM_ATTR_RANGE` (9), two float64, not a number = no limit on that side.

A range changes nothing to the data. Views use it as an extent: the bar of a value, the scale of a chart when asked.

It also decides the default view of a number: with **both ends**, a number is a gauge, so `suggestViewType` answers `"values"` (its value with a bar) instead of `"chart"`, for the Live dashboard and for a telemetry dropped on a dashboard. Like a label, it only decides the first placement: send the range before the first value. A chart is one click away (Edit mode) or a `DASH|` line.

### Thresholds: `TH|`

```
TH|battery:low<10.5:empty<9.9,red
TH|motor_temp:1627551892437:hot>70           a field that is only a number is the time (ms) of what follows
TH|motor_temp:1627551892437:hot>70;1627551899000:hot>75
TH|battery:low<                              without value: removed from then on
```

A threshold has **a name**, **an operator** (`<`: past the limit when the telemetry is below, `>`: above), **a value**, an optional
**color** (after a comma: any CSS color) and **a timestamp** (when it was received, unless the line gives one).

- A threshold **holds from its timestamp until another sample of the same name**. So a limit can move, and what was displayed in the
  past keeps the limit it had then.
- A value that is not a number (nothing after the operator) **removes** the threshold from then on.
- In the names, the characters `% : ; | < > ,` are written `%XX` (the hexadecimal code of the character).
- In the binary protocol: the section `TELEM_DATA_THRESHOLD` (40), a sample per threshold ([`binaryProtocol.md`](binaryProtocol.md)). Both protocols give
  the same telemetry.
- Thresholds are limits of the **numbers** of the telemetry they are sent to. A telemetry that only has thresholds (or attributes) has
  nothing to display yet: it is placed on a dashboard when its first value comes.

## What is shown where

| Data | Chart | Values | Log | Timeline |
|---|---|---|---|---|
| Number | series | value | no | a line, when added on purpose (or a band per value) |
| Number + range | scale, when the option says so | a bar from min to max | no | the scale of its line |
| Number + thresholds | dashed steps with their name | the name and the color of the one that is passed | no | a band where it is past a threshold |
| Text, a state (`t`) | a mark where it changes | value | lines | bands |
| Text, a stack (`stack`) | a mark where it changes | the path | lines | a row per level |
| Text, a log (`log`) | a mark per line | latest line | lines | ticks |
| Empty text | no mark | empty | an empty line | a hole |
| Positions, shapes, clouds, images | not shown | as before | no | no |

Which view a telemetry gets **by default**: a number a chart, a state a value, a log a log view, and a stack a timeline. For the
others a timeline, and a text in a chart, are asked for: in the Edit mode of the webapp, or with a line (`DASH|Robot/States:timeline:mode,nav`,
`DASH|Robot/Motion:chart:speed,mode`).

## The timeline

- **A lane per text telemetry**, in the order of the list of the view. Its name is on the left (option `displayTelemetryName`).
- **A state** is a band from its first sample to the first sample that says something else. Its text is written in it when there is
  room. The last band runs to the end of the period: the state is still the latest one known.
- **A log** is a tick per line.
- **Too short to be drawn**: several states within a couple of pixels are one neutral block (half the height of the lane) that knows
  how many states it holds; several lines within a couple of pixels are one thicker tick. Zoom to see them.
- **Colors**: the texts of a view take the colors of the palette in the order they show up, so the states of a telemetry are told
  apart (the first 11 are all different; none is red, which is kept for errors). Texts that hold a word of the lists take the colors of
  the theme for them, as in the Log view: failure (`error err fail failed failure fatal critical crit`) red, warning (`warn warning
  timeout`) yellow, success (`ok success succeeded done pass passed`) green (`--teleplot-ok`). Lines of logs have no color of their
  own, but these.
- **The period** is the zoom of the time group, or else what the numbers and texts shown by the views of the group cover: a state that
  is not sent again does not make time pass, the charts next to it do, and the timeline covers the same time as them. It never goes
  further back than the data window. When the latest state has just shown up and nothing else has made time pass since, it is given a
  little room at the end (4 % of the period) so that it can be read; the axis tells what time that is.
- **Pointer**: it moves the cursor of the group (the other views show that moment) and a tip tells what is under it: the text, when
  the state really started and how long it lasted (whatever the period shows of it). Drag to zoom (shared by the group, as on a
  chart), double click to go back to the latest data.
- More lanes than fit: the view scrolls, its time axis stays at the bottom.

### Stacks in a timeline

A stack is a lane **by branches** (decided on 2026-10-27, [`graph.md`](graph.md)):

- **A band per run of a node**: it lasts while the node keeps its state (running, or a status), whatever happens under it or beside
  it: `loop` is one band while it runs `read`, then `plan`.
- **Rows depth first**: a node's row, then the rows of its children. Siblings that follow each other share a row, so a stack that runs
  one thing at a time has **a row per level**. Siblings that overlap in time (two things at once, or a result next to what runs) get a
  row each, under their parent. Several roots (`nav/…,arm/…`) each start a group of rows, a thin line between them.
- **The tree** is drawn at the right of the names: a connector from each row to the row of its parent.
- A band is written with the name of its node (and its status), and colored by that name (the same function has the same color
  wherever it is called from). A stack with a structure (a graph) takes the colors of the graph view: what runs in the primary color,
  a status in the color of its words. Runs too short to be drawn are a block in their row.

The height of the lane (option `stackDepth`, "Stack rows", 4 by default):

1. the lane **opens with the stack**: a row of full height for each row it has in the period displayed, up to `stackDepth` rows;
2. deeper than that, the lane keeps that height and **its rows get thinner**, down to 7 pixels (under 11 pixels the texts are not
   written: the pointer tells them);
3. deeper still, rows stay at 7 pixels and **the lane grows again**.

`stackDepth` 0 means no limit: always full rows. The pointer tells what a band is, what it runs in, when it really started and how
long it lasted.

### Numbers in a timeline

A number can be given a lane, next to the states it goes with: added in Edit mode, by a `DASH|` line or a drop, or by a group the
timeline follows (it takes texts and numbers; the timelines the automatic dashboard makes take texts only). A telemetry that has both
text and numbers is shown by its text.

- **A number that has thresholds is read as a state**: a band where it is past a threshold, named and colored after it, and nothing
  where it is past none. A band starts at the sample that passed the limit and ends at the first sample that is not past it any more:
  where the value crossed the limit between two samples is not known, and not guessed. Each sample is compared with the limits in
  force at its own time. Past several, the one it passed last, as everywhere else.
- **Any other number is a plain line** from sample to sample: straight segments (no steps: nothing says the value held), in the color
  of the telemetry, scaled on its range when it has both ends, else on what is displayed. A number with two values reads like a
  digital signal, one with a few values like steps. It is not a chart: no axis, no thresholds; a curve squeezed in a lane is better
  seen on a chart of the same time group. The pointer tells the value at that time (the last sample at or before it).
- **Option `numbers`: `text`** (`auto` by default) writes each value as a state instead: a band per run of the same value, with the
  value in it (a gear, a mode code). Thresholds are not used. For one telemetry only: `view.setOption("numbers", "text", telemetry)`.
- Many samples: the line is given a few real samples per pixel (the first, lowest, highest and last, like a chart), bands too short to
  be drawn are a block, as for states.

## Marks on a chart

A text telemetry in the list of a chart has no series. Its samples are vertical lines over the curves, in its color:

- a **log**: a mark per line; a **state**: a mark where its value changes to something (the same state again, or an empty one, is no mark);
- the text is written next to the line when there is room before the next one;
- marks closer than 6 pixels are **folded** into one short tick at the top that counts them: a busy period reads as a row of ticks and
  the curves under it stay visible;
- its legend entry (a bar as its key) tells the text at the cursor (the last one at or before it); click it to hide the marks;
- the marks are part of what a live chart shows: a text after the last number (or before the first) **widens the period** (`getDisplayRange`,
  `widened`: the chart sets it on uPlot, which only knows the numbers; within the data window, so a state kept from before it does not
  stretch it back). A mark that is the latest thing shown gets 4 % of room after it (`ViewChart.LATEST_ROOM`, as the timeline does), and
  the text of the last mark goes on the left of its line when it fits better there. Pointing beyond the last number gives the time
  pointed at to the group cursor; a double click (zoom reset) widens it again.

A chart needs at least one number: with texts only it says so.

## Thresholds and ranges on a chart

- The thresholds of each series are **dashed steps** in their color (the warning color of the theme without one), with their name
  written on the side that is past the limit.
- Option `thresholds`: `fit` (default: drawn, and the vertical scale keeps them in view), `show` (drawn when the scale, which fits the
  curves, has them in view), `hide`.
- Option `scale`: `auto` (default: fits what is drawn) or `range` (the ranges of the series, on the sides they give).
- The value of a series in the legend takes the color of the threshold it is past, at the cursor.
- Hiding a series from the legend hides its thresholds.

## Values

- A number with a range that has **both ends** gets a bar from its minimum to its maximum, with a tick for each threshold inside it.
  Out of the range the bar is full or empty, never more.
- Under the bar, small and quiet: the minimum and the maximum at its ends, and the name of each threshold under its tick, in its
  color (option `displayScale`, "Range labels", on by default). Labels that would overlap are dropped: the names of the thresholds
  come first, in the order of their values, and the ends of the range take the room that is left (they are in the tooltip of the bar
  too). The list of series of a chart does not have them: its rows stay short.
- Past a threshold, the value takes its color and is preceded by its name: color is never the only sign.
- Past several thresholds, the one it passed last (the limit closest to the value): "empty" rather than "low" once both are passed.
- Like every value, it follows the cursor of its time group: the value, and the limits, of that moment.

## Kept, forgotten, written

- **Data window.** Old samples are removed as usual, but what holds until the next sample is still what is shown when the window
  starts: a state keeps its last sample before the window (a log does not), and each threshold keeps its last sample. A threshold sent
  once when a device starts is never forgotten.
- **Memory limit.** Thresholds are neither thinned nor forgotten when room is made: each sample is one limit, none stands for the others.
- **Files** ([`files.md`](files.md)). The binary file holds everything. The text file writes `ATTR|` and `TH|` lines; a threshold whose name or
  color would not come back the same is skipped and counted. A CSV has no thresholds. An export of a period also writes, before its
  own samples, the thresholds in force when the period starts.

## Library

```js
telem.getRange()                          // {min, max} (a side may be undefined), undefined without range
telem.getThresholds(timestamp)            // [{name, value, operator, color, timestamp}] in force at a time (the latest without time), lowest first
telem.getThresholdStatus(value, timestamp)// the threshold a value is past, or undefined
telem.getThresholdSteps(from, to)         // [{name, operator, color, steps: [{from, to, value}]}] over a period
telem.hasContent()                        // false for a telemetry that only has attributes or thresholds
TELEPLOT.textRuns(entry)                  // {timestamps, data: [texts]}: a text entry with one item per run of the same text (cached)
TELEPLOT.stackRuns(entry)                 // {nodes: Map path -> {path, name, depth, parent, timestamps, data: [states]}, order}: a run per state of each node of a stack (state: "" runs, a status, null not there; cached)
TELEPLOT.stackStates(text)                // Map path -> "" (runs) or its status: what a stack text says of each node

new TELEPLOT.view.ViewTimeline(divId, telemetries, group)     // or TELEPLOT.view.createView("timeline", telemetries, group)
ViewTimeline.buildLane(entry, isLog, from, to, minDuration)   // [{from, to, text, count, mixed, tick}]: what a lane draws (no canvas)
ViewTimeline.laneSize(depth, limit, rowHeight, minRow)        // {height, rowHeight} of a stack lane
ViewTimeline.buildBranches(runs, from, to, minDuration, rank) // {rows: [items], tree: [{depth, parent, first, label}], entries}: a stack lane by branches
ViewTimeline.limitRuns(telem)                                 // a number read through its thresholds: runs of "past the same threshold" (cached)
ViewTimeline.buildLine(entry, decimator, from, to, width, range) // {timestamps, values, min, max}: the line of a number over a period
ViewTimeline.extentOf(entry, time)                            // {start, end}: how long the state in force at a time really lasts
ViewChart.buildMarks(entry, isLog, from, to, minGap)          // [{t, text, count}]
chart.overlay                                                 // {thresholds, marks}: what is drawn over the series for the period displayed
ViewCurrentValue.gauge(telem, value, timestamp)               // {status: {name, color}, bar: {fill, min, max, ticks}}
```

Performance figures are in [`performance.md`](performance.md) ("States, marks and thresholds").

---

[All documentation](README.md) · [Teleplot](../README.md)
