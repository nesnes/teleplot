class Telemetry {
    constructor(id) {
        this.id = id;
        this.clientId = -1;
        this.attributes = {};
        this.data = {};
    }
    setAttribute(code, data) {
        this.attributes[code] = data;
    }
    getAttribute(code) {
        return this.attributes[code];
    }
    addData(dataType, timestamps, dataList) { // addData(TELEM_DATA_SHAPE_COLOR_RGB, [t1,t2], [[r1,r2], [g1,g2], [b1,b2]])
        if(TELEPLOT.state.isPaused) return; // Do not handle incoming data while paused
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
            this.data[dataType] = {timestamps: [], data: [], lastUpdate: 0};
            for(let i=0;i<dataList.length;i++) {
                this.data[dataType].data[i] = [];
            }
        }
        // For each incoming data, insert ordered
        for(let i=0;i<timestamps.length;i++) {
            let timestamp = timestamps[i];
            if (timestamp<0) continue; // Do not use negative timestamps (not supported and -1 could interact with getDataPoint)
            // Find insertion point (keeping data timestamp-ordered)
            let closestDataPoint = this.getDataPoint(dataType, timestamp);
            let insertIdx = timestamps.length; // insert at the end
            if (closestDataPoint.index !== undefined) {
                if (closestDataPoint.timestamp > timestamp) { insertIdx = closestDataPoint.index; } // insert "before"
                else { insertIdx = closestDataPoint.index+1; } // insert "after" 
            }
            // Insert data
            this.data[dataType].timestamps.splice(insertIdx, 0, timestamp);
            for(let j=0;j<dataList.length;j++) {
                this.data[dataType].data[j].splice(insertIdx, 0, dataList[j][i]);
            }
        }

        this.data[dataType].lastUpdate = Date.now();
    };
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
        Object.keys(this.data).forEach(key => delete this.data[key]);
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
            // Get closest to allowed timestamp
            let closestDataPoint = this.getDataPoint(dataType, oldestTimestampAllowed);
            if (closestDataPoint.index === undefined) continue;
            let removeUpToIdx = closestDataPoint.index; // index NOT included in delete
            if (closestDataPoint.timestamp < oldestTimestampAllowed) removeUpToIdx = closestDataPoint.index + 1; // index included in delete
            // Delete
            this.data[dataType].timestamps.splice(0, removeUpToIdx);
            for (let dataChannel in this.data[dataType].data) {
                this.data[dataType].data[dataChannel].splice(0, removeUpToIdx);
            }
        }
        for (let dataType in this.data) {
            this.data[dataType].timestamp
        }
    };
}

TELEPLOT.datastore = {
    telemetries : {},
    telemetriesNameMap : {}, // Telemetries without id (ex: sent with text protocol) need this to be mapped to an id
}

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
        while(TELEPLOT.datastore.hasTelemetry(id)) {
            id = -1 * Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        }
        TELEPLOT.datastore.telemetriesNameMap[idOrName] = id;
    }

    // Create telemetry
    telem = new Telemetry(id);
    TELEPLOT.datastore.telemetries[id] = telem;

    // Register name
    if(name != "") {
        telem.setAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME, name);
    }
    return telem;
}

TELEPLOT.datastore.getTelemetry = function(idOrName) {
    let id = (typeof idOrName === "number") ? idOrName : TELEPLOT.datastore.telemetriesNameMap[idOrName];
    return TELEPLOT.datastore.telemetries[id];
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