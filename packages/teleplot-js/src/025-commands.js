/*
 * Commands (telecmd): the page writes settings and calls actions of the devices. Spec: doc/telecmd.md.
 * - A setting is a writable telemetry (TELEM_ATTR_WRITE kind "setting"): the page sends the line the device would send, and the
 *   device's echo (a new sample equal to it) is the acknowledgement. Requests are resent until then, and end applied, not applied
 *   (the device kept something else), refused (it answered err) or without answer.
 * - An action (kind "action") is called with named, typed arguments (TELEM_ATTR_ARGS); the device answers run, then ok or err.
 *   Its answers are stored as log samples of the action ("#21 run", "#21 ok", "#21 err unreachable"): calls() reads them back.
 * - A continuous setting (rate and hold) is driven by hold() / release(): its value is sent "rate" times per second.
 * Nothing is sent while TELEPLOT.state.commands is false (the CMD button of the webapp), nor while paused (no echo could be read).
 * What the page sends is also logged as the text telemetry "commands.sent" (source "page"): the conversation can be displayed and
 * exported like the rest. The work (resends, echoes, holds) is done by the update loop (998), never on the ingestion path.
 */
const _commands_RESEND_MS = 250;   // A request not yet answered is sent again this often...
const _commands_TIMEOUT_MS = 2000; // ...for this long
const _commands_SHOWN_MS = 2000;   // An applied request is shown that long, then forgotten
const _commands_REST_COUNT = 3;    // A released continuous control sends its rest value that many times
const _commands_HISTORY = 500;     // Requests kept per telemetry (for timelines)
const _commands_LOG_NAME = "commands.sent";

let _commands_requests = new Map(); // telemetry id -> the latest request of a setting
let _commands_calls = new Map();    // telemetry id -> Map call id -> call made by this page
let _commands_history = new Map();  // telemetry id -> [request or call], oldest first
let _commands_holds = new Map();    // telemetry id -> {telemetry, getValue, sentAt, rest}
let _commands_refusals = new Map(); // telemetry id -> {reason, at (ms)}: the latest err of a continuous setting (it has no request)
const _commands_REFUSAL_MS = 1500;  // A continuous setting is refused while errs keep coming: this long after the last one
let _commands_nextId = 1 + Math.floor(Math.random() * 60000); // Call ids: a page that reloads does not reuse those of the previous one

TELEPLOT.commands = {
    keyboardCaptured: false, // A joystick view that has the focus drives with the keyboard: the page's own shortcuts keep quiet meanwhile
};

// ---------------------------------------------------------------------------------------------------------- what can be written

// The declaration of a telemetry, with its type worked out: {kind, type, step, rate, hold, axes, confirm, longpress, choices}, or undefined
TELEPLOT.commands.declaration = function(telem) {
    const P = TELEPLOT.protocol;
    let write = telem && telem.getAttribute(P.TELEM_ATTR_WRITE);
    if(!write) return undefined;
    let choices = telem.getAttribute(P.TELEM_ATTR_CHOICES);
    return Object.assign({}, write, { type: write.kind === "action" ? "" : (write.type || _commands_typeOfData(telem, choices)), choices });
}

// The type of what a setting holds, from its data when it was not declared
function _commands_typeOfData(telem, choices) {
    const P = TELEPLOT.protocol;
    if(choices && choices.length) return "text";
    if(telem.data[P.SECTION_TYPE_TELEM_DATA_NUMBER_3D]) return "xyz";
    if(telem.data[P.SECTION_TYPE_TELEM_DATA_NUMBER_2D]) return "xy";
    if(telem.data[P.SECTION_TYPE_TELEM_DATA_TEXT]) return "text";
    return "number";
}

