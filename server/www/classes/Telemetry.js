class Telemetry{
    constructor(_name, isTimeBased, unit = undefined){
        this.name = _name;
        this.values = []; // an array of Number containing either one (if !xy) or two values (if xy).
        this.data = [[],[]]; // data[0] contains the timestamps and data[1] contains the values corresponding to each timestamp
        this.pendingData = [[],[]];

        this.unit = ( unit != "" ) ? unit : undefined;
        this.xy = !isTimeBased;

        this.flags = undefined;
        this.usageCount = 0;

        if(!isTimeBased){
            this.data.push([]);
            this.pendingData.push([]);
        }
    }

    getValuesFormatted() {
        let res = this.values[0].toFixed(4);
        
        if (this.xy && this.values.length == 2)
            res += ("  " + this.values[1].toFixed(4));

        return res;
    }
}