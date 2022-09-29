//var resizingFont = false;// tells whether or nor we have already planned a onContainerResized()


Vue.component('single-value', {
name: 'single-value',
props: {
    widget: {type: Object, required: true},
},
computed: {
    telem() { return this.widget.series[0].name; },
    value() 
    {
        if (this.widget.containsTextFormat)
            return app.telemetries[this.widget.series[0].name].textFormatValue;
        else
            return this.widget.singlevalue; 
    },
    unit() { return this.widget.series[0].unit; },
    /*fillColor() { return this.widget.series[0].options.fill; },
    strokeColor() { return this.widget.series[0].options.stroke; }*/
},
methods: {
    onContainerResized()
    {
        if (this.$refs.telem_responsive_text == undefined)
            return;
        
        this.$refs.telem_responsive_text.triggerTextResize();
        this.$refs.value_responsive_text.triggerTextResize();
        this.$refs.unit_responsive_text.triggerTextResize();
    }
},
mounted() {
    
    const resizeObserverForSingleValue = new ResizeObserver((entries) => {
        this.onContainerResized();
    });
      
    resizeObserverForSingleValue.observe(document.getElementById('single-value-container-id'));

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
        <div id="single-value-container-id" class="single-value-container">\
            <div id="single-value-telem-id" class="single-value-telem-div">\
                <vue-responsive-text ref="telem_responsive_text" v-bind:isTelem="true" >{{telem}}</vue-responsive-text>\
            </div>\
            <div @click="widget.changeValuePrecision()" title="Click to change precision" class="single-value-value-div">\
                <vue-responsive-text ref="value_responsive_text" v-bind:isValue="true">{{value}}</vue-responsive-text>\
            </div>\
            <div class="single-value-unit-div">\
                <vue-responsive-text ref="unit_responsive_text" v-bind:isUnit="true" >{{unit}}</vue-responsive-text>\
            </div>\
        </div>',
});