// The data type a device publishes for a type of setting (where its echo is)
TELEPLOT.commands.dataTypeOf = function(type) {
    const P = TELEPLOT.protocol;
    return { text: P.SECTION_TYPE_TELEM_DATA_TEXT, xy: P.SECTION_TYPE_TELEM_DATA_NUMBER_2D, xyz: P.SECTION_TYPE_TELEM_DATA_NUMBER_3D, pose2d: P.SECTION_TYPE_TELEM_DATA_NUMBER_3D }[type] || P.SECTION_TYPE_TELEM_DATA_NUMBER;
}

TELEPLOT.commands.isWritable = (telem) => { let d = TELEPLOT.commands.declaration(telem); return d !== undefined && d.kind === "setting"; };
TELEPLOT.commands.isAction = (telem) => { let d = TELEPLOT.commands.declaration(telem); return d !== undefined && d.kind === "action"; };
TELEPLOT.commands.isContinuous = (telem) => { let d = TELEPLOT.commands.declaration(telem); return d !== undefined && d.kind === "setting" && d.rate > 0 && d.hold > 0; };
TELEPLOT.commands.args = (telem) => (telem && telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_ARGS)) || [];

// The connection a telemetry came from, undefined when it has none any more (or never had: a file)
TELEPLOT.commands.connectionOf = function(telem) {
    if(!telem || telem.sourceId === undefined) return undefined;
    return TELEPLOT.connection.connections.find((c) => c.id === telem.sourceId);
}

// Why a telemetry cannot be written or called now ("" when it can)
TELEPLOT.commands.whyNot = function(telem) {
    if(!TELEPLOT.commands.declaration(telem)) return "Not writable";
    if(!TELEPLOT.state.commands) return "Commands are off (CMD)";
    if(TELEPLOT.state.isPaused) return "Paused: the answers of the devices are not read";
    let connection = TELEPLOT.commands.connectionOf(telem);
    if(connection === undefined) return telem.sourceId === undefined ? "From a file: there is no device to send it to" : "Its source is gone";
    if(typeof connection.whyNotWritable !== "function") return "This source cannot send anything back";
    return connection.whyNotWritable();
}
TELEPLOT.commands.canWrite = (telem) => TELEPLOT.commands.whyNot(telem) === "";

// Switches commands on or off (the CMD button). Off releases every continuous control.
TELEPLOT.commands.setEnabled = function(on) {
    if(!on) for(let hold of [..._commands_holds.values()]) TELEPLOT.commands.release(hold.telemetry); // (while it can still be sent)
    TELEPLOT.state.commands = !!on;
}

// Someone tried to use a command (a joystick, the value of a setting) while commands are off: true then, and the hooks are told (the
// webapp shows its CMD button). Nothing is sent: the view says so where it was touched, with a button to switch commands on. False
// while they are on: the view goes on.
TELEPLOT.commands.onBlockedHooks = [];
TELEPLOT.commands.blockedWhileOff = function(telem) {
    if(TELEPLOT.state.commands) return false;
    for(let hook of TELEPLOT.commands.onBlockedHooks) {
        try { hook(telem); }
        catch(e) { console.error("Teleplot commands hook failed:", e); }
    }
    return true;
}
// How long a view says that commands are off, after a try (ms)
TELEPLOT.commands.OFF_NOTICE_TIME = 4000;

// What can be commanded, per device: {settings, actions, devices: [{name, settings, actions}]}
TELEPLOT.commands.summary = function() {
    let summary = { settings: 0, actions: 0, devices: [] };
    for(let id in TELEPLOT.datastore.telemetries) {
        let telem = TELEPLOT.datastore.telemetries[id];
        let declaration = TELEPLOT.commands.declaration(telem);
        if(!declaration) continue;
        let name = TELEPLOT.commands.deviceName(telem);
        let device = summary.devices.find((d) => d.name === name);
        if(!device) summary.devices.push(device = { name, settings: 0, actions: 0 });
        if(declaration.kind === "action") { device.actions++; summary.actions++; }
        else { device.settings++; summary.settings++; }
    }
    return summary;
}

