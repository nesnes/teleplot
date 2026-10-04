# teleplot-js tests

No dependency: a tiny runner (`run.js`, `helpers/mini-test.js`) on top of `node:assert`, works on Node 16+ (`node:test` needs Node 18). Only the library is tested (nothing outside `packages/teleplot-js/`).

    ./test.sh                                   # from packages/teleplot-js/
    ./test.sh decimat                           # only tests whose file/name match this regex

The tests load the library sources (`src/NNN-*.js`) directly, not the built bundle, into a fresh isolated instance. Vue, uPlot, the DOM, WebSocket and timers are replaced by light stubs (`helpers/stubs.js`), so views and connections run in Node and nothing runs by itself (`T.__timers.run()` fires pending timers).

| File | Covers |
|---|---|
| `datastore.test.js` | ordered/late insertion, pruning, timeouts, `getDataPoint`, naming |
| `parseDataText.test.js` | V1 text protocol (retro-compatibility) |
| `parseDataBinary.test.js` | binary protocol decoding (packets built by `helpers/packet.js`, independent of the parser) |
| `decimator.test.js` | min/max decimation vs a naive reference, incremental == from scratch |
| `protocol.test.js` | protocol constants, clients, colors |
| `views.test.js` | views, layout, stack, drag and drop, dashboards, update loop |
| `viewChart.test.js` | data given to the chart (decimation, multi-series, zoom), legend values, current value view |
| `connection.test.js` | WebSocket connection, message routing, UDP and serial inputs |

Add a test next to the feature it covers. Not covered: rendering (Vue templates, real uPlot), which needs a browser.
