
// function animateWorld()
// {
// 	requestAnimationFrame(animateWorld);
// 	world.render();
// }
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

		// let grid = new THREE.InfiniteGridHelper(10, 100);

		const size = 500;
		const divisions = size;
		const colorCenterLine = new Color('#999999');
		const colorGrid = new Color('#cccccc');

		const gridHelper = new THREE.GridHelper( size, divisions, colorCenterLine, colorGrid );
		scene.add( gridHelper );
	}

	initializeLight(scene)
	{
		// without DirectionalLight the scene doesn't look 3D, but this should be fixed using appropriate textures.
		
		/*let light = new DirectionalLight('white', 8);
		light.position.set(10, 10, 10);*/

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
			console.log("error updateToNewShape()")
			return;
		}


		if (new_shape.type == "cube")// in this case we can just rescale it
		{
			myMesh.scale.set( new_shape.width, new_shape.height, new_shape.depth);
		}
		else if (new_shape.type == "sphere")
		{
			myMesh.scale.set(new_shape.radius, new_shape.radius, new_shape.radius);
		}
		/*else // here we rebuild the geometry
		{
			myMesh.geometry = new_shape.getGeometry();
		}*/

		myMesh.rotation.x = new_shape.rotation.x;
		myMesh.rotation.y = new_shape.rotation.y;
		myMesh.rotation.z = new_shape.rotation.z;

		myMesh.position = new_shape.position;

	
	}

	setObject(shape3d)
	{

		let found = false;
		let i = 0;

		while (i < this._3Dshapes.length && !found)
		{
			if (this._3Dshapes[i].name === shape3d.name)
			{
				this.updateToNewShape(this._3Dshapes[i], shape3d);

				found = true;
			}

			i++;
		}

		if (!found)
		{
			this._3Dshapes.push(shape3d);

			shape3d.buildThreeObject();
			this.scene.add(shape3d.three_object);
		}

		
	}
	
	render()
	{
		this.renderer.render( this.scene, this.camera );
	}
}