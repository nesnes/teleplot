// 011-protocol, 013-clients, 105-colors
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot, captureConsole } = require('./helpers/load');

test('data channel count of every data section type', () => {
    const T = loadTeleplot(), p = T.protocol;
    const expected = {
        SECTION_TYPE_TELEM_DATA_NUMBER: 1, SECTION_TYPE_TELEM_DATA_NUMBER_2D: 2, SECTION_TYPE_TELEM_DATA_NUMBER_3D: 3,
        SECTION_TYPE_TELEM_DATA_TEXT: 1, SECTION_TYPE_TELEM_DATA_IMAGE: 2,
        SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION: 3, SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION: 3,
        SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION: 4, SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR: 1,
        SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB: 3, SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY: 1,
        SECTION_TYPE_TELEM_DATA_SHAPE_SIZE: 3, SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE: 2,
    };
    for (const [name, count] of Object.entries(expected)) assert.equal(p.getSectionTypeTelemDataDataCount(p[name]), count, name);
});

test('unknown section types are reported', () => {
    const T = loadTeleplot();
    let result;
    const out = captureConsole(() => { result = T.protocol.getSectionTypeTelemDataDataCount(250); });
    assert.equal(result, -1);
    assert.equal(out.error.length, 1);
});

test('wire constants match doc/binaryProtocol.md', () => {
    const p = loadTeleplot().protocol;
    assert.equal(p.BINARY_MARKER, 0x10);
    assert.equal(p.BINARY_VERSION, 1);
    assert.deepEqual([p.SECTION_TYPE_CLIENT_NAME, p.SECTION_TYPE_TELEM_ATTR, p.SECTION_TYPE_TELEM_DATA_NUMBER], [1, 10, 20]);
    assert.deepEqual([p.TELEM_ATTR_NAME, p.TELEM_ATTR_UNIT, p.TELEM_ATTR_COLOR, p.TELEM_ATTR_AUTOPLOT, p.TELEM_ATTR_DATA_TIMEOUT], [0, 1, 2, 3, 4]);
});

test('clients are created once and found by id', () => {
    const { clients } = loadTeleplot();
    assert.equal(clients.hasClient(3), false);
    const c = clients.getOrCreateClient(3);
    assert.equal(clients.getOrCreateClient(3), c);
    assert.equal(clients.getClient(3).name, '');
    assert.equal(captureConsole(() => clients.addClient(3)).error.length, 1); // duplicate
});

test('color palette wraps around, default color without index, rgba string', () => {
    const { colors } = loadTeleplot();
    const n = colors.palette.length;
    assert.equal(colors.getColor(0), colors.palette[0]);
    assert.equal(colors.getColor(n + 2), colors.palette[2]);
    assert.equal(colors.getColor().toStrRGB(), 'rgba(44,62,80,1)');
    assert.equal(new colors.Color(1, 2, 3, 0.5).toStrRGB(), 'rgba(1,2,3,0.5)');
});