// A name for the device a telemetry comes from: the client name (binary), else the source, with the sender address when it has several
TELEPLOT.commands.deviceName = function(telem) {
    let client = telem.clientId >= 0 ? TELEPLOT.clients.getClient(telem.clientId) : undefined;
    if(client && client.name) return client.name;
    let connection = TELEPLOT.commands.connectionOf(telem);
    if(!connection) return telem.sourceId === undefined ? "Files" : "Gone";
    let address = connection.senders && telem.endpoint !== undefined ? connection.senders[telem.endpoint] : undefined;
    return address ? address : (connection.name || connection.type);
}

// The name the device knows a telemetry by
function _commands_name(telem) {
    let name = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME);
    return name !== undefined ? name : String(telem.id);
}

// ---------------------------------------------------------------------------------------------------------- values

// A value of a type, from what a field holds (a text, or the value itself): {value} or {error}
TELEPLOT.commands.parseValue = function(type, input, limits={}) {
    let count = { xy: 2, xyz: 3, pose2d: 3 }[type];
    if(count) {
        let parts = Array.isArray(input) ? input : String(input).split(/[,;\s]+/).filter((p) => p !== "");
        let values = parts.map(Number);
        if(values.length !== count || values.some((v) => !Number.isFinite(v))) return { error: count + " numbers" };
        return { value: values };
    }
    if(type === "bool") {
        if(input === true || input === 1 || input === "1" || String(input).toLowerCase() === "true" || String(input).toLowerCase() === "on") return { value: 1 };
        if(input === false || input === 0 || input === "0" || String(input).toLowerCase() === "false" || String(input).toLowerCase() === "off") return { value: 0 };
        return { error: "on or off" };
    }
    if(type === "text") {
        let text = String(input);
        if(limits.choices && limits.choices.length && !limits.choices.includes(text)) return { error: "One of " + limits.choices.join(", ") };
        return { value: text };
    }
    let value = typeof input === "number" ? input : (String(input).trim() === "" ? NaN : Number(input));
    if(!Number.isFinite(value)) return { error: "A number" };
    let range = limits.range || {};
    if((range.min !== undefined && value < range.min) || (range.max !== undefined && value > range.max)) {
        return { error: "Between " + (range.min !== undefined ? range.min : "-∞") + " and " + (range.max !== undefined ? range.max : "∞") };
    }
    return { value };
}

// Two values of a type are the same (the echo of a request): within step / 2, else as equal as a float32 can tell
function _commands_same(type, a, b, step) {
    if(type === "text") return String(a) === String(b);
    let as = Array.isArray(a) ? a : [a], bs = Array.isArray(b) ? b : [b];
    if(as.length !== bs.length) return false;
    for(let i = 0; i < as.length; i++) {
        let x = Number(as[i]), y = Number(bs[i]);
        let equal = step > 0 ? Math.abs(x - y) <= step / 2 + 1e-12 : (Math.fround(x) === Math.fround(y) || Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x)));
        if(!equal) return false;
    }
    return true;
}

// The value a device last reported for a setting, and when it came (ms): {value, at} or undefined
TELEPLOT.commands.reported = function(telem) {
    let declaration = TELEPLOT.commands.declaration(telem);
    if(!declaration) return undefined;
    let entry = telem.data[TELEPLOT.commands.dataTypeOf(declaration.type)];
    if(!entry || !entry.timestamps.length) return undefined;
    let last = entry.timestamps.length - 1;
    let value = entry.data.length === 1 ? entry.data[0][last] : entry.data.map((channel) => channel[last]);
    return { value, at: entry.lastUpdate, timestamp: entry.timestamps[last] };
}

// ---------------------------------------------------------------------------------------------------------- encoding

