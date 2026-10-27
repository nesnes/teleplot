/*
 * "Times since boot": a board has no date, only a clock that counts from its boot (micros()), so the times it writes read as the
 * start of 1970. A source with this option on (the default) has such times dated by the page, from when they arrive. One BootClock
 * per device: a serial port, a sender of the Teleplot server, a local connection. See doc/sources.md "Times since boot".
 * - A time below SINCE_BOOT_LIMIT (1e11 ms, March 1973) gets offset = the smallest "arrival - device time" seen (lowestOffset):
 *   samples that arrive late (out of order between telemetries, a burst after an outage) only give bigger differences.
 * - Reboot (never counted nor limited): a telemetry whose time goes back below its own previous time, or a time more than
 *   SINCE_BOOT_GAP before the latest time of the device. The offset is measured again from that sample.
 * - Several clocks: a time more than SINCE_BOOT_GAP ahead of what the clock of the device can have reached (its latest time + the
 *   page time elapsed since it arrived). Measured again too; the second time, the option turns itself off ("offReason").
 * - Times of 1973 or later are kept as sent, and so is everything while the option is off. Files are never shifted (no clock).
 */
const SINCE_BOOT_LIMIT = 1e11;
const SINCE_BOOT_GAP = 10000;
let _connection_bootClock = undefined; // The clock of the device whose message is being parsed (set by Connection.receive)

class BootClock {
    constructor() {
        this.enabled = true;
        this.offReason = "";       // Why it turned itself off ("" when it did not)
        this.jumps = 0;            // Times ahead of what the clock can have reached (2: off)
        this.offset = undefined;   // ms to add to a device time (Connection.lowestOffset)
        this.checkedAt = 0;
        this.latest = -Infinity;   // Latest device time seen (ms) and when it arrived (page ms)
        this.latestAt = 0;
        this.previous = new Map(); // Telemetry name -> its previous device time (ms) since the last (re)boot
        this.dates = new Map();    // Telemetry name -> {sent, date} of its previous sample (the parts of a sample get one date)
        this.dated = 0;            // Samples dated (shown by the Sources panel: it is in use)
    }

    // Turns the option on or off. On: measured again from what comes next.
    setEnabled(on) {
        this.enabled = !!on;
        this.offReason = "";
        this.jumps = 0;
        this.__restart();
    }

    __restart() {
        this.offset = undefined;
        this.latest = -Infinity;
        this.previous.clear();
        this.dates.clear();
    }

    // The date (ms) of a device time "sent" (ms) of telemetry "name" that arrived at "now" (page ms)
    date(sent, name, now) {
        if(!this.enabled || !(sent >= 0 && sent < SINCE_BOOT_LIMIT)) return sent;
        if(this.offset !== undefined) {
            let before = this.previous.get(name);
            if((before !== undefined && sent < before) || sent < this.latest - SINCE_BOOT_GAP) this.__restart(); // Rebooted
            else if(sent > this.latest + (now - this.latestAt) + SINCE_BOOT_GAP) { // Another clock
                if(++this.jumps >= 2) {
                    this.enabled = false;
                    this.offReason = "times jumped ahead twice, more than the time that passed: this source mixes several clocks. Its times are kept as sent.";
                    this.__restart();
                    return sent;
                }
                this.__restart();
            }
        }
        // The same time again for the same telemetry: another part of the same sample (a structure or a tick in several lines,
        // doc/graph.md). It gets the date the first part got, whatever the offset learnt in between: parts of one sample stay one.
        let last = this.dates.get(name);
        if(this.offset !== undefined && last !== undefined && last.sent === sent) { this.dated++; return last.date; }
        this.previous.set(name, sent);
        if(sent >= this.latest) { this.latest = sent; this.latestAt = now; }
        this.dated++;
        let date = sent + Connection.lowestOffset(this, sent, now);
        this.dates.set(name, { sent, date });
        return date;
    }
}

