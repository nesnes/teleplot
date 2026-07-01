class ViewChart extends Views{
    constructor(divId, telemetryIdOrNameList, group="default"){
        super(divId, group);
        this.type = "teleplot-chart";
        this.telemetryIdOrNameList = telemetryIdOrNameList;
        this.updateForced = true; // Force initial update
        this.updateRunning = false;
        this.supportedDataTypes = [""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER];

        // Vue data
        this.telemetries = TELEPLOT.Vue.reactive({});
        this.chartDivId = "teleplot-chart-"+crypto.randomUUID();
        this.chartData = TELEPLOT.Vue.reactive([]);
        this.chart = TELEPLOT.Vue.reactive({});
        this.chartOptions = TELEPLOT.Vue.reactive({});
    }

    init(){
        super.init();

        let self = this;
        this.vue.component(this.type, {
            name: this.type,
            data() {
                return {
                    chartDivId: self.chartDivId,
                    chartOptions: self.chartOptions,
                    chartData: self.chartData,
                    chart: self.chart,
                    telemetries : self.telemetries,
                    options : self.options
                }
            },
            template: ViewChart.vueHTML,
        });

        // Add component to DOM and start vuejs
        let element = document.getElementById(this.divId);
        if(element == null) { throw new Error(`Cannot create ${this.type} as #${this.divId} doesn't exists`); return; }
        let innerElement = document.createElement(this.type);
        element.append(innerElement);        
        this.vue.mount(`#${this.divId}`);

        // Create uPlot chart
        this.createChart();
    }
    
    destroyChart() {
        
    }
    
    createChart() {
        // Default options
        this.chartOptions = {
            title: "",
            width: undefined,
            height: undefined,
            scales: { x: { time: true }, y:{} },
            series: [ {} ],
            axes: [ 
                { gap: 2, size: 28,  font: `8px`, ticks: { show: true, size: 2, } },
                { space: 20, gap: 2, font: `11px`, ticks: { show: true, size: 2, } }
            ],
            focus: { alpha: 1.0, },
            cursor: {
                lock: false,
                focus: { prox: 16, },
                //sync: { key: window.cursorSync.key,  setSeries: true }
            },
            legend: { show: false },
            hooks: {
                setCursor: [
                    (u) => {
                        if(this.updateRunning) return;
                        // Mouse leave
                        if(u.cursor.left < 0) {
                            TELEPLOT.view.groups[this.group].cursorActive = false;
                            TELEPLOT.view.groups[this.group].cursorTimestamp = -1;
                            return;
                        }
                        // Mouse hover
                        const idx = u.posToIdx(u.cursor.left);
                        if (idx != null)
                            TELEPLOT.view.groups[this.group].cursorTimestamp = u.data[0][idx];
                        }
                ],
                setScale: [
                    (u, key) => {
                        if(this.updateRunning) return;
                        if(key != "x") return;
                        // Zoom selected
                        const s = u.scales[key];
                        TELEPLOT.view.groups[this.group].timestampFrom = s.min;
                        TELEPLOT.view.groups[this.group].timestampTo = s.max;
                        TELEPLOT.view.groups[this.group].cursorActive = true;
                    }
                ]
            }
        };
        // Configure series
        let telemIdx = 0;
        for(let telemIdOrName of this.telemetryIdOrNameList){
            let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
            if(telem === undefined) continue;
            let supportedType = false;
            for(let dataType in telem.data) {
                if(!this.supportedDataTypes.includes(dataType)) continue;
                supportedType = true;
                break;
            }
            if (!supportedType) continue;

            this.chartOptions.series.push({
                label: telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME),
                stroke: () =>{ return this.telemetries[telem.id].color; }
            });
        }
        // Create chart
        this.resize();
        this.chart = new TELEPLOT.uPlot(this.chartOptions, this.chartData, document.getElementById(this.chartDivId));
    }

    resize(){
        // Default values
        let width = 200;
        let height = 100;
        let elem = document.getElementById(this.chartDivId)
        if (elem) {
            width = elem.clientWidth;
            height = elem.clientHeight;
        }
        let sizeHasChanged = this.chartOptions.width != width || this.chartOptions.height != height;

        this.chartOptions.width = width;
        this.chartOptions.height = height;
        if (sizeHasChanged && this.chart && "setSize" in this.chart) {
            this.chart.setSize({width, height});
        }
    }

    update(){
        this.updateRunning = true;

        // Trigger chart resize (only if needed)
        this.resize();
        // For each telemetry
        let needUpdate = false;
        let serieIdx = 0;
        for(let telemIdOrName of this.telemetryIdOrNameList){
            let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
            if(telem === undefined) continue;
            serieIdx += 1;

            // Get name and unit
            if(this.telemetries[telem.id] === undefined) {
                this.telemetries[telem.id] = {telem: telem, name: "", unit: "", color: "", lastUpdate: 0, lastTargetTimestamp: 0, actualValue: [], actualStrValue: []};
            }
            this.telemetries[telem.id].name = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME);
            this.telemetries[telem.id].unit = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT);

            // Resolve color
            this.telemetries[telem.id].color = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_COLOR);
            if (!this.telemetries[telem.id].color) {
                this.telemetries[telem.id].color = TELEPLOT.colors.getColor(serieIdx).toStrRGB();
            }
            
            // Check last update, last value, and str representation
            let formatter = new Intl.NumberFormat('en-US', {
                style: 'decimal',
                minimumFractionDigits: 0,
                maximumFractionDigits: this.getOption("displayNumberDecimals", telem.id)
            });
            for(let dataType in telem.data) {
                if(!this.supportedDataTypes.includes(dataType)) continue;
                
                let targetTimestamp = TELEPLOT.view.groups[this.group].cursorTimestamp;
                let dataPoint = telem.getDataPoint(dataType, targetTimestamp);
                
                // Check update need
                needUpdate |= this.telemetries[telem.id].lastUpdate != telem.data[dataType].lastUpdate;
                needUpdate |= this.telemetries[telem.id].lastTargetTimestamp != targetTimestamp;
                this.telemetries[telem.id].lastUpdate = telem.data[dataType].lastUpdate;
                this.telemetries[telem.id].lastTargetTimestamp = targetTimestamp;
                
                for (let channel in dataPoint.data) {
                    let value = dataPoint.data[channel];
                    this.telemetries[telem.id].actualValue[channel] = value;
                    this.telemetries[telem.id].actualStrValue[channel] = (typeof value === "number") ? formatter.format(value) : ""+value;
                }
                break;
            }
        }

        // Create chart data
        if(needUpdate || this.updateForced) {
            let dataList = [];
            for(let telemIdOrName of this.telemetryIdOrNameList){
                let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
                if(telem === undefined) continue;
                
                for(let dataType in telem.data) {
                    if(!this.supportedDataTypes.includes(dataType)) continue;
                    dataList.push([
                            telem.data[dataType].timestamps,
                            ...telem.data[dataType].data // only 1 channel expected
                    ]);
                    break; // only 1 datatype expected
                }
            }
            this.chartData.length = 0;
            this.chartData.push(...TELEPLOT.uPlot.join(dataList));
            // Update chart
            this.updateForced = false;
            if(this.chart) {
                this.chart.batch(() => {
                    //Set data
                    this.chart.setData(this.chartData);
                    // Set scale
                    if(TELEPLOT.view.groups[this.group].cursorActive) {
                        this.chart.setScale("x", {
                            min: TELEPLOT.view.groups[this.group].timestampFrom,
                            max: TELEPLOT.view.groups[this.group].timestampTo
                        });
                    }
                });// Allows a single chart redraw even if we call multiple updates (data and scale)
            }
        }
        // Used to ignore hooks triggered by updating the chart
        queueMicrotask(()=>{this.updateRunning = false;}); // Need to use queueMicrotask to make sure to run after uPlot hooks are fired
    }
    
    static vueHTML = `
        <div class="teleplot-js-chart-container teleplot-js-telemetry-card">
            <div class="teleplot-js-chart-legend">
                <div v-for="(telem, index) in telemetries" v-bind:key="index" class="teleplot-js-chart-legend-block">
                    
                    <div v-if="telem.actualStrValue && telem.actualStrValue.length" class="teleplot-js-chart-legend-value"
                        v-bind:style="{'background-color': telem.color, 'width': ''+telem.actualStrValue.join(',').length+'ch' }"
                        v-bind:title="telem.actualValue" >
                        <span>{{telem.actualStrValue.join(",")}}</span>
                    </div>

                    <div class="teleplot-js-chart-legend-name" v-bind:class="{'teleplot-js-chart-legend-name-unsupported': (!telem.actualStrValue || !telem.actualStrValue.length)}">
                        <span>{{telem.name}}</span>
                        <span v-if="telem.unit"> ({{telem.unit}})</span>
                    </div>
                    
                </div>
            </div>
            <div class="teleplot-js-chart-container" v-bind:id="chartDivId"></div>
        </div>
    `;
    
    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-chart-container {
                font-size: 14px;
                width: 100%;
                height: calc(100% - 1.5em) !important;  /* keyword probably not required, but this dimension is important */
                display: block;
            }
            .teleplot-js-chart-legend {
                height: 1.5em !important;               /* keyword probably not required, but this dimension is important */
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: space-evenly;
                flex-wrap: nowrap;
                gap: 1em;
                overflow: scroll;
                scrollbar-width: none;
            }
            .teleplot-js-chart-legend-block {
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: space-evenly;
                flex-wrap: nowrap;
                gap: 0.5em;
                white-space: nowrap;
            }
            .teleplot-js-chart-legend-name {
            }
            .teleplot-js-chart-legend-value {
                border-radius: 4px;
                padding: 2px;
                color: white;
                text-align: center;
                transition: width 0.25s ease-in-out;
            }
            .teleplot-js-chart-legend-name-unsupported {
                opacity: 0.7;
                text-decoration: line-through;
            }
        }
    `;

}

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = ViewChart.vueCSS;
    document.head.appendChild(elem);
}

TELEPLOT.view.ViewChart = ViewChart;