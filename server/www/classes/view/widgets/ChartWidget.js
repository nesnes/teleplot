/*
This class represents a chart
*/

class ChartWidget extends DataWidget{
    constructor(_isXY=false) {
        super();
        this.type = "chart";
        this.isXY = _isXY;
        this.data = []; // this is what contains the data ready for uplot
        this.data_available_xy = false; // this tells wheter this.data is ready for uplot for xy chart or not
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
                sync: { key: window.cursorSync.key,  setSeries: true }
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
        _serie.options._id = _serie.id;
        // Search available color
        for(let i=this.series.length; i>=0; i--)  {
            let candidateColor = ColorPalette.getColor(i).toString();
            let alreadyUsed = this.options.series.findIndex((o)=>o.stroke==candidateColor) >= 0;
            if(alreadyUsed) continue;
            _serie.options.stroke = ColorPalette.getColor(i).toString();
            _serie.options.fill = ColorPalette.getColor(i, 0.1).toString();
            break;
        }
        if(this.isXY) _serie.options.paths = drawXYPoints;
        this.options.series.push(_serie.options);
        _serie.dataIdx = this.data.length;
        this.data.push([]);
        this.series.push(_serie);
        this.forceUpdate = true;
    }

    removeSerie(_serie){
        let idx = this.series.findIndex((s)=>s.id==_serie.id);
        if(idx>=0) this.series.splice(idx, 1);

        let idxOption = this.options.series.findIndex((o)=>o._id==_serie.id);
        if(idxOption>=0) this.options.series.splice(idxOption, 1);
        
        this.forceUpdate = true;
        this.update();
    }

    update(){
        // Update each series
        for(let s of this.series) s.update();
        if(app.isViewPaused && !this.forceUpdate) return;

        if(this.isXY){
            if(this.forceUpdate) {
                this.data.length = 0;
                this.data.push(null);
                for(let s of this.series){
                    s.dataIdx = this.data.length;
                    this.data.push(s.data);
                }
                this.id += "-" //DUMMY way to force update
                // triggerChartResize();
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

            let elIsAlone = (el) => {return (el != null && el.length == 1) };

            this.data_available_xy = (this.data.length>=2 && this.data[1] != null && this.data[1] != undefined 
                && !(this.data[1].some(elIsAlone)));
        }
        else if(this.data[0].length==0 || this.forceUpdate && !this.updatedForZeroLength) {
            //Create data with common x axis
            let dataList = [];
            for(let s of this.series) dataList.push(s.data);
            this.data.length = 0;
            this.data = uPlot.join(dataList)
            this.id += "-" //DUMMY way to force update
            // triggerChartResize();
            this.forceUpdate = false;
            this.updatedForZeroLength = true; // Avoid constant update of widget with no data
        }
        else {
            //Iterate on all series, adding timestamps and values
            let dataList = [];
            for(let s of this.series) dataList.push(s.data);
            this.data.length = 0;
            this.data.push(...uPlot.join(dataList));
            if(this.data[0].length>0) this.updatedForZeroLength = false;
        }
    }   
}