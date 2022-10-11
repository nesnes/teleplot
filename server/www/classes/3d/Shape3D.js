class Shape3D
{
	constructor ()
	{
		this.name = undefined; //ex : "my_cube_0"
		this.type = undefined; // String, ex : "cube"
		this.three_object = null;
		this.default_material = undefined;
		this.color = "purple";

		this.position = {x:0, y:0, z:0}; // Object containing x, y, and z, its three coordonates
		this.rotation = {x:0, y:0, z:0}; // Object containing x, y, and z, its three rotations

		this.radius = 2; // Number, the radius of the sphere
		this.precision = 15; // Number, the precision of the sphere

		this.height = 5; // Number, the height of the cube
		this.width = 5; // Number, the width of the cube
		this.depth = 5; // Number, the depth of the cube

	}

	isSame(shape2)
	{
		if (shape2.name!= this.name || shape2.type != this.type)
			return false;
		
		let areSameRotAndPos = JSON.stringify(this.position) == JSON.stringify(shape2.position) && JSON.stringify(this.rotation) == JSON.stringify(shape2.rotation);
		
		if (this.type == "cube")
			return areSameRotAndPos && this.height == shape2.height && this.width == shape2.width && this.depth == shape2.depth;
		else if (this.type == "sphere")
			return areSameRotAndPos && this.radius == shape2.radius && this.precision == shape2.precision;
	}
	initializeFromJson(name, jsonObj)
	{
		if (name!= undefined)
			this.name = name;
		else
			throw new Error("no name specified for shape");

		if (jsonObj.shape!= undefined)
			this.type = jsonObj.shape;
		else
			throw new Error("no type specified for shape");


		if (jsonObj.color!= undefined)
			this.color = jsonObj.color;

		if (jsonObj.position != undefined)
			this.position = jsonObj.position;
		
		if (jsonObj.rotation!= undefined)
			this.rotation = jsonObj.rotation;

		if (jsonObj.radius!= undefined)	
			this.radius = jsonObj.radius;

		if (jsonObj.precision!= undefined)	
			this.precision = jsonObj.precision;

		if (jsonObj.width!= undefined)
			this.width = jsonObj.width;

		if (jsonObj.height!= undefined)
			this.height = jsonObj.height;	

		if (jsonObj.depth!= undefined)	
			this.depth = jsonObj.depth;

		return this;
	}

	initializeFromShape3D(shape3D)
	{
		this.name = shape3D.name;

		this.position = shape3D.position;
		this.rotation = shape3D.rotation;
		this.type = shape3D.type;

		this.radius = shape3D.radius;
		this.precision = shape3D.precision;

		this.width = shape3D.width;
		this.height = shape3D.height;	
		this.depth = shape3D.depth;

		this.color = shape3D.color;
		// this.default_material = new MeshStandardMaterial({color : this.color});
		
		// this.buildThreeObject();

		return this;

	}

	getGeometry() {


		if (this.type == "cube")
		{
			return new THREE.BoxGeometry( 1, 1, 1 );
			// we create a cube of size 1,1,1 and then we rescale it according to its actual dimensions.
			// we do this so it resizes quicker
		}
		else if (this.type == "sphere")
		{
			return new THREE.SphereGeometry(1, this.precision * 2, this.precision);
			// we set the radius of 1 and then we rescale it according to its actual dimensions.
			// we do this so it resizes quicker
		}
	}

	buildMesh()
	{
		let my_mesh = new THREE.Mesh(this.getGeometry(), this.default_material );

		if (this.type == "cube")
			my_mesh.scale.set(this.width, this.height, this.depth);
		else if (this.type == "sphere")
			my_mesh.scale.set(this.radius, this.radius, this.radius);

		return my_mesh;
	}

	buildThreeObject()
	{
		if (this.three_object != null) // obj is already built
			return

		this.default_material = new MeshStandardMaterial({color : this.color});
		// let texture = new THREE.TextureLoader().load("./images/metal-texture.png");
		// this.default_material = new THREE.MeshBasicMaterial( {map: texture} );

	
		this.three_object = this.buildMesh();
		

		this.three_object.rotation.x = this.rotation.x;
		this.three_object.rotation.y = this.rotation.y;
		this.three_object.rotation.z = this.rotation.z;

		this.three_object.position.x = this.position.x;
		this.three_object.position.y = this.position.y;
		this.three_object.position.z = this.position.z;
	}

}