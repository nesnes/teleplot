// 2D drawings and frames: the "2D|" lines of the text protocol, flat shapes, frames (relative to another telemetry, or the pixels of
// a picture), and what the 2D view draws (115-viewScene2D, computed without any canvas)
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');
const { PacketBuilder, ATTR } = require('./helpers/packet');

const round = (value, digits = 6) => Array.isArray(value) || ArrayBuffer.isView(value) ? Array.from(value, (v) => round(v, digits)) : (typeof value === 'number' ? Math.round(value * 10 ** digits) / 10 ** digits + 0 : value);
const itemsOf = (T, names, options = {}) => {
    const view = new T.view.ViewScene2D('', names);
    Object.assign(view.options, options.view || {});
    const { sources } = view.__collectSources(options.timestamp === undefined ? -1 : options.timestamp);
    return T.view.ViewScene2D.buildItems(sources, Object.assign({ timestamp: -1, since: -Infinity, trailLength: 200 }, options));
};

test('"2D|" lines are "3D|" lines written flat: the same telemetry, with z = 0', () => {
    const T = loadTeleplot(), U = loadTeleplot(), P = T.protocol;
    T.parseDataText({ data: '2D|robot,field:1000:S:rect:P:1.2:0.8:R:1.57:W:0.3:H:0.2:C:blue:O:0.5\n2D|ball:1000:S:circle:P:2:1:RA:0.11', timestamp: 0 });
    U.parseDataText({ data: '3D|robot,field:1000:S:rect:P:1.2:0.8:0:R:0:0:1.57:W:0.3:D:0.2:C:blue:O:0.5\n3D|ball:1000:S:circle:P:2:1:0:RA:0.11', timestamp: 0 });
    const data = (X, name) => JSON.stringify(Object.fromEntries(Object.entries(X.datastore.getTelemetry(name).data).map(([type, e]) => [type, [e.timestamps, e.data]])));
    assert.equal(data(T, 'robot'), data(U, 'robot'));
    assert.deepEqual(T.datastore.getTelemetry('ball').data[P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE].data.map((c) => c[0]), [0.22, 0.22, 0.22]);
    const state = T.view.ViewScene3D.shapeState(T.datastore.getTelemetry('robot'));
    assert.deepEqual([state.type, state.position, state.size.slice(0, 2), state.color, state.opacity], [P.TELEM_ATTR_SHAPE_TYPE_RECT, [1.2, 0.8, 0], [0.3, 0.2], 'blue', 128 / 255]);
    assert.deepEqual(round(state.quaternion, 4), round([Math.cos(1.57 / 2), 0, 0, Math.sin(1.57 / 2)], 4));
    assert.equal(T.datastore.getTelemetry('robot').getAttribute(P.TELEM_ATTR_VIEW_LABEL), 'field');
    // Later lines only say what changes; z is left as it is
    T.parseDataText({ data: '3D|robot:2000:P:::0.4\n2D|robot:3000:P:5:6', timestamp: 0 });
    assert.deepEqual(T.view.ViewScene3D.shapeState(T.datastore.getTelemetry('robot')).position, [5, 6, 0.4]);
});

test('a shape never described is a rect in a 2D line (a cube in a 3D line); every shape type has its name', () => {
    const T = loadTeleplot(), P = T.protocol;
    T.parseDataText('2D|a:P:1:2\n3D|b:P:1:2:3\n2D|c:S:cube\n' + ['rect', 'circle', 'line', 'polygon', 'arrow', 'text'].map((type) => '3D|t.' + type + ':S:' + type).join('\n'));
    const type = (name) => T.datastore.getTelemetry(name).getAttribute(P.TELEM_ATTR_SHAPE).type;
    assert.deepEqual([type('a'), T.datastore.getTelemetry('b').getAttribute(P.TELEM_ATTR_SHAPE), type('c')], [P.TELEM_ATTR_SHAPE_TYPE_RECT, undefined, P.TELEM_ATTR_SHAPE_TYPE_CUBE]);
    assert.deepEqual(['rect', 'circle', 'line', 'polygon', 'arrow', 'text'].map((t) => type('t.' + t)), [3, 4, 5, 6, 7, 8]);
    assert.equal(T.parseDataText('2D|bad:S:blob'), 1);
});

