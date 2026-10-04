# Performance notes

## Chart display: min/max decimation

uPlot needs all the series of a chart on a shared x axis, so `uPlot.join` merges them. This is costly (it is proportional to the total number of points) and had to run on every frame, which made multi-series charts collapse as soon as a few hundred thousand points were stored.

A chart now only gives uPlot what a screen can show (`src/106-decimator.js`, used by `src/111-viewChart.js`):

- Time is cut in fixed-width buckets, and only the first, minimum, maximum and last samples of each bucket are kept (at most 4 per bucket, about 4 per pixel column). The drawn line is the same as with all the points.
- When zoomed in far enough that there is at most one sample per bucket, all samples are displayed untouched.
- Buckets are aligned on absolute time and their width is a power of two: scrolling doesn't make the line shimmer, and the width only changes when the visible range doubles or halves.
- **Incremental**: finished buckets are cached, so when data is appended only the new samples and the last (open) bucket are scanned. The cost per frame depends on the new data and the number of pixels, not on the number of stored points.
- The stored data is never modified, sampled or copied: the number of points that can be kept in a session (see `Teleplot.state.dataTimeout` and the per-telemetry timeout attribute) is unchanged. The only extra memory is the display cache (a few thousand points per series).
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
