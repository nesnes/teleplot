TELEPLOT.protocol = {
    BINARY_MARKER: 0x10,
    BINARY_VERSION: 1,
    CLIENT_ID_NAMED: 0xFFFF, // Client id of telemetries that are identified by their name (as in the text protocol), not by a client and an id: their name attribute comes first
    FILE_MAGIC: [0x54, 0x50, 0x4C, 0x54, 0x0A, 0x01, 0x00, 0x00], // First bytes of a binary data file: "TPLT", a line feed, the file version, two reserved bytes. Then packets, each after its length (uint32)
    TELEM_ATTR_NAME: 0,
    TELEM_ATTR_UNIT: 1,
    TELEM_ATTR_COLOR: 2,
    TELEM_ATTR_AUTOPLOT: 3,
    TELEM_ATTR_DATA_TIMEOUT: 4,
    TELEM_ATTR_SHAPE: 5,
    TELEM_ATTR_VIEW_LABEL: 6, // Telemetries with the same label are displayed in the same view when nobody arranged them ("name,label" in text)
    TELEM_ATTR_LOG: 7,        // A text telemetry is emitted as a log (lines to read one after the other: "log" flag in text) and not as a state (the default: its latest value matters, "t" flag). It only decides the view it gets by default.
    TELEM_ATTR_FRAME: 8,      // What the positions of a shape are relative to: {type, name}. FRAME_TYPE_POSE: the pose of the telemetry of that name (a shape, a camera, a point...); FRAME_TYPE_PIXELS: the pixels of the pictures of the image telemetry of that name
    TELEM_ATTR_RANGE: 9,      // The values a number telemetry is expected between: {min, max} (either can be undefined). Views use it as an extent (the bar of a value, the scale of a chart); it changes nothing to the data
    TELEM_ATTR_STACK: 10,     // A text telemetry is a stack: its text is the path of what is running, a "/" between levels ("loop/plan/search": "stack" flag in text). A state like any other; a timeline draws a row per level
    // Commands (telecmd, doc/telecmd.md): what the page may write, or call
    TELEM_ATTR_WRITE: 11,     // {kind: "setting" | "action", type ("" = the type of the data, "number", "bool", "text", "xy", "xyz", "pose2d"), step, rate, hold, axes, confirm, longpress}
    TELEM_ATTR_CHOICES: 12,   // The texts a setting can take: ["idle", "auto"...]
    TELEM_ATTR_ARGS: 13,      // The arguments of an action, in order: [{name, type, optional, default, min, max, step, unit, choices, desc}]
    TELEM_ATTR_DESC: 14,      // A short description (a tooltip)
    TELEM_ATTR_TITLE: 15,     // The text of the button of an action (default: its name)
    TELEM_ATTR_PIXELS: 16,    // How the pixels of pictures of values (depth maps: 16-bit gray PNG, plain buffers) are read: {scale (value of a pixel = its number x scale, 1 by default), invalid (number of a pixel without measure, 0 by default; null: none), depth (false: not distances along the camera axis; true by default)}
    TELEM_ATTR_SHAPE_TYPE_CUBE: 0,
    TELEM_ATTR_SHAPE_TYPE_SPHERE: 1,
    TELEM_ATTR_SHAPE_TYPE_CYLINDER: 2,
    TELEM_ATTR_SHAPE_TYPE_RECT: 3,    // Flat shapes (2D): a rectangle and a disc in the xy plane of the shape,
    TELEM_ATTR_SHAPE_TYPE_CIRCLE: 4,
    TELEM_ATTR_SHAPE_TYPE_LINE: 5,    // a line through points (the points are point cloud samples: TELEM_DATA_POINT_CLOUD),
    TELEM_ATTR_SHAPE_TYPE_POLYGON: 6, // the surface inside such points,
    TELEM_ATTR_SHAPE_TYPE_ARROW: 7,   // an arrow from the position along a vector (TELEM_DATA_SHAPE_VECTOR),
    TELEM_ATTR_SHAPE_TYPE_TEXT: 8,    // a text at the position (TELEM_DATA_SHAPE_TEXT)
    TELEM_ATTR_SHAPE_TYPE_STL: 10,
    FRAME_TYPE_POSE: 0,
    FRAME_TYPE_PIXELS: 1,
    SECTION_TYPE_RESERVED: 0,
    SECTION_TYPE_CLIENT_NAME: 1,
    SECTION_TYPE_DASHBOARD: 2, // Dashboard lines, as in the text protocol ("DASH|Robot/Motion:chart:speed"), one or several separated by line feeds
    SECTION_TYPE_TELEM_ATTR: 10,
    SECTION_TYPE_TELEM_DATA_NUMBER: 20,
    SECTION_TYPE_TELEM_DATA_NUMBER_2D: 21,
    SECTION_TYPE_TELEM_DATA_NUMBER_3D: 22,
    SECTION_TYPE_TELEM_DATA_TEXT: 23,
    SECTION_TYPE_TELEM_DATA_IMAGE: 24,
    SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION: 25,
    SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION: 26,
    SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION: 27,
    SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR: 28,
    SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB: 29,
    SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY: 30,
    SECTION_TYPE_TELEM_DATA_SHAPE_SIZE: 31,
    SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE: 32,
    SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS: 33,
    SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION: 34,
    SECTION_TYPE_TELEM_DATA_POINT_CLOUD: 35,
    SECTION_TYPE_TELEM_DATA_FLOAT64: 36,
    SECTION_TYPE_TELEM_DATA_SHAPE_VECTOR: 37,     // x, y, z: the vector of an arrow
    SECTION_TYPE_TELEM_DATA_SHAPE_TEXT: 38,       // The text of a text shape
    SECTION_TYPE_TELEM_DATA_SHAPE_LINE_WIDTH: 39, // Width of the lines of a shape, in the units of its frame (never sent: as thin as the screen draws) // Samples of a data type made of numbers, each number as a float64: for values that the float32 (or integer) section of the data type would round
    SECTION_TYPE_TELEM_DATA_THRESHOLD: 40,        // A limit of a number telemetry, from its timestamp on: operator, value, name, color. A limit of the same name replaces it; a value that is not a number removes it
    SECTION_TYPE_CALL: 41,         // Page to device: a call of an action, {TELEM_ID[16]} {CALL_ID[16]} {COUNT[8]} then {INDEX[8]} {VALUE} per argument
    SECTION_TYPE_CALL_ANSWER: 42,  // Device to page: {TELEM_ID[16]} {CALL_ID[16]} {STATUS[8]} {TEXT}: a call ran, runs or failed (CALL_ID_SETTING: a setting was refused)
    CALL_STATUS_OK: 0,
    CALL_STATUS_ERROR: 1,
    CALL_STATUS_RUNNING: 2,
    CALL_ID_SETTING: 0xFFFF,
    WRITE_TYPES: ["", "number", "bool", "text", "xy", "xyz", "pose2d"], // Codes of the types of what can be written (binary: the index)
    WRITE_AXES: ["x", "y", "yaw"], // Bits of the axes of an xy or pose2d (binary: bit i = WRITE_AXES[i])
    THRESHOLD_BELOW: 0, // Operators of a threshold: the telemetry is past it when its value is below ("<" in text)
    THRESHOLD_ABOVE: 1, //                           or above (">")
    POINT_CLOUD_INTENSITY: 1, // Flags of a point cloud: each point has an intensity (float32)
    POINT_CLOUD_RGB: 2,       //                          each point has a color (r, g, b bytes)
    IMAGE_TYPE_JPEG: 0,
    IMAGE_TYPE_PNG: 1,
    IMAGE_TYPE_RAW: 2,        // Plain pixels: {WIDTH[16]} {HEIGHT[16]} {FORMAT[8]} {3 reserved bytes} then the pixels, row after row, little-endian
    RAW_FORMAT_GRAY16: 0,     // uint16 per pixel (a depth map in mm...)
    RAW_FORMAT_FLOAT32: 1,    // float32 per pixel (a depth map in m...)
    RAW_FORMATS: ["gray16", "float32"], // Names of the formats (binary: the index)
    TEXTURE_TYPE_NONE: 0,
    TEXTURE_TYPE_URL: 1,
    TEXTURE_TYPE_IMAGE: 2
};

