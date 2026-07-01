TELEPLOT.parseDataBinary = function(msgIn) {
    if(TELEPLOT.state.isPaused) return;

    // Get input buffer
    if(!(msgIn.data instanceof ArrayBuffer || msgIn.data instanceof Uint8Array)) {
        console.error("parseDataBinary: expected ArrayBuffer or Uint8Array");
        return;
    }
    let buffer = msgIn.data instanceof ArrayBuffer ? msgIn.data : msgIn.data.buffer;
    if(msgIn.data instanceof Uint8Array && msgIn.data.byteOffset) {
        buffer = msgIn.data.buffer.slice(msgIn.data.byteOffset, msgIn.data.byteOffset + msgIn.data.byteLength);
    }

    try {
        let view = new DataView(buffer);
        if(view.byteLength < 3) return; // min: PROTOCOL_VERSION + PACKET_ID + CHECKSUM

        let protocolVersion = view.getUint8(0);
        // TODO: verify protocolVersion matches expected version
        
        let packetId = view.getUint8(1);
        // TODO: implement packet loss detection using packetId

        // Extract data section (between PACKET_ID and CHECKSUM)
        // CHECKSUM is last 16 bytes, but exact checksum algorithm not yet defined
        // TODO: implement checksum validation
        let dataLen = view.byteLength - 2 - 16; // PROTOCOL_VERSION + PACKET_ID + CHECKSUM
        if(dataLen < 0) return;

        let offset = 2; // skip PROTOCOL_VERSION and PACKET_ID
        _parseDataBinary_processSections(view, offset, dataLen + offset);
    }
    catch(e) {
        console.log("parseDataBinary error:", e);
    }
}