test('points, vector, text, line width, text size: what flat shapes are made of', () => {
    const T = loadTeleplot(), P = T.protocol, S = T.view.ViewScene3D;
    assert.equal(T.parseDataText({ data: [
        '2D|route:1000:S:line:PT:0:0:1:0.5:2:2:C:green:LW:0.35',
        '3D|wire:1000:S:line:PT:0:0:0:1:1:1',
        '2D|zone:1000:S:polygon:PT:0:0:1:0:1:1',
        '2D|speed:1000:S:arrow:P:1:2:V:0.5:0.2',
        '3D|up:1000:S:arrow:V:0:0:2',
        '2D|goal:1000:S:text:P:3:1:TX:"Goal: A":TS:0.2',
        '2D|plain:1000:S:text:TX:hello',
    ].join('\n'), timestamp: 0 }), 0);
    const state = (name) => S.shapeState(T.datastore.getTelemetry(name));
    assert.deepEqual([Array.from(state('route').points), state('route').lineWidth, state('route').pointsKey], [[0, 0, 0, 1, 0.5, 0, 2, 2, 0], 0.35, '1:9:0']);
    assert.deepEqual(Array.from(state('wire').points), [0, 0, 0, 1, 1, 1]);
    assert.equal(state('wire').lineWidth, undefined, 'never sent: as thin as the screen draws');
    assert.deepEqual([state('speed').vector, state('up').vector], [[0.5, 0.2, 0], [0, 0, 2]]);
    assert.deepEqual([state('goal').text, state('goal').sized, state('goal').size[1], state('plain').text, state('plain').sized], ['Goal: A', true, 0.2, 'hello', false]);
    // Lines and polygons are shapes, not point clouds, though their points are stored the same way
    assert.deepEqual(['route', 'zone', 'goal'].map((name) => S.kindOf(T.datastore.getTelemetry(name))), ['shape', 'shape', 'shape']);
    assert.ok(T.datastore.getTelemetry('route').data[P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD]);
    // Points that do not come by pairs (or by three in a 3D line) are refused
    assert.equal(T.parseDataText('2D|odd:S:line:PT:0:0:1\n3D|odd3:S:line:PT:0:0:1:1'), 2);
    // The points move with the shape
    T.parseDataText({ data: '2D|route:2000:P:10:0:R:1.5707963267948966', timestamp: 0 });
    const line = itemsOf(T, ['route']).find((item) => item.kind === 'line');
    assert.deepEqual(round(line.points, 4), [[10, 0], [9.5, 1], [8, 2]]);
});

test('frames: positions relative to another telemetry, which may be in a frame too', () => {
    const T = loadTeleplot(), P = T.protocol, S = T.view.ViewScene3D;
    T.parseDataText({ data: [
        '2D|robot:1000:S:rect:P:1:2:R:1.5707963267948966',
        '2D|arm:1000:S:rect:P:0.5:0:R:1.5707963267948966:F:robot',
        '2D|hand:1000:S:arrow:P:0.2:0:V:1:0:F:arm',
        '2D|free:1000:S:rect:P:0.5:0',
        '2D|lost:1000:S:rect:P:0.5:0:F:nobody',
        '2D|a:1000:P:1:0:F:b', '2D|b:1000:P:1:0:F:a', '2D|me:1000:P:1:0:F:me',
    ].join('\n'), timestamp: 0 });
    const state = (name, t = -1) => S.shapeState(T.datastore.getTelemetry(name), t);
    assert.deepEqual(T.datastore.getTelemetry('arm').getAttribute(P.TELEM_ATTR_FRAME), { type: P.FRAME_TYPE_POSE, name: 'robot' });
    assert.deepEqual([round(state('arm').position, 6), state('arm').framed], [[1, 2.5, 0], true], 'half a unit in front of a robot that looks along y');
    assert.deepEqual(round(state('hand').position, 6), [0.8, 2.5, 0], 'a frame in a frame');
    assert.deepEqual(round(state('hand').vector, 6), [-1, 0, 0], 'its arrow is turned twice');
    assert.deepEqual([state('free').position, state('free').framed, state('lost').position, state('lost').framed], [[0.5, 0, 0], false, [0.5, 0, 0], false], 'no frame, or an unknown one: the scene');
    assert.ok(state('a').position.every(Number.isFinite) && state('me').position[0] === 1, 'frames that go in circles do not hang');
    // The frame moves: what is in it follows, at the time asked
    T.parseDataText({ data: '2D|robot:2000:P:10:0:R:0', timestamp: 0 });
    assert.deepEqual([round(state('arm').position, 6), round(state('arm', 1.5).position, 6)], [[10.5, 0, 0], [1, 2.5, 0]]);
    // "F:" alone: back to the scene
    T.parseDataText('2D|arm:F:');
    assert.deepEqual([T.datastore.getTelemetry('arm').getAttribute(P.TELEM_ATTR_FRAME), round(state('arm').position, 6)], [undefined, [0.5, 0, 0]]);
});