// Data types that describe a 3D shape (a telemetry with any of them, or with the TELEM_ATTR_SHAPE attribute, is a shape)
TELEPLOT.protocol.SHAPE_DATA_TYPES = [
    TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION,
    TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION,
    TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION,
    TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR,
    TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB,
    TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY,
    TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE,
    TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE,
    TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_VECTOR,
    TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_TEXT,
    TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_LINE_WIDTH
];
// Shape types that are flat: what a telemetry of these types is drawn in by default is a 2D view
TELEPLOT.protocol.FLAT_SHAPE_TYPES = [3, 4, 5, 6, 7, 8];

TELEPLOT.protocol.getSectionTypeTelemDataDataCount = function(sectionType) {
    switch(sectionType) {
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER:
            return 1;
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_2D:
            return 2; // x, y
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D:
            return 3; // x, y, z
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT:
            return 1;
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE:
            return 2; // type, imageBuffer
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION:
            return 3; // x, y, z
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION:
            return 3; // r, p, y
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION:
            return 4; //w, x, y, z
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR:
            return 1;
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB:
            return 3; // r, g, b
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY:
            return 1;
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE:
            return 3; // x, y, z
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE:
            return 2; // type, value
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS:
            return 6; // width, height, fx, fy, cx, cy
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION:
            return 5; // k1, k2, p1, p2, k3
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_POINT_CLOUD:
            return 3; // A sample is a whole cloud: positions (Float32Array x, y, z...), intensities (Float32Array or null), colors (Uint8Array r, g, b... or null)
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_VECTOR:
            return 3; // x, y, z
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_TEXT:
            return 1;
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_LINE_WIDTH:
            return 1;
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_THRESHOLD:
            return 4; // operator, value, name, color ("" when none)
        case TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_FLOAT64:
            return 0; // Not a data type: a way to write the others
    }
    console.error(Error(`Unknown section type: ${sectionType}`));
    return -1;
};