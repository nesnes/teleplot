Vue.component('single-value', {
name: 'single-value',
props: {
    widget: {type: Object, required: true},
},
computed: {
    telem() { return this.widget.series[0].name; },
    value() { return this.widget.singlevalue; },
    unit() { return this.widget.series[0].unit; },
    fillColor() { return this.widget.series[0].options.fill; },
    strokeColor() { return this.widget.series[0].options.stroke; }
},
methods: {
    onContainerResized()
    {
        if (this.$refs.telem_responsive_text == undefined)
            return;
        //console.log("trigger 3 text resize");
        
        this.$refs.telem_responsive_text.triggerTextResize();
        this.$refs.value_responsive_text.triggerTextResize();
        this.$refs.unit_responsive_text.triggerTextResize();
    }
},
mounted() {
    var singleValueContainer = document.getElementById('single-value-container-id');
    
    const resizeObserverForSingleValue = new ResizeObserver((entries) => {
        //console.log('Size changed');
        this.onContainerResized();
    });
      
    resizeObserverForSingleValue.observe(singleValueContainer);


},
updated() {
    // TODO:, this is a bit overkilling as updated() is called very often and the resizeObserver is already triggered in most cases, 
    // this might be optimizable
    this.onContainerResized();
},
unmounted(){
    resizeObserverForSingleValue.unobserve(singleValueContainer);
},
template:'<div id="single-value-container-id" class="single-value-container">\
            <div id="single-value-telem-id" class="single-value-telem-div"> <vue-responsive-text ref="telem_responsive_text" v-bind:isTelem="true" >{{telem}}</vue-responsive-text> </div>\
            <div @click="widget.changeValuePrecision()" class="single-value-value-div"> <vue-responsive-text ref="value_responsive_text" v-bind:isValue="true">{{value}}</vue-responsive-text> </div>\
            <div class="single-value-unit-div"> <vue-responsive-text ref="unit_responsive_text" v-bind:isUnit="true" >{{unit}}</vue-responsive-text> </div>\
            </div>',
});

