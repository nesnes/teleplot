// Builds binary protocol packets (little-endian, see doc/binaryProtocol.md) independently of the library parser
const P = { NAME: 0, UNIT: 1, COLOR: 2, AUTOPLOT: 3, TIMEOUT: 4 };
const SECTION = { CLIENT_NAME: 1, ATTR: 10, NUMBER: 20, NUMBER_2D: 21, NUMBER_3D: 22, TEXT: 23 };

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
    text(telemId, refNs, samples) { return this._data(SECTION.TEXT, telemId, refNs, samples, v => this.str(v[0])); }

    build() { // The checksum is not verified by the parser yet: zeros
        const bytes = Uint8Array.from([...this.bytes, 0, 0]);
        return bytes.buffer;
    }
}

module.exports = { PacketBuilder, ATTR: P };
