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

## Measuring

`packages/teleplot-js/test-performance.html` streams synthetic telemetries (series count, rate, data timeout, out-of-order samples, number of charts, all configurable and kept in the URL) through the text protocol, and reports frame rate, ingestion rate, stored points, JS heap (Chrome only) and the time spent per update.

Reference measurements (headless Chromium, 4 series with distinct timestamps, 15 s window):

| Setup | Views update | Page fps | JS heap |
|---|---|---|---|
| 5 kHz per series, decimation on | 2.1 ms avg (6.7 ms max) | 60 | 12 MB |
| 5 kHz per series, decimation off | 108 ms avg (271 ms max) | 4 | 121 MB |
