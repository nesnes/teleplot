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
            if(msg.startsWith("|"))
                parseCommandList(msg);
            // Log
            else if(msg.startsWith(">"))
                parseLog(msg, now);
            // Data
            else 
                parseVariablesData(msg, now);
        }
        catch(e){console.log(e)}
    }
}

function parseCommandList(msg) // a String containing a list of commands, ex : "|sayHello|world|"
{
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

// msg : a String containing a log message, ex : ">:Hello world"
// now : a Number representing a timestamp
function parseLog(msg, now) 
{
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

// valid characters for unit : anything but ':' '.' ',' ';' '|' and digits 
function isValidUnitChar(character)
{
    return (character<'0' || character>'9') && character!=':' && character!='.' && character!=',' && character!=';' && character!='|' ;
}

function isTextFormatTelemetry(msg, startIdx)
{
    let firstChar = msg[startIdx+1];

    return (firstChar < '0' || firstChar > '9');
}

// msg : a String containing data of a variable, ex : "myValue:1627551892437:1234|g"
// now : a Number representing a timestamp 
function parseVariablesData(msg, now)
{
    if(!msg.includes(':')) return;

    let startIdx = msg.indexOf(':');
    let name = msg.substr(0,msg.indexOf(':')); if(name.substring(0, 6) === "statsd") return;
    let endIdx = msg.indexOf('|');
    let flags = msg.substr(endIdx+1);
    let unit = "";
    if(endIdx == -1){
        flags = shouldPlotByDefault?"g":"np";
        endIdx = msg.length;
    }

    if (isTextFormatTelemetry(msg, startIdx))
    {
        let textFormatMsg = msg.substring(startIdx+1, endIdx);

        let shouldPlot = !flags.includes("np");
        if(app.telemetries[name] == undefined){
            
            let telem = new Telemetry(name, undefined, undefined, "textBased");
            telem.textFormatValue = textFormatMsg;

            Vue.set(app.telemetries, name, telem)
            // Create widget
            if(shouldPlot)
            {
                let chart = new SingleValueWidget(true);
                let serie = getSerieInstanceFromTelemetry(name);
                chart.setSerie(serie);
                widgets.push(chart);
            }
        }
        else
            app.telemetries[name].textFormatValue = textFormatMsg;

        return;
    }

  
    while (endIdx-1 > startIdx && isValidUnitChar(msg[endIdx-1]))
        unit = msg[--endIdx] + unit;

    if (msg[endIdx-1]==':')endIdx--;

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
      
    }
    //console.log("name : "+name+", xArray : "+xArray+", yArray : "+yArray+", zArray : "+zArray+", unit : "+unit+", flags : "+flags);
    if(xArray.length>0){
        appendData(name, xArray, yArray, zArray, unit, flags)
    }
}
// adds
function appendData(key, valuesX, valuesY, valuesZ, unit, flags) {
    let isTimeBased = !flags.includes("xy");
    let shouldPlot = !flags.includes("np");
    if(app.telemetries[key] == undefined){
                
        Vue.set(app.telemetries, key, new Telemetry(key, isTimeBased, unit))
        // Create widget
        if(shouldPlot)
        {
            let chart = new ChartWidget(!isTimeBased);
            let serie = getSerieInstanceFromTelemetry(key);
            chart.addSerie(serie);
            widgets.push(chart);
        }
    }
    if(telemBuffer[key] == undefined){
        telemBuffer[key] = {data:[[],[]], values:[]};
        if(!isTimeBased) telemBuffer[key].data.push([]);
    }

    // Convert timestamps to seconds
    if(isTimeBased) { valuesX.forEach((elem, idx, arr)=>arr[idx] = elem/1000); }
    else            { valuesZ.forEach((elem, idx, arr)=>arr[idx] = elem/1000); }

    // Flush data into buffer (to be flushed by updateView)
    
    telemBuffer[key].data[0].push(...valuesX);
    telemBuffer[key].data[1].push(...valuesY);
    telemBuffer[key].values = [];
    
    if(app.telemetries[key].xy) {
        telemBuffer[key].values.push(valuesX[valuesX.length-1]);
        telemBuffer[key].values.push(valuesY[valuesY.length-1]);

        telemBuffer[key].data[2].push(...valuesZ);
    }
    else {
        telemBuffer[key].values.push(valuesY[valuesY.length-1]);
    }
    return;
}