function _parseDataBinary_processSections(view, offset, endOffset) {
    while(offset < endOffset) {
        let sectionType = view.getUint8(offset);
        offset++;

        if(sectionType === TELEPLOT.protocol.SECTION_TYPE_RESERVED) {
            console.warn("parseDataBinary: ill-formed packet with RESERVED section type");
            return;
        }

        try {
            switch(sectionType) {
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_ATTR:
                    offset = _parseDataBinary_parseTELEM_ATTR(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER:
                    offset = _parseDataBinary_parseTELEM_DATA_NUMBER(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D:
                    offset = _parseDataBinary_parseTELEM_DATA_NUMBER_2D(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D:
                    offset = _parseDataBinary_parseTELEM_DATA_NUMBER_3D(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT:
                    offset = _parseDataBinary_parseTELEM_DATA_TEXT(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE:
                    offset = _parseDataBinary_parseTELEM_DATA_IMAGE(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_3D_POSITION(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_3D_ROTATION(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_3D_QUATERNION(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_COLOR_STR(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_COLOR_RGB(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_OPACITY(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_SIZE(view, offset);
                    break;
                case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE:
                    offset = _parseDataBinary_parseTELEM_DATA_SHAPE_TEXTURE(view, offset);
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

function _parseDataBinary_readString(view, offset) {
    let bytes = [];
    while(offset < view.byteLength && view.getUint8(offset) !== 0) {
        bytes.push(view.getUint8(offset));
        offset++;
    }
    offset++; // skip null terminator
    return [new TextDecoder().decode(new Uint8Array(bytes)), offset];
}

function _parseDataBinary_readTELEM_DATA_HEADER(view, offset) {
    let telemId = view.getUint16(offset, true); // little-endian
    offset += 2;
    let timeRef = view.getBigUint64(offset, true); // nanoseconds as BigInt
    offset += 8;
    let count = view.getUint8(offset);
    offset++;
    return [telemId, timeRef, count, offset]; // return timeRef as BigInt
}

function _parseDataBinary_parseTELEM_ATTR(view, offset) {
    let telemId = view.getUint16(offset, true);
    offset += 2;
    let count = view.getUint8(offset);
    offset++;

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);

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
                let timeout = view.getBigUint64(offset, true);
                telemetry.setAttribute(TELEPLOT.protocol.TELEM_ATTR_DATA_TIMEOUT, timeout);
                offset += 8;
                break;
            }
            case TELEPLOT.protocol.TELEM_ATTR_SHAPE: {
                let shapeType = view.getUint8(offset);
                offset++;
                let shapeData = null;
                if(shapeType === TELEPLOT.protocol.TELEM_ATTR_SHAPE_STL) {
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

function _parseDataBinary_parseTELEM_DATA_NUMBER(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let values = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true); // nanoseconds
        offset += 4;
        let value = view.getFloat32(offset, true);
        offset += 4;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        values.push(value);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER, timestamps, [values]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_NUMBER_2D(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let xValues = [];
    let yValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true);
        offset += 4;
        let x = view.getFloat32(offset, true);
        offset += 4;
        let y = view.getFloat32(offset, true);
        offset += 4;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        xValues.push(x);
        yValues.push(y);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D, timestamps, [xValues, yValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_NUMBER_3D(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let xValues = [];
    let yValues = [];
    let zValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true);
        offset += 4;
        let x = view.getFloat32(offset, true);
        offset += 4;
        let y = view.getFloat32(offset, true);
        offset += 4;
        let z = view.getFloat32(offset, true);
        offset += 4;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        xValues.push(x);
        yValues.push(y);
        zValues.push(z);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D, timestamps, [xValues, yValues, zValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_TEXT(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let textValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true);
        offset += 4;
        let [text, newOffset] = _parseDataBinary_readString(view, offset);
        offset = newOffset;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        textValues.push(text);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT, timestamps, [textValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_IMAGE(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let imageData = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true);
        offset += 4;
        let imageType = view.getUint8(offset);
        offset++;
        let partIndex = view.getUint16(offset, true);
        offset += 2;
        let partCount = view.getUint16(offset, true);
        offset += 2;
        let partSize = view.getUint16(offset, true);
        offset += 2;
        let buffer = new Uint8Array(view.buffer, view.byteOffset + offset, partSize);
        offset += partSize;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        // TODO: implement image reassembly and rendering
        imageData.push({type: imageType, partIndex, partCount, buffer});
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    // TODO: call addData with proper image handling once image rendering is implemented
    // telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE, timestamps, [imageData]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_3D_POSITION(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let xValues = [];
    let yValues = [];
    let zValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true);
        offset += 4;
        let x = view.getFloat32(offset, true);
        offset += 4;
        let y = view.getFloat32(offset, true);
        offset += 4;
        let z = view.getFloat32(offset, true);
        offset += 4;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        xValues.push(x);
        yValues.push(y);
        zValues.push(z);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION, timestamps, [xValues, yValues, zValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_3D_ROTATION(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let rValues = [];
    let pValues = [];
    let yValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true);
        offset += 4;
        let r = view.getFloat32(offset, true);
        offset += 4;
        let p = view.getFloat32(offset, true);
        offset += 4;
        let y = view.getFloat32(offset, true);
        offset += 4;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        rValues.push(r);
        pValues.push(p);
        yValues.push(y);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION, timestamps, [rValues, pValues, yValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_3D_QUATERNION(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let wValues = [];
    let xValues = [];
    let yValues = [];
    let zValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true);
        offset += 4;
        let w = view.getFloat32(offset, true);
        offset += 4;
        let x = view.getFloat32(offset, true);
        offset += 4;
        let y = view.getFloat32(offset, true);
        offset += 4;
        let z = view.getFloat32(offset, true);
        offset += 4;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        wValues.push(w);
        xValues.push(x);
        yValues.push(y);
        zValues.push(z);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION, timestamps, [wValues, xValues, yValues, zValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_COLOR_STR(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let colorValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true);
        offset += 4;
        let [color, newOffset] = _parseDataBinary_readString(view, offset);
        offset = newOffset;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        colorValues.push(color);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR, timestamps, [colorValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_COLOR_RGB(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let rValues = [];
    let gValues = [];
    let bValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true);
        offset += 4;
        let r = view.getUint8(offset);
        offset++;
        let g = view.getUint8(offset);
        offset++;
        let b = view.getUint8(offset);
        offset++;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        rValues.push(r);
        gValues.push(g);
        bValues.push(b);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB, timestamps, [rValues, gValues, bValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_OPACITY(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let opacityValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true);
        offset += 4;
        let opacity = view.getUint8(offset);
        offset++;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        opacityValues.push(opacity);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY, timestamps, [opacityValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_SIZE(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let xValues = [];
    let yValues = [];
    let zValues = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true);
        offset += 4;
        let x = view.getFloat32(offset, true);
        offset += 4;
        let y = view.getFloat32(offset, true);
        offset += 4;
        let z = view.getFloat32(offset, true);
        offset += 4;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        xValues.push(x);
        yValues.push(y);
        zValues.push(z);
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE, timestamps, [xValues, yValues, zValues]);

    return offset;
}

function _parseDataBinary_parseTELEM_DATA_SHAPE_TEXTURE(view, offset) {
    let [telemId, timeRef, count, newOffset] = _parseDataBinary_readTELEM_DATA_HEADER(view, offset);
    offset = newOffset;

    let timestamps = [];
    let textureData = [];

    for(let i = 0; i < count; i++) {
        let timeDiff = view.getUint32(offset, true);
        offset += 4;
        let textureType = view.getUint8(offset);
        offset++;
        let [value, newOffset] = _parseDataBinary_readString(view, offset);
        offset = newOffset;
        
        timestamps.push(Number((timeRef + BigInt(timeDiff)) / BigInt(1e9)));
        textureData.push({type: textureType, value: value});
    }

    let telemetry = TELEPLOT.datastore.getOrCreateTelemetry(telemId);
    telemetry.addData(TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE, timestamps, [textureData]);

    return offset;
}
