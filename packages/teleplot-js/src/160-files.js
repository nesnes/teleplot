/*
 * Data files: what the datastore holds (and the dashboards) written to a file, and files read back. See doc/files.md.
 *
 * Two formats, and nothing new to learn for either: a file is what a device would have sent.
 * - Text: the lines of the text protocol ("speed:1627551892437:1.2", "DASH|Robot/Motion:chart:speed"...), one after the other. A
 *   device can log the lines it sends to an SD card and the file opens here. Readable, but the text protocol cannot say everything
 *   (see exportText).
 * - Binary: the packets of the binary protocol, each after its length, behind a short header (TELEPLOT.protocol.FILE_MAGIC). The
 *   default: smaller, faster, and it gives back exactly what was stored.
 * Importing goes through the parsers of the protocols (parseDataText, parseDataBinary): a file and a connection are read by the same code.
 */
TELEPLOT.files = {};

// ---------------------------------------------------------------------------------------------------------------- What to export

// options: { telemetries: ids or names (default: all), from, to: timestamps in seconds (default: everything), dashboards: true (all,
// the default), false, or names }
function _files_selection(options) {
    let telemetries = [];
    if(options.telemetries === undefined) telemetries = Object.values(TELEPLOT.datastore.telemetries);
    else for(let idOrName of options.telemetries) {
        let telem = TELEPLOT.datastore.getTelemetry(idOrName);
        if(telem !== undefined && !telemetries.some((t) => t.id === telem.id)) telemetries.push(telem);
    }
    let dashboards = options.dashboards === false ? [] : (Array.isArray(options.dashboards) ? options.dashboards : Object.keys(TELEPLOT.dashboards.dashboards));
    return { telemetries, dashboards, from: options.from, to: options.to };
}

// Indexes [start, end) of the samples of a data entry between two timestamps (undefined: no limit on that side)
function _files_range(entry, from, to) {
    let timestamps = entry.timestamps;
    let lower = (value) => { // First index whose timestamp is >= value
        let lo = 0, hi = timestamps.length;
        while(lo < hi) { let mid = (lo + hi) >> 1; if(timestamps[mid] < value) lo = mid + 1; else hi = mid; }
        return lo;
    };
    let start = from === undefined ? 0 : lower(from);
    let end = timestamps.length;
    if(to !== undefined) { end = lower(to); while(end < timestamps.length && timestamps[end] === to) end++; }
    return [start, Math.max(start, end)];
}

// Indexes of the samples of a data entry to export for a period. Thresholds are limits that hold until they are replaced: the ones
// in force when the period starts (the last sample of each name before it) are part of what the period needs, and come first.
function _files_indexes(dataType, entry, from, to) {
    let [start, end] = _files_range(entry, from, to);
    let indexes = [];
    if(dataType == TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_THRESHOLD && start > 0) {
        let seen = new Set();
        for(let i = start - 1; i >= 0; i--) {
            let name = entry.data[2][i];
            if(seen.has(name)) continue;
            seen.add(name);
            if(Number.isFinite(entry.data[1][i])) indexes.unshift(i);
        }
    }
    for(let i = start; i < end; i++) indexes.push(i);
    return indexes;
}

// ---------------------------------------------------------------------------------------------------------------- Text

// A timestamp (seconds) as the milliseconds the text protocol takes, written so that reading it gives the same timestamp back
function _files_ms(timestamp) {
    let ms = timestamp * 1000;
    if(ms / 1000 === timestamp) return String(ms);
    for(let digits = 15; digits <= 17; digits++) {
        let text = String(Number(ms.toPrecision(digits)));
        if(parseFloat(text) / 1000 === timestamp) return text;
    }
    let ulp = Math.pow(2, Math.floor(Math.log2(Math.abs(ms) || 1)) - 52);
    for(let k = 1; k <= 4; k++) for(let near of [ms + k * ulp, ms - k * ulp]) if(near / 1000 === timestamp) return String(near);
    return String(ms);
}

// A float32 written with as few digits as give it back
function _files_f32(value) {
    for(let digits = 6; digits <= 9; digits++) {
        let text = String(Number(value.toPrecision(digits)));
        if(Math.fround(parseFloat(text)) === value) return text;
    }
    return String(value);
}

