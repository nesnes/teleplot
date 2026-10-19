// Teleplot server: receives telemetry as UDP packets and relays it to the pages connected through a WebSocket, sends the commands
// of the pages back to the device that sent the telemetry (UDP), and serves the webapp. Options and messages exchanged with the
// page: doc/server.md; commands: doc/telecmd.md
const fs = require('fs');
const os = require('os');
const path = require('path');
const dgram = require('dgram');
const { performance } = require('perf_hooks');
const express = require('express');
const expressWs = require('express-ws');

const DEFAULTS = {
    port: 8080,           // Web page and WebSocket
    host: "",             // Address they listen on ("" = every network interface)
    udpPort: 47269,       // Telemetry
    udpHost: "",          // Address it is received on ("" = every network interface)
    cmdPort: 47268,       // Commands of the pages are sent there...
    cmdHost: "127.0.0.1", // ...on this machine
    allowOrigin: [],      // Pages of other sites allowed to connect ("*" = any)
    batch: 50,            // Packets are grouped and sent to the pages every "batch" ms (0 = each packet as it arrives)
    maxBuffer: 64,        // MB waiting to be sent to a page above which packets are dropped for it
    www: "",              // Folder of the webapp ("" = www/ next to this file, or ../webapp)
    serve: [],            // Other folders to serve: "folder" (at the root, after the webapp) or "/url=folder"
    readOnly: false,      // Commands of the pages are refused
};

// name on the command line, option, type, value shown in the help, description
const ARGUMENTS = [
    ["--port", "port", "port", "<port>", "Port of the web page and of the WebSocket"],
    ["--host", "host", "text", "<address>", "Address they listen on, ex: 127.0.0.1 for this machine only (default: every network interface)"],
    ["--udp-port", "udpPort", "port", "<port>", "UDP port the telemetry is received on"],
    ["--udp-host", "udpHost", "text", "<address>", "Address the telemetry is received on (default: every network interface)"],
    ["--cmd-port", "cmdPort", "port", "<port>", "UDP port the commands sent from the pages are forwarded to"],
    ["--cmd-host", "cmdHost", "text", "<address>", "Address they are forwarded to: the device that runs them"],
    ["--allow-origin", "allowOrigin", "list", "<origin>", "Also accept the pages of this origin (ex: https://my.site, a host name, null for local files, * for any). Can be repeated. Pages served by this machine are always accepted"],
    ["--batch", "batch", "number", "<ms>", "Packets are grouped and sent to the pages every <ms> (0: each packet as it arrives)"],
    ["--max-buffer", "maxBuffer", "number", "<MB>", "Data waiting for a page that is too slow, above which packets are dropped for it"],
    ["--www", "www", "text", "<folder>", "Folder of the webapp to serve"],
    ["--serve", "serve", "texts", "[/url=]<folder>", "Also serve the files of this folder (pictures, textures, pages...): under /url, or next to the webapp, whose files come first. Can be repeated"],
    ["--read-only", "readOnly", "flag", "", "Refuse the commands of the pages: the devices are only watched"],
];

// Commands that Teleplot V1 pages send to the server itself (its serial ports, which this server does not have): not for the device
const SERVER_COMMANDS = new Set(["listSerialPorts", "connectSerialPort", "disconnectSerialPort", "sendToSerial"]);

const BINARY_MARKER = 0x10; // First byte of a packet of the binary protocol (doc/binaryProtocol.md). Text cannot start with it.
// Several binary packets in one message are framed like a binary data file (doc/files.md): this header, then each packet after its length (uint32)
const FILE_MAGIC = Buffer.from([0x54, 0x50, 0x4C, 0x54, 0x0A, 0x01, 0x00, 0x00]);

const MAX_COMMAND_SIZE = 64 * 1024; // Bytes of a message from a page
const WARNING_INTERVAL = 5000;      // ms between two warnings about the same thing

// Reads the command line. Returns { options } or { error } or { help: true } or { version: true }
function parseArguments(args) {
    let options = {};
    for (let i = 0; i < args.length; i++) {
        let [name, value] = args[i].split(/=(.*)/s);
        if (name == "--help" || name == "-h") return { help: true };
        if (name == "--version" || name == "-v") return { version: true };
        let argument = ARGUMENTS.find(a => a[0] == name);
        if (!argument) return { error: `Unknown option ${args[i]}` };
        if (argument[2] == "flag") { options[argument[1]] = value === undefined || !["0", "false", "no"].includes(value); continue; }
        if (value === undefined) value = args[++i];
        if (value === undefined) return { error: `${name} needs a value` };
        let [, key, type] = argument;
        if (type == "list") options[key] = (options[key] || []).concat(value.split(",").map(v => v.trim()).filter(v => v != ""));
        else if (type == "text") options[key] = value;
        else if (type == "texts") options[key] = (options[key] || []).concat([value]);
        else {
            let number = Number(value);
            if (value.trim() == "" || !isFinite(number) || number < 0) return { error: `${name} needs a number, not "${value}"` };
            if (type == "port" && (!Number.isInteger(number) || number > 65535)) return { error: `${name} needs a port (0 to 65535), not "${value}"` };
            options[key] = number;
        }
    }
    return { options };
}

