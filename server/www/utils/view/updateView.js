
var lastUpdateViewTimestamp = 0;
function updateView() {
    // Clear Telemetries pendingData
    for(let key in app.telemetries) {
        if (app.telemetries[key].pendingData != undefined) 
        {
            app.telemetries[key].pendingData[0].length = 0;
            app.telemetries[key].pendingData[1].length = 0;
            if(app.telemetries[key].type=="xy") app.telemetries[key].pendingData[2].length = 0;
        }
    }
    // Flush Telemetry buffer into app model
    let dataSum = 0;
    if(!app.isViewPaused){
        for(let key in telemBuffer) {

            if(telemBuffer[key].data[0].length == 0) continue; // nothing to flush
            dataSum += telemBuffer[key].data[0].length;
            app.telemetries[key].data[0].push(...telemBuffer[key].data[0]);
            app.telemetries[key].data[1].push(...telemBuffer[key].data[1]);
            if(app.telemetries[key].type=="xy") app.telemetries[key].data[2].push(...telemBuffer[key].data[2]);
            if (app.telemetries[key].pendingData != undefined)
            {
                app.telemetries[key].pendingData[0].push(...telemBuffer[key].data[0]);
                app.telemetries[key].pendingData[1].push(...telemBuffer[key].data[1]);
                if(app.telemetries[key].type=="xy") app.telemetries[key].pendingData[2].push(...telemBuffer[key].data[2]);
            }
       
            telemBuffer[key].data[0].length = 0;
            telemBuffer[key].data[1].length = 0;
            if(app.telemetries[key].type=="xy") telemBuffer[key].data[2].length = 0;

            app.telemetries[key].values.length = 0;

            if (telemBuffer[key].values.length > 0)
                app.telemetries[key].values.push(telemBuffer[key].values[0]);

            if (telemBuffer[key].values.length > 1)
                app.telemetries[key].values.push(telemBuffer[key].values[1]);

            // this has to be done every time telem.values get modified, it is usefull for the html to display
            //the good text in the telemetry pannel 
            app.telemetries[key].updateFormattedValues();

        }
    }

    //Clear older data from viewDuration
    if(parseFloat(app.viewDuration)>0)
    {
        for(let key in app.telemetries) {
            let data = app.telemetries[key].data;
            let timeIdx = 0;
            if(app.telemetries[key].type=="xy") timeIdx = 2;
            let latestTimestamp = data[timeIdx][data[timeIdx].length-1];
            let minTimestamp = latestTimestamp - parseFloat(app.viewDuration);
            let minIdx = findClosestLowerByIdx(data[timeIdx], minTimestamp);
            if(data[timeIdx][minIdx]<minTimestamp) minIdx += 1;
            else continue;
            app.telemetries[key].data[0].splice(0, minIdx);
            app.telemetries[key].data[1].splice(0, minIdx);
            if(app.telemetries[key].type=="xy") app.telemetries[key].data[2].splice(0, minIdx);
        }
    }

    // Update widgets
    for(let w of widgets){
        w.update();
    }

    if(!app.dataAvailable && Object.entries(app.telemetries).length>0) app.dataAvailable = true;

    // Logs
    var logSum = logBuffer.length;
    if(!app.isViewPaused &&  logBuffer.length>0) {
        app.logs.push(...logBuffer);//append log to list
        logBuffer.length = 0;

    }

    if (app.logs.length>0)
    {
        app.logAvailable = true;
        LogConsole.getInstance().logsUpdated(0, app.logs.length);
    }


    // Stats
    let now = new Date().getTime();
    if(lastUpdateViewTimestamp==0) lastUpdateViewTimestamp = now;
    let diff = now - lastUpdateViewTimestamp
    if(diff>0){
        app.telemRate = app.telemRate*0.8 + (1000/diff*dataSum)*0.2;
        app.logRate = app.logRate *0.8 + (1000/diff*logSum)*0.2;
    }
    lastUpdateViewTimestamp = now;
}