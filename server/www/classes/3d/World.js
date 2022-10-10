
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
		this.camera = this.initializeCamera();
		this.renderer = this.initializeRenderer();
		this.resize_obs = this.initializeResizeObserver(this);
		this.orbit_controls = this.initializeOrbitControls(this.camera, this.renderer);
		this._3Dshapes = [];

		this.containerDiv.appendChild( this.renderer.domElement );
    }

	initializeScene()
	{
		let scene = new THREE.Scene();
		scene.background = new Color('#ecf0f1');// the color of an empty white screen ( not true white )

		return scene;
	}

	initializeLight(scene)
	{
		let light = new DirectionalLight('white', 8);
		light.position.set(10, 10, 10);

		let light2 = new DirectionalLight('white', 4);
		light2.position.set(-10, -10, -10);

		scene.add(light);
		scene.add(light2);

	}

	initializeCamera()
	{
		let camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
		camera.far = 1000;
		camera.near = 0.1;
		camera.position.z = 15;
		camera.position.y = 1.5;
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

	
	setObject(shape3d)
	{

		let found = false;
		let i = 0;

		while (i < this._3Dshapes.length && !found)
		{
			if (this._3Dshapes[i].shapeName === shape3d.shapeName)
			{
				this.scene.remove(this._3Dshapes[i].three_object);
				this._3Dshapes[i] = shape3d;

				found = true;
			}

			i++;
		}

		if (!found)
		{
			this._3Dshapes.push(shape3d);
		}

		shape3d.buildThreeObject();
		this.scene.add(shape3d.three_object);

	}
	
	render()
	{
		this.renderer.render( this.scene, this.camera );
	}
}