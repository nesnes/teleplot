// Init Vue
var telemetries = {};
var app = new Vue({
    el: '#app',
    data: {
        telemetries: telemetries
    }
})

var defaultPlotOpts = {
    title: "",
    width: 400,
    height: 200,
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
    var str = ""+msg.data;
    if(!str.includes(':') || !str.includes('|')) return;
    try{
        let arr1 = str.split(':');
        let name = arr1[0];
        let arr2 = arr1[1].split('|');
        let value = arr2[0];
        let type = arr2[1].split('\n')[0];
        appendData(name, value, type);
    }
    catch(e){}
};

function appendData(key, value, type) {
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
    telemetries[key].data[0].push(new Date().getTime()/1000);
    telemetries[key].data[1].push(value);
    telemetries[key].value = value;
}