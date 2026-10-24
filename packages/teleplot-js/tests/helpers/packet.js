// Builds binary protocol packets (little-endian, see doc/binaryProtocol.md) independently of the library parser
const P = { NAME: 0, UNIT: 1, COLOR: 2, AUTOPLOT: 3, TIMEOUT: 4, SHAPE: 5 };
const SECTION = { CLIENT_NAME: 1, ATTR: 10, NUMBER: 20, NUMBER_2D: 21, NUMBER_3D: 22, TEXT: 23,
    SHAPE_POSITION: 25, SHAPE_ROTATION: 26, SHAPE_QUATERNION: 27, SHAPE_COLOR_STR: 28, SHAPE_COLOR_RGB: 29, SHAPE_OPACITY: 30, SHAPE_SIZE: 31, SHAPE_TEXTURE: 32,
    CAMERA_INTRINSICS: 33, CAMERA_DISTORTION: 34 };

class PacketBuilder {
    constructor(clientId = 1) {
        this.bytes = [0x10, 1];
        this.u16(clientId);
    }
    u8(v) { this.bytes.push(v & 0xff); return this; }
    u16(v) { return this.u8(v).u8(v >> 8); }
    u32(v) { return this.u16(v & 0xffff).u16(Math.floor(v / 65536)); }
    u64(v) { v = BigInt(v); return this.u32(Number(v & 0xffffffffn)).u32(Number(v >> 32n)); }
    f32(v) { const b = Buffer.alloc(4); b.writeFloatLE(v); this.bytes.push(...b); return this; }
    f64(v) { const b = Buffer.alloc(8); b.writeDoubleLE(v); this.bytes.push(...b); return this; }
    str(s) { this.bytes.push(...Buffer.from(s, 'utf8'), 0); return this; }

