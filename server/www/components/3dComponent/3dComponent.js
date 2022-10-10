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

    mounted() { // TODO, this is not very clean, this.initializeWorld() should not be called this way
        setTimeout(()=>{
            this.initializeWorld();
        }, 100);

    },
    methods: {
        initializeWorld()
        {
            let containerDiv = this.$refs.div_3d_container;
            this.world = new World(containerDiv);
            worlds.push(this.world);
            this.widget.worldId = this.world.id;

            for (let i = 0; i<this.series.length; i++)
            {
                let currSerie = this.series[i];
    
                let myShape = ((new Shape3D).initializeFromShape3D(currSerie.values[0]));
                
                if (myShape != undefined)
                    this.world.setObject(myShape);
            }

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
        reDrawShapes(serieId)
        {
            for (let i = 0; i<this.series.length; i++)
            {
                let currSerie = this.series[i];
    
                if (currSerie.id == serieId)
                {
                    let myShape = ((new Shape3D).initializeFromShape3D(currSerie.values[0]));
    
                    if (myShape != undefined)
                        this.world.setObject(myShape);
                    
                    break;
                }
            }
        },
    },
    template:'\
            <div ref="div_3d_container" class ="comp-3d-container">\
            </div>',
});