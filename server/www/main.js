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
            console.log(telem);
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
    //parse msg
    var str = (""+msg.data).replaceAll('\n','');
    if(!str.includes(':') || !str.includes('|')) return;
    try{
        let arrA = str.split('|');
        let arrB = arrA[0].split(':');
        let name = arrB[0];
        let value = parseFloat(arrB[1]);
        let timestamp = arrB.length==3 ? parseFloat(arrB[2]) : 0;
        let type = arrA[1];
        appendData(name, value, timestamp, type);
    }
    catch(e){}
    if(!app.dataAvailable && Object.entries(telemetries).length>0) app.dataAvailable = true;
};

function appendData(key, value, timestamp, type) {
    if(key.substring(0, 6) === "statsd") return;
    if(telemetries[key] == undefined){
        //let config = JSON.parse(JSON.stringify(defaultPlotOpts));
        let config = Object.assign({}, defaultPlotOpts);
        config.name = key;
        var obj = {
            name: key,
            type: type,
            data: [[],[]],
            value: 0,
            config: config
        };
        Vue.set(app.telemetries, key, obj)
    }
    telemetries[key].data[0].push(timestamp/1000);
    telemetries[key].data[1].push(value);
    telemetries[key].value = value;
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