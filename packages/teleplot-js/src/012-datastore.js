// Where the data being parsed comes from (the id of a connection), for the telemetries and clients it creates: see TELEPLOT.datastore.withSource
let _datastore_currentSourceId = undefined;
let _datastore_currentEndpoint = undefined; // Which device of that source sent it (the sender address the Teleplot server gives), see withSource
let _datastore_addWatcher = undefined; // Called with (telemetry, dataType, timestamps) for what is added while it is set (see watchAdds)
let _datastore_dry = false;            // true: nothing is stored nor cleared, the watcher still sees what would be added (see dryRun)
const _datastore_structures = new WeakMap(); // data entry of a structure -> Map text -> what it says (see Telemetry.getEnum)
let _datastore_offCount = 0;           // Counts the times reception was stopped: an entry that saw an older count has a hole (see Telemetry.gapsOf)
let _datastore_serial = 0;             // Counts the telemetries created: tells one from another one that took its id (objects are not compared: an application may wrap them)

class Telemetry {
    constructor(id) {
        this.id = id;
        this.serial = ++_datastore_serial;
        this.clientId = -1;
        this.sourceId = _datastore_currentSourceId; // Connection that first sent it (undefined: created by the application itself)
        this.endpoint = _datastore_currentEndpoint; // The device of that connection that sent it last (where commands go back: doc/telecmd.md)
        this.attributes = {};
        // Raw (not reactive): a UI framework wrapping the datastore in proxies would make ingestion ~100x slower. Views read it through update().
        this.data = TELEPLOT.Vue.markRaw({});
    }
    setAttribute(code, data) {
        this.attributes[code] = data;
        if(_datastore_currentEndpoint !== undefined) this.endpoint = _datastore_currentEndpoint;
        if(this.__unannounced && (code === TELEPLOT.protocol.TELEM_ATTR_SHAPE || (code === TELEPLOT.protocol.TELEM_ATTR_WRITE && data !== undefined))) _datastore_announce(this);
    }
    // Has the telemetry something to display ? Data (thresholds and a structure are not: they describe other data), a shape, or
    // something the page can write or call (an action has no data until it is called)
    hasContent() {
        for(let dataType in this.data) if(!TELEPLOT.protocol.isMetaDataType(dataType)) return true;
        return this.getAttribute(TELEPLOT.protocol.TELEM_ATTR_SHAPE) !== undefined || this.getAttribute(TELEPLOT.protocol.TELEM_ATTR_WRITE) !== undefined;
    }
    getAttribute(code) {
        return this.attributes[code];
    }
    // What the telemetry is, in a sentence (ATTR|name|desc=...; TELEM_ATTR_DESC in binary): "" when it was not given
    getDescription() {
        let desc = this.attributes[TELEPLOT.protocol.TELEM_ATTR_DESC];
        return typeof desc === "string" ? desc : "";
    }
    // merge: the separator of the items of a sample that is a set (a structure: "\n", a stack with several paths: ","). A sample with
    // the same timestamp as one already stored is then another part of it: its items are added to that sample (doc/graph.md).
    addData(dataType, timestamps, dataList, merge=undefined) { // addData(TELEM_DATA_SHAPE_COLOR_RGB, [t1,t2], [[r1,r2], [g1,g2], [b1,b2]])
        if(!TELEPLOT.state.receiving) return; // Not receiving: what comes is lost
        if(_datastore_dry) { if(_datastore_addWatcher !== undefined) _datastore_addWatcher(this, dataType, timestamps); return; }
        // Check inputs
        let expectedDataCount = TELEPLOT.protocol.getSectionTypeTelemDataDataCount(dataType);
        if( !expectedDataCount || expectedDataCount < 0 ) { console.error(Error(`Cannot check expected data channels`)); return; }
        if (dataList.length != expectedDataCount) {
            console.error(Error(`Trying to add data with wrong data count for data type ${dataType} : expected ${expectedDataCount}, got ${dataList.length}`));
            return;
        }
        for (let channelIdx in dataList) {
            if(dataList[channelIdx].length != timestamps.length) {
                console.error(Error(`Trying to add data with timestamps.length != dataList[${channelIdx}].length. ${timestamps.length} != ${dataList[channelIdx].length}`));
                return;
            }
        }

        // Create data type if needed
        if (this.data[dataType] == undefined) {
            // lateInsertions counts samples inserted before the end of the data, it lets caches (ex: decimation) know when they are outdated
            this.data[dataType] = {timestamps: [], data: [], lastUpdate: 0, lateInsertions: 0, offCount: _datastore_offCount};
            for(let i=0;i<dataList.length;i++) {
                this.data[dataType].data[i] = [];
            }
        }
        // For each incoming data, insert ordered
        let stored = this.data[dataType];
        let lastTimestamp = stored.timestamps.length ? stored.timestamps[stored.timestamps.length-1] : -Infinity;
        // Reception was stopped since this entry last got data: the hole is remembered between its samples, in the time of its data (a
        // device may date them on its own clock, so the page's clock would not say where the hole is). Not for a file read meanwhile.
        let gapFrom;
        if (stored.offCount !== _datastore_offCount && !TELEPLOT.state.receivingOff) {
            if (stored.timestamps.length) gapFrom = lastTimestamp;
            stored.offCount = _datastore_offCount;
        }
        for(let i=0;i<timestamps.length;i++) {
            let timestamp = timestamps[i];
            if (!(timestamp >= 0)) continue; // Do not use negative timestamps (not supported and -1 could interact with getDataPoint), nor what is not a time at all (it would break the order of the data)
            // The sample it already has, sent again (a device repeats what it sent once, for a page opened later): kept once
            if (timestamp === lastTimestamp && stored.data.every((channel, j) => channel[channel.length-1] === dataList[j][i])) continue;
            // Another part of a sample it has (same time, a set): one sample with the items of both
            if (merge !== undefined && timestamp <= lastTimestamp) {
                let at = timestamp === lastTimestamp ? stored.timestamps.length - 1 : Telemetry.__indexOf(stored.timestamps, timestamp);
                if (at >= 0) {
                    let joined = Telemetry.mergeItems(stored.data[0][at], dataList[0][i], merge);
                    if (joined !== stored.data[0][at]) { stored.data[0][at] = joined; stored.lateInsertions++; } // (what was read from it is outdated)
                    continue;
                }
            }
            // Fast path: data coming in order is appended (the common case, much cheaper than a search and an insertion)
            if (timestamp >= lastTimestamp) {
                stored.timestamps.push(timestamp);
                for(let j=0;j<dataList.length;j++) {
                    stored.data[j].push(dataList[j][i]);
                }
                lastTimestamp = timestamp;
                continue;
            }
            // Late data: find insertion point (keeping data timestamp-ordered)
            let closestDataPoint = this.getDataPoint(dataType, timestamp);
            let insertIdx = closestDataPoint.timestamp > timestamp ? closestDataPoint.index : closestDataPoint.index+1; // insert "before" or "after" the closest data point
            // Insert data
            stored.lateInsertions++;
            stored.timestamps.splice(insertIdx, 0, timestamp);
            for(let j=0;j<dataList.length;j++) {
                stored.data[j].splice(insertIdx, 0, dataList[j][i]);
            }
        }

        if (gapFrom !== undefined) Telemetry.__addGap(stored, gapFrom);
        stored.lastUpdate = Date.now();
        if(_datastore_currentEndpoint !== undefined) this.endpoint = _datastore_currentEndpoint;
        if(_datastore_addWatcher !== undefined) _datastore_addWatcher(this, dataType, timestamps);
        if(this.__unannounced && !TELEPLOT.protocol.isMetaDataType(dataType)) _datastore_announce(this);
    };
    // The hole of an entry after a stop of reception: from its last sample before it to its first one after it (none after: no hole yet)
    static __addGap(stored, from) {
        let times = stored.timestamps, lo = 0, hi = times.length;
        while(lo < hi) { let mid = (lo + hi) >> 1; if(times[mid] <= from) lo = mid + 1; else hi = mid; }
        if(lo >= times.length) return;
        let gaps = stored.gaps || (stored.gaps = []);
        gaps.push({ from, to: times[lo] });
        if(gaps.length > 100) gaps.shift();
    }
    // The holes of a data entry left by stops of reception that overlap [from, to], in the time of its data ([{from, to}]; while
    // reception is off, the one still open goes from its last sample to Infinity). Nothing is made up: the samples around are real.
    static gapsOf(stored, from=-Infinity, to=Infinity) {
        let found = [];
        if(!stored) return found;
        if(stored.gaps) for(let g of stored.gaps) if(g.to >= from && g.from <= to) found.push(g);
        let n = stored.timestamps.length;
        if(!TELEPLOT.state.receiving && n && stored.offCount !== _datastore_offCount && stored.timestamps[n-1] <= to) found.push({ from: stored.timestamps[n-1], to: Infinity });
        return found;
    }
    // Index of a timestamp in a sorted list of timestamps, -1 when it is not there
    static __indexOf(timestamps, timestamp) {
        let lo = 0, hi = timestamps.length;
        while(lo < hi) { let mid = (lo + hi) >> 1; if(timestamps[mid] < timestamp) lo = mid + 1; else hi = mid; }
        return lo < timestamps.length && timestamps[lo] === timestamp ? lo : -1;
    }
    // The items of two parts of a sample: those of the first, then those of the second it does not have (items are texts separated by "separator")
    static mergeItems(first, second, separator) {
        first = String(first); second = String(second);
        if(second === "" || first === second) return first;
        if(first === "") return second;
        let items = first.split(separator), known = new Set(items);
        for(let item of second.split(separator)) if(!known.has(item)) { items.push(item); known.add(item); }
        return items.join(separator);
    }

