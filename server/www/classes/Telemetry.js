/*Telemetries can be of two types: 
 
<<<<<<< HEAD
- "number"
    in this case, data, pendingData, values and xy are used and textFormatValue is undefined

- "text"
=======
- "default"
    in this case, data, pendingData, values and xy are used and textFormatValue is undefined

- "textBased"
>>>>>>> first version
    in this case, data, pendingData, values and xy are not used and textFormatValue is used
  
 */


class Telemetry{
<<<<<<< HEAD
    constructor(_name, isTimeBased, unit = undefined, type = "number"){
        this.type = type; // either "number" or "text"
=======
    constructor(_name, isTimeBased, unit = undefined, type = "default"){
<<<<<<< HEAD
        this.type = type; // either "default" or "textBased"
>>>>>>> first version
=======
        this.type = type; // either "default", "textBased" or "3D"
>>>>>>> simple 3d widget
        this.name = _name;
        this.unit = ( unit != "" ) ? unit : undefined;
        this.usageCount = 0;

        
<<<<<<< HEAD
<<<<<<< HEAD
        // an array of Number or String containing the last value recieved of the telemetry
=======
        // an array of Number containing the last value recieved of the telemetry
>>>>>>> first version
=======
        // an array of Number or String containing the last value recieved of the telemetry
>>>>>>> README update + single value component contains ref rather than id
        // contains either one (if !xy) or two values (if xy).
        this.values = [];

        this.xy = !isTimeBased && this.type == "default";
        this.data = [[],[]]; // data[0] contains the timestamps and data[1] contains the values corresponding to each timestamp
        this.pendingData = [[],[]];
        
<<<<<<< HEAD
<<<<<<< HEAD
=======
        // type : String, if telemetry is of type "textFormatted", contains the last received value
        this.textFormatValue = undefined;
        

>>>>>>> first version
=======
>>>>>>> text format telemetry synced
        if(!isTimeBased){
            this.data.push([]);
            this.pendingData.push([]);
        }

<<<<<<< HEAD
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

        return "";
       
=======
>>>>>>> first version
    }

    getValuesFormatted() {

        if (this.type == "default" && this.values[0] != undefined)
        {
            let res = this.values[0].toFixed(4);
        
            if (this.xy && this.values.length == 2)
                res += ("  " + this.values[1].toFixed(4));
    
            return res;
        }
        else if (this.type == "textBased")
        {
            return this.values[0];
        }
        else if (this.type == "3D")
        {
            return "coucou"
            // this.values[0] contains a Shape3D object
            //return this.values[0].shapeName;
        }

        return "";
       
    }
}