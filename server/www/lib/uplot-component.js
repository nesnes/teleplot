const stringify = (obj) =>
    JSON.stringify(obj, (key, value) =>
        typeof value === 'function' ? value.toString() : value
    )

const optionsUpdateState = (_lhs, _rhs) => {
    const {width: lhsWidth, height: lhsHeight, ...lhs} = _lhs;
    const {width: rhsWidth, height: rhsHeight, ...rhs} = _rhs;

    let state = 'keep';
    if (lhsHeight !== rhsHeight || lhsWidth !== rhsWidth) {
        state = 'update';
    }
    if (Object.keys(lhs).length !== Object.keys(rhs).length) {
        return 'create';
    }
    for (const k of Object.keys(lhs)) {
        if (stringify(lhs[k]) !== stringify(rhs[k])) {
            state = 'create';
            break;
        }
    }
    return state;
}

const dataMatch = (lhs, rhs) => {
    if (lhs.length !== rhs.length) {
        return false;
    }
    for(let i=0;i<lhs.length;i++){
        if( !(i in rhs) || lhs[i].length != rhs[i].length) return false;
    }
    return lhs.every((lhsOneSeries, seriesIdx) => {
        const rhsOneSeries = rhs[seriesIdx];
        if (lhsOneSeries.length !== rhsOneSeries.length) {
            return false;
        }
        return lhsOneSeries.every((value, valueIdx) => value === rhsOneSeries[valueIdx]);
    });
}

Vue.component('uplot-vue', {
    name: 'uplot-vue',
    props: {
        options: {type: Object, required: true},
        data: {type: Array, required: true},
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
        return {_chart: null, _size: 0};
    },
    watch: {
        options(options, prevOptions) {
            const optionsState = optionsUpdateState(prevOptions, options);
            if (!this._chart || optionsState === 'create') {
                this._destroy();
                this._create();
            } else if (optionsState === 'update') {
                this._chart.setSize({width: options.width, height: options.height});
            }
        },
        target() {
            this._destroy();
            this._create();
        },
        data(data, prevData) {
            if (!this._chart) {
                this._create();
            } else if ((0 in data) && this._size != data[0].length) {
                this._chart.setData(data);
                this._size = data[0].length;
            }
        }
    },
    mounted() {
        this._create();
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
            this._chart = new uPlot(this.$props.options, this.$props.data, this.$props.target || this.$refs.targetRef);
            this.$emit('create', this._chart);
        }
    },
    render(h) {
        return this.$props.target ? null : (Vue.createVNode ? Vue.createVNode : h)('div', {
          ref: 'targetRef'
        });
    }
});