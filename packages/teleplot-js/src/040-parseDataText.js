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
                _parseDataText_parse3D(msg, now);
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
    let isXYZ = flags.includes("xyz");
    let isXY = !isXYZ && flags.includes("xy");

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
    let zArray = [];
    for(let value of values)
    {
        /*  All possibilities : 
            Number timestamp :  [1627551892437, 1234]
            Number no timestamp :  [1234]
            Text timestamp :  [1627551892437, Turned On]
            Text no timestamp :  [Turned On]
            xy timestamp :  [1, 1, 1627551892437]
            xy no timestamp :  [1, 1]
            xyz timestamp :  [1, 1, 1, 1627551892437]
            xyz no timestamp :  [1, 1, 1]
        */

        if(value.length==0) continue;
        let dims = value.split(":");

        if(isXYZ) {
            if(dims.length < 3) continue;
            xArray.push(parseFloat(dims[0]));
            yArray.push(parseFloat(dims[1]));
            zArray.push(parseFloat(dims[2]));
            timestampArray.push(dims.length > 3 ? parseFloat(dims[3])/1000 : now);
        }
        else if(dims.length == 1){ // Number no timestamp
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
    if(widgetLabel) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_VIEW_LABEL, widgetLabel); // "name,label": shown with the telemetries of the same label

    // Add Telemetry data
    if(timestampArray.length>0){
        if(isXYZ) {
            telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D, timestampArray, [xArray, yArray, zArray]);
        }
        else if(isXY) {
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
        // Get Telemetry ("name,label": the label is not part of the name)
        let [name, widgetLabel] = _parseDataText_separateWidgetAndLabel(key);
        let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(name);

        // Handle flags
        if(flags.includes("np")) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_AUTOPLOT, false);
        if(flags.includes("clr")) telemetry.clearData();
        if(unit.length>0) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT, unit);
        if(widgetLabel) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_VIEW_LABEL, widgetLabel);

        // Add image
        telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE, [timestamp], [[typeCode],[fullB64]]);
    }

}

/*
 * 3D shapes: "3D|name:timestamp:properties|flags" (timestamp and flags optional, several "timestamp:properties" can be separated by ";").
 * Properties are names followed by their values, all separated by ":" (ex: "S:cube:P:1:2:0.5:C:red"). Values can be quoted ("..." or '...')
 * to contain separators (urls). A value left empty keeps what the shape had (ex: "P::2:" only moves along y).
 *   shape/S (cube, sphere, cylinder, stl)   url/U (stl file)   position/P x:y:z   rotation/R roll:pitch:yaw (rad)   quaternion/Q x:y:z:w
 *   color/C   opacity/O (0 to 1)   texture/T type:value (url:"http://..." or telem:imageTelemetryName)
 *   width/W (x), depth/D (y), height/H (z)   radius/RA (sphere, cylinder)   precision/PR (accepted, unused)
 * Camera of an image telemetry (the line is addressed to the name of the image telemetry; P and R/Q give where the camera is):
 *   intrinsics/K fx:fy:cx:cy:width:height (pinhole model, pixels)   distortion/DC k1:k2:p1:p2:k3
 * A shape is a telemetry: each property goes to the data type (or attribute) the binary protocol has for it, so both protocols give the same thing.
 */
const _parseDataText_3DProperties = {
    shape: ["type", 1], S: ["type", 1], url: ["url", 1], U: ["url", 1],
    position: ["position", 3], P: ["position", 3], rotation: ["rotation", 3], R: ["rotation", 3], quaternion: ["quaternion", 4], Q: ["quaternion", 4],
    color: ["color", 1], C: ["color", 1], opacity: ["opacity", 1], O: ["opacity", 1], texture: ["texture", 2], T: ["texture", 2],
    width: ["width", 1], W: ["width", 1], depth: ["depth", 1], D: ["depth", 1], height: ["height", 1], H: ["height", 1],
    radius: ["radius", 1], RA: ["radius", 1], precision: ["precision", 1], PR: ["precision", 1],
    intrinsics: ["intrinsics", 6], K: ["intrinsics", 6], distortion: ["distortion", 5], DC: ["distortion", 5]
};

// Split on a separator character, except inside quotes ("..." or '...'). keepQuotes: leave the quotes in the parts (to split them again).
function _parseDataText_splitOutsideQuotes(text, separator, keepQuotes=false) {
    let parts = [""];
    let quote = "";
    for(let c of text) {
        if(quote) {
            if(c == quote) { quote = ""; if(!keepQuotes) continue; }
        }
        else if(c == '"' || c == "'") { quote = c; if(!keepQuotes) continue; }
        else if(c == separator) { parts.push(""); continue; }
        parts[parts.length-1] += c;
    }
    return parts;
}

// "S:cube:P:1::3" -> {type: ["cube"], position: ["1", undefined, "3"]} (undefined: value not given). Throws on an unknown property.
function _parseDataText_parse3DProperties(tokens) {
    let properties = {};
    for(let i = 0; i < tokens.length;) {
        let name = tokens[i++];
        if(name === "") continue;
        let info = _parseDataText_3DProperties[name];
        if(info === undefined) throw new Error("Invalid shape property : " + name);
        let values = [];
        for(let n = 0; n < info[1]; n++, i++) values.push(i < tokens.length && tokens[i] !== "" ? tokens[i] : undefined);
        properties[info[0]] = values;
    }
    return properties;
}

