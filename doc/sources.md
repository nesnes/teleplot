# Sources

Where the data comes from, and whether it is arriving. Connections are a library feature (`packages/teleplot-js`, `src/02x`); the Sources panel of the webapp (`packages/webapp/components/panel-sources.js`) displays them. The design study that led to the panel is in `doc/sources-panel-proposals.html` and `doc/sources-panel-mockups-2.html` (design A was built).

## Kinds of sources

| Source | How | Library |
|---|---|---|
| Teleplot server | UDP packets (port 47269) received by `packages/server` and relayed to the page through a WebSocket. Text and binary protocols. | `TELEPLOT.connection.addConnectionTeleplotServer(address, port)` |
| Serial port | Opened by the browser itself with the Web Serial API: no server. Chrome, Edge and Opera on a computer. Text protocol. | `TELEPLOT.connection.requestSerialPort(baudRate)`, `addConnectionSerial(port, baudRate)` |

Every connection is in `TELEPLOT.connection.connections` and has `type`, `name`, `connected`, and:

- `stats` (not reactive): `messages` received, `problems` (packets and lines that could not be read), `bytes` received, `lastMessage` (when the last one came). `bytes` is what the page received: the content of the packets and lines, exact for serial ports and binary packets; for text relayed by the server it is the size of the text (the server groups the lines of several packets). Network and serial framing are not in it, so it is lower than what travels on the wire.
- the telemetries and clients it created know it: `telemetry.sourceId`, `client.sourceId` are the `id` of the connection that first sent them (`undefined` for what the application created itself). `TELEPLOT.datastore.withSource(id, fn)` is how a connection tells so while it parses.
- `TELEPLOT.connection.removeConnection(connection)` closes it and forgets it; its telemetries stay.

A server that cannot be reached, or that closes, is tried again every 2 seconds (`nextRetryAt`); `retry()` tries now, `disconnect()` stops for good. `everConnected` tells "lost" from "never reached".

The parsers report what they could not read: `TELEPLOT.parseDataText()` returns the number of such lines (a line that is not empty and holds no `name:value`, or that made the parser fail), `TELEPLOT.parseDataBinary()` returns `false` for an invalid packet.

## Serial ports (Web Serial)

- **Choosing a port** is the browser's job: `requestSerialPort()` opens its dialog and must be called from a click. The page never sees the list of ports. Ports allowed before are given by `getGrantedSerialPorts()` and can be opened without a dialog.
- **Names**: browsers only tell the USB ids of a port. A few common chips are recognised (`CP210x 10c4:ea60`, `CH340 1a86:7523`...), the others are `USB serial vvvv:pppp`.
- **Lines**: what the port sends is read line by line. As in Teleplot V1, a line starting with `>` is telemetry (the text protocol after the `>`: `>temp:24.5`, `>pos:1:2|xy`, `>3D|box:S:cube`...), any other line is a log line, stored in the text telemetry `<port name>_text_logs`.
- **Console**: every line received or sent is also kept as it came in `connection.console.lines` (the last `maxConsoleLines`, 2000): `{t, text, sent, telemetry, problem}`. `problem` marks a telemetry line that could not be understood. `clearConsole()` empties it (the data is not touched).
- **Sending**: `connection.send(text, lineEnding)`.
- **Speed**: `connection.baudRate`, `setBaudRate()` (the port is opened again).
- **Lost port**: when the device is unplugged, `connected` goes false and `error` says why; the connection stays in the list and `connect()` opens it again once it is back. Reloading the page closes every port: the browser remembers the permission, not the open port.
- While the display is paused, lines still show in the console but are not stored (like any incoming data).

The older server-side serial input (`src/032-dataInputSerial.js`, commands sent to the server) is still in the library, but the V2 server does not implement it and the webapp does not use it.

## The Sources panel

- **Summary**: the total rate (samples per second, as in the top menu) and its last minute, the bytes received per second (also on each card: how much `stats.bytes` grew over the last second), the number of telemetries, the age of the last data, and what is wrong (sources down, lines or packets not understood). Its state is Receiving, Idle, Paused or No data yet (with a link to the Help panel).
- **A card per source**, colored by its state (green: connected, amber: silent for more than 5 s, red: down, grey: disconnected on purpose), with its own rate. Click a card for its details.
    - *Server*: what it receives, the clients seen on it, its telemetries, its problems; Retry now, Remove.
    - *Serial port*: baud rate, Disconnect / Reconnect, Remove, and its console with a box to send text and a choice of line ending. **Telemetry lines are hidden in the console by default** (they are on the dashboards); the "Telemetry lines" switch shows them, and a telemetry line that could not be understood is always shown, in red. Follow keeps the newest line in view (scrolling up stops it), Timestamps shows when each line came, Clear empties the console.
    - *Robot sample*: start and stop.
- **Add a source**: a Teleplot server (address and port), or a serial port (baud rate, then the browser's dialog; ports used before are offered directly). In a browser without Web Serial the serial tile explains it.
- How long data is kept (`TP.state.dataTimeout`) and clearing the data (`TELEPLOT.datastore.clearData()`) are not in this panel: the retention setting will go in the pause / rate menu of the top bar (not done yet).

Rates, ages and consoles are not reactive (they change on every message): the panel refreshes four times per second. The rate history is sampled once per second from the start of the application (`startSourcesMonitor`), so the panel has it even when opened later.

Not there yet: remote commands (telecmd), and an automated test of the panel itself (the library side is covered by `tests/connection.test.js` and `tests/connectionSerial.test.js`, with a fake serial port).
