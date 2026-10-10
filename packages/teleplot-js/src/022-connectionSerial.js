/*
 * Serial ports opened by the browser itself (Web Serial API: Chrome, Edge and Opera on a computer). No server is involved.
 * - The user chooses the port in the browser's own dialog (requestSerialPort: it has to be called from a click); ports that were
 *   allowed before can be opened again without asking (getGrantedSerialPorts).
 * - What the port sends is read line by line. Like in Teleplot V1, a line starting with ">" is telemetry (">name:value", the text
 *   protocol after the ">"), any other line is a log line of the port.
 * - Every line received or sent is also kept as it is in a console (the last maxConsoleLines lines), for applications to display.
 */
class ConnectionSerial extends Connection {
    constructor(port, baudRate=115200) {
        super();
        this.type = "serial";
        this.port = TELEPLOT.Vue.markRaw(port); // (a browser object: not something to wrap in reactivity)
        this.baudRate = baudRate;
        this.name = ConnectionSerial.portName(port);
        this.error = "";  // Why it is not connected, when it should be
        this.closed = true;
        // What the text parser needs to know about where a line comes from: serial lines follow the ">" rule, and logs are named after the port
        this.input = TELEPLOT.Vue.markRaw({ type: "serial", port: this.name, connection: this });
        this.inputs = [];
        // Raw (not reactive): lines can come fast. "revision" changes whenever the lines do.
        //   lines: [{t (ms), text, sent, telemetry (starts with ">"), problem (telemetry that could not be understood)}]
        this.console = TELEPLOT.Vue.markRaw({ lines: [], revision: 0 });
        this.maxConsoleLines = 2000;
        this.reader = undefined;
        this.reading = undefined; // Promise of the read loop
    }

    static isSupported() {
        return typeof navigator !== "undefined" && !!navigator.serial;
    }

    // A name for a port. Browsers only tell the USB ids of a port, not its name: a few common chips are recognised.
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
    async connect() {
        if(this.connected) return true;
        this.error = "";
        this.closed = false;
        try { await this.port.open({ baudRate: Number(this.baudRate) || 115200 }); }
        catch(e) {
            this.error = ConnectionSerial.explain(e);
            return false;
        }
        this.connected = true;
        this.reading = this.__read();
        return true;
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
            if(!this.closed) this.error = ConnectionSerial.explain(e); // Unplugged, most of the time
        }
        if(pending.length && !this.closed) this.__onLine(pending);
        this.connected = false;
        if(!this.closed) { try { await this.port.close(); } catch(e) { /* already gone */ } }
    }

    // Closes the port. It can be opened again with connect().
    async disconnect() {
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

// Reads a serial port (a SerialPort of the Web Serial API). A port that already has a connection gets it back, opened again if needed.
// Returns the connection; its "connected" and "error" tell how opening went (it is asynchronous).
TELEPLOT.connection.addConnectionSerial = function(port, baudRate=115200) {
    let conn = TELEPLOT.connection.connections.find((c) => c.type === "serial" && c.port === port);
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
    let ports = await navigator.serial.getPorts();
    return ports.filter((port) => !TELEPLOT.connection.connections.some((c) => c.type === "serial" && c.port === port))
                .map((port) => ({ port, name: ConnectionSerial.portName(port) }));
}
