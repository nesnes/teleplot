class ConnectionTeleplotServer extends Connection{
    constructor(){
        super();
        this.name=""
        this.type = "teleplot-server";
        this.inputs = [];
        this.socket = null;
        this.address = "";
        this.port = "";
        this.udp = new DataInputUDP(this, "UDP");
        this.inputs.push(this.udp);
        this.closed = false;        // Closed on purpose (disconnect): no more tries
        this.everConnected = false; // To tell "lost" from "never reached"
        this.nextRetryAt = 0;       // When the next try will happen (ms, Date.now()), 0 when none is planned
        this.retryTimer = undefined;
        this.clockOffset = undefined; // What to add to a time of the server to get a date here (ms), see __serverClockOffset
        this.clockCheckedAt = 0;
        // Commands (doc/telecmd.md): the server tells who sent each packet (a sender index), writes go back to that sender
        this.senders = {};        // sender index -> its address ("192.168.1.12:50123"), for display
        this.writes = false;      // The server said hello: it can send commands back (a V1 server cannot)
        this.readOnly = false;    // It was started with --read-only
        this.__binarySenders = []; // Senders of the packets of the binary messages to come, as the text messages announced them
    }

    connect(_address, _port){
        this.name = _address+":"+_port;
        this.address = _address;
        this.port = _port;
        this.udp.address = this.address;
        this.closed = false;
        this.nextRetryAt = 0;
        this.clockOffset = undefined; // (a server that restarted counts its time from zero again)
        this.writes = false;
        this.__binarySenders = [];
        clearTimeout(this.retryTimer);
        if(this.socket) { this.socket.onclose = null; this.socket.close(); } // A try that is replaced must not plan another one
        this.socket = new WebSocket("ws://"+this.address+":"+this.port, );
        this.socket.binaryType = "arraybuffer"; // Default is Blob, whose async decoding doesn't guarantee the packets order
        this.socket.onopen = (event) => {
            setTimeout(()=>{
                this.udp.connected = true;
                this.connected = true;
                this.everConnected = true;
            }, 30)
        };
        this.socket.onclose = (event) => {
            this.udp.connected = false;
            this.connected = false;
            for(let input of this.inputs){
                input.disconnect();
            }
            if(this.closed) return;
            this.nextRetryAt = Date.now() + 2000;
            this.retryTimer = setTimeout(()=>{
                this.connect(this.address, this.port);
            }, 2000);
        };
        this.socket.onmessage = (msgWS) => {
            // Binary message from client (through server): one packet, or several framed like a binary data file
            if (msgWS.data instanceof ArrayBuffer) {
                this.__receiveBinary(msgWS.data);
                return;
            }
            // Text message reformated to json by teleplot server
            let msg = JSON.parse(msgWS.data);
            if(msg.hello) {
                this.writes = true;
                this.readOnly = msg.hello.readOnly === true;
                this.senders = Object.assign({}, msg.hello.senders);
                return;
            }
            if(msg.senders) Object.assign(this.senders, msg.senders);
            if(Array.isArray(msg.binary)) this.__binarySenders.push(...msg.binary);
            if(Array.isArray(msg.packets)) {
                this.__receivePackets(msg);
            }
            else if("id" in msg){
                for(let input of this.inputs){
                    if(input.id == msg.id){
                        input.onMessage(msg);
                        break;
                    }
                }
            }
            else{
                // Teleplot V1 server: one text for all the packets of a batch, dated on the clock of the server, which may not be
                // the one of this machine. The time of reception is used.
                delete msg.timestamp;
                this.udp.onMessage(msg);
            }
        };
        return true;
    }

    // Text packets from the server: { time, packets: [[time, text, sender]...], dropped }. Each packet comes with the time the server
    // received it and the message with the time it was sent, both on the clock of the server: a sample without a timestamp is
    // dated when the server received it, not when the batch reached the page. "sender": who sent it (an index, see write).
    __receivePackets(msg, now=Date.now()) {
        if(msg.dropped > 0) this.stats.dropped += msg.dropped;
        if(typeof msg.time != "number") return;
        let offset = this.__serverClockOffset(msg.time, now);
        for(let packet of msg.packets) {
            this.udp.onMessage({ data: packet[1], timestamp: packet[0] + offset }, packet[2]);
        }
    }

    // What to add to a time of the server (ms on a clock that only counts) to get a date on this machine (Connection.lowestOffset;
    // 5 s above: the computer slept)
    __serverClockOffset(serverTime, now) {
        let clock = { offset: this.clockOffset, checkedAt: this.clockCheckedAt };
        this.clockOffset = Connection.lowestOffset(clock, serverTime, now, 5000);
        this.clockCheckedAt = now;
        return this.clockOffset;
    }

    __receiveBinary(buffer) {
        let magic = TELEPLOT.protocol.FILE_MAGIC;
        let bytes = new Uint8Array(buffer);
        let framed = bytes.length >= magic.length;
        for(let i = 0; framed && i < 5; i++) framed = bytes[i] === magic[i]; // "TPLT" and the line feed, as files (160-files.js)
        if(!framed) return this.udp.onMessage(buffer, this.__binarySenders.shift());
        let view = new DataView(buffer);
        let at = magic.length;
        while(at < buffer.byteLength) {
            let length = at + 4 <= buffer.byteLength ? view.getUint32(at, true) : Infinity;
            at += 4;
            if(at + length > buffer.byteLength) { this.receive(() => false); break; } // cut short: counted as a problem
            this.udp.onMessage(buffer.slice(at, at + length), this.__binarySenders.shift()); // (a copy: what a packet stores must not keep the whole batch alive)
            at += length;
        }
    }

    // Closes for good: no automatic try after this (connect() or retry() start again)
    disconnect(){
        this.closed = true;
        this.nextRetryAt = 0;
        clearTimeout(this.retryTimer);
        if(this.socket){
            this.socket.close();
            this.socket = null;
        }
        this.connected = false;
        this.udp.connected = false;
    }

    // Try again now, without waiting for the next automatic try
    retry(){
        if(!this.connected) this.connect(this.address, this.port);
    }

    sendServerCommand(command){
        if(this.socket) this.socket.send(JSON.stringify(command));
    }

    whyNotWritable() {
        if(!this.connected) return "Not connected to the server";
        if(!this.writes) return "This server cannot send commands back: it is older than the commands";
        if(this.readOnly) return "The server is read-only (started with --read-only)";
        return "";
    }

    // A command goes back to the device that sent the telemetry (its sender index), through the server
    write(message) {
        if(!this.canWrite() || !this.socket) return false;
        let to = message.telemetry ? message.telemetry.endpoint : undefined;
        if(to === undefined) return false; // (a telemetry the server did not say the sender of)
        if(message.bytes) {
            let text = "";
            for(let byte of message.bytes) text += String.fromCharCode(byte);
            this.socket.send(JSON.stringify({ writeBinary: btoa(text), to }));
        }
        else this.socket.send(JSON.stringify({ write: message.text, to }));
        return true;
    }

    updateCMDList(){
        for(let input of this.inputs){
            input.updateCMDList();
        }
    }

    createInput(type) {
        if(type=="serial") {
            let serialIn = new DataInputSerial(this, "Serial");
            this.inputs.push(serialIn);
        }
    }
}



TELEPLOT.connection.addConnectionTeleplotServer = function(address=window.location.hostname, port=window.location.port) {
    TELEPLOT.connection.connections.push(new ConnectionTeleplotServer());
    let conn = TELEPLOT.connection.connections[TELEPLOT.connection.connections.length - 1]; // (as the list holds it: reactive when the application made it so)
    conn.connect(address,port);
    return conn;
}