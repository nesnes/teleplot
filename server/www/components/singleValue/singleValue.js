Vue.component('single-value', {
name: 'single-value',
props: {
    value: {type: Number, required: true},
    unit: {type: String, required: true},
    telem: {type: String, required: true},
},
methods: {
    onContainerResized()
    {
        console.log("🚀 ~ file: singleValue.js ~ line 10 ~ onContainerResized()")

        this.$refs.telem_responsive_text.triggerTextResize();
        this.$refs.value_responsive_text.triggerTextResize();
        this.$refs.unit_responsive_text.triggerTextResize();
    }
},
template:'<div class="single-value-container">\
            <div class="single-value-telem-div"> <vue-responsive-text ref="telem_responsive_text" >{{telem}}</vue-responsive-text> </div>\
            <div class="single-value-value-div"> <vue-responsive-text ref="value_responsive_text" >{{value}}</vue-responsive-text> </div>\
            <div class="single-value-unit-div"> <vue-responsive-text ref="unit_responsive_text" >{{unit}}</vue-responsive-text> </div>\
            </div>',
});

