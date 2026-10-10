// All multi-byte values of the binary protocol are little-endian (see doc/binaryProtocol.md), pass this to every DataView read
const _parseDataBinary_LITTLE_ENDIAN = true;

// Returns false when the packet could not be read (true otherwise, also while paused: nothing is wrong then)
TELEPLOT.parseDataBinary = function(msgIn) {
    if(TELEPLOT.state.isPaused) return true;

    // Get input buffer
    if(!(msgIn instanceof ArrayBuffer || msgIn instanceof Uint8Array)) {
        console.error("parseDataBinary: expected ArrayBuffer or Uint8Array");
        return false;
    }
    try {
        let view = msgIn instanceof ArrayBuffer ? new DataView(msgIn) : new DataView(msgIn.buffer, msgIn.byteOffset, msgIn.byteLength);
        if(view.byteLength < 5) { // min: BINARY_MARKER + PROTOCOL_VERSION + CLIENT_ID + CHECKSUM
            throw new Error("Packet too small to contain any data");
        }

        let binaryMarker = view.getUint8(0);
        if (binaryMarker != TELEPLOT.protocol.BINARY_MARKER) {
            throw new Error("Packet doesn't start with BINARY_MARKER");
        }

        let protocolVersion = view.getUint8(1);
        if (protocolVersion != TELEPLOT.protocol.BINARY_VERSION) {
            throw new Error("Packet doesn't start with BINARY_MARKER 0x10");
        }
        
        let clientId = view.getUint16(2, _parseDataBinary_LITTLE_ENDIAN);

        // Extract data section (between CLIENT_ID and CHECKSUM)
        // CHECKSUM is last 2 bytes
        // TODO: implement checksum validation
        let dataLen = view.byteLength - 6; // BINARY_MARKER + PROTOCOL_VERSION + CLIENT_ID + CHECKSUM
        if(dataLen <= 0) {
            throw new Error("No data in packet");
        };

        // Create client if missing
        TELEPLOT.clients.getOrCreateClient(clientId);

        let offset = 4; // skip BINARY_MARKER, PROTOCOL_VERSION and CLIENT_ID
        _parseDataBinary_processSections(view, offset, dataLen + offset, clientId);
        return true;
    }
    catch(e) {
        console.log("parseDataBinary error:", e);
        return false;
    }
}

