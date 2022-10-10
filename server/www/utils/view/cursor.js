
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
        logCursor.cursor.sync.values[0] = log.timestamp/1000;
        logCursor.cursor.sync.values[1] = 0;
        window.cursorSync.pub("mousemove", logCursor, 0, 0, 0, 0, -42);
    }
};

// Init cursor sync
var timestampWindow = {min:0, max:0};
window.cursorSync = uPlot.sync("cursorSync");
window.cursorSync.sub({ pub:function(type, self, x, y, w, h, i){
    if(type=="mousemove"){
        if(i != -42){
            let timestamp = self.cursor.sync.values[0];
            for(l of app.logs) l.selected = Math.abs(l.timestamp/1000 - timestamp) < 0.1; // within 10ms difference (20ms window)
        }
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


function findClosestLowerByIdx(arr, n) {

    // console.log("findClosestLowerByIdx");
    let from = 0,
        to = arr.length - 1,
        idx;
  
    while (from <= to) {
        idx = Math.floor((from + to) / 2);
  
        let isLowerLast = arr[idx] <= n && idx == arr.length-1;
        let isClosestLower = (idx+1 < arr.length-1) && (arr[idx] <= n) && (arr[idx+1] > n);
        if (isClosestLower || isLowerLast) {
            return idx;
        }
        else {
            if (arr[idx] > n)  to = idx - 1;
            else  from = idx + 1;
        }
    }
    return 0;
}



function updateDisplayedVarValues(mouseX, mouseY){


    //for each telem, find closest value (before mouseX and mouseY)
    let telemList = Object.keys(app.telemetries);
    for(let telemName of telemList) {
        let telem = app.telemetries[telemName];
        let timeIdx = 0;
        if(telem.type=="xy") { timeIdx = 2; }
        let idx = findClosestLowerByIdx(telem.data[timeIdx], mouseX);

        if(idx >= telem.data[timeIdx].length) continue;
        //Refine index, closer to timestamp
        if(idx+1 < telem.data[timeIdx].length
            && (mouseX-telem.data[timeIdx][idx]) > (telem.data[timeIdx][idx+1]-mouseX)){
            idx +=1;
        }
        if(idx < telem.data[timeIdx].length) {
            app.telemetries[telemName].values.length = 0;

            if(telem.type=="xy") {
                app.telemetries[telemName].values.push(telem.data[0][idx]);
                app.telemetries[telemName].values.push(telem.data[1][idx]);
            }
            else {
                app.telemetries[telemName].values.push(telem.data[1][idx]);
            }
        }
    }
}



// this function is called when our mouse leave the chart 
function resetDisplayedVarValues(){
    //for each telem, set latest value
    let telemList = Object.keys(app.telemetries);
    for(let telemName of telemList) {
        let telem = app.telemetries[telemName];
        if(telem.type=="xy") continue;
        let idx = telem.data[0].length-1;
        if(0 <= idx && idx < telem.data[0].length) {
            telem.values = [];
            (telem.values).push(telem.data[1][idx]);
        }
    }
}

