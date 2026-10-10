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
            bytes: 0,       // Bytes of data received by the page: the content of packets and lines, without network or serial framing
            lastMessage: 0  // When the last one came (ms, Date.now())
        });
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
    receive(fn, bytes=0) {
        this.stats.bytes += bytes;
        this.stats.messages++;
        this.stats.lastMessage = Date.now();
        let result = TELEPLOT.datastore.withSource(this.id, fn);
        let problems = result === false ? 1 : (typeof result === "number" ? result : 0);
        this.stats.problems += problems;
        return problems;
    }

    disconnect(){

    }

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
    connections: []
};

// Closes a connection and forgets it. The telemetries it sent stay.
TELEPLOT.connection.removeConnection = function(connection) {
    let index = TELEPLOT.connection.connections.findIndex((c) => c.id === connection.id);
    if(index < 0) return false;
    TELEPLOT.connection.connections[index].disconnect();
    TELEPLOT.connection.connections.splice(index, 1);
    return true;
}