test('frames: a point, a cloud and a camera can be in a frame, and be one', () => {
    const T = loadTeleplot(), S = T.view.ViewScene3D;
    T.parseDataText({ data: [
        'base:1:1:1000|xy', 'base:5:5:2000|xy',
        '2D|flag:1000:S:text:TX:here:P:0:1:F:base',            // In the frame of a point: placed, not turned
        '2D|truck:1000:S:rect:P:10:0:R:1.5707963267948966', '2D|truck:2000:P:20:0',
        'tip:1:0:1000|xy', 'tip:2:0:2000|xy', '2D|tip:F:truck',  // A point carried by something
        'scan:1000;1:0:0|pc', '2D|scan:F:truck',                 // A cloud too: its sensor pose is in the frame
        '3D|cam:1000:K:100:100:50:50:100:100:P:0:0:1:F:truck',
    ].join('\n'), timestamp: 0 });
    const get = (name) => T.datastore.getTelemetry(name);
    assert.deepEqual([S.shapeState(get('flag'), 1).position, S.shapeState(get('flag')).position], [[1, 2, 0], [5, 6, 0]]);
    // Each position of the trail is placed by the frame as it was then: where the point really went
    assert.deepEqual(round(S.pointPositions(get('tip'), get('tip').data[21], 0, 1), 6), [10, 1, 0, 20, 2, 0]);
    assert.deepEqual(round(S.poseOf(get('tip')).position, 6), [20, 2, 0]);
    const items = itemsOf(T, ['scan', 'cam', 'tip']);
    assert.deepEqual(round(items.find((i) => i.kind === 'points').positions, 6), [10, 1], 'the cloud was taken at t = 1, when the truck was at 10');
    assert.deepEqual(round(S.cameraState(get('cam')).position, 6), [20, 0, 1]);
    assert.deepEqual(round(items.find((i) => i.kind === 'line' && i.id === get('tip').id).points, 6), [[10, 1], [20, 2]]);
});

test('pixel frames: drawn in the pixels of a picture, by the image views of that picture only', () => {
    const T = loadTeleplot(), P = T.protocol, S = T.view.ViewScene3D;
    T.parseDataText({ data: 'PNG|camera:1000:iVBORw0KGgo=\n2D|det:1000:S:rect:P:120:80:W:40:H:60:C:red:FPX:camera\n2D|other:1000:S:rect:FPX:elsewhere\n2D|ground:1000:S:rect', timestamp: 0 });
    const get = (name) => T.datastore.getTelemetry(name);
    assert.deepEqual(get('det').getAttribute(P.TELEM_ATTR_FRAME), { type: P.FRAME_TYPE_PIXELS, name: 'camera' });
    assert.deepEqual([S.pixelFrame(get('det')), S.pixelFrame(get('ground'))], ['camera', undefined]);
    assert.deepEqual(S.shapeState(get('det')).position, [120, 80, 0], 'pixels are not turned into anything');
    const names = (view) => view.__collectSources(-1).sources.map((s) => s.telem.getAttribute(P.TELEM_ATTR_NAME));
    assert.deepEqual(names(new T.view.ViewScene2D('', ['det', 'other', 'ground'])), ['ground'], 'a scene has no place for pixels');
    assert.deepEqual(names(new T.view.ViewScene3D('', ['det', 'other', 'ground'])), ['ground']);
    const image = new T.view.ViewImage('', ['camera', 'det', 'other', 'ground']);
    assert.deepEqual(names(image), ['camera', 'det', 'ground'].filter((n) => n !== 'camera').concat([]).sort(), 'its own pixels, and the scene');
    // The image view takes by itself what is drawn in the pixels of its picture, once
    const alone = new T.view.ViewImage('', ['camera']);
    alone.__takePixelTelemetries(get('camera'));
    assert.deepEqual(Array.from(alone.telemetryIdOrNameList).length, 2);
    alone.removeTelemetry('det');
    T.parseDataText('2D|late:S:text:TX:hi:FPX:camera');
    alone.__takePixelTelemetries(get('camera'));
    assert.deepEqual(Array.from(alone.telemetryIdOrNameList).map((e) => typeof e === 'string' ? e : T.datastore.getTelemetry(e).getAttribute(0)), ['camera', 'late'], 'what was removed is not taken again');
    // In pixels nothing is flipped: v goes down
    const { sources } = image.__collectSources(-1);
    const items = T.view.ViewScene2D.buildItems(sources.filter((s) => S.pixelFrame(s.telem)), { pixels: true });
    assert.deepEqual(round(items[0].points, 6), [[100, 50], [140, 50], [140, 110], [100, 110]]);
});

