// components/panel-help.js: every message the Help panel shows must be understood by the library's text parser
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../teleplot-js/tests/helpers/load');

const code = fs.readFileSync(path.join(__dirname, '..', 'components', 'panel-help.js'), 'utf8');
const { HELP_EXAMPLES, HELP_SHORTCUTS } = new Function(code + '\nreturn { HELP_EXAMPLES, HELP_SHORTCUTS };')();

const find = (T, name) => Object.values(T.datastore.telemetries).find(t => t.attributes[T.protocol.TELEM_ATTR_NAME] === name);

for (const example of HELP_EXAMPLES) {
    test('help example is parsed: ' + example.code, () => {
        const T = loadTeleplot();
        T.parseDataText(example.code);
        const P = T.protocol, e = example.expect;
        if (e.log) {
            const logs = Object.values(T.datastore.telemetries).filter(t => t.data[P.SECTION_TYPE_TELEM_DATA_TEXT]);
            assert.equal(logs.length, 1);
            assert.equal(logs[0].data[P.SECTION_TYPE_TELEM_DATA_TEXT].data[0][0], example.code.slice(example.code.indexOf(':') + 1));
            return;
        }
        const telem = find(T, e.name);
        assert.ok(telem, 'telemetry ' + e.name + ' exists');
        if (e.camera) {
            const camera = T.view.ViewScene3D.cameraState(telem);
            assert.deepEqual([camera.fx, camera.fy, camera.cx, camera.cy, camera.width, camera.height, camera.position], [554, 554, 320, 240, 640, 480, [0, 0, 1]]);
            return;
        }
        if (e.shape) {
            assert.equal(telem.attributes[P.TELEM_ATTR_SHAPE].type, P.TELEM_ATTR_SHAPE_TYPE_CUBE);
            assert.deepEqual(T.view.ViewScene3D.shapeState(telem).position, [1, 0, 0.5]);
            assert.equal(T.view.suggestViewType(telem.id), '3d');
            return;
        }
        const type = { number: P.SECTION_TYPE_TELEM_DATA_NUMBER, '2d': P.SECTION_TYPE_TELEM_DATA_NUMBER_2D, '3d': P.SECTION_TYPE_TELEM_DATA_NUMBER_3D, text: P.SECTION_TYPE_TELEM_DATA_TEXT }[e.type];
        assert.ok(telem.data[type], 'has data of type ' + e.type);
        if (e.samples) assert.equal(telem.data[type].timestamps.length, e.samples);
        if (e.unit) assert.equal(telem.attributes[P.TELEM_ATTR_UNIT], e.unit);
        if (e.autoplot === false) assert.equal(telem.attributes[P.TELEM_ATTR_AUTOPLOT], false);
    });
}

test('shortcuts listed in the help exist in the top menu', () => {
    const menu = fs.readFileSync(path.join(__dirname, '..', 'components', 'top-menu.js'), 'utf8');
    for (const key of ['T', 'S', 'H', 'E']) assert.ok(HELP_SHORTCUTS.some(s => s.keys === key), key + ' is documented');
    for (const key of ['T', 'S', 'H']) assert.ok(menu.includes('key: "' + key + '"'), key + ' is bound');
});
