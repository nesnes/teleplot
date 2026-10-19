/*
 * A source that lives in the page: a simulation, a demo, a test. What it sends goes through the parsers like the data of a device,
 * and what the page writes to its telemetries (commands, doc/telecmd.md) is handed to onWrite({telemetry, text, bytes}).
 *   let robot = TELEPLOT.connection.addConnectionLocal("Robot sample", (message) => { ... });
 *   robot.sendText("speed:1.2");      robot.sendBinary(packet);
 */
class ConnectionLocal extends Connection {
    constructor(name, onWrite) {
        super();
        this.type = "local";
        this.name = name;
        this.onWrite = onWrite;
        this.connected = true;
    }

    // Data from the page's device, as a device would send it. Returns the number of lines that could not be understood.
    sendText(text, timestamp=Date.now()) {
        return this.receive(() => TELEPLOT.parseDataText({ data: text, timestamp }), Connection.byteLength(String(text)));
    }
    sendBinary(packet) {
        let bytes = packet instanceof ArrayBuffer ? packet.byteLength : packet.length;
        return this.receive(() => TELEPLOT.parseDataBinary(packet), bytes);
    }

    whyNotWritable() {
        if(!this.connected) return "Stopped";
        if(typeof this.onWrite !== "function") return "This source does not take commands";
        return "";
    }

    write(message) {
        if(!this.canWrite()) return false;
        this.onWrite(message);
        return true;
    }

    connect() { this.connected = true; return true; }
    disconnect() { this.connected = false; }
}

TELEPLOT.connection.ConnectionLocal = ConnectionLocal;

TELEPLOT.connection.addConnectionLocal = function(name="This page", onWrite=undefined) {
    TELEPLOT.connection.connections.push(new ConnectionLocal(name, onWrite));
    return TELEPLOT.connection.connections[TELEPLOT.connection.connections.length - 1]; // (as the list holds it: reactive when the application made it so)
}
