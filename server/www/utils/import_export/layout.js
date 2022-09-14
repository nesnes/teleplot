function exportLayout() {
    let obj = {
        widgets: [],
        viewDuration: app.viewDuration
    };
    for(let w of widgets) {
        let widget = {
            type: w.type,
            gridPos: w.gridPos,
            series: []
        };
        for(let s of w.series) {
            let serie = {
                name: s.name,
                sourceNames: s.sourceNames,
                formula: s.formula,
                options: s.options
            }
            widget.series.push(serie);
        }
        obj.widgets.push(widget);
    }
    let content = JSON.stringify(obj);
    let now = new Date();
    let filename = `teleplot_layout_${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}.json`;
    saveFile(content, filename);
}

function importLayoutJSON(event) {
    var file = event.target.files[0];
    if (!file) {
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        try{
            let content = JSON.parse(e.target.result);
            if("viewDuration" in content) app.viewDuration = content.viewDuration;
            for(let w of content.widgets){
                if(w.type == "chart"){
                    let newSeries = []
                    let isXY = false;
                    for(let s of w.series){
                        let serie = new DataSerie(s.name);
                        for(let sn of s.sourceNames){
                            if(sn in app.telemetries && app.telemetries[sn].xy) {
                                isXY = true;
                            }
                            serie.addSource(sn);
                        }
                        newSeries.push(serie);
                    }
                    let chart = new ChartWidget(isXY);
                    for(let s of newSeries) {
                        chart.addSerie(s);
                    }
                    chart.gridPos = w.gridPos;
                    setTimeout(()=>{updateWidgetSize_(chart)}, 100);
                    widgets.push(chart);
                }
            }
            app.leftPanelVisible = false; // hide telemetry list
        }
        catch(e) {
            alert("Importation failed: "+e.toString());
        }
    };
    reader.readAsText(file);
}