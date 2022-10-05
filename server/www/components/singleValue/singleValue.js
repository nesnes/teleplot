//var resizingFont = false;// tells whether or nor we have already planned a onContainerResized()

Vue.component('single-value', {
name: 'single-value',
props: {
    widget: {type: Object, required: true},
},
computed: {
    telem() { return this.widget.series[0].name; },
    value1() 
    {
        if (this.widget.containsTextFormat)
            return app.telemetries[this.widget.series[0].name].values[0];
        else
            return this.widget.singlevalue[0]; 
    },
    value2()
    {
        if (this.widget.containsTextFormat || this.widget.singlevalue.length <= 1)
            return undefined;
        else
            return this.widget.singlevalue[1]; 
    },
    unit() { return this.widget.series[0].unit; },
    getWidgetTitle() 
    {
        if (this.widget.containsTextFormat)
            return "";
        else
            return "Click to change precision";
    }

    /*fillColor() { return this.widget.series[0].options.fill; },
    strokeColor() { return this.widget.series[0].options.stroke; }*/
},
methods: {
    onContainerResized()
    {

        if (this.$refs.telem_responsive_text == undefined)
            return;
        
        this.$refs.telem_responsive_text.triggerTextResize();
        this.$refs.value_responsive_text1.triggerTextResize();
        if (this.$refs.value_responsive_text2 != undefined)
            this.$refs.value_responsive_text2.triggerTextResize();
        this.$refs.unit_responsive_text.triggerTextResize();
    }
},
mounted() {
    
    const resizeObserverForSingleValue = new ResizeObserver((entries) => {

        this.onContainerResized();
    });
      
    resizeObserverForSingleValue.observe(this.$refs.single_value_container_ref);

},
updated() {
    /*if (!resizingFont)
    {
        resizingFont = true;

        setTimeout(()=>
        {
            this.onContainerResized();
            resizingFont = false;
        }, 100);
    }*/

    // doing that at every updated() call might be a bit expensive, 
    // but singleValueComponents are way less expensive than plots anyway
    this.onContainerResized();

},
unmounted(){
    resizeObserverForSingleValue.unobserve(singleValueContainer);
},
template:'\
        <div ref="single_value_container_ref" class="single-value-container">\
            <div id="single-value-telem-id" class="single-value-telem-div">\
                <vue-responsive-text ref="telem_responsive_text" v-bind:isTelem="true" >{{telem}}</vue-responsive-text>\
            </div>\
            <div @click="widget.changeValuePrecision()" v-bind:title="getWidgetTitle" class="single-value-value-div">\
                <div class="value1-solo" v-bind:class="{ \'value1-2-duo\': value2!=undefined }">\
                    <vue-responsive-text ref="value_responsive_text1" v-bind:isValue="true">{{value1}}</vue-responsive-text>\
                </div>\
                <div v-if="value2!=undefined" class="value1-2-duo">\
                    <vue-responsive-text ref="value_responsive_text2" v-bind:isValue="true">{{value2}}</vue-responsive-text>\
                </div>\
            </div>\
            <div class="single-value-unit-div">\
                <vue-responsive-text ref="unit_responsive_text" v-bind:isUnit="true" >{{unit}}</vue-responsive-text>\
            </div>\
        </div>',
});

