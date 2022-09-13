var DataInputCount = 0;
class DataInput{
    constructor(_connection, _name){
        if (this.constructor === DataInput)
        {
            throw new Error("DataInput is an abstract class, it should only be inherited and never instanciated !");
        }
        this.connection = _connection;
        this.name = _name;
        this.id = "data-input-"+DataInputCount++;
        this.type = "";
        this.connected = false;
    }
}