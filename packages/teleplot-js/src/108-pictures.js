/*
 * Pictures of values: depth maps (and any picture whose pixels are measures) as numbers, not as colors. See doc/depth.md.
 * - Which pictures: a 16-bit grayscale PNG, or a plain buffer (IMAGE_TYPE_RAW: {WIDTH[16]} {HEIGHT[16]} {FORMAT[8]} {3 reserved
 *   bytes} then the pixels, row after row, little-endian: RAW_FORMAT_GRAY16 uint16, RAW_FORMAT_FLOAT32 float32). A browser only gives
 *   8 bits of a picture (img, canvas, WebGL): those are decoded here.
 * - What a pixel is worth: its number times the scale of the telemetry (TELEM_ATTR_PIXELS {scale, invalid (null: none), depth}, ATTR|name|scale=
 *   |nodata=|depth=), in the unit of the telemetry. "invalid" is the number of a pixel without measure (0 by default; NaN and the
 *   infinities never are measures). "depth" (true by default): the values are distances along the axis of the camera, which a 3D view
 *   can place in the scene.
 * - The stored sample is never touched (still the base64 of what was received): decoding gives a copy, kept in a small cache next to
 *   the data entry (the pictures on display, not the whole history). A PNG is inflated by the browser (DecompressionStream): it is
 *   ready on a later update, decode() answers undefined meanwhile. Only one decoding per entry at a time; when pictures come faster
 *   than they are decoded, the latest one asked waits and the others are skipped.
 * - Colors: colorize() maps values on a colormap between two ends (the range of the telemetry, or what most of the picture holds:
 *   from its 1st to its 99th percentile); pixels without measure are transparent. Nothing is smoothed: a pixel is one color.
 */
const _pictures_cache = new WeakMap(); // data entry -> { items: Map(timestamp -> item), busy: item or undefined, waiting: item or undefined }
const _pictures_CACHE_SIZE = 4;          // Decoded pictures kept per entry
const _pictures_LITTLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const _pictures_RAW_HEADER = 8;
const _pictures_PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

