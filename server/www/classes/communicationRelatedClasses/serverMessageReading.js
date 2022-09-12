const defaultPlotOpts = {
    title: "",
    width: 400,
    height: 250,
    
    //hooks: {setCursor: [function(e){console.log(e);}]},
    scales: {
        x: {
            time: false
        },
        y:{}
    },
    series: [
        {},
        {
            stroke: "red",
            fill: "rgba(255,0,0,0.1)"
        }
    ],
    cursor: {
        lock: false,
        focus: { prox: 16, },
        sync: {
            key: window.cursorSync.key,
            setSeries: true
        }
    },
    legend: {
        show: false
    }
};


//parses the message we received from the server
function parseData(msgIn){

    if(app.isViewPaused) return; // Do not buffer incomming data while paused
    let now = new Date().getTime();
    let fromSerial = msgIn.fromSerial || (msgIn.input && msgIn.input.type=="serial");
    if(fromSerial) now = msgIn.timestamp;
    //parse msg
    let msgList = (""+msgIn.data).split("\n");
    for(let msg of msgList){
        try{
            // Inverted logic on serial port for usability
            if(fromSerial && msg.startsWith(">")) msg = msg.substring(1);// remove '>' to consider as variable
            else if(fromSerial && !msg.startsWith(">")) msg = ">:"+msg;// add '>' to consider as log

            // Command
            if(msg.startsWith("|")){
                // Parse command list
                let cmdList = msg.split("|");
                for(let cmd of cmdList){
                    if(cmd.length==0) continue;
                    if(cmd.startsWith("_")) continue;
                    if(app.commands[cmd] == undefined){
                        let newCmd = {
                            name: cmd
                        };
                        Vue.set(app.commands, cmd, newCmd);
                    }
                }
                if(!app.cmdAvailable && Object.entries(app.commands).length>0) app.cmdAvailable = true;
            }
            // Log
            else if(msg.startsWith(">")){
                let currLog = {
                    timestamp: now,
                    text: ""
                }
                
                let logStart = msg.indexOf(":")+1;
                currLog.text = msg.substr(logStart);
                currLog.timestamp = parseFloat(msg.substr(1, logStart-2));
                if(isNaN(currLog.timestamp) || !isFinite(currLog.timestamp)) currLog.timestamp = now;
                logBuffer.unshift(currLog);//prepend log to buffer
            }
            // Data
            else {
                // Extract series
                if(!msg.includes(':')) return;
                let startIdx = msg.indexOf(':');
                let name = msg.substr(0,msg.indexOf(':'));
                let endIdx = msg.indexOf('|');
                let flags = msg.substr(endIdx+1);
                if(endIdx == -1){
                    flags = "g";
                    endIdx = msg.length;
                }
                // Extract values array
                let values = msg.substr(startIdx+1, endIdx-startIdx-1).split(';')
                let xArray = [];
                let yArray = [];
                let zArray = [];
                for(let value of values){
                    if(value.length==0) continue;
                    let dims = value.split(":");
                    if(dims.length == 1){
                        xArray.push(now);
                        yArray.push(parseFloat(dims[0]));
                    }
                    else if(dims.length == 2){
                        xArray.push(parseFloat(dims[0]));
                        yArray.push(parseFloat(dims[1]));
                        zArray.push(now);
                    }
                    else if(dims.length == 3){
                        xArray.push(parseFloat(dims[0]));
                        yArray.push(parseFloat(dims[1]));
                        zArray.push(parseFloat(dims[2]));
                    }
                    /*let sepIdx = value.indexOf(':');
                    if(sepIdx==-1){
                        xArray.push(now);
                        yArray.push(parseFloat(value));
                    }
                    else {
                        xArray.push(parseFloat(value.substr(0, sepIdx)));
                        yArray.push(parseFloat(value.substr(sepIdx+1)));
                    }*/
                }
                if(xArray.length>0){
                    appendData(name, xArray, yArray, zArray, flags)
                }
            }
        }
        catch(e){console.log(e)}
    }
}

// adds
function appendData(key, valuesX, valuesY, valuesZ, flags) {
    if(key.substring(0, 6) === "statsd") return;
    let isTimeBased = !flags.includes("xy");
    let shouldPlot = !flags.includes("np");
    if(app.telemetries[key] == undefined){
        let config = Object.assign({}, defaultPlotOpts);
        config.name = key;
        config.scales.x.time = isTimeBased;
        if(!isTimeBased){
            config.mode = 2;
            config.cursor.sync = undefined;
            config.series[1].paths = drawXYPoints;
        }
        var obj = {
            name: key,
            flags: flags,
            data: [[],[]],
            pendingData: [[],[]],
            value: 0,
            config: config,
            xy: !isTimeBased,
            usageCount: 0
        };
        if(!isTimeBased){
            obj.data.push([]);
            obj.pendingData.push([]);
        }
        Vue.set(app.telemetries, key, obj)
        // Create widget
        if(shouldPlot){
            let chart = new ChartWidget(!isTimeBased);
            let serie = new DataSerie(key);
            serie.addSource(key);
            chart.addSerie(serie);
            widgets.push(chart);
        }
    }
    if(telemBuffer[key] == undefined){
        telemBuffer[key] = {data:[[],[]], value:0};
        if(!isTimeBased) telemBuffer[key].data.push([]);
    }

    // Convert timestamps to seconds
    if(isTimeBased) { valuesX.forEach((elem, idx, arr)=>arr[idx] = elem/1000); }
    else            { valuesZ.forEach((elem, idx, arr)=>arr[idx] = elem/1000); }

    // Flush data into buffer (to be flushed by updateView)
    telemBuffer[key].data[0].push(...valuesX);
    telemBuffer[key].data[1].push(...valuesY);
    if(app.telemetries[key].xy) {
        telemBuffer[key].value = ""+valuesX[valuesX.length-1].toFixed(4)+" "+valuesY[valuesY.length-1].toFixed(4)+"";
        telemBuffer[key].data[2].push(...valuesZ);
    }
    else {
        telemBuffer[key].value = valuesY[valuesY.length-1];
    }
    return;
}