    /*
     * Structure (doc/graph.md): the texts the telemetry can take (TELEM_DATA_ENUM: the choices of a setting, the states of a state
     * machine, the nodes of a tree) and its transitions (TELEM_DATA_EDGES). The structure in force at a time is the latest sample at
     * or before it (parts with the same time are already one sample). undefined when there is none (yet).
     */
    // { items: [{path, kind}], byPath: Map path -> item, timestamp }. An item is a path ("/" between levels) with an optional "#kind"
    // at its end; declaring "a/b" declares "a" too (as an item of its own when it was not given: kind "").
    getEnum(timestamp=-1) {
        return Telemetry.__structure(this.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_ENUM], timestamp, Telemetry.parseEnum);
    }
    // { edges: [{from, to, event}], timestamp }
    getEdges(timestamp=-1) {
        return Telemetry.__structure(this.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_EDGES], timestamp, Telemetry.parseEdges);
    }
    // Does it have a structure (now or in the past): a graph view displays it
    hasStructure() {
        return this.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_ENUM] !== undefined || this.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_EDGES] !== undefined;
    }
    static __structure(entry, timestamp, parse) {
        if(entry === undefined || !entry.timestamps.length) return undefined;
        let index = entry.timestamps.length - 1;
        if(timestamp >= 0 && entry.timestamps[index] > timestamp) {
            let lo = 0, hi = entry.timestamps.length;
            while(lo < hi) { let mid = (lo + hi) >> 1; if(entry.timestamps[mid] <= timestamp) lo = mid + 1; else hi = mid; }
            index = lo - 1;
            if(index < 0) return undefined;
        }
        let text = String(entry.data[0][index]);
        let cache = _datastore_structures.get(entry); // text -> what it says (a structure is read once, not on every update)
        if(cache === undefined) _datastore_structures.set(entry, cache = new Map());
        let parsed = cache.get(text);
        if(parsed === undefined) {
            if(cache.size > 16) cache.clear();
            parsed = parse(text);
            cache.set(text, parsed);
        }
        return Object.assign({ timestamp: entry.timestamps[index] }, parsed);
    }
    static parseEnum(text) {
        let items = [], byPath = new Map();
        let add = (path, kind) => {
            let known = byPath.get(path);
            if(known !== undefined) { if(kind !== undefined) known.kind = kind; return; }
            let parts = path.split("/");
            for(let depth = 1; depth < parts.length; depth++) add(parts.slice(0, depth).join("/"), undefined); // (its parents first)
            let item = { path, kind: kind || "" };
            items.push(item);
            byPath.set(path, item);
        };
        for(let raw of String(text).split("\n")) {
            if(raw === "") continue;
            let at = raw.lastIndexOf("#");
            let path = at < 0 ? raw : raw.slice(0, at), kind = at < 0 ? undefined : raw.slice(at + 1);
            path = path.split("/").filter((part) => part !== "").join("/");
            if(path !== "") add(path, kind);
        }
        return { items, byPath };
    }
    static parseEdges(text) {
        let edges = [];
        for(let raw of String(text).split("\n")) {
            let arrow = raw.indexOf(">");
            if(arrow < 1) continue;
            let equal = raw.indexOf("=", arrow);
            let from = raw.slice(0, arrow), to = equal < 0 ? raw.slice(arrow + 1) : raw.slice(arrow + 1, equal), event = equal < 0 ? "" : raw.slice(equal + 1);
            if(to === "") continue;
            edges.push({ from, to, event });
        }
        return { edges };
    }
    getDataPoint(dataType, timestamp=-1) { // timestamp=-1 means "the latest value"
        let result = {timestamp:-1, data:[], index:undefined};
        if (this.data[dataType] == undefined) { return result; }
        if (this.data[dataType].data.length == 0) { return result; }

        // Return closest data point
        let index = -1
        if(timestamp >= 0) {
            // Fast-check at end of list to facilitate this.addData()
            if (this.data[dataType].timestamps.at(-1) < timestamp) {
                index = -1;
            }
            else {
                // Binary search
                let from = 0;
                let to = this.data[dataType].timestamps.length-1;
                let bitwise = to <= 2147483647;
                let mid;
                while (to - from > 1) {
                    mid = bitwise ? (from + to) >> 1 : floor((from + to) / 2);
                    if (this.data[dataType].timestamps[mid] < timestamp) { from = mid; }
                    else { to = mid; }
                }
                // End of binary search
                index = to;
                if (timestamp - this.data[dataType].timestamps[from] <= this.data[dataType].timestamps[to] - timestamp)
                    index = from;
            }
        }
        
        result.index = (index == -1) ? this.data[dataType].timestamps.length-1 : index;
        result.timestamp = this.data[dataType].timestamps.at(index);
        for (let dataChannel in this.data[dataType].data) {
            result.data[dataChannel] = this.data[dataType].data[dataChannel].at(index);
        }
        return result;
    };
    clearData() {
        if(_datastore_dry) return;
        Object.keys(this.data).forEach(key => delete this.data[key]);
    };

    // The values the telemetry is expected between (TELEM_ATTR_RANGE): {min, max}, each a number or undefined. undefined without range.
    getRange() {
        let range = this.getAttribute(TELEPLOT.protocol.TELEM_ATTR_RANGE);
        if(!range) return undefined;
        let min = Number.isFinite(range.min) ? range.min : undefined, max = Number.isFinite(range.max) ? range.max : undefined;
        return (min === undefined && max === undefined) ? undefined : { min, max };
    }

    /*
     * Thresholds: limits of a number telemetry (TELEM_DATA_THRESHOLD). A sample is one limit, from its timestamp on: an operator
     * (THRESHOLD_BELOW / THRESHOLD_ABOVE: the side of the limit that is past it), a value, a name and a color ("" when none).
     * A later sample of the same name replaces it, and removes it when its value is not a number. So limits can change over time,
     * and what was drawn in the past keeps the limits it had.
     */

    // The thresholds in force at a time (the latest ones without time): [{name, value, operator, color, timestamp}], lowest value first
    getThresholds(timestamp=-1) {
        let entry = this.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_THRESHOLD];
        if(entry === undefined || !entry.timestamps.length) return [];
        let stamps = entry.timestamps, list = [];
        for(let [name, indexes] of Telemetry.__thresholdIndex(entry)) {
            // The latest sample of the name at or before the time is the one in force
            let at = indexes.length - 1;
            if(timestamp >= 0 && stamps[indexes[at]] > timestamp) {
                let lo = 0, hi = indexes.length;
                while(lo < hi) { let mid = (lo + hi) >> 1; if(stamps[indexes[mid]] <= timestamp) lo = mid + 1; else hi = mid; }
                at = lo - 1;
            }
            if(at < 0) continue;
            let i = indexes[at];
            if(Number.isFinite(entry.data[1][i])) list.push({ name, value: entry.data[1][i], operator: entry.data[0][i], color: entry.data[3][i] || "", timestamp: stamps[i] });
        }
        return list.sort((a, b) => a.value - b.value);
    }

    // The samples of each threshold name: Map name -> indexes, in order. Kept with the data entry and completed as samples are
    // appended (a limit that moves many times per second makes many samples: they are not gone through on every question);
    // built again when samples were inserted or removed.
    static __thresholdIndex(entry) {
        let index = entry.thresholdIndex;
        if(index === undefined || index.late !== entry.lateInsertions || index.timestamps !== entry.timestamps || index.count > entry.timestamps.length) {
            index = entry.thresholdIndex = { late: entry.lateInsertions, timestamps: entry.timestamps, count: 0, byName: new Map() };
        }
        let names = entry.data[2];
        for(let i = index.count; i < names.length; i++) {
            let indexes = index.byName.get(names[i]);
            if(indexes === undefined) index.byName.set(names[i], indexes = []);
            indexes.push(i);
        }
        index.count = names.length;
        return index.byName;
    }

    // The threshold a value is past at a time, undefined when it is past none. Past several: the one it passed last (the limit
    // closest to the value: "critical" rather than "warning" once both are passed).
    getThresholdStatus(value, timestamp=-1) {
        if(typeof value !== "number" || isNaN(value) || this.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_THRESHOLD] === undefined) return undefined;
        let past = undefined;
        for(let threshold of this.getThresholds(timestamp)) {
            let isPast = threshold.operator === TELEPLOT.protocol.THRESHOLD_ABOVE ? value > threshold.value : value < threshold.value;
            if(isPast && (past === undefined || Math.abs(value - threshold.value) < Math.abs(value - past.value))) past = threshold;
        }
        return past;
    }

    // The thresholds over a period, as steps (a limit holds from its sample until the next one of the same name: nothing is drawn in
    // between two values): [{name, operator, color, steps: [{from, to, value}]}]. A limit that is still in force runs until "to".
    getThresholdSteps(from, to) {
        let entry = this.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_THRESHOLD];
        if(entry === undefined || !(from < to)) return [];
        let lines = new Map();
        for(let i = 0; i < entry.timestamps.length; i++) {
            let timestamp = entry.timestamps[i];
            if(timestamp > to) break;
            let name = entry.data[2][i];
            let line = lines.get(name);
            if(line === undefined) { line = { name, operator: entry.data[0][i], color: "", steps: [], open: undefined }; lines.set(name, line); }
            if(line.open !== undefined) { // The step that was running ends here
                if(timestamp > from) line.steps.push({ from: Math.max(from, line.open.from), to: timestamp, value: line.open.value });
                line.open = undefined;
            }
            line.operator = entry.data[0][i];
            line.color = entry.data[3][i] || "";
            if(Number.isFinite(entry.data[1][i])) line.open = { from: timestamp, value: entry.data[1][i] };
        }
        let list = [];
        for(let line of lines.values()) {
            if(line.open !== undefined) line.steps.push({ from: Math.max(from, line.open.from), to, value: line.open.value });
            delete line.open;
            if(line.steps.length) list.push(line);
        }
        return list;
    }

    // Removes the samples of a data type between two timestamps (seconds, limits included). Returns how many were removed.
    removeRange(dataType, from, to) {
        let entry = this.data[dataType];
        if(entry === undefined) return 0;
        let timestamps = entry.timestamps;
        let lower = (value) => { let lo = 0, hi = timestamps.length; while(lo < hi) { let mid = (lo + hi) >> 1; if(timestamps[mid] < value) lo = mid + 1; else hi = mid; } return lo; };
        let start = lower(from), end = lower(to);
        while(end < timestamps.length && timestamps[end] === to) end++;
        if(end <= start) return 0;
        timestamps.splice(start, end - start);
        for(let channel of entry.data) channel.splice(start, end - start);
        entry.lateInsertions++; // (what was computed from the data is outdated, as after a late insertion)
        entry.lastUpdate = Date.now();
        if(timestamps.length === 0) delete this.data[dataType];
        return end - start;
    };

    // Room taken by the stored data, estimated: {bytes, samples}. 8 bytes per number (timestamps included); texts and images are
    // measured on a few of them (their length), not on all: this is called often.
    getMemoryUsage() {
        let bytes = 0, samples = 0;
        for (let dataType in this.data) {
            let entry = this.data[dataType];
            let count = entry.timestamps.length;
            samples += count;
            bytes += count * 8;
            for (let channel of entry.data) bytes += count * Telemetry.valueSize(channel);
        }
        return { bytes, samples };
    };

    // Average size in bytes of the values of a channel
    static valueSize(channel) {
        let count = channel.length;
        if (count == 0) return 0;
        if (typeof channel[0] === "number" && typeof channel[count - 1] === "number") return 8;
        let picked = Math.min(count, 32), total = 0;
        for (let i = 0; i < picked; i++) {
            let value = channel[Math.floor(i * count / picked)];
            if (value && value.byteLength !== undefined) { total += 16 + value.byteLength; continue; } // A typed array (point cloud)
            total += typeof value === "string" ? 16 + value.length * 2 : (typeof value === "number" ? 8 : 16); // (strings: 2 bytes per character at worst)
        }
        return total / picked;
    };

    // The time covered by the stored data: {oldest, newest, duration, intact}, or undefined without data. Data types are measured one
    // by one (each is pruned on its own: a shape whose color was sent once keeps it for ever) and the one that covers the longest time
    // gives oldest, newest and duration. "intact" is how far back from its newest sample no data type has been thinned out (equal to
    // duration when nothing was thinned).
    getTimeSpan() {
        let longest = undefined, intact = Infinity;
        for (let dataType in this.data) {
            let entry = this.data[dataType];
            if (!entry.timestamps.length) continue;
            let oldest = entry.timestamps[0], newest = entry.timestamps[entry.timestamps.length - 1];
            if (!longest || newest - oldest > longest.duration) longest = { oldest, newest, duration: newest - oldest };
            if (entry.thinnedBefore >= oldest) intact = Math.min(intact, newest - entry.thinnedBefore); // (else the thinned part is gone)
        }
        if (!longest) return undefined;
        longest.intact = Math.max(0, Math.min(intact, longest.duration));
        return longest;
    };

    // Makes room by thinning out the oldest part of the data. Kept samples are untouched; nothing is averaged or made up.
    // The data type that takes the most room is thinned first: the first "fraction" of its samples are taken 4 by 4 and only some of
    // each group are kept:
    //   - numbers: the lowest and the highest of the group (in the order they came), so that peaks stay
    //   - several numbers per sample (2D, 3D, shapes...): the first and the last of the group
    //   - text, images: the last of the group
    // The other data types of the telemetry (the pose of a camera next to its images, the rotation of a shape next to its position...)
    // follow it: over the same period they keep the samples that were current at the times that are kept, so that what is displayed
    // at those times is what was displayed before (an image keeps the pose it was taken from).
    // "thinnedBefore" of a data type tells up to when its data has been thinned. Returns the number of samples removed.
    thinOldest(fraction=0.5) {
        const GROUP = 4;
        let primary = undefined, heaviest = -1;
        for (let dataType in this.data) {
            if (TELEPLOT.protocol.isMetaDataType(dataType)) continue; // Limits and structures are not thinned: each sample is one limit or one structure, none stands for the others
            let entry = this.data[dataType];
            let count = entry.timestamps.length;
            let bytes = count * 8;
            for (let channel of entry.data) bytes += count * Telemetry.valueSize(channel);
            if (count > 0 && bytes > heaviest) { heaviest = bytes; primary = entry; }
        }
        if (!primary) return 0;
        let count = primary.timestamps.length;
        let end = Math.floor(count * fraction / GROUP) * GROUP; // Samples [0, end) are thinned
        if (end < GROUP) return 0; // Nothing to thin (a few big samples, images for example, are worth thinning too)
        let numbers = primary.data.every((channel) => typeof channel[0] === "number"); // (an image is a type and a picture: not numbers)
        let single = primary.data.length == 1 ? primary.data[0] : undefined;
        let kept = [];
        for (let start = 0; start < end; start += GROUP) {
            if (!numbers) { kept.push(start + GROUP - 1); continue; }
            let low = start, high = start;
            if (single) {
                for (let i = start + 1; i < start + GROUP; i++) {
                    if (single[i] < single[low]) low = i;
                    if (single[i] > single[high]) high = i;
                }
            }
            if (low == high) { low = start; high = start + GROUP - 1; } // All the same, or several numbers per sample: first and last
            kept.push(Math.min(low, high), Math.max(low, high));
        }
        let boundary = primary.timestamps[end - 1];
        let removed = Telemetry.__keepOldest(primary, kept, end, boundary);

        // The other data types: up to the same time, keep what was current at each time kept (and at the first one that follows)
        let times = primary.timestamps;
        for (let dataType in this.data) {
            let entry = this.data[dataType];
            if (entry === primary || !entry.timestamps.length || TELEPLOT.protocol.isMetaDataType(dataType)) continue;
            let stamps = entry.timestamps, limit = 0, index = -1, keptHere = [];
            while (limit < stamps.length && stamps[limit] <= boundary) limit++; // Samples [0, limit) are concerned
            if (limit < 2) continue;
            for (let i = 0; i < times.length; i++) {
                while (index + 1 < limit && stamps[index + 1] <= times[i]) index++;
                if (index >= 0 && keptHere[keptHere.length - 1] !== index) keptHere.push(index);
                if (times[i] > boundary) break;
            }
            if (keptHere[keptHere.length - 1] !== limit - 1) keptHere.push(limit - 1); // (what is current when the thinned part ends)
            if (keptHere.length < limit) removed += Telemetry.__keepOldest(entry, keptHere, limit, boundary);
        }
        return removed;
    };

    // Keeps only the samples "kept" (indexes, in order) among the first "end" samples of a data type. Returns the number of samples removed.
    static __keepOldest(entry, kept, end, boundary) {
        entry.timestamps = kept.map((i) => entry.timestamps[i]).concat(entry.timestamps.slice(end));
        for (let c = 0; c < entry.data.length; c++) {
            let channel = entry.data[c];
            entry.data[c] = kept.map((i) => channel[i]).concat(channel.slice(end));
        }
        entry.thinnedBefore = Math.max(entry.thinnedBefore || 0, boundary);
        entry.lateInsertions++; // What was cached from this data (decimation...) is outdated
        return end - kept.length;
    };

    // Makes room by forgetting the oldest part of the data (the first "fraction" of the samples of each data type). Returns the number of samples removed.
    forgetOldest(fraction=0.25) {
        let removed = 0;
        for (let dataType in this.data) {
            if (TELEPLOT.protocol.isMetaDataType(dataType)) continue; // (limits and structures stay: see thinOldest)
            let entry = this.data[dataType];
            let count = Math.floor(entry.timestamps.length * fraction);
            if (count < 1) continue;
            entry.timestamps.splice(0, count);
            for (let channel of entry.data) channel.splice(0, count);
            entry.pruned = (entry.pruned || 0) + 1;
            removed += count;
        }
        return removed;
    };
    __getTimeout() {
        let thisTimeout = this.getAttribute(TELEPLOT.protocol.TELEM_ATTR_DATA_TIMEOUT);
        if (thisTimeout !== undefined) return thisTimeout;
        return TELEPLOT.state.dataTimeout;
    };
    __deleteTimedOutData() {
        let dataTimeout = this.__getTimeout(); // ms
        if (dataTimeout === 0.0) return; // 0 means no timeout
        for (let dataType in this.data) {
            if(!this.data[dataType].timestamps.length) continue;
            let oldestTimestampAllowed = this.data[dataType].timestamps.at(-1) - dataTimeout;
            // Times that start near zero (a device that counts from its start): nothing can be older than the window yet.
            // (A negative time must not reach getDataPoint, where it means "the latest sample": everything before it would go.)
            if (oldestTimestampAllowed <= 0) continue;
            if (this.data[dataType].timestamps[0] >= oldestTimestampAllowed) continue; // Nothing is too old (the usual case: no search needed)
            // Get closest to allowed timestamp
            let closestDataPoint = this.getDataPoint(dataType, oldestTimestampAllowed);
            if (closestDataPoint.index === undefined) continue;
            let removeUpToIdx = closestDataPoint.index; // index NOT included in delete
            if (closestDataPoint.timestamp < oldestTimestampAllowed) removeUpToIdx = closestDataPoint.index + 1; // index included in delete
            // What holds until the next sample is still what is shown when the window starts: a state keeps its last sample before
            // the window (a log does not: its lines are instants), and so does each threshold
            if (dataType == TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_THRESHOLD) { this.__deleteOldThresholds(removeUpToIdx); continue; }
            if (dataType == TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT && this.getAttribute(TELEPLOT.protocol.TELEM_ATTR_LOG) !== true) removeUpToIdx--;
            if (dataType == TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_ENUM || dataType == TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_EDGES) removeUpToIdx--; // (the structure in force stays)
            // Removing from the front of a long array moves all of it: with a lot of data, wait until 1% of it is too old
            let stored = this.data[dataType].timestamps.length;
            if (removeUpToIdx < 1 || (stored >= 4096 && removeUpToIdx < stored * 0.01)) continue;
            // Delete
            this.data[dataType].timestamps.splice(0, removeUpToIdx);
            for (let dataChannel in this.data[dataType].data) {
                this.data[dataType].data[dataChannel].splice(0, removeUpToIdx);
            }
            this.data[dataType].pruned = (this.data[dataType].pruned || 0) + 1; // (what is cached by index from this data starts again: see textRuns)
        }
    };

    // Removes the threshold samples before an index, but the last one of each name (the limit in force when the data window starts)
    __deleteOldThresholds(end) {
        let entry = this.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_THRESHOLD];
        let seen = new Set(), kept = [];
        for(let i = end - 1; i >= 0; i--) {
            let name = entry.data[2][i];
            if(seen.has(name)) continue;
            seen.add(name);
            if(Number.isFinite(entry.data[1][i])) kept.unshift(i); // (a limit that was removed has nothing left to say)
        }
        if(kept.length >= end) return;
        entry.timestamps = kept.map((i) => entry.timestamps[i]).concat(entry.timestamps.slice(end));
        for(let c = 0; c < entry.data.length; c++) { let channel = entry.data[c]; entry.data[c] = kept.map((i) => channel[i]).concat(channel.slice(end)); }
        entry.lateInsertions++;
    };
}

