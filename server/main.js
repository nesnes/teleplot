const UDP_PORT = 47269;
const CMD_UDP_PORT = 47268;
const HTTP_WS_PORT = 80;
const requestDelay = 50;// every requestDelay milliseconds, we send a websocket packet 

console.original_log = console.log.bind(console);
console.original_error = console.error.bind(console);
console.original_warn = console.warn.bind(console);
console.log =   function(){ console.original_log.apply(  console, ["I", new Date().toISOString(), "|"].concat( [].slice.call(arguments) ))};
console.error = function(){ console.original_error.apply(console, ["E", new Date().toISOString(), "|"].concat( [].slice.call(arguments) ))};
console.warn =  function(){ console.original_warn.apply( console, ["W", new Date().toISOString(), "|"].concat( [].slice.call(arguments) ))};

const fs = require('fs');
var http = require('http');
var https = require('https');
const udp = require('dgram');
var express = require('express');
var app = express();

const privateKey = fs.readFileSync('/etc/letsencrypt/live/teleplot.fr/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/teleplot.fr/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/teleplot.fr/chain.pem', 'utf8');
const credentials = {
	key: privateKey,
	cert: certificate,
	ca: ca
};

var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);
httpServer.listen(80);
httpsServer.listen(443);

app.use((req, res, next) => {
    if (!req.secure)
        return res.redirect('https://' + req.headers.host + req.url);
    else
        return next();    
});

require('express-ws')(app, httpsServer);

//Setup file server
app.use(express.static(__dirname + '/www'))

let clientList = {};

//Setup new websocket session

let onWebSocket = (ws, req)=>{
    // Parse port
    let udpPort = Number.parseInt(req.params.port);
    if(udpPort<1024 || udpPort>65535 || !Number.isFinite(udpPort)){
        ws.close();
        return;
    }
    
    // Add in client list
    if(clientList[udpPort] == undefined) {
        let remoteIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log("WS connection on", req.params.port, "from", remoteIp);
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
                console.log("WS disconnection on", udpPort);
                clearInterval(clientList[udpPort].interval);
                clientList[udpPort].udp.close();
                clientList[udpPort] = undefined;
            }
        });

        ws.on('error', (error) => {
            console.error("Websocket error:", error);
        });
    }
    else {
        ws.close();
        return;
    }
}


app.ws('/:port', onWebSocket);


//app.listen(HTTP_WS_PORT);


console.log("Teleplot online server started");
console.log(`Open your browser at teleplot.fr:${HTTP_WS_PORT}`);