TELEPLOT.pictures = {
    // Colormaps: 256 colors each, as [r, g, b] from 0 to 255, low values first
    COLORMAPS: {},
    COLORMAP_NAMES: [["turbo", "Turbo"], ["viridis", "Viridis"], ["gray", "Gray"]],
    PERCENTILE_LOW: 0.01,
    PERCENTILE_HIGH: 0.99,

    // Bytes of a base64 text (a fresh buffer: its pixels can be viewed as uint16 / float32 where they start on a multiple of 4)
    fromBase64(text) {
        if(typeof Uint8Array.fromBase64 === "function") { try { return Uint8Array.fromBase64(text); } catch(e) { /* below */ } }
        let binary = atob(text);
        let bytes = new Uint8Array(binary.length);
        for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    },
    toBase64(bytes) {
        if(typeof bytes.toBase64 === "function") return bytes.toBase64();
        let binary = "";
        for(let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); // By chunks: arguments are limited
        return btoa(binary);
    },

    // What a picture is, from its first bytes only: {values: true, width, height, format ("gray16" | "float32"), error} for a
    // picture of values, {values: false} for a picture to show as it is (JPEG, 8-bit or color PNG), undefined when it cannot tell
    info(type, base64) {
        const P = TELEPLOT.protocol;
        if(typeof base64 !== "string") return undefined;
        let head;
        try { head = TELEPLOT.pictures.fromBase64(base64.substring(0, 40)); } catch(e) { return undefined; }
        if(type === P.IMAGE_TYPE_RAW) {
            if(head.length < _pictures_RAW_HEADER) return { values: true, width: 0, height: 0, format: "", error: "A plain picture starts with its width, height and format" };
            let width = head[0] | (head[1] << 8), height = head[2] | (head[3] << 8);
            let format = P.RAW_FORMATS[head[4]];
            return { values: true, width, height, format: format || "", error: format ? "" : "Unknown pixel format " + head[4] };
        }
        if(type === P.IMAGE_TYPE_PNG) {
            if(head.length < 29 || _pictures_PNG_SIGNATURE.some((b, i) => head[i] !== b)) return undefined;
            let bitDepth = head[24], colorType = head[25];
            if(!(bitDepth === 16 && colorType === 0)) return { values: false };
            let width = ((head[16] << 24) | (head[17] << 16) | (head[18] << 8) | head[19]) >>> 0;
            let height = ((head[20] << 24) | (head[21] << 16) | (head[22] << 8) | head[23]) >>> 0;
            return { values: true, width, height, format: "gray16", error: head[28] !== 0 ? "Interlaced PNG pictures of values are not supported" : "" };
        }
        return { values: false };
    },

    // How the values of the pictures of a telemetry are read: {scale, invalid (undefined: none), depth}
    settings(telem) {
        let attr = telem ? telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_PIXELS) : undefined;
        let scale = attr && Number.isFinite(attr.scale) && attr.scale !== 0 ? attr.scale : 1;
        let invalid = attr && attr.invalid !== undefined ? (Number.isFinite(attr.invalid) ? attr.invalid : undefined) : 0; // (null: none)
        return { scale, invalid, depth: !(attr && attr.depth === false) };
    },

    // Is the sample at index a picture of values ?
    isValues(entry, index) {
        if(!entry || index < 0 || index >= entry.timestamps.length) return false;
        let info = TELEPLOT.pictures.info(entry.data[0][index], entry.data[1][index]);
        return !!(info && info.values);
    },

    // The picture of values at index of an image entry, decoded: {t, width, height, format, values (Uint16Array | Float32Array), error},
    // or undefined while it is being decoded (or when it is not a picture of values). "error": what could not be read (no values then).
    decode(entry, index) {
        if(!entry || index < 0 || index >= entry.timestamps.length) return undefined;
        let type = entry.data[0][index], base64 = entry.data[1][index], t = entry.timestamps[index];
        let cache = _pictures_cache.get(entry);
        if(cache === undefined) { cache = { items: new Map(), busy: undefined, waiting: undefined }; _pictures_cache.set(entry, cache); }
        let item = cache.items.get(t);
        if(item !== undefined && item.base64 === base64) {
            cache.items.delete(t); cache.items.set(t, item); // Used: the newest of the cache
            if(item.decoded === undefined && !item.started) { if(cache.busy === undefined) _pictures_start(cache, item); else cache.waiting = item; }
            return item.decoded;
        }
        let info = TELEPLOT.pictures.info(type, base64);
        if(!info || !info.values) return undefined;
        item = { t, type, base64, info, decoded: undefined, started: false };
        cache.items.set(t, item);
        while(cache.items.size > _pictures_CACHE_SIZE) cache.items.delete(cache.items.keys().next().value);
        if(info.error) item.decoded = { t, width: info.width, height: info.height, format: info.format, values: undefined, error: info.error };
        else if(type === TELEPLOT.protocol.IMAGE_TYPE_RAW) item.decoded = _pictures_decodeRaw(item);
        else if(cache.busy === undefined) _pictures_start(cache, item);
        else cache.waiting = item; // Decoded after the one in progress (the one that waited before is skipped)
        return item.decoded;
    },

    // Promise of the decoded picture (tests, and code that can wait)
    async decodeAsync(entry, index) {
        for(let tries = 0; tries < 100; tries++) {
            let decoded = TELEPLOT.pictures.decode(entry, index);
            if(decoded !== undefined) return decoded;
            let cache = _pictures_cache.get(entry);
            if(!cache || !cache.busy) return undefined;
            await cache.busy.promise;
        }
        return undefined;
    },

    // The value of a pixel (u to the right, v down, from 0): its number times the scale, undefined when it has no measure
    valueAt(decoded, u, v, settings) {
        if(!decoded || !decoded.values || !(u >= 0 && v >= 0 && u < decoded.width && v < decoded.height)) return undefined;
        let raw = decoded.values[Math.floor(v) * decoded.width + Math.floor(u)];
        if(!Number.isFinite(raw) || (settings.invalid !== undefined && raw === settings.invalid)) return undefined;
        return raw * settings.scale;
    },

    // What most of a picture holds, as values: {min, max} from its 1st to its 99th percentile (pixels without measure left out),
    // undefined when no pixel has one. Worked out once per decoded picture.
    spread(decoded, settings) {
        if(!decoded || !decoded.values) return undefined;
        let key = settings.scale + ":" + settings.invalid;
        if(decoded.spread !== undefined && decoded.spreadKey === key) return decoded.spread;
        let counts = _pictures_percentiles(decoded.values, settings.invalid);
        let spread = counts === undefined ? undefined : _pictures_order(counts[0] * settings.scale, counts[1] * settings.scale);
        decoded.spread = spread; decoded.spreadKey = key;
        return spread;
    },

    // The two ends of the colors: the range of the telemetry when it has both ends (mode "range"), else what the picture holds
    colorRange(decoded, settings, telem, mode="range") {
        let range = telem && mode !== "picture" ? telem.getRange() : undefined;
        if(range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.max > range.min) return { min: range.min, max: range.max };
        return TELEPLOT.pictures.spread(decoded, settings);
    },

    // Colors of a decoded picture in an RGBA buffer of width x height (an ImageData's data). options: {min, max, colormap, scale, invalid}.
    // "lut": an object kept by the caller between calls (the table of a 16-bit picture is only built again when the options change).
    colorize(decoded, options, out, lut={}) {
        let values = decoded.values, count = decoded.width * decoded.height;
        let pixels = new Uint32Array(out.buffer, out.byteOffset, count);
        let colors = _pictures_packed(options.colormap);
        let min = options.min, span = options.max - options.min;
        let k = span > 0 ? 255 / span : 0, scale = options.scale, invalid = options.invalid;
        if(values instanceof Uint16Array) {
            let key = [options.colormap, min, span, scale, invalid].join(":");
            if(lut.key !== key || !lut.table) {
                let table = lut.table || new Uint32Array(65536);
                for(let c = 0; c < 65536; c++) {
                    let at = Math.round((c * scale - min) * k);
                    table[c] = colors[at < 0 ? 0 : at > 255 ? 255 : at];
                }
                if(invalid !== undefined && invalid >= 0 && invalid < 65536) table[invalid] = 0;
                lut.table = table; lut.key = key;
            }
            let table = lut.table;
            for(let i = 0; i < count; i++) pixels[i] = table[values[i]];
            return;
        }
        let noInvalid = invalid === undefined;
        for(let i = 0; i < count; i++) {
            let v = values[i];
            if(!(v - v === 0) || (!noInvalid && v === invalid)) { pixels[i] = 0; continue; } // (v - v is NaN for NaN and the infinities)
            let at = Math.round((v * scale - min) * k);
            pixels[i] = colors[at < 0 ? 0 : at > 255 ? 255 : at];
        }
    },

    // Color of a position from 0 to 1 on a colormap: [r, g, b] from 0 to 255
    colorOf(colormap, t) {
        let colors = TELEPLOT.pictures.COLORMAPS[colormap] || TELEPLOT.pictures.COLORMAPS.turbo;
        return colors[Math.max(0, Math.min(255, Math.round(t * 255)))];
    },

    // CSS gradient of a colormap, low values on the left (the scale under a picture of values)
    gradient(colormap) {
        let stops = [];
        for(let i = 0; i <= 8; i++) { let [r, g, b] = TELEPLOT.pictures.colorOf(colormap, i / 8); stops.push(`rgb(${r},${g},${b}) ${i * 12.5}%`); }
        return "linear-gradient(to right, " + stops.join(", ") + ")";
    }
};