TELEPLOT.datastore = {
    telemetries : {},
    telemetriesNameMap : {}, // Telemetries without id (ex: sent with text protocol) need this to be mapped to an id
}

// Runs fn() and calls watcher(telemetry, dataType, timestamps) for every addData done meanwhile (to know what a file brought). Returns what fn returns.
TELEPLOT.datastore.watchAdds = function(watcher, fn) {
    let previous = _datastore_addWatcher;
    _datastore_addWatcher = watcher;
    try { return fn(); }
    finally { _datastore_addWatcher = previous; }
}

// Dry run: while fn() runs nothing is stored and nothing is cleared (the watcher of watchAdds still sees what would be added), and
// new telemetries are not announced. Telemetries, attributes and clients may still be created: begin a dry run with
// rememberIdentity() and call what it returns to undo that. Used to describe a file before it is opened.
TELEPLOT.datastore.dryRun = function(fn) {
    let previous = _datastore_dry;
    _datastore_dry = true;
    try { return fn(); }
    finally { _datastore_dry = previous; }
}

// Remembers which telemetries and clients exist, with their attributes; the function returned puts that back (what was created
// since is forgotten, attributes that changed get their value back). Data is not concerned.
TELEPLOT.datastore.rememberIdentity = function() {
    let attributes = {};
    for(let id in TELEPLOT.datastore.telemetries) attributes[id] = Object.assign({}, TELEPLOT.datastore.telemetries[id].attributes);
    let names = Object.assign({}, TELEPLOT.datastore.telemetriesNameMap);
    let clients = {};
    for(let id in TELEPLOT.clients.clients) clients[id] = TELEPLOT.clients.clients[id].name;
    return function restore() {
        for(let id of Object.keys(TELEPLOT.datastore.telemetries)) {
            if(attributes[id] === undefined) delete TELEPLOT.datastore.telemetries[id];
            else TELEPLOT.datastore.telemetries[id].attributes = attributes[id];
        }
        for(let name of Object.keys(TELEPLOT.datastore.telemetriesNameMap)) if(!(name in names)) delete TELEPLOT.datastore.telemetriesNameMap[name];
        for(let id of Object.keys(TELEPLOT.clients.clients)) {
            if(!(id in clients)) delete TELEPLOT.clients.clients[id];
            else TELEPLOT.clients.clients[id].name = clients[id];
        }
    };
}

