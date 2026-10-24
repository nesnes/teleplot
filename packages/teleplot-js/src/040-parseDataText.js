// Returns the number of lines that could not be understood (0 when everything was): lines that made the parser fail, and lines that
// are not empty but hold no "name:value".
TELEPLOT.parseDataText = function(msgIn){
    if(TELEPLOT.state.isPaused) return 0; // Do not buffer incoming data while paused
    let problems = 0;
    let now = new Date().getTime();

    if(typeof msgIn == "string") msgIn = {data: msgIn, timestamp: now};// if msgIn is a string, we convert it to an object

    let fromSerial = msgIn.fromSerial || (msgIn.input && msgIn.input.type=="serial");
    if(typeof msgIn.timestamp == "number") now = msgIn.timestamp; // when the message was received (ms): the time of what has no timestamp

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
            // Dashboard: a view described by its path (151-dashboardText.js)
            else if (msg.substring(0,5) == "DASH|") { if(!TELEPLOT.dashboards.receiveLine(msg)) problems++; }
            // 3D
            else if (msg.substring(0,3) == "3D|")
                _parseDataText_parse3D(msg, now, false);
            // 2D: the same shapes, written flat (x:y positions, one angle)
            else if (msg.substring(0,3) == "2D|")
                _parseDataText_parse3D(msg, now, true);
            // Attributes of a telemetry (its range), thresholds of a number telemetry
            else if (msg.substring(0,5) == "ATTR|")
                _parseDataText_parseAttributes(msg);
            else if (msg.substring(0,3) == "TH|")
                _parseDataText_parseThresholds(msg, now);
            // Answer of a device to a command (doc/telecmd.md)
            else if (msg.substring(0,4) == "ACK|")
                _parseDataText_parseAnswer(msg, now);
            // JPG
            else if (msg.substring(0,4) == "JPG|" || msg.substring(0,4) == "PNG|")
                _parseDataText_parseImage(msg, now);
            // Data
            else {
                if(msg.trim().length > 0 && !msg.includes(":")) problems++; // Not a "name:value" line: ignored
                _parseDataText_parseVariablesData(msg, now);
            }
        }
        catch(e){ problems++; console.log(e); }
    }
    return problems;
}

// The time (s) of a sample sent at "ms" (a time written in the line) by telemetry "name", the line having arrived at "now" (s):
// as sent, or dated by the page when the device counts from its boot (BootClock, 020-connection.js)
function _parseDataText_time(ms, name, now)
{
    if(_connection_bootClock === undefined || !_connection_bootClock.enabled || !(ms < SINCE_BOOT_LIMIT)) return ms / 1000;
    return _connection_bootClock.date(ms, name, now * 1000) / 1000;
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
    let telemName = input && input.type=="serial" ? input.port+_defaultTextLogName : _defaultTextLogName;
    let logTimestamp = _parseDataText_time(parseFloat(msg.substr(1, logStart-2)), telemName, now);
    if(isNaN(logTimestamp) || !isFinite(logTimestamp)) logTimestamp = now;

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemName);
    if(telemetry.getAttribute(TELEPLOT.protocol.TELEM_ATTR_LOG) !== true) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_LOG, true);
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
    let isLog = flags.includes("log"); // Text emitted as a log (a Log view by default); "t": text emitted as a state (a value by default)
    let isStack = flags.includes("stack"); // Text that is a stack: the path of what is running ("loop/plan/search"), still a state
    let isTextFormatTelem = isLog || isStack || flags.includes('t');
    if(flags.includes("pc")) return _parseDataText_parsePointCloud(msg, now); // A point cloud: all the points are one sample
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

        if(value.length==0) {
            // A text can be empty: the state that says "nothing" (a hole in a timeline). "name:|t", or "name:1627551892437:|t"
            if(isTextFormatTelem && values.length == 1) { timestampArray.push(now); xArray.push(""); }
            continue;
        }
        let dims = value.split(":");
        // A text may hold colons ("error: motor stalled"). Its time, when it has one, is a first field that is a number; the rest is
        // the text, whatever it holds. (A text that starts with a number and a colon needs its time: "1627551892437:12:30".)
        if(isTextFormatTelem && dims.length > 1) {
            let time = /^\s*[0-9.eE+-]+\s*$/.test(dims[0]) ? _parseDataText_time(parseFloat(dims[0]), name, now) : NaN;
            if(Number.isFinite(time)) { timestampArray.push(time); xArray.push(dims.slice(1).join(":")); }
            else { timestampArray.push(now); xArray.push(value); }
            continue;
        }

        if(isXYZ) {
            if(dims.length < 3) continue;
            xArray.push(parseFloat(dims[0]));
            yArray.push(parseFloat(dims[1]));
            zArray.push(parseFloat(dims[2]));
            timestampArray.push(dims.length > 3 ? _parseDataText_time(parseFloat(dims[3]), name, now) : now);
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
                timestampArray.push(_parseDataText_time(v1, name, now)); // convert to seconds
                xArray.push(isTextFormatTelem?dims[1]:parseFloat(dims[1]));
            }
        }
        else if(dims.length == 3){ // xy timestamp
            xArray.push(parseFloat(dims[0]));
            yArray.push(parseFloat(dims[1]));
            timestampArray.push(_parseDataText_time(parseFloat(dims[2]), name, now));// this one is the timestamp we convert to seconds
        }

    }
    // Get Telemetry
    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(name);

    // Handle flags
    if(flags.includes("np")) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_AUTOPLOT, false);
    if(flags.includes("clr")) telemetry.clearData();

    if(unit.length>0) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT, unit);
    if(widgetLabel) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_VIEW_LABEL, widgetLabel); // "name,label": shown with the telemetries of the same label
    if(isTextFormatTelem && (telemetry.getAttribute(TELEPLOT.protocol.TELEM_ATTR_LOG) === true) !== isLog) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_LOG, isLog); // (the last flag used tells)
    if(isTextFormatTelem && (telemetry.getAttribute(TELEPLOT.protocol.TELEM_ATTR_STACK) === true) !== isStack) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_STACK, isStack);

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

