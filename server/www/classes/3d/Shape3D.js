class Shape3D
{
	constructor ()
	{
		this.name = undefined; //ex : "my_cube_0"
		this.type = undefined; // String, ex : "cube"
		this.three_object = null;
		this.default_material = undefined;
		this.color = undefined;
		this.opacity = undefined;

		this.position = undefined; // Object containing x, y, and z, its three coordonates
		this.rotation = undefined; // Object containing x, y, and z, its three rotations
		this.quaternion = undefined; // Object containing x, y, z and w, its three quaternion coordinates

		this.radius = undefined; // Number, the radius of the sphere
		this.precision = undefined; // Number, the precision of the sphere

		this.height = undefined; // Number, the height of the cube
		this.width = undefined; // Number, the width of the cube
		this.depth = undefined; // Number, the depth of the cube

	}

	initializeFromRawShape(key, rawShape)
	{
		// rawShape is of type String, ex : 
   		// R::3.14:P:1:2:-1:S:cube:W:5:H:4:D:3:C:red

		this.name = key;


		
		function readCurrentProperty (rawShape, i) {
			
			function readPropertyValues (rawShape, i, propertiesCount) {
				i++; // we skip the ':'
				let propertiesValues = [undefined];
				let propCounter = 0;
				while (propCounter < propertiesCount)
				{
					if (i >= rawShape.length || rawShape[i] == ":")
					{
						propCounter ++;

						if (rawShape[i] == ":" && propCounter < propertiesCount)
							propertiesValues.push(undefined);
					}
					else
					{
						if (propertiesValues[propCounter] == undefined)
							propertiesValues[propCounter] = rawShape[i];
						else
							propertiesValues[propCounter] += rawShape[i];
					}

					i++;
				}

				return [propertiesValues, i];
			}
			function getPropertyInfo(currentProperty) {
				switch (currentProperty)
				{
					case "shape":
					case "S":
						return [1, "type"];
					case "opacity":
					case "O":
						return [1, "opacity"];
					case "quaternion":
					case "Q":
						return [4, "quaternion"];
					case "position":
					case "P":
						return [3, "position"];
					case "rotation":
					case "R":
						return [3, "rotation"];
					case "precision":
					case "PR":
						return [1, "precision"];
					case "radius":
					case "RA":
						return [1, "radius"];
					case "color":
					case "C":
						return [1, "color"];
					case "height" : 
					case "H":
						return [1, "height"];
					case "width":
					case "W":
						return [1, "width"];
					case "depth":
					case "D":
						return [1, "depth"];
					default : 
						throw new Error("Invalid shape property : " + currentProperty);
				}
			}
			

			if (rawShape[i] == ":")
				i++;

			let currentProperty = "";

			while (rawShape[i] != ":")
			{
				currentProperty += rawShape[i];
				i++;
			}

			let propertiesCount = 0;
			[propertiesCount, currentProperty] = getPropertyInfo(currentProperty);
			
			[propertyValues, i] = readPropertyValues(rawShape, i, propertiesCount);

			return [i, currentProperty, propertyValues];
		}

		this.position = {};
		this.rotation = {};

		let i = 0;
		let currentProperty = "";
		let propertyValues = [];

		while (i<rawShape.length)
		{
			[i, currentProperty, propertyValues] = readCurrentProperty(rawShape, i);
			
			if (propertyValues.length == 1)
				this[currentProperty] = propertyValues[0];
			else if (propertyValues.length == 3)
			{
				this[currentProperty].x = propertyValues[0]
				this[currentProperty].y = propertyValues[1]
				this[currentProperty].z = propertyValues[2]
			}
			else if (propertyValues.length == 4)
			{
				// currentProperty is quaternion
				this.quaternion = {}; 

				this[currentProperty].x = propertyValues[0]
				this[currentProperty].y = propertyValues[1]
				this[currentProperty].z = propertyValues[2]
				this[currentProperty].w = propertyValues[3]
			}
		}


		return this;
	}

	initializeFromShape3D(shape3D)
	{
		this.name = shape3D.name;

		this.opacity = shape3D.opacity;
		this.position = shape3D.position;
		this.rotation = shape3D.rotation;
		this.type = shape3D.type;
		this.quaternion = shape3D.quaternion;

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
		else
		{
			throw new Error("Unsupported geometry type: " + this.type);
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

	fillUndefinedWithDefaults()
	{
		this.fillUndefinedWith(defaultShape);
	}

	fillUndefinedWith(fillingShape)
	{
		if (this.type == undefined)
			this.type = fillingShape.type;
			
		if (this.color == undefined)
			this.color = fillingShape.color;

		if (this.opacity == undefined)
			this.opacity = fillingShape.opacity;

		if (this.type == "cube")
		{
			if (this.height == undefined)
				this.height = fillingShape.height;
			if (this.width == undefined)
				this.width = fillingShape.width;
			if (this.depth == undefined)
				this.depth = fillingShape.depth;
		}
		else if (this.type == "sphere")
		{
			if (this.radius == undefined)
				this.radius = fillingShape.radius;
			if (this.precision == undefined)
				this.precision = fillingShape.precision;
		}
		
		
		if (this.position == undefined)
			this.position = fillingShape.position;
		else
		{
			if (this.position.x == undefined)
				this.position.x = fillingShape.position.x;
			if (this.position.y == undefined)
				this.position.y = fillingShape.position.y;
			if (this.position.z == undefined)
				this.position.z = fillingShape.position.z;
		}
		

		if (this.rotation == undefined)
			this.rotation = fillingShape.rotation;
		else
		{
			if (this.rotation.x == undefined)
				this.rotation.x = fillingShape.rotation.x;
			if (this.rotation.y == undefined)
				this.rotation.y = fillingShape.rotation.y;
			if (this.rotation.z == undefined)
				this.rotation.z = fillingShape.rotation.z;
		}
		

		if (this.quaternion == undefined)
			this.quaternion = fillingShape.quaternion;
		else
		{
			if (this.quaternion.x == undefined)
				this.quaternion.x = fillingShape.quaternion.x;
			if (this.quaternion.y == undefined)
				this.quaternion.y = fillingShape.quaternion.y;
			if (this.quaternion.z == undefined)
				this.quaternion.z = fillingShape.quaternion.z;
			if (this.quaternion.w == undefined)
				this.quaternion.w = fillingShape.quaternion.z;
		}		
	}

}


function buildThreeObject(shape3D) 
{
	if (shape3D.three_object != null) // obj is already built
		return

	shape3D.default_material = new MeshStandardMaterial({color : shape3D.color, depthWrite: (shape3D.opacity==1)});

	shape3D.three_object = shape3D.buildMesh();
	
	shape3D.three_object.material.opacity = shape3D.opacity;
	shape3D.three_object.material.transparent = true;

	shape3D.three_object.position.x = shape3D.position.x;
	shape3D.three_object.position.z = shape3D.position.y;
	shape3D.three_object.position.y = shape3D.position.z;

	if (shape3D.quaternion == undefined) {
		shape3D.three_object.rotation.x = shape3D.rotation.x;
		shape3D.three_object.rotation.y = shape3D.rotation.z;
		shape3D.three_object.rotation.z = shape3D.rotation.y;
	}
	else
		buildMeshFromQuaternion(shape3D.three_object, shape3D);

}


function buildMeshFromQuaternion(three_obj, shape3D)
{
	if (shape3D.quaternion == undefined)
		throw new Error("quaternion shouldn't be undefined");
	

	let currQuaternion = new THREE.Quaternion(shape3D.quaternion.x, shape3D.quaternion.y, shape3D.quaternion.z, shape3D.quaternion.w);
	currQuaternion.normalize();
	three_obj.setRotationFromQuaternion(currQuaternion);
	
}

const defaultShape = {
	color : "purple",
	opacity : 1,
	height : 5,
	width : 5,
	depth : 5,
	radius : 2,
	precision : 15,
	position : {x:0, y:0, z:0},
	rotation : {x:0, y:0, z:0},
	quaternion : undefined,
}