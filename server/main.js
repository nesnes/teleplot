const UDP_PORT = 47269;
const CMD_UDP_PORT = 47268;
const HTTP_WS_PORT = 8080;
const requestDelay = 50;// every requestDelay milliseconds, we send a websocket packet 

const { Console } = require('console');
const udp = require('dgram');
var express = require('express');
var app = express();
var expressWs = require('express-ws')(app);

//Setup file server
app.use(express.static(__dirname + '/www'))

//Setup websocket server
app.ws('/', (ws, req)=>{
    ws.on('message', function(msgStr) {
        try {
            let msg = JSON.parse(msgStr);
            udpServer.send(msg.cmd, CMD_UDP_PORT);
        }
        catch(e){}
    });
});
app.listen(HTTP_WS_PORT);

// Setup UDP server
var udpServer = udp.createSocket('udp4');
udpServer.bind(UDP_PORT);


// packets are being grouped up in this string and sent all together later on ( we have just added a line break between each )
let groupedUpPacket = "";

// Relay UDP packets to Websocket
udpServer.on('message',function(msg,info){
    groupedUpPacket += ("\n" + msg.toString());
});


// every requestDelay ms, we send the packets (no need to send them at a higher frequency as it will just slow teleplot)
setInterval(()=>{
    if(groupedUpPacket != "")
    {
        expressWs.getWss().clients.forEach((client)=>{
            client.send(JSON.stringify({data: groupedUpPacket, fromSerial:false, timestamp: new Date().getTime()}), { binary: false });
        });
    }

    groupedUpPacket = "";
}, requestDelay);

console.log("Teleplot server started");
console.log(`Open your browser at 127.0.0.1:${HTTP_WS_PORT}`);
console.log(`Send telemetry with a "key:value" UDP packet to 127.0.0.1:${UDP_PORT}`);
console.log(`Example:`);
console.log(`\t BASH: echo "myData:1234" | nc -u -w0 127.0.0.1 ${UDP_PORT}`);