// "%3A" -> ":" : how the names of "ATTR|" and "TH|" lines write the characters that separate their fields
function _parseDataText_unescape(text) {
    return String(text).replace(/%([0-9A-Fa-f]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/*
 * Attributes of a telemetry: "ATTR|name|key=value|key=value". They describe the telemetry, they are not samples: sent once (again
 * at will), before or after its data. In the values, % | , = : and line feeds are written %XX.
 *   min, max   the values a number is expected between (TELEM_ATTR_RANGE); one of them is enough, given empty it is forgotten
 *   unit, color, desc (a short description)
 * Commands (doc/telecmd.md):
 *   write[=type]   the page may write it (type: number, bool, text, xy, xyz, pose2d; none: the type of its data); "write=" removes it
 *   action         the page may call it; "action=" removes it
 *   step, rate (writes per second of a continuous control), hold (ms the device waits before stopping), axes=x,yaw, confirm,
 *   longpress, choices=a,b,c, title (the text of the button of an action)
 *   arg=name       the line is about an argument of the action: type, optional, default, min, max, step, unit, choices, desc
 *                  ("type=" removes the argument)
 * Throws on an unknown key (the line is counted as not understood).
 */
const _parseDataText_WRITE_KEYS = ["step", "rate", "hold", "axes", "confirm", "longpress"];
const _parseDataText_ARG_KEYS = ["type", "optional", "default", "min", "max", "step", "unit", "choices", "desc"];

function _parseDataText_parseAttributes(msg)
{
    const P = TELEPLOT.protocol;
    let parts = msg.substring(5).split("|");
    let name = parts.shift();
    if(name === undefined || name.length == 0) throw new Error("Attributes: ATTR|name|key=value");
    let options = [];
    for(let part of parts) {
        if(part.trim() === "") continue;
        let at = part.indexOf("=");
        let key = (at < 0 ? part : part.substring(0, at)).trim();
        let raw = at < 0 ? undefined : part.substring(at + 1).trim(); // undefined: the key alone ("write", "confirm")
        options.push([key, raw]);
    }
    let text = (raw) => raw === undefined ? "" : _parseDataText_unescape(raw);
    let number = (key, raw) => {
        let value = text(raw);
        if(value === "") return undefined;
        let n = Number(value);
        if(!Number.isFinite(n)) throw new Error("Attribute " + key + " needs a number");
        return n;
    };
    let flag = (raw) => raw === undefined || !["0", "false", "no"].includes(text(raw).toLowerCase());
    let list = (raw) => raw === undefined || raw === "" ? undefined : raw.split(",").map((v) => _parseDataText_unescape(v).trim()).filter((v) => v !== "");
    let type = (raw) => {
        let value = text(raw).toLowerCase();
        if(!P.WRITE_TYPES.includes(value)) throw new Error("Unknown type : " + value + " (number, bool, text, xy, xyz, pose2d)");
        return value;
    };
    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(name);

    // An argument of an action
    let argOption = options.find(([key]) => key === "arg");
    if(argOption !== undefined) {
        let argName = text(argOption[1]).trim();
        if(argName === "") throw new Error("Argument: arg=name");
        let args = (telemetry.getAttribute(P.TELEM_ATTR_ARGS) || []).slice();
        let index = args.findIndex((a) => a.name === argName);
        let arg = Object.assign({ name: argName, type: "number", optional: false }, index >= 0 ? args[index] : {});
        for(let [key, raw] of options) {
            if(key === "arg") continue;
            if(!_parseDataText_ARG_KEYS.includes(key)) throw new Error("Unknown attribute of an argument : " + key);
            if(key === "type") {
                if(raw !== undefined && text(raw) === "") { arg = undefined; break; } // "type=": the argument is removed
                arg.type = type(raw);
            }
            else if(key === "optional") arg.optional = flag(raw);
            else if(key === "min" || key === "max" || key === "step") arg[key] = number(key, raw);
            else if(key === "choices") arg.choices = list(raw);
            else arg[key] = text(raw); // default, unit, desc
        }
        if(arg === undefined) { if(index >= 0) args.splice(index, 1); }
        else if(index >= 0) args[index] = arg;
        else args.push(arg);
        telemetry.setAttribute(P.TELEM_ATTR_ARGS, args.length ? args : undefined);
        return;
    }

    // A line is taken as a whole: a key that is not known, and nothing of it is applied
    for(let [key] of options) {
        if(!["min", "max", "unit", "color", "desc", "title", "choices", "write", "action"].includes(key) && !_parseDataText_WRITE_KEYS.includes(key)) throw new Error("Unknown attribute : " + key);
    }
    let range = undefined, write = undefined, writeChanged = false;
    let current = telemetry.getAttribute(P.TELEM_ATTR_WRITE);
    for(let [key, raw] of options) {
        if(key === "min" || key === "max") {
            if(range === undefined) range = Object.assign({ min: undefined, max: undefined }, telemetry.getAttribute(P.TELEM_ATTR_RANGE));
            range[key] = number(key, raw);
        }
        else if(key === "unit") telemetry.setAttribute(P.TELEM_ATTR_UNIT, text(raw));
        else if(key === "color") telemetry.setAttribute(P.TELEM_ATTR_COLOR, text(raw) || undefined);
        else if(key === "desc") telemetry.setAttribute(P.TELEM_ATTR_DESC, text(raw) || undefined);
        else if(key === "title") telemetry.setAttribute(P.TELEM_ATTR_TITLE, text(raw) || undefined);
        else if(key === "choices") telemetry.setAttribute(P.TELEM_ATTR_CHOICES, list(raw));
        else if(key === "write" || key === "action") {
            writeChanged = true;
            if(raw !== undefined && raw === "") { write = null; continue; } // "write=", "action=": no more
            write = Object.assign({}, write || current, { kind: key === "write" ? "setting" : "action", type: key === "write" && raw !== undefined ? type(raw) : "" });
        }
        else if(_parseDataText_WRITE_KEYS.includes(key)) {
            if(write === null) continue;
            if(write === undefined) {
                if(current === undefined) throw new Error("Attribute " + key + " needs write or action");
                write = Object.assign({}, current);
            }
            writeChanged = true;
            if(key === "axes") {
                let axes = list(raw);
                if(axes !== undefined && axes.some((a) => !P.WRITE_AXES.includes(a))) throw new Error("axes: " + P.WRITE_AXES.join(", "));
                write.axes = axes;
            }
            else if(key === "confirm" || key === "longpress") write[key] = flag(raw);
            else write[key] = number(key, raw);
        }
        else throw new Error("Unknown attribute : " + key);
    }
    if(range !== undefined) telemetry.setAttribute(P.TELEM_ATTR_RANGE, (range.min === undefined && range.max === undefined) ? undefined : range);
    if(writeChanged) telemetry.setAttribute(P.TELEM_ATTR_WRITE, write === null ? undefined : write);
}

/*
 * What a device answers to a command (doc/telecmd.md):
 *   ACK|robot.goto#21:run           ACK|robot.goto#21:ok[:result]      ACK|robot.goto#21:err:reason      a call (its id after #)
 *   ACK|robot.mode:err:motors off   a setting the device refused
 */
function _parseDataText_parseAnswer(msg, now)
{
    let body = msg.substring(4);
    let nameEnd = body.indexOf(":");
    if(nameEnd < 1) throw new Error("Answer: ACK|name#id:status");
    let target = body.substring(0, nameEnd), fields = body.substring(nameEnd + 1).split(":");
    let id = undefined, hash = target.lastIndexOf("#");
    if(hash > 0) {
        id = Number(target.substring(hash + 1));
        if(!Number.isInteger(id)) throw new Error("Answer: the id of a call is a number");
        target = target.substring(0, hash);
    }
    let status = fields.shift().trim();
    if(!["run", "ok", "err"].includes(status)) throw new Error("Answer: run, ok or err, not " + status);
    TELEPLOT.commands.__answer(TELEPLOT.datastore.getOrCreateTelemetry(target), id, status, _parseDataText_unescape(fields.join(":")), now);
}

/*
 * Thresholds of a number telemetry: "TH|name:threshold:threshold..." where a threshold is "itsName<value" (past the limit when the
 * telemetry is below) or "itsName>value" (above), with an optional color: "low<10.5,orange".
 *   TH|battery:low<10.5:empty<9.9,red
 *   TH|motor_temp:1627551892437:hot>70           a field that is only a number is the timestamp (ms) of what follows
 *   TH|motor_temp:1627551892437:hot>70;1627551899000:hot>75       several times in one line
 *   TH|battery:low<                              without value: the threshold is removed from then on
 * A threshold holds from its timestamp until another one of the same name: limits can change over time (TELEM_DATA_THRESHOLD).
 * In the names, the characters % : ; | < > , are written %XX.
 */
function _parseDataText_parseThresholds(msg, now)
{
    const P = TELEPLOT.protocol;
    let body = msg.substring(3);
    let nameEnd = body.indexOf(":");
    if(nameEnd < 1) throw new Error("Thresholds: TH|name:threshold<value");
    let telemName = body.substring(0, nameEnd);
    let timestamps = [], operators = [], values = [], names = [], colors = [];
    for(let group of body.substring(nameEnd + 1).split(";")) {
        let fields = group.split(":").filter((field) => field.trim() !== "");
        let timestamp = now;
        if(fields.length && /^[0-9.eE+-]+$/.test(fields[0].trim())) {
            let given = _parseDataText_time(parseFloat(fields.shift()), telemName, now);
            if(Number.isFinite(given)) timestamp = given;
        }
        for(let field of fields) {
            let match = /^([^<>]*)([<>])([^,]*)(?:,(.*))?$/.exec(field);
            let name = match ? _parseDataText_unescape(match[1]).trim() : "";
            if(name === "") throw new Error("Threshold: name<value or name>value, got " + field);
            let text = match[3].trim(), value = text === "" ? NaN : Number(text);
            if(text !== "" && !Number.isFinite(value)) throw new Error("Threshold " + name + " needs a number");
            timestamps.push(timestamp);
            operators.push(match[2] === ">" ? P.THRESHOLD_ABOVE : P.THRESHOLD_BELOW);
            values.push(value);
            names.push(name);
            colors.push(match[4] === undefined ? "" : _parseDataText_unescape(match[4]).trim());
        }
    }
    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemName);
    if(timestamps.length) telemetry.addData(P.SECTION_TYPE_TELEM_DATA_THRESHOLD, timestamps, [operators, values, names, colors]);
}

// A point cloud (lidar scan...): every point of the line belongs to one sample.
//   name:x:y:z;x:y:z;...|pc                points in the frame of the sensor (a 2D scan sets z to 0)
//   name:1627551892437;x:y:z;x:y:z|pc      a field alone is the timestamp of the cloud (ms)
//   x:y:z:i  x:y:z:r:g:b  x:y:z:i:r:g:b    optional intensity and / or color (0 to 255) of each point, the same for the whole line
// The pose of the sensor is given like the one of a shape: 3D|name:P:x:y:z:R:roll:pitch:yaw (or Q:...)
function _parseDataText_parsePointCloud(msg, now)
{
    let startIdx = msg.indexOf(':');
    let endIdx = msg.lastIndexOf('|');
    let [name, widgetLabel] = _parseDataText_separateWidgetAndLabel(msg.substr(0, startIdx));
    let flags = msg.substr(endIdx + 1);
    let unit = "";
    let unitIdx = msg.indexOf('§');
    if(unitIdx != -1) { unit = msg.substring(unitIdx + 1, endIdx); endIdx = unitIdx; }

    let fields = msg.substring(startIdx + 1, endIdx).split(';').filter((field) => field.length > 0).map((field) => field.split(':'));
    let timestamp = now;
    if(fields.length && fields[0].length == 1) { // A field alone: the timestamp
        let given = _parseDataText_time(parseFloat(fields.shift()[0]), name, now);
        if(Number.isFinite(given)) timestamp = given;
    }
    let width = fields.length ? fields[0].length : 3; // Values per point: 3 (x, y, z), 4 (+ intensity), 6 (+ r, g, b) or 7 (+ intensity, r, g, b)
    if(![3, 4, 6, 7].includes(width) || fields.some((point) => point.length != width)) throw new Error("Point cloud: every point must have the same 3, 4, 6 or 7 values");
    let count = fields.length;
    let positions = new Float32Array(count * 3);
    let intensities = (width == 4 || width == 7) ? new Float32Array(count) : null;
    let colors = width >= 6 ? new Uint8Array(count * 3) : null;
    for(let i = 0; i < count; i++) {
        let point = fields[i];
        positions[i*3] = parseFloat(point[0]); positions[i*3+1] = parseFloat(point[1]); positions[i*3+2] = parseFloat(point[2]);
        if(intensities) intensities[i] = parseFloat(point[3]);
        if(colors) for(let c = 0; c < 3; c++) colors[i*3+c] = Math.max(0, Math.min(255, Math.round(parseFloat(point[width - 3 + c])) || 0));
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(name);
    if(flags.includes("np")) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_AUTOPLOT, false);
    if(flags.includes("clr")) telemetry.clearData();
    if(unit.length > 0) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT, unit);
    if(widgetLabel) telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_VIEW_LABEL, widgetLabel);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_POINT_CLOUD, [timestamp], [[positions], [intensities], [colors]]);
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
        if(timestamp !== now && timestamp * 1000 < SINCE_BOOT_LIMIT) timestamp = _parseDataText_time(timestamp * 1000, name, now); // (the time sent: fragments are put together by it)
        telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE, [timestamp], [[typeCode],[fullB64]]);
    }

}

