function drawAllWords()
{

    requestAnimationFrame(drawAllWords);

    for (let i = 0; i<worlds.length; i++)
    {
        worlds[i].render();
        //console.log("drawingWorld : "+i)
    }
}

var worlds = [];// todo Remove worlds when closed

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

            this.reDrawShapes(-1);// passing -1 means to redraw everything

            this.setUpSeriesObserver();

            //console.log("init : worlds : "+worlds);
            drawAllWords();
        },
        setUpSeriesObserver()
        {
            this.widget.onNewSerieAdded = () => {
                let newSerie = this.series[this.series.length-1]; 
                this.reDrawShapes(newSerie.id)

                newSerie.onSerieChanged = () => {this.reDrawShapes(newSerie.id)}
            };


            for (let i = 0; i< this.series.length; i++)
            {
               this.series[i].onSerieChanged = () => this.reDrawShapes(this.series[i].id);
            }
            
        },
        reDrawShapes(serieId) // passing -1 means to redraw everything
        {
            let i = 0;
            stop_loop = false;

            while (i < this.series.length && !stop_loop)
            {
                let currSerie = this.series[i];
    
                if (currSerie.id == serieId || serieId == -1)
                {
                    if (currSerie.values[0] != undefined)
                    {
                        this.world.setObject(currSerie.values[0]);
                    }
                    
                    if (serieId != -1)
                        stop_loop = true;
                }    
                i++;
            }
        },
    },
    template:'\
            <div ref="div_3d_container" class ="comp-3d-container">\
            </div>',
});