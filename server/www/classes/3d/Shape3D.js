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

	isSame(shape2)
	{
		if (shape2.shapeName!= this.shapeName || shape2.shapeType != this.shapeType)
			return false;
		
		let areSameRotAndPos = JSON.stringify(this.position) == JSON.stringify(shape2.position) && JSON.stringify(this.rotation) == JSON.stringify(shape2.rotation);
		
		if (this.shapeType == "square")
			return areSameRotAndPos && this.height == shape2.height && this.width == shape2.width && this.depth == shape2.depth;
		else if (this.shapeType == "sphere")
			return areSameRotAndPos && this.center == shape2.center && this.radius == shape2.radius && this.precision == shape2.precision;
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

	initializeFromShape3D(shape3D)
	{
		this.shapeName = shape3D.name;

		this.position = shape3D.position;
		this.rotation = shape3D.rotation;
		this.shapeType = shape3D.shape;

		this.center = shape3D.center;
		this.radius = shape3D.radius;
		this.precision = shape3D.precision;

		this.width = shape3D.width;
		this.height = shape3D.height;	
		this.depth = shape3D.depth;

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