test('what is flat goes to a 2D view by default, the rest to a 3D view; both views take both', () => {
    const T = loadTeleplot();
    T.parseDataText([
        'pos:1:2|xy', 'point:1:2:3|xyz', '2D|rect:P:1:2', '3D|cube:P:1:2:3', '2D|line:S:line:PT:0:0:1:1',
        'scan:1:0:0;0:1:0|pc', 'cloud:1:0:0;0:1:0.5|pc', 'PNG|cam:iVBORw0KGgo=', '2D|det:S:rect:FPX:cam', 'n:1', '3D|solid:S:cube', '2D|solid:P:1:1',
    ].join('\n'));
    const type = (name) => T.view.suggestViewType(name);
    assert.deepEqual(['pos', 'point', 'rect', 'cube', 'line', 'scan', 'cloud', 'cam', 'det', 'n', 'solid'].map(type),
        ['2d', '3d', '2d', '3d', '2d', '2d', '3d', 'image', 'image', 'chart', '3d']);
    const suits = (view, name) => view.suitsTelemetry(T.datastore.getTelemetry(name));
    const flat = T.view.createView('2d'), scene = T.view.createView('3d'), image = T.view.createView('image');
    assert.deepEqual(['pos', 'cube', 'cloud', 'det', 'cam', 'n'].map((n) => suits(flat, n)), [true, true, true, false, false, false]);
    assert.deepEqual(['pos', 'rect', 'scan', 'det', 'cam', 'n'].map((n) => suits(scene, n)), [true, true, true, false, true, false]);
    assert.equal(suits(image, 'det'), true);
});

test('automatic dashboard: flat things share a 2D view, a label gives a view of each kind with everything of the label', () => {
    const T = loadTeleplot();
    T.dashboards.enableAutoDashboard('Live');
    T.parseDataText('pos:1:2|xy\n2D|robot:P:1:2\n3D|cube:P:1:2:3\nPNG|cam:iVBORw0KGgo=\n2D|det:S:rect:FPX:cam\n2D|a,field:P:1:1\n3D|b,field:P:1:1:1');
    T.__timers.run();
    const views = T.dashboards.getDashboard('Live').getView().views.map((v) => v.type.replace('teleplot-', '') + ':' + (v.options.title || '') + ':' + Array.from(v.telemetryIdOrNameList).map((id) => T.datastore.getTelemetry(id).getAttribute(0)).join(','));
    assert.deepEqual(views, ['2d::pos,robot', '3d::cube', 'image::cam', '2d:field:a,b', '3d:field:b,a']);
    assert.equal(T.dashboards.exportText('Live').split('\n')[1], 'DASH|Live/#1:2d:pos,robot');
    assert.deepEqual(T.dashboards.importText('DASH|Map/M:2d:pos').dashboards, ['Map']);
    assert.equal(T.dashboards.getDashboard('Map').getView().views[0].type, 'teleplot-2d');
});

