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
    }

    connect(){
        let baud = parseInt(this.baudrate);
        this.connection.sendServerCommand({ id: this.id, cmd: "connectSerialPort", port: this.port, baud: baud})
    }

    disconnect(){
        this.connection.sendServerCommand({ id: this.id, cmd: "disconnectSerialPort"})
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

    listPorts(){
        this.connection.sendServerCommand({ id: this.id, cmd: "listSerialPorts"});
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
        this.connection.sendServerCommand({ id: this.id, cmd: "sendToSerial", text: text+escape});
    }
}