const _commands_ESCAPE = /[%:,=|\n\r]/g;
const _commands_escape = (text) => String(text).replace(_commands_ESCAPE, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
const _commands_number = (n) => String(Number(n));

// The line of the text protocol that writes a setting: "kp:0.42", "goal:1.2:3.4", "name:rover%3A2"
TELEPLOT.commands.settingLine = function(telem, type, value) {
    let text = Array.isArray(value) ? value.map(_commands_number).join(":") : (type === "text" ? String(value).replace(/[%\n\r]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")) : _commands_number(value));
    return _commands_name(telem) + ":" + text;
}

// The line of the text protocol that calls an action: "!robot.goto#21:target=3.8,2,0.5:speed=1"
TELEPLOT.commands.callLine = function(telem, id, values) {
    let line = "!" + _commands_name(telem) + "#" + id;
    for(let arg of TELEPLOT.commands.args(telem)) {
        if(!(arg.name in values)) continue;
        let value = values[arg.name];
        line += ":" + _commands_escape(arg.name) + "=" + (Array.isArray(value) ? value.map(_commands_number).join(",") : (arg.type === "text" ? _commands_escape(value) : _commands_number(value)));
    }
    return line;
}

// Does the device of a telemetry speak the binary protocol ? (it does when its telemetries have a client id)
function _commands_binary(telem) {
    return telem.clientId >= 0 && telem.clientId !== TELEPLOT.protocol.CLIENT_ID_NAMED;
}

// A packet of the binary protocol for the device of a telemetry: header, sections written by fn(writer, telemId), checksum
function _commands_packet(telem, fn) {
    const P = TELEPLOT.protocol;
    let w = new _files_Writer();
    w.u8(P.BINARY_MARKER).u8(P.BINARY_VERSION).u16(telem.clientId);
    fn(w, telem.id - telem.clientId * 0x10000);
    w.u16(0); // Checksum: not checked yet
    return w.take();
}

function _commands_writeValue(w, type, value, wide) {
    if(type === "text") return w.str(String(value).replace(/\u0000/g, ""));
    if(type === "bool" && wide) return w.u8(value ? 1 : 0);
    for(let v of (Array.isArray(value) ? value : [value])) wide ? w.f64(Number(v)) : w.f32(Number(v));
}

TELEPLOT.commands.settingPacket = function(telem, type, value) {
    return _commands_packet(telem, (w, telemId) => {
        w.u8(TELEPLOT.commands.dataTypeOf(type)).u16(telemId).u64(0).u8(1).u32(0);
        _commands_writeValue(w, type, value, false);
    });
}

TELEPLOT.commands.callPacket = function(telem, id, values) {
    let args = TELEPLOT.commands.args(telem);
    let given = args.map((arg, index) => [arg, index]).filter(([arg]) => arg.name in values);
    return _commands_packet(telem, (w, telemId) => {
        w.u8(TELEPLOT.protocol.SECTION_TYPE_CALL).u16(telemId).u16(id).u8(given.length);
        for(let [arg, index] of given) { w.u8(index); _commands_writeValue(w, arg.type, values[arg.name], true); }
    });
}

// Sends a command to the device of a telemetry, in the protocol it speaks. Returns true when it went out.
function _commands_send(telem, line, packet) {
    if(!TELEPLOT.commands.canWrite(telem)) return false;
    let connection = TELEPLOT.commands.connectionOf(telem);
    let message = { telemetry: telem, text: line };
    if(_commands_binary(telem) && connection.type !== "serial") { message.bytes = packet(); delete message.text; }
    return connection.write(message) === true;
}

// The conversation, as a log telemetry of the page ("commands.sent"): what was sent, as text lines
function _commands_log(line, time) {
    if(TELEPLOT.state.isPaused) return;
    TELEPLOT.datastore.withSource("page", () => {
        let telem = TELEPLOT.datastore.getOrCreateTelemetry(_commands_LOG_NAME);
        if(telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_LOG) !== true) telem.setAttribute(TELEPLOT.protocol.TELEM_ATTR_LOG, true);
        telem.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT, [time / 1000], [[line]]);
    });
}

function _commands_remember(telem, record) {
    let list = _commands_history.get(telem.id);
    if(!list) _commands_history.set(telem.id, list = []);
    list.push(record);
    if(list.length > _commands_HISTORY) list.splice(0, list.length - _commands_HISTORY);
}

// ---------------------------------------------------------------------------------------------------------- settings

// Asks a device to set a setting. value: of the type of the setting (a number, 0 / 1, a text, [x, y], [x, y, yaw]) or a text to
// read. Returns "" when the request was made, else why not. The state of the request: request(telem).
TELEPLOT.commands.write = function(telem, input) {
    let reason = TELEPLOT.commands.whyNot(telem);
    if(reason) return reason;
    let declaration = TELEPLOT.commands.declaration(telem);
    if(declaration.kind !== "setting") return "Not a setting";
    let parsed = TELEPLOT.commands.parseValue(declaration.type, input, { range: telem.getRange(), choices: declaration.choices });
    if(parsed.error) return parsed.error;
    let now = Date.now();
    let previous = _commands_requests.get(telem.id);
    let request = { telemetry: telem, type: declaration.type, step: declaration.step, target: parsed.value, status: "pending", reason: "",
        notBefore: 0, firstSentAt: 0, sentAt: 0, tries: 0, reported: undefined, endedAt: 0, t: now / 1000 };
    // Throttled: not more often than "rate" per second (20 when not declared); the latest value waits for the update loop
    let interval = 1000 / (declaration.rate > 0 ? declaration.rate : 20);
    if(previous && previous.tries === 0 && previous.status === "pending") request.notBefore = previous.notBefore; // (the one waiting is replaced)
    else if(previous && previous.sentAt > 0 && now - previous.sentAt < interval) request.notBefore = previous.sentAt + interval;
    else _commands_sendRequest(request, now);
    _commands_requests.set(telem.id, request);
    _commands_remember(telem, request);
    return "";
}

function _commands_sendRequest(request, now) {
    let telem = request.telemetry;
    let line = TELEPLOT.commands.settingLine(telem, request.type, request.target);
    if(!_commands_send(telem, line, () => TELEPLOT.commands.settingPacket(telem, request.type, request.target))) return false;
    if(request.tries === 0) { _commands_log(line, now); request.firstSentAt = now; }
    request.sentAt = now;
    request.tries++;
    return true;
}

// The latest request of a setting: {target, status ("pending", "applied", "kept", "refused", "noanswer"), reason, reported}, or
// undefined when nothing is asked (anymore)
TELEPLOT.commands.request = function(telem) {
    return telem ? _commands_requests.get(telem.id) : undefined;
}

// Forgets the request of a setting (a not applied or refused one stays until then, or until the next write)
TELEPLOT.commands.dismiss = function(telem) {
    _commands_requests.delete(telem.id);
}

// What the page asked a telemetry (settings: requests; actions: calls), oldest first: for timelines
TELEPLOT.commands.history = function(telem) {
    return (telem && _commands_history.get(telem.id)) || [];
}

function _commands_checkRequest(request, now) {
    let telem = request.telemetry;
    if(request.status !== "pending") {
        if(request.status === "applied" && now - request.endedAt > _commands_SHOWN_MS && _commands_requests.get(telem.id) === request) _commands_requests.delete(telem.id);
        return;
    }
    if(request.tries === 0) { // Waiting for its turn (throttled), or could not be sent yet
        if(now < request.notBefore) return;
        if(!_commands_sendRequest(request, now)) Object.assign(request, { status: "noanswer", reason: TELEPLOT.commands.whyNot(telem) || "Could not be sent", endedAt: now });
        return;
    }
    let reported = TELEPLOT.commands.reported(telem);
    let answered = reported !== undefined && reported.at >= request.firstSentAt;
    if(answered) request.reported = reported.value;
    if(answered && _commands_same(request.type, reported.value, request.target, request.step)) {
        request.status = "applied";
        request.endedAt = now;
        return;
    }
    if(now - request.firstSentAt > _commands_TIMEOUT_MS) {
        request.status = answered ? "kept" : "noanswer";
        request.reason = answered ? "The device keeps " + TELEPLOT.commands.formatValue(request.type, reported.value) : "No answer";
        request.endedAt = now;
        return;
    }
    if(now - request.sentAt >= _commands_RESEND_MS) _commands_sendRequest(request, now);
}

// A value as it is shown: "0.42", "on", "3.2, 2.3, 0.61"
TELEPLOT.commands.formatValue = function(type, value) {
    if(value === undefined) return "";
    if(type === "bool") return Number(value) ? "on" : "off";
    if(Array.isArray(value)) return value.map((v) => TELEPLOT.commands.formatNumber(v)).join(", ");
    return typeof value === "number" ? TELEPLOT.commands.formatNumber(value) : String(value);
}
TELEPLOT.commands.formatNumber = (v) => Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : String(v);

// ---------------------------------------------------------------------------------------------------------- actions

// Checks the arguments of a call. inputs: {name: value or text}, "" or undefined: not given. Returns {values, errors}: values to
// send (optional ones left empty are not sent), errors: {name: why} (empty when the call can be made).
TELEPLOT.commands.validate = function(telem, inputs={}) {
    let values = {}, errors = {};
    for(let arg of TELEPLOT.commands.args(telem)) {
        let input = inputs[arg.name];
        let empty = input === undefined || input === "" || (Array.isArray(input) && input.every((v) => v === "" || v === undefined));
        if(empty) { if(!arg.optional) errors[arg.name] = "Required"; continue; }
        let parsed = TELEPLOT.commands.parseValue(arg.type, input, { range: { min: arg.min, max: arg.max }, choices: arg.choices });
        if(parsed.error) errors[arg.name] = parsed.error;
        else values[arg.name] = parsed.value;
    }
    return { values, errors };
}

// Calls an action. inputs: see validate. Returns {id, reason}: reason "" when the call went out (its state: calls(telem)),
// else why it did not (the errors of the arguments are in "errors").
TELEPLOT.commands.call = function(telem, inputs={}) {
    let reason = TELEPLOT.commands.whyNot(telem);
    if(reason) return { reason };
    if(!TELEPLOT.commands.isAction(telem)) return { reason: "Not an action" };
    let { values, errors } = TELEPLOT.commands.validate(telem, inputs);
    if(Object.keys(errors).length) return { reason: "Invalid arguments", errors };
    let id = _commands_nextId;
    _commands_nextId = _commands_nextId >= 0xFFFE ? 1 : _commands_nextId + 1; // (0xFFFF: the answer to a setting)
    let now = Date.now();
    let call = { telemetry: telem, id, args: values, sent: now / 1000, sentAt: 0, firstSentAt: now, tries: 0, status: "sent", t: now / 1000 };
    let calls = _commands_calls.get(telem.id);
    if(!calls) _commands_calls.set(telem.id, calls = new Map());
    calls.set(id, call);
    _commands_remember(telem, call);
    if(!_commands_sendCall(call, now)) { call.status = "noanswer"; return { id, reason: TELEPLOT.commands.whyNot(telem) || "Could not be sent" }; }
    return { id, reason: "" };
}

function _commands_sendCall(call, now) {
    let telem = call.telemetry;
    let line = TELEPLOT.commands.callLine(telem, call.id, call.args);
    if(!_commands_send(telem, line, () => TELEPLOT.commands.callPacket(telem, call.id, call.args))) return false;
    if(call.tries === 0) _commands_log(line, now);
    call.sentAt = now;
    call.tries++;
    return true;
}

function _commands_checkCall(call, now) {
    if(call.status !== "sent") return;
    if(now - call.firstSentAt > _commands_TIMEOUT_MS) { call.status = "noanswer"; return; }
    if(now - call.sentAt >= _commands_RESEND_MS) _commands_sendCall(call, now);
}

// An answer of a device (ACK| lines, CALL_ANSWER sections). id: the call, undefined for a setting. time: seconds.
TELEPLOT.commands.__answer = function(telem, id, status, text, time) {
    if(id === undefined) { // A setting refused
        let request = _commands_requests.get(telem.id);
        if(request && status === "err" && (request.status === "pending" || request.status === "kept")) {
            Object.assign(request, { status: "refused", reason: text || "Refused", endedAt: Date.now() });
        }
        // A continuous setting (a joystick) is streamed, not requested: the device answers err to what it cannot apply, each time
        if(status === "err" && TELEPLOT.commands.isContinuous(telem)) _commands_refusals.set(telem.id, { reason: text || "Refused", at: Date.now() });
        return;
    }
    // A call: its answers are log samples of the action ("#21 run"), what calls() reads
    if(telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_LOG) !== true) telem.setAttribute(TELEPLOT.protocol.TELEM_ATTR_LOG, true);
    telem.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT, [time], [["#" + id + " " + status + (text ? " " + text : "")]]);
    let calls = _commands_calls.get(telem.id);
    let call = calls && calls.get(id);
    if(call && call.status === "sent") call.status = status === "run" ? "run" : status;
    else if(call && call.status === "run" && status !== "run") call.status = status;
}