    clientName(name) { return this.u8(SECTION.CLIENT_NAME).str(name); }
    dashboard(lines) { return this.u8(2).str(lines); } // Dashboard lines ("DASH|..."), separated by line feeds
    // attrs: [[code, value], ...]
    attrs(telemId, list) {
        this.u8(SECTION.ATTR).u16(telemId).u8(list.length);
        for (const [code, value] of list) {
            this.u8(code);
            if (code === P.AUTOPLOT || code === 7 || code === 10) this.u8(value ? 1 : 0); // (7: TELEM_ATTR_LOG, 10: TELEM_ATTR_STACK)
            else if (code === P.TIMEOUT) this.u64(value); // nanoseconds
            else if (code === 9) this.f64(value.min === undefined ? NaN : value.min).f64(value.max === undefined ? NaN : value.max); // (9: TELEM_ATTR_RANGE) {min, max}
            else if (code === 16) this.f64(value.scale).f64(value.invalid === undefined ? NaN : value.invalid).u8(value.depth === false ? 1 : 0); // (16: TELEM_ATTR_PIXELS) {scale, invalid, depth}
            else if (code === 8) this.u8(value.type).str(value.name); // (8: TELEM_ATTR_FRAME) {type: 0 pose | 1 pixels, name}
            // (11: TELEM_ATTR_WRITE) {kind 0 none | 1 setting | 2 action, type (index in WRITE_TYPES), flags (1 confirm, 2 longpress), step, rate, hold, axes (bits x, y, yaw)}
            else if (code === 11) this.u8(value.kind).u8(value.type || 0).u8(value.flags || 0).f64(value.step === undefined ? NaN : value.step).u16(value.rate || 0).u16(value.hold || 0).u8(value.axes || 0);
            // (13: TELEM_ATTR_ARGS) one argument {index, type, flags (1 optional), min, max, step, name, unit, default, choices (line feeds), desc}
            else if (code === 13) {
                this.u8(value.index).u8(value.type).u8(value.flags || 0);
                for (const key of ['min', 'max', 'step']) this.f64(value[key] === undefined ? NaN : value[key]);
                for (const key of ['name', 'unit', 'default', 'choices', 'desc']) this.str(value[key] || '');
            }
            else if (code === P.SHAPE) { this.u8(value.type); if (value.type === 10) this.str(value.url); } // {type, url}: the url only for an STL file
            else this.str(value);
        }
        return this;
    }
    // samples: [[timeDiffNs, ...values]]
    _data(type, telemId, refNs, samples, writeValues) {
        this.u8(type).u16(telemId).u64(refNs).u8(samples.length);
        for (const [diff, ...values] of samples) { this.u32(diff); writeValues(values); }
        return this;
    }
    numbers(telemId, refNs, samples) { return this._data(SECTION.NUMBER, telemId, refNs, samples, v => v.forEach(x => this.f32(x))); }
    numbers2D(telemId, refNs, samples) { return this._data(SECTION.NUMBER_2D, telemId, refNs, samples, v => v.forEach(x => this.f32(x))); }
    numbers3D(telemId, refNs, samples) { return this._data(SECTION.NUMBER_3D, telemId, refNs, samples, v => v.forEach(x => this.f32(x))); }
    // 3D shapes. floats: position (x, y, z), rotation (roll, pitch, yaw), quaternion (w, x, y, z), size (x, y, z)
    shapeFloats(section, telemId, refNs, samples) { return this._data(SECTION[section], telemId, refNs, samples, v => v.forEach(x => this.f32(x))); }
    shapeColorStr(telemId, refNs, samples) { return this._data(SECTION.SHAPE_COLOR_STR, telemId, refNs, samples, v => this.str(v[0])); }
    shapeColorRGB(telemId, refNs, samples) { return this._data(SECTION.SHAPE_COLOR_RGB, telemId, refNs, samples, v => v.forEach(x => this.u8(x))); }
    shapeOpacity(telemId, refNs, samples) { return this._data(SECTION.SHAPE_OPACITY, telemId, refNs, samples, v => this.u8(v[0])); }
    // Flat shapes: the vector of an arrow (x, y, z), a line width, a text
    shapeVector(telemId, refNs, samples) { return this._data(37, telemId, refNs, samples, v => v.forEach(x => this.f32(x))); }
    shapeText(telemId, refNs, samples) { return this._data(38, telemId, refNs, samples, v => this.str(v[0])); }
    shapeLineWidth(telemId, refNs, samples) { return this._data(39, telemId, refNs, samples, v => this.f32(v[0])); }
    shapeTexture(telemId, refNs, samples) { return this._data(SECTION.SHAPE_TEXTURE, telemId, refNs, samples, v => this.u8(v[0]).str(v[1])); }
    // Cameras. intrinsics: width, height (uint16), fx, fy, cx, cy; distortion: k1, k2, p1, p2, k3
    cameraIntrinsics(telemId, refNs, samples) { return this._data(SECTION.CAMERA_INTRINSICS, telemId, refNs, samples, v => { this.u16(v[0]).u16(v[1]); v.slice(2).forEach(x => this.f32(x)); }); }
    cameraDistortion(telemId, refNs, samples) { return this._data(SECTION.CAMERA_DISTORTION, telemId, refNs, samples, v => v.forEach(x => this.f32(x))); }
    // Images. samples: [[timeDiffNs, type, partIndex, partCount, bytes]]
    images(telemId, refNs, samples) { return this._data(24, telemId, refNs, samples, v => { this.u8(v[0]).u16(v[1]).u16(v[2]).u16(v[3].length); this.bytes.push(...v[3]); }); }
    // Point clouds. samples: [[timeDiffNs, flags (1: intensity, 2: rgb), partIndex, partCount, points]], points: [[x, y, z, (intensity), (r, g, b)]]
    pointClouds(telemId, refNs, samples) {
        return this._data(35, telemId, refNs, samples, v => {
            this.u8(v[0]).u16(v[1]).u16(v[2]).u16(v[3].length);
            for (const p of v[3]) {
                this.f32(p[0]).f32(p[1]).f32(p[2]);
                let at = 3;
                if (v[0] & 1) this.f32(p[at++]);
                if (v[0] & 2) this.u8(p[at]).u8(p[at + 1]).u8(p[at + 2]);
            }
        });
    }
    // samples: [[timeDiffNs, operator (0: below, 1: above), value, name, color]]
    thresholds(telemId, refNs, samples) { return this._data(40, telemId, refNs, samples, v => this.u8(v[0]).f64(v[1]).str(v[2]).str(v[3] || '')); }
    text(telemId, refNs, samples) { return this._data(SECTION.TEXT, telemId, refNs, samples, v => this.str(v[0])); }
    // An answer to a command (42): status 0 ok, 1 error, 2 running; callId 0xFFFF for a setting
    answer(telemId, callId, status, text = '') { return this.u8(42).u16(telemId).u16(callId).u8(status).str(text); }

    build() { // The checksum is not verified by the parser yet: zeros
        const bytes = Uint8Array.from([...this.bytes, 0, 0]);
        return bytes.buffer;
    }
}

module.exports = { PacketBuilder, ATTR: P };
