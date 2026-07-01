TELEPLOT.parseDataText = function(msgIn){
    if(TELEPLOT.state.isPaused) return; // Do not buffer incoming data while paused
    let now = new Date().getTime();

    if(typeof msgIn == "string") msgIn = {data: msgIn, timestamp: now};// if msgIn is a string, we convert it to an object

    let fromSerial = msgIn.fromSerial || (msgIn.input && msgIn.input.type=="serial");
    if(fromSerial && "timestamp" in msgIn) now = msgIn.timestamp;

    now/=1000; // we convert timestamp from ms to seconds in datastore (for uPlot to work)

    // handle multiple messages as separated lines
    let msgList = (""+msgIn.data).split("\n");
    for(let msg of msgList){
        try{
            // Inverted logic on serial port for usability
            if(fromSerial && msg.startsWith(">")) msg = msg.substring(1);// remove '>' to consider as variable
            else if(fromSerial && !msg.startsWith(">")) msg = ">:"+msg;// add '>' to consider as log
            
            // Command
            if(msg.startsWith("|"))
                0;//_parseDataText_parseCommandList(msg);
            // Log
            else if(msg.startsWith(">"))
                _parseDataText_parseLog(msg, now, msgIn.input);
            // 3D
            else if (msg.substring(0,3) == "3D|")
                0;//parse3D(msg, now);
            // JPG
            else if (msg.substring(0,4) == "JPG|" || msg.substring(0,4) == "PNG|")
                _parseDataText_parseImage(msg, now);
            // Data
            else
                _parseDataText_parseVariablesData(msg, now);
        }
        catch(e){console.log(e)}
    }
}

/*function _parseDataText_parseCommandList(msg) // a String containing a list of commands, ex : "|sayHello|world|"
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
}*/

function _parseDataText_separateWidgetAndLabel(keyAndWidgetLabel)
{
    //keyAndWidgetLabel can be "mysquare0,the_chart541" or "mysquare0"
    let marray = keyAndWidgetLabel.split(',');
    let key = marray[0];
    let label = marray.length > 1 ? marray[1] : undefined;
    return [key, label]
}

// msg : a String containing a log message, ex : ">:Hello world"
// now : a Number representing a timestamp
function _parseDataText_parseLog(msg, now, input) 
{
    let logStart = msg.indexOf(":")+1;
    let logText = msg.substr(logStart);
    let logTimestamp = (parseFloat(msg.substr(1, logStart-2)))/1000; // /1000 to convert to seconds
    if(isNaN(logTimestamp) || !isFinite(logTimestamp)) logTimestamp = now;
    
    let telemName = input && input.type=="serial" ? input.port+_defaultTextLogName : _defaultTextLogName;
    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemName);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT, [logTimestamp], [[logText]]);
}

// msg : a String containing data of a variable, ex : "myValue:1627551892437:1234|g"
// now : a Number representing a timestamp 
function _parseDataText_parseVariablesData(msg, now)
{
    if(!msg.includes(':')) return;
    let startIdx = msg.indexOf(':');
    let endIdx = msg.lastIndexOf('|');
    if (endIdx == -1) endIdx = msg.length;
    
    let keyAndWidgetLabel = msg.substr(0,msg.indexOf(':'));
    if(keyAndWidgetLabel.substring(0, 6) === "statsd") return;
    let [name, widgetLabel] = _parseDataText_separateWidgetAndLabel(keyAndWidgetLabel);  
    
    let flags = msg.substr(endIdx+1);
    let isTextFormatTelem = flags.includes('t');
    let isXY = flags.includes("xy");

    let unit = "";
    let unitIdx = msg.indexOf('§'); 
    if (unitIdx!=-1)
    {
        unit = msg.substring(unitIdx+1, endIdx);
        endIdx = unitIdx;
    }
    
    // Extract values array
    let values = msg.substring(startIdx+1, endIdx).split(';')
    let timestampArray = [];
    let xArray = [];
    let yArray = [];
    for(let value of values)
    {
        /*  All possibilities : 
            Number timestamp :  [1627551892437, 1234]
            Number no timestamp :  [1234]
            Text timestamp :  [1627551892437, Turned On]
            Text no timestamp :  [Turned On]
            xy timestamp :  [1, 1, 1627551892437]
            xy no timestamp :  [1, 1]
        */

        if(value.length==0) continue;
        let dims = value.split(":");

        if(dims.length == 1){ // Number no timestamp
            timestampArray.push(now);
            xArray.push(isTextFormatTelem?dims[0]:parseFloat(dims[0]));
        }
        else if(dims.length == 2){
            let v1 = parseFloat(dims[0]);
            if(isXY) { // xy no timestamp
                timestampArray.push(now);
                xArray.push(parseFloat(dims[0]));
                yArray.push(parseFloat(dims[1]));
            }
            else { // Number timestamp or Text timestamp
                timestampArray.push(v1/1000); // convert to seconds
                xArray.push(isTextFormatTelem?dims[1]:parseFloat(dims[1]));
            }
        }
        else if(dims.length == 3){ // xy timestamp
            xArray.push(parseFloat(dims[0]));
            yArray.push(parseFloat(dims[1]));
            timestampArray.push(parseFloat(dims[2])/1000);// this one is the timestamp we convert to seconds
        }

    }
    // Get Telemetry
    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(name);

    // Handle flags
    if(flags.includes("np")) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_AUTOPLOT, false);
    if(flags.includes("clr")) telemetry.clearData();

    if(unit.length>0) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT, unit);

    // Add Telemetry data
    if(timestampArray.length>0){
        if(isXY) {
            telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D, timestampArray, [xArray, yArray]);
        }
        else if(isTextFormatTelem) {
            telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT, timestampArray, [xArray]);
        }
        else {
            telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER, timestampArray, [xArray]);
        }
    }
}

