/*Telemetries can be of two types: 
 

- "number"
    in this case, data, pendingData, values and xy are used and textFormatValue is undefined

- "text"
    currently fixing bug when creating tow charts from same telem (3d)
    in this case, data, pendingData, values and xy are not used and textFormatValue is used
  
 */


class Telemetry{
    constructor(_name, isTimeBased, unit = undefined, type = "number"){
        this.type = type; // either "number", "text" or "3D"
        this.name = _name;
        this.unit = ( unit != "" ) ? unit : undefined;
        this.usageCount = 0;

        
        // contains either one (if !xy) or two values (if xy).
        this.values = [];

        this.xy = !isTimeBased && this.type == "number";
        this.data = [[],[]]; // data[0] contains the timestamps and data[1] contains the values corresponding to each timestamp
        this.pendingData = [[],[]];
        
        if(!isTimeBased){
            this.data.push([]);
            this.pendingData.push([]);
        }

    }

    getValuesFormatted() {

        if (this.type == "number" && this.values[0] != undefined)
        {
            let res = this.values[0].toFixed(4);
        
            if (this.xy && this.values.length == 2)
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