# teleplot-js tests

No dependency: a tiny runner (`run.js`, `helpers/mini-test.js`) on top of `node:assert`, works on Node 16+ (`node:test` needs Node 18). Only the library is tested (nothing outside `packages/teleplot-js/`).

    ./test.sh                                   # from packages/teleplot-js/
    ./test.sh decimat                           # only tests whose file/name match this regex

The tests load the library sources (`src/NNN-*.js`) directly, not the built bundle, into a fresh isolated instance. Vue, uPlot, the DOM, WebSocket and timers are replaced by light stubs (three.js is not loaded: the 3D view computes its scene without it, only drawing needs it) (`helpers/stubs.js`), so views and connections run in Node and nothing runs by itself (`T.__timers.run()` fires pending timers).

| File | Covers |
|---|---|
| `datastore.test.js` | ordered/late insertion, pruning, timeouts, `getDataPoint`, naming |
| `parseDataText.test.js` | V1 text protocol (retro-compatibility) |
| `parseDataBinary.test.js` | binary protocol decoding (packets built by `helpers/packet.js`, independent of the parser) |
| `decimator.test.js` | min/max decimation vs a naive reference, incremental == from scratch |
| `protocol.test.js` | protocol constants, clients, colors |
| `views.test.js` | views, layout, stack, drag and drop, dashboards, update loop |
| `viewChart.test.js` | data given to the chart (decimation, multi-series, zoom), legend values, current value view |
| `viewScene3D.test.js` | 3D view: shape state at a time (defaults, rotation/quaternion, colors, textures), trails, suggested view, shared scene of the auto dashboard |
| `viewImage.test.js` | image view: camera state, projection of a point, lens distortion and its inverse, ideal window, projection matrix, which telemetry is the picture |
| `connectionSerial.test.js` | serial ports through Web Serial (fake port): lines across chunks, ">" telemetry vs log lines, console, send, baud rate, lost port, browser dialog |
| `connection.test.js` | WebSocket connection, message routing, UDP and serial inputs |

`views.test.js` also covers clone, dispose/removeView, telemetry list helpers, the options schema, appearance/top color inheritance, empty states, log levels, time axis labels and the theme. The webapp has its own tests (`packages/webapp/test.sh`, same runner): `tests/dashboard-editor.test.js` covers the editor commands.

Add a test next to the feature it covers. Not covered: rendering (Vue templates, real uPlot), which needs a browser.
