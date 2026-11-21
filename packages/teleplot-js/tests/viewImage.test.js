// 114-viewImage: the camera model used to draw 3D telemetries over an image (no three.js: drawing itself needs a browser)
const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');

const near = (actual, expected, eps = 1e-9) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= eps, `${actual} != ${expected}`));
const CAMERA = { width: 640, height: 480, fx: 500, fy: 480, cx: 300.5, cy: 250.25 };

test('cameraState: intrinsics, optional distortion, pose in the frame of the scene; nothing is invented', () => {
    const T = loadTeleplot();
    const P = T.protocol, S = T.view.ViewScene3D;
    T.parseDataText({ data: 'JPG|cam:1000:AAAA', timestamp: 0 });
    const cam = T.datastore.getTelemetry('cam');
    assert.equal(S.cameraState(cam), undefined, 'an image alone is not a camera');
    assert.equal(S.isCamera(cam), false);

    T.parseDataText({ data: '3D|cam:1000:K:500:480:300.5:250.25:640:480', timestamp: 0 });
    assert.equal(S.isCamera(cam), true);
    assert.equal(S.isShape(cam), false, 'its pose is the one of a camera');
    assert.equal(S.kindOf(cam), 'camera');
    assert.deepEqual(S.cameraState(cam), { ...CAMERA, distortion: undefined, position: [0, 0, 0], quaternion: [1, 0, 0, 0], depth: 1 }, 'no pose sent: at the origin, looking along x');

    T.parseDataText({ data: '3D|cam:2000:P:1:2:3:R:0:0:1.5707963267948966:W:0.4:DC:-0.3:0.1:0:0:0', timestamp: 0 });
    const state = S.cameraState(cam);
    assert.deepEqual([state.position, state.depth, state.distortion], [[1, 2, 3], 0.4, [-0.3, 0.1, 0, 0, 0]]);
    near(state.quaternion, [Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
    // At the time of an older image: the samples in effect then, not the latest ones
    assert.deepEqual([S.cameraState(cam, 1.5).position, S.cameraState(cam, 1.5).distortion], [[1, 2, 3], [-0.3, 0.1, 0, 0, 0]], 'nothing older exists: the first sample');
    T.parseDataText({ data: '3D|cam:3000:P:9:9:9:DC:0:0:0:0:0', timestamp: 0 });
    assert.deepEqual([S.cameraState(cam, 2.5).position, S.cameraState(cam).position, S.cameraState(cam).distortion], [[1, 2, 3], [9, 9, 9], undefined], 'null coefficients: a plain pinhole');

    const broken = T.datastore.getOrCreateTelemetry('broken');
    broken.addData(P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS, [1], [[640], [480], [0], [480], [320], [240]]);
    assert.equal(S.cameraState(broken), undefined, 'a focal length of 0 makes no camera');
});

test('projectPoint: x forward lands on the principal point, y is to the left of the image, z to its top', () => {
    const T = loadTeleplot();
    const V = T.view.ViewImage;
    near(V.projectPoint(CAMERA, [3, 0, 0]), [300.5, 250.25]);
    near(V.projectPoint(CAMERA, [1, 0.1, 0]), [250.5, 250.25]);   // left -> smaller u
    near(V.projectPoint(CAMERA, [1, 0, 0.1]), [300.5, 202.25]);   // up -> smaller v
    near(V.projectPoint(CAMERA, [2, 0.5, 0.3]), [175.5, 178.25]);
    assert.equal(V.projectPoint(CAMERA, [-1, 0, 0]), undefined, 'behind the camera');
    assert.equal(V.projectPoint(CAMERA, [0, 1, 0]), undefined);
});

test('cameraCorners: the pyramid of a camera goes through the corners of its image', () => {
    const T = loadTeleplot();
    const S = T.view.ViewScene3D, V = T.view.ViewImage;
    const corners = S.cameraCorners({ ...CAMERA, depth: 2 });
    assert.deepEqual(corners.map(c => c[0]), [2, 2, 2, 2]);
    const pixels = corners.map(c => V.projectPoint(CAMERA, c));
    [[-0.5, -0.5], [639.5, -0.5], [639.5, 479.5], [-0.5, 479.5]].forEach((expected, i) => near(pixels[i], expected, 1e-9)); // top left, top right, bottom right, bottom left
    assert.ok(corners[0][1] > 0 && corners[0][2] > 0, 'the top left corner is to the left (y) and above (z)');
});

test('distortion: OpenCV model, and its inverse by successive approximations', () => {
    const T = loadTeleplot();
    const V = T.view.ViewImage;
    near(V.distortPoint(0.4, -0.3, [0, 0, 0, 0, 0]), [0.4, -0.3]);
    // r2 = 0.25: radial = 1 - 0.3*0.25 + 0.1*0.0625 + 0.02*0.015625
    const radial = 1 - 0.075 + 0.00625 + 0.0003125;
    near(V.distortPoint(0.4, -0.3, [-0.3, 0.1, 0, 0, 0.02]), [0.4 * radial, -0.3 * radial], 1e-12);
    // tangential terms: dx = 2*p1*x*y + p2*(r2 + 2x²), dy = p1*(r2 + 2y²) + 2*p2*x*y
    near(V.distortPoint(0.4, -0.3, [0, 0, 0.01, 0.02, 0]), [0.4 + 2 * 0.01 * -0.12 + 0.02 * (0.25 + 0.32), -0.3 + 0.01 * (0.25 + 0.18) + 2 * 0.02 * -0.12], 1e-12);
    const d = [-0.3, 0.1, 0.001, -0.002, 0.02];
    for (const [x, y] of [[0, 0], [0.4, -0.3], [-0.6, 0.45], [0.1, 0.05]]) near(V.undistortPoint(...V.distortPoint(x, y, d), d), [x, y], 1e-9);
    // The same lens seen through projectPoint: a barrel distortion pulls points towards the center
    const straight = V.projectPoint(CAMERA, [1, -0.5, 0]), bent = V.projectPoint({ ...CAMERA, distortion: [-0.3, 0, 0, 0, 0] }, [1, -0.5, 0]);
    assert.ok(bent[0] < straight[0] && bent[0] > CAMERA.cx);
});

test('windows and projection matrix: the picture without distortion, the wider ideal image with it', () => {
    const T = loadTeleplot();
    const V = T.view.ViewImage;
    const win = V.imageWindow(CAMERA);
    assert.deepEqual(win, { u0: -0.5, v0: -0.5, u1: 639.5, v1: 479.5 });
    assert.deepEqual(V.idealWindow(CAMERA), win, 'no distortion: the picture');

    // Matrix (column after column) applied to a point of a camera looking along -z, y up: x right = -left, y up = up, z = -forward
    const project = (matrix, w, [forward, left, up]) => {
        const p = [-left, up, -forward, 1];
        const clip = [0, 1, 2, 3].map(row => matrix[row] * p[0] + matrix[4 + row] * p[1] + matrix[8 + row] * p[2] + matrix[12 + row] * p[3]);
        return [(clip[0] / clip[3] + 1) / 2 * (w.u1 - w.u0) + w.u0, (1 - clip[1] / clip[3]) / 2 * (w.v1 - w.v0) + w.v0, clip[2] / clip[3]];
    };
    const matrix = V.projectionMatrix(CAMERA, win, 0.1, 100);
    for (const point of [[3, 0, 0], [2, 0.5, 0.3], [5, -1.2, -0.8]]) {
        const [u, v, depth] = project(matrix, win, point);
        near([u, v], V.projectPoint(CAMERA, point), 1e-9);
        assert.ok(depth > -1 && depth < 1);
    }
    near([project(matrix, win, [0.1, 0, 0])[2], project(matrix, win, [100, 0, 0])[2]], [-1, 1], 1e-9); // near and far planes

    // Barrel distortion: the lens brings into the picture things that an ideal camera would see outside of it
    const barrel = { ...CAMERA, distortion: [-0.3, 0.1, 0, 0, 0] };
    const wide = V.idealWindow(barrel);
    assert.ok(wide.u0 < win.u0 && wide.v0 < win.v0 && wide.u1 > win.u1 && wide.v1 > win.v1);
    // Every pixel of the border of the picture comes from inside that window
    for (const [u, v] of [[-0.5, -0.5], [639.5, 479.5], [320, -0.5], [-0.5, 240]]) {
        const [x, y] = V.undistortPoint((u - barrel.cx) / barrel.fx, (v - barrel.cy) / barrel.fy, barrel.distortion);
        const iu = barrel.fx * x + barrel.cx, iv = barrel.fy * y + barrel.cy;
        assert.ok(iu >= wide.u0 - 1e-6 && iu <= wide.u1 + 1e-6 && iv >= wide.v0 - 1e-6 && iv <= wide.v1 + 1e-6);
    }
    // The ideal camera drawing that window agrees with the pinhole model on it
    near(project(V.projectionMatrix(barrel, wide, 0.1, 100), wide, [2, 0.5, 0.3]).slice(0, 2), V.projectPoint(CAMERA, [2, 0.5, 0.3]), 1e-9);
    // Coefficients that make no sense never ask for more than 3 times the picture
    const mad = V.idealWindow({ ...CAMERA, distortion: [50, 0, 0, 0, 0] }), huge = V.idealWindow({ ...CAMERA, distortion: [-5, 0, 0, 0, 0] });
    for (const w of [mad, huge]) assert.ok(w.u0 >= -640.5 && w.u1 <= 1279.5 && w.v0 >= -480.5 && w.v1 <= 959.5 && w.u0 <= win.u0 && w.u1 >= win.u1);
});

test('image view: suggested for images, shows the first image telemetry, the others are drawn over it', () => {
    const T = loadTeleplot();
    T.parseDataText({ data: 'JPG|cam:1000:AAAA\n3D|cam:1000:K:500:480:300.5:250.25:640:480\n3D|box:S:cube:P:2:0:0\npath:1:2:3|xyz\nPNG|other:1000:BBBB\nnumber:1', timestamp: 0 });
    assert.deepEqual(['cam', 'other', 'box'].map(T.view.suggestViewType), ['image', 'image', '3d']);

    const view = T.view.createView('image', ['number', 'box', 'cam', 'path', 'other'], 'g');
    assert.equal(view.type, 'teleplot-image');
    assert.equal(view.getImageTelemetry().id, T.datastore.getTelemetry('cam').id);
    assert.deepEqual(view.getOptionsSchema().map(o => o.key), ['outline', 'outlineWidth', 'overlayOpacity', 'pixelDrawings', 'colormap', 'valueRange', 'displayColorScale', 'cameras', 'cameraCones', 'displayLegend', 'displayNumberDecimals', 'trailLength', 'pointSize', 'pointColorByHeight', 'cloudCount', 'cloudInterval', 'depthPoints']);
    const { sources } = view.__collectSources(1, view.getImageTelemetry());
    assert.deepEqual(sources.map(s => [s.telem.getAttribute(T.protocol.TELEM_ATTR_NAME), s.kind]), [['box', 'shape'], ['path', 'point']], 'the picture is not drawn over itself, images without camera and numbers are not 3D');

    assert.equal(view.getOption('outline'), true, 'outlines by default: the picture stays visible');
    view.setOption('overlayOpacity', 40); view.setOption('outline', false);
    const copy = view.clone();
    assert.ok(copy instanceof T.view.ViewImage);
    assert.deepEqual([copy.getOption('overlayOpacity'), copy.getOption('outline'), copy.getOption('outlineWidth')], [40, false, 3]);
    assert.equal(new T.view.ViewImage('', ['box']).getEmptyState().text, 'Nothing to display', 'shapes alone: there is no picture');
    assert.equal(new T.view.ViewImage('', ['cam']).getEmptyState().text, '');

    // In a 3D scene the camera is drawn too (as a pyramid), like shapes and points
    const scene = T.view.createView('3d', ['cam', 'box'], 'g');
    assert.deepEqual(scene.__collectSources(-1).sources.map(s => s.kind), ['camera', 'shape']);
});

test('image view with several pictures: the first one shown, a filmstrip of all of them, a click shows one, Shift+click adds or takes away', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    T.parseDataText({ data: 'JPG|cam:1000:AAAA\n3D|cam:1000:K:500:480:300.5:250.25:640:480\n3D|box:S:cube:P:2:0:0\n2D|found:S:rect:P:10:10:FPX:cam\nnumber:1', timestamp: 0 });
    const view = T.view.createView('image', ['box', 'cam'], 'g');
    const id = (name) => T.datastore.getTelemetry(name).id;
    const names = (list) => list.map((t) => t.getAttribute(P.TELEM_ATTR_NAME));
    view.update();
    assert.deepEqual(view.state.shown.map((p) => p.id), [id('cam')]);
    assert.deepEqual(view.state.strip, [], 'one picture: no filmstrip');
    assert.deepEqual([...view.frames.keys()], ['shown:' + id('cam')]);
    assert.ok(Array.from(view.telemetryIdOrNameList).includes(id('found')), 'what is drawn in the pixels of a picture is taken by the view (in its legend)');

    // Two more pictures arrive: the first one stays alone, the filmstrip lists the three of them
    T.parseDataText({ data: 'RAW|depth:1000:' + Buffer.from([2, 0, 1, 0, 0, 0, 0, 0, 0xe8, 3, 0xd0, 7]).toString('base64') + '\nPNG|rear:1000:BBBB', timestamp: 0 });
    view.addTelemetry(id('depth')); view.addTelemetry(id('rear'));
    view.update();
    assert.deepEqual(names(view.getPictureTelemetries()), ['cam', 'depth', 'rear']);
    assert.deepEqual(view.state.shown.map((p) => p.id), [id('cam')]);
    assert.deepEqual(view.state.strip.map((p) => [p.name, p.selected]), [['cam', true], ['depth', false], ['rear', false]]);
    assert.deepEqual(T.view.ViewImage.shortNames(['robot.camera', 'robot.depth']), ['camera', 'depth'], 'thumbnails: without the beginning they share');
    assert.deepEqual(T.view.ViewImage.shortNames(['cam', 'cam2']), ['cam', 'cam2']);
    assert.deepEqual([...view.frames.keys()].sort(), ['shown:' + id('cam'), 'strip:' + id('cam'), 'strip:' + id('depth'), 'strip:' + id('rear')].sort());
    const thumb = view.frames.get('strip:' + id('depth'));
    assert.deepEqual([thumb.chrome, thumb.overlays], [false, false], 'a thumbnail: the picture alone');

    // A click shows that one alone; Shift+click adds one after the others, in the order of the clicks, or takes one away (one always stays)
    view.choosePicture(id('depth'));
    assert.deepEqual(Array.from(view.getOption('show')), ['depth']);
    view.choosePicture(id('cam'), true);
    assert.deepEqual(Array.from(view.getOption('show')), ['depth', 'cam'], 'in the order of the clicks');
    view.update();
    assert.deepEqual(view.state.shown.map((p) => p.id), [id('depth'), id('cam')]);
    assert.deepEqual(view.state.strip.map((p) => [p.name, p.order]), [['cam', 2], ['depth', 1], ['rear', 0]], 'the thumbnails say the order');
    assert.ok(view.frames.has('shown:' + id('depth')) && view.frames.has('shown:' + id('cam')));
    view.choosePicture(id('cam'), true); view.choosePicture(id('depth'), true);
    assert.deepEqual(Array.from(view.getOption('show')), ['depth'], 'the last one shown stays');
    view.setOption('show', ['gone']);
    assert.deepEqual(names(view.shownPictures()), ['cam'], 'names that are not pictures of the view: the first picture');

    // The pictures are never drawn over each other; what is in the pixels of a picture only over that one
    view.setOption('show', ['cam', 'depth']); view.update();
    const over = (key) => view.frames.get(key).__collectSources(1, view.frames.get(key).getImageTelemetry()).sources.map((s) => s.telem.getAttribute(P.TELEM_ATTR_NAME));
    assert.deepEqual(over('shown:' + id('cam')), ['box', 'found']);
    assert.deepEqual(over('shown:' + id('depth')), ['box']);
    assert.deepEqual(view.__collectSources(1).sources.map((s) => s.telem.getAttribute(P.TELEM_ATTR_NAME)), ['box', 'found'], 'the legend: what is drawn over the pictures');

    // Kept with the dashboard: show=cam,depth
    const dashboard = T.dashboards.getOrCreateDashboard('Pics');
    dashboard.setView(new T.view.ViewLayout('', dashboard.getGroupName()));
    dashboard.getView().addView(view);
    const text = T.dashboards.exportText('Pics');
    assert.match(text, /\|show=cam,depth/);
    const copy = T.dashboards.importText(text).dashboards[0];
    assert.deepEqual(Array.from(T.dashboards.getDashboard(copy).getView().views[0].getOption('show')), ['cam', 'depth']);
    view.dispose();
    assert.equal(view.frames.size, 0, 'disposed with the view');
});

test('values view: a picture line is drawn by a PictureFrame, with the drawings in its pixels and the 3D telemetries the view lists', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    T.parseDataText({ data: 'JPG|cam:1000:AAAA\n3D|cam:1000:K:500:480:300.5:250.25:640:480\n3D|box:S:cube:P:2:0:0\n3D|wall:S:cube:P:3:0:0\n2D|found:S:rect:P:10:10:FPX:cam\nnumber:1', timestamp: 0 });
    const view = T.view.createView('values', ['number', 'cam', 'box'], 'g');
    assert.deepEqual(view.getOptionsSchema().map((o) => o.key).filter((k) => k === 'colormap' || k === 'valueRange'), ['colormap', 'valueRange']);
    view.update();
    const frame = view.pictureFrames.get(T.datastore.getTelemetry('cam').id);
    assert.ok(frame && frame.chrome === false);
    assert.deepEqual(frame.__collectSources(1, frame.getImageTelemetry()).sources.map((s) => s.telem.getAttribute(P.TELEM_ATTR_NAME)), ['box', 'found'], 'wall is not listed: not drawn');
    assert.deepEqual(view.displayOrder.map((id) => T.datastore.getTelemetry(id).getAttribute(P.TELEM_ATTR_NAME)), ['number', 'cam', 'box'], 'a picture is one more line, in the order of the view');
    view.setOption('valueRange', 'picture'); view.update();
    assert.equal(frame.options.valueRange, 'picture', 'the options of the view reach its pictures');
});

