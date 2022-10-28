Vue.component('uplot-vue', {
    name: 'uplot-vue',
    props: {
        options: {type: Object, required: true},
        data: {type: Array, required: true}, // this is what contains the data ready for uplot
        target: {
            validator(target) {
                return target == null || target instanceof HTMLElement || typeof target === 'function';
            },
            default: undefined,
            required: false
        }
    },
    data() {
        // eslint-disable-next-line
        return {_chart: null, div_: null, width_:0, height_:0};
    },
    watch: {
        options(options, prevOptions) {
            if (!this._chart) {
                this._destroy();
                this._create();
            } else if (this.width_ != options.width || this.height_ != options.height) {
                this._chart.setSize({width: options.width, height: options.height});
            }
            this.width_ = options.width;
            this.height_ = options.height;
        },
        target() {
            this._destroy();
            this._create();
        },
        data(data, prevData) {
            if (!this._chart) {
                this._create();
            } else if ((0 in data)) {
                this._chart.setData(data);
            }
            this._resize();
        }
    },
    mounted() {
        this._create();
        this._resize();
    },
    beforeUnmount() {
        this._destroy();
    },
    beforeDestroy() {
        this._destroy();
    },
    methods: {
        _destroy() {
            if (this._chart) {
                this.$emit('delete', this._chart);
                this._chart.destroy();
                this._chart = null;
            }
        },
        _create() {

            this.div_ = this.$props.target || this.$refs.targetRef;
            this._chart = new uPlot(this.$props.options, this.$props.data, this.div_);
            if(this.$props.options.cursor && "sync" in this.$props.options.cursor) window.cursorSync.sub(this._chart);
            this.width_ = this.$props.options.width;
            this.height_ = this.$props.options.height;
            this.$emit('create', this._chart);
            window.addEventListener("resize", e => { this._resize(); });
            
        },
        _resize() {
            if(!this._chart) return;
            let parentWidth = this.div_.offsetWidth;
            if(parentWidth != this.width_ || this.$props.options.height != this.height_){
                this.width_ = parentWidth;
                this.height_ = this.$props.options.height;
                this._chart.setSize({width: this.width_, height: this.height_});
            }
        }
    },
    render(h) {
        return this.$props.target ? null : (Vue.createVNode ? Vue.createVNode : h)('div', {
          ref: 'targetRef'
        });
    }
});