test('hull, grid step, bounds and fit', () => {
    const V = loadTeleplot().view.ViewScene2D;
    assert.deepEqual(V.hull([[0, 0], [1, 1], [2, 0], [1, 0.2], [1, -1], [1, 0], [NaN, 0]]), [[0, 0], [1, -1], [2, 0], [1, 1]]);
    assert.deepEqual(V.hull([[1, 1], [0, 0]]), [[0, 0], [1, 1]]);
    assert.deepEqual([8, 9.9, 20, 45, 0.07, 1300, 0].map((span) => V.niceStep(span, 8)), [1, 1, 2, 5, 0.01, 200, 1]);
    assert.deepEqual([V.project([1, 2, 3], V.axes()), V.project([1, 2, 3], V.axes('-y', 'x')), V.project([1, 2, 3], V.axes('x', 'z')), V.project([1, 2, 3], V.axes('y', 'x'))], [[1, 2], [-2, 1], [1, 3], [2, 1]]);
    // What comes to the viewer: z from above, -y from the side, -z when the view is mirrored (north up, east right)
    assert.deepEqual([V.axes().toward, V.axes('-y', 'x').toward, V.axes('x', 'z').toward, V.axes('y', 'x').toward].map((v) => v.map((n) => n + 0)), [[0, 0, 1], [0, 0, 1], [0, -1, 0], [0, 0, -1]]);
    assert.deepEqual([V.axes('x', 'x').up, V.axes('nope', '-z').right, V.axes('z', '-z').up], [[1, 1], [0, 1], [0, 1]], 'what cannot make a plane falls back');
    const bounds = V.itemsBounds([{ kind: 'line', points: [[0, 1], [4, -1]] }, { kind: 'dot', at: [-2, 0] }, { kind: 'points', positions: Float32Array.from([1, 5, NaN, 9]) }]);
    assert.deepEqual(bounds, { min: [-2, -1], max: [4, 5] });
    assert.equal(V.itemsBounds([]), undefined);
    assert.deepEqual(V.fit(bounds, 720, 480, 0.1), { u: 1, v: 2, scale: 480 / 6 / 1.2 });
});

test('what the 2D view draws: solids as what they cover, flat shapes as they are, in the order of their height', () => {
    const T = loadTeleplot(), P = T.protocol;
    T.parseDataText({ data: [
        '3D|cube:1000:S:cube:P:0:0:5:W:2:D:1:H:9:R:0:0:1.5707963267948966:C:purple',
        '3D|ball:1000:S:sphere:P:10:0:1:RA:0.5',
        '2D|rect:1000:S:rect:P:1:1:W:2:H:1:R:1.5707963267948966:C:blue:O:0.5',
        '2D|disc:1000:S:circle:P:0:0:RA:2',
        '2D|zone:1000:S:polygon:PT:0:0:1:0:1:1:LW:0.1',
        '2D|vel:1000:S:arrow:P:1:1:V:2:0',
        '2D|goal:1000:S:text:P:3:1:TX:"Goal A"',
        '2D|big:1000:S:text:P:3:2:TX:"Big":TS:0.5',
        'pos:1:2:1000|xy', 'pos:3:4:2000|xy',
        'scan:1000;1:0:0:0.5;0:1:0:1|pc', '3D|scan:1000:P:5:5:0',
        '3D|cam:1000:K:100:100:50:50:100:100:P:0:0:2',
        '2D|floor:1000:S:rect:P:0:0:W:4:H:2:T:url:"plan.png"',
    ].join('\n'), timestamp: 0 });
    const id = (name) => T.datastore.getTelemetry(name).id;
    const items = itemsOf(T, ['cube', 'ball', 'rect', 'disc', 'zone', 'vel', 'goal', 'big', 'pos', 'scan', 'cam', 'floor']);
    const of = (name, kind) => items.filter((item) => item.id === id(name) && (!kind || item.kind === kind));
    // A cube turned a quarter: its footprint is 1 x 2 around (0, 0), whatever its height
    assert.deepEqual(round(of('cube')[0].points, 6), [[-0.5, -1], [0.5, -1], [0.5, 1], [-0.5, 1]]);
    assert.deepEqual([of('cube')[0].kind, of('cube')[0].fill, of('cube')[0].color, of('cube')[0].z], ['polygon', true, 'purple', 5]);
    const ball = of('ball')[0].points;
    assert.ok(ball.length >= 24 && ball.every((p) => Math.abs(Math.hypot(p[0] - 10, p[1]) - 0.5) < 1e-9), 'a sphere is a circle');
    assert.deepEqual(round(of('rect')[0].points, 6), [[1.5, 0], [1.5, 2], [0.5, 2], [0.5, 0]]);
    assert.equal(of('rect')[0].opacity, 128 / 255);
    assert.equal(of('disc')[0].points.length, 64);
    assert.deepEqual([of('zone')[0].kind, of('zone')[0].points, of('zone')[0].lineWidth], ['polygon', [[0, 0], [1, 0], [1, 1]], 0.1]);
    assert.deepEqual(round(of('vel').map((item) => item.points), 6), [[[1, 1], [3, 1]], [[3, 1], [2.5, 1.225]], [[3, 1], [2.5, 0.775]]], 'a shaft and the two sides of its head');
    assert.deepEqual([of('goal')[0].kind, of('goal')[0].at, of('goal')[0].text, of('goal')[0].height, of('big')[0].height], ['text', [3, 1], 'Goal A', undefined, 0.5]);
    assert.deepEqual([of('pos', 'line')[0].points, of('pos', 'dot')[0].at], [[[1, 2], [3, 4]], [3, 4]], 'a position and where it went: an XY plot');
    assert.deepEqual([round(of('scan')[0].positions, 6), of('scan')[0].colors.length], [[6, 5, 5, 6], 6], 'points placed by the pose of the sensor, colored by their intensity');
    assert.deepEqual([of('cam', 'polygon')[0].fill, of('cam', 'polygon')[0].points.length, of('cam', 'dot')[0].at], [false, 3, [0, 0]], 'a camera: the triangle of what it sees');
    assert.equal(of('floor')[0].texture, undefined, 'the url of a texture is given by the view that loads it');
    // Lower things first; z is only used for that
    assert.deepEqual(items.map((item) => item.z), items.map((item) => item.z).slice().sort((a, b) => a - b));
    assert.equal(items[items.length - 1].id, id('cube'));

    // Options: x to the top, a trail limit, hidden and faded telemetries
    assert.deepEqual(round(itemsOf(T, ['pos'], { axes: T.view.ViewScene2D.axes('-y', 'x') }).find((i) => i.kind === 'dot').at, 6), [-4, 3]);
    assert.equal(itemsOf(T, ['pos'], { trailLength: 0 }).filter((i) => i.kind === 'line').length, 0);
    assert.deepEqual(itemsOf(T, ['pos'], { timestamp: 1.5 }).map((i) => i.kind), ['dot'], 'at a time: where it was then');
    const view = new T.view.ViewScene2D('', ['rect', 'disc']);
    view.toggleTelemetry(id('rect'));
    view.highlighted = id('rect');
    const drawn = T.view.ViewScene2D.buildItems(view.__collectSources(-1).sources, {});
    assert.deepEqual(drawn.map((i) => [i.id, i.opacity]), [[id('disc'), 0.15]]);
});