// Runs fn() (parsing a message...) telling that what it creates comes from a source (a connection id), and from which device of it
// (endpoint: the sender address a Teleplot server gives, undefined when the source is one device). Returns what fn returns.
TELEPLOT.datastore.withSource = function(sourceId, fn, endpoint=undefined) {
    let previous = _datastore_currentSourceId, previousEndpoint = _datastore_currentEndpoint;
    _datastore_currentSourceId = sourceId;
    _datastore_currentEndpoint = endpoint;
    try { return fn(); }
    finally { _datastore_currentSourceId = previous; _datastore_currentEndpoint = previousEndpoint; }
}

// Forgets the data of every telemetry (the telemetries stay, with their attributes: views keep what they display).
// keep(telemetry): optional, telemetries for which it returns true keep their data.
TELEPLOT.datastore.clearData = function(keep) {
    for(let id in TELEPLOT.datastore.telemetries) {
        let telem = TELEPLOT.datastore.telemetries[id];
        if(typeof keep === "function" && keep(telem)) continue;
        telem.clearData();
    }
}

/*
 * Memory. Browsers do not tell how much memory a page uses in a way that works everywhere, so the library counts its own data:
 * an estimate, but the same in every browser, and known per telemetry.
 * TELEPLOT.state.memoryLimit is how much the stored data may take. When it is reached, TELEPLOT.state.memoryPolicy decides:
 *   "thin"    the oldest data of the heaviest telemetries is thinned out (Telemetry.thinOldest: real samples are kept, fewer of them)
 *   "forget"  the oldest data of the heaviest telemetries is dropped
 *   "stop"    reception stops (TELEPLOT.setReceiving(false, "memory")), until the user starts it again ("pause": its older name)
 */