function _parseDataText_parseImage(msg, now)
{
    // JPG|key:timestamp:1/4:b64buffer§unit|flags
    // PNG|key:timestamp:1/4:b64buffer§unit|flags
    //         ^^^^^^^^^^^^^^         ^^^^^^^^^^^ optional
    let keyFrom = 0; keyTo = 0;
    let timestampFrom = 0; timestampTo = 0;
    let indexFrom = 0; indexTo = 0;
    let b64From = 0; b64To = 0;
    let unitFrom = 0; unitTo = 0;
    let flagFrom = 0; flagTo = 0;
    
    typeTo = msg.indexOf('|');
    keyFrom = msg.indexOf("|")+1;
    keyTo = msg.indexOf(':');
  	b64From = keyTo+1;
  	b64To = msg.length;

    unitFrom = msg.indexOf("§")+1;
    if(unitFrom>0) { // if has unit
        b64To = unitFrom-1;
        unitTo = msg.lastIndexOf("|");
        if(unitFrom > unitTo) unitTo = msg.length // no flags
    }

    flagFrom = msg.lastIndexOf("|")+1;
    if(flagFrom > keyFrom)
    {
        if(unitFrom<=0) b64To = flagFrom-1;
        flagTo = msg.length;
    }
    
    timestampFrom = keyTo + msg.substr(keyTo).indexOf(":") + 1;
    if(timestampFrom >= keyTo)
    {
    	timestampTo = timestampFrom + msg.substr(timestampFrom+1).indexOf(":") + 1;
      if (msg.substr(timestampFrom, timestampTo - timestampFrom).indexOf("/") != -1)
      {
      	indexFrom = timestampFrom;
        indexTo = timestampTo;
        timestampFrom = 0;
        timestampTo = 0;
        b64From = indexTo+1;
      }
      else
      {
      	indexFrom = timestampTo + msg.substr(timestampTo).indexOf(":") + 1;
        if(indexFrom >= timestampTo)
        {
            indexTo = indexFrom + msg.substr(indexFrom+1).indexOf(":") + 1;
            b64From = indexTo;
            if(msg[b64From] == ':') {
                b64From += 1;
            }
        }
      }
    }
    
    let type = msg.substr(0, typeTo);
    let typeCode = TELEPLOT.protocol.IMAGE_TYPE_JPEG;
    if (type.toUpperCase() == "PNG") typeCode = TELEPLOT.protocol.IMAGE_TYPE_PNG;
    


    let key = msg.substr(keyFrom, keyTo-keyFrom)
    let timestamp = msg.substr(timestampFrom, timestampTo-timestampFrom)
    if(timestamp.length == 0) {
        timestamp = now;
    }
    else {
        timestamp = parseFloat(timestamp)/1000; // Convert timestamp in seconds
    }
    let index = msg.substr(indexFrom, indexTo-indexFrom)
    let b64 = msg.substr(b64From, b64To-b64From)
    let unit = msg.substr(unitFrom, unitTo-unitFrom)
    let flags = msg.substr(flagFrom, flagTo-flagFrom)

    let fullB64 = "";

    
    // Rebuild image from fragmented packets
    if (index != "") {
        indexTab = index.split('/');
        if (indexTab.length != 2) return;
        segmentIndex = parseInt(indexTab[0]);
        segmentCount = parseInt(indexTab[1]);
        if(typeof _parseDataText_parseImage.fragments == 'undefined' ) { _parseDataText_parseImage.fragments = {}; }
        if( _parseDataText_parseImage.fragments[key] == undefined
         || (_parseDataText_parseImage.fragments[key].timestamp != timestamp && timestampFrom>0)
         || _parseDataText_parseImage.fragments[key].segmentCount != segmentCount
         || _parseDataText_parseImage.fragments[key].segments[segmentIndex] != undefined
        ){
            _parseDataText_parseImage.fragments[key] = {timestamp:0, segments: {}, segmentCount: 0};
        }
        _parseDataText_parseImage.fragments[key].timestamp = timestamp;
        _parseDataText_parseImage.fragments[key].segmentCount = segmentCount;
        _parseDataText_parseImage.fragments[key].segments[segmentIndex] = b64;
        // Check all fragments received
        if(Object.keys(_parseDataText_parseImage.fragments[key].segments).length == segmentCount) {
            for(let i=1;i<=segmentCount;i++) {
                if(_parseDataText_parseImage.fragments[key].segments[i] == undefined) { return; }
                fullB64 += _parseDataText_parseImage.fragments[key].segments[i];
            }
        }
    }
    else {
        // Image not fragmented
        fullB64 = b64;
    }

    // Add image to telemetry
    if(fullB64.length) {
        // Get Telemetry
        let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(key);

        // Handle flags
        if(flags.includes("np")) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_AUTOPLOT, false);
        if(flags.includes("clr")) telemetry.clearData();
        if(unit.length>0) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT, unit);

        // Add image
        telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE, [timestamp], [[typeCode],[fullB64]]);
    }

}