function helpText() {
    let lines = ["Teleplot server: relays the telemetry received as UDP packets to the Teleplot web page.", "", "Usage: teleplot [options]", ""];
    for (let [name, key, , value, description] of ARGUMENTS) {
        let byDefault = DEFAULTS[key] === "" || DEFAULTS[key] === false || Array.isArray(DEFAULTS[key]) ? "" : ` (default: ${DEFAULTS[key]})`;
        lines.push(`  ${(name + " " + value).padEnd(26)}${description}${byDefault}`);
    }
    lines.push(`  ${"--help, --version".padEnd(26)}`);
    return lines.join("\n");
}

// Names and addresses of this machine: what a page it serves has in its address
function localNames() {
    let hostname = os.hostname().toLowerCase();
    let names = new Set(["localhost", "127.0.0.1", "::1", hostname]);
    if (!hostname.includes(".")) names.add(hostname + ".local");
    for (let addresses of Object.values(os.networkInterfaces())) {
        for (let address of addresses || []) names.add(address.address.toLowerCase().split("%")[0]);
    }
    return names;
}

// Whether a page of this origin (the Origin header of its WebSocket) may connect. Browsers let any page of any site open a
// WebSocket to this server: without this, a site visited in the same browser could read the telemetry and send commands.
// Pages served by this machine pass (whatever their port: the webapp can be served by something else), the others need to be
// listed. The names are those of the machine, not the Host header, which a hostile site controls.
function isOriginAllowed(origin, allowed = []) {
    if (origin === undefined) return true; // Not a page of a browser (a script, a tool): nothing to protect against
    if (allowed.includes("*") || allowed.includes(origin)) return true;
    let hostname;
    try { hostname = new URL(origin).hostname.toLowerCase().replace(/^\[|\]$/g, ""); }
    catch (e) { return false; } // "null" (a local file, a sandboxed frame), unless it is listed
    return allowed.includes(hostname) || hostname.endsWith(".localhost") || localNames().has(hostname);
}

// "folder" or "/url=folder" (--serve) as { url, folder }
function parseServed(text) {
    let parts = /^(\/[^=]*)=(.+)$/s.exec(text);
    return parts ? { url: parts[1], folder: path.resolve(parts[2]) } : { url: "/", folder: path.resolve(text) };
}

function describeListenError(error, what, port, argument) {
    if (error.code == "EADDRINUSE") return `Port ${port} (${what}) is already in use: is another Teleplot server running? Choose another one with ${argument}.`;
    if (error.code == "EACCES") return `Not allowed to use port ${port} (${what}). Choose another one with ${argument}.`;
    return `Cannot use port ${port} (${what}): ${error.message}`;
}