test('arrows and bands of lines, as the 3D view draws them', () => {
    const S = loadTeleplot().view.ViewScene3D;
    assert.deepEqual(S.arrowSegments([0, 0, 0]), []);
    assert.deepEqual(round(S.arrowSegments([0, 0, 2]), 6), [[[0, 0, 0], [0, 0, 2]], [[0, 0, 2], [0.225, 0, 1.5]], [[0, 0, 2], [-0.225, 0, 1.5]]], 'a vertical arrow has its head across x');
    assert.deepEqual(round(S.ribbon([[0, 0, 1], [2, 0, 1]], 0.5), 6), [0, 0.25, 1, 0, -0.25, 1, 2, -0.25, 1, 0, 0.25, 1, 2, -0.25, 1, 2, 0.25, 1]);
    assert.equal(S.ribbon([[0, 0, 0], [1, 0, 0], [1, 1, 0]], 0.1, true).length, 3 * 18, 'closed: back to the first point');
    assert.deepEqual(round(S.rotateVector(S.eulerToQuaternion(0, 0, Math.PI / 2), [1, 0, 0]), 9), [0, 1, 0]);
    assert.deepEqual(round(S.multiplyQuaternions(S.eulerToQuaternion(0, 0, 1), S.eulerToQuaternion(0, 0, 0.5)), 9), round(S.eulerToQuaternion(0, 0, 1.5), 9));
});

