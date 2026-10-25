# Teleplot server

Receives telemetry as UDP packets (port 47269), relays it to the pages through a WebSocket (port 8080), sends the commands of the
pages back to the devices, and serves the web application ([packages/webapp](../webapp/README.md)). Browsers cannot receive UDP:
this is what it is for. A serial port needs no server.

Everything about it (options, who can connect, messages): [doc/server.md](../../doc/server.md).

```bash
npm ci
node main.js                       # then open http://127.0.0.1:8080
node main.js --help
```

It serves `www/` next to `main.js` when there is one (releases), otherwise `../webapp`.

## Executables

```bash
npm run make
```

One executable per platform in `build/` (`@yao-pkg/pkg`, run through npx), with the webapp inside: copy the webapp to `www/` first,
as the CI does ([`.github/workflows/teleplot-v2.yml`](../../.github/workflows/teleplot-v2.yml)).

## Tests

```bash
./test.sh
```

Real servers on free ports, talked to with UDP packets and WebSocket clients ([`tests/server.test.js`](tests/server.test.js)). Needs `npm ci`.
