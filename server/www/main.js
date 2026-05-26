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

    // Parse url params
    let params = new URLSearchParams(window.location.search);

    // Open layout from url
    let layout = params.get("layout")
    if (layout) {
        fetch(layout).then(res => res.blob()).then(blob => {
            importLayoutJSON({target:{files:[blob]}});
        });
    }
    
    // Open connections from url
    let keepSearching = true;
    let index = 1;
    while(keepSearching){
        let connType = params.get("c"+index);
        if(!connType) { keepSearching=false; break; }
        if(connType == "UDP"){
            let connAddr = params.get("c"+index+"a");
            let connPort = params.get("c"+index+"p");
            if(connAddr) { 
                let newConn = new ConnectionTeleplotWebsocket();
                newConn.connect(connAddr, connPort || window.location.port);
                app.connections.push(newConn);
            }
        }
        index++;
    }
}


setInterval(()=>{
    for(let conn of app.connections){
        conn.updateCMDList();
    }
    for(let name in app.telemetries){
        if(app.telemetries[name].usageCount>0) onTelemetryUsed(name, true);
        //else if(!app.telemetries[name].requestedRate || app.telemetries[name].requestedRate>1) onTelemetryUnused(name, true);
    }
}, 3000);

function sendCommand(cmd) {
    let command = `|${cmd.name}|`;
    if("params" in cmd) command += `${cmd.params}|`;
    for(let conn of app.connections){
        conn.sendServerCommand({ id: this.id, cmd: command});
    }
}

