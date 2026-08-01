class ViewCurrentValue extends ViewTelemetries{
    constructor(divId, telemetryIdOrNameList, group="default"){
        super(divId, group);
        this.type = "teleplot-current-value";
        this.telemetryIdOrNameList = telemetryIdOrNameList;

        this.options.displayLayoutRow = false; // Change from default column layout to row
        this.options.displayTelemetryName = true; // Show telemetry name
        this.options.displayTelemetryColor = true; // Show telemetry color

        // Reduce default size
        this.layout.width = 1;
        this.layout.height = 1;
        
        // Vue data
        this.telemetries = TELEPLOT.Vue.reactive({});
    }

    init(){
        super.init();

        let self = this;
        this.vue.component(this.type, {
            name: this.type,
            data() {
                return {
                    telemetries : self.telemetries,
                    options : self.options,
                    layout : self.layout
                }
            },
            template: ViewCurrentValue.vueHTML,
        });

        // Add component to DOM and start vuejs
        let element = document.getElementById(this.divId);
        if(element == null) { throw new Error(`Cannot create ${this.type} as #${this.divId} doesn't exists`); return; }
        let innerElement = document.createElement(this.type);
        element.append(innerElement);        
        this.vue.mount(`#${this.divId}`);
    }

    update(){
        if (!super.__before_update()) return;

        let serieIdx = 0;
        for(let telemIdOrName of this.telemetryIdOrNameList){
            let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
            if(telem === undefined) continue;
            serieIdx += 1;

            // Add telem to vue data
            if(this.telemetries[telem.id] === undefined) {
                this.telemetries[telem.id] = {telem: telem, name: "", unit: "", color:"", data: {}};
            }
            
            // Resolve color
            this.telemetries[telem.id].color = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_COLOR);
            if (!this.telemetries[telem.id].color) {
                this.telemetries[telem.id].color = TELEPLOT.colors.getColor(serieIdx).toStrRGB();
            }

            // Extract telem attributes
            this.telemetries[telem.id].telem = telem;
            this.telemetries[telem.id].name = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME);
            this.telemetries[telem.id].unit = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT);
            for(let dataType in telem.data) {
                if(this.telemetries[telem.id].data[dataType] === undefined) {
                    this.telemetries[telem.id].data[dataType] = { timestamp:0, lastValue: [], lastDisplayValue: [] };
                }

                let targetTimestamp = TELEPLOT.view.groups[this.group].cursorTimestamp;
                let dataPoint = telem.getDataPoint(dataType, targetTimestamp);
                if (dataPoint.index === undefined) continue;

                this.telemetries[telem.id].data[dataType].timestamp = dataPoint.timestamp;

                // Get latest value of each channel and compute string representation
                let formatter = new Intl.NumberFormat('en-US', {
                    style: 'decimal',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: this.getOption("displayNumberDecimals", telem.id)
                });
                let channelIdx = 0;
                
                for(let dataChannel in dataPoint.data) {
                    let lastValue = dataPoint.data[dataChannel];
                    this.telemetries[telem.id].data[dataType].lastValue[channelIdx] = lastValue;
                    let displayStr = ""+lastValue;
                    // Per type conversion to lastDisplayValue
                    if(typeof lastValue === "number") displayStr = formatter.format(lastValue);
                    if(dataChannel == "1" && dataType == ""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE) {
                        //console.log("img", targetTimestamp, dataPoint.timestamp)
                        let imgType = this.telemetries[telem.id].data[dataType].lastValue[0];
                        let imgTypeStr = "jpeg";
                        if (imgType == TELEPLOT.protocol.IMAGE_TYPE_PNG) imgTypeStr = "png";
                        displayStr = "data:image/" + imgTypeStr + ";base64," + displayStr;
                    }
                    this.telemetries[telem.id].data[dataType].lastDisplayValue[channelIdx] = displayStr;
                    channelIdx++;
                }
            }
        }
    }
    
    static vueHTML = `
        <div class="teleplot-js-current-value-container teleplot-js-telemetry-card" v-bind:class="{'teleplot-js-current-value-row': options.displayLayoutRow}"
        :style=" { '--layout-width': layout.width, '--layout-height': layout.height }">
            <div v-for="(telem, index) in telemetries" v-bind:key="index" class="teleplot-js-current-value-block">
                
                <div v-if="options.displayTelemetryColor && Object.keys(telemetries).length>1" class="teleplot-js-current-value-color" v-bind:style="{'background-color': telem.color}"></div>
                
                <!-- NAME & UNIT -->
                <template v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE}] === undefined">
                    <div v-if="options.displayTelemetryName" class="teleplot-js-current-value-name">
                        <span>{{telem.name}}</span>
                        <span v-if="telem.unit"> ({{telem.unit}})</span>
                    </div>
                </template>
                    
                <!-- NUMBERS & TEXT -->
                <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT}] != undefined" class="teleplot-js-current-value-value" 
                    v-bind:title="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT}].lastValue[0]">
                    <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT}].lastDisplayValue[0]}}</span>
                </div>
                <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER}] != undefined" class="teleplot-js-current-value-value"
                    v-bind:title="''+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER}].lastValue[0]">
                    <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER}].lastDisplayValue[0]}}</span>
                </div>
                <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}] != undefined" class="teleplot-js-current-value-value"
                    v-bind:title="''+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}].lastValue[0]+', '+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}].lastValue[1]">
                    <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}].lastDisplayValue[0]}}</span>
                    <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}].lastDisplayValue[1]}}</span>
                </div>
                <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}] != undefined" class="teleplot-js-current-value-value"
                    v-bind:title="''+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastValue[0]+', '+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastValue[1]+', '+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastValue[2]">
                    <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastDisplayValue[0]}}</span>
                    <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastDisplayValue[1]}}</span>
                    <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastDisplayValue[2]}}</span>
                </div>
                <!-- IMAGE -->
                <template v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE}] != undefined">
                    <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE}] != undefined" class="teleplot-js-current-value-image">
                        <img v-bind:src="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE}].lastDisplayValue[1]"/>
                        <div v-if="options.displayTelemetryName" class="teleplot-js-current-value-name">
                            <span>{{telem.name}}</span>
                            <span v-if="telem.unit"> ({{telem.unit}})</span>
                        </div>
                    </div>
                </template>
            </div>
        </div>
    `;
    
    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-current-value-container {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: space-evenly;
                overflow: hidden;
            }

            .teleplot-js-current-value-block {
                position: relative;
                height: 100%;
                display: flex;
                flex-direction: row;
                flex-wrap: wrap;
                justify-content: end;
                align-items: center;
                gap: 5px;
                min-width: 10em;
                flex-grow: 1;
            }


            .teleplot-js-current-value-name, .teleplot-js-current-value-value {
                overflow-wrap: anywhere;
                margin-left: 0.5em;
                margin-right: 0.5em;

            }
            
            .teleplot-js-current-value-color {
                position: absolute;
                left: 0px;
                top: 0px;
                width: 0.3em;
                height: 100%
            }

            .teleplot-js-current-value-name {
                flex-grow: 1;
            }

            .teleplot-js-current-value-value {
            
            }

            .teleplot-js-current-value-value img {
                width: 100%;
            }

            /* IMAGE */
            .teleplot-js-current-value-block:has(.teleplot-js-current-value-image) {
                flex-grow: 1;
                overflow: hidden;
            }
            .teleplot-js-current-value-image {
                height: 100%;
                display: flex;
                justify-content: center;
                align-content: center;
                flex-direction: row;
            }
            .teleplot-js-current-value-image img{
                object-fit: contain;
                max-width: 100%;
                max-height: 100%;
                width: auto;
                height: auto;
            }
            .teleplot-js-current-value-image .teleplot-js-current-value-name {
                position: absolute;
                top: 0.1em;
                left: 0.1em;
                background: #ffffff61;
                backdrop-filter: blur(5px);
                border-radius: 3px;
                box-sizing: border-box;
                padding: 0.1em;
                transition: opacity .1s ease-in-out;
            }
            .teleplot-js-current-value-image img:hover + .teleplot-js-current-value-name {
                opacity: 0;
            }
            
            /* Row mode */
            .teleplot-js-current-value-container.teleplot-js-current-value-row {
                flex-direction: row;
            }
            @scope (.teleplot-js-current-value-row) {
                .teleplot-js-current-value-block {
                    height: unset;
                    gap:unset;
                    text-align: center;
                    justify-content: center;
                }
                .teleplot-js-current-value-color {
                    position: absolute;
                    width: 100%;
                    height: 0.3em
                }
                .teleplot-js-current-value-name, .teleplot-js-current-value-value {
                    margin-left: 0.3em;
                    margin-right: 0.3em;
                    margin-top: 0.3em;
                    flex-grow: 1;
                }
                .teleplot-js-current-value-name {
                    flex-grow: unset;
                }
                .teleplot-js-current-value-value {
                }
                .teleplot-js-current-value-image {
                    flex-grow: 1;
                    justify-content: end;
                    flex-direction: row;
                }
            }
        }
    `;

}

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = ViewCurrentValue.vueCSS;
    document.head.appendChild(elem);
}

TELEPLOT.view.ViewCurrentValue = ViewCurrentValue;