// Colormaps from their usual polynomial approximations
{
    let clamp = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    let polynomial = (coefficients) => Array.from({ length: 256 }, (_, i) => {
        let t = i / 255;
        return coefficients.map((c) => clamp(c.reduceRight((sum, a) => sum * t + a, 0)));
    });
    TELEPLOT.pictures.COLORMAPS.turbo = polynomial([ // Turbo (Google, 2019)
        [0.13572138, 4.61539260, -42.66032258, 132.13108234, -152.94239396, 59.28637943],
        [0.09140261, 2.19418839, 4.84296658, -14.18503333, 4.27729857, 2.82956604],
        [0.10667330, 12.64194608, -60.58204836, 110.36276771, -89.90310912, 27.34824973]
    ]);
    TELEPLOT.pictures.COLORMAPS.viridis = polynomial([
        [0.2777273272234177, 0.1050930431085774, -0.3308618287255563, -4.634230498983486, 6.228269936347081, 4.776384997670288, -5.435455855934631],
        [0.005407344544966578, 1.404613529898575, 0.214847559468213, -5.799100973351585, 14.17993336680509, -13.74514537774601, 4.645852612178535],
        [0.3340998053353061, 1.384590162594685, 0.09509516302823659, -19.33244095627987, 56.69055260068105, -65.35303263337234, 26.3124352495832]
    ]);
    TELEPLOT.pictures.COLORMAPS.gray = Array.from({ length: 256 }, (_, i) => [i, i, i]);
}

