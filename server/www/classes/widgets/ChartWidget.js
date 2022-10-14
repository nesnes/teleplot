/*
This class represents a chart
*/

class ChartWidget extends DataWidget{
    constructor(_isXY=false) {
        super();
        this.type = "chart";
        this.isXY = _isXY;
        this.data = [];
        this.options = {
            title: "",
            width: undefined,
            height: undefined,
            scales: { x: {  time: true }, y:{} },
            series: [ {} ],
            focus: { alpha: 1.0, },
            cursor: {
                lock: false,
                focus: { prox: 16, },
                sync: {  key: window.cursorSync.key,  setSeries: true }
            },
            legend: { show: false }
        }
        if(this.isXY) {
            this.data.push(null);
            this.options.mode = 2;
            delete this.options.cursor;
            this.options.scales.x.time = false;
        }
        this.forceUpdate = true;

        updateWidgetSize_(this);
    }
    destroy(){
        for(let s of this.series) s.destroy();
    }

    addSerie(_serie){
        _serie.options._serie = _serie.name;
        _serie.options.stroke = ColorPalette.getColor(this.series.length).toString();
        _serie.options.fill = ColorPalette.getColor(this.series.length, 0.1).toString();
        if(this.isXY) _serie.options.paths = drawXYPoints;
        this.options.series.push(_serie.options);
        _serie.dataIdx = this.data.length;
        this.data.push([]);
        this.series.push(_serie);
        this.forceUpdate = true;
    }

    update(){
        // Update each series
        for(let s of this.series) s.update();
        if(app.isViewPaused) return;

        if(this.isXY){
            if(this.forceUpdate) {
                this.data.length = 0;
                this.data.push(null);
                for(let s of this.series){
                    s.dataIdx = this.data.length;
                    this.data.push(s.data);
                }
                this.id += "-" //dummy way to force update
                triggerChartResize();
                this.forceUpdate = false;
            }
            else {
                for(let s of this.series) {
                    if(s.pendingData[0].length==0) continue;
                    for(let i=0;i<this.data[s.dataIdx].length;i++){
                        this.data[s.dataIdx][i].push(...s.pendingData[i]);
                    }
                }
            }
        }
        else if(this.data[0].length==0 || this.forceUpdate) {
            //Create data with common x axis
            let dataList = [];
            for(let s of this.series) dataList.push(s.data);
            this.data.length = 0;
            this.data = uPlot.join(dataList)
            this.id += "-" //dummy way to force update
            triggerChartResize();
            this.forceUpdate = false;
        }
        else {
            //Iterate on all series, adding timestamps and values
            let dataList = [];
            for(let s of this.series) dataList.push(s.data);
            this.data.length = 0;
            this.data.push(...uPlot.join(dataList));
        }
    }   
}