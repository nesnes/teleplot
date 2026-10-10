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
    str(s) { this.bytes.push(...Buffer.from(s, 'utf8'), 0); return this; }

    clientName(name) { return this.u8(SECTION.CLIENT_NAME).str(name); }
    // attrs: [[code, value], ...]
    attrs(telemId, list) {
        this.u8(SECTION.ATTR).u16(telemId).u8(list.length);
        for (const [code, value] of list) {
            this.u8(code);
            if (code === P.AUTOPLOT) this.u8(value ? 1 : 0);
            else if (code === P.TIMEOUT) this.u64(value); // nanoseconds
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
    shapeTexture(telemId, refNs, samples) { return this._data(SECTION.SHAPE_TEXTURE, telemId, refNs, samples, v => this.u8(v[0]).str(v[1])); }
    // Cameras. intrinsics: width, height (uint16), fx, fy, cx, cy; distortion: k1, k2, p1, p2, k3
    cameraIntrinsics(telemId, refNs, samples) { return this._data(SECTION.CAMERA_INTRINSICS, telemId, refNs, samples, v => { this.u16(v[0]).u16(v[1]); v.slice(2).forEach(x => this.f32(x)); }); }
    cameraDistortion(telemId, refNs, samples) { return this._data(SECTION.CAMERA_DISTORTION, telemId, refNs, samples, v => v.forEach(x => this.f32(x))); }
    // Images. samples: [[timeDiffNs, type, partIndex, partCount, bytes]]
    images(telemId, refNs, samples) { return this._data(24, telemId, refNs, samples, v => { this.u8(v[0]).u16(v[1]).u16(v[2]).u16(v[3].length); this.bytes.push(...v[3]); }); }
    text(telemId, refNs, samples) { return this._data(SECTION.TEXT, telemId, refNs, samples, v => this.str(v[0])); }

    build() { // The checksum is not verified by the parser yet: zeros
        const bytes = Uint8Array.from([...this.bytes, 0, 0]);
        return bytes.buffer;
    }
}

module.exports = { PacketBuilder, ATTR: P };
