/*
 * Serial ports opened by the browser itself (Web Serial API: Chrome, Edge and Opera on a computer). No server is involved.
 * - The user chooses the port in the browser's own dialog (requestSerialPort: it has to be called from a click); ports that were
 *   allowed before can be opened again without asking (getGrantedSerialPorts).
 * - What the port sends is read line by line. Like in Teleplot V1, a line starting with ">" is telemetry (">name:value", the text
 *   protocol after the ">"), any other line is a log line of the port.
 * - Every line received or sent is also kept as it is in a console (the last maxConsoleLines lines), for applications to display.
 * - A device unplugged and plugged again is a new SerialPort for the browser: the old one can never be opened again ("gone"). A port
 *   with the same USB ids that appears (navigator.serial "connect") or is chosen again is given to the connection that lost its own
 *   (adopt), so the connection, its console and the telemetries it sent stay the same. See doc/sources.md "Lost port".
 */
class ConnectionSerial extends Connection {
    constructor(port, baudRate=115200) {
        super();
        this.type = "serial";
        this.port = TELEPLOT.Vue.markRaw(port); // (a browser object: not something to wrap in reactivity)
        this.baudRate = baudRate;
        this.name = ConnectionSerial.portName(port);
        this.error = "";  // Why it is not connected, when it should be
        this.closed = true; // Closed by the application (disconnect): false while it should be open, even when the device is lost
        this.gone = false;  // Its SerialPort can never be opened again (the device was unplugged): it waits for a replacement
        // What the text parser needs to know about where a line comes from: serial lines follow the ">" rule, and logs are named after the port
        this.input = TELEPLOT.Vue.markRaw({ type: "serial", port: this.name, connection: this });
        this.inputs = [];
        // Raw (not reactive): lines can come fast. "revision" changes whenever the lines do.
        //   lines: [{t (ms), text, sent, telemetry (starts with ">"), problem (telemetry that could not be understood)}]
        this.console = TELEPLOT.Vue.markRaw({ lines: [], revision: 0 });
        this.maxConsoleLines = 2000;
        this.reader = undefined;
        this.reading = undefined; // Promise of the read loop
        this.opening = undefined; // Promise of connect() while it runs
        this.retry = undefined;   // Timer of the next try to open a port that just appeared
    }

    static isSupported() {
        return typeof navigator !== "undefined" && !!navigator.serial;
    }

    // A name for a port. Browsers only tell the USB ids of a port, not its name: a few common chips are recognised.
    // Do two ports have the same USB ids (the same kind of device, most likely the same one plugged again) ?
    static sameDevice(a, b) {
        let ia = (a && typeof a.getInfo === "function") ? a.getInfo() : {}, ib = (b && typeof b.getInfo === "function") ? b.getInfo() : {};
        return ia.usbVendorId !== undefined && ia.usbVendorId === ib.usbVendorId && ia.usbProductId === ib.usbProductId;
    }

    static portName(port) {
        let info = (port && typeof port.getInfo === "function") ? port.getInfo() : {};
        if(info.usbVendorId === undefined) return "Serial port";
        let hex = (n) => (n || 0).toString(16).padStart(4, "0");
        let chips = { 0x10c4: "CP210x", 0x1a86: "CH340", 0x0403: "FTDI", 0x067b: "PL2303", 0x2341: "Arduino", 0x2a03: "Arduino", 0x303a: "Espressif", 0x2e8a: "Raspberry Pi", 0x239a: "Adafruit", 0x0483: "STM32", 0x16c0: "Teensy", 0x1366: "J-Link" };
        return (chips[info.usbVendorId] || "USB serial") + " " + hex(info.usbVendorId) + ":" + hex(info.usbProductId);
    }

    __log(text, properties) {
        let lines = this.console.lines;
        lines.push(Object.assign({ t: Date.now(), text, sent: false, telemetry: false, problem: false }, properties));
        if(lines.length > this.maxConsoleLines) lines.splice(0, lines.length - this.maxConsoleLines);
        this.console.revision++;
        return lines[lines.length - 1];
    }

    clearConsole() {
        this.console.lines.length = 0;
        this.console.revision++;
    }

    // A line came from the port
    __onLine(text) {
        let line = this.__log(text, { telemetry: text.startsWith(">") });
        let problems = this.receive(() => TELEPLOT.parseDataText({ data: text, fromSerial: true, timestamp: line.t, input: this.input }));
        if(problems > 0 && line.telemetry) line.problem = true;
    }

    // Opens the port and reads it until disconnect() or until it is lost. Resolves once the port is open (false when it could not be).
    connect() {
        if(this.connected) return Promise.resolve(true);
        if(!this.opening) this.opening = this.__open().finally(() => { this.opening = undefined; });
        return this.opening;
    }