function _parseDataBinary_processSections(view, offset, endOffset, clientId) {
    while(offset < endOffset) {
        let sectionType = view.getUint8(offset);
        offset++;

        if(sectionType === TELEPLOT.protocol.SECTION_TYPE_RESERVED) {
            console.warn("parseDataBinary: ill-formed packet with RESERVED section type");
            return;
        }

        try {
            switch(sectionType) {
                case TELEPLOT.protocol.SECTION_TYPE_CLIENT_NAME:
                    offset = _parseDataBinary_parseCLIENT_NAME(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_ATTR:
                    offset = _parseDataBinary_parseTELEM_ATTR(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER:
                    offset = _parseDataBinary_parseTELEM_DATA_NUMBER(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D:
                    offset = _parseDataBinary_parseTELEM_DATA_NUMBER_2D(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D:
                    offset = _parseDataBinary_parseTELEM_DATA_NUMBER_3D(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT:
                    offset = _parseDataBinary_parseTELEM_DATA_TEXT(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE:
                    offset = _parseDataBinary_parseTELEM_DATA_IMAGE(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_3D_POSITION(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_3D_ROTATION(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_3D_QUATERNION(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_COLOR_STR(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_COLOR_RGB(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_OPACITY(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_SIZE(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_TEXTURE(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS:
                    offset = _parseDataBinary_parseTELEM_DATA_CAMERA_INTRINSICS(view, offset, clientId);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION:
                    offset = _parseDataBinary_parseTELEM_DATA_CAMERA_DISTORTION(view, offset, clientId);
                    break;
                default:
                    console.warn(`parseDataBinary: unknown section type ${sectionType}`);
                    return;
            }
        }
        catch(e) {
            console.log(`parseDataBinary section type ${sectionType} error:`, e);
            return;
        }
    }
}

// Read an uint64 as a Number (BigInt-free, it is slow). Above 2^53 the lowest bits are lost, which is the precision of a double anyway.
function _parseDataBinary_readUint64(view, offset) {
    return view.getUint32(offset + 4, _parseDataBinary_LITTLE_ENDIAN) * 4294967296 + view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN); // Low part first
}

// Timestamps are in seconds in the datastore (a double keeps ~200ns of precision for unix timestamps)
// ref is the section TIME_REFERENCE in seconds (see _parseDataBinary_readTELEM_DATA_HEADER), diff is a TIMEDIFF in nanoseconds
function _parseDataBinary_makeTimestamp(ref, diff) {
    return ref + diff / 1e9;
}

function _parseDataBinary_setCombineClientAndTelem(clientId, telemId) {
    let combinedId = clientId * 0x10000 + telemId;
    let telem = TELEPLOT.datastore.getOrCreateTelemetry(combinedId);
    telem.clientId = clientId;
    return combinedId
}

const _parseDataBinary_textDecoder = new TextDecoder();

function _parseDataBinary_readString(view, offset) {
    let end = offset;
    while(end < view.byteLength && view.getUint8(end) !== 0) { end++; }
    let text = _parseDataBinary_textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + offset, end - offset));
    return [text, end + 1]; // skip null terminator
}

function _parseDataBinary_parseCLIENT_NAME(view, offset, clientId) {
    let [name, newOffset] = _parseDataBinary_readString(view, offset);
    offset = newOffset;
    let client = TELEPLOT.clients.getOrCreateClient(clientId);
    client.name = name;
    return offset;
}

function _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId) {
    let telemId = view.getUint16(offset, _parseDataBinary_LITTLE_ENDIAN);
    offset += 2;
    let combinedId = _parseDataBinary_setCombineClientAndTelem(clientId, telemId);

    let timeRef = _parseDataBinary_readUint64(view, offset) / 1e9; // nanoseconds to seconds
    offset += 8;
    let count = view.getUint8(offset);
    offset++;
    return [combinedId, timeRef, count, offset];
}

function _parseDataBinary_parseTELEM_ATTR(view, offset, clientId) {
    let telemId = view.getUint16(offset, _parseDataBinary_LITTLE_ENDIAN);
    offset += 2;
    let combinedId = _parseDataBinary_setCombineClientAndTelem(clientId, telemId);
    let count = view.getUint8(offset);
    offset++;

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(combinedId);

    for(let i = 0; i < count; i++) {
        let attrCode = view.getUint8(offset);
        offset++;

        switch(attrCode) {
            case TELEPLOT.protocol.TELEM_ATTR_NAME: {
                let [name, newOffset] = _parseDataBinary_readString(view, offset);
                telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME, name);
                offset = newOffset;
                break;
            }
            case TELEPLOT.protocol.TELEM_ATTR_UNIT: {
                let [unit, newOffset] = _parseDataBinary_readString(view, offset);
                telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT, unit);
                offset = newOffset;
                break;
            }
            case TELEPLOT.protocol.TELEM_ATTR_COLOR: {
                let [color, newOffset] = _parseDataBinary_readString(view, offset);
                telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_COLOR, color);
                offset = newOffset;
                break;
            }
            case TELEPLOT.protocol.TELEM_ATTR_AUTOPLOT: {
                let autoplot = view.getUint8(offset) !== 0;
                telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_AUTOPLOT, autoplot);
                offset++;
                break;
            }
            case TELEPLOT.protocol.TELEM_ATTR_DATA_TIMEOUT: {
                let timeout = _parseDataBinary_readUint64(view, offset) / 1e9; // nanoseconds on the wire, seconds in the datastore (like TELEPLOT.state.dataTimeout)
                telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_DATA_TIMEOUT, timeout);
                offset += 8;
                break;
            }
            case TELEPLOT.protocol.TELEM_ATTR_SHAPE: {
                let shapeType = view.getUint8(offset);
                offset++;
                let shapeData = ""; // Only an STL file has data: its url
                if(shapeType === TELEPLOT.protocol.TELEM_ATTR_SHAPE_TYPE_STL) {
                    let [url, newOffset] = _parseDataBinary_readString(view, offset);
                    shapeData = url;
                    offset = newOffset;
                }
                telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_SHAPE, {type: shapeType, data: shapeData});
                break;
            }
            case TELEPLOT.protocol.TELEM_ATTR_VIEW_LABEL: {
                let [label, newOffset] = _parseDataBinary_readString(view, offset);
                telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_VIEW_LABEL, label);
                offset = newOffset;
                break;
            }
            default:
                console.warn(`parseDataBinary: unknown TELEM_ATTR code ${attrCode}`);
        }
    }

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_NUMBER(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let values = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN); // nanoseconds
        offset += 4;
        let value = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        values.push(value);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER, timestamps, [values]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_NUMBER_2D(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let xValues = [];
    let yValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let x = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let y = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        xValues.push(x);
        yValues.push(y);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D, timestamps, [xValues, yValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_NUMBER_3D(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let xValues = [];
    let yValues = [];
    let zValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let x = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let y = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let z = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        xValues.push(x);
        yValues.push(y);
        zValues.push(z);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D, timestamps, [xValues, yValues, zValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_TEXT(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let textValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let [text, newOffset] = _parseDataBinary_readString(view, offset);
        offset = newOffset;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        textValues.push(text);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT, timestamps, [textValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_IMAGE(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let types = [];
    let images = []; // base64, like the images of the text protocol

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let imageType = view.getUint8(offset);
        offset++;
        let partIndex = view.getUint16(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 2;
        let partCount = view.getUint16(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 2;
        let partSize = view.getUint16(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 2;
        let buffer = new Uint8Array(view.buffer, view.byteOffset + offset, partSize);
        offset += partSize;
        
        let timestamp = _parseDataBinary_makeTimestamp(timeRef, timeDiff);
        let bytes = buffer;
        if(partCount > 1) { // An image in several parts (indexes 0 to count-1, same timestamp): stored once they are all there
            let pending = _parseDataBinary_imageParts[telemId];
            if(pending === undefined || pending.timestamp !== timestamp || pending.partCount !== partCount || pending.type !== imageType) {
                pending = _parseDataBinary_imageParts[telemId] = { timestamp, partCount, type: imageType, parts: {}, received: 0 };
            }
            if(partIndex >= partCount) continue;
            if(pending.parts[partIndex] === undefined) pending.received++;
            pending.parts[partIndex] = buffer.slice(); // The packet buffer does not outlive this call
            if(pending.received < partCount) continue;
            delete _parseDataBinary_imageParts[telemId];
            let total = 0;
            for(let p = 0; p < partCount; p++) total += pending.parts[p].length;
            bytes = new Uint8Array(total);
            for(let p = 0, at = 0; p < partCount; p++) { bytes.set(pending.parts[p], at); at += pending.parts[p].length; }
        }
        timestamps.push(timestamp);
        types.push(imageType);
        images.push(_parseDataBinary_toBase64(bytes));
    }

    if(timestamps.length) {
        let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
        telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE, timestamps, [types, images]);
    }

    return offset;
}

const _parseDataBinary_imageParts = {}; // telemetry id -> parts of the image being received

function _parseDataBinary_toBase64(bytes) {
    let binary = "";
    for(let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); // By chunks: arguments are limited
    return btoa(binary);
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_3D_POSITION(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let xValues = [];
    let yValues = [];
    let zValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let x = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let y = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let z = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        xValues.push(x);
        yValues.push(y);
        zValues.push(z);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION, timestamps, [xValues, yValues, zValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_3D_ROTATION(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let rValues = [];
    let pValues = [];
    let yValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let r = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let p = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let y = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        rValues.push(r);
        pValues.push(p);
        yValues.push(y);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION, timestamps, [rValues, pValues, yValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_3D_QUATERNION(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let wValues = [];
    let xValues = [];
    let yValues = [];
    let zValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let w = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let x = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let y = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let z = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        wValues.push(w);
        xValues.push(x);
        yValues.push(y);
        zValues.push(z);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION, timestamps, [wValues, xValues, yValues, zValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_COLOR_STR(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let colorValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let [color, newOffset] = _parseDataBinary_readString(view, offset);
        offset = newOffset;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        colorValues.push(color);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR, timestamps, [colorValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_COLOR_RGB(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let rValues = [];
    let gValues = [];
    let bValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let r = view.getUint8(offset);
        offset++;
        let g = view.getUint8(offset);
        offset++;
        let b = view.getUint8(offset);
        offset++;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        rValues.push(r);
        gValues.push(g);
        bValues.push(b);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB, timestamps, [rValues, gValues, bValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_OPACITY(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let opacityValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let opacity = view.getUint8(offset);
        offset++;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        opacityValues.push(opacity);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY, timestamps, [opacityValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_SIZE(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let xValues = [];
    let yValues = [];
    let zValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let x = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let y = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let z = view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        xValues.push(x);
        yValues.push(y);
        zValues.push(z);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE, timestamps, [xValues, yValues, zValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_TEXTURE(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let textureTypes = [];
    let textureValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        let textureType = view.getUint8(offset);
        offset++;
        let [value, newOffset] = _parseDataBinary_readString(view, offset);
        offset = newOffset;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        textureTypes.push(textureType);
        textureValues.push(value);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE, timestamps, [textureTypes, textureValues]);

    return offset;
}

// Camera of an image telemetry: {width[16], height[16], fx, fy, cx, cy} (pinhole model, in pixels of an image of width x height)
function _parseDataBinary_parseTELEM_DATA_CAMERA_INTRINSICS(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let channels = [[], [], [], [], [], []]; // width, height, fx, fy, cx, cy

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        channels[0].push(view.getUint16(offset, _parseDataBinary_LITTLE_ENDIAN));
        offset += 2;
        channels[1].push(view.getUint16(offset, _parseDataBinary_LITTLE_ENDIAN));
        offset += 2;
        for(let c = 2; c < 6; c++) {
            channels[c].push(view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN));
            offset += 4;
        }
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS, timestamps, channels);

    return offset;
}

// Lens distortion of the camera of an image telemetry: {k1, k2, p1, p2, k3} (Brown-Conrady model)
function _parseDataBinary_parseTELEM_DATA_CAMERA_DISTORTION(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let channels = [[], [], [], [], []]; // k1, k2, p1, p2, k3

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, _parseDataBinary_LITTLE_ENDIAN);
        offset += 4;
        for(let c = 0; c < 5; c++) {
            channels[c].push(view.getFloat32(offset, _parseDataBinary_LITTLE_ENDIAN));
            offset += 4;
        }
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION, timestamps, channels);

    return offset;
}
