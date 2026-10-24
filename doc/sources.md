# Sources

Where the data comes from, and whether it is arriving. Connections are a library feature (`packages/teleplot-js`, `src/02x`); the Sources panel of the webapp (`packages/webapp/components/panel-sources.js`) displays them. The design study that led to the panel is in `doc/sources-panel-proposals.html` and `doc/sources-panel-mockups-2.html` (design A was built).

## Kinds of sources

| Source | How | Library |
|---|---|---|
| Teleplot server | UDP packets (port 47269) received by `packages/server` and relayed to the page through a WebSocket (see `doc/server.md`). Text and binary protocols. | `TELEPLOT.connection.addConnectionTeleplotServer(address, port)` |
| Serial port | Opened by the browser itself with the Web Serial API: no server. Chrome, Edge and Opera on a computer. Text protocol. | `TELEPLOT.connection.requestSerialPort(baudRate)`, `addConnectionSerial(port, baudRate)` |

Every connection is in `TELEPLOT.connection.connections` and has `type`, `name`, `connected`, and:

- `stats` (not reactive): `messages` received (packets and lines: the server sends packets in batches, each packet counts), `problems` (packets and lines that could not be read), `dropped` (packets a Teleplot server did not send because this page was too slow to receive them), `bytes` received, `lastMessage` (when the last one came). `bytes` is what the page received: the content of the packets and lines. Network, serial and batch framing are not in it, so it is lower than what travels on the wire.
- the telemetries and clients it created know it: `telemetry.sourceId`, `client.sourceId` are the `id` of the connection that first sent them (`undefined` for what the application created itself). `TELEPLOT.datastore.withSource(id, fn)` is how a connection tells so while it parses.
- `TELEPLOT.connection.removeConnection(connection)` closes it and forgets it; its telemetries stay.

Text samples that have no timestamp are dated when the server received their packet (`doc/server.md` "Messages"), not when the page got the batch they came in.

## Times since boot

A board has no date, only a clock that counts from its boot (`millis()`, `micros()`): the times it writes (`>speed:52341.207:0.5`) would read as the start of 1970. The protocol does not change; the page dates such times itself. The option is per device of a source and **on by default**: a serial port, each sender of a Teleplot server (the sender index the server gives), a local connection. Library: `connection.bootClock(endpoint)` (endpoint: the sender index, `undefined` for a serial port or a local connection) gives a `BootClock` (`src/020-connection.js`) with `enabled`, `setEnabled(on)`, `offReason`, `dated` (samples dated so far). The clock of the device whose message is being parsed is set by `Connection.receive`, and the text parser asks it for each time written in a line (`_parseDataText_time`: numbers, texts, logs, xy / xyz, thresholds, clouds, 2D / 3D lines, pictures).

- A time below 1e11 ms (March 1973) is dated: offset = the smallest "arrival - device time" seen for that device, let go up by 100 ppm for drift (`Connection.lowestOffset`, which also dates the packets of the server: `__serverClockOffset`); stored time = device time + offset. Arrival is when the line was read (serial), or when the server received its packet, on the clock of the page (server). Samples that arrive late (out of order between telemetries: a picture dated at its exposure; a burst after an outage) only give bigger differences, which the minimum ignores.
- **Reboot**, never counted nor limited (debugging over serial resets a board many times a minute): a telemetry whose time goes back below its own previous time (any amount), or a time more than 10 s before the latest time of the device. The offset is measured again from that sample. (The first lines after a reset can be misdated when the board restarts with a telemetry whose new times are still above its old ones and within 10 s of the latest: the next telemetry that goes back corrects it.)
- **Several clocks** on one source (a gateway forwarding several boards): a time more than 10 s ahead of what the clock of the device can have reached (its latest time + the page time elapsed since it arrived). Measured again the first time; the second time the option turns itself off for that device, times are kept as sent, and the Sources panel says why. Turning it on again starts from zero (jumps forgotten).
- Times of 1973 or later from the same device are kept as sent; samples without a time are dated on arrival, as before. Files are never shifted (an import has no clock). Turning the option off or on applies to what comes next: what is stored stays.
- Binary packets are not concerned (the binary clients send dates).

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

The older server-side serial input (`src/032-dataInputSerial.js`, commands sent to the server) is still in the library, but the V2 server does not implement it (it ignores those commands) and the webapp does not use it.

## The Sources panel

- **Summary**: the total rate (samples per second, as in the top menu) and its last minute, the bytes received per second (also on each card: how much `stats.bytes` grew over the last second), the number of telemetries, the age of the last data, and what is wrong (sources down, lines or packets not understood). Its state is Receiving, Idle, Paused or No data yet (with a link to the Help panel).
- **A card per source**, colored by its state (green: connected, amber: silent for more than 5 s, red: down, grey: disconnected on purpose), with its own rate. Click a card for its details.
    - *Server*: what it receives, the clients seen on it, its telemetries, its problems, the packets the server dropped for this page, a "Times since boot" switch per sender (with its address); Retry now, Remove.
    - *Serial port*: baud rate, Disconnect / Reconnect, Remove, the "Times since boot" switch, and its console with a box to send text and a choice of line ending. **Telemetry lines are hidden in the console by default** (they are on the dashboards); the "Telemetry lines" switch shows them, and a telemetry line that could not be understood is always shown, in red. Follow keeps the newest line in view (scrolling up stops it), Timestamps shows when each line came, Clear empties the console.
    - *Robot sample*: start and stop.
- **Times since boot**: the switch says whether it is in use (how many samples were dated). When it turned itself off (several clocks), the card says why in red, even folded; the switch turns it on again.
- **Add a source**: a Teleplot server (address and port), or a serial port (baud rate, then the browser's dialog; ports used before are offered directly). In a browser without Web Serial the serial tile explains it.
- How long data is kept (`TP.state.dataTimeout`) and clearing the data (`TELEPLOT.datastore.clearData()`) are not in this panel: the retention setting will go in the pause / rate menu of the top bar (not done yet).

Rates, ages and consoles are not reactive (they change on every message): the panel refreshes four times per second. The rate history is sampled once per second from the start of the application (`startSourcesMonitor`), so the panel has it even when opened later.

Commands (`telecmd.md`): a card lists what each device of its source accepts, the last result of each, and the round trip of a setting (from sending to the device's echo). Connections can write back (`connection.write`, `canWrite`, `whyNotWritable`): the server connection through the server to the sender of the telemetry, a serial port as lines written to it, and `TELEPLOT.connection.addConnectionLocal(name, onWrite)`, a source that lives in the page (the robot sample, demos, tests: `sendText` / `sendBinary` feed the parsers as a device would, `onWrite` gets what the page writes).

Not there yet: an automated test of the panel itself (the library side is covered by `tests/connection.test.js`, `tests/connectionSerial.test.js` and `tests/bootClock.test.js`, with a fake serial port).
