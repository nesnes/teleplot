class DataInputSerial extends DataInput{
    constructor(_connection, _name) {
        super(_connection, _name);
        this.port = null;
        this.baudrate = 115200;
        this.type = "serial";
        this.portList = [];
        this.listPorts();
        this.textToSend = "";
        this.endlineToSend = "";
        this.useWebserial = true;
        this.webserialSupported = "serial" in navigator;
        this.webserial = null;
        this.webserialReader = null;
    }

    connect(){
        let baud = parseInt(this.baudrate);
        if(this.useWebserial) {
            if(this.webserial){
                this.webserial.open({ baudRate: this.baudrate }).then(()=>{
                    this.connected = true;
                    this.readLoop().then(()=>{
                        this.connected = false;
                        this.webserial.close();
                    });
                }).catch((e)=>{console.log(e)});
            }
            else{
                listPorts(true)
            }
        }
        else {
            this.connection.sendServerCommand({ id: this.id, cmd: "connectSerialPort", port: this.port, baud: baud})
        }
    }

    disconnect(){
        if(this.useWebserial) {
            if(this.webserial && this.connected && this.webserialReader) {
                this.connected = false;
                this.webserialReader.cancel();
            }
        }
        else {
            this.connection.sendServerCommand({ id: this.id, cmd: "disconnectSerialPort"})
        }
    }

    async readLoop(){
        let buffer = "";
        while (this.webserial.readable && this.connected) {
            this.webserialReader = this.webserial.readable.getReader();
            try {
                while (this.connected) {
                  const { value, done } = await this.webserialReader.read();
                  if (done) { break; }
                  for(let char of value){
                    let c = String.fromCharCode(char);
                    if(c=='\n') {
                        parseData({
                            input: this,
                            data: buffer,
                            timestamp: new Date().getTime()
                        })
                        buffer = "";
                    }
                    else { buffer += c; }
                  }
                }
            } catch (error) {
                console.log(error)
            } finally {
                this.webserialReader.releaseLock();
            }
        }
    }

    onMessage(msg){
        if("data" in msg) {
            msg.input = this;
            parseData(msg);
        }
        else if("cmd" in msg) {
            if(msg.cmd == "serialPortList"){
                this.portList.length = 0;
                for(let serial of msg.list){
                    if( serial.locationId
                     || serial.serialNumber
                     || serial.pnpId
                     || serial.vendorId
                     || serial.productId ){
                        this.portList.push(serial);
                    }
                }
            }
            else if(msg.cmd == "serialPortConnect"){
                this.connected = true;
            }
            else if(msg.cmd == "serialPortDisconnect"){
                this.connected = false;
            }
        }
    }

    listPorts(connect=false){
        if(this.useWebserial) {
            navigator.serial.requestPort().then((port)=>{
                if(connect) this.connect();
                this.webserial = port;
            })
            .catch(()=>{});
        }
        else {
            this.connection.sendServerCommand({ id: this.id, cmd: "listSerialPorts"});
        }
    }

    sendCommand(){
        //nope
    }

    updateCMDList(){
        //nope
    }

    sendText(text, lineEndings) {
        let escape = lineEndings.replace("\\n","\n");
        escape = escape.replace("\\r","\r");
        if(this.useWebserial) {
            if(this.webserial && this.connected){
                const encoder = new TextEncoder();
                const writer = this.webserial.writable.getWriter();
                writer.write(encoder.encode(text+escape)).then(()=>{writer.releaseLock();});
                writer.releaseLock();
            }
        }
        else {
            this.connection.sendServerCommand({ id: this.id, cmd: "sendToSerial", text: text+escape});
        }
    }
}