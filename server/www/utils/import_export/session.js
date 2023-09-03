function exportSessionJSON() {
    let savedObj = JSON.stringify({
        telemetries: app.telemetries,
        logs: app.logs,
        dataAvailable: app.dataAvailable,
        logAvailable: app.logAvailable
    }, null, 3);

    saveFile(savedObj, buildFileName("session", "json"));
}

// dataSerie is of type DataSerie, we check that unit exists for this dataSerie
// if it does, we return it between parentheses.
function getFormatedSerieUnit(dataSerie)
{
    if (dataSerie.unit != undefined)
    {
        return " ("+dataSerie.unit.replace(app.csvCellSeparator, "_").replace(app.csvDecimalSeparator, "_") + ")"
    }
    
    return "";
} 

function exportSessionCSV() {

    let csv = "timestamp(ms)"+app.csvCellSeparator;
    let dataList = [];
    for(let key in app.telemetries) {
        let telemetry = app.telemetries[key];
        if (telemetry.type != "3D") // 3D not supported
        {
            csv += (key + getFormatedSerieUnit(telemetry) + app.csvCellSeparator);
            dataList.push(telemetry.data);
        }
    }
    csv += "\n";
    let joinedData = uPlot.join(dataList);

    for(let i=0;i<joinedData[0].length;i++) {
        for(let j=0;j<joinedData.length;j++) {
            let value = joinedData[j][i];
            if(isFinite(value) && !isNaN(value)) {
                valueStr = (""+joinedData[j][i]).replace('.',',').replace(',',app.csvDecimalSeparator)
                csv += '"'+valueStr+'"';

            }
            csv += app.csvCellSeparator
        }
        csv += "\n";
    }
    saveFile(csv, buildFileName("session", "csv"));
    app.csvExportView = false;
}

function importSessionJSON(event) {
    var file = event.target.files[0];
    if (!file) {
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        try{
            let savedObj = JSON.parse(e.target.result);

            app.logAvailable = savedObj.logAvailable;
            app.dataAvailable = savedObj.dataAvailable;
            
            app.logs = savedObj.logs;
            if (app.logs.length>0)
            {
                app.logAvailable = true;
                LogConsole.getInstance().logsUpdated(0, app.logs.length);
            }

            // we rebuilt the telemetries and the shapes from our file
            for (let [telemName, telem] of Object.entries(savedObj.telemetries))
            {
                if (app.telemetries[telemName] == undefined)
                {
                    let newTelem = (new Telemetry(telemName)).iniFromTelem(telem);
                    if (newTelem.type == "3D")
                    {
                        for (let i = 0; i < newTelem.data[0].length ; i++)
                        {
                            let newShape = (new Shape3D()).initializeFromShape3D(newTelem.data[1][i]);
                            newTelem.data[1][i] = newShape;
                        }

                        newTelem.values[0] = newTelem.data[1][newTelem.data[1].length - 1];

                    }
                    Vue.set(app.telemetries, telemName, newTelem);
                }
            }
        }
        catch(e) {
            alert("Importation failed: "+e.toString());
        }
    };
    reader.readAsText(file);
}