logCursor = {
    cursor:{
        show: false,
        sync:{
            values:[0,0],
            scales:["x", "y"],
            key: "cursorSync",
            filters: {pub: function(...e){return true}, sub: function(...e){return true}},
            match: [function(a,b){return a==b}],
            setSeries: true,
        },
        left: 10,
        top: 10,
        x: true,
        y: true,
    },
    scales: {
        x:{ori:0, _max: 1, _min: 1, key:"x", time:true},
        y:{ori:0, _max: 1, _min: 1, key:"y", time:true},
    },
    clientX: -10,
    clientY: -10,
    pub: function(log) {
        logCursor.cursor.sync.values[0] = log.timestamp;
        logCursor.cursor.sync.values[1] = 0;
        window.cursorSync.pub("mousemove", logCursor, 0, 0, 0, 0, -42);
    },
    remove : function()
    {
        logCursor.cursor.sync.values[0] = -100000000;
        logCursor.cursor.sync.values[1] = -100000000;
        window.cursorSync.pub("mousemove", logCursor, 0, 0, 0, 0, null); // we pass null so resetCursorDisplayedVarValues() will be called
    }
};

// Init cursor sync
var timestampWindow = {min:0, max:0};
window.cursorSync = uPlot.sync("cursorSync");
window.cursorSync.sub({ pub:function(type, self, x, y, w, h, i){
    if(type=="mouseup"){
        app.isViewPaused = true;
    }
    if(type=="mousemove")
    {
        let scrollLog = (i != -42);
        // if i == -42, we are being called by a mousemove from the log console so the mouse is already hovering the good log
        // so we don't need to scroll to it
        // if i != -42,  we want to scroll to it.
       

        if(i != null) updateDisplayedVarValues(self.cursor.sync.values[0], self.cursor.sync.values[1], scrollLog);
        else resetCursorDisplayedVarValues();
    }
    // let some time to update the axes min/max
    setTimeout(()=>{
        timestampWindow.min = self.scales.x._min;
        timestampWindow.max = self.scales.x._max;
    }, 10);
    return true;
}});


function findClosestLowerByIdx(values, mouseX) {

    let from = 0;
    let to = values.length - 1;
    let idx;
  
    while (from <= to) {
        idx = Math.floor((from + to) / 2);
  
        let isLowerLast = values[idx] <= mouseX && idx == values.length-1;
        let isClosestLower = (idx+1 < values.length-1) && (values[idx] <= mouseX ) && (values[idx+1] > mouseX );
        if (isClosestLower || isLowerLast) {
            return idx;
        }
        else {
            if (values[idx] > mouseX )  to = idx - 1;
            else  from = idx + 1;
        }
    }
    return 0;
}


function findClosestTimestampToCursor(mlist, timeStampMouseX, islog=false) {

    function getTimestamp(i)
    {
        if (!islog) // if !islog, mlist is a list of timestamps, we do mlist[i] to get timestamp i
        {
            return mlist[i];
        }
        if (islog) // if islog, mlist contains a list of log, we do mlist[i]["timestamp"] to get timestamp i
            return mlist[i]["timestamp"];
        
    }

    let from = 0;
    let to = mlist.length - 1;
    let idx;

    function isCloserThan(anchorTimestamp, timestamp1, timestamp2)
    {
        let timeDiff  = (time1, time2) => { return Math.abs(time1 - time2); }

        return timeDiff(anchorTimestamp, timestamp1) < timeDiff(anchorTimestamp, timestamp2);
    }

    while (from <= to) {
        idx = Math.floor((from + to) / 2);

        let isCursorOnTheLeft = timeStampMouseX < getTimestamp(idx);

        if (isCursorOnTheLeft)
        {
            let currentTimestamp = getTimestamp(idx);
            let timestampJustBefore = getTimestamp(idx>0?idx-1:0);

            if (isCloserThan(timeStampMouseX, currentTimestamp, timestampJustBefore))
                return idx; // we have found the closest timestamp
        }
        else // cursor is on the right
        {
            let currentTimestamp = getTimestamp(idx);
            let maxIdx = mlist.length-1;
            let timestampJustAfter = getTimestamp(idx<maxIdx?idx+1:maxIdx);

            if (isCloserThan(timeStampMouseX, currentTimestamp, timestampJustAfter))
                return idx; // we have found the closest timestamp
        }

        if (isCursorOnTheLeft)  to = idx - 1;
        else  from = idx + 1;
    }
    return idx;
}


function updateDisplayedVarValues(timestampMouseX, timestampMouseY, scrollLog){

    //for each telem, find closest value (before mouseX and mouseY)
    let telemList = Object.keys(app.telemetries);
    for(let telemName of telemList) {
        let telem = app.telemetries[telemName];
        let timestamps = telem.type=="xy"?telem.data[2]:telem.data[0];
 
        let idx = findClosestTimestampToCursor(timestamps, timestampMouseX);

        app.telemetries[telemName].values.length = 0;

        if(telem.type=="xy") {
            app.telemetries[telemName].values.push(telem.data[0][idx]);
            app.telemetries[telemName].values.push(telem.data[1][idx]);
        }
        else {
            app.telemetries[telemName].values.push(telem.data[1][idx]);
        }
    }
    
    if (scrollLog)
    {
        let logIdx = findClosestTimestampToCursor(app.logs, timestampMouseX, true);
        LogConsole.getInstance().goToLog(logIdx);
    }
   
}



// this function is called when our mouse leave the chart 
function resetCursorDisplayedVarValues(){
    LogConsole.getInstance().untrackLog();
    //for each telem, set latest value
    let telemList = Object.keys(app.telemetries);
    for(let telemName of telemList) {
        let telem = app.telemetries[telemName];
        if(telem.type=="xy") continue;
        let idx = telem.data[0].length-1;
        if(0 <= idx && idx < telem.data[0].length) {
            telem.values.length = 0;
            (telem.values).push(telem.data[1][idx]);
        }
    }
}

