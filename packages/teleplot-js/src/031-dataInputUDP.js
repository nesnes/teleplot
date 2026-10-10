class DataInputUDP extends DataInput{
    constructor(_connection, _name) {
        super(_connection, _name);
        this.type = "UDP";
        this.address = "";
        this.port = 47269;
    }

    connect(){}
    disconnect(){}

    onMessage(msg){
        if (msg instanceof ArrayBuffer) {
            this.connection.receive(() => TELEPLOT.parseDataBinary(msg), msg.byteLength);
        }
        else if("data" in msg) {
            msg.input = this;
            // The server sends the text of the packets it received (several at once): their size is the size of that text
            this.connection.receive(() => TELEPLOT.parseDataText(msg), Connection.byteLength(String(msg.data)));
        }
        else if("cmd" in msg) {
            //nope
        }
    }

    sendCommand(command){
        this.connection.sendServerCommand({ id: this.id, cmd: command});
    }

    updateCMDList(){
        this.sendCommand("|_telecmd_list_cmd|");
    }
}