test('the color scale of a depth map moves to another corner when it would hide the pixel under the pointer', () => {
    const T = loadTeleplot();
    const corner = T.view.PictureFrame.scaleCorner;
    const place = { left: 0, top: 0, right: 400, bottom: 300 };
    const scale = { left: 290, top: 280, right: 390, bottom: 295 };  // bottom right, 10 px from the right, 5 from the bottom
    assert.equal(corner({ x: 100, y: 100 }, scale, place), 'br', 'the pointer elsewhere: it stays');
    assert.equal(corner({ x: 300, y: 290 }, scale, place), 'bl', 'under it: bottom left');
    const left = { left: 10, top: 280, right: 110, bottom: 295 };   // (now bottom left)
    assert.equal(corner({ x: 300, y: 290 }, left, place, 'bl'), 'bl', 'it stays where it went while the pointer is not under it');
    assert.equal(corner({ x: 50, y: 290 }, left, place, 'bl'), 'br', 'under it again: the first free corner');
    assert.equal(corner({ x: 393, y: 277 }, scale, place), 'bl', 'a few pixels around it count');
    const wide = { left: 5, top: 280, right: 395, bottom: 295 };    // as wide as the picture: the bottom is never free
    assert.equal(corner({ x: 200, y: 290 }, wide, place), 'tr');
});

