logCursor = {
    cursor:{
        show: true,
        sync:{
            values:[0,0],
            scales:["x"],
            key: "cursorSync",
            filters: {pub: function(...e){return true}, sub: function(...e){return true}},
            match: [function(a,b){return a==b}],
            setSeries: true,
        },
        left: 10,
        top: 10,
        x: true,
        y: false
    },
    scales: {
        x:{ori:0, _max: 1, _min: 1, key:"x", time:true},
    },
    clientX: -10,
    clientY: -10,
    pub: function(log) {
        // logCursor.cursor.sync.values[0] = log.timestamp;
        // logCursor.cursor.sync.values[1] = 0;
        window.cursorSync.pub("mousemove", logCursor, 0, 0, 0, 0, -42);
    }
};

// Init cursor sync
var timestampWindow = {min:0, max:0};
window.cursorSync = uPlot.sync("cursorSync");
window.cursorSync.sub({ pub:function(type, self, x, y, w, h, i){
    if(type=="mousemove")
    {
        if(i != null) updateDisplayedVarValues(self.cursor.sync.values[0], self.cursor.sync.values[1]);
        else resetDisplayedVarValues();
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

// function updateDisplayedVarValues(valueX, valueY){

//     //for each telem, find closest value (before valueX and valueY)
//     let telemList = Object.keys(app.telemetries);
//     for(let telemName of telemList) {
//         let telem = app.telemetries[telemName];
//         let timeIdx = 0;
//         if(telem.xy) { timeIdx = 2; }
//         let idx = findClosestLowerByIdx(telem.data[timeIdx], valueX);
//         if(idx >= telem.data[timeIdx].length) continue;
//         //Refine index, closer to timestamp
//         if(idx+1 < telem.data[timeIdx].length
//             && (valueX-telem.data[timeIdx][idx]) > (telem.data[timeIdx][idx+1]-valueX)){
//             idx +=1;
//         }
//         if(idx < telem.data[timeIdx].length) {
//             if(telem.xy) {
//                 app.telemetries[telemName].value = ""+telem.data[0][idx].toFixed(4)+" "+telem.data[1][idx].toFixed(4)+"";
//             }
//             else {
//                 app.telemetries[telemName].value = telem.data[1][idx];
//             }
//         }
//     }
// }

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

        // return timeDiff(anchorTimestamp, timestamp1) <= timeDiff(anchorTimestamp, timestamp2);
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


function updateDisplayedVarValues(timestampMouseX, timestampMouseY){

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
    
    let logIdx = findClosestTimestampToCursor(app.logs, timestampMouseX, true);

    LogConsole.getInstance().goToLog(logIdx);
}



// this function is called when our mouse leave the chart 
function resetDisplayedVarValues(){
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