    async __open() {
        this.error = "";
        this.closed = false;
        if(this.reading) await this.reading; // The read loop of a port that was lost closes it: wait, it would be "already open"
        if(this.closed) return false;        // (disconnected meanwhile)
        let port = this.port;
        try { await port.open({ baudRate: Number(this.baudRate) || 115200 }); }
        catch(e) {
            if(e && (e.name === "NetworkError" || e.name === "NotFoundError")) this.gone = true;
            this.error = ConnectionSerial.explain(e);
            return false;
        }
        if(this.closed || port !== this.port) { try { await port.close(); } catch(e) { /* already gone */ } return false; }
        this.gone = false;
        this.connected = true;
        this.reading = this.__read();
        return true;
    }

    // Takes a new SerialPort for this connection (the same device plugged again). Opened when the connection should be open.
    adopt(port) {
        if(port === this.port) return;
        if(this.retry !== undefined) { clearTimeout(this.retry); this.retry = undefined; }
        this.port = TELEPLOT.Vue.markRaw(port);
        this.gone = false;
        this.name = ConnectionSerial.portName(port);
        this.input.port = this.name;
    }

    // What the Reconnect button does (from a click): opens the port, or a port with the same USB ids the user already allowed, or
    // asks the browser's dialog for one when the port is gone (filtered on its ids). Resolves to true once open.
    async reconnect() {
        if(this.connected) return true;
        if(!this.gone && await this.connect()) return true;
        if(!this.gone || !ConnectionSerial.isSupported()) return false;
        let port = (await navigator.serial.getPorts()).find((p) => ConnectionSerial.sameDevice(p, this.port) && !_serial_connectionOf(p));
        if(port === undefined) {
            let info = this.port.getInfo ? this.port.getInfo() : {};
            let filters = info.usbVendorId !== undefined ? [{ usbVendorId: info.usbVendorId, usbProductId: info.usbProductId }] : [];
            try { port = await navigator.serial.requestPort({ filters }); }
            catch(e) {
                if(e && e.name === "NotFoundError") return false; // The dialog was closed without a choice
                this.error = ConnectionSerial.explain(e);
                return false;
            }
            let other = _serial_connectionOf(port);
            if(other && other.id !== this.id) { this.error = "This port is read by another source: " + other.name; return false; }
        }
        this.adopt(port);
        return this.connect();
    }

    // A port that just appeared may need a moment before it opens: tries a few times
    __openSoon(tries=5) {
        this.retry = undefined;
        this.connect().then((ok) => {
            if(ok || this.closed || this.connected || tries <= 1) return;
            this.retry = setTimeout(() => this.__openSoon(tries - 1), 500);
        });
    }

    async __read() {
        let decoder = new TextDecoder();
        let pending = "";
        try {
            while(!this.closed && this.port.readable) { // A read error (overrun, framing...) ends a reader, not the port: read again
                this.reader = this.port.readable.getReader();
                try {
                    while(true) {
                        let { value, done } = await this.reader.read();
                        if(done) break;
                        this.stats.bytes += value.byteLength; // Counted as they come, whole lines or not
                        pending += decoder.decode(value, { stream: true });
                        let lines = pending.split("\n");
                        pending = lines.pop(); // The last piece is a line that is not finished yet
                        for(let line of lines) this.__onLine(line.endsWith("\r") ? line.slice(0, -1) : line);
                    }
                }
                finally { this.reader.releaseLock(); this.reader = undefined; }
                if(this.closed) break;
            }
        }
        catch(e) {
            if(!this.closed) {
                this.error = ConnectionSerial.explain(e); // Unplugged, most of the time
                if(e && e.name === "NetworkError") this.gone = true;
            }
        }
        if(pending.length && !this.closed) this.__onLine(pending);
        this.connected = false;
        if(!this.closed) { try { await this.port.close(); } catch(e) { /* already gone */ } }
        this.reading = undefined;
    }

    // Closes the port. It can be opened again with connect().
    async disconnect() {
        if(this.retry !== undefined) { clearTimeout(this.retry); this.retry = undefined; }
        if(this.closed) return;
        this.closed = true;
        try {
            if(this.reader) await this.reader.cancel();
            if(this.reading) await this.reading;
            await this.port.close();
        }
        catch(e) { /* closing a port that is already gone */ }
        this.connected = false;
    }

    // Changes the speed: the port has to be opened again
    async setBaudRate(baudRate) {
        this.baudRate = Number(baudRate) || this.baudRate;
        if(!this.connected) return true;
        await this.disconnect();
        return this.connect();
    }

