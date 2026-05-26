Vue.component('teleplot-jpg', {
name: 'teleplot-jpg',
props: {
    widget: {type: Object, required: true},
},
computed: {
    telem() { return this.widget.series[0].name; },
    source() { return "data:image/jpeg;base64," + this.widget.image; }

},
methods: {
},
mounted() {
    console.log(this.widget)
},
updated() {},
unmounted(){},
template:`
        <div class="teleplot-jpg-container">
            <img v-bind:src="source"/>
        </div>`,
});