test('binary protocol: flat shapes, their data and their frame; both protocols give the same telemetry', () => {
    const T = loadTeleplot(), U = loadTeleplot(), P = T.protocol, S = T.view.ViewScene3D;
    const ref = 1000000000n;
    T.parseDataBinary(new PacketBuilder(1)
        .attrs(1, [[ATTR.NAME, 'robot'], [ATTR.SHAPE, { type: 3 }]]).shapeFloats('SHAPE_POSITION', 1, ref, [[0, 1, 2, 0]])
        .attrs(2, [[ATTR.NAME, 'speed'], [ATTR.SHAPE, { type: 7 }], [8, { type: 0, name: 'robot' }]])
        .shapeVector(2, ref, [[0, 0.5, 0.25, 0]]).shapeLineWidth(2, ref, [[0, 0.125]])
        .attrs(3, [[ATTR.NAME, 'goal'], [ATTR.SHAPE, { type: 8 }]]).shapeText(3, ref, [[0, 'Goal A'], [5, 'Goal B']])
        .attrs(4, [[ATTR.NAME, 'det'], [ATTR.SHAPE, { type: 3 }], [8, { type: 1, name: 'camera' }]])
        .attrs(5, [[ATTR.NAME, 'route'], [ATTR.SHAPE, { type: 5 }]]).pointClouds(5, ref, [[0, 0, 0, 1, [[0, 0, 0], [1, 0.5, 0]]]])
        .build());
    U.parseDataText({ data: '2D|robot:1000:S:rect:P:1:2\n2D|speed:1000:S:arrow:V:0.5:0.25:LW:0.125:F:robot\n2D|goal:1000:S:text:TX:Goal A\n2D|goal:1000.000005:TX:Goal B\n2D|det:S:rect:FPX:camera\n2D|route:1000:S:line:PT:0:0:1:0.5', timestamp: 0 });
    const get = (X, name) => X.datastore.findByName(name);
    for (const name of ['robot', 'speed', 'goal', 'det', 'route']) {
        const a = S.shapeState(get(T, name)), b = S.shapeState(get(U, name));
        assert.deepEqual([a, Array.from(a.points || [])], [b, Array.from(b.points || [])], name);
        assert.deepEqual(get(T, name).getAttribute(P.TELEM_ATTR_FRAME), get(U, name).getAttribute(P.TELEM_ATTR_FRAME), name);
    }
    assert.deepEqual(S.shapeState(get(T, 'speed')).position, [1, 2, 0], 'the frame is found by its name, whatever the protocol');
    assert.equal(S.pixelFrame(get(T, 'det')), 'camera');
    assert.equal(P.getSectionTypeTelemDataDataCount(P.SECTION_TYPE_TELEM_DATA_SHAPE_VECTOR), 3);
});

test('files: flat shapes and frames are read back the same, from a binary file and from a text file', () => {
    const T = loadTeleplot(), S = T.view.ViewScene3D;
    T.parseDataText({ data: [
        '2D|robot:1000:S:rect:P:1.2:0.8:R:0.3', '2D|speed:1000:S:arrow:V:0.5:0.2:LW:0.03:F:robot', '2D|goal:1000:S:text:P:3:1:TX:"Goal: A; go":TS:0.2',
        '2D|det:1000:S:rect:P:120:80:FPX:camera', '2D|route:1000:S:line:PT:0:0:1:0.5:2:2:C:green', '2D|zone:1000:S:polygon:PT:0:0:1:0:1:1:O:0.3',
    ].join('\n'), timestamp: 0 });
    const describe = (X) => Object.fromEntries(['robot', 'speed', 'goal', 'det', 'route', 'zone'].map((name) => { const telem = X.datastore.getTelemetry(name), state = S.shapeState(telem); return [name, [state, Array.from(state.points || []), telem.attributes]]; }));
    const binary = T.files.exportBinary(), text = T.files.exportText();
    assert.deepEqual([binary.skipped, text.skipped], [0, 0]);
    for (const file of [Buffer.concat(binary.parts.map((p) => Buffer.from(p))), text.parts.join('')]) {
        const U = loadTeleplot();
        const result = U.files.importData(typeof file === 'string' ? file : new Uint8Array(file));
        assert.equal(result.problems, 0);
        assert.deepEqual(describe(U), describe(T), typeof file === 'string' ? 'text' : 'binary');
    }
});