const _pictures_packedCache = {};
// A colormap as 256 RGBA pixels of a Uint32Array (the byte order of the machine, as ImageData is read)
function _pictures_packed(colormap) {
    let name = TELEPLOT.pictures.COLORMAPS[colormap] ? colormap : "turbo";
    let packed = _pictures_packedCache[name];
    if(packed) return packed;
    packed = new Uint32Array(256);
    let bytes = new Uint8Array(packed.buffer);
    TELEPLOT.pictures.COLORMAPS[name].forEach(([r, g, b], i) => { bytes[i*4] = r; bytes[i*4+1] = g; bytes[i*4+2] = b; bytes[i*4+3] = 255; });
    return _pictures_packedCache[name] = packed;
}

function _pictures_order(min, max) {
    if(min > max) [min, max] = [max, min];
    if(min === max) { let room = Math.abs(min) * 0.01 || 1; min -= room; max += room; }
    return { min, max };
}

// A plain buffer: the pixels as they are, viewed without copy when the machine is little-endian
function _pictures_decodeRaw(item) {
    const P = TELEPLOT.protocol;
    let { width, height, format } = item.info;
    let fail = (error) => ({ t: item.t, width, height, format, values: undefined, error });
    let bytes;
    try { bytes = TELEPLOT.pictures.fromBase64(item.base64); } catch(e) { return fail("Not base64"); }
    let size = format === "float32" ? 4 : 2;
    if(bytes.length !== _pictures_RAW_HEADER + width * height * size) return fail(`${bytes.length - _pictures_RAW_HEADER} bytes of pixels for ${width} x ${height} ${format}`);
    let buffer = bytes.byteOffset % 4 === 0 ? bytes.buffer : bytes.slice().buffer, offset = (bytes.byteOffset % 4 === 0 ? bytes.byteOffset : 0) + _pictures_RAW_HEADER;
    if(!_pictures_LITTLE) _pictures_swap(new Uint8Array(buffer, offset, width * height * size), size);
    let values = format === "float32" ? new Float32Array(buffer, offset, width * height) : new Uint16Array(buffer, offset, width * height);
    return { t: item.t, width, height, format, values, error: "" };
}

function _pictures_swap(bytes, size) {
    for(let i = 0; i + size <= bytes.length; i += size) for(let a = i, b = i + size - 1; a < b; a++, b--) { let x = bytes[a]; bytes[a] = bytes[b]; bytes[b] = x; }
}

// Decodes an item (a PNG) without blocking the page, then the one that waited, if any
function _pictures_start(cache, item) {
    item.started = true;
    cache.busy = item;
    let fail = (e) => { item.decoded = { t: item.t, width: item.info.width, height: item.info.height, format: item.info.format, values: undefined, error: String(e && e.message || e) }; };
    let work;
    try { work = _pictures_inWorker(TELEPLOT.pictures.fromBase64(item.base64), item.info.width, item.info.height); } catch(e) { work = Promise.reject(e); }
    item.promise = work.then((values) => { item.decoded = { t: item.t, width: item.info.width, height: item.info.height, format: "gray16", values, error: "" }; }, fail).then(() => {
        cache.busy = undefined;
        let next = cache.waiting;
        cache.waiting = undefined;
        if(next !== undefined && next.decoded === undefined && cache.items.get(next.t) === next) _pictures_start(cache, next);
    });
}

