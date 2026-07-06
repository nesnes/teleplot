TELEPLOT.parseDataBinary = function(msgIn) {
    if(TELEPLOT.state.isPaused) return;

    console.log("ParseBinary", msgIn)

    // Get input buffer
    if(!(msgIn instanceof ArrayBuffer || msgIn instanceof Uint8Array)) {
        console.error("parseDataBinary: expected ArrayBuffer or Uint8Array");
        return;
    }
    let buffer = msgIn instanceof ArrayBuffer ? msgIn : msgIn.buffer;
    if(msgIn instanceof Uint8Array && msgIn.byteOffset) {
        buffer = msgIn.buffer.slice(msgIn.byteOffset, msgIn.byteOffset + msgIn.byteLength);
    }

    try {
        let view = new DataView(buffer);
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
        
        let clientId = view.getUint16(2);

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
    }
    catch(e) {
        console.log("parseDataBinary error:", e);
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

function _parseDataBinary_makeTimestamp(ref, diff) {
    const ns = BigInt(ref) + BigInt(diff);
    const sec = ns / 1000000000n;
    const rem = ns % 1000000000n;
    return Number(sec) + Number(rem) / 1e9;
}

function _parseDataBinary_setCombineClientAndTelem(clientId, telemId) {
    let combinedId = clientId * 0x10000 + telemId;
    let telem = TELEPLOT.datastore.getOrCreateTelemetry(combinedId);
    telem.clientId = clientId;
    return combinedId
}

function _parseDataBinary_readString(view, offset) {
    let bytes = [];
    while(offset < view.byteLength && view.getUint8(offset) !== 0) {
        bytes.push(view.getUint8(offset));
        offset++;
    }
    offset++; // skip null terminator
    return [new TextDecoder().decode(new Uint8Array(bytes)), offset];
}

function _parseDataBinary_parseCLIENT_NAME(view, offset, clientId) {
    let [name, newOffset] = _parseDataBinary_readString(view, offset);
    offset = newOffset;
    let client = TELEPLOT.clients.getOrCreateClient(clientId);
    client.name = name;
    return offset;
}

function _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId) {
    let telemId = view.getUint16(offset);
    offset += 2;
    let combinedId = _parseDataBinary_setCombineClientAndTelem(clientId, telemId);
    let telem = TELEPLOT.datastore.getOrCreateTelemetry(combinedId);

    let timeRef = view.getBigUint64(offset); // nanoseconds as BigInt
    offset += 8;
    let count = view.getUint8(offset);
    offset++;
    return [combinedId, timeRef, count, offset];
}

function _parseDataBinary_parseTELEM_ATTR(view, offset, clientId) {
    let telemId = view.getUint16(offset);
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
                let timeout = view.getBigUint64(offset);
                telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_DATA_TIMEOUT, timeout);
                offset += 8;
                break;
            }
            case TELEPLOT.protocol.TELEM_ATTR_SHAPE: {
                let shapeType = view.getUint8(offset);
                offset++;
                let shapeData = null;
                if(shapeType === TELEPLOT.protocol.TELEM_ATTR_SHAPE_TYPE_STL) {
                    let [url, newOffset] = _parseDataBinary_readString(view, offset);
                    shapeData = url;
                    offset = newOffset;
                }
                telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_SHAPE, {type: shapeType, data: shapeData});
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
        let timeDiff = view.getUint32(offset); // nanoseconds
        offset += 4;
        let value = view.getFloat32(offset);
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
        let timeDiff = view.getUint32(offset);
        offset += 4;
        let x = view.getFloat32(offset);
        offset += 4;
        let y = view.getFloat32(offset);
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
        let timeDiff = view.getUint32(offset);
        offset += 4;
        let x = view.getFloat32(offset);
        offset += 4;
        let y = view.getFloat32(offset);
        offset += 4;
        let z = view.getFloat32(offset);
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
        let timeDiff = view.getUint32(offset);
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
    let imageData = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset);
        offset += 4;
        let imageType = view.getUint8(offset);
        offset++;
        let partIndex = view.getUint16(offset);
        offset += 2;
        let partCount = view.getUint16(offset);
        offset += 2;
        let partSize = view.getUint16(offset);
        offset += 2;
        let buffer = new Uint8Array(view.buffer, view.byteOffset + offset, partSize);
        offset += partSize;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        // TODO: implement image reassembly and rendering
        imageData.push({type: imageType, partIndex, partCount, buffer});
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    // TODO: call addData with proper image handling once image rendering is implemented
    // telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE, timestamps, [imageData]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_3D_POSITION(view, offset, clientId) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset, clientId);
    offset = newOffset;

    let timestamps = [];
    let xValues = [];
    let yValues = [];
    let zValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset);
        offset += 4;
        let x = view.getFloat32(offset);
        offset += 4;
        let y = view.getFloat32(offset);
        offset += 4;
        let z = view.getFloat32(offset);
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
        let timeDiff = view.getUint32(offset);
        offset += 4;
        let r = view.getFloat32(offset);
        offset += 4;
        let p = view.getFloat32(offset);
        offset += 4;
        let y = view.getFloat32(offset);
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
        let timeDiff = view.getUint32(offset);
        offset += 4;
        let w = view.getFloat32(offset);
        offset += 4;
        let x = view.getFloat32(offset);
        offset += 4;
        let y = view.getFloat32(offset);
        offset += 4;
        let z = view.getFloat32(offset);
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
        let timeDiff = view.getUint32(offset);
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
        let timeDiff = view.getUint32(offset);
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
        let timeDiff = view.getUint32(offset);
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
        let timeDiff = view.getUint32(offset);
        offset += 4;
        let x = view.getFloat32(offset);
        offset += 4;
        let y = view.getFloat32(offset);
        offset += 4;
        let z = view.getFloat32(offset);
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
    let textureData = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset);
        offset += 4;
        let textureType = view.getUint8(offset);
        offset++;
        let [value, newOffset] = _parseDataBinary_readString(view, offset);
        offset = newOffset;
        
        timestamps.push(_parseDataBinary_makeTimestamp(timeRef, timeDiff));
        textureData.push({type: textureType, value: value});
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE, timestamps, [textureData]);

    return offset;
}
