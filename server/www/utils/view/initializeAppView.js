var connections = [];
var widgets = [];
var telemetries = {};
var commands = {};
var logs = [];
var telemBuffer = {};
var logBuffer = [];

function initializeAppView()
{
    return new Vue({
        // these methods and attributes can be accessed from the html
        el: '#app',
        data: {
            connections: connections,
            widgets: widgets, // contains chartWidget or DataWidget
            telemetries: telemetries, // contains telemetries (DataSerie)
            commands: commands,
            logs: logs,
            dataAvailable: false,
            cmdAvailable: false,
            logAvailable: false,
            telemRate: 0,
            logRate: 0,
            viewDuration: 0, // the window duration, if == 0, the window will not slide left
            leftPanelVisible: true,
            rightPanelVisible: true,
            textToSend: "",
            sendTextLineEnding: "\\r\\n",
            newChartDropZoneOver: false,
            newConnectionAddress: "",
            creatingConnection: false,
            telemetryFilterString: "",
            isViewPaused: false
        },
        methods: {
            updateStats: function(widget){
                widget.updateStats();
                //Vue.set(telem, "stats", computeStats(telem.data))
            },
            sendCmd: function(cmd) {
                let command = `|${cmd.name}|`;
                if("params" in cmd) command += `${cmd.params}|`;
                for(let conn of app.connections){
                    conn.sendServerCommand({ id: this.id, cmd: command});
                }
            },
            onLogClick: function(log, index) {
                for(l of app.logs) l.selected = log.timestamp > 0 && l.timestamp == log.timestamp;
                logCursor.pub(log);
            },
            showLeftPanel: function(show) {
                app.leftPanelVisible=show;
                triggerChartResize();
            },
            showRightPanel: function(show) {
                app.rightPanelVisible=show;
                triggerChartResize();
            },
            clearAll: function() {
                for(let w of widgets) w.destroy();
                widgets.length = 0;
                Vue.set(app, 'widgets', widgets);
                logs.length = 0;
                Vue.set(app, 'logs', logs);
                logBuffer.length = 0;
                telemetries = {};
                Vue.set(app, 'telemetries', telemetries);
                commands = {};
                Vue.set(app, 'commands', commands);
                telemBuffer = {};
                app.dataAvailable = false;
                app.cmdAvailable = false;
                app.logAvailable = false;
                app.isViewPaused = false;
                app.telemetryFilterString = "";
            },
            sendText: function(text) {
                let escape = app.sendTextLineEnding.replace("\\n","\n");
                escape = escape.replace("\\r","\r");
                vscode.postMessage({ cmd: "sendToSerial", text: text+escape});
            },
            onDragTelemetry: function(e, telemetryName){
                e.dataTransfer.dropEffect = 'copy'
                e.dataTransfer.effectAllowed = 'copy'
                e.dataTransfer.setData("telemetryName", telemetryName);
            },
            onDropInWidget: function(e, widget){
                e.preventDefault();
                e.stopPropagation();
                widget.draggedOver = false;
                let telemetryName = e.dataTransfer.getData("telemetryName");
                let newIsXY = app.telemetries[telemetryName].xy;
                let chartIsXY = (widget.series.length
                    && widget.series[0].sourceNames.length
                    && app.telemetries[widget.series[0].sourceNames[0]].xy
                );
                if(newIsXY != chartIsXY) return;
                let serie = new DataSerie(telemetryName);
                serie.addSource(telemetryName);
                widget.addSerie(serie);
            },
            onWidgetDragOver: function(e, widget){
                e.preventDefault();
                widget.draggedOver = true;
            },
            onWidgetDragLeave: function(e, widget){
                e.preventDefault();
                widget.draggedOver = false;
            },
            showWidget: function(widget, show){
                widget.hidden = show;
                console.log(widget, show)
                triggerChartResize();
            },
            removeWidget: function(widget){
                widget.destroy();
                let idx = widgets.findIndex((w)=>w.id==widget.id);
                if(idx>=0) app.widgets.splice(idx, 1);
                triggerChartResize();
            },
            onDropInNewChart: function(e, prepend=true){      
                e.preventDefault();
                e.stopPropagation();      
                newChartDropZoneOver = false;
                let telemetryName = e.dataTransfer.getData("telemetryName");
                let chart = new ChartWidget(!!app.telemetries[telemetryName].xy);
                let serie = new DataSerie(telemetryName);
                serie.addSource(telemetryName);
                chart.addSerie(serie);
                if(prepend) widgets.unshift(chart);
                else widgets.push(chart);
            },
            onNewChartDragOver: function(e){
                e.preventDefault();
                newChartDropZoneOver = true;
            },
            onNewChartDragLeave: function(e){
                e.preventDefault();
                newChartDropZoneOver = false;
            },
            onMouseDownOnResizeButton: function(event, widget){
                onMouseDownOnResizeButton_(event, widget);                
            },
            createConnection: function(address_=undefined, port_=undefined){
                let conn = new ConnectionTeleplotWebsocket();
                let addr = address_ || app.newConnectionAddress;
                let port = port_ || 8080;
                if(addr.includes(":")) {
                    port = parseInt(addr.split(":")[1]);
                    addr = addr.split(":")[0];
                }
                conn.connect(addr, port);
                app.connections.push(conn);
                app.creatingConnection = false;
                app.newConnectionAddress = "";
            },
            removeConnection: function(conn){
                for(let i=0;i<app.connections.length;i++){
                    if(app.connections[i] == conn) {
                        app.connections[i].disconnect();
                        app.connections.splice(i,1);
                        break;
                    }
                }
            },
            isMatchingTelemetryFilter: function(name){
                if(app.telemetryFilterString == "") return true;
                let escapeRegex = (str) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
                let rule = app.telemetryFilterString.split("*").map(escapeRegex).join(".*");
                rule = "^" + rule + "$";
                let regex = new RegExp(rule);
                return regex.test(name);
            },
            updateWidgetSize: function(widget){
                updateWidgetSize_(widget);
            },
            isWidgetSmallOnGrid: function(widget){
                if(widget.gridPos.w < 3) return true;
                if(widget.gridPos.w < 5 && widget.series.length > 1) return true;
                return false;
            }
        }
    })
}