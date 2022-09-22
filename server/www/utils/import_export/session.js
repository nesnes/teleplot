function exportSessionJSON() {
    let content = JSON.stringify({
        telemetries: app.telemetries,
        logs: app.logs,
        dataAvailable: app.dataAvailable,
        logAvailable: app.logAvailable
    }, null, 3);
    saveFile(content, buildFileName("session", "json"));
}

// dataSerie is of type DataSerie, we check that unit exists for this dataSerie
// if it does, we return it between parentheses.
function getFormatedSerieUnit(dataSerie)
{
    if (dataSerie.unit != undefined)
    {
        if (dataSerie.unit.includes(','))
            throw new Error("Invalid unit name: " + dataSerie.unit+" ( units shouldn't contain comas )");

        return " (" + dataSerie.unit + ") ";
    }
    
    return "";
} 

function exportSessionCSV() {

    let csv = "timestamp(ms),";
    let dataList = [];
    for(let key in app.telemetries) {
        let dataSerie = app.telemetries[key];
        csv += (key + getFormatedSerieUnit(dataSerie) + ",");
        dataList.push(dataSerie.data);
    }
    csv += "\n";
    let joinedData = uPlot.join(dataList);

    for(let i=0;i<joinedData[0].length;i++) {
        for(let j=0;j<joinedData.length;j++) {
            let value = joinedData[j][i];
            if(isFinite(value) && !isNaN(value))
                csv += '"'+(""+joinedData[j][i]).replace('.',',')+'"';
            csv += ","
        }
        csv += "\n";
    }
    saveFile(csv, buildFileName("session", "csv"));
}

function importSessionJSON(event) {
    var file = event.target.files[0];
    if (!file) {
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        try{
            let content = JSON.parse(e.target.result);
            for(let key in content.telemetries){
                // Add pendingData field if missing
                if(!("pendingData" in content.telemetries[key])){
                    content.telemetries[key].pendingData = [[],[]];
                }
            }
            for(let key in content) {
                Vue.set(app, key, content[key]);
            }
            // Trigger a resize event after initial chart display
                triggerChartResize();
        }
        catch(e) {
            alert("Importation failed: "+e.toString());
        }
    };
    reader.readAsText(file);
}