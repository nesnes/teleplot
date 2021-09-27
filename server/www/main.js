// Init Vue
var telemetries = {};
var commands = {};
var logs = [];
var telemBuffer = {};
var logBuffer = [];
var app = new Vue({
    el: '#app',
    data: {
        telemetries: telemetries,
        commands: commands,
        logs: logs,
        dataAvailable: false,
        cmdAvailable: false,
        logAvailable: false,
        telemRate: 0,
        logRate: 0
    },
    methods: {
        updateStats: function(telem){
            Vue.set(telem, "stats", computeStats(telem.data[1]))
        },
        sendCmd: function(cmd) {
            socket.send(`|${cmd.name}|`);
        },
        toggleVisibility: function(telem) {
            telem.visible = !telem.visible;
            triggerChartResize();
        },
        onLogClick: function(log, index) {
            for(l of app.logs) l.selected = log.timestamp > 0 && l.timestamp == log.timestamp;
            logCursor.pub(log);
        }
    }
})

//Init refresh rate
setInterval(updateView, 30); // 30fps

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
window.cursorSync = uPlot.sync("cursorSync");
//window.cursorSync.sub(logCursor);
window.cursorSync.sub({ pub:function(type, self, x, y, w, h, i){
    if(type=="mousemove"){
        if(i != -42){
            let timestamp = self.cursor.sync.values[0];
            for(l of app.logs) l.selected = Math.abs(l.timestamp/1000 - timestamp) < 0.1; // within 10ms difference (20ms window)
        }
        if(i != null) updateDisplayedVarValues(self.cursor.sync.values[0], self.cursor.sync.values[1]);
        else resetDisplayedVarValues();
    }
    return true;
}});

var defaultPlotOpts = {
    title: "",
    width: 400,
    height: 400,
    //hooks: {setCursor: [function(e){console.log(e);}]},
    scales: {
        x: {
            time: true
        },
        y:{}
    },
    series: [
        {},
        {
            stroke: "red",
            fill: "rgba(255,0,0,0.1)"
        }
    ],
    cursor: {
        lock: false,
        focus: { prox: 16, },
        sync: {
            key: window.cursorSync.key,
            setSeries: true
        }
    }
};

// Init sockets
var socket = new WebSocket("ws://"+window.location.host);
socket.onmessage = function(msg) {
    let now = new Date().getTime();
    //parse msg
    try{
        // Command
        if(msg.data.startsWith("|")){
            // Parse command list
            let cmdList = msg.data.split("|");
            for(let cmd of cmdList){
                if(cmd.length==0) continue;
                if(app.commands[cmd] == undefined){
                    let newCmd = {
                        name: cmd
                    };
                    Vue.set(app.commands, cmd, newCmd);
                }
            }
            if(!app.cmdAvailable && Object.entries(app.commands).length>0) app.cmdAvailable = true;
        }
        // Log
        else if(msg.data.startsWith(">")){
            let currLog = {
                timestamp: now,
                text: ""
            }
            
            let logStart = msg.data.indexOf(":")+1;
            currLog.text = msg.data.substr(logStart);
            currLog.timestamp = parseInt(msg.data.substr(1, logStart-2));
            if(isNaN(currLog.timestamp) || !isFinite(currLog.timestamp)) currLog.timestamp = 0;
            logBuffer.unshift(currLog);//prepend log to buffer

            //logs.unshift(msg.data.substr(1));//prepend log to list
        }
        // Data
        else {
            // Extract series
            let seriesList = (""+msg.data).split("\n");
            for(let serie of seriesList){
                if(!serie.includes(':') || !serie.includes('|')) return;
                let startIdx = serie.indexOf(':');
                let name = serie.substr(0,serie.indexOf(':'));
                let endIdx = serie.indexOf('|');
                let flags = serie.substr(endIdx+1);
                // Extract values array
                let values = serie.substr(startIdx+1, endIdx-startIdx-1).split(';')
                let xArray = [];
                let yArray = [];
                for(let value of values){
                    if(value.length==0) continue;
                    let sepIdx = value.indexOf(':');
                    if(sepIdx==-1){
                        xArray.push(now);
                        yArray.push(parseFloat(value));
                    }
                    else {
                        xArray.push(parseFloat(value.substr(0, sepIdx)));
                        yArray.push(parseFloat(value.substr(sepIdx+1)));
                    }
                }
                if(xArray.length>0){
                    appendData(name, xArray, yArray, flags)
                }
            }
        }
    }
    catch(e){console.log(e)}
};

