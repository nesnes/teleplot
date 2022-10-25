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
            // 3D
            else if (msg.substring(0,3) == "3D|")
                parse3D(msg, now);
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
       
    let logStart = msg.indexOf(":")+1;
    
    let logText = msg.substr(logStart);
    let logTimestamp = parseFloat(msg.substr(1, logStart-2));
    if(isNaN(logTimestamp) || !isFinite(logTimestamp)) logTimestamp = now;

    logBuffer.push(new Log(logTimestamp, logText));
}


function isTextFormatTelemetry(msg)
{
    return (Array.from(msg)).some((mchar) => ((mchar < '0' || mchar > '9') && mchar!='-' && mchar!=':' && mchar!='.' && mchar!=';' && mchar!= ',' && mchar!= '§'));
}

// msg : a String containing data of a variable, ex : "myValue:1627551892437:1234|g"
// now : a Number representing a timestamp 
function parseVariablesData(msg, now)
{
    if(!msg.includes(':')) return;

    let startIdx = msg.indexOf(':');

    let name = msg.substr(0,msg.indexOf(':'));
    if(name.substring(0, 6) === "statsd") return;

    let endIdx = msg.lastIndexOf('|');
    if (endIdx == -1) endIdx = msg.length;

    let flags = msg.substr(endIdx+1);

    let isTextFormatTelem = flags.includes('t');

    let unit = "";
    let unitIdx = msg.indexOf('§'); 
    if (unitIdx!=-1)
    {
        unit = msg.substring(unitIdx+1, endIdx);
        endIdx = unitIdx;
    }
    
    // Extract values array
    let values = msg.substring(startIdx+1, endIdx).split(';')
    let xArray = [];
    let yArray = [];
    let zArray = [];
    for(let value of values)
    {
        /*  All possibilities : 

            Number timestamp : 
                [1627551892437, 1234]
            Number no timestamp : 
                [1234]
            
            Text timestamp : 
                [1627551892437, Turned On]
            Text no timestamp : 
                [Turned On]

            xy timestamp : 
                [1, 1, 1627551892437]
            xy no timestamp : 
                [1, 1]
        */

        if(value.length==0) continue;
        let dims = value.split(":");

        if(dims.length == 1){
            xArray.push(now);
            yArray.push(isTextFormatTelem?dims[0]:parseFloat(dims[0]));
        }
        else if(dims.length == 2){
            xArray.push(parseFloat(dims[0]));
            yArray.push(isTextFormatTelem?dims[1]:parseFloat(dims[1]));
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
        appendData(name, xArray, yArray, zArray, unit, flags, isTextFormatTelem?"text":"number");
    }
}

function parse3D(msg, now)
{
    // 3D|my_cube_0:12145641658484:{...}|g

    //echo '3D|myDataa:{"rotation":{"x":0,"y":0,"z":0},"position":{"x":0,"y":0,"z":0},
    //"shape":"cube","width":7,"height":5,"depth":5}|g' | nc -u -w0 127.0.0.1 47269

    //'3D|myDataa:{"R":{"x":0,"y":0,"z":0},"P":{"x":0,"y":0,"z":0},"S":cube,"W":7,"H":5,"D":5}|g'
    //3D|myData1:R::3.14:P:1:2:-1:S:cube:W:5:H:4:D:3:C:red|g

    let firstPipeIdx = msg.indexOf("|");
    let startIdx = msg.indexOf(':') +1;
    let endIdx = msg.lastIndexOf("|");
    if (endIdx <= firstPipeIdx) endIdx = msg.length;// in this case the last pipe is not given ( there are no flags )
    let key = msg.substring(firstPipeIdx+1, startIdx-1);


    let timestamp;
    if (isLetter(msg[startIdx]))
    {
        timestamp = now;
    }
    else
    {
        let trueStartIdx = msg.indexOf(':', startIdx);

        timestamp = (msg.substring(startIdx, trueStartIdx));

        startIdx = trueStartIdx+1;
    }

    let rawShape = msg.substring(startIdx,endIdx);


    let flags = msg.substr(endIdx+1);
    let shape3D;
    try { shape3D = new Shape3D().initializeFromRawShape(key, rawShape);} 
    catch(e) { throw new Error("Error invalid shape text given : "+rawShape)};

    appendData(key, [timestamp], [shape3D], [], "", flags, "3D")
}

// adds
function appendData(key, valuesX, valuesY, valuesZ, unit, flags, telemType) {
    let isXY = flags.includes("xy");
    if (isXY) telemType = "xy";

    let shouldPlot = !flags.includes("np");

    if(app.telemetries[key] == undefined){
                
        Vue.set(app.telemetries, key, new Telemetry(key, unit, telemType));
        // Create widget
        if(shouldPlot)
        {
            let chart;
            switch(telemType)
            {
                case "number": 
                    chart = new ChartWidget(isXY);
                    break;
                case "xy":
                    chart = new ChartWidget(isXY);
                    break;
                case "text":
                    chart = new SingleValueWidget(true);
                    break;
                case "3D":
                    chart = new Widget3D();
                    break;
            }

            let serie = getSerieInstanceFromTelemetry(key);
            chart.addSerie(serie);
            widgets.push(chart);
        }
    }
    if(telemBuffer[key] == undefined)
    {
        telemBuffer[key] = {data:[[],[]], values:[]};
        if(isXY) telemBuffer[key].data.push([]);
    }

    // Convert timestamps to seconds
    if(!isXY) { valuesX.forEach((elem, idx, arr)=>arr[idx] = elem); }
    else            { valuesZ.forEach((elem, idx, arr)=>arr[idx] = elem); }

    // Flush data into buffer (to be flushed by updateView)
    
    telemBuffer[key].data[0].push(...valuesX);
    telemBuffer[key].data[1].push(...valuesY);
    telemBuffer[key].values.length = 0;
    

    if(app.telemetries[key].type=="xy")
    {
        telemBuffer[key].values.push(valuesX[valuesX.length-1]);
        telemBuffer[key].values.push(valuesY[valuesY.length-1]);

        telemBuffer[key].data[2].push(...valuesZ);
    }
    else 
    {
        telemBuffer[key].values.push(valuesY[valuesY.length-1]);

        if (app.telemetries[key].type=="3D")
        {
            let prevShapeIdx =  app.telemetries[key].data[1].length -1;

            let newShape = telemBuffer[key].values[0];

            if (prevShapeIdx >= 0) // otherwise, it means that there ain't any previous shape
            {
                let shapeJustBefore = app.telemetries[key].data[1][prevShapeIdx];

                newShape.fillUndefinedWith(shapeJustBefore);// fills undefined properties of the new shape with the previous ones.
            }
            else if (newShape.type != undefined)
            {
                newShape.fillUndefinedWithDefaults();
            }
            else
            {
                throw new Error("no type given for the shape ( cube, or sphere ... should be passed )");
            }
        }
    }
    return;
}