class ConnectionTeleplotVSCode extends Connection{
    constructor() {
        super();
        this.name="localhost-VSCode"
        this.type = "teleplot-vscode";
        this.vscode = vscode;
        this.udp = new DataInputUDP(this, "UDP");
        this.udp.address = "localhost";
        this.udp.port = UDPport;
        this.inputs.push(this.udp);
        
        this.supportSerial = true;
        let serialIn = new DataInputSerial(this, "Serial");
        this.inputs.push(serialIn);
    }

    connect() {
        if(!this.vscode) return false;
        window.addEventListener('message', message => {
            let msg = message.data;
            if("id" in msg){
                for(let input of this.inputs){
                    if(input.id == msg.id){
                        input.onMessage(msg);
                        break;
                    }
                }
            }
            else{
                if("data" in msg) {
                    parseData(msg); //update server so it keeps track of connection IDs when forwarding data
                }
                else if("cmd" in msg) {
                    //nope
                }
            }
        });
        this.vscode.postMessage({ cmd: "listSerialPorts"});
        //Report UDP input as connected
        this.udp.connected = true;
        this.connected = true;
        return true;
    }

    disconnect() {
        for(let input of this.inputs){
            input.disconnect();
        }
        this.connected = false;
    }

    sendServerCommand(command) {
        this.vscode.postMessage(command);
    }

    sendCommand(command) {
        for(let input of this.inputs){
            input.sendCommand(command);
        }
    }

    updateCMDList() {
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