# Server

`packages/server/main.js` receives telemetry as UDP packets and relays it to the pages connected to it through a WebSocket. It also sends the commands of the pages back to the device that sent the telemetry (see `telecmd.md`), and serves the webapp. Browsers cannot receive UDP: this is what the server is for. A serial port needs no server (see `doc/sources.md`).

```bash
cd packages/server
npm ci
node main.js
```

Releases also have it as one executable per platform (`teleplot-<os>-<arch>`), with the webapp inside.

## Options

| Option | Default | |
|---|---|---|
| `--port <port>` | 8080 | Port of the web page and of the WebSocket |
| `--host <address>` | every network interface | Address they listen on. `--host 127.0.0.1`: this machine only |
| `--udp-port <port>` | 47269 | UDP port the telemetry is received on |
| `--udp-host <address>` | every network interface | Address the telemetry is received on |
| `--cmd-port <port>` | 47268 | UDP port the raw `{"cmd": text}` messages of the pages are forwarded to (commands of `telecmd.md` go back to their sender) |
| `--cmd-host <address>` | 127.0.0.1 | Address they are forwarded to |
| `--read-only` | | Refuse the commands of the pages: the devices are only watched. Pages are told (`hello`) |
| `--allow-origin <origin>` | | Also accept the pages of this origin. Can be repeated, or a list separated by commas |
| `--batch <ms>` | 50 | Packets are grouped and sent to the pages every `<ms>`. 0: each packet as it arrives |
| `--max-buffer <MB>` | 64 | Data waiting for a page that is too slow, above which packets are dropped for it |
| `--www <folder>` | `www/` next to `main.js`, or `../webapp` | Folder of the webapp to serve |
| `--serve [/url=]<folder>` | | Also serve the files of this folder. Can be repeated |
| `--help`, `--version` | | |

`--name value` and `--name=value` are both read. The server only says it started once both ports are open; when one is taken it says which, and stops.

## Other folders

`--serve` gives the pages files of your own from the same address as the webapp: textures and pictures that telemetry names by their URL, a page of yours that uses the library...

```bash
node main.js --serve /maps=/home/me/maps --serve ./assets
```

- `/url=folder`: the files of the folder are under that address (`http://127.0.0.1:8080/maps/field.png`). An address starts with `/`.
- `folder` alone: its files are at the root, next to the webapp. When both have a file of the same name, the one of the webapp is served; folders are looked at in the order they are given.

A folder that does not exist is said and skipped. The files are served to anyone who can reach the server, without a list of the folder. Being at the same address as the webapp, they need nothing more to be used as textures (a picture of another site needs that site to allow it).

## Who can connect

A browser lets any page of any site open a WebSocket to a machine of the local network. Without a check, a site visited in the same browser could read the telemetry and send commands to the device. The server looks at the origin of the page that connects:

- a page **served by this machine** is accepted: `localhost`, `127.0.0.1`, `*.localhost`, the host name of the machine and the addresses of its network interfaces, whatever the port (so the webapp can be served by something else on the same machine, and opened from another computer through the address of this one);
- anything that is **not a page of a browser** (no origin: a script, a tool) is accepted;
- the others are refused (HTTP 403) and the server prints the origin once, with the option that accepts it: `--allow-origin https://my.site` (that exact origin), `--allow-origin my.site` (that host, any port), `--allow-origin null` (pages opened from a local file: `file://` has no origin; sandboxed frames of any site are "null" too), `--allow-origin "*"` (any page).

This protects against other web sites, not against the network: by default the page, the WebSocket and the UDP port are open to every machine that can reach this one, and there is no password. `--host 127.0.0.1` keeps the page and the WebSocket on this machine.

## Messages

Server to page:

- **Hello**: first, `{"hello": {"readOnly": false, "senders": {"0": "192.168.1.12:50123"}}}`: the page can send commands (unless
  read-only), and the senders known so far.