// Starts the server. Resolves once it listens with { port, udpPort, www, served, close() }, rejects with an Error to show when it cannot.
// options: see DEFAULTS, and log (function called with each line to print).
function startServer(userOptions = {}) {
    const options = { ...DEFAULTS, ...userOptions };
    const log = options.log || console.log;
    const maxBufferBytes = options.maxBuffer * 1024 * 1024;

    // The same warning is not repeated for a while (a page or a device can cause one per message)
    const lastWarnings = {};
    function warn(key, text) {
        let now = Date.now();
        if (now - (lastWarnings[key] || -Infinity) < WARNING_INTERVAL) return;
        lastWarnings[key] = now;
        log(text);
    }

    // ---- Web page and WebSocket
    const app = express();
    const refused = new Set(); // Origins that were refused
    const sockets = expressWs(app, null, { wsOptions: {
        maxPayload: MAX_COMMAND_SIZE,
        verifyClient: (info, answer) => {
            if (isOriginAllowed(info.origin, options.allowOrigin)) return answer(true);
            // Said once per origin: a refused page tries again every 2 seconds
            if (!refused.has(info.origin) && refused.size < 100) log(`Refused a page of ${info.origin == "null" ? "a local file or a sandboxed frame (origin null)" : info.origin}: it is not served by this machine. To accept it: --allow-origin ${info.origin}`);
            if (refused.size < 100) refused.add(info.origin);
            answer(false, 403, "Origin not allowed");
        },
    } });
    const pages = sockets.getWss().clients;
    sockets.getWss().on('error', () => {}); // (errors of the web server are repeated there: they are handled on the web server)

    let www = options.www || [path.join(__dirname, "www"), path.join(__dirname, "..", "webapp")].find(folder => fs.existsSync(folder));
    if (www && fs.existsSync(www)) app.use(express.static(www));
    else {
        log(options.www ? `The folder ${options.www} does not exist: no web page is served, data is only relayed.` : "No webapp found next to the server: no web page is served, data is only relayed.");
        www = undefined;
    }
    // Other folders, after the webapp: at the same address, a file of the webapp comes first
    const served = [];
    for (let entry of options.serve.map(parseServed)) {
        if (!fs.existsSync(entry.folder)) { log(`The folder ${entry.folder} does not exist: it is not served.`); continue; }
        app.use(entry.url, express.static(entry.folder));
        served.push(entry);
    }

    app.ws('/', (page) => {
        page.dropped = 0; // Packets not sent to this page since it was last told (it was too slow)
        // Tell the page it can send commands back, and who sent what (it will be told of new senders as they come)
        page.send(JSON.stringify({ hello: { readOnly: options.readOnly, senders: senderTable() } }));
        // Without a listener, an invalid frame from one page stops the whole server
        page.on('error', (error) => {
            warn("page error", `A page was disconnected: ${error.message}`);
            page.terminate();
        });
        page.on('message', (text) => {
            let message;
            try { message = JSON.parse(text); }
            catch (e) { return warn("command json", "Ignored a message from a page: it is not JSON."); }
            if (message === null || typeof message != "object") return warn("command format", "Ignored a message from a page: not a command.");
            // A command for the device that sent a telemetry (doc/telecmd.md): to the address its packets came from
            if (typeof message.write == "string" || typeof message.writeBinary == "string") {
                if (options.readOnly) return warn("read only", "Refused a command of a page: the server is read-only (--read-only).");
                let to = senders.list[message.to];
                if (to === undefined) return warn("command sender", "Ignored a command of a page: it is for a device this server does not know.");
                let data = typeof message.write == "string" ? Buffer.from(message.write) : Buffer.from(message.writeBinary, "base64");
                return udp.send(data, to.port, to.address, (error) => {
                    if (error) warn("command send", `A command could not be sent to ${to.address}:${to.port}: ${error.message}`);
                });
            }
            if (typeof message.cmd != "string" || message.cmd == "") return warn("command format", 'Ignored a message from a page: no "cmd" text in it.');
            if (SERVER_COMMANDS.has(message.cmd)) return;
            if (options.readOnly) return warn("read only", "Refused a command of a page: the server is read-only (--read-only).");
            udp.send(message.cmd, options.cmdPort, options.cmdHost, (error) => {
                if (error) warn("command send", `A command could not be sent to ${options.cmdHost}:${options.cmdPort}: ${error.message}`);
            });
        });
    });

    // ---- Telemetry: UDP packets, relayed to the pages
    const udp = dgram.createSocket('udp4');
    // A clock that only counts (ms), so that a change of the date of the machine does not move the samples
    const clock = () => Math.round(performance.now() * 1000) / 1000;
    let textPackets = [];   // [time it was received, text, sender]
    let binaryPackets = []; // Buffers
    let binarySenders = []; // Sender of each of them
    let someDropped = false; // A page has not been told yet about packets dropped for it
    // Who sent packets: an index per address and port, given with each packet. Commands of the pages go back there.
    const senders = { byKey: new Map(), list: [], announced: 0 };
    const MAX_SENDERS = 1000;
    function senderOf(info) {
        let key = `${info.address}:${info.port}`;
        let index = senders.byKey.get(key);
        if (index === undefined) {
            if (senders.list.length >= MAX_SENDERS) { senders.byKey.clear(); senders.list = []; senders.announced = 0; } // (a flood of senders: start again)
            index = senders.list.length;
            senders.list.push({ address: info.address, port: info.port, key });
            senders.byKey.set(key, index);
        }
        return index;
    }
    function senderTable(from = 0) {
        let table = {};
        for (let i = from; i < senders.list.length; i++) table[i] = senders.list[i].key;
        return table;
    }

    udp.on('message', (packet, info) => {
        if (packet.length == 0 || pages.size == 0) return;
        let sender = senderOf(info);
        // Only the marker is looked at: a packet of a version of the protocol this server does not know is still relayed, and
        // the page says what it cannot read
        if (packet[0] == BINARY_MARKER) { binaryPackets.push(packet); binarySenders.push(sender); }
        else textPackets.push([clock(), packet.toString(), sender]);
        if (!(options.batch > 0)) flush();
    });

    // Sends what was received since the last time, as one text message and one binary message
    function flush() {
        let count = textPackets.length + binaryPackets.length;
        if (count == 0 && !someDropped) return;
        // Text: each packet with the time it was received, and the time of this message on the same clock. Timestamps the device
        // did not give are the time of reception: the page works it out from these two, which a batch alone would not tell
        // New senders, and the senders of the binary packets of the binary message that follows (in its order)
        let newSenders = senders.announced < senders.list.length ? `,"senders":${JSON.stringify(senderTable(senders.announced))}` : "";
        senders.announced = senders.list.length;
        let textStart = `{"time":${clock()}${newSenders}${binarySenders.length ? `,"binary":${JSON.stringify(binarySenders)}` : ""},"packets":${JSON.stringify(textPackets)}`;
        let binary;
        if (binaryPackets.length == 1) binary = binaryPackets[0];
        else if (binaryPackets.length > 1) {
            let parts = [FILE_MAGIC];
            for (let packet of binaryPackets) {
                let length = Buffer.alloc(4);
                length.writeUInt32LE(packet.length);
                parts.push(length, packet);
            }
            binary = Buffer.concat(parts);
        }
        let hasText = textPackets.length > 0 || binarySenders.length > 0 || newSenders !== "";
        textPackets = [];
        binaryPackets = [];
        binarySenders = [];
        someDropped = false;

        for (let page of pages) {
            if (page.readyState != 1) continue; // (1 = open)
            // A page that does not read fast enough would make the data wait here without limit: it loses packets instead, and is told
            if (page.bufferedAmount > maxBufferBytes) {
                if (page.dropped == 0) warn("slow page", `A page is too slow to receive the data (more than ${options.maxBuffer} MB waiting): packets are dropped for it.`);
                page.dropped += count;
                someDropped = true;
                continue;
            }
            if (hasText || page.dropped) page.send(textStart + (page.dropped ? `,"dropped":${page.dropped}}` : "}"));
            page.dropped = 0;
            if (binary) page.send(binary, { binary: true });
        }
    }

    // ---- Start: both ports, or nothing
    return new Promise((resolve, reject) => {
        let http, timer, waiting = 2, started = false, stopped = false;

        function close() {
            stopped = true;
            clearInterval(timer);
            for (let page of pages) page.terminate();
            return Promise.all([
                new Promise(done => { if (http && http.listening) http.close(done); else done(); }),
                new Promise(done => { try { udp.close(done); } catch (e) { done(); } }),
            ]);
        }
        // An error before both ports are open means the server cannot start; after, it is only reported
        function onError(error, what, port, argument) {
            if (started) return log(`Error (${what}): ${error.message}`);
            if (stopped) return;
            close();
            reject(new Error(describeListenError(error, what, port, argument)));
        }
        function listening() {
            if (stopped) return close(); // the other port failed meanwhile: this one must not stay open
            if (--waiting > 0) return;
            started = true;
            if (options.batch > 0) timer = setInterval(flush, options.batch);
            resolve({ port: http.address().port, udpPort: udp.address().port, www, served, close });
        }

        udp.on('error', (error) => onError(error, "telemetry, UDP", options.udpPort, "--udp-port"));
        udp.bind(options.udpPort, options.udpHost || undefined, listening);
        http = app.listen(options.port, options.host || undefined, listening);
        http.on('error', (error) => onError(error, "web page and WebSocket", options.port, "--port"));
    });
}

function main() {
    let parsed = parseArguments(process.argv.slice(2));
    if (parsed.help) return console.log(helpText());
    if (parsed.version) return console.log(require('./package.json').version);
    if (parsed.error) {
        console.error(`${parsed.error}\nOptions: --help`);
        process.exit(2);
    }
    startServer(parsed.options).then((server) => {
        let address = parsed.options.host || "127.0.0.1";
        if (address == "0.0.0.0" || address == "::") address = "127.0.0.1";
        console.log("Teleplot server started");
        let url = `http://${address.includes(":") ? `[${address}]` : address}:${server.port}`;
        if (server.www) console.log(`Open your browser at ${url}`);
        for (let entry of server.served) console.log(`Serving ${entry.folder} at ${url}${entry.url}`);
        console.log(`Send telemetry with a "key:value" UDP packet to 127.0.0.1:${server.udpPort}`);
        console.log(`Example:`);
        console.log(`\t BASH: echo "myData:1234" | nc -u -w0 127.0.0.1 ${server.udpPort}`);
    }, (error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = { startServer, parseArguments, parseServed, isOriginAllowed, helpText, DEFAULTS };
if (require.main === module) main();
