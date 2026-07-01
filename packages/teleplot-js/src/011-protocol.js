TELEPLOT.protocol = {
    TELEM_ATTR_NAME: 0,
    TELEM_ATTR_UNIT: 1,
    TELEM_ATTR_COLOR: 2,
    TELEM_ATTR_AUTOPLOT: 3,
    TELEM_ATTR_DATA_TIMEOUT: 4,
    TELEM_ATTR_SHAPE: 5,
    TELEM_ATTR_SHAPE_CUBE: 6,
    TELEM_ATTR_SHAPE_SPHERE: 7,
    TELEM_ATTR_SHAPE_CYLINDER: 8,
    TELEM_ATTR_SHAPE_STL: 9,
    SECTION_TYPE_RESERVED: 0,
    SECTION_TYPE_TELEM_ATTR: 1,
    SECTION_TYPE_TELEM_DATA_NUMBER: 2,
    SECTION_TYPE_TELEM_DATA_NUMBER_2D: 3,
    SECTION_TYPE_TELEM_DATA_NUMBER_3D: 4,
    SECTION_TYPE_TELEM_DATA_TEXT: 5,
    SECTION_TYPE_TELEM_DATA_IMAGE: 6,
    SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION: 7,
    SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION: 8,
    SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION: 9,
    SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR: 10,
    SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB: 11,
    SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY: 12,
    SECTION_TYPE_TELEM_DATA_SHAPE_SIZE: 13,
    SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE: 14,
    IMAGE_TYPE_JPEG: 0,
    IMAGE_TYPE_PNG: 1,
    TEXTURE_TYPE_NONE: 0,
    TEXTURE_TYPE_URL: 1,
    TEXTURE_TYPE_IMAGE: 2
};

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
    }
    console.error(Error(`Unknown section type: ${sectionType}`));
    return -1;
};