// {bytes, samples, telemetries: [{id, name, bytes, samples}]}, heaviest telemetries first
TELEPLOT.datastore.getMemoryUsage = function() {
    let usage = { bytes: 0, samples: 0, telemetries: [] };
    for(let id in TELEPLOT.datastore.telemetries) {
        let telem = TELEPLOT.datastore.telemetries[id];
        let own = telem.getMemoryUsage();
        usage.bytes += own.bytes;
        usage.samples += own.samples;
        usage.telemetries.push({ id: telem.id, name: telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) || String(telem.id), bytes: own.bytes, samples: own.samples });
    }
    usage.telemetries.sort((a, b) => b.bytes - a.bytes);
    return usage;
}

// How far back the data goes: the time span (see Telemetry.getTimeSpan, plus id and name) of the telemetry that covers the longest
// time, or undefined without data. Each telemetry is measured on its own timestamps: they do not all use the same clock.
// "intact" is here how far back no telemetry at all has been thinned out, and "thinned" the names of the telemetries that were.
TELEPLOT.datastore.getTimeSpan = function() {
    let longest = undefined, intact = Infinity, thinned = [];
    for(let id in TELEPLOT.datastore.telemetries) {
        let telem = TELEPLOT.datastore.telemetries[id];
        let span = telem.getTimeSpan();
        if(!span) continue;
        let name = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) || String(telem.id);
        if(span.intact < span.duration) { thinned.push(name); intact = Math.min(intact, span.intact); }
        if(!longest || span.duration > longest.duration) longest = Object.assign(span, { id: telem.id, name });
    }
    if(!longest) return undefined;
    longest.intact = Math.min(intact, longest.duration);
    longest.thinned = thinned;
    return longest;
}