/*
 * The calls of an action, oldest first: [{id, args, sent, run, end, status ("sent", "run", "ok", "err", "noanswer"), text}]. Read
 * from its answers (log samples "#21 run", "#21 ok text", "#21 err reason": they survive a reload, an export and an import),
 * completed with what this page sent (when and with which arguments). Times in seconds.
 */
const _commands_answers = new WeakMap(); // data entry -> {count, pruned, late, byId: Map}
TELEPLOT.commands.calls = function(telem) {
    if(!telem) return [];
    let byId = new Map();
    let entry = telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT];
    if(entry) {
        let cache = _commands_answers.get(entry);
        if(!cache || cache.pruned !== (entry.pruned || 0) || cache.late !== entry.lateInsertions || cache.count > entry.timestamps.length) {
            cache = { count: 0, pruned: entry.pruned || 0, late: entry.lateInsertions, byId: new Map() };
            _commands_answers.set(entry, cache);
        }
        for(let i = cache.count; i < entry.timestamps.length; i++) {
            let match = /^#(\d+) (run|ok|err)(?: (.*))?$/.exec(String(entry.data[0][i]));
            if(!match) continue;
            let id = Number(match[1]), at = entry.timestamps[i];
            let call = cache.byId.get(id);
            if(!call || (call.end !== undefined && match[2] === "run" && at > call.end)) cache.byId.set(id, call = { id, status: "run" }); // (an id used again later: a new call)
            if(match[2] === "run") { if(call.run === undefined) call.run = at; }
            else if(call.end === undefined) { call.end = at; call.status = match[2]; call.text = match[3] || ""; }
        }
        cache.count = entry.timestamps.length;
        for(let [id, call] of cache.byId) byId.set(id, Object.assign({}, call));
    }
    let mine = _commands_calls.get(telem.id);
    if(mine) for(let [id, sent] of mine) {
        let call = byId.get(id);
        if(call && call.run !== undefined && call.run < sent.sent - 1) continue; // (an older call of a previous page with the same id)
        byId.set(id, Object.assign(call || { id, status: sent.status }, { args: sent.args, sent: sent.sent, status: call ? call.status : sent.status }));
    }
    return [...byId.values()].sort((a, b) => _commands_callStart(a) - _commands_callStart(b));
}
const _commands_callStart = (call) => call.sent !== undefined ? call.sent : (call.run !== undefined ? call.run : call.end);

