// Init Vue
var telemetries = {};
var app = new Vue({
    el: '#app',
    data: {
        telemetries: telemetries,
        showHelp: true
    }
})

var defaultPlotOpts = {
    title: "",
    width: 400,
    height: 400,
    scales: {
        x: {
            time: true,
        },
    },
    series: [
        {},
        {
            stroke: "red",
            fill: "rgba(255,0,0,0.1)",
        }
    ]
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
        let value = arrB[1];
        let timestamp = arrB.length==3 ? arrB[2] : 0;
        let type = arrA[1];
        appendData(name, value, timestamp, type);
    }
    catch(e){}
    if(app.showHelp && Object.entries(telemetries).length>0) app.showHelp = false;
};

function appendData(key, value, timestamp, type) {
    if(key.substring(0, 6) === "statsd") return;
    if(telemetries[key] == undefined){
        let config = JSON.parse(JSON.stringify(defaultPlotOpts));
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