/*
 * 3D shapes: "3D|name:timestamp:properties|flags" (timestamp and flags optional, several "timestamp:properties" can be separated by ";").
 * Properties are names followed by their values, all separated by ":" (ex: "S:cube:P:1:2:0.5:C:red"). Values can be quoted ("..." or '...')
 * to contain separators (urls). A value left empty keeps what the shape had (ex: "P::2:" only moves along y).
 *   shape/S (cube, sphere, cylinder, stl)   url/U (stl file)   position/P x:y:z   rotation/R roll:pitch:yaw (rad)   quaternion/Q x:y:z:w
 *   color/C   opacity/O (0 to 1)   texture/T type:value (url:"http://..." or telem:imageTelemetryName)
 *   scale/SC x:y:z (the size along the axes of the shape; every shape is 1 by default, an STL file in its own units: SC multiplies it;
 *   one value alone = the same on every axis, two = x and y, an empty value keeps what the shape had)   radius/RA (sphere, cylinder: SC
 *   of twice that on every axis)   width/W (x), depth/D (y), height/H (z; y in a "2D|" line): the same as SC, one axis each (V1)
 *   precision/PR (accepted, unused)
 * Camera of an image telemetry (the line is addressed to the name of the image telemetry; P and R/Q give where the camera is):
 *   intrinsics/K fx:fy:cx:cy:width:height (pinhole model, pixels)   distortion/DC k1:k2:p1:p2:k3
 * Flat shapes and what they need:
 *   shape/S also takes rect, circle, line, polygon, arrow, text
 *   points/PT x:y:z:x:y:z... (line, polygon: as many as needed, in the frame of the shape)   vector/V x:y:z (arrow, from its position)
 *   text/TX   linewidth/LW (in the units of the frame; not given: as thin as the screen draws)   textsize/TS (height of a text, same)
 * Frames: frame/F name (positions are relative to the pose of that telemetry)   pixels/FPX name (positions are pixels of the pictures
 *   of that image telemetry: u to the right, v down)
 * "2D|name:..." lines are the same, written flat: position/P x:y, rotation/R angle (around z), width/W (x) and height/H (y),
 * points/PT x:y:x:y..., vector/V x:y. They give the same telemetries with z = 0 (a rect by default instead of a cube).
 * A shape is a telemetry: each property goes to the data type (or attribute) the binary protocol has for it, so both protocols give the same thing.
 */
