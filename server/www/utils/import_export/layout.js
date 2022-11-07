function exportLayout() {
    let obj = {
        widgets: [],
        viewDuration: app.viewDuration
    };
    for(let w of widgets) {
        let widget = {
            type: w.type,
            gridPos: w.gridPos,
            series: [],
            precision_mode: w.precision_mode
        };
        for(let s of w.series) {
            let serie = {
                name: s.name,
                sourceNames: s.sourceNames,
                formula: s.formula,
                options: s.options,
                unit: s.unit,
                type : s.type,
            }
            widget.series.push(serie);
        }
        obj.widgets.push(widget);
    }
    let content = JSON.stringify(obj, null, 3);
    let filename = buildFileName("layout", "json");
    saveFile(content, filename);
}

function deleteCurrentWidgets() 
{
    for(let w of widgets) w.destroy();
    
    widgets.length = 0;
    Vue.set(app, 'widgets', widgets);
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

            deleteCurrentWidgets();
            for(let w of content.widgets){

                let newSeries = []
                let isWidgetXY = false;
                for(let s of w.series)
                {
                    let serie = new DataSerie(s.name, s.unit, s.type);
                    for(let sn of s.sourceNames){
                        serie.addSource(sn);
                    }
                    if (serie.type == "xy") isWidgetXY = true;

                    newSeries.push(serie);
                }

                let widget = undefined;

                if(w.type == "chart") 
                {
                    widget = new ChartWidget(isWidgetXY);

                    for(let s of newSeries)
                        widget.addSerie(s);
                }

                else if (w.type == "single_value_text") 
                {
                    widget = new SingleValueWidget(true); 
                    widget.addSerie(newSeries[0]);
                }
                else if (w.type == "single_value_number") 
                {
                    widget = new SingleValueWidget(false); 
                    widget.precision_mode = w.precision_mode
                    widget.addSerie(newSeries[0]);
                }
                else if (w.type == "widget3D")
                {
                    widget = new Widget3D();
                    for (let s of newSeries)
                        widget.addSerie(s);
                }
                else throw new Error("widget type "+w.type+" is not supported");

                
                
                widget.gridPos = w.gridPos;
                setTimeout(()=>{updateWidgetSize_(widget)}, 100);
                widgets.push(widget);
            }
            app.leftPanelVisible = false; // hide telemetry list
        }
        catch(e) {
            alert("Importation failed: "+e.toString());
        }
    };
    reader.readAsText(file);
}