// The last measure, and what was last done about it. Raw (not reactive): refreshed once per second by the update loop.
//   usage: see getMemoryUsage; span: see getTimeSpan; action: "" | "thin" | "forget" | "stop"; actedAt: when (ms); actedOn: names of the telemetries concerned
TELEPLOT.datastore.memory = TELEPLOT.Vue.markRaw({ usage: { bytes: 0, samples: 0, telemetries: [] }, span: undefined, checkedAt: 0, action: "", actedAt: 0, actedOn: [] });

// Measures the data (at most once per second, unless forced) and applies the policy when it is over the limit. Returns the usage.
TELEPLOT.datastore.checkMemory = function(force=false) {
    let memory = TELEPLOT.datastore.memory;
    let now = Date.now();
    if(!force && now - memory.checkedAt < 1000) return memory.usage;
    memory.checkedAt = now;
    let usage = TELEPLOT.datastore.getMemoryUsage();
    let limit = TELEPLOT.state.memoryLimit;
    if(limit > 0 && usage.bytes > limit) {
        let policy = TELEPLOT.state.memoryPolicy;
        if(policy === "stop" || policy === "pause") {
            if(TELEPLOT.state.receiving) {
                TELEPLOT.setReceiving(false, "memory");
                Object.assign(memory, { action: "stop", actedAt: now, actedOn: [] });
            }
        }
        else {
            // Back under the limit with some margin (not to do this on every check), starting with what takes the most room
            let target = limit * 0.9, actedOn = [];
            for(let round = 0; round < 4 && usage.bytes > target; round++) {
                let freed = 0;
                for(let item of usage.telemetries) {
                    if(usage.bytes - freed <= target) break;
                    let telem = TELEPLOT.datastore.telemetries[item.id];
                    let removed = policy === "forget" ? telem.forgetOldest(0.25) : telem.thinOldest(0.5);
                    if(removed < 1) continue;
                    freed += item.bytes - telem.getMemoryUsage().bytes;
                    if(!actedOn.includes(item.name)) actedOn.push(item.name);
                }
                if(freed <= 0) break; // Nothing left to remove
                usage = TELEPLOT.datastore.getMemoryUsage();
            }
            if(actedOn.length) Object.assign(memory, { action: policy === "forget" ? "forget" : "thin", actedAt: now, actedOn });
        }
    }
    memory.usage = usage;
    memory.span = TELEPLOT.datastore.getTimeSpan();
    return usage;
}

