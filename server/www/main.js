// Init Vue
var telemetries = {};
var app = new Vue({
    el: '#app',
    data: {
        telemetries: telemetries,
        dataAvailable: false
    },
    methods: {
        updateStats: function(telem){
            Vue.set(telem, "stats", computeStats(telem.data[1]))
        }
    }
})

// Init cursor sync
window.cursorSync = uPlot.sync("cursorSync");
var defaultPlotOpts = {
    title: "",
    width: 400,
    height: 400,
    scales: {
        x: {
            time: true
        },
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
        // Extract series
        let seriesList = (""+msg.data).split("\n");
        //console.log(seriesList)
        for(let serie of seriesList){
            if(!serie.includes(':') || !serie.includes('|')) return;
            let startIdx = serie.indexOf(':');
            let name = serie.substr(0,serie.indexOf(':'));
            let endIdx = serie.indexOf('|');
            let flags = serie.substr(endIdx+1);
            // Extract values array
            let values = serie.substr(startIdx+1, endIdx-startIdx-1).split(';')
            for(let value of values){
                if(value.length==0) continue;
                let valueX = 0;
                let sepIdx = value.indexOf(':');
                if(sepIdx==-1){
                    valueX = now;
                    valueY = parseFloat(value);
                }
                else {
                    valueX = parseFloat(value.substr(0, sepIdx));
                    valueY = parseFloat(value.substr(sepIdx+1));
                }
                appendData(name, valueX, valueY, flags)
            }            
        }
    }
    catch(e){console.log(e)}
    if(!app.dataAvailable && Object.entries(telemetries).length>0) app.dataAvailable = true;
};

function appendData(key, valueX, valueY, flags) {
    if(key.substring(0, 6) === "statsd") return;
    let isTimeBased = !flags.includes("xy");
    if(telemetries[key] == undefined){
        let config = Object.assign({}, defaultPlotOpts);
        config.name = key;
        config.scales.x.time = isTimeBased;
        var obj = {
            name: key,
            flags: flags,
            data: [[],[]],
            value: 0,
            config: config
        };
        Vue.set(app.telemetries, key, obj)
    }
    if(isTimeBased) telemetries[key].data[0].push(valueX/1000); // timestamp
    else telemetries[key].data[0].push(valueX); // raw XY chart
    telemetries[key].data[1].push(valueY);
    telemetries[key].value = valueY;
}

function exportSessionJSON() {
    let content = JSON.stringify(telemetries);
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
            for(let key in content) Vue.set(app.telemetries, key, content[key]);
            if(Object.entries(telemetries).length>0) app.dataAvailable = true;
            setTimeout(()=>{ // Trigger a resize event after initial chart display
                window.dispatchEvent(new Event('resize'));
            }, 250);
        }
        catch(e) {
            alert("Importation failed: "+e.toString());
        }
    };
    reader.readAsText(file);
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