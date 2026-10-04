class ViewCurrentValue extends ViewTelemetries{
    constructor(divId, telemetryIdOrNameList, group="default"){
        super(divId, group);
        this.name = "value";
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
                    self: self,
                    telemetries : self.telemetries,
                    options : self.options,
                    layout : self.layout,
                    dragContext: self.dragContext
                }
            },
            methods: {
                onDragEnter: self.onDragEnter,
                onDragLeave: self.onDragLeave,
                onDragDrop: self.onDragDrop
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
            let dataTypes = Object.keys(telem.data);
            this.telemetries[telem.id].imageOnly = dataTypes.length == 1 && dataTypes[0] == ""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE; // The image fills the block, the name is overlaid on it
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
        <div class="teleplot-js-current-value-container teleplot-js-telemetry-card" 
        v-bind:class="{'teleplot-js-current-value-row': options.displayLayoutRow, 'teleplot-js-telemetry-card-drag-over':dragContext.isActive}"
        :style=" { '--layout-width': layout.width, '--layout-height': layout.height }"
        ${ViewTelemetries.dragDropHtml}
        >
            <div v-for="(telem, index) in telemetries" v-bind:key="index" class="teleplot-js-current-value-block"
                v-bind:class="{'teleplot-js-current-value-block-image-only': telem.imageOnly}">
                
                <div v-if="options.displayTelemetryColor && Object.keys(telemetries).length>1" class="teleplot-js-current-value-color" v-bind:style="{'background-color': telem.color}"></div>
                
                <!-- NAME & UNIT -->
                <div v-if="options.displayTelemetryName && !telem.imageOnly" class="teleplot-js-current-value-name" v-bind:title="telem.name">
                    <span>{{telem.name}}</span>
                    <span v-if="telem.unit"> ({{telem.unit}})</span>
                </div>
                    
                <!-- NUMBERS & TEXT (one line per data type) -->
                <div class="teleplot-js-current-value-values">
                    <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT}] != undefined" class="teleplot-js-current-value-value teleplot-js-current-value-text" 
                        v-bind:title="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT}].lastValue[0]">
                        <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT}].lastDisplayValue[0]}}</span>
                    </div>
                    <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER}] != undefined" class="teleplot-js-current-value-value teleplot-js-current-value-number"
                        v-bind:title="''+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER}].lastValue[0]">
                        <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER}].lastDisplayValue[0]}}</span>
                    </div>
                    <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}] != undefined" class="teleplot-js-current-value-value teleplot-js-current-value-number"
                        v-bind:title="''+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}].lastValue[0]+', '+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}].lastValue[1]">
                        <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D}].lastDisplayValue.join(", ")}}</span>
                    </div>
                    <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}] != undefined" class="teleplot-js-current-value-value teleplot-js-current-value-number"
                        v-bind:title="''+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastValue[0]+', '+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastValue[1]+', '+telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastValue[2]">
                        <span>{{telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D}].lastDisplayValue.join(", ")}}</span>
                    </div>
                    <div v-if="!Object.keys(telem.data).length" class="teleplot-js-current-value-value teleplot-js-current-value-empty" title="No data yet">&mdash;</div>
                </div>

                <!-- IMAGE -->
                <div v-if="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE}] != undefined" class="teleplot-js-current-value-image">
                    <img v-bind:src="telem.data[${TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE}].lastDisplayValue[1]"/>
                    <div v-if="telem.imageOnly && options.displayTelemetryName" class="teleplot-js-current-value-name" v-bind:title="telem.name">
                        <span>{{telem.name}}</span>
                        <span v-if="telem.unit"> ({{telem.unit}})</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    /*
     * Layout rules, in order of importance:
     * 1. Values are never clipped: text wraps, numbers don't (they are short). Names come second: at most 2 lines, the full name is in the tooltip.
     * 2. When a view is too small for its content, it scrolls instead of cutting the content.
     * 3. A telemetry with several kinds of data (number + text + image...) shows one line per kind.
     * 4. An image fills the room it is given (the view's, or what the other values leave); the name of an image-only telemetry is overlaid on it.
     */
    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-current-value-container {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: space-evenly;
                overflow-x: hidden; /* Column mode: blocks always fit the width, so a vertical scrollbar must never create a horizontal one */
                overflow-y: auto;
                scrollbar-width: thin;
            }

            .teleplot-js-current-value-block {
                position: relative;
                display: flex;
                flex-direction: row;
                flex-wrap: wrap;
                justify-content: end;
                align-items: center;
                gap: 0 0.5em;
                padding: 0.15em 0.5em 0.15em 0.8em; /* left: room for the color bar */
                box-sizing: border-box;
                flex: 1 0 auto; /* Shares the free height, never shrinks below its content */
            }

            .teleplot-js-current-value-color {
                position: absolute;
                left: 0px;
                top: 0px;
                width: 0.3em;
                height: 100%
            }

            .teleplot-js-current-value-name {
                flex: 1 1 6em;
                min-width: 0;
                overflow: hidden;
                overflow-wrap: anywhere;
                display: -webkit-box;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 2;
                line-clamp: 2;
            }

            .teleplot-js-current-value-values {
                flex: 0 1 auto;
                max-width: 100%;
                display: flex;
                flex-direction: column;
                align-items: end;
                text-align: end;
            }
            .teleplot-js-current-value-value {
                overflow-wrap: anywhere;
                font-variant-numeric: tabular-nums; /* Digits keep their width: live values don't jitter */
            }
            .teleplot-js-current-value-text { /* Long texts (logs...) are cut after a few lines, the tooltip has all of it */
                display: -webkit-box;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 5;
                line-clamp: 5;
                overflow: hidden;
            }
            .teleplot-js-current-value-number { /* "42", "x, y", "x, y, z" must not wrap */
                white-space: nowrap;
            }
            .teleplot-js-current-value-empty {
                opacity: 0.4;
            }

            /* IMAGE: own line below the values, takes all the free room (the image is drawn to fit, whatever its size) */
            .teleplot-js-current-value-image {
                position: relative;
                flex: 1 0 100%;
                align-self: stretch;
                min-height: 5em;
            }
            .teleplot-js-current-value-block:has(.teleplot-js-current-value-image) {
                flex-grow: 4; /* Images are what people look at: they get more of the free height than numbers */
            }
            .teleplot-js-current-value-image img {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                object-fit: contain;
            }
            .teleplot-js-current-value-image .teleplot-js-current-value-name {
                position: absolute;
                top: 0.1em;
                left: 0.1em;
                max-width: calc(100% - 0.2em);
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
            .teleplot-js-current-value-block-image-only {
                padding: 0;
            }
            .teleplot-js-current-value-block-image-only .teleplot-js-current-value-values {
                display: none;
            }
            .teleplot-js-current-value-block-image-only .teleplot-js-current-value-image {
                min-height: 4em;
            }
            
            /* Row mode: one column per telemetry */
            .teleplot-js-current-value-container.teleplot-js-current-value-row {
                flex-direction: row;
                overflow-x: auto; /* Columns have a minimum width: scroll when there are too many */
            }
            @scope (.teleplot-js-current-value-row) {
                .teleplot-js-current-value-block {
                    flex: 1 1 auto; /* Column as wide as its content, shrinks (text wraps) when the view is narrow */
                    min-width: 5em;
                    flex-direction: column;
                    flex-wrap: nowrap;
                    justify-content: safe center; /* "safe": a column taller than the view starts at the top (can be scrolled), instead of being cut on both sides */
                    align-items: center;
                    text-align: center;
                    padding: 0.4em 0.3em 0.15em 0.3em; /* top: room for the color bar */
                }
                .teleplot-js-current-value-color {
                    width: 100%;
                    height: 0.3em
                }
                .teleplot-js-current-value-name {
                    flex: 0 0 auto;
                    max-width: 100%;
                    display: block; /* A narrow column: one line and an ellipsis (tooltip has the full name) rather than a name broken in the middle of a word */
                    white-space: nowrap;
                    text-overflow: ellipsis;
                }
                .teleplot-js-current-value-text {
                    -webkit-line-clamp: 3;
                    line-clamp: 3;
                    overflow-wrap: break-word; /* Wrap between words, break inside a word only if it is longer than the column */
                }
                .teleplot-js-current-value-values {
                    align-items: center;
                    text-align: center;
                }
                .teleplot-js-current-value-image {
                    flex: 1 0 auto;
                    align-self: stretch;
                }
                .teleplot-js-current-value-block:has(.teleplot-js-current-value-image) {
                    flex: 2 1 8em;
                }
                .teleplot-js-current-value-block-image-only {
                    padding: 0;
                    min-width: 0; /* An image has no content width to protect: it shrinks first, so a vertical scrollbar appearing does not push the columns into a horizontal scroll */
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