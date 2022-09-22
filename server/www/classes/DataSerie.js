var DataSerieIdCount = 0;
// this class respresents a sequence or "serie"
class DataSerie{
    constructor(_name, isTimeBased, unit = undefined){
        this.name = _name;
        this.id = "data-serie-" + DataSerieIdCount++;
        this.sourceNames = []; //contains the names of the telemetries used to build the sequence
        this.formula = "";
        this.initialized = false;
        this.dataIdx = undefined;
        this.data = [[],[]]; // data[0] contains the timestamps and data[1] contains the values corresponding to each timestamp
        this.pendingData = [[],[]];
        this.options = {};
        this.value = null;
        this.stats = null;
        this.unit = ( unit != "" ) ? unit : undefined;
        this.xy = !isTimeBased;

        if(!isTimeBased){
            this.data.push([]);
            this.pendingData.push([]);
        }
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

    update(){
        this.applyTimeWindow();
        // no formula, simple data reference
        if(this.formula=="" && this.sourceNames.length==1){ // in this case our data serie matches a simple telemetry

            let isXY = app.telemetries[this.sourceNames[0]].xy;
            this.data[0] = app.telemetries[this.sourceNames[0]].data[0];
            this.data[1] = app.telemetries[this.sourceNames[0]].data[1];
            if(isXY) this.data[2] = app.telemetries[this.sourceNames[0]].data[2];
            this.pendingData[0] = app.telemetries[this.sourceNames[0]].pendingData[0];
            this.pendingData[1] = app.telemetries[this.sourceNames[0]].pendingData[1];
            if(isXY) this.pendingData[2] = app.telemetries[this.sourceNames[0]].pendingData[2];
            this.value = app.telemetries[this.sourceNames[0]].value;
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
            if(app.telemetries[key].xy) timeIdx = 2;
            let latestTimestamp = d[timeIdx][d[timeIdx].length-1];
            let minTimestamp = latestTimestamp - parseFloat(app.viewDuration);
            let minIdx = findClosestLowerByIdx(d[timeIdx], minTimestamp);
            if(d[timeIdx][minIdx]<minTimestamp) minIdx += 1;
            else continue;
            app.telemetries[key].data[0].splice(0, minIdx);
            app.telemetries[key].data[1].splice(0, minIdx);
            if(app.telemetries[key].xy) app.telemetries[key].data[2].splice(0, minIdx);
        }
    }
}


function onTelemetryUsed(name, force=false){
    let telem = app.telemetries[name];
    if(telem == undefined) return;
}

function onTelemetryUnused(name, force=false){
    let telem = app.telemetries[name];
    if(telem == undefined) return;
}