    // Sends text followed by a line ending ("\n", "\r\n", "\r" or ""). Resolves to false when it could not be sent.
    async send(text, lineEnding="\n") {
        if(!this.connected || !this.port.writable) return false;
        let writer = this.port.writable.getWriter();
        try { await writer.write(new TextEncoder().encode(String(text) + lineEnding)); }
        catch(e) { this.error = ConnectionSerial.explain(e); return false; }
        finally { writer.releaseLock(); }
        this.__log(String(text), { sent: true });
        return true;
    }

    whyNotWritable() {
        if(!this.connected) return "The port is not open";
        if(!this.port.writable) return "The port cannot be written";
        return "";
    }

    // A command (doc/telecmd.md) is a line written to the port (devices on a serial port speak the text protocol)
    write(message) {
        if(!this.canWrite() || message.text === undefined) return false;
        this.send(message.text);
        return true;
    }

    static explain(error) {
        let name = error && error.name;
        if(name === "NetworkError") return "The device was lost (unplugged ?)";
        if(name === "InvalidStateError") return "The port is already open";
        return (error && error.message) || "The port could not be opened";
    }
}

TELEPLOT.connection.ConnectionSerial = ConnectionSerial;

// Can this browser open serial ports ?
TELEPLOT.connection.serialSupported = function() {
    return ConnectionSerial.isSupported();
}

function _serial_connectionOf(port) {
    return TELEPLOT.connection.connections.find((c) => c.type === "serial" && c.port === port);
}

// A connection whose port is gone and that a new port with the same USB ids replaces (the device plugged again)
function _serial_waitingFor(port) {
    return TELEPLOT.connection.connections.find((c) => c.type === "serial" && c.gone && !c.connected && ConnectionSerial.sameDevice(c.port, port));
}

// Follows the ports the browser sees come and go (only ports the user allowed are told): a device plugged again is read again by its
// connection, without a click. Set up once, when the page first uses a serial port.
let _serial_watched = undefined;
function _serial_watch() {
    if(!ConnectionSerial.isSupported() || _serial_watched === navigator.serial || typeof navigator.serial.addEventListener !== "function") return;
    _serial_watched = navigator.serial;
    navigator.serial.addEventListener("connect", (event) => TELEPLOT.connection.serialPortAppeared(event.target));
    navigator.serial.addEventListener("disconnect", (event) => {
        let conn = _serial_connectionOf(event.target);
        if(conn) conn.gone = true;
    });
}

// A port appeared (navigator.serial "connect"): the connection that lost it or its twin opens it, unless it was closed on purpose.
// Returns that connection (undefined: none was waiting for it).
TELEPLOT.connection.serialPortAppeared = function(port) {
    let conn = _serial_connectionOf(port) || _serial_waitingFor(port);
    if(conn === undefined || conn.closed || conn.connected) return undefined;
    conn.adopt(port);
    conn.__openSoon();
    return conn;
}

// Reads a serial port (a SerialPort of the Web Serial API). A port that already has a connection gets it back, opened again if needed;
// so does a port that replaces the gone port of a connection (the same device plugged again: same USB ids).
// Returns the connection; its "connected" and "error" tell how opening went (it is asynchronous).
TELEPLOT.connection.addConnectionSerial = function(port, baudRate=115200) {
    _serial_watch();
    let conn = _serial_connectionOf(port);
    if(conn === undefined && (conn = _serial_waitingFor(port)) !== undefined) conn.adopt(port);
    if(conn === undefined) {
        conn = new ConnectionSerial(port, baudRate);
        TELEPLOT.connection.connections.push(conn);
        conn = TELEPLOT.connection.connections[TELEPLOT.connection.connections.length - 1]; // (as the list holds it: reactive when the application made it so)
    }
    else conn.baudRate = baudRate;
    conn.connect();
    return conn;
}

// Lets the user choose a port in the browser's dialog, and reads it. Must be called from a user action (a click).
// Resolves to the connection, or to undefined when the user chose nothing.
TELEPLOT.connection.requestSerialPort = async function(baudRate=115200) {
    if(!ConnectionSerial.isSupported()) throw new Error("This browser cannot open serial ports (Web Serial is needed: Chrome, Edge or Opera on a computer)");
    let port;
    try { port = await navigator.serial.requestPort(); }
    catch(e) {
        if(e && e.name === "NotFoundError") return undefined; // The dialog was closed without a choice
        throw e;
    }
    return TELEPLOT.connection.addConnectionSerial(port, baudRate);
}

// Ports the user already allowed for this page and that are not read yet: [{port, name}]. They can be given to addConnectionSerial without a dialog.
TELEPLOT.connection.getGrantedSerialPorts = async function() {
    if(!ConnectionSerial.isSupported()) return [];
    _serial_watch();
    let ports = await navigator.serial.getPorts();
    return ports.filter((port) => !TELEPLOT.connection.connections.some((c) => c.type === "serial" && c.port === port))
                .map((port) => ({ port, name: ConnectionSerial.portName(port) }));
}
