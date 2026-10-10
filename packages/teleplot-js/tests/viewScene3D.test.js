// 113-viewScene3D: what the 3D view computes before drawing (shape state at a time, trails, textures). Drawing itself needs a browser.
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');

const near = (actual, expected, eps = 1e-6) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= eps, `${actual} != ${expected}`));

test('sampleIndex: the last sample at or before a time, the latest one for "now"', () => {
    const T = loadTeleplot();
    const S = T.view.ViewScene3D;
    const entry = { timestamps: [10, 20, 30] };
    assert.equal(S.sampleIndex(entry), 2);
    assert.equal(S.sampleIndex(entry, -1), 2);
    assert.deepEqual([5, 10, 15, 20, 29.9, 30, 99].map(t => S.sampleIndex(entry, t)), [0, 0, 0, 1, 1, 2, 2], 'before the first sample: the first one');
    assert.equal(S.sampleIndex({ timestamps: [] }, 5), -1);
    assert.equal(S.sampleIndex(undefined), -1);
});

test('eulerToQuaternion: roll, pitch, yaw around the fixed x, y, z axes', () => {
    const T = loadTeleplot();
    const S = T.view.ViewScene3D;
    near(S.eulerToQuaternion(0, 0, 0), [1, 0, 0, 0]);
    near(S.eulerToQuaternion(0, 0, Math.PI / 2), [Math.SQRT1_2, 0, 0, Math.SQRT1_2], 1e-9); // quarter turn to the left around z
    near(S.eulerToQuaternion(Math.PI, 0, 0), [0, 1, 0, 0], 1e-9);
    near(S.eulerToQuaternion(0.1, 0.2, 0.3), [0.9833474, 0.0342708, 0.1060205, 0.1435722]); // same as three.js Euler order "ZYX"
});

test('shapeState: defaults, then what was sent (text protocol)', () => {
    const T = loadTeleplot();
    const P = T.protocol, S = T.view.ViewScene3D;
    T.parseDataText({ data: '3D|a:S:sphere', timestamp: 0 });
    const a = T.datastore.getTelemetry('a');
    assert.deepEqual(S.shapeState(a, -1, 'teal'), {
        type: P.TELEM_ATTR_SHAPE_TYPE_SPHERE, url: '', position: [0, 0, 0], quaternion: [1, 0, 0, 0], size: [1, 1, 1],
        color: 'teal', opacity: 1, texture: { type: P.TEXTURE_TYPE_NONE, value: '' }
    });
    a.setAttribute(P.TELEM_ATTR_COLOR, 'orange');
    assert.equal(S.shapeState(a, -1, 'teal').color, 'orange', 'the color of the telemetry comes before the palette');

    T.parseDataText({ data: '3D|a:1000:P:1:2:3:R:0:0:1.5707963267948966:RA:0.5:C:red:O:0.25:T:url:"http://host/t.png"', timestamp: 0 });
    const state = S.shapeState(a);
    assert.deepEqual(state.position, [1, 2, 3]);
    near(state.quaternion, [Math.SQRT1_2, 0, 0, Math.SQRT1_2], 1e-9);
    assert.deepEqual(state.size, [1, 1, 1]);
    assert.equal(state.color, 'red');
    near([state.opacity], [64 / 255]);
    assert.deepEqual(state.texture, { type: P.TEXTURE_TYPE_URL, value: 'http://host/t.png' });
});

test('shapeState: the latest of rotation / quaternion and of the two color forms wins, quaternions are normalised', () => {
    const T = loadTeleplot();
    const P = T.protocol, S = T.view.ViewScene3D;
    const s = T.datastore.getOrCreateTelemetry('s');
    s.addData(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION, [1], [[0], [0], [Math.PI]]);
    s.addData(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION, [2], [[2], [0], [0], [0]]);
    s.addData(P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR, [1], [['blue']]);
    s.addData(P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB, [2], [[255], [128], [0]]);
    assert.equal(S.isShape(s), true);
    near(S.shapeState(s).quaternion, [1, 0, 0, 0]);
    assert.equal(S.shapeState(s).color, 'rgb(255,128,0)');
    // At an earlier time (cursor of the group): the state of that time
    near(S.shapeState(s, 1.5).quaternion, [0, 0, 0, 1], 1e-9);
    assert.equal(S.shapeState(s, 1.5).color, 'blue');
    s.addData(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION, [3], [[0], [0], [0]]);
    s.addData(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION, [4], [[0], [0], [0], [0]]);
    near(S.shapeState(s).quaternion, [1, 0, 0, 0]); // a null quaternion is no rotation
    s.addData(P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE, [1, 2], [[P.TEXTURE_TYPE_IMAGE, P.TEXTURE_TYPE_NONE], ['camera', '']]);
    assert.deepEqual(S.shapeState(s, 1).texture, { type: P.TEXTURE_TYPE_IMAGE, value: 'camera' });
    assert.deepEqual(S.shapeState(s).texture, { type: P.TEXTURE_TYPE_NONE, value: '' });
});