/*
 * Reception (doc/time.md "Receiving"). Off: what the sources send is not stored. Files are not sources: an import is stored anyway.
 * The periods during which it was off are remembered ({from, to} in seconds, on the clock of live data: the page's; "to" undefined
 * while it still is), so that what is drawn can break there instead of joining the samples around a hole.
 */
TELEPLOT.datastore.offPeriods = [];

TELEPLOT.setReceiving = function(on, by="user") {
    let state = TELEPLOT.state, periods = TELEPLOT.datastore.offPeriods, now = Date.now();
    on = !!on;
    if(on === state.receiving) return;
    state.receiving = on;
    if(!on) {
        _datastore_offCount++;
        state.receivingOff = { by, at: now };
        periods.push({ from: now / 1000, to: undefined });
    }
    else {
        state.receivingOff = null;
        let last = periods[periods.length - 1];
        if(last && last.to === undefined) last.to = now / 1000;
    }
}

// The holes left by stops of reception in the data of some telemetries (ids or names), merged, that overlap [from, to], in the time of
// their data (what views draw; offPeriods is on the page's clock, which a device's data may not follow): see Telemetry.gapsOf
TELEPLOT.datastore.gapsIn = function(telemetries, from, to) {
    let all = [];
    for(let idOrName of telemetries || []) {
        let telem = TELEPLOT.datastore.getTelemetry(idOrName);
        if(!telem) continue;
        for(let dataType in telem.data) if(!TELEPLOT.protocol.isMetaDataType(dataType)) all.push(...Telemetry.gapsOf(telem.data[dataType], from, to));
    }
    all.sort((a, b) => a.from - b.from);
    let merged = [];
    for(let g of all) {
        let last = merged[merged.length - 1];
        if(last && g.from <= last.to) last.to = Math.max(last.to, g.to);
        else merged.push({ from: g.from, to: g.to });
    }
    return merged;
}

