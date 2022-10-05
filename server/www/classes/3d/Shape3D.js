class Shape3D
{
	constructor ()
	{
		this.shapeName = undefined; //ex : "my_square_0"
		this.shapeType = undefined; // String, ex : "square"
		this.three_object = null;
		this.default_material = new MeshStandardMaterial({color : 'purple'});

		this.position = undefined; // Object containing x, y, and z, its tree coordonates
		this.rotation = undefined; // Object containing x, y, and z, its tree rotations

		this.center = undefined; // Object, ex : {x:0, y:0, z:0};
		this.radius = undefined; // Number, the radius of the sphere
		this.precision = undefined; // Number, the precision of the sphere

		this.height = undefined; // Number, the height of the square
		this.width = undefined; // Number, the width of the square
		this.depth = undefined; // Number, the depth of the square

	}

	initializeFromJson(shapeName, jsonObj)
	{
		this.shapeName = shapeName;
		
		this.position = jsonObj.position;
		this.rotation = jsonObj.rotation;
		this.shapeType = jsonObj.shape;

		this.center = jsonObj.center;
		this.radius = jsonObj.radius;
		this.precision = jsonObj.precision;

		this.width = jsonObj.width;
		this.height = jsonObj.height;	
		this.depth = jsonObj.depth;

		this.buildThreeObject();

		return this;
	}


	buildThreeObject()
	{
		if (this.shapeType == "square")
		{
			
			let objGeometry = new THREE.BoxGeometry( this.width, this.height, this.depth );
			this.three_object = new THREE.Mesh( objGeometry, this.default_material );
		}
		else if (this.shapeType == "sphere")
		{
			let objGeometry = new THREE.SphereGeometry(this.radius, this.precision * 2, this.precision);
			this.three_object = new THREE.Mesh( objGeometry, this.default_material );
		}

		this.three_object.rotation.x = this.rotation.x;
		this.three_object.rotation.y = this.rotation.y;
		this.three_object.rotation.z = this.rotation.z;

		this.three_object.position.x = this.position.x;
		this.three_object.position.y = this.position.y;
		this.three_object.position.z = this.position.z;
	}

}