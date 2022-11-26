// Init Vue

var vscode = null;
if("acquireVsCodeApi" in window) vscode = acquireVsCodeApi();

var app = initializeAppView();

//Init refresh rate
setInterval(updateView, 1000 / widgetFPS);


if(vscode){
    let conn = new ConnectionTeleplotVSCode();
    conn.connect();
    app.connections.push(conn);
}
else {
    let conn = new ConnectionTeleplotWebsocket();
    let addr = window.location.hostname;
    let port = window.location.port;
    let udpPort = Math.floor(Math.random() * (65535-1024)) + 1024;
    conn.connect(addr, port, udpPort);
    app.connections.push(conn);
}


/*setInterval(()=>{
    for(let conn of app.connections){
        conn.updateCMDList();
    }
}, 3000);*/

