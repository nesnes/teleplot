# teleplot-js tests

Tests of the library ([README](../README.md)).

No dependency: a tiny runner (`run.js`, [`helpers/mini-test.js`](helpers/mini-test.js)) on top of `node:assert`, works on Node 16+ (`node:test` needs Node 18). Only the library is tested (nothing outside [`packages/teleplot-js/`](../)).

    ./test.sh                                   # from packages/teleplot-js/
    ./test.sh decimat                           # only tests whose file/name match this regex

The tests load the library sources (`src/NNN-*.js`) directly, not the built bundle, into a fresh isolated instance. Vue, uPlot, the DOM, WebSocket and timers are replaced by light stubs (three.js is not loaded: the 3D view computes its scene without it, only drawing needs it) ([`helpers/stubs.js`](helpers/stubs.js)), so views and connections run in Node and nothing runs by itself (`T.__timers.run()` fires pending timers).

| File | Covers |
|---|---|
| `datastore.test.js` | ordered/late insertion, pruning, timeouts, `getDataPoint`, naming, thresholds and ranges, runs of a text, when a new telemetry is announced |
| `parseDataText.test.js` | V1 text protocol (retro-compatibility), `ATTR|` and `TH|` lines, empty texts and texts with colons |
| `viewScene2D.test.js` | `2D|` lines, flat shapes, frames and pixel frames (text and binary), what the 2D view draws, default view of flat telemetries |
| `files.test.js` | data files: text and binary export, read back and compared with what was stored; import in pieces, options |
| `dashboardText.test.js` | dashboards as text: `DASH|` lines received (text and binary), export, import, labels that are paths |
| `parseDataBinary.test.js` | binary protocol decoding (packets built by [`helpers/packet.js`](helpers/packet.js), independent of the parser) |
| `decimator.test.js` | min/max decimation vs a naive reference, incremental == from scratch |
| `protocol.test.js` | protocol constants, clients, colors |
| `viewLog.test.js` | log view: rows built from text telemetries, time window, cursor, line limit |
| `dashboards.test.js` | dashboard helpers: stats, creation, unique names |
| `time.test.js` | reception on and off (periods not received, files, the memory limit), the time shown per group: hold, seek, step, replay, span placed at 70 %, live window, the data window moving a held moment, commands not live, breaks of chart lines (and the real `uPlot.join`) ([time.md](../../../doc/time.md)) |
| `commands.test.js` | commands ([telecmd.md](../../../doc/telecmd.md)): settings, actions, continuous control, the parsers and connections that carry them |
| `bootClock.test.js` | times since boot: times of a board dated by the page, per source ([sources.md](../../../doc/sources.md)) |
| `views.test.js` | views, layout, stack, drag and drop, dashboards, update loop |
| `viewChart.test.js` | data given to the chart (decimation, multi-series, zoom), legend values, marks of text telemetries, thresholds and range of the series, current value view (bar, threshold status) |
| `viewTimeline.test.js` | timeline: bands of states, holes, ticks of logs, what is too short to draw, period displayed, colors, what is under the pointer |
| `viewScene3D.test.js` | 3D view: shape state at a time (defaults, rotation/quaternion, colors, textures), trails, suggested view, shared scene of the auto dashboard |
| `pictures.test.js` | depth maps: 16-bit PNG (every filter) and plain gray16 / float32 decoded, scale and no measure (text and binary), colors and percentiles, the depth map placed in 3D and 2D views, files |
| `viewImage.test.js` | image view: camera state, projection of a point, lens distortion and its inverse, ideal window, projection matrix, which telemetry is the picture |
| `connectionSerial.test.js` | serial ports through Web Serial (fake port): lines across chunks, ">" telemetry vs log lines, console, send, baud rate, lost port, browser dialog |
| `connection.test.js` | WebSocket connection, message routing, UDP and serial inputs |

`views.test.js` also covers clone, dispose/removeView, telemetry list helpers, the options schema, appearance/top color inheritance, empty states, log levels, time axis labels and the theme. The webapp has its own tests ([`packages/webapp/test.sh`](../../webapp/test.sh), same runner): the editor commands, the export helpers, the Help panel and the rates ([`tests/`](../../webapp/tests/)).

Add a test next to the feature it covers. Not covered: rendering (Vue templates, real uPlot), which needs a browser.
