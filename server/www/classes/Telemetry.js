class Telemetry{
    constructor(_name, unit = undefined, type = "number"){
        this.type = type; // either "number", "text", "3D" or "xy"
        this.name = _name;
        this.unit = ( unit != "" ) ? unit : undefined;
        this.usageCount = 0;

        
        // contains either one (if !xy) or two values (if xy).
        this.values = [];

        this.data = [[],[]]; // data[0] contains the timestamps and data[1] contains the values corresponding to each timestamp
        this.pendingData = [[],[]];
        
        if(this.type == "xy"){
            this.data.push([]);
            this.pendingData.push([]);
        }

    }

    getValuesFormatted() {

        if ((this.type == "number" || this.type == "xy") && this.values[0] != undefined && typeof(this.values[0])=='number')
        {
            let res = this.values[0].toFixed(4);
        
            if (this.type=="xy" && this.values.length == 2)
                res += ("  " + this.values[1].toFixed(4));
    
            return res;
        }
        else if (this.type == "text")
        {
            return this.values[0];
        }
        else if (this.type == "3D")
        {
            if (this.data[1][this.data[1].length-1] == undefined)
                return "";
                
            let shapeType = this.data[1][this.data[1].length-1].shapeType; 
            return (shapeType == undefined ? "" : shapeType)
        }

        return "";
       
    }
}