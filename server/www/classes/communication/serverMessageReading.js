//parses the message we received from the server

function parseData(msgIn){

    if(app.isViewPaused) return; // Do not buffer incomming data while paused
    let now = new Date().getTime();


    let fromSerial = msgIn.fromSerial || (msgIn.input && msgIn.input.type=="serial");
    if(fromSerial) now = msgIn.timestamp;

    now/=1000; // we convert timestamp in seconds for uPlot to work
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
    let logTimestamp = (parseFloat(msg.substr(1, logStart-2)))/1000; // /1000 to convert to seconds
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

    let keyAndWidgetLabel = msg.substr(0,msg.indexOf(':'));

    if(keyAndWidgetLabel.substring(0, 6) === "statsd") return;

    let [name, widgetLabel] = separateWidgetAndLabel(keyAndWidgetLabel);  

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
            let v1 = parseFloat(dims[0]);
            if (!flags.includes("xy")) // in this case, v1 is the timestamp that we convert to seconds
                v1/=1000;

            xArray.push(v1);
            yArray.push(isTextFormatTelem?dims[1]:parseFloat(dims[1]));
            zArray.push(now);
        }
        else if(dims.length == 3){
            xArray.push(parseFloat(dims[0]));
            yArray.push(parseFloat(dims[1]));
            zArray.push(parseFloat(dims[2])/1000);// this one is the timestamp we convert to seconds
        }

    }
    //console.log("name : "+name+", xArray : "+xArray+", yArray : "+yArray+", zArray : "+zArray+", unit : "+unit+", flags : "+flags);
    if(xArray.length>0){
        appendData(name, xArray, yArray, zArray, unit, flags, isTextFormatTelem?"text":"number", widgetLabel);
    }
}

function separateWidgetAndLabel(keyAndWidgetLabel)
{
    //keyAndWidgetLabel ex : "mysquare0,the_chart541"
    //keyAndWidgetLabel ex2 : "mysquare0"

    let marray = keyAndWidgetLabel.split(',');
    let key = marray[0];

    let label = marray.length > 1 ? marray[1] : undefined;
    
    return [key, label]
}

function parse3D(msg, now)
{
    //3D|myData1:R::3.14:P:1:2:-1:S:cube:W:5:H:4:D:3:C:red|g

    let firstPipeIdx = msg.indexOf("|");
    let startIdx = msg.indexOf(':') +1;
    let endIdx = msg.lastIndexOf("|");
    if (endIdx <= firstPipeIdx) endIdx = msg.length;// in this case the last pipe is not given ( there are no flags )
    let keyAndWidgetLabel = msg.substring(firstPipeIdx+1, startIdx-1);

    let [key, widgetLabel] = separateWidgetAndLabel(keyAndWidgetLabel);  

    let values = msg.substring(startIdx, endIdx).split(';')

    let flags = msg.substr(endIdx+1);

    for (let value of values)
    {
        if (value == "")
            continue;
            
        let valueStartIdx = 0;
        let timestamp;
        if (isLetter(value[0]))
        {
            timestamp = now;
        }
        else
        {
            let trueStartIdx = value.indexOf(':');

            timestamp = (value.substring(0, trueStartIdx))/1000;// we divise by 1000 to get timestamp in seconds

            valueStartIdx = trueStartIdx+1;
        }

        let rawShape = value.substring(valueStartIdx, value.length);


        let shape3D;
        try { shape3D = new Shape3D().initializeFromRawShape(key, rawShape);} 
        catch(e) { throw new Error("Error invalid shape text given : "+rawShape)};

        appendData(key, [timestamp], [shape3D], [], "", flags, "3D", widgetLabel)
    }
}

function getWidgetAccordingToLabel(widgetLabel, widgetType, isXY = false)
{
    if (widgetLabel != undefined) 
    {
        for (let i = 0; i <widgets.length; i++)
        {
            let currWidget = widgets[i];

            if(currWidget.label == widgetLabel && currWidget.type == widgetType && !!currWidget.isXY == isXY)
                return [currWidget, false];
        }
    }

    let newWidget;

    if (widgetType == "widget3D")
        newWidget = new Widget3D();
    else if (widgetType == "chart")
        newWidget = new ChartWidget(isXY);

    newWidget.label = widgetLabel;

    return [newWidget, true];
}
// adds
function appendData(key, valuesX, valuesY, valuesZ, unit, flags, telemType, widgetLabel=undefined) {
    let isXY = flags.includes("xy");
    if (isXY) telemType = "xy";

    let clear = flags.includes("clr");
    if(app.telemetries[key] && clear){
        app.telemetries[key].clearData();
    }

    let shouldPlot = !flags.includes("np");

    if(app.telemetries[key] == undefined){
                
        Vue.set(app.telemetries, key, new Telemetry(key, unit, telemType));
        
        if(shouldPlot)
        {
            let isNewWidget = false;
            let mwidget;
            switch(telemType)
            {
                case "number": 
                    [mwidget,isNewWidget]  = getWidgetAccordingToLabel(widgetLabel, "chart");
                    break;
                case "xy":
                    [mwidget,isNewWidget] = getWidgetAccordingToLabel(widgetLabel, "chart", true);
                    break;
                case "text":
                    mwidget = new SingleValueWidget(true);
                    isNewWidget = true;
                    break;
                case "3D":
                    [mwidget,isNewWidget] = getWidgetAccordingToLabel(widgetLabel, "widget3D");
                    break;
            }

            let serie = getSerieInstanceFromTelemetry(key);
            mwidget.addSerie(serie);
            if (isNewWidget)
                widgets.push(mwidget);
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