// PNG pictures are decoded by a worker of their own (made from the functions below, no file to load), so the page does not wait for
// them; where workers cannot be made (tests, a page that forbids them) they are decoded here.
let _pictures_worker = undefined; // { worker, next, pending: Map(id -> {resolve, reject}) }, null: no worker
function _pictures_inWorker(bytes, width, height) {
    if(_pictures_worker === undefined) {
        _pictures_worker = null;
        try {
            if(typeof Worker === "function" && typeof Blob === "function" && typeof URL !== "undefined" && URL.createObjectURL) {
                let source = [_pictures_pngValues, _pictures_unfilter, _pictures_toMachineOrder].map(String).join("\n") + `
                    self.onmessage = async (event) => {
                        let { id, bytes, width, height } = event.data;
                        try { let values = await _pictures_pngValues(bytes, width, height); self.postMessage({ id, values }, [values.buffer]); }
                        catch(e) { self.postMessage({ id, error: String(e && e.message || e) }); }
                    };`;
                let url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
                let worker = new Worker(url);
                let state = { worker, next: 1, pending: new Map() };
                worker.onmessage = (event) => {
                    let request = state.pending.get(event.data.id);
                    if(!request) return;
                    state.pending.delete(event.data.id);
                    if(event.data.error !== undefined) request.reject(new Error(event.data.error)); else request.resolve(event.data.values);
                };
                worker.onerror = (event) => { // A worker that cannot run: everything is decoded here from now on
                    if(event && event.preventDefault) event.preventDefault();
                    _pictures_worker = null;
                    for(let [id, request] of state.pending) _pictures_pngValues(request.bytes, request.width, request.height).then(request.resolve, request.reject);
                    state.pending.clear();
                    worker.terminate();
                };
                _pictures_worker = state;
            }
        } catch(e) { _pictures_worker = null; }
    }
    let state = _pictures_worker;
    if(!state) return _pictures_pngValues(bytes, width, height);
    return new Promise((resolve, reject) => {
        let id = state.next++;
        state.pending.set(id, { resolve, reject, bytes: bytes.slice(), width, height }); // (a copy, in case the worker fails and it is done here)
        state.worker.postMessage({ id, bytes, width, height }, [bytes.buffer]);
    });
}

// A 16-bit grayscale PNG (the bytes of the file) -> Uint16Array of its numbers. Self-contained: it also runs in the worker.
async function _pictures_pngValues(bytes, width, height) {
    let chunks = [], size = 0;
    for(let at = 8; at + 8 <= bytes.length;) {
        let length = ((bytes[at] << 24) | (bytes[at+1] << 16) | (bytes[at+2] << 8) | bytes[at+3]) >>> 0;
        let type = String.fromCharCode(bytes[at+4], bytes[at+5], bytes[at+6], bytes[at+7]);
        if(at + 12 + length > bytes.length) throw new Error("PNG cut short");
        if(type === "IDAT") { chunks.push(bytes.subarray(at + 8, at + 8 + length)); size += length; }
        if(type === "IEND") break;
        at += 12 + length;
    }
    let compressed = new Uint8Array(size);
    for(let i = 0, at = 0; i < chunks.length; i++) { compressed.set(chunks[i], at); at += chunks[i].length; }
    if(typeof DecompressionStream !== "function") throw new Error("This browser cannot inflate PNG pictures (no DecompressionStream)");
    let data = new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
    let stride = width * 2, line = stride + 1;
    if(data.length < height * line) throw new Error("PNG pixels cut short");
    _pictures_unfilter(data, stride, height, 2);
    let values = new Uint16Array(width * height), out = new Uint8Array(values.buffer);
    for(let y = 0; y < height; y++) out.set(data.subarray(y * line + 1, y * line + 1 + stride), y * stride);
    _pictures_toMachineOrder(out);
    return values;
}