const _parseDataText_3DProperties = {
    shape: ["type", 1], S: ["type", 1], url: ["url", 1], U: ["url", 1],
    position: ["position", 3], P: ["position", 3], rotation: ["rotation", 3], R: ["rotation", 3], quaternion: ["quaternion", 4], Q: ["quaternion", 4],
    color: ["color", 1], C: ["color", 1], opacity: ["opacity", 1], O: ["opacity", 1], texture: ["texture", 2], T: ["texture", 2],
    width: ["width", 1], W: ["width", 1], depth: ["depth", 1], D: ["depth", 1], height: ["height", 1], H: ["height", 1],
    scale: ["scale", "*"], SC: ["scale", "*"], radius: ["radius", 1], RA: ["radius", 1], precision: ["precision", 1], PR: ["precision", 1],
    intrinsics: ["intrinsics", 6], K: ["intrinsics", 6], distortion: ["distortion", 5], DC: ["distortion", 5],
    points: ["points", "*"], PT: ["points", "*"], vector: ["vector", 3], V: ["vector", 3], text: ["text", 1], TX: ["text", 1],
    linewidth: ["lineWidth", 1], LW: ["lineWidth", 1], textsize: ["textSize", 1], TS: ["textSize", 1],
    frame: ["frame", 1], F: ["frame", 1], pixels: ["pixels", 1], FPX: ["pixels", 1]
};
const _parseDataText_2DCounts = { position: 2, rotation: 1, vector: 2 }; // In a "2D|" line these take fewer values
const _parseDataText_shapeTypes = { cube: 0, sphere: 1, cylinder: 2, rect: 3, circle: 4, line: 5, polygon: 6, arrow: 7, text: 8, stl: 10 };

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
function _parseDataText_parse3DProperties(tokens, flat=false) {
    let properties = {};
    for(let i = 0; i < tokens.length;) {
        let name = tokens[i++];
        if(name === "") continue;
        let info = _parseDataText_3DProperties[name];
        if(info === undefined) throw new Error("Invalid shape property : " + name);
        let values = [];
        let count = flat && _parseDataText_2DCounts[info[0]] !== undefined ? _parseDataText_2DCounts[info[0]] : info[1];
        if(count === "*") { // As many values as there are, up to the next property
            while(i < tokens.length && _parseDataText_3DProperties[tokens[i]] === undefined) { values.push(tokens[i] !== "" ? tokens[i] : undefined); i++; }
        }
        else for(let n = 0; n < count; n++, i++) values.push(i < tokens.length && tokens[i] !== "" ? tokens[i] : undefined);
        properties[info[0]] = values;
    }
    return properties;
}

