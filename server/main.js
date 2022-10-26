const UDP_PORT = 47269;
const CMD_UDP_PORT = 47268;
const HTTP_WS_PORT = 8080;

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

// Relay UDP packets to Websocket
udpServer.on('message',function(msg,info){
    expressWs.getWss().clients.forEach((client)=>{
        client.send(JSON.stringify({data: msg.toString(), fromSerial:false, timestamp: new Date().getTime()}), { binary: false });
    });
});

console.log("Teleplot server started");
console.log(`Open your browser at 127.0.0.1:${HTTP_WS_PORT}`);
console.log(`Send telemetry with a "key:value" UDP packet to 127.0.0.1:${UDP_PORT}`);
console.log(`Example:`);
console.log(`\t BASH: echo "myData:1234" | nc -u -w0 127.0.0.1 ${UDP_PORT}`);
