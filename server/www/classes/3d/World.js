function drawAllWords()
{
    if (worlds.length > 0 ) // otherwise we want rendering to stop
		requestAnimationFrame(drawAllWords);

    for (let i = 0; i<worlds.length; i++)
    {
        worlds[i].render();
    }
}
 
var worlds = [];


var worldCount = 0
class World {
	constructor(div3D){
		this.id = worldCount++;
        this.containerDiv = div3D;
		this.scene = this.initializeScene();
		this.initializeLight(this.scene);
		this.initializeGrid(this.scene);
		this.initializeFog(this.scene);
		this.camera = this.initializeCamera();
		this.renderer = this.initializeRenderer();
		this.resize_obs = this.initializeResizeObserver(this);
		this.orbit_controls = this.initializeOrbitControls(this.camera, this.renderer);
		this._3Dshapes = [];

		this.containerDiv.appendChild( this.renderer.domElement );
    }

	initializeFog(scene)
	{
		let near = 10;
		let far = 200;
		let color = scene.background;
		scene.fog = new THREE.Fog(color, near, far);
	}

	initializeScene()
	{
		let scene = new THREE.Scene();
		scene.background = new Color('#ecf0f1');// the color of an empty white screen ( not true white )
		return scene;
	}

	initializeGrid(scene)
	{

		const size = 500;
		const divisions = size;
		const yAxisColor = new Color(GreenYAxis);
		const gridColor = new Color(GridHeplerColor);
		const xAxisColor = new Color(RedXAxis);

		const gridHelper = new THREE.GridHelper( size, divisions, xAxisColor, gridColor, yAxisColor);
		scene.add( gridHelper );
	}

	initializeLight(scene)
	{
		let ambientLight = new AmbientLight('white', 1);
		let hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 3 );

		scene.add(hemiLight);
		scene.add(ambientLight);
	}

	initializeCamera()
	{
		let camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
		camera.far = 1000;
		camera.near = 0.1;
		camera.position.z = 15;
		camera.position.y = 1.5;
		camera.position.x = 0;
		return camera;
	}

	initializeRenderer()
	{
		let renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.physicallyCorrectLights = true;

		return renderer;
	}

	initializeResizeObserver(world)
	{
		return new ResizeObserver((entries) => world.setRendererSize(entries[0].contentRect)).observe(this.containerDiv);
	}

	initializeOrbitControls(camera, renderer)
	{
		return new OrbitControls( camera, renderer.domElement );
	}

	destructor() {
		if (this.resize_obs != undefined)
			this.resize_obs.unobserve(this.containerDiv);
	}

	setRendererSize(container)
	{
		this.camera.aspect = container.width / container.height;
		this.camera.updateProjectionMatrix();
	
		this.renderer.setSize(container.width, container.height);
		this.renderer.setPixelRatio(window.devicePixelRatio);
	}

	updateToNewShape(old_shape, new_shape)
	{
		let myMesh = old_shape.three_object;
		if ( myMesh == null)
		{
			throw new Error("error myMesh shouldn't be null");
		}


		if (new_shape.type == "cube")// in this case we can just rescale it
		{
			myMesh.scale.set( new_shape.width, new_shape.height, new_shape.depth);
		}
		else if (new_shape.type == "sphere")
		{
			myMesh.scale.set(new_shape.radius, new_shape.radius, new_shape.radius);
		}

		if (myMesh.position != undefined && new_shape.position != undefined)
		{
			myMesh.position.y = new_shape.position.z;
			myMesh.position.z = new_shape.position.y;
			myMesh.position.x = new_shape.position.x;
		}

		if (new_shape.quaternion == undefined)
		{
			myMesh.rotation.x = new_shape.rotation.x;
			myMesh.rotation.y = new_shape.rotation.z;
			myMesh.rotation.z = new_shape.rotation.y;
		}
		else
			buildMeshFromQuaternion(myMesh, new_shape);

	
	}

 	// shapeId is the idx of the shape in this._3Dshapes or the idx at which it should be if it is the first time
	// shape3d is the new shape (either a totaly new one or an update of a previous one)
	setObject(shapeId, shape3d)
	{

		if (shapeId < this._3Dshapes.length)
		{
			this.updateToNewShape(this._3Dshapes[shapeId], shape3d);
		}
		else
		{
			let shape_cp = (new Shape3D()).initializeFromShape3D(shape3d);

			buildThreeObject(shape_cp);
			this._3Dshapes.push(shape_cp);

			// as we can't share the same mesh between multiple scenes, we are making 
			// a copy of it just before adding it to the scene, otherwise their might be two scenes trying to use the same mesh
			this.scene.add(shape_cp.three_object);
		}
		
	}
	
	render()
	{
		this.renderer.render(this.scene, this.camera);
	}
}