// The latest call of an action, or undefined
TELEPLOT.commands.lastCall = function(telem) {
    let calls = TELEPLOT.commands.calls(telem);
    return calls[calls.length - 1];
}

// ---------------------------------------------------------------------------------------------------------- continuous control

// Drives a continuous setting (rate and hold): getValue() is sent "rate" times per second until release(). Returns "" or why not.
TELEPLOT.commands.hold = function(telem, getValue) {
    let reason = TELEPLOT.commands.whyNot(telem);
    if(reason) return reason;
    if(!TELEPLOT.commands.isContinuous(telem)) return "Not a continuous setting (rate and hold)";
    let hold = _commands_holds.get(telem.id);
    if(hold) { hold.getValue = getValue; hold.rest = 0; return ""; }
    hold = { telemetry: telem, getValue, sentAt: 0, rest: 0 };
    _commands_holds.set(telem.id, hold);
    _commands_sendHold(hold, Date.now());
    return "";
}

// Stops driving it: the rest value (zeros) is sent a few times, then nothing (the device stops by itself after "hold" ms anyway)
TELEPLOT.commands.release = function(telem) {
    let hold = _commands_holds.get(telem.id);
    if(!hold || hold.rest > 0) return;
    hold.rest = _commands_REST_COUNT;
    _commands_sendHold(hold, Date.now());
}

