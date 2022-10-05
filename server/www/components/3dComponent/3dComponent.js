function drawAllWords()
{
    requestAnimationFrame(drawAllWords);

    for (let i = 0; i<worlds.length; i++)
    {
        worlds[i].render();
        console.log("drawingWorld : "+i)
    }
}

var worlds = [];// todo Remove worlds when closed

Vue.component('comp-3d', {
    name: 'comp-3d',
    props: {
        series: {type: Array, required: true},
    },
    data() {
        return {isWorldInitialized : false, world : undefined};
    },
    watch : {
        series: {
            handler(val, val2){
                if (!this.isWorldInitialized)
                {
                    this.isWorldInitialized  = true;
                    //console.log("init")
                    this.initializeWorld();

                    // setTimeout(() => {
                    //     this.reDrawShapes();
                    // }, 1000);
                }
                if (val != val2)
                {
                    this.reDrawShapes();
                }
            },
            deep: true
         }

    },
    methods: {
        initializeWorld()
        {
            let containerDiv = this.$refs.div_3d_container;
            this.world = new World(containerDiv);
            worlds.push(this.world);

            for (let i = 0; i<this.series.length; i++)
            {
                let currSerie = this.series[i];
    
                let myShape = currSerie.values[0];
    
                if (myShape != undefined)
                    this.world.setObject(myShape);
            }

            console.log("init : worlds : "+worlds);
            drawAllWords();
        },

        reDrawShapes()
        {
            //console.log("redraw");

            for (let i = 0; i<this.series.length; i++)
            {
                let currSerie = this.series[i];
    
                let myShape = currSerie.values[0];
    
                if (myShape != undefined)
                    this.world.setObject(myShape);
            }
    
        },
    },
    template:'\
            <div ref="div_3d_container" class ="comp-3d-container">\
            </div>',
});