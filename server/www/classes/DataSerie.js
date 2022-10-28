var DataSerieIdCount = 0;
// this class respresents a sequence or "serie"
class DataSerie{
    constructor(_name = undefined, unit = undefined, type = "text"){
        this.type = type;// either text, number, 3D or xy
        this.name = _name;
        this.id = "data-serie-" + DataSerieIdCount++;
        this.sourceNames = []; //contains the names of the telemetries used to build the sequence
        this.formula = "";
        this.initialized = false;
        this.dataIdx = undefined;
        this.data = [[],[]]; // data[0] contains the timestamps and data[1] contains the values corresponding to each timestamp
        this.pendingData = [[],[]];
        this.options = {};
        this._values = undefined; // an array of Number or String containing the last value of the serie ( either one (if !xy) or two values (if xy) ).
        this.stats = null;
        this.unit = ( unit != "" ) ? unit : undefined;
        this.onSerieChanged = undefined;
    }

    get values()
    {
        if (this._values == undefined)
        {
            // we try to connect to its corresponding telemetry if it exists

            let telemName = this.sourceNames.length>=1?this.sourceNames[0]:undefined;
            let telemetry = telemName!=undefined?app.telemetries[telemName]:undefined;
            if (telemetry != undefined)
                this._values = telemetry.values;
        }

        return this._values;
    }

    set values(new_values)
    {
        this._values = new_values;
    }

    
    formatDetails3D(strToTrim)
    { 
        let nb = Number(strToTrim); 
        if (!nb.isNaN)
        {
            if (nb == 0)
                return "0"
                
            return nb.toPrecision(2).toString();
        }
        return strToTrim;
    }

    getFormattedValue()
    {
        if ((this.type != "number" && this.type != "xy") || this.values == undefined || this.values[0] == undefined)
            return "";

        if (this.type == "xy" && this.values[1] != undefined && typeof(this.values[0]) == 'number') 
            return ((this.values[0].toFixed(4)) + "  " +(this.values[1].toFixed(4)));
        else if (this.type == "number" && typeof(this.values[0]) == 'number')
        {
            return (this.values[0].toFixed(4));
        }
    }

    getNameColor()
    {
        if (this.type == "3D" && this.values[0] != undefined)
            return this.values[0].color;
        return "black";
    }

    destroy(){
        for(let name of this.sourceNames){
            onTelemetryUnused(name);
        }
        this.sourceNames.length = 0;
    }

    addSource(name){
        this.sourceNames.push(name);
        onTelemetryUsed(name);
    }

    update(){ // this function is called from its widget, on updateView()

        this.applyTimeWindow();
        // no formula, simple data reference
        if(this.formula=="" && this.sourceNames.length==1){ // in this case our data serie matches a simple telemetry

            let isXY = app.telemetries[this.sourceNames[0]].type=="xy";
            this.data[0] = app.telemetries[this.sourceNames[0]].data[0];
            this.data[1] = app.telemetries[this.sourceNames[0]].data[1];
            if(isXY) this.data[2] = app.telemetries[this.sourceNames[0]].data[2];
            this.pendingData[0] = app.telemetries[this.sourceNames[0]].pendingData[0];
            this.pendingData[1] = app.telemetries[this.sourceNames[0]].pendingData[1];
            if(isXY) this.pendingData[2] = app.telemetries[this.sourceNames[0]].pendingData[2];

            if (this.onSerieChanged != undefined) // we want to notify that our serie may have changed 
                this.onSerieChanged();
        }
        else if (this.formula != "" && this.sourceNames.length>=1)
        {
            // TODO
        }
    }

    updateStats(){
        this.stats = computeStats(this.data);
    }

    applyTimeWindow(){
        if(parseFloat(app.viewDuration)<=0) return;
        for(let key of this.sourceNames) {
            let d = app.telemetries[key].data;
            let timeIdx = 0;
            if(app.telemetries[key].type=="xy") timeIdx = 2;
            let latestTimestamp = d[timeIdx][d[timeIdx].length-1];
            let minTimestamp = latestTimestamp - parseFloat(app.viewDuration);
            let minIdx = findClosestLowerByIdx(d[timeIdx], minTimestamp);
            if(d[timeIdx][minIdx]<minTimestamp) minIdx += 1;
            else continue;
            app.telemetries[key].data[0].splice(0, minIdx);
            app.telemetries[key].data[1].splice(0, minIdx);
            if(app.telemetries[key].type=="xy")
            {
                if (app.telemetries[key].data[2] == undefined)
                    throw new Error("ERROR! key : "+key+", whole obj : "+JSON.stringify(app.telemetries[key]));

                app.telemetries[key].data[2].splice(0, minIdx);
            }
        }
    }
}

function getSerieInstanceFromTelemetry(telemetryName)
{
    let serie = new DataSerie();

    let telemetry = app.telemetries[telemetryName];
    if (telemetry == undefined)
        throw new Error(`Trying to instanciate a DataSerie from a non existant telemetry name : ${telemetryName}`);
    
    serie.name = telemetryName;
    serie.values = telemetry.values; // this way, serie.values always equals telemetry.values
    serie.unit = telemetry.unit;
    serie.type = telemetry.type;
    serie.addSource(telemetryName);

    if (this.onSerieChanged != undefined)
        this.onSerieChanged();
        
    return serie;
}
function onTelemetryUsed(name, force=false){
    let telem = app.telemetries[name];
    if(telem == undefined) return;
    if(!force) telem.usageCount++;
}

function onTelemetryUnused(name, force=false){
    let telem = app.telemetries[name];
    if(telem == undefined) return;
    if(telem.usageCount>0)telem.usageCount--;
}