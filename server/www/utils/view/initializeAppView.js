var connections = [];
var widgets = []; // contains a list of DataWidget objects (all the widgets currently displayed)
var telemetries = {}; // contains a list of Telemetry objects (all the telemetries received)
var commands = {};
var logs = []; // contains a list of Log objects (all the logs received)

var logBuffer = []; // temporary buffer for logs
var telemBuffer = []; // temporary buffer for telemetries

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
            lastValueDropZoneOver: false,
            newConnectionAddress: "",
            creatingConnection: false,
            telemetryFilterString: "",
            isViewPaused: false
        },
        methods: {
            updateStats: function(widget){
                widget.updateStats();
            },
            sendCmd: function(cmd) {
                let command = `|${cmd.name}|`;
                if("params" in cmd) command += `${cmd.params}|`;
                for(let conn of app.connections){
                    conn.sendServerCommand({ id: this.id, cmd: command});
                }
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
                LogConsole.reboot();
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
                this.newChartDropZoneOver = false;
                widget.draggedOver = false;

                if (widget.type != "chart" && widget.type != "widget3D")
                    return;

                let telemetryName = e.dataTransfer.getData("telemetryName");

                let incomingType = app.telemetries[telemetryName].type;
                let currType = widget.series[0].type;
                
                if(incomingType != currType) return;
                
                let serie = getSerieInstanceFromTelemetry(telemetryName);
                widget.addSerie(serie);
            },
            onWidgetDragOver: function(e, widget){
                e.preventDefault();
                this.newChartDropZoneOver = true;
                widget.draggedOver = true;
            },
            onWidgetDragLeave: function(e, widget){
                e.preventDefault();
                this.newChartDropZoneOver = false;
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
                this.newChartDropZoneOver = false;
                let telemetryName = e.dataTransfer.getData("telemetryName");
                
                let chart = undefined;
                
                if (app.telemetries[telemetryName].type == "text")
                {
                    chart = new SingleValueWidget(true);
                    serie = getSerieInstanceFromTelemetry(telemetryName);    
                    chart.addSerie(serie);

                }
                else if (app.telemetries[telemetryName].type == "3D")
                {
                    chart = new Widget3D();
                    chart.addSerie(getSerieInstanceFromTelemetry(telemetryName));
                }
                else
                {
                    chart = new ChartWidget(app.telemetries[telemetryName].type=="xy");
                    chart.addSerie(getSerieInstanceFromTelemetry(telemetryName));
                }
                
                if(prepend) widgets.unshift(chart);
                else widgets.push(chart);
            },
            
            onDropInLastValue: function(e, prepend=true){      
                e.preventDefault();
                e.stopPropagation();   
                this.lastValueDropZoneOver = false;

                let telemetryName = e.dataTransfer.getData("telemetryName");
                
                if (app.telemetries[telemetryName].type == "3D")
                {
                    this.onDropInNewChart(e, prepend);
                    return;
                }

                let chart = new SingleValueWidget(app.telemetries[telemetryName].type == "text"); 
                let serie = getSerieInstanceFromTelemetry(telemetryName);
                chart.addSerie(serie);
                if(prepend) widgets.unshift(chart);
                else widgets.push(chart);
            },
            onNewChartDragOver: function(e){
                e.preventDefault();
                this.newChartDropZoneOver = true;
            },
            onLastValueDragOver: function(e){
                e.preventDefault();
                this.lastValueDropZoneOver = true;
            },
            onNewChartDragLeave: function(e){
                e.preventDefault();
                this.newChartDropZoneOver = false;
            },
            onLastValueDragLeave: function(e){
                e.preventDefault();
                this.lastValueDropZoneOver = false;
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
            isMatchingTelemetryFilter: function(text){
                if (text == undefined || typeof(text) != 'string')
                    return false;

                if(app.telemetryFilterString == "") return true;
                let escapeRegex = (str) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
                let rule = app.telemetryFilterString.split("*").map(escapeRegex).join(".*");
                rule = "^" + rule + "$";
                let regex = new RegExp(rule, 'i');
                return regex.test(text);
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