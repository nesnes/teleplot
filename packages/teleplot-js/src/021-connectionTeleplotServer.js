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
    }

    connect(_address, _port){
        this.name = _address+":"+_port;
        this.address = _address;
        this.port = _port;
        this.udp.address = this.address;
        this.closed = false;
        this.nextRetryAt = 0;
        clearTimeout(this.retryTimer);
        if(this.socket) { this.socket.onclose = null; this.socket.close(); } // A try that is replaced must not plan another one
        this.socket = new WebSocket("ws://"+this.address+":"+this.port, );
        this.socket.binaryType = "arraybuffer"; // Default is Blob, whose async decoding doesn't guarantee the packets order
        this.socket.onopen = (event) => {
            setTimeout(()=>{
                this.udp.connected = true;
                this.connected = true;
                this.everConnected = true;
                this.sendServerCommand({ cmd: "listSerialPorts"});
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
            // Binary message from client (through server)
            if (msgWS.data instanceof ArrayBuffer) {
                this.udp.onMessage(msgWS.data);
                return;
            }
            // Text message reformated to json by teleplot server
            let msg = JSON.parse(msgWS.data);
            if("id" in msg){
                for(let input of this.inputs){
                    if(input.id == msg.id){
                        input.onMessage(msg);
                        break;
                    }
                }
            }
            else{
                this.udp.onMessage(msg);
            }
        };
        return true;
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