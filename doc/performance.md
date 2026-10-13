# Performance notes

## Chart display: min/max decimation

uPlot needs all the series of a chart on a shared x axis, so `uPlot.join` merges them. This is costly (it is proportional to the total number of points) and had to run on every frame, which made multi-series charts collapse as soon as a few hundred thousand points were stored.

A chart now only gives uPlot what a screen can show (`src/106-decimator.js`, used by `src/111-viewChart.js`):

- Time is cut in fixed-width buckets, and only the first, minimum, maximum and last samples of each bucket are kept (at most 4 per bucket, about 4 per pixel column). The drawn line is the same as with all the points.
- When zoomed in far enough that there is at most one sample per bucket, all samples are displayed untouched.
- Buckets are aligned on absolute time and their width is a power of two: scrolling doesn't make the line shimmer, and the width only changes when the visible range doubles or halves.
- **Incremental**: finished buckets are cached, so when data is appended only the new samples and the last (open) bucket are scanned. The cost per frame depends on the new data and the number of pixels, not on the number of stored points.
- The stored data is never modified, sampled or copied by the display (it can be thinned out when the memory limit is reached, see "Memory" below): the number of points that can be kept in a session (see `Teleplot.state.dataTimeout` and the per-telemetry timeout attribute) is unchanged. The only extra memory is the display cache (a few thousand points per series).
- The cache is rebuilt from scratch if samples were inserted before the end of the data (`lateInsertions` counter of a datastore data entry), if the data was cleared, or if the view starts before the cached range. Non-finite values (NaN, Infinity) are ignored by the decimation.
- The first and last stored samples are always given to uPlot, so double-click zoom reset still shows the full extent.

The decimation is a chart option (on by default): `view.setOption("decimation", false)` gives uPlot the raw data like before, which is useful to compare.

## Ingestion