test('3D points: trail of the latest positions, limited in length and to the time window', () => {
    const T = loadTeleplot();
    const P = T.protocol, S = T.view.ViewScene3D;
    T.parseDataText({ data: 'p:0:0:0:1000;1:0:0:2000;2:0:0:3000;3:0:0:4000|xyz', timestamp: 0 });
    const p = T.datastore.getTelemetry('p');
    assert.equal(S.isPoint(p), true);
    assert.equal(S.isShape(p), false);
    const entry = p.data[P.SECTION_TYPE_TELEM_DATA_NUMBER_3D];
    assert.deepEqual(S.trailRange(entry, -1, 200), { from: 0, to: 3 });
    assert.deepEqual(S.trailRange(entry, -1, 2), { from: 1, to: 3 });
    assert.deepEqual(S.trailRange(entry, -1, 0), { from: 3, to: 3 }, 'no trail: the point alone');
    assert.deepEqual(S.trailRange(entry, 2.5, 200), { from: 0, to: 1 }, 'at the cursor');
    assert.deepEqual(S.trailRange(entry, -1, 200, 2.5), { from: 2, to: 3 }, 'not before the zoomed range');
    assert.equal(S.trailRange({ timestamps: [], data: [[], [], []] }), undefined);
});

test('imageAt: the image of an image telemetry as a data url (texture of a shape)', () => {
    const T = loadTeleplot();
    const P = T.protocol, S = T.view.ViewScene3D;
    const camera = T.datastore.getOrCreateTelemetry('camera');
    camera.addData(P.SECTION_TYPE_TELEM_DATA_IMAGE, [1, 2], [[P.IMAGE_TYPE_JPEG, P.IMAGE_TYPE_PNG], ['AAAA', 'BBBB']]);
    assert.deepEqual(S.imageAt(camera), { t: 2, url: 'data:image/png;base64,BBBB' });
    assert.deepEqual(S.imageAt(camera, 1.2), { t: 1, url: 'data:image/jpeg;base64,AAAA' });
    assert.equal(S.imageAt(undefined), undefined);
    assert.equal(S.imageAt(T.datastore.getOrCreateTelemetry('nothing')), undefined);
});

test('3D view: suggested for shapes and 3D numbers, options, clone, empty state', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    T.parseDataText({ data: '3D|shape:S:cube\npoint:1:2:3|xyz\nnumber:1', timestamp: 0 });
    assert.deepEqual(['shape', 'point', 'number'].map(T.view.suggestViewType), ['3d', '3d', 'chart']);

    const view = T.view.createView('3d', ['shape', 'point'], 'g');
    assert.equal(view.type, 'teleplot-3d');
    assert.deepEqual(view.getOptionsSchema().map(o => o.key), ['displayGrid', 'displayAxes', 'displayLegend', 'displayNumberDecimals', 'trailLength']);
    view.setOption('trailLength', 50);
    const copy = view.clone();
    assert.ok(copy instanceof T.view.ViewScene3D);
    assert.deepEqual([Array.from(copy.telemetryIdOrNameList), copy.getOption('trailLength'), copy.group], [['shape', 'point'], 50, 'g']);

    assert.deepEqual(new T.view.ViewScene3D('', ['shape']).getEmptyState(), { text: '', hint: '' }, 'a shape without any data is drawn at the origin');
    assert.equal(new T.view.ViewScene3D('', []).getEmptyState().text, 'No telemetry');
    assert.equal(new T.view.ViewScene3D('', ['number']).getEmptyState().text, 'Nothing to display');
    assert.equal(new T.view.ViewScene3D('', ['later']).getEmptyState().text, 'Waiting for data');
});

test('auto dashboard: shapes and 3D points share one 3D view', () => {
    const T = loadTeleplot();
    T.dashboards.enableAutoDashboard('Live');
    T.parseDataText({ data: '3D|body:S:cube:P:0:0:0\n3D|wheel:S:cylinder\ntarget:1:2:3|xyz\nspeed:1', timestamp: 0 });
    T.__timers.run();
    const layout = T.dashboards.getDashboard('Live').getView();
    assert.deepEqual(layout.views.map(v => v.type), ['teleplot-3d', 'teleplot-chart']);
    assert.deepEqual(Array.from(layout.views[0].telemetryIdOrNameList), ['body', 'wheel', 'target'].map(n => T.datastore.getTelemetry(n).id));
    // The scene was removed by the user: the next shape gets a new one
    layout.removeView(layout.views[0].id);
    T.parseDataText({ data: '3D|other:S:sphere', timestamp: 0 });
    T.__timers.run();
    assert.deepEqual(layout.views.map(v => v.type), ['teleplot-chart', 'teleplot-3d']);
});

test('legend of the 3D view: positions as text, entries hide and highlight their telemetry', () => {
    const T = loadTeleplot();
    const S = T.view.ViewScene3D;
    assert.equal(S.formatPosition([1.23456, -2.5, 1000]), '1.23, -2.5, 1,000');
    assert.equal(S.formatPosition([1.23456, 0, NaN], 0), '1, 0, 0');
    const view = new S('', ['a', 'b']);
    view.toggleTelemetry(5);
    assert.deepEqual([view.hidden[5], view.highlighted], [true, undefined], 'a hidden telemetry is not highlighted');
    view.highlightTelemetry(5);
    assert.equal(view.highlighted, undefined);
    view.highlightTelemetry(6);
    assert.equal(view.highlighted, 6);
    view.toggleTelemetry(5);
    assert.deepEqual([view.hidden[5], view.highlighted], [undefined, 5], 'back, and under the pointer');
    view.highlightTelemetry(undefined);
    assert.equal(view.highlighted, undefined);
});
