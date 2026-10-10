TELEPLOT.protocol = {
    BINARY_MARKER: 0x10,
    BINARY_VERSION: 1,
    TELEM_ATTR_NAME: 0,
    TELEM_ATTR_UNIT: 1,
    TELEM_ATTR_COLOR: 2,
    TELEM_ATTR_AUTOPLOT: 3,
    TELEM_ATTR_DATA_TIMEOUT: 4,
    TELEM_ATTR_SHAPE: 5,
    TELEM_ATTR_VIEW_LABEL: 6, // Telemetries with the same label are displayed in the same view when nobody arranged them ("name,label" in text)
    TELEM_ATTR_SHAPE_TYPE_CUBE: 0,
    TELEM_ATTR_SHAPE_TYPE_SPHERE: 1,
    TELEM_ATTR_SHAPE_TYPE_CYLINDER: 2,
    TELEM_ATTR_SHAPE_TYPE_STL: 10,
    SECTION_TYPE_RESERVED: 0,
    SECTION_TYPE_CLIENT_NAME: 1,
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
    IMAGE_TYPE_JPEG: 0,
    IMAGE_TYPE_PNG: 1,
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
    TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE
];

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
    }
    console.error(Error(`Unknown section type: ${sectionType}`));
    return -1;
};