function appendData(key, valuesX, valuesY, flags) {
    if(key.substring(0, 6) === "statsd") return;
    let isTimeBased = !flags.includes("xy");
    let shouldPlot = !flags.includes("np");
    if(app.telemetries[key] == undefined){
        let config = Object.assign({}, defaultPlotOpts);
        config.name = key;
        config.scales.x.time = isTimeBased;
        if(!isTimeBased){
            config.cursor.sync = undefined;
        }
        var obj = {
            name: key,
            flags: flags,
            data: [[],[]],
            value: 0,
            config: config,
            visible: shouldPlot
        };
        Vue.set(app.telemetries, key, obj)
        telemBuffer[key] = {data:[[],[]], value:0};
    }
    if(isTimeBased) valuesX.forEach((elem, idx, arr)=>arr[idx] = elem/1000); // convert timestamps to seconds

    // Flush data into buffer (to be flushed by updateView)
    telemBuffer[key].data[0].push(...valuesX);
    telemBuffer[key].data[1].push(...valuesY);
    telemBuffer[key].value = valuesY[valuesY.length-1];
    return;
}

var lastUpdateViewTimestamp = 0;
function updateView() {
    // Flush buffer into app model
    // Telemetry
    let dataSum = 0;
    for(let key in telemBuffer) {
        if(telemBuffer[key].data[0].length == 0) continue; // nothing to flush
        dataSum += telemBuffer[key].data[0].length;
        app.telemetries[key].data[0].push(...telemBuffer[key].data[0]);
        app.telemetries[key].data[1].push(...telemBuffer[key].data[1]);
        app.telemetries[key].value = telemBuffer[key].value
        telemBuffer[key].data[0].length = 0;
        telemBuffer[key].data[1].length = 0;
    }
    if(!app.dataAvailable && Object.entries(app.telemetries).length>0) app.dataAvailable = true;

    // Logs
    var logSum = logBuffer.length;
    if(logBuffer.length>0) {
        app.logs.unshift(...logBuffer);//prepend log to list
        logBuffer.length = 0;
    }
    if(!app.logAvailable && app.logs.length>0) app.logAvailable = true;

    // Stats
    let now = new Date().getTime();
    if(lastUpdateViewTimestamp==0) lastUpdateViewTimestamp = now;
    let diff = now - lastUpdateViewTimestamp
    if(diff>0){
        app.telemRate = app.telemRate*0.8 + (1000/diff*dataSum)*0.2;
        app.logRate = app.logRate *0.8 + (1000/diff*logSum)*0.2;
    }
    lastUpdateViewTimestamp = now;
}

function exportSessionJSON() {
    let content = JSON.stringify({
        telemetries: app.telemetries,
        logs: app.logs,
        dataAvailable: app.dataAvailable,
        logAvailable: app.logAvailable
    });
    let now = new Date();
    let filename = `teleplot_${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}.json`;
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function importSessionJSON(event) {
    var file = event.target.files[0];
    if (!file) {
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        try{
            let content = JSON.parse(e.target.result);
            for(let key in content) {
                Object.ass
                Vue.set(app, key, content[key]);
            }
            // Trigger a resize event after initial chart display
                triggerChartResize();
        }
        catch(e) {
            alert("Importation failed: "+e.toString());
        }
    };
    reader.readAsText(file);
}

function triggerChartResize(){
    setTimeout(()=>{
        window.dispatchEvent(new Event('resize'));
    }, 100);
}

function computeStats(values) {
    let stats = {
        min:0,
        max:0,
        sum:0,
        mean:0,
        med:0,
        stdev:0,
    };
    if(values.length==0) return stats;
    // Sort
    let arr = values.slice().sort(function(a, b){return a - b;});
    // Min, Max
    stats.min = arr[0];
    stats.max = arr[arr.length-1];
    // Sum, Mean
    for(let i=0;i<arr.length;i++) {
        stats.sum += arr[i];
    }
    stats.mean = stats.sum / arr.length;
    // Stdev
    let stdevSum=0;
    for(let i=0;i<arr.length;i++) {
        stdevSum += (arr[i] - stats.mean) * (arr[i] - stats.mean);
    }
    stats.stdev = Math.sqrt(stdevSum/arr.length);
    // Median (only one that requires the costly sort)
    var midSize = arr.length / 2;
	stats.med = midSize % 1 ? arr[midSize - 0.5] : (arr[midSize - 1] + arr[midSize]) / 2;
    return stats;
}

function findClosestLowerByIdx(arr, n) {
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

  function resetDisplayedVarValues(){
    //for each telem, set latest value
    let telemList = Object.keys(app.telemetries);
    for(let telemName of telemList) {
        let telem = app.telemetries[telemName];
        let idx = telem.data[0].length-1;
        if(0 <= idx && idx < telem.data[0].length) {
            telem.value = telem.data[1][idx];
        }
    }
}
function updateDisplayedVarValues(valueX, valueY){
    //for each telem, find closest value (before valueX and valueY)
    let telemList = Object.keys(app.telemetries);
    for(let telemName of telemList) {
        let telem = app.telemetries[telemName];
        let idx = findClosestLowerByIdx(telem.data[0], valueX);
        if(idx < telem.data[0].length) {
            telem.value = telem.data[1][idx];
        }
    }
}

setInterval(()=>{
    socket.send(`|_telecmd_list_cmd|`);
}, 3000);