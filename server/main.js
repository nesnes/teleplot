const UDP_PORT = 47269;
const HTTP_WS_PORT = 8080;

const udp = require('dgram');
var express = require('express');
var app = express();
var expressWs = require('express-ws')(app);

//Setup file server
app.use(express.static('www'))

//Setup websocket server
app.ws('/', (ws, req)=>{});
app.listen(HTTP_WS_PORT);

// Setup UDP server
var udpServer = udp.createSocket('udp4');
udpServer.bind(UDP_PORT);

// Relay UDP packets to Websocket
udpServer.on('message',function(msg,info){
    expressWs.getWss().clients.forEach((client)=>{
        client.send(msg.toString(), { binary: false });
    });
});