class Connection{
    constructor(){
        if (this.constructor === Connection)
        {
            throw new Error("Connection is an abstract class, it should only be inherited and never instanciated !");
        }
        this.name = "";
        this.id = "connection-"+crypto.randomUUID();
        this.type = "";
        this.connected = false;
        this.inputs = [];
        // What came through, for a "is my data arriving ?" display. Raw (not reactive): updated on every message.
        this.stats = TELEPLOT.Vue.markRaw({
            messages: 0,    // Messages received (packets, lines, batches of lines)
            problems: 0,    // Packets and lines that could not be read
            dropped: 0,     // Packets the source says it did not send: this page was too slow to receive them (Teleplot server)
            bytes: 0,       // Bytes of data received by the page: the content of packets and lines, without network or serial framing
            lastMessage: 0  // When the last one came (ms, Date.now())
        });
        // "Times since boot" (BootClock): one clock per device of the connection (endpoint), made when first needed. Raw.
        this.bootClocks = TELEPLOT.Vue.markRaw(new Map());
    }

    // The clock of a device of this connection (endpoint: as in receive), to read or change its "Times since boot" option
    bootClock(endpoint=undefined) {
        let clock = this.bootClocks.get(endpoint);
        if(clock === undefined) { clock = new BootClock(); this.bootClocks.set(endpoint, clock); }
        return clock;
    }

    // What to add to a time of another clock to get a date here (ms), from a time "sent" on that clock that arrived here at "now":
    // now - sent is the offset plus the time the message took. The smallest one seen (the fastest message) is kept: samples then stay
    // as far apart as they were sent, whatever each message took, and are never dated in the future. Two clocks drift apart: the
    // offset is let go up slowly (100 ppm, more than clocks drift), a fast message brings it back. resetAbove: a difference that far
    // above is not a slow message but a clock that stopped (a computer that slept): start again from it.
    // clock: {offset (undefined at first), checkedAt}, updated. Returns the offset.
    static lowestOffset(clock, sent, now, resetAbove=Infinity) {
        let measured = now - sent;
        if(clock.offset !== undefined) clock.offset += Math.max(0, now - clock.checkedAt) * 1e-4;
        if(clock.offset === undefined || measured < clock.offset || measured > clock.offset + resetAbove) clock.offset = measured;
        clock.checkedAt = now;
        return clock.offset;
    }

    // Number of bytes of a text once encoded (UTF-8), without building the bytes
    static byteLength(text) {
        let bytes = 0;
        for(let i = 0; i < text.length; i++) {
            let code = text.charCodeAt(i);
            if(code < 0x80) bytes += 1;
            else if(code < 0x800) bytes += 2;
            else if(code >= 0xd800 && code < 0xdc00) { bytes += 4; i++; } // a pair of code units: one character of 4 bytes
            else bytes += 3;
        }
        return bytes;
    }

    // A message of this connection is parsed by fn(): what it creates is attributed to the connection, and it is counted.
    // fn returns false or a number of problems when (part of) the message could not be read. bytes: its size, when it is known here.
    // endpoint: which device of the connection sent it, when the connection reaches several (see write).
    receive(fn, bytes=0, endpoint=undefined) {
        this.stats.bytes += bytes;
        this.stats.messages++;
        this.stats.lastMessage = Date.now();
        let previousClock = _connection_bootClock;
        _connection_bootClock = this.bootClock(endpoint);
        let result;
        try { result = TELEPLOT.datastore.withSource(this.id, fn, endpoint); }
        finally { _connection_bootClock = previousClock; }
        let problems = result === false ? 1 : (typeof result === "number" ? result : 0);
        this.stats.problems += problems;
        return problems;
    }

    disconnect(){

    }

    // Commands (doc/telecmd.md): can something be sent back to the devices of this connection now ? And why not ("" when it can).
    canWrite() { return this.whyNotWritable() === ""; }
    whyNotWritable() { return "This source cannot send anything back"; }

    // Sends a command to the device that sent a telemetry: {telemetry, text, bytes} (text: lines of the text protocol, bytes: a
    // packet of the binary protocol, as the device speaks). Returns true when it went out.
    write(message) { return false; }

    connect(){

    }

    removeInput(input){
        for(let i=0;i<this.inputs.length;i++){
            if(this.inputs[i] == input) {
                this.inputs[i].disconnect();
                this.inputs.splice(i,1);
                break;
            }
        }
    }
}

TELEPLOT.connection = {
    connections: [],
    BootClock
};

// Closes a connection and forgets it. The telemetries it sent stay.
TELEPLOT.connection.removeConnection = function(connection) {
    let index = TELEPLOT.connection.connections.findIndex((c) => c.id === connection.id);
    if(index < 0) return false;
    TELEPLOT.connection.connections[index].disconnect();
    TELEPLOT.connection.connections.splice(index, 1);
    return true;
}