- **Datastore append fast path**: `Telemetry.addData` appends samples that arrive in order (the common case) directly. Only late samples pay for a binary search and an `splice` insertion (counted in `lateInsertions`). Samples sharing an identical timestamp are now kept in arrival order.
- **Binary protocol parser** (`src/041-parseDataBinary.js`): no per-packet `console.log`, no BigInt (timestamps and the 64-bit time reference are computed from two 32-bit halves, with the precision of a double as before), strings decoded with a shared `TextDecoder`, no copy of `Uint8Array` inputs.
- `TELEM_ATTR_DATA_TIMEOUT` is sent in nanoseconds (uint64) and converted to seconds when parsed, like `Teleplot.state.dataTimeout`. It used to be kept as a BigInt, which made the data timeout code throw and block the views update on every update.
- The update loop isolates its hooks: if one throws (error reported in the console), the others still run.
- WebSocket binary messages are received as `ArrayBuffer` (`binaryType`), so they are handled synchronously and in order (`Blob` decoding is asynchronous and doesn't keep the packets order).

Parsing speed in Node, one telemetry (million samples per second):

| Samples per message | Text V1 before | Text V1 now | Binary before | Binary now |
|---|---|---|---|---|
| 10 | 1.05 | 2.07 | 1.49 | 6.7 |
| 100 | 1.16 | 2.50 | 1.74 | 11.3 |
| 175 (full UDP packet) | | | 1.75 | 10.9 |

Binary is also 8 bytes per number sample on the wire, against about 25 for text.

The binary protocol is little-endian: the C++ client doesn't swap bytes on little-endian machines (every target platform), and the JS parser reads little-endian `DataView` values.

## Measuring

`packages/teleplot-js/test-performance.html` streams synthetic telemetries (series count, rate, data timeout, out-of-order samples, number of charts and text or binary protocol, all configurable and kept in the URL) straight into the parsers, and reports frame rate, ingestion rate, input size, stored points, JS heap (Chrome only) and the time spent per update.

Reference measurements (headless Chromium, 4 series with distinct timestamps, 15 s window):

| Setup | Views update | Page fps | JS heap |
|---|---|---|---|
| 5 kHz per series, decimation on | 2.1 ms avg (6.7 ms max) | 60 | 12 MB |
| 5 kHz per series, decimation off | 108 ms avg (271 ms max) | 4 | 121 MB |
| binary, 5 kHz per series, decimation on | 3.5 ms avg (4.7 ms max) | 60 | 21 MB |
| binary, 20 kHz per series, 8 series (1.9 M points stored) | 7.9 ms avg (11.9 ms max) | 60 | 43 MB |

## Reactive frameworks and the datastore

Wrapping the library instance in a reactive object (the webapp did `Vue.reactive` on it) makes every timestamp and value array a Vue proxy: ingestion measured **0.09 M samples/s instead of 16 M samples/s** (about 180 times slower). `Telemetry.data` is therefore created with `TELEPLOT.Vue.markRaw`, which keeps stored samples out of any Vue instance. The UI reads data through the views (`update()`), never reactively. Keep new per-sample storage out of reactive objects; attributes, telemetry lists and dashboards can stay reactive.

The same goes for the caches built from the data: the chart decimators (`ViewChart.decimators`) are `markRaw` too. A decimator reached through a proxy holds a proxied source, never recognises the raw one it is given, and rebuilds its cache from all the stored samples on every update: the update loop then slows down with the amount of data (measured with the robot sample: 17 ms per update after 30 s, 100 ms after 5 min, instead of a steady 6 ms). The library test pages are not reactive and cannot show this kind of problem: long sessions must be measured in the webapp.

## Memory

A page that keeps receiving data ends up killed by the browser. Three things bound what the datastore holds:

- **The data window** (`TELEPLOT.state.dataTimeout`, 300 s by default, 0 for everything; a telemetry can have its own with the `TELEM_ATTR_DATA_TIMEOUT` attribute): older samples are dropped. Removing from the front of a long array moves all of it, so with more than 4096 samples a telemetry is only pruned once 1 % of its data is too old.
- **The memory limit** (`TELEPLOT.state.memoryLimit`, 1 GB by default, 500 MB on a device that reports 4 GB of memory or less through `navigator.deviceMemory`, 0 for none). Measured in the webapp (Chromium, desktop) with 8 series of 8 million samples: 947 MB estimated is 1.3 GB of JavaScript heap at rest and about 1.6 GB right after a thinning, for a heap limit of 4.4 GB; the update loop stays at 3 to 7 ms; one thinning at that size blocks the page for about 0.8 s. The library estimates what its data takes (`TELEPLOT.datastore.getMemoryUsage()`: 8 bytes per number, timestamps included; texts and images measured on a few of them) once per second (`checkMemory()`, in the update loop; the last measure is in `TELEPLOT.datastore.memory`, with `span`: how far back the data goes, see `TELEPLOT.datastore.getTimeSpan()`). It is an estimate: browsers do not give a figure that works everywhere, and this one is known per telemetry.
- **What is done at the limit** (`TELEPLOT.state.memoryPolicy`), starting with the telemetries that take the most room, until the data is back to 90 % of the limit:
    - `"thin"` (default): the oldest half of a telemetry is thinned out (`telemetry.thinOldest()`). Samples are taken 4 by 4 and some of each group are kept: for numbers the lowest and the highest (peaks stay, as in the chart decimation); for samples made of several numbers (2D, 3D, shapes) the first and the last; for text and images the last one. This is decided on the data type of the telemetry that takes the most room; its other data types (the pose of a camera next to its images, the rotation of a shape next to its position) keep, over the same period, the samples that were current at the times that are kept: an image that stays keeps the pose it was taken from. Done again when needed, so the oldest data gets thinner each time.
    - `"forget"`: the oldest quarter of a telemetry is dropped (`telemetry.forgetOldest()`): what is left is exactly what was received, on a shorter time.
    - `"pause"`: `TELEPLOT.state.isPaused` is set; nothing is removed and nothing more is taken until the user resumes.

Thinning removes stored samples for good. It never makes any up: every sample kept is one that was received, at its own timestamp. Each data type remembers up to when it was thinned (`thinnedBefore`), and charts tint that part and write "thinned" in it, so that it is never mistaken for the full data.

Clearing: `TELEPLOT.datastore.clearData(keep)` empties the telemetries (all, or all but the ones `keep(telemetry)` accepts), `telemetry.clearData()` one of them, `TELEPLOT.datastore.forgetTelemetries()` forgets the telemetries themselves (names keep their ids, so views find them again when they come back).

## Scenes: 2D and 3D views, frames, many telemetries (measured on 2026-10-12)

Measured in the webapp (the library wrapped in Vue proxies, which is where problems show), Chromium, one view displayed, the whole update of the page (`TELEPLOT.updates.update()`, 30 times per second: 33 ms is the budget). 3D figures are the update only: the WebGL drawing itself happens on the next animation frame and is not in them.

| What changes on every update | 2D view | 3D view |
|---|---|---|
| The robot sample (16 views, 31 telemetries, ~500 samples/s) | 3 ms for the whole dashboard, steady over time | |
| 100 / 500 / 2000 flat shapes, all moving | 3 / 7 / 20 ms | 2 / 5 / 23 ms |
| 500 shapes in the frame of one moving parent | 8 ms | 6 ms |
| 500 shapes, frames 8 deep | 9 ms | 6 ms |
| A trail of 500 / 5000 positions | 2 / 5 ms | under 1 ms |
| The same trail, the point being in a moving frame | 5 / 28 ms | 4 / 26 ms |
| A new cloud of 1000 / 10 000 / 100 000 points | 3 / 7 / 19 ms | 1 / 2 / 3 ms |
| 4000 telemetries stored, none displayed | 0.1 ms (7 ms four times per second, when old data is looked for) | |

What these say:

- **Shapes cost about 10 microseconds each** per update when they move; what does not change costs nothing (a view only redraws when its key changes). A thousand moving shapes is comfortable, a few thousand is the limit.
- **Frames are almost free**: the pose of a frame is computed once per update for everything that is in it (`ViewScene3D.poseOf`, cached during the update), however deep the frames go.
- **A trail in a moving frame is the expensive case**: each of its positions is placed with the frame as it was at that time, about 5 microseconds per position. The default trail (200) costs 1 ms; 5000 uses most of the budget.
- **Large clouds belong in the 3D view**, which hands the arrays to the GPU. The 2D view draws them pixel by pixel above 3000 points: fine up to tens of thousands, heavy at 100 000 per update.
- **Stored telemetries cost nothing while idle**: old data is looked for four times per second, not on every update, and a telemetry that has nothing too old is skipped at once.

Found and fixed while measuring:

- The legend of a 2D or 3D view created a number formatter for every value on every update (24 microseconds per telemetry, more than drawing it). The formatter is kept, and a hidden legend is not computed.
- Old data was looked for in every telemetry on every update: 12 ms with 3600 telemetries. Now four times per second, with an early exit.
- What the 2D view draws (`items`) was wrapped in Vue proxies by the webapp: twice the time for large scenes. It is `markRaw` now, like the sample storage and the chart decimators: **anything a view reads on every update must be raw**.
- Telemetries whose times start near zero (a device that counts from its start) lost all their samples but the last one at the first update: the limit of the data window became negative, which the search understood as "the latest sample". Not a speed problem, but it was found by a benchmark whose numbers looked too good.

Not measured: the WebGL drawing time of the 3D view, other browsers, and long sessions with these new views (the robot sample was watched for one minute only).

## States, marks and thresholds (measured on 2026-10-13)

Measured in the webapp (Vue proxies around the library), Chromium, views 800 pixels wide, with one million samples stored and new samples on every update (so nothing is served from "nothing changed"). Figures are the update of one view; 33 ms is the budget of a whole page.

| What the view shows | Update |
|---|---|
| Timeline: a state sent again 1000 times per second for 5 minutes (300 000 samples, 150 states) | under 0.1 ms |
| Timeline: a state that changes on every sample, 1000 times per second (300 000 states) | 3 ms |
| Timeline: a log of 100 000 lines | 0.2 ms |
| Chart: a series of 300 000 samples, with that log and that state as marks, and a threshold that moves 50 times per second (15 000 samples) | 1.3 ms |
| Timeline: a number of 300 000 samples (1000 per second) drawn as a line | 0.1 ms |
| Timeline: the same number read through its thresholds (bands), a limit moving on every update | 0.1 ms |
| Values: a number with a range and those thresholds | 0.1 ms |
| The threshold a value is past, asked 100 times at 100 different times | 0.1 ms |
| The steps of 15 000 threshold samples over a period | 0.3 ms |

What these say:

- **A state costs what it changes, not what it is sent.** `TELEPLOT.textRuns(entry)` keeps, next to a text entry, one item per run of the same text, completed as samples are appended (`107-textRuns.js`). Timelines and the marks of a chart work on runs: a state sent at every loop of a device is free. Before it, the three lanes above took 5 ms.
- **A state that really changes a thousand times per second** is gone through on every update (10 nanoseconds per state). It is drawn as blocks of "several states here": the cost is in counting them, not in drawing. Fine for a few hundred thousand; not a use to plan for.
- **Thresholds are indexed by name** (`Telemetry.__thresholdIndex`, completed as samples are appended): asking which limit holds at a time is a search per name, whatever the number of samples. Before it, a limit that moved often made every question go through all its samples (25 microseconds each with 15 000 samples).
- **A number in a timeline costs what is new.** Its line comes from a `MinMaxDecimator`, like a chart. Its bands (`ViewTimeline.limitRuns`) are runs of "past the same threshold", completed as samples are appended; a new threshold only makes it read again what came from its time on, and samples removed by the data window take their runs with them. Reading 300 000 samples from scratch takes 30 to 45 ms: it happens once, when the lane is created (or after a late insertion), not while data flows.
- **Marks are bounded by the pixels**: closer than 6 pixels they are folded, so a chart never draws more than a mark every 6 pixels however long the log is. What is computed for the period displayed (`chart.overlay`) is only computed again when its data, the period or an option changes.
- Both caches follow the rule of this page: they are kept out of what a framework can wrap (`textRuns` in a `WeakMap`, the index on the raw data entry), and they are thrown away when samples are inserted late or removed (`lateInsertions`, `pruned`).

Found and fixed while checking edge cases:

- A text that held a colon (`mode:error: stalled|t`) was read as "time: text" with a time that is not a number, and stored at that time: the order of the samples was broken and the views that search by time failed. The parser now takes the time of a text only from a first field that is a number, and the datastore refuses any timestamp that is not one.
- The latest state of a timeline had no width when nothing else made time pass after it. It is given 4 % of the period.
