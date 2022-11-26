const UDP_PORT = 47269;
const CMD_UDP_PORT = 47268;
const HTTP_WS_PORT = 80;
const requestDelay = 50;// every requestDelay milliseconds, we send a websocket packet 

const fs = require('fs');
var http = require('http');
var https = require('https');
const udp = require('dgram');
var express = require('express');
var app = express();
require('express-ws')(app);

const privateKey = fs.readFileSync('/etc/letsencrypt/live/teleplot.fr/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/teleplot.fr/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/teleplot.fr/chain.pem', 'utf8');
const credentials = {
	key: privateKey,
	cert: certificate,
	ca: ca
};

//Setup file server
app.use(express.static(__dirname + '/www'))

let clientList = {};

//Setup new websocket session
app.ws('/:port', (ws, req)=>{
    // Parse port
    let udpPort = Number.parseInt(req.params.port);
    if(udpPort<1024 || udpPort>65535){
        ws.close();
        return;
    }

    // Add in client list
    if(clientList[udpPort] == undefined) {
        clientList[udpPort] = {
            udpPort: udpPort,
            ws: ws,
            udp: udp.createSocket('udp4'),
            packets: "",
            interval: null
        };

        // Relay UDP packets to Websocket
        clientList[udpPort].udp.bind(udpPort);
        clientList[udpPort].udp.on('message',function(msg,info){
            clientList[udpPort].packets += ("\n" + msg.toString());
        });
        
        // every requestDelay ms, we send the packets (no need to send them at a higher frequency as it will just slow down teleplot)
        clientList[udpPort].interval = setInterval(()=>{
            if(clientList[udpPort].packets != ""){
                clientList[udpPort].ws.send(JSON.stringify({data: clientList[udpPort].packets, fromSerial:false, timestamp: new Date().getTime()}), { binary: false })
            }
            clientList[udpPort].packets = "";
        }, requestDelay);

        ws.on('close', (code, reason)=>{
            if(clientList[udpPort]){
                clearInterval(clientList[udpPort].interval);
                clientList[udpPort].udp.close();
                clientList[udpPort] = undefined;
            }
        });
    }
    else {
        ws.close();
        return;
    }
});


//app.listen(HTTP_WS_PORT);
var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);

httpServer.listen(80);
httpsServer.listen(443);

console.log("Teleplot online server started");
console.log(`Open your browser at teleplot.fr:${HTTP_WS_PORT}`);