// PNG filters (none, sub, up, average, Paeth) undone in place: rows of "stride" bytes, each after its filter byte
function _pictures_unfilter(data, stride, height, bpp) {
    let line = stride + 1;
    for(let y = 0; y < height; y++) {
        let s = y * line + 1, e = s + stride, filter = data[s - 1];
        if(filter === 0) continue;
        if(filter === 1) { for(let i = s + bpp; i < e; i++) data[i] += data[i - bpp]; }
        else if(filter === 2) { if(y > 0) for(let i = s; i < e; i++) data[i] += data[i - line]; }
        else if(filter === 3) {
            if(y > 0) {
                for(let i = s; i < s + bpp; i++) data[i] += data[i - line] >> 1;
                for(let i = s + bpp; i < e; i++) data[i] += (data[i - bpp] + data[i - line]) >> 1;
            }
            else for(let i = s + bpp; i < e; i++) data[i] += data[i - bpp] >> 1;
        }
        else if(filter === 4) {
            if(y > 0) {
                for(let i = s; i < s + bpp; i++) data[i] += data[i - line];
                for(let i = s + bpp; i < e; i++) {
                    let a = data[i - bpp], b = data[i - line], c = data[i - line - bpp];
                    let pa = b > c ? b - c : c - b, pb = a > c ? a - c : c - a, p = a + b - c - c, pc = p < 0 ? -p : p;
                    data[i] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
                }
            }
            else for(let i = s + bpp; i < e; i++) data[i] += data[i - bpp];
        }
        else throw new Error("Unknown PNG filter " + filter);
    }
}

// Big-endian 16-bit numbers (PNG) in the order of the machine: bytes swapped by pairs, two numbers at a time
function _pictures_toMachineOrder(bytes) {
    if(new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) return; // A big-endian machine: nothing to do
    let words = Math.floor(bytes.length / 4), quads = new Uint32Array(bytes.buffer, bytes.byteOffset, words);
    for(let i = 0; i < words; i++) { let x = quads[i]; quads[i] = ((x & 0xFF00FF00) >>> 8) | ((x & 0x00FF00FF) << 8); }
    for(let i = words * 4; i + 1 < bytes.length; i += 2) { let x = bytes[i]; bytes[i] = bytes[i + 1]; bytes[i + 1] = x; }
}

let _pictures_histogram = undefined; // (65536 counts, used again)
// Numbers at the 1st and 99th percentiles of the pixels that have a measure: [low, high], undefined when none has one
function _pictures_percentiles(values, invalid) {
    const LOW = TELEPLOT.pictures.PERCENTILE_LOW, HIGH = TELEPLOT.pictures.PERCENTILE_HIGH;
    if(values instanceof Uint16Array) {
        let counts = _pictures_histogram || (_pictures_histogram = new Uint32Array(65536));
        counts.fill(0);
        for(let i = 0; i < values.length; i++) counts[values[i]]++;
        if(invalid !== undefined && invalid >= 0 && invalid < 65536) counts[invalid] = 0;
        let total = 0;
        for(let c = 0; c < 65536; c++) total += counts[c];
        if(total === 0) return undefined;
        let low = -1, high = -1, seen = 0;
        for(let c = 0; c < 65536; c++) {
            seen += counts[c];
            if(low < 0 && seen > total * LOW) low = c;
            if(seen >= total * HIGH) { high = c; break; }
        }
        return [low, high];
    }
    // Floats: their extent, then 4096 bins over it
    let min = Infinity, max = -Infinity, noInvalid = invalid === undefined;
    for(let i = 0; i < values.length; i++) {
        let v = values[i];
        if(!(v - v === 0) || (!noInvalid && v === invalid)) continue;
        if(v < min) min = v; if(v > max) max = v;
    }
    if(!(min <= max)) return undefined;
    if(min === max) return [min, max];
    const BINS = 4096;
    let bins = new Uint32Array(BINS), k = (BINS - 1) / (max - min), total = 0;
    for(let i = 0; i < values.length; i++) {
        let v = values[i];
        if(!(v - v === 0) || (!noInvalid && v === invalid)) continue;
        bins[Math.floor((v - min) * k)]++; total++;
    }
    let low, high, seen = 0;
    for(let b = 0; b < BINS; b++) {
        seen += bins[b];
        if(low === undefined && seen > total * LOW) low = min + b / k;
        if(seen >= total * HIGH) { high = min + (b + 1) / k; break; }
    }
    return [low, Math.min(max, high === undefined ? max : high)];
}