test('image view, cameras "over": the first picture selected is the base, depth cameras go over every picture shown, plain pictures stay beside', () => {
    const T = loadTeleplot();
    const P = T.protocol;
    const raw = 'RAW|depth:1000:' + Buffer.from([2, 0, 1, 0, 0, 0, 0, 0, 0xe8, 3, 0xd0, 7]).toString('base64');
    T.parseDataText({ data: ['JPG|cam:1000:AAAA', '3D|cam:1000:K:500:480:300.5:250.25:640:480', raw, '3D|depth:1000:K:2:2:0.5:0:2:1:P:0:0.05:0',
        'JPG|cam2:1000:AAAA', '3D|cam2:1000:K:500:480:300.5:250.25:640:480:P:0:-1:0', 'PNG|plan:1000:BBBB', '3D|box:S:cube:P:2:0:0'].join('\n'), timestamp: 0 });
    const view = T.view.createView('image', ['cam', 'depth', 'cam2', 'plan', 'box'], 'g');
    const id = (name) => T.datastore.getTelemetry(name).id;
    const names = (list) => list.map((t) => t.getAttribute(P.TELEM_ATTR_NAME));
    const drawn = (name) => { const f = view.frames.get('shown:' + id(name)); return f.__collectSources(1, f.getImageTelemetry()).sources.map((s) => s.telem.getAttribute(P.TELEM_ATTR_NAME)); };
    assert.equal(view.getOption('cameras'), 'beside', 'beside by default');
    assert.deepEqual([view.getOption('cameraCones'), T.view.createView('3d', [], 'g').getOption('cameraCones')], [false, true], 'cones: hidden over pictures, shown in a scene');
    assert.deepEqual([T.view.ViewImage.drawsOver(T.datastore.getTelemetry('depth')), T.view.ViewImage.drawsOver(T.datastore.getTelemetry('cam'))], [true, false]);

    view.setOption('show', ['cam', 'depth', 'cam2']);
    view.update();
    assert.deepEqual(names(view.shownPictures()), ['cam', 'depth', 'cam2'], 'beside: all of them');
    assert.deepEqual(drawn('cam'), ['box'], 'beside: no picture is drawn over another');

    assert.deepEqual([view.getOption('outline'), view.getOption('overlayOpacity')], [true, 50], 'outlines, half opaque, by default');
    view.toggleOutline();
    view.update();
    assert.deepEqual([view.getOption('outline'), view.state.outline], [false, false], 'the other toggle of the filmstrip: the objects whole');
    view.toggleOutline();
    view.toggleCameras();
    assert.equal(view.getOption('cameras'), 'over');
    view.update();
    assert.deepEqual(names(view.shownPictures()), ['cam', 'cam2'], 'over: the base, and the plain picture beside it');
    assert.deepEqual(view.state.strip.filter((t) => t.over).map((t) => t.name), ['depth'], 'its thumbnail says it is drawn over');
    assert.deepEqual(drawn('cam'), ['depth', 'cam2', 'box'], 'the other cameras of the selection, its own picture never');
    assert.deepEqual(drawn('cam2'), ['cam', 'depth', 'box'], 'the picture beside gets them too (A)');
    assert.ok(!drawn('cam').includes('plan'), 'a picture that is not selected is not drawn');

    view.setOption('show', ['depth', 'cam']);
    view.update();
    assert.deepEqual(names(view.shownPictures()), ['depth', 'cam'], 'a depth map first is the base: shown, as a picture');
    assert.deepEqual(drawn('cam'), ['depth', 'box'], 'and its points go over the color picture beside it');
    view.setOption('show', ['cam', 'plan']);
    view.update();
    assert.deepEqual(names(view.shownPictures()), ['cam', 'plan'], 'a picture without camera is beside');
    assert.equal(T.view.ViewScene3D.cameraState(T.datastore.getTelemetry('plan')), undefined, 'it has no camera: nothing 3D can be drawn over it');
    view.dispose();
});
