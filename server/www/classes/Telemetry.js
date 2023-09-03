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

        // this is what will be displayed on the left pannel next to the telem name, 
        // it is either the current value of the telem (number), or its text or the type of the shape ...
        this.values_formatted = ""; 


        if (this.type == "3D") 
            this.setShapeTypeDelay();
    }

    clearData()
    {
        this.values.length = 0;
        for(let arr of this.data) { arr.length = 0; }
        for(let arr of this.pendingData) { arr.length = 0; }
        this.values_formatted = "";
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
                this.values_formatted = res1;
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

    updateFormattedValues() {

        if ((this.type == "number" || this.type == "xy") && this.values[0] != undefined && typeof(this.values[0])=='number')
        {
            let res = this.values[0].toFixed(4);
        
            if (this.type=="xy" && this.values.length == 2)
                res += ("  " + this.values[1].toFixed(4));
    
            this.values_formatted =  res;
        }
        else if (this.type == "text")
        {
            this.values_formatted =  this.values[0];
        }
        else if (this.type != "3D")
        // if equals 3D, then values_formatted contains the name of the shape and has already been set at instanciation,
        // otherwise, it means we haven't been able to get te good text to show so we just return ""
        {   
            this.values_formatted =  "";
        }
       
    }
}