function _parseDataText_parse3D(msg, now)
{
    const P = TELEPLOT.protocol;
    let parts = _parseDataText_splitOutsideQuotes(msg.substring(3), "|", true); // [name:values, flags]
    let body = parts[0];
    let flags = parts.length > 1 ? parts[parts.length-1] : "";
    let nameEnd = body.indexOf(":");
    if(nameEnd < 0) return;
    let [name, widgetLabel] = _parseDataText_separateWidgetAndLabel(body.substring(0, nameEnd));
    if(name.length == 0) return;

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(name);
    if(flags.includes("np")) telemetry.setAttribute(P.TELEM_ATTR_AUTOPLOT, false);
    if(flags.includes("clr")) telemetry.clearData();
    if(widgetLabel) telemetry.setAttribute(P.TELEM_ATTR_VIEW_LABEL, widgetLabel);

    // What the shape has so far, to complete values given in part
    let latest = (dataType, defaults) => {
        let point = telemetry.getDataPoint(dataType);
        return point.index === undefined ? defaults : point.data.slice();
    };
    let merge = (previous, values) => previous.map((old, i) => {
        let v = values[i] === undefined ? NaN : parseFloat(values[i]);
        return isNaN(v) ? old : v;
    });
    let put = (dataType, timestamp, values) => telemetry.addData(dataType, [timestamp], values.map((v) => [v]));

    for(let value of _parseDataText_splitOutsideQuotes(body.substring(nameEnd+1), ";", true)) {
        let tokens = _parseDataText_splitOutsideQuotes(value, ":");
        if(tokens.every((t) => t === "")) continue;
        let timestamp = now;
        if(/^[0-9.+-]/.test(tokens[0])) { // Starts with a timestamp (ms), not with a property name
            let t = parseFloat(tokens.shift()) / 1000;
            if(!isNaN(t) && isFinite(t)) timestamp = t;
        }
        let properties = _parseDataText_parse3DProperties(tokens);

        if(properties.type !== undefined || properties.url !== undefined) {
            let shape = Object.assign({ type: P.TELEM_ATTR_SHAPE_TYPE_CUBE, data: "" }, telemetry.getAttribute(P.TELEM_ATTR_SHAPE));
            if(properties.type !== undefined && properties.type[0] !== undefined) {
                let type = { cube: P.TELEM_ATTR_SHAPE_TYPE_CUBE, sphere: P.TELEM_ATTR_SHAPE_TYPE_SPHERE, cylinder: P.TELEM_ATTR_SHAPE_TYPE_CYLINDER, stl: P.TELEM_ATTR_SHAPE_TYPE_STL }[properties.type[0].toLowerCase()];
                if(type === undefined) throw new Error("Invalid shape type : " + properties.type[0]);
                shape.type = type;
            }
            if(properties.url !== undefined && properties.url[0] !== undefined) shape.data = properties.url[0];
            telemetry.setAttribute(P.TELEM_ATTR_SHAPE, shape);
        }
        if(properties.position !== undefined) {
            put(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION, timestamp, merge(latest(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION, [0, 0, 0]), properties.position));
        }
        if(properties.rotation !== undefined) {
            put(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION, timestamp, merge(latest(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION, [0, 0, 0]), properties.rotation));
        }
        if(properties.quaternion !== undefined) { // Written x:y:z:w, stored w, x, y, z (like the binary protocol)
            let [x, y, z, w] = properties.quaternion;
            put(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION, timestamp, merge(latest(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION, [1, 0, 0, 0]), [w, x, y, z]));
        }
        if(properties.color !== undefined && properties.color[0] !== undefined) {
            put(P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR, timestamp, [properties.color[0]]);
        }
        if(properties.opacity !== undefined) { // 0 to 1, stored 0 to 255 (like the binary protocol)
            let opacity = parseFloat(properties.opacity[0]);
            if(!isNaN(opacity)) put(P.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY, timestamp, [Math.round(Math.max(0, Math.min(1, opacity)) * 255)]);
        }
        if(properties.texture !== undefined) {
            let type = { url: P.TEXTURE_TYPE_URL, telem: P.TEXTURE_TYPE_IMAGE }[String(properties.texture[0]).toLowerCase()];
            if(type === undefined || properties.texture[1] === undefined) put(P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE, timestamp, [P.TEXTURE_TYPE_NONE, ""]);
            else put(P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE, timestamp, [type, properties.texture[1]]);
        }
        if(properties.intrinsics !== undefined) { // Written fx:fy:cx:cy:width:height, stored width, height, fx, fy, cx, cy (like the binary protocol)
            let [fx, fy, cx, cy, width, height] = properties.intrinsics;
            let intrinsics = merge(latest(P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS, [NaN, NaN, NaN, NaN, NaN, NaN]), [width, height, fx, fy, cx, cy]);
            if(intrinsics.some((v) => isNaN(v))) throw new Error("Camera intrinsics need fx:fy:cx:cy:width:height");
            put(P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS, timestamp, intrinsics);
        }
        if(properties.distortion !== undefined) {
            put(P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION, timestamp, merge(latest(P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION, [0, 0, 0, 0, 0]), properties.distortion));
        }
        if(properties.radius !== undefined || properties.width !== undefined || properties.depth !== undefined || properties.height !== undefined) {
            let size = latest(P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE, [1, 1, 1]);
            let radius = properties.radius !== undefined ? parseFloat(properties.radius[0]) : NaN;
            if(!isNaN(radius)) size = [radius * 2, radius * 2, radius * 2]; // The size of a shape is its extent along each axis
            let sides = [properties.width, properties.depth, properties.height].map((p) => p === undefined ? undefined : p[0]); // x, y, z
            put(P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE, timestamp, merge(size, sides));
        }
    }
}
