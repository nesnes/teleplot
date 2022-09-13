var ConnectionCount = 0; // counts the number of Connections instanciated, it is useful for Connections ids
class Connection{
    constructor(){
        if (this.constructor === Connection)
        {
            throw new Error("Connection is an abstract class, it should only be inherited and never instanciated !");
        }
        this.name = "";
        this.id = "connection-"+ConnectionCount++;
        this.type = "";
        this.connected = false;
        this.inputs = [];
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
