function exportSessionJSON() {
    let content = JSON.stringify({
        telemetries: app.telemetries,
        logs: app.logs,
        dataAvailable: app.dataAvailable,
        logAvailable: app.logAvailable
    });
    let now = new Date();
    let filename = `teleplot_${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}.json`;
    saveFile(content, filename);
}

function exportSessionCSV() {

    let csv = "timestamp(ms),";
    let dataList = [];
    for(let key in app.telemetries) {
        csv += key+",";
        dataList.push(app.telemetries[key].data);
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
    let now = new Date();
    let filename = `teleplot_${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}.csv`;
    saveFile(csv, filename);
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