function _parseDataText_parse3D(msg, now, flat=false)
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
            let t = _parseDataText_time(parseFloat(tokens.shift()), name, now);
            if(!isNaN(t) && isFinite(t)) timestamp = t;
        }
        let properties = _parseDataText_parse3DProperties(tokens, flat);
        if(flat) { // Written flat: the same properties, with z left as it is
            if(properties.position !== undefined) properties.position = [properties.position[0], properties.position[1], undefined];
            if(properties.rotation !== undefined) properties.rotation = [undefined, undefined, properties.rotation[0]];
            if(properties.vector !== undefined) properties.vector = [properties.vector[0], properties.vector[1], undefined];
            if(properties.height !== undefined) { properties.depth = properties.height; delete properties.height; } // H is the extent along y
            // A shape that was never described is a rectangle (a cube in a "3D|" line)
            let describes = Object.keys(properties).some((name) => name !== "frame" && name !== "pixels"); // (a line that only gives a frame may be about a point or a cloud)
            if(describes && properties.type === undefined && telemetry.getAttribute(P.TELEM_ATTR_SHAPE) === undefined) telemetry.setAttribute(P.TELEM_ATTR_SHAPE, { type: P.TELEM_ATTR_SHAPE_TYPE_RECT, data: "" });
        }

        if(properties.type !== undefined || properties.url !== undefined) {
            let shape = Object.assign({ type: flat ? P.TELEM_ATTR_SHAPE_TYPE_RECT : P.TELEM_ATTR_SHAPE_TYPE_CUBE, data: "" }, telemetry.getAttribute(P.TELEM_ATTR_SHAPE));
            if(properties.type !== undefined && properties.type[0] !== undefined) {
                let type = _parseDataText_shapeTypes[properties.type[0].toLowerCase()];
                if(type === undefined) throw new Error("Invalid shape type : " + properties.type[0]);
                shape.type = type;
            }
            if(properties.url !== undefined && properties.url[0] !== undefined) shape.data = properties.url[0];
            telemetry.setAttribute(P.TELEM_ATTR_SHAPE, shape);
        }
        // Frame: what the positions are relative to (given empty: back to the scene)
        if(properties.frame !== undefined || properties.pixels !== undefined) {
            let name = properties.pixels !== undefined ? properties.pixels[0] : properties.frame[0];
            telemetry.setAttribute(P.TELEM_ATTR_FRAME, name === undefined ? undefined : { type: properties.pixels !== undefined ? P.FRAME_TYPE_PIXELS : P.FRAME_TYPE_POSE, name: name });
        }
        if(properties.points !== undefined) { // The points of a line or a polygon: one sample holds them all, as a point cloud does
            let width = flat ? 2 : 3, values = properties.points.map((v) => v === undefined ? NaN : parseFloat(v));
            if(values.length % width !== 0 || values.some((v) => isNaN(v))) throw new Error("Points need " + (flat ? "x:y" : "x:y:z") + " for each of them");
            let positions = new Float32Array(values.length / width * 3);
            for(let i = 0; i < values.length / width; i++) { positions[i*3] = values[i*width]; positions[i*3+1] = values[i*width+1]; positions[i*3+2] = flat ? 0 : values[i*width+2]; }
            telemetry.addData(P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD, [timestamp], [[positions], [null], [null]]);
        }
        if(properties.vector !== undefined) {
            put(P.SECTION_TYPE_TELEM_DATA_SHAPE_VECTOR, timestamp, merge(latest(P.SECTION_TYPE_TELEM_DATA_SHAPE_VECTOR, [0, 0, 0]), properties.vector));
        }
        if(properties.text !== undefined) put(P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXT, timestamp, [properties.text[0] === undefined ? "" : properties.text[0]]);
        if(properties.lineWidth !== undefined) {
            let width = parseFloat(properties.lineWidth[0]);
            if(!isNaN(width)) put(P.SECTION_TYPE_TELEM_DATA_SHAPE_LINE_WIDTH, timestamp, [Math.max(0, width)]);
        }
        if(properties.textSize !== undefined) { // The height of a text is its size
            let size = parseFloat(properties.textSize[0]);
            if(!isNaN(size)) put(P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE, timestamp, [size, size, size]);
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
        if(properties.scale !== undefined || properties.radius !== undefined || properties.width !== undefined || properties.depth !== undefined || properties.height !== undefined) {
            let size = latest(P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE, [1, 1, 1]);
            let radius = properties.radius !== undefined ? parseFloat(properties.radius[0]) : NaN;
            if(!isNaN(radius)) size = [radius * 2, radius * 2, radius * 2]; // The size of a shape is its extent along each axis
            if(properties.scale !== undefined) { // x:y:z, x:y (z kept), or one value for every axis
                let scale = properties.scale;
                if(scale.length > 3 || scale.some((v) => v !== undefined && isNaN(parseFloat(v)))) throw new Error("Scale: SC:x:y:z, SC:x:y or SC:s (numbers)");
                size = merge(size, scale.length == 1 ? [scale[0], scale[0], scale[0]] : scale);
            }
            let sides = [properties.width, properties.depth, properties.height].map((p) => p === undefined ? undefined : p[0]); // x, y, z
            put(P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE, timestamp, merge(size, sides));
        }
    }
}
