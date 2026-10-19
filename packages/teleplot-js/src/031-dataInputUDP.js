class DataInputUDP extends DataInput{
    constructor(_connection, _name) {
        super(_connection, _name);
        this.type = "UDP";
        this.address = "";
        this.port = 47269;
    }

    connect(){}
    disconnect(){}

    // sender: which device sent it (the index the Teleplot server gives), undefined when not known
    onMessage(msg, sender=undefined){
        if (msg instanceof ArrayBuffer) {
            this.connection.receive(() => TELEPLOT.parseDataBinary(msg), msg.byteLength, sender);
        }
        else if("data" in msg) {
            msg.input = this;
            // The server sends the text of the packets it received (several at once): their size is the size of that text
            this.connection.receive(() => TELEPLOT.parseDataText(msg), Connection.byteLength(String(msg.data)), sender);
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