// Why the device refuses a continuous setting, while its errs keep coming: {reason, at}, or undefined
TELEPLOT.commands.refusal = function(telem, now = Date.now()) {
    let refusal = telem && _commands_refusals.get(telem.id);
    return refusal && now - refusal.at < _commands_REFUSAL_MS ? refusal : undefined;
}

TELEPLOT.commands.isHeld = (telem) => { let hold = telem && _commands_holds.get(telem.id); return hold !== undefined && hold.rest === 0; };

// What a continuous setting is when nobody drives it: zeros (the middle of its range when 0 is out of it)
TELEPLOT.commands.restValue = function(telem) {
    let declaration = TELEPLOT.commands.declaration(telem);
    let count = { xy: 2, xyz: 3, pose2d: 3 }[declaration.type];
    let range = telem.getRange() || {};
    let rest = (range.min !== undefined && range.min > 0) || (range.max !== undefined && range.max < 0) ? (range.min + range.max) / 2 : 0;
    return count ? new Array(count).fill(rest) : rest;
}

function _commands_sendHold(hold, now) {
    let telem = hold.telemetry, declaration = TELEPLOT.commands.declaration(telem);
    if(!declaration) { _commands_holds.delete(telem.id); return; }
    let value = hold.rest > 0 ? TELEPLOT.commands.restValue(telem) : hold.getValue();
    let ok = TELEPLOT.state.commands && _commands_send(telem, TELEPLOT.commands.settingLine(telem, declaration.type, value), () => TELEPLOT.commands.settingPacket(telem, declaration.type, value));
    hold.sentAt = now;
    if(hold.rest > 0) { hold.rest--; if(hold.rest === 0 || !ok) _commands_holds.delete(telem.id); }
}

// ---------------------------------------------------------------------------------------------------------- the update loop

TELEPLOT.commands.__update = function(now=Date.now()) {
    if(!_commands_requests.size && !_commands_calls.size && !_commands_holds.size) return;
    for(let request of [..._commands_requests.values()]) _commands_checkRequest(request, now);
    for(let calls of _commands_calls.values()) for(let call of calls.values()) _commands_checkCall(call, now);
    for(let hold of [..._commands_holds.values()]) {
        let declaration = TELEPLOT.commands.declaration(hold.telemetry);
        if(!declaration || !TELEPLOT.state.commands) { _commands_holds.delete(hold.telemetry.id); continue; }
        if(now - hold.sentAt >= 1000 / declaration.rate) _commands_sendHold(hold, now);
    }
}

// Forgets everything that was asked (tests, a page that starts again)
TELEPLOT.commands.__reset = function() {
    _commands_requests = new Map(); _commands_calls = new Map(); _commands_history = new Map(); _commands_holds = new Map(); _commands_refusals = new Map();
}

// The page is hidden: nothing drives a device from it any more
if(typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
        if(document.hidden) for(let hold of [..._commands_holds.values()]) TELEPLOT.commands.release(hold.telemetry);
    });
}