// A value of a 3D property: in quotes when it holds separators. undefined when it cannot be written.
function _files_quoted(value) {
    value = String(value);
    if(/[\r\n]/.test(value)) return undefined;
    if(!/[:;|"']/.test(value)) return value;
    if(!value.includes('"')) return '"' + value + '"';
    if(!value.includes("'")) return "'" + value + "'";
    return undefined;
}

/*
 * The data (and the dashboards) as lines of the text protocol. Returns { parts, samples, skipped }: "parts" are strings to put one
 * after the other (new Blob(parts)), "samples" the number of samples written, "skipped" the number of samples the text protocol
 * cannot carry: telemetries whose name holds a separator, texts that hold one (; | § or a line break).
 * Also not in a text file, because the text protocol has no word for them: colors and data windows of telemetries, clients (two
 * telemetries of the same name sent by two clients become one), and colors sent as r, g, b come back as "rgb(r,g,b)".
 */
TELEPLOT.files.exportText = function(options = {}) {
    const P = TELEPLOT.protocol;
    let selection = _files_selection(options);
    let parts = [], lines = [], size = 0, samples = 0, skipped = 0;
    let push = (line) => {
        lines.push(line);
        size += line.length;
        if(size > 1 << 20) { parts.push(lines.join("\n") + "\n"); lines = []; size = 0; }
    };
    for(let name of selection.dashboards) {
        let text = TELEPLOT.dashboards.exportText(name);
        if(text !== "") push(text);
    }
    for(let telem of selection.telemetries) {
        let name = telem.getAttribute(P.TELEM_ATTR_NAME);
        let count = (entry) => { let [a, b] = _files_range(entry, selection.from, selection.to); return b - a; };
        if(typeof name !== "string" || name === "" || /[:,|\r\n]/.test(name) || /^(3D|JPG|PNG|DASH)$/.test(name) || name.startsWith(">")) {
            for(let dataType in telem.data) skipped += count(telem.data[dataType]);
            continue;
        }
        let label = telem.getAttribute(P.TELEM_ATTR_VIEW_LABEL);
        let key = name + (typeof label === "string" && label !== "" && !/[:,|\r\n]/.test(label) ? "," + label : "");
        let unit = telem.getAttribute(P.TELEM_ATTR_UNIT);
        let unitText = typeof unit === "string" && unit !== "" && !/[|§\r\n]/.test(unit) ? "§" + unit : "";
        let np = telem.getAttribute(P.TELEM_ATTR_AUTOPLOT) === false;
        let flags = (flag) => { let list = [flag, np ? "np" : ""].filter((f) => f !== ""); return list.length ? "|" + list.join(",") : ""; };
        let isLog = telem.getAttribute(P.TELEM_ATTR_LOG) === true;
        let isStack = telem.getAttribute(P.TELEM_ATTR_STACK) === true;

        // Samples of a data type, several per line: line(prefix, samples joined by ";", suffix)
        let write = (dataType, prefix, suffix, format, perLine = 200) => {
            let entry = telem.data[dataType];
            if(entry === undefined) return;
            let fields = [];
            for(let i of _files_indexes(dataType, entry, selection.from, selection.to)) {
                let field = format(entry.data, i, _files_ms(entry.timestamps[i]));
                if(field === undefined) { skipped++; continue; }
                fields.push(field);
                samples++;
                if(fields.length >= perLine) { push(prefix + fields.join(";") + suffix); fields = []; }
            }
            if(fields.length) push(prefix + fields.join(";") + suffix);
        };

        // The shape itself is an attribute: said once, before its properties
        let shape = telem.getAttribute(P.TELEM_ATTR_SHAPE);
        if(shape !== undefined && shape !== null) {
            let type = ["cube", "sphere", "cylinder", "rect", "circle", "line", "polygon", "arrow", "text", , "stl"][shape.type];
            let url = shape.data ? _files_quoted(shape.data) : undefined;
            if(type !== undefined) push("3D|" + key + ":S:" + type + (url !== undefined ? ":U:" + url : "") + flags(""));
        }
        // Its frame too
        let frame = telem.getAttribute(P.TELEM_ATTR_FRAME);
        let frameName = frame && frame.name ? _files_quoted(frame.name) : undefined;
        if(frameName !== undefined) push("3D|" + key + (frame.type === P.FRAME_TYPE_PIXELS ? ":FPX:" : ":F:") + frameName + flags(""));

        // Its range (an attribute: said once) and its thresholds
        let range = telem.getRange();
        if(range !== undefined) push("ATTR|" + name + (range.min !== undefined ? "|min=" + range.min : "") + (range.max !== undefined ? "|max=" + range.max : ""));
        let escape = (text) => String(text).replace(/[%:;|<>,]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
        write(P.SECTION_TYPE_TELEM_DATA_THRESHOLD, "TH|" + name + ":", "", (d, i, ms) => {
            let thresholdName = String(d[2][i]), color = String(d[3][i] || "");
            if(thresholdName.trim() === "" || thresholdName !== thresholdName.trim() || /[\r\n]/.test(thresholdName) || /[:;|\r\n]/.test(color) || color !== color.trim()) return undefined;
            return ms + ":" + escape(thresholdName) + (d[0][i] === P.THRESHOLD_ABOVE ? ">" : "<") + (Number.isFinite(d[1][i]) ? d[1][i] : "") + (color !== "" ? "," + color.replace(/%/g, "%25") : "");
        }, 100);

        write(P.SECTION_TYPE_TELEM_DATA_NUMBER, key + ":", unitText + flags(""), (d, i, ms) => ms + ":" + d[0][i]);
        write(P.SECTION_TYPE_TELEM_DATA_NUMBER_2D, key + ":", unitText + flags("xy"), (d, i, ms) => d[0][i] + ":" + d[1][i] + ":" + ms);
        write(P.SECTION_TYPE_TELEM_DATA_NUMBER_3D, key + ":", unitText + flags("xyz"), (d, i, ms) => d[0][i] + ":" + d[1][i] + ":" + d[2][i] + ":" + ms);
        if(name === _defaultTextLogName) {
            write(P.SECTION_TYPE_TELEM_DATA_TEXT, ">", "", (d, i, ms) => /[\r\n]/.test(String(d[0][i])) ? undefined : ms + ":" + d[0][i], 1);
        }
        else write(P.SECTION_TYPE_TELEM_DATA_TEXT, key + ":", unitText + flags(isLog ? "log" : (isStack ? "stack" : "t")), (d, i, ms) => {
            let text = String(d[0][i]);
            return /[;|§\r\n]/.test(text) ? undefined : ms + ":" + text; // (colons are fine: the time written before the text tells where it starts)
        }, 1);
        write(P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD, key + ":", flags("pc"), (d, i, ms) => {
            let positions = d[0][i], intensities = d[1][i], colors = d[2][i];
            let points = [ms];
            for(let p = 0; p < positions.length / 3; p++) {
                let point = _files_f32(positions[p*3]) + ":" + _files_f32(positions[p*3+1]) + ":" + _files_f32(positions[p*3+2]);
                if(intensities) point += ":" + _files_f32(intensities[p]);
                if(colors) point += ":" + colors[p*3] + ":" + colors[p*3+1] + ":" + colors[p*3+2];
                points.push(point);
            }
            return points.length > 1 ? points.join(";") : undefined; // (a cloud without points has no line)
        }, 1);
        let images = telem.data[P.SECTION_TYPE_TELEM_DATA_IMAGE];
        if(images !== undefined) {
            let [start, end] = _files_range(images, selection.from, selection.to);
            for(let i = start; i < end; i++) {
                push((images.data[0][i] === P.IMAGE_TYPE_PNG ? "PNG|" : "JPG|") + key + ":" + _files_ms(images.timestamps[i]) + ":" + images.data[1][i] + flags(""));
                samples++;
            }
        }

        // Properties of a shape (or of a camera, of the sensor of a cloud): a line per kind of property
        let property = (dataType, format) => write(dataType, "3D|" + key + ":", flags(""), (d, i, ms) => { let text = format(d, i); return text === undefined ? undefined : ms + ":" + text; }, 100);
        property(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION, (d, i) => "P:" + d[0][i] + ":" + d[1][i] + ":" + d[2][i]);
        property(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION, (d, i) => "R:" + d[0][i] + ":" + d[1][i] + ":" + d[2][i]);
        property(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION, (d, i) => "Q:" + d[1][i] + ":" + d[2][i] + ":" + d[3][i] + ":" + d[0][i]); // stored w, x, y, z; written x:y:z:w
        property(P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE, (d, i) => "SC:" + d[0][i] + ":" + d[1][i] + ":" + d[2][i]);
        property(P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR, (d, i) => { let color = _files_quoted(d[0][i]); return color === undefined || color === "" ? undefined : "C:" + color; });
        property(P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB, (d, i) => "C:rgb(" + d[0][i] + "," + d[1][i] + "," + d[2][i] + ")");
        property(P.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY, (d, i) => "O:" + (d[0][i] / 255));
        property(P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE, (d, i) => {
            let type = { [P.TEXTURE_TYPE_URL]: "url", [P.TEXTURE_TYPE_IMAGE]: "telem" }[d[0][i]];
            let value = type === undefined ? undefined : _files_quoted(d[1][i]);
            return value === undefined || value === "" ? "T::" : "T:" + type + ":" + value;
        });
        property(P.SECTION_TYPE_TELEM_DATA_SHAPE_VECTOR, (d, i) => "V:" + d[0][i] + ":" + d[1][i] + ":" + d[2][i]);
        property(P.SECTION_TYPE_TELEM_DATA_SHAPE_LINE_WIDTH, (d, i) => "LW:" + d[0][i]);
        property(P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXT, (d, i) => { let text = _files_quoted(d[0][i]); return text === undefined ? undefined : "TX:" + (text === "" ? '""' : text); });
        property(P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS, (d, i) => "K:" + d[2][i] + ":" + d[3][i] + ":" + d[4][i] + ":" + d[5][i] + ":" + d[0][i] + ":" + d[1][i]); // stored width, height first
        property(P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION, (d, i) => "DC:" + [0, 1, 2, 3, 4].map((c) => d[c][i]).join(":"));
    }
    if(lines.length) parts.push(lines.join("\n") + "\n");
    return { parts, samples, skipped };
}

// ---------------------------------------------------------------------------------------------------------------- Binary

class _files_Writer {
    constructor() { this.bytes = new Uint8Array(1 << 14); this.view = new DataView(this.bytes.buffer); this.length = 0; }
    room(count) {
        if(this.length + count <= this.bytes.length) return;
        let bigger = new Uint8Array(Math.max(this.bytes.length * 2, this.length + count));
        bigger.set(this.bytes.subarray(0, this.length));
        this.bytes = bigger;
        this.view = new DataView(bigger.buffer);
    }
    u8(v) { this.room(1); this.view.setUint8(this.length, v); this.length += 1; return this; }
    u16(v) { this.room(2); this.view.setUint16(this.length, v, true); this.length += 2; return this; }
    u32(v) { this.room(4); this.view.setUint32(this.length, v, true); this.length += 4; return this; }
    u64(v) { let high = Math.floor(v / 4294967296); return this.u32(v - high * 4294967296).u32(high); } // A Number: exact for what a double can hold
    f32(v) { this.room(4); this.view.setFloat32(this.length, v, true); this.length += 4; return this; }
    f64(v) { this.room(8); this.view.setFloat64(this.length, v, true); this.length += 8; return this; }
    raw(bytes) { this.room(bytes.length); this.bytes.set(bytes, this.length); this.length += bytes.length; return this; }
    str(text) { return this.raw(_files_textEncoder.encode(text)).u8(0); }
    take() { let bytes = this.bytes.slice(0, this.length); this.length = 0; return bytes; }
}
const _files_textEncoder = new TextEncoder();

// The nanoseconds (as a Number) that the parser of the binary protocol reads back as this timestamp, in seconds
function _files_ns(timestamp) {
    let ns = Math.round(timestamp * 1e9);
    if(ns / 1e9 === timestamp) return ns;
    let ulp = Math.max(1, Math.pow(2, Math.floor(Math.log2(Math.abs(ns) || 1)) - 52));
    for(let k = 1; k <= 8; k++) for(let near of [ns + k * ulp, ns - k * ulp]) if(near >= 0 && near / 1e9 === timestamp) return near;
    return ns;
}

// TIMEDIFF (nanoseconds, uint32) that gives a timestamp back from a time reference in seconds. undefined: out of reach of this reference
function _files_diff(reference, timestamp) {
    let diff = Math.round((timestamp - reference) * 1e9);
    for(let near of [diff, diff + 1, diff - 1, diff + 2, diff - 2, diff + 3, diff - 3]) {
        if(near >= 0 && near <= 0xFFFFFFFF && reference + near / 1e9 === timestamp) return near;
    }
    return undefined;
}

const _files_isF32 = (v) => typeof v === "number" && Object.is(Math.fround(v), v);
const _files_isUint = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
const _files_NUL = /\u0000/;

// How the samples of each data type are written: "exact" tells whether the section of the data type gives a sample back as it is
// (otherwise it goes in a TELEM_DATA_FLOAT64 section), "write" writes it. No "exact": always.
function _files_encoders(P) {
    let floats = (count) => ({
        exact: (d, i) => { for(let c = 0; c < count; c++) if(!_files_isF32(d[c][i])) return false; return true; },
        write: (w, d, i) => { for(let c = 0; c < count; c++) w.f32(d[c][i]); }
    });
    let encoders = {};
    encoders[P.SECTION_TYPE_TELEM_DATA_NUMBER] = floats(1);
    encoders[P.SECTION_TYPE_TELEM_DATA_NUMBER_2D] = floats(2);
    encoders[P.SECTION_TYPE_TELEM_DATA_NUMBER_3D] = floats(3);
    encoders[P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION] = floats(3);
    encoders[P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION] = floats(3);
    encoders[P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION] = floats(4);
    encoders[P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE] = floats(3);
    encoders[P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION] = floats(5);
    encoders[P.SECTION_TYPE_TELEM_DATA_SHAPE_VECTOR] = floats(3);
    encoders[P.SECTION_TYPE_TELEM_DATA_SHAPE_LINE_WIDTH] = floats(1);
    encoders[P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXT] = { skip: (d, i) => _files_NUL.test(String(d[0][i])), write: (w, d, i) => w.str(String(d[0][i])) };
    encoders[P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS] = {
        exact: (d, i) => _files_isUint(d[0][i], 65535) && _files_isUint(d[1][i], 65535) && [2, 3, 4, 5].every((c) => _files_isF32(d[c][i])),
        write: (w, d, i) => { w.u16(d[0][i]).u16(d[1][i]); for(let c = 2; c < 6; c++) w.f32(d[c][i]); }
    };
    encoders[P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB] = { exact: (d, i) => [0, 1, 2].every((c) => _files_isUint(d[c][i], 255)), write: (w, d, i) => w.u8(d[0][i]).u8(d[1][i]).u8(d[2][i]) };
    encoders[P.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY] = { exact: (d, i) => _files_isUint(d[0][i], 255), write: (w, d, i) => w.u8(d[0][i]) };
    // Texts end at a zero byte: one that holds a zero cannot be written
    encoders[P.SECTION_TYPE_TELEM_DATA_TEXT] = { skip: (d, i) => _files_NUL.test(String(d[0][i])), write: (w, d, i) => w.str(String(d[0][i])) };
    encoders[P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR] = { skip: (d, i) => _files_NUL.test(String(d[0][i])), write: (w, d, i) => w.str(String(d[0][i])) };
    encoders[P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE] = { skip: (d, i) => _files_NUL.test(String(d[1][i])), write: (w, d, i) => w.u8(d[0][i]).str(String(d[1][i])) };
    encoders[P.SECTION_TYPE_TELEM_DATA_THRESHOLD] = {
        skip: (d, i) => _files_NUL.test(String(d[2][i])) || _files_NUL.test(String(d[3][i])),
        write: (w, d, i) => w.u8(d[0][i] === P.THRESHOLD_ABOVE ? P.THRESHOLD_ABOVE : P.THRESHOLD_BELOW).f64(d[1][i]).str(String(d[2][i])).str(String(d[3][i] || ""))
    };
    return encoders;
}

function _files_fromBase64(text) {
    let binary = atob(text);
    let bytes = new Uint8Array(binary.length);
    for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/*
 * The data (and the dashboards) as a binary file: TELEPLOT.protocol.FILE_MAGIC, then packets of the binary protocol, each after its
 * length (uint32, little-endian). Returns { parts, samples, skipped }: "parts" are Uint8Array to put one after the other
 * (new Blob(parts)). What is read back is what was stored: values that a float32 would round are written as float64
 * (TELEM_DATA_FLOAT64), telemetries of the text protocol keep being identified by their name (client id CLIENT_ID_NAMED), the others
 * keep their client and their id. "skipped" counts what cannot be written: texts that hold a zero character, images that are not base64.
 */
TELEPLOT.files.exportBinary = function(options = {}) {
    const P = TELEPLOT.protocol;
    let selection = _files_selection(options);
    let encoders = _files_encoders(P);
    let parts = [Uint8Array.from(P.FILE_MAGIC)];
    let samples = 0, skipped = 0;
    let w = new _files_Writer();
    let packetClient = undefined;
    let endPacket = () => {
        if(packetClient === undefined) return;
        w.u16(0); // Checksum (not checked yet)
        let packet = w.take();
        let length = new Uint8Array(4);
        new DataView(length.buffer).setUint32(0, packet.length, true);
        parts.push(length, packet);
        packetClient = undefined;
    };
    let packet = (clientId) => { // Sections are added to the packet of the client, a new one when it gets big
        if(packetClient === clientId && w.length < 1 << 18) return;
        endPacket();
        w.u8(P.BINARY_MARKER).u8(P.BINARY_VERSION).u16(clientId);
        packetClient = clientId;
    };

    for(let name of selection.dashboards) {
        let text = TELEPLOT.dashboards.exportText(name);
        if(text === "" || _files_NUL.test(text)) continue;
        packet(P.CLIENT_ID_NAMED);
        w.u8(P.SECTION_TYPE_DASHBOARD).str(text);
    }

    let namedCount = 0, namedClients = new Set();
    for(let telem of selection.telemetries) {
        let clientId = telem.clientId, telemId = clientId === undefined ? -1 : telem.id - clientId * 0x10000;
        let name = telem.getAttribute(P.TELEM_ATTR_NAME);
        if(!(_files_isUint(clientId, 0xFFFE) && _files_isUint(telemId, 0xFFFF))) {
            // Identified by its name. (Ids only last until the next name attribute: they can be used again.)
            if(typeof name !== "string" || name === "" || _files_NUL.test(name)) {
                for(let dataType in telem.data) { let [a, b] = _files_range(telem.data[dataType], selection.from, selection.to); skipped += b - a; }
                continue;
            }
            clientId = P.CLIENT_ID_NAMED;
            telemId = namedCount++ % 0x10000;
        }
        packet(clientId);
        if(clientId !== P.CLIENT_ID_NAMED && !namedClients.has(clientId)) {
            namedClients.add(clientId);
            let client = TELEPLOT.clients.getClient(clientId);
            if(client && client.name && !_files_NUL.test(client.name)) w.u8(P.SECTION_TYPE_CLIENT_NAME).str(client.name);
        }

        // Attributes (the name first: it is what identifies a telemetry without client)
        let attributes = [];
        let text = (code) => { let value = telem.getAttribute(code); if(typeof value === "string" && value !== "" && !_files_NUL.test(value)) attributes.push(() => w.u8(code).str(value)); };
        let flag = (code) => { let value = telem.getAttribute(code); if(typeof value === "boolean") attributes.push(() => w.u8(code).u8(value ? 1 : 0)); };
        text(P.TELEM_ATTR_NAME); text(P.TELEM_ATTR_UNIT); text(P.TELEM_ATTR_COLOR); flag(P.TELEM_ATTR_AUTOPLOT);
        let timeout = telem.getAttribute(P.TELEM_ATTR_DATA_TIMEOUT);
        if(typeof timeout === "number" && timeout >= 0) attributes.push(() => w.u8(P.TELEM_ATTR_DATA_TIMEOUT).u64(Math.round(timeout * 1e9)));
        let shape = telem.getAttribute(P.TELEM_ATTR_SHAPE);
        if(shape && _files_isUint(shape.type, 255)) attributes.push(() => { w.u8(P.TELEM_ATTR_SHAPE).u8(shape.type); if(shape.type === P.TELEM_ATTR_SHAPE_TYPE_STL) w.str(String(shape.data || "")); });
        text(P.TELEM_ATTR_VIEW_LABEL); flag(P.TELEM_ATTR_LOG); flag(P.TELEM_ATTR_STACK);
        let frame = telem.getAttribute(P.TELEM_ATTR_FRAME);
        if(frame && typeof frame.name === "string" && frame.name !== "" && !_files_NUL.test(frame.name)) attributes.push(() => w.u8(P.TELEM_ATTR_FRAME).u8(frame.type === P.FRAME_TYPE_PIXELS ? P.FRAME_TYPE_PIXELS : P.FRAME_TYPE_POSE).str(frame.name));
        let range = telem.getRange();
        if(range !== undefined) attributes.push(() => w.u8(P.TELEM_ATTR_RANGE).f64(range.min === undefined ? NaN : range.min).f64(range.max === undefined ? NaN : range.max));
        if(attributes.length) {
            w.u8(P.SECTION_TYPE_TELEM_ATTR).u16(telemId).u8(attributes.length);
            attributes.forEach((write) => write());
        }

        for(let key in telem.data) {
            let dataType = Number(key);
            let entry = telem.data[key];
            let [start, end] = _files_range(entry, selection.from, selection.to);
            let timestamps = entry.timestamps, data = entry.data;

            // Images and point clouds: a section per part (same time reference for all the parts, as the parser expects)
            if(dataType === P.SECTION_TYPE_TELEM_DATA_IMAGE) {
                for(let i = start; i < end; i++) {
                    let bytes;
                    try { bytes = _files_fromBase64(data[1][i]); } catch(e) { skipped++; continue; }
                    let partCount = Math.max(1, Math.ceil(bytes.length / 0xFFFF));
                    if(partCount > 0xFFFF) { skipped++; continue; }
                    let ns = _files_ns(timestamps[i]);
                    for(let part = 0; part < partCount; part++) {
                        let piece = bytes.subarray(part * 0xFFFF, (part + 1) * 0xFFFF);
                        packet(clientId);
                        w.u8(dataType).u16(telemId).u64(ns).u8(1).u32(0).u8(data[0][i]).u16(part).u16(partCount).u16(piece.length).raw(piece);
                    }
                    samples++;
                }
                continue;
            }
            if(dataType === P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD) {
                const PER_PART = 4096;
                for(let i = start; i < end; i++) {
                    let positions = data[0][i], intensities = data[1][i], colors = data[2][i];
                    let pointCount = positions.length / 3;
                    let partCount = Math.max(1, Math.ceil(pointCount / PER_PART));
                    if(partCount > 0xFFFF) { skipped++; continue; }
                    let flags = (intensities ? P.POINT_CLOUD_INTENSITY : 0) | (colors ? P.POINT_CLOUD_RGB : 0);
                    let ns = _files_ns(timestamps[i]);
                    for(let part = 0; part < partCount; part++) {
                        let first = part * PER_PART, last = Math.min(pointCount, first + PER_PART);
                        packet(clientId);
                        w.u8(dataType).u16(telemId).u64(ns).u8(1).u32(0).u8(flags).u16(part).u16(partCount).u16(last - first);
                        for(let p = first; p < last; p++) {
                            w.f32(positions[p*3]).f32(positions[p*3+1]).f32(positions[p*3+2]);
                            if(intensities) w.f32(intensities[p]);
                            if(colors) w.u8(colors[p*3]).u8(colors[p*3+1]).u8(colors[p*3+2]);
                        }
                    }
                    samples++;
                }
                continue;
            }

            let encoder = encoders[dataType];
            if(encoder === undefined) { skipped += end - start; continue; }
            let channelCount = data.length;
            let order = _files_indexes(dataType, entry, selection.from, selection.to); // (the samples of the period, in order)
            for(let at = 0; at < order.length;) {
                let i = order[at];
                if(encoder.skip && encoder.skip(data, i)) { skipped++; at++; continue; }
                // A section: up to 255 samples within reach of its time reference, all written the same way (as float64 as soon as
                // one of them needs it: a section per sample would cost more)
                let ns = _files_ns(timestamps[i]);
                let reference = ns / 1e9;
                let asFloat64 = false;
                let indexes = [], diffs = [];
                for(let next = at; next < order.length && indexes.length < 255; next++) {
                    let j = order[next];
                    if(encoder.skip && encoder.skip(data, j)) break;
                    let diff = next === at ? 0 : _files_diff(reference, timestamps[j]);
                    if(diff === undefined) break;
                    if(encoder.exact !== undefined && !encoder.exact(data, j)) asFloat64 = true;
                    indexes.push(j); diffs.push(diff);
                }
                packet(clientId);
                w.u8(asFloat64 ? P.SECTION_TYPE_TELEM_DATA_FLOAT64 : dataType).u16(telemId).u64(ns).u8(indexes.length);
                if(asFloat64) w.u8(dataType);
                for(let n = 0; n < indexes.length; n++) {
                    w.u32(diffs[n]);
                    if(asFloat64) for(let c = 0; c < channelCount; c++) w.f64(data[c][indexes[n]]);
                    else encoder.write(w, data, indexes[n]);
                }
                samples += indexes.length;
                at += indexes.length;
            }
        }
    }
    endPacket();
    return { parts, samples, skipped };
}

// ---------------------------------------------------------------------------------------------------------------- CSV

/*
 * CSV: for spreadsheets and scripts. It holds what a table can: numbers, positions (2D and 3D numbers, a column per coordinate:
 * "name.x", "name.y"...) and text. Images, shapes, cameras and point clouds are left out, and so are attributes and dashboards.
 * options (besides telemetries, from, to): layout "columns" (default: a column per telemetry, a line per timestamp; a cell is empty
 * when its telemetry has no sample at that very time, nothing is filled in) or "lines" (time, name, value: a line per sample);
 * time "iso" (default: 2021-07-29T09:44:52.437Z), "ms" or "s" (since 1970); separator "," (default), ";" or a tab.
 * Numbers are always written with a point, whatever the separator; a field that holds the separator, a quote or a line break is quoted.
 */
const _files_CSV_TYPES = [20, 21, 22, 23];
const _files_ISO = /^(\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d)?)(?:[.,](\d+))?\s*(Z|[+-]\d\d:?\d\d)?$/;

// "2021-07-29T09:44:52.437Z" (any number of decimals; without a zone: local time) -> seconds since 1970, NaN when it is not a date
function _files_isoToSeconds(text) {
    let match = _files_ISO.exec(String(text).trim());
    if(match === null) { let ms = Date.parse(text); return isNaN(ms) ? NaN : ms / 1000; }
    let ms = Date.parse(match[1].replace(" ", "T") + (match[1].length === 16 ? ":00" : "") + (match[3] || ""));
    if(isNaN(ms)) return NaN;
    return match[2] === undefined ? ms / 1000 : (ms + parseFloat("0." + match[2]) * 1000) / 1000;
}

function _files_secondsToIso(timestamp) {
    let ms = timestamp * 1000, whole = Math.floor(ms);
    let text = new Date(whole).toISOString();
    if(_files_isoToSeconds(text) === timestamp) return text;
    // Finer than a millisecond: as many decimals as give the timestamp back
    let base = text.slice(0, 19), fraction = (timestamp - Math.floor(timestamp));
    for(let digits = 4; digits <= 12; digits++) {
        let candidate = base + "." + fraction.toFixed(digits).slice(2) + "Z";
        if(_files_isoToSeconds(candidate) === timestamp) return candidate;
    }
    return base + "." + fraction.toFixed(9).slice(2) + "Z";
}

function _files_csvField(value, separator) {
    let text = String(value);
    return (text.includes(separator) || /["\r\n]/.test(text)) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

// What goes in a CSV: { series: [{name, timestamps, values, at, end}], leftOut: telemetries without anything a table holds, skipped: samples left out }
function _files_csvSeries(options) {
    const P = TELEPLOT.protocol;
    let selection = _files_selection(options);
    let series = [], leftOut = 0, skipped = 0;
    for(let telem of selection.telemetries) {
        let name = telem.getAttribute(P.TELEM_ATTR_NAME);
        if(typeof name !== "string" || name === "") name = String(telem.id);
        let before = series.length;
        for(let key in telem.data) {
            let dataType = Number(key), entry = telem.data[key];
            let [start, end] = _files_range(entry, selection.from, selection.to);
            if(!_files_CSV_TYPES.includes(dataType)) { skipped += end - start; continue; }
            let add = (label, channel) => series.push({ name: label, timestamps: entry.timestamps, values: channel, at: start, end: end });
            if(dataType === P.SECTION_TYPE_TELEM_DATA_NUMBER) add(name, entry.data[0]);
            else if(dataType === P.SECTION_TYPE_TELEM_DATA_TEXT) add(telem.data[P.SECTION_TYPE_TELEM_DATA_NUMBER] !== undefined ? name + ".text" : name, entry.data[0]);
            else ["x", "y", "z"].slice(0, entry.data.length).forEach((axis, c) => add(name + "." + axis, entry.data[c]));
        }
        if(series.length === before) leftOut++;
    }
    return { series, leftOut, skipped };
}

// Calls row(cells) for the header and for each line of the CSV, until it returns false. Returns { samples, leftOut, skipped }.
function _files_csvRows(options, row) {
    let { series, leftOut, skipped } = _files_csvSeries(options);
    let time = { ms: _files_ms, s: (t) => String(t) }[options.time] || _files_secondsToIso;
    let lines = options.layout === "lines";
    let samples = 0;
    if(row(lines ? ["time", "name", "value"] : ["time", ...series.map((s) => s.name)]) === false) return { samples, leftOut, skipped };
    let live = series.filter((s) => s.at < s.end);
    while(live.length) {
        let next = Infinity;
        for(let s of live) if(s.timestamps[s.at] < next) next = s.timestamps[s.at];
        if(next === Infinity) break; // (timestamps that are not numbers)
        let stamp = time(next);
        if(lines) {
            for(let s of live) {
                if(s.timestamps[s.at] !== next) continue;
                samples++;
                if(row([stamp, s.name, s.values[s.at++]]) === false) return { samples, leftOut, skipped };
            }
        }
        else {
            let cells = [stamp];
            for(let s of series) {
                if(s.at < s.end && s.timestamps[s.at] === next) { cells.push(s.values[s.at++]); samples++; }
                else cells.push("");
            }
            if(row(cells) === false) return { samples, leftOut, skipped };
        }
        if(live.some((s) => s.at >= s.end)) live = live.filter((s) => s.at < s.end);
    }
    return { samples, leftOut, skipped };
}

// Returns { parts, samples, skipped, leftOut }: "leftOut" is the number of telemetries that have nothing a CSV can hold, "skipped" the
// samples left out (theirs, and what else the other telemetries hold: the pose of a sensor...).
TELEPLOT.files.exportCSV = function(options = {}) {
    let separator = [";", "\t"].includes(options.separator) ? options.separator : ",";
    let parts = [], lines = [], size = 0;
    let result = _files_csvRows(options, (cells) => {
        let line = cells.map((cell) => _files_csvField(cell, separator)).join(separator);
        lines.push(line);
        size += line.length;
        if(size > 1 << 20) { parts.push(lines.join("\r\n") + "\r\n"); lines = []; size = 0; }
    });
    if(lines.length) parts.push(lines.join("\r\n") + "\r\n");
    return { parts, samples: result.samples, skipped: result.skipped, leftOut: result.leftOut };
}

// The first lines of what exportCSV would write, as a table: { header: [names], rows: [[cells]] } (cells as they are stored: numbers, text, "" when empty)
TELEPLOT.files.previewCSV = function(options = {}, count = 4) {
    let header = undefined, rows = [];
    _files_csvRows(options, (cells) => {
        if(header === undefined) { header = cells; return count > 0; }
        rows.push(cells);
        return rows.length < count;
    });
    return { header: header || [], rows };
}

// ---------------------------------------------------------------------------------------------------------------- Before saving

// What an export would hold, without writing it: { samples, bytes (an estimate), telemetries (that have something to write),
// leftOut (telemetries the format cannot hold), skipped (samples the format cannot hold; for "text" they are only known by writing) }.
// format: "binary", "text" or "csv"; options: as for the exports.
TELEPLOT.files.estimate = function(format, options = {}) {
    const P = TELEPLOT.protocol;
    let selection = _files_selection(options);
    let samples = 0, bytes = 0, telemetries = 0, leftOut = 0, skipped = 0;
    let timeLength = format === "csv" ? ({ ms: 13, s: 14 }[options.time] || 24) : 14;
    // Average length of a few values of a channel, as text
    let average = (channel, start, end, measure) => {
        let total = 0, count = 0;
        for(let i = start; i < end; i += Math.max(1, Math.floor((end - start) / 8))) { total += measure(channel[i]); count++; }
        return count ? total / count : 0;
    };
    let textLength = (v) => String(v).length;
    for(let telem of selection.telemetries) {
        let own = 0;
        let nameLength = String(telem.getAttribute(P.TELEM_ATTR_NAME) || "").length;
        for(let key in telem.data) {
            let dataType = Number(key), entry = telem.data[key];
            let [start, end] = _files_range(entry, selection.from, selection.to);
            let count = end - start;
            if(format !== "csv" && dataType === P.SECTION_TYPE_TELEM_DATA_THRESHOLD) count = _files_indexes(dataType, entry, selection.from, selection.to).length; // (with the ones in force when the period starts)
            if(count === 0) continue;
            if(format === "csv" && !_files_CSV_TYPES.includes(dataType)) { skipped += count; continue; }
            let per;
            if(dataType === P.SECTION_TYPE_TELEM_DATA_IMAGE) {
                let base64 = average(entry.data[1], start, end, textLength);
                per = format === "binary" ? base64 * 0.75 + 24 : base64 + nameLength + timeLength + 6;
            }
            else if(dataType === P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD) {
                let points = average(entry.data[0], start, end, (v) => v ? v.length / 3 : 0);
                per = format === "binary" ? points * (12 + (entry.data[1][start] ? 4 : 0) + (entry.data[2][start] ? 3 : 0)) + 24 : points * 24 + nameLength + timeLength;
            }
            else if(format === "binary") {
                let strings = [P.SECTION_TYPE_TELEM_DATA_TEXT, P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR, P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE, P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXT].includes(dataType);
                if(dataType === P.SECTION_TYPE_TELEM_DATA_THRESHOLD) per = 15.1 + average(entry.data[2], start, end, textLength) + average(entry.data[3], start, end, textLength);
                else if(strings) per = 4.1 + average(entry.data[entry.data.length - 1], start, end, textLength) + 1;
                else {
                    let exact = entry.data.every((channel) => _files_isF32(channel[start]) && _files_isF32(channel[end - 1]));
                    per = 4.1 + entry.data.length * (exact ? 4 : 8);
                }
            }
            else {
                let values = 0;
                for(let channel of entry.data) values += average(channel, start, end, textLength) + 1;
                per = timeLength + 1 + values + (format === "csv" && options.layout === "lines" ? nameLength + 1 : 0);
                if(format === "csv" && options.layout !== "lines") per = values + timeLength / Math.max(1, selection.telemetries.length); // (a line per moment: telemetries share its time)
            }
            samples += format === "csv" ? count * entry.data.length : count; // (a CSV counts its cells: a position is two or three)
            own += count;
            bytes += count * per;
        }
        if(own > 0) telemetries++; else if(Object.keys(telem.data).length) leftOut++;
    }
    return { samples, bytes: Math.round(bytes), telemetries, leftOut, skipped };
}

// ---------------------------------------------------------------------------------------------------------------- Import

// Whether bytes are the start of a binary data file
TELEPLOT.files.isBinary = function(bytes) {
    let magic = TELEPLOT.protocol.FILE_MAGIC;
    if(!bytes || bytes.length < 5) return false;
    for(let i = 0; i < 5; i++) if(bytes[i] !== magic[i]) return false; // "TPLT" and the line feed (then the version)
    return true;
}

// Records of a piece of CSV: { records: [[fields]], rest: what is left of a record that is not finished }
function _files_csvRecords(text, separator) {
    let records = [];
    if(!text.includes('"')) { // The usual case
        let end = text.lastIndexOf("\n");
        if(end < 0) return { records, rest: text };
        for(let line of text.slice(0, end).split("\n")) {
            if(line.endsWith("\r")) line = line.slice(0, -1);
            if(line !== "") records.push(line.split(separator));
        }
        return { records, rest: text.slice(end + 1) };
    }
    let fields = [], field = "", quoted = false, start = 0;
    for(let i = 0; i < text.length; i++) {
        let c = text[i];
        if(quoted) {
            if(c !== '"') field += c;
            else if(text[i + 1] === '"') { field += '"'; i++; }
            else quoted = false;
        }
        else if(c === '"') quoted = true;
        else if(c === separator) { fields.push(field); field = ""; }
        else if(c === "\n") {
            if(field.endsWith("\r")) field = field.slice(0, -1);
            fields.push(field);
            if(fields.length > 1 || fields[0] !== "") records.push(fields);
            fields = []; field = ""; start = i + 1;
        }
        else field += c;
    }
    return { records, rest: text.slice(start) };
}

/*
 * Reads a file, in one or several pieces: add(piece) for each (a string, or bytes: ArrayBuffer / Uint8Array, in order), then
 * finish(). The first piece tells the format: bytes that start with FILE_MAGIC are a binary file; a text whose first line has
 * separators and no ":" is a CSV; anything else is lines of the text protocol.
 * Binary and text go through the parsers of the protocols, as if they were received, with three differences: it also works while
 * data is paused, the dashboards of the file are created as new ones (nothing that exists is replaced), and lines of a text file
 * that have no timestamp are dated when they are read.
 * A CSV has a header line. One column is the time (see timeColumn), the others become telemetries named by the header: number
 * telemetries for cells that are numbers, text telemetries for the others; empty cells give nothing. With the header
 * "time,name,value" each line is one sample of the telemetry it names.
 * options:
 *   dryRun: true            nothing is stored nor created: finish() tells what the file holds and what opening it would do
 *   data: false             the data of the file is left out (its dashboards are still created)
 *   dashboards: false       the dashboards of the file are left out
 *   extendWindow: true      makes the data window (TELEPLOT.state.dataTimeout) long enough for what the file holds
 *   format: "text" | "csv"  instead of guessing between the two
 *   serial: true            text: read as what a serial port gives (telemetry lines start with ">", the others are logs)
 *   separator               CSV: "," ";" or a tab (default: the one the header uses most)
 *   timeColumn              CSV: index of the time column (default: a column named time, timestamp, date..., else the first)
 *   timeUnit                CSV: "iso" (date and time), "ms" or "s" since 1970 (default: guessed from the first line)
 *   prefix                  CSV: put before the name of each telemetry ("bench." gives "bench.rpm")
 * finish() returns { format: "text" | "binary" | "csv", samples, telemetries: ids of the telemetries that got data, created: how
 * many of them did not exist (createdIds: which), from, to (timestamps in seconds of the oldest and the newest sample; undefined without samples),
 * ranges: [{id, dataType, from, to, count}] (what each telemetry got: see removeImported), dashboards: names of the dashboards
 * created, dashboardNames: {name in the file: name it got}, problems: lines or packets that were not understood, windowExtended,
 * windowNeeded: seconds the data window should last to keep the file whole (0 when it does), csv: {separator, timeColumn, timeUnit,
 * columns: [names in the header], layout: "columns" | "lines"} for a CSV }.
 */
TELEPLOT.files.createImport = function(options = {}) {
    let dry = options.dryRun === true;
    let storeData = !dry && options.data !== false;              // Otherwise the data of the file is read as in a dry run
    let createDashboards = !dry && options.dashboards !== false;
    let format = undefined;
    let dashboards = TELEPLOT.dashboards.createImport(!createDashboards);
    // What exists before the file is read, to tell what it creates. Telemetries without client are known by their name.
    const NAME = TELEPLOT.protocol.TELEM_ATTR_NAME;
    let identity = (telem) => telem.clientId >= 0 ? telem.id : (telem.getAttribute(NAME) || telem.id);
    let existing = new Set(Object.values(TELEPLOT.datastore.telemetries).map(identity));
    let identities = {}; // id -> identity, for a dry run: a telemetry is forgotten after each piece, and may come back without its name
    let samples = 0, problems = 0, from = Infinity, to = -Infinity, ranges = {};
    let textRest = "", decoder = undefined;
    let bytesRest = new Uint8Array(0), headerDone = false;
    let csv = undefined, csvRest = "", sniffed = false;
    let watcher = (telem, dataType, timestamps) => {
        let who = identity(telem);
        if(!storeData) { if(who !== telem.id) identities[telem.id] = who; else if(identities[telem.id] !== undefined) who = identities[telem.id]; }
        let key = who + "|" + dataType;
        let range = ranges[key];
        if(range === undefined) range = ranges[key] = { id: telem.id, identity: who, dataType: Number(dataType), from: Infinity, to: -Infinity, count: 0 };
        for(let t of timestamps) {
            if(!(t >= 0)) continue;
            if(t < range.from) range.from = t;
            if(t > range.to) range.to = t;
            range.count++; samples++;
        }
    };
    // What a file holds is read even while data is paused (pausing is for what flows in)
    let reading = (fn) => {
        let paused = TELEPLOT.state.isPaused;
        TELEPLOT.state.isPaused = false;
        let run = () => TELEPLOT.dashboards.withImport(dashboards, () => TELEPLOT.datastore.watchAdds(watcher, fn));
        // A dry run undoes what it created as soon as each piece is read: what arrives between two pieces is not its business
        let restore = storeData ? undefined : TELEPLOT.datastore.rememberIdentity();
        try { return storeData ? run() : TELEPLOT.datastore.dryRun(run); }
        finally { TELEPLOT.state.isPaused = paused; if(restore !== undefined) restore(); }
    };

    // ---- CSV
    let readCSV = (text, last) => {
        if(csv === undefined) { // The header line
            let end = text.indexOf("\n");
            if(end < 0 && !last) { csvRest = text; return; }
            let line = (end < 0 ? text : text.slice(0, end)).replace(/\r$/, "");
            let count = (separator) => _files_csvRecords(line + "\n", separator).records.map((r) => r.length)[0] || 0;
            let separator = [";", "\t", ","].includes(options.separator) ? options.separator : [";", "\t", ","].reduce((best, s) => count(s) > count(best) ? s : best, ",");
            let columns = (_files_csvRecords(line + "\n", separator).records[0] || []).map((name) => name.trim());
            let timeColumn = Number.isInteger(options.timeColumn) && options.timeColumn >= 0 && options.timeColumn < columns.length ? options.timeColumn
                : Math.max(0, columns.findIndex((name) => /^(time|timestamp|date|datetime|t|t_ms|time_ms|ms)$/i.test(name)));
            let lines = columns.length === 3 && columns.filter((name, i) => i !== timeColumn).map((name) => name.toLowerCase()).join(",") === "name,value";
            csv = { separator, timeColumn, timeUnit: ["iso", "ms", "s"].includes(options.timeUnit) ? options.timeUnit : undefined, columns, layout: lines ? "lines" : "columns" };
            text = end < 0 ? "" : text.slice(end + 1);
        }
        let { records, rest } = _files_csvRecords(csvRest + text + (last ? "\n" : ""), csv.separator);
        csvRest = last ? "" : rest;
        let prefix = options.prefix ? String(options.prefix) : "";
        let batches = {}; // name -> { number: {timestamps, values}, text: {...} }
        let put = (name, timestamp, cell) => {
            if(cell === undefined || cell === "") return;
            let batch = batches[name];
            if(batch === undefined) batch = batches[name] = { number: { timestamps: [], values: [] }, text: { timestamps: [], values: [] } };
            let value = Number(cell);
            let kind = cell.trim() !== "" && !isNaN(value) ? batch.number : batch.text;
            kind.timestamps.push(timestamp);
            kind.values.push(kind === batch.number ? value : cell);
        };
        let nameAt = csv.columns.findIndex((name, i) => i !== csv.timeColumn && name.toLowerCase() === "name");
        let valueAt = csv.columns.findIndex((name, i) => i !== csv.timeColumn && name.toLowerCase() === "value");
        for(let record of records) {
            let cell = String(record[csv.timeColumn] === undefined ? "" : record[csv.timeColumn]).trim();
            if(csv.timeUnit === undefined) { let n = Number(cell); csv.timeUnit = cell === "" || isNaN(n) ? "iso" : (n >= 1e11 ? "ms" : "s"); }
            let timestamp = csv.timeUnit === "iso" ? _files_isoToSeconds(cell) : (csv.timeUnit === "ms" ? parseFloat(cell) / 1000 : parseFloat(cell));
            if(!(timestamp >= 0) || !isFinite(timestamp)) { problems++; continue; }
            if(csv.layout === "lines") { if(record[nameAt]) put(prefix + record[nameAt], timestamp, record[valueAt]); else problems++; }
            else for(let c = 0; c < csv.columns.length; c++) if(c !== csv.timeColumn) put(prefix + (csv.columns[c] || "column " + (c + 1)), timestamp, record[c]);
        }
        reading(() => {
            for(let name in batches) {
                let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(name);
                let batch = batches[name];
                if(batch.number.timestamps.length) telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER, batch.number.timestamps, [batch.number.values]);
                if(batch.text.timestamps.length) telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT, batch.text.timestamps, [batch.text.values]);
            }
        });
    };

    // ---- Text
    let readLines = (text) => {
        if(text === "") return;
        problems += reading(() => TELEPLOT.parseDataText(options.serial ? { data: text, fromSerial: true, timestamp: Date.now() } : text));
    };
    let addText = (text, last = false) => {
        if(format === "text" && !sniffed) {
            // A CSV ? Its first line has separators and no ":" (every line of the text protocol has one)
            text = textRest + text;
            textRest = "";
            if(!text.includes("\n") && !last) { textRest = text; return; }
            sniffed = true;
            let first = (text.split("\n").find((line) => line.trim() !== "") || "");
            if(options.format === "csv" || (options.format !== "text" && first !== "" && !first.includes(":") && /[,;\t]/.test(first) && !first.startsWith(">"))) format = "csv";
        }
        if(format === "csv") { readCSV(text, last); return; }
        text = textRest + text;
        let end = last ? text.length : text.lastIndexOf("\n");
        textRest = end < 0 ? text : text.slice(end + 1); // The last line may go on in the next piece
        if(end >= 0) readLines(text.slice(0, end).replace(/\r/g, ""));
    };

    // ---- Binary
    let addBytes = (bytes) => {
        if(bytesRest.length) { let all = new Uint8Array(bytesRest.length + bytes.length); all.set(bytesRest); all.set(bytes, bytesRest.length); bytes = all; }
        let at = 0;
        if(!headerDone) {
            if(bytes.length < TELEPLOT.protocol.FILE_MAGIC.length) { bytesRest = bytes; return; }
            at = TELEPLOT.protocol.FILE_MAGIC.length;
            headerDone = true;
        }
        let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        reading(() => {
            while(at + 4 <= bytes.length) {
                let length = view.getUint32(at, true);
                if(at + 4 + length > bytes.length) break; // The packet goes on in the next piece
                if(!TELEPLOT.parseDataBinary(bytes.subarray(at + 4, at + 4 + length))) problems++;
                at += 4 + length;
            }
        });
        bytesRest = bytes.slice(at);
    };

    return {
        add(piece) {
            let bytes = piece instanceof ArrayBuffer ? new Uint8Array(piece) : (piece instanceof Uint8Array ? piece : undefined);
            if(format === undefined) {
                format = bytes !== undefined && TELEPLOT.files.isBinary(bytes) ? "binary" : "text";
                if(format === "binary") TELEPLOT.parseDataBinary.forgetNames();
            }
            if(format === "binary") { if(bytes !== undefined) addBytes(bytes); else problems++; }
            else if(bytes !== undefined) { if(decoder === undefined) decoder = new TextDecoder(); addText(decoder.decode(bytes, { stream: true })); }
            else addText(String(piece));
        },
        finish() {
            if(format === "binary") { if(bytesRest.length) problems++; } // A packet that was cut
            else if(format !== undefined) { let last = textRest; textRest = ""; addText(last, true); }
            let list = Object.values(ranges).filter((range) => range.count > 0);
            if(!dry && !storeData) { list = []; samples = 0; } // The data was left in the file: nothing to report
            for(let range of list) { if(range.from < from) from = range.from; if(range.to > to) to = range.to; }
            let touched = Array.from(new Set(list.map((range) => range.id)));
            let who = Array.from(new Set(list.map((range) => range.identity)));
            let result = { format: format || "text", samples, telemetries: dry ? who : touched, created: who.filter((one) => !existing.has(one)).length,
                createdIds: dry ? [] : Array.from(new Set(list.filter((range) => !existing.has(range.identity)).map((range) => range.id))),
                from: samples ? from : undefined, to: samples ? to : undefined, ranges: list,
                dashboards: (dry || createDashboards) ? dashboards.finish() : [], dashboardNames: (dry || createDashboards) ? Object.assign({}, dashboards.names) : {}, problems, windowExtended: false, windowNeeded: 0 };
            if(csv !== undefined) result.csv = csv;
            // The data window counts from the newest sample of each telemetry: a telemetry that got more than it lasts loses its start
            let longest = 0;
            let spans = {};
            for(let range of list) { let s = spans[range.identity] = spans[range.identity] || { from: Infinity, to: -Infinity }; s.from = Math.min(s.from, range.from); s.to = Math.max(s.to, range.to); }
            for(let id in spans) longest = Math.max(longest, spans[id].to - spans[id].from);
            if(TELEPLOT.state.dataTimeout > 0 && longest > TELEPLOT.state.dataTimeout) {
                result.windowNeeded = Math.ceil(longest);
                if(options.extendWindow && !dry) { TELEPLOT.state.dataTimeout = result.windowNeeded; result.windowExtended = true; }
            }
            if(!storeData) TELEPLOT.parseDataBinary.forgetNames();
            return result;
        }
    };
}

// Reads a whole file given at once (a string or bytes): see createImport
TELEPLOT.files.importData = function(data, options = {}) {
    let job = TELEPLOT.files.createImport(options);
    job.add(data);
    return job.finish();
}

// Takes back what an import brought (the result of its finish()): for each telemetry, the samples between the oldest and the
// newest the file gave it, limits included. Samples are not marked with where they come from: what else a telemetry holds in that
// period goes too. Telemetries left without any data are forgotten when the file had created them. Returns the number of samples removed.
TELEPLOT.files.removeImported = function(result) {
    let removed = 0;
    for(let range of (result.ranges || [])) {
        let telem = TELEPLOT.datastore.getTelemetry(range.id);
        if(telem !== undefined) removed += telem.removeRange(range.dataType, range.from, range.to);
    }
    for(let id of (result.createdIds || [])) {
        let telem = TELEPLOT.datastore.getTelemetry(id);
        if(telem !== undefined && Object.keys(telem.data).length === 0) delete TELEPLOT.datastore.telemetries[id]; // (its name keeps its id: views find it again if it comes back)
    }
    return removed;
}
