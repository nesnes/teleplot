Vue.component('comp-3d', {
    name: 'comp-3d',
    props: {
        series: {type: Array, required: true},
        widget: {type: Object, required: true},
    },
    data() {
        return { world : undefined};
    },

    mounted() {
        this.initializeWorld();
    },
    methods: {
        initializeWorld()
        {
            let containerDiv = this.$refs.div_3d_container;
            this.world = new World(containerDiv);
            worlds.push(this.world);
            this.widget.worldId = this.world.id;

            this.reDrawShape(-1);// passing -1 means to redraw everything

            this.setUpSeriesObserver();

            // if worlds.length == 1, then we are in the first 3dComponent, so we launch the drawAllWorlds function, but we just need to launch this function once for
            // all worlds
            if (worlds.length == 1) drawAllWords();
        },
        setUpSeriesObserver()
        {
            this.widget.onNewSerieAdded = () => {
                let newSerieIdx = this.series.length-1;
                let newSerie = this.series[newSerieIdx]; 
                this.reDrawShape(newSerieIdx);

                newSerie.onSerieChanged = () => {this.reDrawShape(newSerieIdx)}
            };


            for (let i = 0; i< this.series.length; i++)
            {
               this.series[i].onSerieChanged = () => this.reDrawShape(i);
            }
            
        },
        reDrawShape(serieId) // -1 means redraw everything, otherwise we pass the serie shape index in this.series
        {
            if (serieId == -1)
            {
                for (let i = 0; i < this.series.length; i++)
                {
                    let currSerie = this.series[i];

                    if (currSerie.values[0] != undefined)
                    {
                        this.world.setObject(i, currSerie.values[0]);
                    }
                }
            }
            else
            {
                let currSerie = this.series[serieId];

                if (currSerie == undefined)
                    throw new Error("trying to acces an index that is invalid : i = " + i);

                if (currSerie.values[0] != undefined)
                {
                    this.world.setObject(serieId, currSerie.values[0]);
                }
            }
        },
    },
    template:'\
            <div ref="div_3d_container" class ="comp-3d-container">\
            </div>',
});