test('seen from the side or mirrored: what is nearer to the viewer is drawn over the rest', () => {
    const T = loadTeleplot();
    T.parseDataText({ data: '3D|low:1000:S:cube:P:0:0:1\n3D|high:1000:S:cube:P:0:5:9\n', timestamp: 0 });
    const order = (right, up) => itemsOf(T, ['low', 'high'], { axes: T.view.ViewScene2D.axes(right, up) }).map((item) => T.datastore.getTelemetry(item.id).getAttribute(0));
    assert.deepEqual([order('x', 'y'), order('x', 'z'), order('y', 'x')], [['low', 'high'], ['high', 'low'], ['high', 'low']], 'from above, from the side (towards -y is nearer), from below');
    const side = itemsOf(T, ['high'], { axes: T.view.ViewScene2D.axes('x', 'z') })[0];
    assert.deepEqual(round(side.points, 6), [[-0.5, 8.5], [0.5, 8.5], [0.5, 9.5], [-0.5, 9.5]], 'a cube from the side: a square at its height');
    assert.deepEqual(new T.view.ViewScene2D('', []).getOptionsSchema().filter((o) => o.type === 'choice').map((o) => [o.key, o.choices.map((c) => c[0])]),
        [['axisRight', ['x', '-x', 'y', '-y', 'z', '-z']], ['axisUp', ['x', '-x', 'y', '-y', 'z', '-z']]]);
});

test('an image telemetry that is given a place shows its own pictures there, in 2D and 3D views; a camera stays a camera', () => {
    const T = loadTeleplot(), P = T.protocol, S = T.view.ViewScene3D;
    T.parseDataText({ data: 'PNG|map:1000:AAAA\nPNG|map:2000:BBBB\n2D|map:1000:P:2:1.5:W:4:H:3\nPNG|plain:1000:AAAA\nPNG|cam:1000:AAAA\n3D|cam:1000:K:100:100:50:50:100:100\n2D|plan:1000:S:rect:T:telem:map', timestamp: 0 });
    const get = (name) => T.datastore.getTelemetry(name);
    assert.deepEqual([S.kindOf(get('map')), S.kindOf(get('plain')), S.kindOf(get('cam'))], ['shape', undefined, 'camera']);
    assert.deepEqual(S.shapeState(get('map')).texture, { type: P.TEXTURE_TYPE_IMAGE, value: 'map', own: true });
    assert.equal(T.view.suggestViewType('map'), 'image', 'its default view is still an image view');
    for (const View of [T.view.ViewScene2D, T.view.ViewScene3D]) {
        const view = new View('', ['map', 'plan', 'plain']);
        const at = (t) => view.__collectSources(t).sources.map((s) => [s.telem.getAttribute(0), s.image && s.image.url]);
        assert.deepEqual(at(-1), [['map', 'data:image/png;base64,BBBB'], ['plan', 'data:image/png;base64,BBBB']]);
        assert.deepEqual(at(1.5)[0], ['map', 'data:image/png;base64,AAAA'], 'the picture of the time shown');
    }
    const view = new T.view.ViewScene2D('', ['map']);
    const { sources } = view.__collectSources(-1);
    sources[0].textureUrl = sources[0].image.url; // (what the view does before drawing)
    const item = T.view.ViewScene2D.buildItems(sources, {})[0];
    assert.deepEqual([item.texture, round(item.points, 6)], ['data:image/png;base64,BBBB', [[0, 0], [4, 0], [4, 3], [0, 3]]]);
});

test('poses of frames are computed once per update of the views, and never kept afterwards', () => {
    const T = loadTeleplot(), S = T.view.ViewScene3D;
    T.parseDataText({ data: '2D|parent:1000:S:rect:P:1:2\n' + Array.from({ length: 20 }, (v, i) => '2D|child' + i + ':1000:S:rect:P:' + i + ':0:F:parent').join('\n'), timestamp: 0 });
    let calls = 0;
    const original = S.__poseOf;
    S.__poseOf = function(...args) { calls++; return original.apply(this, args); };
    const view = new T.view.ViewScene2D('', Array.from({ length: 20 }, (v, i) => 'child' + i));
    view.__collectSources(-1);
    assert.equal(calls, 20, 'outside an update: nothing is remembered');
    calls = 0;
    S.__poseCache = new Map();
    view.__collectSources(-1);
    S.__poseCache = undefined;
    assert.equal(calls, 1, 'during an update: once for the 20 shapes of the frame');
    T.parseDataText({ data: '2D|parent:2000:P:5:5', timestamp: 0 });
    assert.deepEqual(S.shapeState(T.datastore.getTelemetry('child3')).position, [8, 5, 0], 'new data is seen right away');
    T.updates.update();
    assert.equal(S.__poseCache, undefined);
    S.__poseOf = original;
});