// The periods not received that overlap [from, to] (an open one ends now)
TELEPLOT.datastore.offPeriodsIn = function(from, to) {
    let now = Date.now() / 1000, found = [];
    for(let p of TELEPLOT.datastore.offPeriods) {
        let end = p.to === undefined ? now : p.to;
        if(end >= from && p.from <= to) found.push({ from: p.from, to: end });
    }
    return found;
}

// Periods older than the data window are of no use any more (and no more than 100 are kept)
TELEPLOT.datastore.__pruneOffPeriods = function() {
    let periods = TELEPLOT.datastore.offPeriods, window = TELEPLOT.state.dataTimeout, now = Date.now() / 1000;
    let drop = 0;
    while(drop < periods.length && periods[drop].to !== undefined && ((window > 0 && periods[drop].to < now - window) || periods.length - drop > 100)) drop++;
    if(drop) periods.splice(0, drop);
}

TELEPLOT.datastore.onNewTelemetryHooks = [

]

TELEPLOT.datastore.addTelemetry = function(idOrName) {
    if (TELEPLOT.datastore.hasTelemetry(idOrName)) {
        console.error(Error(`Trying to add existing telemetry : ${idOrName}`));
        return;
    }
    let id = -1;
    let name = "";
    if (typeof idOrName === "number") { id = idOrName; }
    else { // Generate an id
        name = idOrName;
        if (name in TELEPLOT.datastore.telemetriesNameMap) id = TELEPLOT.datastore.telemetriesNameMap[name]; // A name that was forgotten (forgetTelemetries) gets its id back
        else {
            while(TELEPLOT.datastore.hasTelemetry(id)) {
                id = -1 * Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
            }
            TELEPLOT.datastore.telemetriesNameMap[idOrName] = id;
        }
    }

    // Create telemetry
    let telem = new Telemetry(id);
    TELEPLOT.datastore.telemetries[id] = telem;

    // Register name
    if(name != "") {
        telem.setAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME, name);
    }

    if(!_datastore_dry) _datastore_announce(telem);
    return telem;
}

// Calls the new telemetry hooks, with a delay that gives time to receive attributes and data. A telemetry that has nothing to display
// by then (only attributes or thresholds were sent: "ATTR|" and "TH|" lines when a device starts, its values later) is announced
// when it gets its first data: the hooks decide where a telemetry is displayed from what it holds.
function _datastore_announce(telem) {
    telem.__unannounced = false;
    setTimeout(()=>{
        // Forgotten meanwhile ? (By its serial number, not "is it the same object": an application that wraps the library in
        // proxies, as a reactive framework does, gets another object from the datastore than the one that was stored.)
        let stored = TELEPLOT.datastore.telemetries[telem.id];
        if(stored === undefined || stored.serial !== telem.serial) return;
        if(!telem.hasContent()) { telem.__unannounced = true; return; }
        for(let hook of TELEPLOT.datastore.onNewTelemetryHooks) {
            try { hook(telem); }
            catch(e) { console.error("Teleplot new telemetry hook failed:", e); }
        }
    }, 100);
}

// The telemetry of a name, whichever protocol it came from: telemetries of the text protocol are known by their name, the others have
// it as an attribute (the first one found when several clients use the name; "near" is a telemetry whose client is preferred).
let _datastore_names = { count: -1, at: 0, map: {} };
TELEPLOT.datastore.findByName = function(name, near) {
    let known = TELEPLOT.datastore.getTelemetry(name);
    if(known !== undefined || typeof name !== "string") return known;
    let ids = Object.keys(TELEPLOT.datastore.telemetries);
    if(_datastore_names.count !== ids.length || Date.now() - _datastore_names.at > 1000) { // (telemetries came or went, or got their name, since the last search)
        _datastore_names = { count: ids.length, at: Date.now(), map: {} };
        for(let id of ids) {
            let telem = TELEPLOT.datastore.telemetries[id];
            let own = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME);
            if(typeof own === "string" && own !== "") (_datastore_names.map[own] = _datastore_names.map[own] || []).push(telem.id);
        }
    }
    let found = (_datastore_names.map[name] || []).map((id) => TELEPLOT.datastore.telemetries[id]).filter((telem) => telem !== undefined);
    if(near !== undefined) { let same = found.find((telem) => telem.clientId === near.clientId); if(same) return same; }
    return found[0];
}

TELEPLOT.datastore.getTelemetry = function(idOrName) {
    let id = (typeof idOrName === "number") ? idOrName : TELEPLOT.datastore.telemetriesNameMap[idOrName];
    return TELEPLOT.datastore.telemetries[id];
}

// Forgets every telemetry (data and attributes). Names keep their ids, so that views that display a telemetry find it again when it
// comes back.
TELEPLOT.datastore.forgetTelemetries = function() {
    for(let id of Object.keys(TELEPLOT.datastore.telemetries)) delete TELEPLOT.datastore.telemetries[id];
}

TELEPLOT.datastore.hasTelemetry = function(idOrName) {
    return TELEPLOT.datastore.getTelemetry(idOrName) !== undefined;
}

TELEPLOT.datastore.getOrCreateTelemetry = function(idOrName) {
    let telem = TELEPLOT.datastore.getTelemetry(idOrName);
    if(telem === undefined) {
        telem = TELEPLOT.datastore.addTelemetry(idOrName);
    }
    return telem;
}

TELEPLOT.datastore.getTelemetryAttribute = function(id, code) {
    let telem = TELEPLOT.datastore.getTelemetry(id);
    if (telem == undefined) {
        console.error(Error(`Trying to get attribute of a non existent telemetry : ${id}, code : ${code}`));
        return;
    }
    return telem.getAttribute(code);
}

TELEPLOT.datastore.__deleteTimedOutData = function() {
    for(let telemId in TELEPLOT.datastore.telemetries) {
        TELEPLOT.datastore.telemetries[telemId].__deleteTimedOutData();
    }
}