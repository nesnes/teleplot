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
    conn.connect(addr, port);
    app.connections.push(conn);
}


setInterval(()=>{
    for(let conn of app.connections){
        conn.updateCMDList();
    }
}, 3000);

