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
        
        if(this.type == "xy")
        {
            // in this case, this.data and this.pending data contain 3 arrays, the two first for x and y values and the last one for the timestamp
            this.data.push([]);
            this.pendingData.push([]);
        }

        this.shapeType = ""; // if this.type == 3D, then this will be displayed next to the telemetry name on the left pannel

        

        if (this.type == "3D") 
            this.setShapeTypeDelay();
    }

    setShapeTypeDelay()
    {
        setTimeout(()=>{
            if (!this.setShapeType())
                this.setShapeTypeDelay();
        }, 50);
    }

    setShapeType()
    {
        let res0 = this.data[1][this.data[1].length-1];

        if (res0 != undefined)
        {
            let res1 = res0.type;
            if (res1 != undefined)
            {
                this.shapeType = res1;
                return true;
            }
        }   
        return false;
    }

    iniFromTelem(telem)
    {
        this.type = telem.type;
        this.name = telem.name;
        this.unit = telem.unit;
        this.usageCount = telem.usageCount;
        this.values = telem.values;
        this.data = telem.data;
        this.pendingData = telem.pendingData;

        return this;
    }

    getValuesFormatted() {

        if (this.type == "3D")
        {
           return this.shapeType;
        }
        else if ((this.type == "number" || this.type == "xy") && this.values[0] != undefined && typeof(this.values[0])=='number')
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

        return "";
       
    }
}