- **Text packets**: one text message per batch, JSON.

  ```json
  {"time": 5050.12, "senders": {"1": "192.168.1.13:4000"}, "binary": [1, 1], "packets": [[5001.004, "speed:12.5", 0], [5002.51, "speed:12.7\ntemp:24", 0]], "dropped": 3}
  ```

  `packets`: each UDP packet as it came, after the time the server received it, and who sent it (an index: the address and port
  are in `senders`, given once, when a sender shows up). `binary`: the senders of the packets of the binary message that follows,
  in its order (the text message is then sent even without text packets). `time`: when the message was sent. Both in ms on a clock of the server that only counts (it is not a date, and starts again with the server). `dropped`: only when packets were not sent to this page since the last message (see below).

  A sample without a timestamp is dated when the server received its packet. The page cannot use the clock of the server as it is (another machine, another clock): the library keeps the smallest `receive time - time` it saw, the message that travelled the fastest, as the difference between the two clocks (`ConnectionTeleplotServer.__serverClockOffset`). Samples are then as far apart as the packets were at the server, whatever each message took to come, and never in the future. What it cannot know is the shortest travel time itself: every sample is late by that much (under a millisecond on one machine).

- **Binary packets**: one binary message per batch. A packet alone is sent as it is (it starts with `0x10`). Several are framed like a binary data file (`doc/files.md`): `FILE_MAGIC`, then each packet after its length (uint32, little-endian). The server reads nothing but the first byte of a packet: a version of the protocol it does not know is relayed all the same. Binary samples always carry their time, so the batch changes nothing to them.

Page to server:

- `{"write": "kp:0.42", "to": sender}` and `{"writeBinary": "<base64>", "to": sender}`: a command (`telecmd.md`), sent as a UDP packet
  from the telemetry port to the address and port of that sender (an index the server gave, see below). Refused with `--read-only`;
  a sender the server does not know is reported and ignored.
- `{"cmd": "text"}`: the text is sent as a UDP packet to `--cmd-host`:`--cmd-port`. Other fields are ignored. The commands Teleplot V1 pages send to their server (`listSerialPorts`, `connectSerialPort`, `disconnectSerialPort`, `sendToSerial`) are not forwarded; a message that is not JSON, or without a `cmd` text, is ignored and reported in the output of the server. A message of more than 64 kB closes the connection.

The library still reads what a Teleplot V1 server sends (`{"data": "...", "timestamp": ...}`: one text for a whole batch, dated when the page receives it).

## Slow pages

The server does not wait for a page. When more than `--max-buffer` is waiting to be sent to one (a tab that froze, a slow network), the next packets are dropped for that page only, the server says so, and the page is told how many once it reads again (`dropped`): the library adds them to `connection.stats.dropped` and the Sources panel shows them. Nothing is kept when no page is connected.

## Limits and choices

- Text packets wait up to `--batch` ms before they are sent (their timestamps do not depend on it). Binary packets too, since they are grouped: before, each was sent at once. `--batch 0` sends everything as it arrives, one message per packet.
- The time of reception is taken when Node reads the packet, not when the network card got it: packets that queued in the system during a busy moment get close times.
- JSON for text packets costs an escape of each text and its parsing in the page. It was kept because it is one line to read anywhere; a binary envelope would be faster for very high text rates, where the binary protocol is the better answer anyway.
- Commands go back to the address and port a device sends from: a device that sends from one socket and listens on another does
  not get them (the client libraries use one socket). Senders are kept until there are 1000 of them, then the list starts again.
- No TLS, no password.

## Tests

`packages/server/test.sh` (needs `npm ci`): starts real servers on free ports and talks to them with UDP packets and WebSocket clients (`tests/server.test.js`). `main.js` exports `startServer(options)` (options named as in `DEFAULTS`, resolves with `{port, udpPort, www, served, close()}`), `parseArguments`, `parseServed`, `isOriginAllowed`.
