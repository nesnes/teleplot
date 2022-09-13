class ConnectionTeleplotWebsocket extends Connection{
    constructor(){
        super();
        this.name=""
        this.type = "teleplot-websocket";
        this.inputs = [];
        this.socket = null;
        this.address = "";
        this.port = "";
        this.udp = new DataInputUDP(this, "UDP");
        this.udp.address = "";
        this.udp.port = UDPport;
        this.inputs.push(this.udp);
    }

    connect(_address, _port){
        this.name = _address+":"+_port;
        this.address = _address;
        this.port = _port;
        this.udp.address = this.address;
        this.socket = new WebSocket("ws://"+this.address+":"+this.port);
        this.socket.onopen = (event) => {
            this.udp.connected = true;
            this.connected = true;
            this.sendServerCommand({ cmd: "listSerialPorts"});
        };
        this.socket.onclose = (event) => {
            this.udp.connected = false;
            this.connected = false;
            for(let input of this.inputs){
                input.disconnect();
            }
            setTimeout(()=>{
                this.connect(this.address, this.port);
            }, 2000);
        };
        this.socket.onmessage = (msgWS) => {
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

    disconnect(){
        if(this.socket){
            this.socket.close();
            this.socket = null;
        }
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