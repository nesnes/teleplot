/*
 * 2D view: the telemetries of a scene seen from above, without perspective. A map: same scale on both axes, a grid with its units,
 * drag to move, wheel to zoom, double click to frame everything again.
 * - It shows the same telemetries as the 3D view (113), and 2D ones are 3D ones with z = 0: nothing is sent twice. Flat shapes
 *   (rect, circle, line, polygon, arrow, text), 2D numbers (a position, with the trail of where it went: an XY plot) and flat point
 *   clouds (a 2D scan) are drawn as they are. Solids are drawn as what they cover on the ground (a cube: its footprint, a sphere: a
 *   circle...), clouds as their points, cameras as the triangle of what they see. Only the drawing drops z: the data is untouched.
 * - What is higher is drawn over what is lower. A rectangle with a texture (an url, or the pictures of an image telemetry) is a
 *   background: a floor plan, a field. An image telemetry that is given a place and a size (a "2D|" line on its own name) is drawn
 *   there itself: a map that a robot builds and sends as pictures.
 * - Widths: a line with a width (in the units of its frame) is drawn at that width, never thinner than a pixel; without, as thin
 *   as the screen draws, at any zoom. Same for texts: a height in units, or a steady size on the screen.
 * - Which way it is seen is chosen with two options: the axis that points to the right and the one that points up, each x, y or z, or
 *   their opposite. x right and y up (the default) is the scene from above; x up and -y right puts what is in front of a robot at the
 *   top; y right and x up is north up, east right; x right and z up is a side view. What is nearer to the viewer is drawn over the rest.
 * - Like the other views it follows the cursor of its group, and its legend is the one of the 3D view.
 * Drawn with a plain 2D canvas (no WebGL). What is drawn is first computed as a list of items (buildItems), without any canvas: that
 * part is unit tested. The image view (114) uses the same items for what is drawn in the pixels of a picture.
 */
class ViewScene2D extends ViewScene3D {
    constructor(divId, telemetryIdOrNameList, group="default"){
        super(divId, telemetryIdOrNameList, group);
        this.name = "2d";
        this.type = "teleplot-2d";
        this.supportedLabel = "2D or 3D";
        this.options.axisRight = "x"; // The axis of the scene that points to the right of the view, and the one that points up:
        this.options.axisUp = "y";    // "x", "y", "z", or "-x", "-y", "-z" for their opposite
        this.layout.width = 2;
        this.layout.height = 6;
        // What part of the scene is on screen: center (in the plane of the view) and pixels per unit. Raw: it changes on every drag.
        this.camera2D = TELEPLOT.Vue.markRaw({ u: 0, v: 0, scale: 50, userMoved: false, content: undefined, framed: undefined });
        this.stl2D = new Map();    // url -> {points (Float32Array, some of its vertices), failed}
        this.images2D = new Map(); // url -> {image, ready}
        this.items = TELEPLOT.Vue.markRaw([]);
        // Commands (doc/telecmd.md): writable poses and points can be moved and turned. editables: what can be, as last drawn;
        // ghost: what the user is placing, before it is sent ({id, at: [u, v], yaw, drag: "move" | "turn" | undefined})
        this.editables = TELEPLOT.Vue.markRaw([]);
        this.lockedEditables = TELEPLOT.Vue.markRaw([]); // What could be placed if commands were on (a press on it says they are off)
        this.ghost = undefined;
        this.pointer = undefined; // Where the pointer is (pixels of the page), to show the handles of what is under it
    }

    getOptionsSchema() {
        return [
            { key: "displayGrid", label: "Grid", type: "bool" },
            { key: "displayAxes", label: "Axes", type: "bool" },
            { key: "axisRight", label: "To the right", type: "choice", choices: ViewScene2D.AXIS_CHOICES },
            { key: "axisUp", label: "To the top", type: "choice", choices: ViewScene2D.AXIS_CHOICES },
            { key: "displayLegend", label: "Legend", type: "bool" },
            { key: "displayNumberDecimals", label: "Decimals", type: "int", min: 0, max: 10, step: 1 },
            { key: "trailLength", label: "Trail length", type: "int", min: 0, max: 100000, step: 50 },
            ...ViewScene3D.CLOUD_OPTIONS_SCHEMA,
        ];
    }

    // ------------------------------------------------------------------ What is drawn (no canvas here)

    static AXIS_CHOICES = [["x", "x"], ["-x", "\u2212x"], ["y", "y"], ["-y", "\u2212y"], ["z", "z"], ["-z", "\u2212z"]];

    // How a view looks at the scene, from the axis that points to its right and the one that points up ("x", "-y"...):
    // {right: [index, sign], up: [index, sign], toward: [x, y, z] (the direction that comes to the viewer)}.
    // Two options that name the same axis cannot make a plane: the second one takes the next axis.
    static axes(right="x", up="y") {
        let read = (name, fallback) => { let match = /^(-?)([xyz])$/.exec(String(name)); return match ? ["xyz".indexOf(match[2]), match[1] ? -1 : 1] : fallback; };
        let r = read(right, [0, 1]), u = read(up, [1, 1]);
        if(u[0] === r[0]) u = [(r[0] + 1) % 3, 1];
        let a = [0, 0, 0], b = [0, 0, 0];
        a[r[0]] = r[1]; b[u[0]] = u[1];
        return { right: r, up: u, toward: [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]] };
    }

    // A point of the scene in the plane of the view: [u, v], u to the right and v to the top
    static project(point, axes) {
        return [axes.right[1] * point[axes.right[0]], axes.up[1] * point[axes.up[0]]];
    }

    // Convex hull of 2D points ([[u, v], ...]), counter clockwise, without repeating the first one
    static hull(points) {
        let sorted = points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        if(sorted.length < 3) return sorted;
        let cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        let lower = [], upper = [];
        for(let p of sorted) { while(lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop(); lower.push(p); }
        for(let i = sorted.length - 1; i >= 0; i--) { let p = sorted[i]; while(upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop(); upper.push(p); }
        lower.pop(); upper.pop();
        return lower.concat(upper);
    }

    // Step of a grid: 1, 2 or 5 times a power of ten, so that "span" holds about "count" of them
    static niceStep(span, count=8) {
        if(!(span > 0)) return 1;
        let raw = span / count, power = Math.pow(10, Math.floor(Math.log10(raw)));
        let ratio = raw / power;
        return (ratio < 1.5 ? 1 : (ratio < 3.5 ? 2 : (ratio < 7.5 ? 5 : 10))) * power;
    }

    // Linear color (0 to 1, in 1024 steps) -> what a screen shows (0 to 255)
    static __screenColors() {
        if(!ViewScene2D.__screenTable) ViewScene2D.__screenTable = Uint8Array.from({ length: 1024 }, (v, i) => Math.round(255 * Math.pow(i / 1023, 1 / 2.2)));
        return ViewScene2D.__screenTable;
    }

    // Points of a solid of size 1 in its own frame, whose hull once projected is what the solid covers: [[x, y, z], ...]
    static solidPoints(type) {
        const P = TELEPLOT.protocol;
        let cached = ViewScene2D.__solids[type];
        if(cached) return cached;
        let points = [], ring = (count, at) => { for(let i = 0; i < count; i++) points.push(at(Math.cos(2 * Math.PI * i / count) / 2, Math.sin(2 * Math.PI * i / count) / 2)); };
        if(type === P.TELEM_ATTR_SHAPE_TYPE_SPHERE) { ring(48, (a, b) => [a, b, 0]); ring(48, (a, b) => [a, 0, b]); ring(48, (a, b) => [0, a, b]); }
        else if(type === P.TELEM_ATTR_SHAPE_TYPE_CYLINDER) { ring(48, (a, b) => [a, b, -0.5]); ring(48, (a, b) => [a, b, 0.5]); }
        else if(type === P.TELEM_ATTR_SHAPE_TYPE_CIRCLE) ring(64, (a, b) => [a, b, 0]);
        else if(type === P.TELEM_ATTR_SHAPE_TYPE_RECT) points = [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]];
        else for(let x of [-0.5, 0.5]) for(let y of [-0.5, 0.5]) for(let z of [-0.5, 0.5]) points.push([x, y, z]); // A cube
        return ViewScene2D.__solids[type] = points;
    }
    static __solids = {};

    /*
     * What to draw for the telemetries of a view at a time: a list of items, in the plane of the view, in the order they are drawn
     * (what is farther from the viewer first). sources: what __collectSources gives. options: {axes (see axes()), pixels (the items are for the pixels of
     * a picture: nothing is flipped nor reordered), trailLength, since, timestamp, pointColorByHeight, stl(url) -> Float32Array of
     * vertices or undefined}.
     * Items: {id, kind, color, opacity, z} and
     *   "polygon": points [[u, v], ...], fill (false: outline only), lineWidth, texture (url, for the 4 corners of a rect)
     *   "line": points, lineWidth (undefined: as thin as the screen draws), closed
     *   "points": positions (Float32Array u, v...), colors (Uint8Array r, g, b... or undefined)
     *   "dot": at [u, v]          "text": at, text, height (undefined: a steady size on screen)
     */
    static buildItems(sources, options={}) {
        const P = TELEPLOT.protocol;
        let axes = options.axes || ViewScene2D.axes();
        let project = options.pixels ? (p) => [p[0], p[1]] : (p) => ViewScene2D.project(p, axes);
        let depth = (p) => p[0] * axes.toward[0] + p[1] * axes.toward[1] + p[2] * axes.toward[2]; // How near the viewer: z, seen from above
        let items = [];
        for(let source of sources) {
            if(source.hidden) continue;
            let telem = source.telem, id = telem.id;
            let fade = source.faded ? 0.15 : 1;
            let place = (pose, local) => { let t = ViewScene3D.rotateVector(pose.quaternion, local); return [pose.position[0] + t[0], pose.position[1] + t[1], pose.position[2] + t[2]]; };

            if(source.kind == "camera") { // The triangle of what it sees
                let camera = source.camera;
                let corners = ViewScene3D.cameraCorners(camera).map((corner) => place(camera, corner));
                items.push({ id, kind: "polygon", points: ViewScene2D.hull(corners.concat([camera.position]).map(project)), fill: false, color: source.color, opacity: fade, z: depth(camera.position) });
                items.push({ id, kind: "dot", at: project(camera.position), color: source.color, opacity: fade, z: depth(camera.position) });
                if(source.depth && source.depth.count) { // Its depth map: the points it measured, seen from above
                    let d = source.depth, count = d.count, out = new Float32Array(count * 2), positions = d.positions;
                    let origin = project(camera.position);
                    let ex = project(ViewScene3D.rotateVector(camera.quaternion, [1, 0, 0])), ey = project(ViewScene3D.rotateVector(camera.quaternion, [0, 1, 0])), ez = project(ViewScene3D.rotateVector(camera.quaternion, [0, 0, 1]));
                    for(let i = 0, at = 0; i < count; i++, at += 3) {
                        let x = positions[at], y = positions[at+1], z = positions[at+2];
                        out[i*2] = origin[0] + ex[0] * x + ey[0] * y + ez[0] * z;
                        out[i*2+1] = origin[1] + ex[1] * x + ey[1] * y + ez[1] * z;
                    }
                    items.push({ id, kind: "points", positions: out, colors: d.colors.subarray(0, count * 3), color: source.color, opacity: fade, z: depth(camera.position) - 1e-9 });
                }
            }
            else if(source.kind == "cloud") {
                let entry = telem.data[P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD];
                source.clouds.forEach((index, n) => {
                    let positions = entry.data[0][index], pose = source.poses[n];
                    let count = positions.length / 3, out = new Float32Array(count * 2);
                    // Clouds can be large: the pose and the projection are worked out once, as the two lines of a matrix (u and v from x, y, z)
                    let origin = project(pose.position);
                    let ex = project(ViewScene3D.rotateVector(pose.quaternion, [1, 0, 0])), ey = project(ViewScene3D.rotateVector(pose.quaternion, [0, 1, 0])), ez = project(ViewScene3D.rotateVector(pose.quaternion, [0, 0, 1]));
                    for(let i = 0, at = 0; i < count; i++, at += 3) {
                        let x = positions[at], y = positions[at+1], z = positions[at+2];
                        out[i*2] = origin[0] + ex[0] * x + ey[0] * y + ez[0] * z;
                        out[i*2+1] = origin[1] + ex[1] * x + ey[1] * y + ez[1] * z;
                    }
                    let byHeight = !!options.pointColorByHeight, colors = undefined;
                    if(!byHeight && entry.data[2][index]) colors = entry.data[2][index]; // Their own colors, as they were sent
                    else {
                        let own = ViewScene3D.cloudColors(positions, entry.data[1][index], null, byHeight);
                        if(own) { colors = new Uint8Array(count * 3); let table = ViewScene2D.__screenColors(); for(let i = 0; i < own.length; i++) colors[i] = table[Math.max(0, Math.min(1023, (own[i] * 1023) | 0))]; } // (linear, as renderers take them: back to what screens show)
                    }
                    items.push({ id, kind: "points", positions: out, colors, color: source.color, opacity: fade, z: depth(pose.position) });
                });
            }
            else if(source.kind == "point" && ViewScene2D.isPose(telem)) { // A pose (x, y, yaw: a writable pose2d): where it is and which way it looks
                let entry = ViewScene3D.pointEntry(telem);
                let index = ViewScene3D.sampleIndex(entry, options.timestamp);
                if(index < 0) continue;
                let pose = ViewScene2D.poseAt(entry, index);
                let at = project([pose[0], pose[1], 0]), ahead = project([pose[0] + Math.cos(pose[2]), pose[1] + Math.sin(pose[2]), 0]);
                items.push({ id, kind: "pose", at, dir: [ahead[0] - at[0], ahead[1] - at[1]], color: source.color, opacity: fade, z: 0 });
            }
            else if(source.kind == "point") {
                let entry = ViewScene3D.pointEntry(telem);
                let range = ViewScene3D.trailRange(entry, options.timestamp, options.trailLength, options.since);
                if(!range) continue;
                let world = ViewScene3D.pointPositions(telem, entry, range.from, range.to);
                let points = ViewScene3D.pointList(world).map(project), z = depth(Array.from(world.subarray(world.length - 3)));
                if(points.length > 1) items.push({ id, kind: "line", points, lineWidth: undefined, closed: false, color: source.color, opacity: 0.7 * fade, z });
                items.push({ id, kind: "dot", at: points[points.length - 1], color: source.color, opacity: fade, z });
            }
            else {
                let state = source.state, type = state.type, z = depth(state.position);
                let common = { id, color: state.color, opacity: state.opacity * fade, z };
                if(type === P.TELEM_ATTR_SHAPE_TYPE_LINE || type === P.TELEM_ATTR_SHAPE_TYPE_POLYGON) {
                    let points = ViewScene3D.pointList(state.points).map((p) => project(place(state, p)));
                    if(type === P.TELEM_ATTR_SHAPE_TYPE_POLYGON && points.length >= 3) items.push(Object.assign({ kind: "polygon", points, fill: true, lineWidth: state.lineWidth }, common));
                    else if(points.length >= 2) items.push(Object.assign({ kind: "line", points, lineWidth: state.lineWidth, closed: false }, common));
                }
                else if(type === P.TELEM_ATTR_SHAPE_TYPE_ARROW) {
                    let local = ViewScene3D.rotateVector([state.quaternion[0], -state.quaternion[1], -state.quaternion[2], -state.quaternion[3]], state.vector);
                    for(let segment of ViewScene3D.arrowSegments(local)) items.push(Object.assign({ kind: "line", points: segment.map((p) => project(place(state, p))), lineWidth: state.lineWidth, closed: false }, common));
                }
                else if(type === P.TELEM_ATTR_SHAPE_TYPE_TEXT) {
                    if(state.text !== "") items.push(Object.assign({ kind: "text", at: project(state.position), text: state.text, height: state.sized ? state.size[1] : undefined }, common));
                }
                else {
                    let local = type === P.TELEM_ATTR_SHAPE_TYPE_STL ? ViewScene3D.pointList(options.stl ? options.stl(state.url) : undefined) : ViewScene2D.solidPoints(type);
                    if(!local.length) continue; // (an STL file that is not loaded)
                    let size = state.size;
                    let points = local.map((p) => project(place(state, [p[0] * size[0], p[1] * size[1], p[2] * size[2]])));
                    let flat = type === P.TELEM_ATTR_SHAPE_TYPE_RECT || type === P.TELEM_ATTR_SHAPE_TYPE_CIRCLE;
                    let item = Object.assign({ kind: "polygon", points: flat ? points : ViewScene2D.hull(points), fill: true, lineWidth: state.lineWidth }, common);
                    if(type === P.TELEM_ATTR_SHAPE_TYPE_RECT && source.textureUrl) item.texture = source.textureUrl; // Its 4 corners: bottom left, bottom right, top right, top left
                    items.push(item);
                }
            }
        }
        if(!options.pixels) {
            // What is farther first; a textured rectangle (a floor plan) under what is at its height
            let rank = (item) => (item.texture ? 0 : 1);
            items = items.map((item, index) => ({ item, index })).sort((a, b) => (a.item.z - b.item.z) || (rank(a.item) - rank(b.item)) || (a.index - b.index)).map((entry) => entry.item);
        }
        return items;
    }

    // A telemetry whose three numbers are a pose (x, y, yaw), not a point: a pose2d setting (doc/telecmd.md)
    static isPose(telem) {
        let declaration = TELEPLOT.commands.declaration(telem);
        return declaration !== undefined && declaration.type === "pose2d" && telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D] !== undefined;
    }
    static poseAt(entry, index) {
        return [Number(entry.data[0][index]) || 0, Number(entry.data[1][index]) || 0, entry.data[2] ? Number(entry.data[2][index]) || 0 : 0];
    }

    // The value a setting gets from where its ghost was placed: [x, y] or [x, y, yaw], rounded to the millimeter / milliradian
    static ghostValue(type, at, yaw, axes) {
        let world = [0, 0, 0];
        world[axes.right[0]] = at[0] * axes.right[1];
        world[axes.up[0]] = at[1] * axes.up[1];
        let r = (v) => Math.round(v * 1000) / 1000 + 0;
        return type === "pose2d" ? [r(world[0]), r(world[1]), r(yaw)] : [r(world[0]), r(world[1])];
    }

    // The yaw of a direction on screen (du, dv in the plane of the view) in the scene, for the default and the other ways of looking
    static yawOf(du, dv, axes) {
        let world = [0, 0, 0];
        world[axes.right[0]] = du * axes.right[1];
        world[axes.up[0]] = dv * axes.up[1];
        return Math.atan2(world[1], world[0]);
    }

    // Box around items, in the plane of the view: {min: [u, v], max: [u, v]}, undefined when there is nothing
    static itemsBounds(items) {
        let min = [Infinity, Infinity], max = [-Infinity, -Infinity];
        let add = (u, v) => { if(!Number.isFinite(u) || !Number.isFinite(v)) return; if(u < min[0]) min[0] = u; if(v < min[1]) min[1] = v; if(u > max[0]) max[0] = u; if(v > max[1]) max[1] = v; };
        for(let item of items) {
            if(item.kind == "points") for(let i = 0; i + 1 < item.positions.length; i += 2) add(item.positions[i], item.positions[i+1]);
            else if(item.at) add(item.at[0], item.at[1]);
            else for(let p of item.points) add(p[0], p[1]);
        }
        return min[0] <= max[0] ? { min, max } : undefined;
    }

    // Center and scale (pixels per unit) that show a box in a view of a size, with some room around
    static fit(bounds, width, height, margin=0.1) {
        let du = Math.max(bounds.max[0] - bounds.min[0], 1e-9), dv = Math.max(bounds.max[1] - bounds.min[1], 1e-9);
        let scale = Math.min(width / du, height / dv) / (1 + 2 * margin);
        return { u: (bounds.min[0] + bounds.max[0]) / 2, v: (bounds.min[1] + bounds.max[1]) / 2, scale: scale > 0 && Number.isFinite(scale) ? scale : 1 };
    }

    // ------------------------------------------------------------------ Drawing

    // Draws items on a 2D canvas context. view: {width, height (pixels of the page), u, v (what is at the center), scale (pixels per
    // unit), down (v goes down: the pixels of a picture)}. images(url) gives a loaded image, or undefined (it is asked for, and the
    // view draws again once it is there).
    static draw(context, items, view, images, pointSize=3) {
        let sx = (u) => view.width / 2 + (u - view.u) * view.scale;
        let sy = view.down ? (v) => view.height / 2 + (v - view.v) * view.scale : (v) => view.height / 2 - (v - view.v) * view.scale;
        let trace = (points, closed) => {
            context.beginPath();
            points.forEach((p, i) => { if(i == 0) context.moveTo(sx(p[0]), sy(p[1])); else context.lineTo(sx(p[0]), sy(p[1])); });
            if(closed) context.closePath();
        };
        let stroke = (item) => {
            context.lineWidth = item.lineWidth !== undefined ? Math.max(1, item.lineWidth * view.scale) : 1.5; // A width that was given, never thinner than a pixel
            context.lineJoin = "round"; context.lineCap = "round";
            context.stroke();
        };
        for(let item of items) {
            context.globalAlpha = Math.max(0, Math.min(1, item.opacity));
            context.fillStyle = context.strokeStyle = item.color;
            if(item.kind == "polygon") {
                let image = item.texture && item.points.length == 4 && images ? images(item.texture) : undefined;
                if(image) { // The picture, laid on the rectangle (whatever its orientation): from its top left corner, along its top and left sides
                    let [bl, br, , tl] = item.points.map((p) => [sx(p[0]), sy(p[1])]);
                    context.save();
                    context.transform((br[0] - bl[0]) / image.width, (br[1] - bl[1]) / image.width, (bl[0] - tl[0]) / image.height, (bl[1] - tl[1]) / image.height, tl[0], tl[1]);
                    context.drawImage(image, 0, 0);
                    context.restore();
                }
                else if(item.texture) { trace(item.points, true); stroke(item); } // Its picture is not there (yet): where it will be
                else if(item.fill) {
                    trace(item.points, true);
                    context.fill();
                    if(item.lineWidth !== undefined || item.opacity < 1) { context.globalAlpha = Math.min(1, item.opacity < 1 ? Math.max(item.opacity, 0.15) * 2.5 : 1); stroke(item); } // (what is see-through keeps a clear edge)
                }
                else { trace(item.points, true); stroke(item); }
            }
            else if(item.kind == "line") { trace(item.points, item.closed); stroke(item); }
            else if(item.kind == "pose") { // A dot and an arrow along the heading, of a steady size on screen
                let x = sx(item.at[0]), y = sy(item.at[1]);
                let length = Math.hypot(item.dir[0], item.dir[1]) || 1, dx = item.dir[0] / length, dy = (view.down ? 1 : -1) * item.dir[1] / length;
                ViewScene2D.drawPose(context, x, y, dx, dy, item.dashed);
            }
            else if(item.kind == "dot") {
                context.beginPath();
                context.arc(sx(item.at[0]), sy(item.at[1]), 4.5, 0, 2 * Math.PI);
                context.fill();
            }
            else if(item.kind == "points" && item.positions.length > 2 * ViewScene2D.POINTS_BY_PIXELS && typeof ImageData === "function") {
                ViewScene2D.drawPoints(context, item, view, sx, sy, pointSize);
            }
            else if(item.kind == "points") {
                let size = Math.max(1, pointSize), half = size / 2, positions = item.positions, colors = item.colors;
                for(let i = 0, n = 0; i + 1 < positions.length; i += 2, n += 3) {
                    if(colors) context.fillStyle = "rgb(" + colors[n] + "," + colors[n+1] + "," + colors[n+2] + ")";
                    context.fillRect(sx(positions[i]) - half, sy(positions[i+1]) - half, size, size);
                }
            }
            else if(item.kind == "text") {
                let px = item.height !== undefined ? Math.max(4, item.height * view.scale) : 13; // A height that was given, or a steady size
                context.font = "600 " + px + "px system-ui, sans-serif";
                context.textBaseline = "middle";
                context.fillText(item.text, sx(item.at[0]), sy(item.at[1]));
            }
        }
        context.globalAlpha = 1;
    }

    // A pose glyph at a place of the page, looking along (dx, dy) (pixels, y down)
    static drawPose(context, x, y, dx, dy, dashed=false) {
        const LENGTH = 24, HEAD = 7;
        context.beginPath();
        context.arc(x, y, 5, 0, 2 * Math.PI);
        if(dashed) { context.setLineDash([3, 2]); context.lineWidth = 1.5; context.stroke(); } else context.fill();
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + dx * LENGTH, y + dy * LENGTH);
        context.lineWidth = 2.2; context.lineCap = "round";
        context.stroke();
        context.setLineDash([]);
        context.beginPath();
        let tx = x + dx * LENGTH, ty = y + dy * LENGTH;
        context.moveTo(tx, ty);
        context.lineTo(tx - dx * HEAD - dy * HEAD * 0.6, ty - dy * HEAD + dx * HEAD * 0.6);
        context.lineTo(tx - dx * HEAD + dy * HEAD * 0.6, ty - dy * HEAD - dx * HEAD * 0.6);
        context.closePath();
        context.fill();
    }

    // Many points (a large cloud): written pixel by pixel in a picture of the size of the canvas, which is then laid over what is
    // already drawn. Much faster than a rectangle per point, for the same result.
    static POINTS_BY_PIXELS = 3000;
    static drawPoints(context, item, view, sx, sy, pointSize) {
        let canvas = context.canvas, width = canvas.width, height = canvas.height;
        let ratio = width / view.width;
        let layer = canvas.__teleplotPoints;
        if(!layer || layer.canvas.width !== width || layer.canvas.height !== height) {
            let own = document.createElement("canvas");
            own.width = width; own.height = height;
            layer = canvas.__teleplotPoints = { canvas: own, context: own.getContext("2d") };
        }
        let image = layer.context.createImageData(width, height), pixels = image.data;
        let size = Math.max(1, Math.round(Math.max(1, pointSize) * ratio)), half = size / 2;
        let positions = item.positions, colors = item.colors;
        let base = [0, 0, 0];
        if(!colors) { // The color of the telemetry, read back from the canvas (any CSS color)
            layer.context.clearRect(0, 0, 1, 1);
            layer.context.fillStyle = item.color;
            layer.context.fillRect(0, 0, 1, 1);
            base = Array.from(layer.context.getImageData(0, 0, 1, 1).data.subarray(0, 3));
        }
        for(let i = 0, n = 0; i + 1 < positions.length; i += 2, n += 3) {
            let x0 = Math.round(sx(positions[i]) * ratio - half), y0 = Math.round(sy(positions[i+1]) * ratio - half);
            if(x0 + size <= 0 || y0 + size <= 0 || x0 >= width || y0 >= height) continue;
            let r = colors ? colors[n] : base[0], g = colors ? colors[n+1] : base[1], b = colors ? colors[n+2] : base[2];
            for(let y = Math.max(0, y0), yEnd = Math.min(height, y0 + size); y < yEnd; y++) {
                for(let x = Math.max(0, x0), at = (y * width + x) * 4, xEnd = Math.min(width, x0 + size); x < xEnd; x++, at += 4) {
                    pixels[at] = r; pixels[at+1] = g; pixels[at+2] = b; pixels[at+3] = 255;
                }
            }
        }
        layer.context.putImageData(image, 0, 0);
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(layer.canvas, 0, 0);
        context.restore();
    }

    // Grid (lines every 1, 2 or 5 x 10^n units, with their values along the edges) and the axes of the scene that lie in the plane of
    // the view (x red, y green, z blue, from the origin). "looking": how the view looks at the scene (see axes()).
    static drawGrid(context, view, style, looking, grid=true, axes=true) {
        looking = looking || ViewScene2D.axes();
        let step = ViewScene2D.niceStep(Math.max(view.width, view.height) / view.scale, 8);
        let sx = (u) => view.width / 2 + (u - view.u) * view.scale, sy = (v) => view.height / 2 - (v - view.v) * view.scale;
        let left = view.u - view.width / 2 / view.scale, right = view.u + view.width / 2 / view.scale;
        let bottom = view.v - view.height / 2 / view.scale, top = view.v + view.height / 2 / view.scale;
        let decimals = Math.max(0, -Math.floor(Math.log10(step)));
        let text = (value) => (Math.abs(value) < step / 2 ? 0 : value).toFixed(Math.min(decimals, 8));
        if(grid) {
            context.lineWidth = 1;
            context.font = "11px system-ui, sans-serif";
            context.textBaseline = "alphabetic";
            for(let n = Math.ceil(left / step); n * step <= right; n++) {
                let x = Math.round(sx(n * step)) + 0.5;
                context.strokeStyle = n == 0 ? style.strong : style.line;
                context.beginPath(); context.moveTo(x, 0); context.lineTo(x, view.height); context.stroke();
                context.fillStyle = style.muted;
                context.fillText(text(looking.right[1] * n * step), x + 3, view.height - 4); // (the value on the axis of the scene: reversed when the axis is)
            }
            for(let n = Math.ceil(bottom / step); n * step <= top; n++) {
                let y = Math.round(sy(n * step)) + 0.5;
                context.strokeStyle = n == 0 ? style.strong : style.line;
                context.beginPath(); context.moveTo(0, y); context.lineTo(view.width, y); context.stroke();
                context.fillStyle = style.muted;
                if(y < view.height - 16 && y > 34) context.fillText(text(looking.up[1] * n * step), 4, y - 3); // (not under the legend, nor over the values of the other axis)
            }
        }
        if(axes) {
            let length = step * view.scale, ox = sx(0), oy = sy(0);
            let axis = (du, dv, color, name) => {
                context.strokeStyle = context.fillStyle = color;
                context.lineWidth = 2;
                context.beginPath(); context.moveTo(ox, oy); context.lineTo(ox + du * length, oy - dv * length); context.stroke();
                context.font = "600 11px system-ui, sans-serif";
                context.textBaseline = "middle";
                context.fillText(name, ox + du * length + (du ? 4 : -3) + (du < 0 ? -14 : 0), oy - dv * length - (dv ? 8 : 0));
            };
            const NAMES = ["x", "y", "z"], COLORS = ["#d33", "#2a2", "#27f"];
            axis(looking.right[1], 0, COLORS[looking.right[0]], NAMES[looking.right[0]]);
            axis(0, looking.up[1], COLORS[looking.up[0]], NAMES[looking.up[0]]);
        }
    }

    // ------------------------------------------------------------------ Page

    __mounted(element) {
        let host = element.querySelector(".teleplot-js-scene3d-canvas");
        let canvas = document.createElement("canvas");
        host.appendChild(canvas);
        let page = TELEPLOT.Vue.markRaw({ host, canvas, context: canvas.getContext("2d"), width: 0, height: 0, frame: 0, observer: undefined, listeners: [] });
        this.page2D = page;
        let listen = (target, type, handler, options) => { target.addEventListener(type, handler, options); page.listeners.push(() => target.removeEventListener(type, handler, options)); };
        // Wheel: zoom on what is under the pointer. Drag: move.
        listen(host, "wheel", (event) => {
            event.preventDefault();
            let rect = host.getBoundingClientRect(), camera = this.camera2D;
            let px = event.clientX - rect.left - page.width / 2, py = event.clientY - rect.top - page.height / 2;
            let factor = Math.exp(-event.deltaY * (event.deltaMode ? 0.05 : 0.0015));
            let scale = Math.max(1e-9, Math.min(1e12, camera.scale * factor));
            camera.u += px / camera.scale - px / scale;
            camera.v -= py / camera.scale - py / scale;
            camera.scale = scale;
            camera.userMoved = true;
            this.__requestDraw();
        }, { passive: false });
        let drag = undefined;
        let local = (event) => { let rect = host.getBoundingClientRect(); return [event.clientX - rect.left, event.clientY - rect.top]; };
        listen(host, "pointerdown", (event) => {
            try { host.setPointerCapture(event.pointerId); } catch(e) {}
            if(this.__commandDown(local(event))) { drag = undefined; return; } // (a writable pose or point is grabbed: not a move of the map)
            drag = { x: event.clientX, y: event.clientY };
        });
        listen(host, "pointermove", (event) => {
            this.pointer = local(event);
            if(this.ghost && this.ghost.drag) { this.__commandMove(this.pointer); return; }
            if(!drag) { if(this.editables.length && TELEPLOT.state.commands) this.__requestDraw(); return; } // (handles of what is under the pointer)
            let camera = this.camera2D;
            camera.u -= (event.clientX - drag.x) / camera.scale;
            camera.v += (event.clientY - drag.y) / camera.scale;
            drag = { x: event.clientX, y: event.clientY };
            camera.userMoved = true;
            this.__requestDraw();
        });
        let release = () => { drag = undefined; if(this.ghost && this.ghost.drag) { this.ghost.drag = undefined; this.__requestDraw(); } };
        listen(host, "pointerup", release);
        listen(host, "pointercancel", release);
        listen(host, "pointerleave", () => { this.pointer = undefined; if(this.editables.length) this.__requestDraw(); });
        // A ghost being placed: Enter sends it, Esc drops it (the map takes the focus when it is clicked)
        host.tabIndex = -1;
        listen(host, "keydown", (event) => {
            if(!this.ghost) return;
            if(event.key === "Enter") { event.preventDefault(); this.__sendGhost(); }
            else if(event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.ghost = undefined; this.__syncGhostButtons(); this.__requestDraw(); }
        });
        // Send / Cancel next to a ghost
        let buttons = document.createElement("div");
        buttons.className = "teleplot-js-2d-ghost-buttons";
        buttons.hidden = true;
        buttons.innerHTML = '<button type="button" class="teleplot-js-cmd-button">Cancel</button><button type="button" class="teleplot-js-cmd-button teleplot-js-cmd-primary">Send</button>';
        buttons.children[0].addEventListener("click", (e) => { e.stopPropagation(); this.ghost = undefined; this.__syncGhostButtons(); this.__requestDraw(); });
        buttons.children[1].addEventListener("click", (e) => { e.stopPropagation(); this.__sendGhost(); });
        for(let b of buttons.children) b.addEventListener("pointerdown", (e) => e.stopPropagation());
        host.appendChild(buttons);
        page.ghostButtons = buttons;
        // Commands are off and a writable pose was pressed: said for a while, with a button to switch them on
        let note = document.createElement("div");
        note.className = "teleplot-js-cmd-offnote teleplot-js-2d-offnote";
        note.setAttribute("role", "status");
        note.hidden = true;
        note.innerHTML = '<span></span><button type="button" class="teleplot-js-cmd-button">Switch on</button>';
        note.children[1].addEventListener("click", (e) => { e.stopPropagation(); TELEPLOT.commands.setEnabled(true); note.hidden = true; this.__requestDraw(); });
        note.addEventListener("pointerdown", (e) => e.stopPropagation());
        host.appendChild(note);
        page.offNote = note;
        page.observer = new ResizeObserver(() => this.__resize2D());
        page.observer.observe(host);
        this.__resize2D();
    }

    __showOffNote(telem) {
        let note = this.page2D && this.page2D.offNote;
        if(!note) return;
        note.children[0].textContent = (telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) || telem.id) + ": commands are off, nothing is sent.";
        note.hidden = false;
        clearTimeout(this.__offTimer);
        this.__offTimer = setTimeout(() => { note.hidden = true; }, TELEPLOT.commands.OFF_NOTICE_TIME);
    }

    dispose() {
        clearTimeout(this.__offTimer);
        let page = this.page2D;
        if(page) {
            this.page2D = undefined;
            cancelAnimationFrame(page.frame);
            if(page.observer) page.observer.disconnect();
            for(let remove of page.listeners) remove();
            page.canvas.remove();
        }
        for(let [url, entry] of [...this.stl2D, ...this.images2D]) if(entry.failed) { this.stl2D.delete(url); this.images2D.delete(url); } // (tried again once mounted again)
        super.dispose();
    }

    __resize2D() {
        let page = this.page2D;
        if(!page) return;
        let width = page.host.clientWidth, height = page.host.clientHeight;
        if(!width || !height) return;
        let ratio = Math.min(window.devicePixelRatio || 1, 2);
        page.width = width; page.height = height; page.ratio = ratio;
        page.canvas.width = Math.max(1, Math.floor(width * ratio));
        page.canvas.height = Math.max(1, Math.floor(height * ratio));
        page.canvas.style.width = width + "px";
        page.canvas.style.height = height + "px";
        this.lastKey = ""; // Framed and drawn again by the next update
        this.__draw();
    }

    __requestDraw() {
        let page = this.page2D;
        if(!page || page.frame) return;
        page.frame = requestAnimationFrame(() => { page.frame = 0; this.__draw(); });
    }

    // Frame what is drawn now, and keep things in the frame again (double click)
    fitCamera() {
        this.camera2D.userMoved = false;
        this.camera2D.content = undefined;
        this.camera2D.framed = undefined;
        this.lastKey = "";
    }

    // Vertices of an STL file (some of them: enough for what it covers), undefined until it is loaded
    __stl2D(url) {
        if(!url) return undefined;
        let entry = this.stl2D.get(url);
        if(!entry) {
            entry = { points: undefined, failed: false };
            this.stl2D.set(url, entry);
            new TELEPLOT.THREE.STLLoader().load(url, (geometry) => {
                let positions = geometry.getAttribute("position").array;
                let stride = Math.max(1, Math.ceil(positions.length / 3 / 4000)) * 3;
                let points = [];
                for(let i = 0; i + 2 < positions.length; i += stride) points.push(positions[i], positions[i+1], positions[i+2]);
                entry.points = Float32Array.from(points);
                geometry.dispose();
            }, undefined, () => { entry.failed = true; this.__loadFailed(url, "STL file"); });
        }
        return entry.points;
    }
    __stlStatus(url) {
        let entry = this.stl2D.get(url);
        return !entry ? "new" : (entry.points ? "ready" : (entry.failed ? "failed" : "loading"));
    }

    // A picture (the texture of a rectangle), undefined until it is loaded
    __image2D(url) {
        let entry = this.images2D.get(url);
        if(!entry) {
            entry = { image: new Image(), ready: false };
            this.images2D.set(url, entry);
            if(this.images2D.size > 8) this.images2D.delete(this.images2D.keys().next().value); // (the pictures of an image telemetry go by)
            entry.image.onload = () => { entry.ready = true; this.__requestDraw(); };
            entry.image.onerror = () => { entry.failed = true; this.__loadFailed(url, "picture"); };
            entry.image.src = url;
        }
        return entry.ready ? entry.image : undefined;
    }

    // ------------------------------------------------------------------ Update

    update(){
        if (!TELEPLOT.view.ViewTelemetries.prototype.__before_update.call(this)) return;
        let page = this.page2D;
        if(!page) return;
        const P = TELEPLOT.protocol;
        let viewGroup = TELEPLOT.view.groups[this.group];
        let timestamp = viewGroup.cursorTimestamp;
        let since = (viewGroup.cursorActive && viewGroup.timestampFrom < viewGroup.timestampTo) ? viewGroup.timestampFrom : -Infinity;

        let element = document.getElementById(this.divId);
        let { sources, key } = this.__collectSources(timestamp);
        for(let source of sources) { // Pictures laid on rectangles
            if(!source.state) continue;
            if(source.state.texture.type == P.TEXTURE_TYPE_URL) source.textureUrl = source.state.texture.value;
            else if(source.state.texture.type == P.TEXTURE_TYPE_IMAGE && source.image) source.textureUrl = source.image.url;
        }
        key += `|${since},${TELEPLOT.theme.key()},${this.options.displayGrid},${this.options.displayAxes},${this.options.axisRight},${this.options.axisUp},${page.width}x${page.height}`;
        key += `|cmd:${TELEPLOT.state.commands}:${TELEPLOT.view.isLive(this.group)}`; // Commands: what is asked of the writable poses and points
        for(let source of sources) { let request = TELEPLOT.commands.request(source.telem); if(request) key += `:${source.telem.id}=${request.status}`; }
        if(key == this.lastKey) return;
        this.lastKey = key;

        // (raw: an application that wraps the library in proxies must not wrap what is drawn, see doc/performance.md)
        this.items = TELEPLOT.Vue.markRaw(ViewScene2D.buildItems(sources, { axes: ViewScene2D.axes(this.options.axisRight, this.options.axisUp), timestamp, since, trailLength: this.options.trailLength,
            pointColorByHeight: this.options.pointColorByHeight, stl: (url) => this.__stl2D(url) }));
        this.__updateLegend(sources, element);
        this.editables = TELEPLOT.Vue.markRaw(this.__editables(sources));
        this.lockedEditables = TELEPLOT.Vue.markRaw(TELEPLOT.state.commands ? [] : this.__editables(sources, true));
        if(!this.camera2D.userMoved) this.__keepInFrame2D();
        this.__draw();
    }

    // ------------------------------------------------------------------ Commands: writable poses and points

    // What can be placed (CMD on, writable pose2d or xy settings drawn here): [{id, telem, type, at: [u, v], yaw, request}]. evenOff: what
    // could be placed if commands were on (whether its device can be written to is not asked then)
    __editables(sources, evenOff = false) {
        let list = [];
        if(!TELEPLOT.state.commands && !evenOff) return list;
        let axes = ViewScene2D.axes(this.options.axisRight, this.options.axisUp);
        for(let source of sources) {
            let telem = source.telem, declaration = TELEPLOT.commands.declaration(telem);
            if(source.hidden || !declaration || declaration.kind !== "setting" || TELEPLOT.commands.isContinuous(telem) || (declaration.type !== "pose2d" && declaration.type !== "xy")) continue;
            if(!evenOff && TELEPLOT.commands.whyNotIn(telem, this.group) !== "") continue; // (nor while its time group is not live)
            let reported = TELEPLOT.commands.reported(telem);
            if(!reported) continue;
            let v = reported.value;
            list.push({ id: telem.id, telem, type: declaration.type, at: ViewScene2D.project([v[0], v[1], 0], axes), yaw: declaration.type === "pose2d" ? Number(v[2]) || 0 : 0,
                request: TELEPLOT.commands.request(telem) });
        }
        return list;
    }

    // Pixels of the page of a place of the view, and back
    __toPage(at) { let c = this.camera2D, p = this.page2D; return [p.width / 2 + (at[0] - c.u) * c.scale, p.height / 2 - (at[1] - c.v) * c.scale]; }
    __fromPage(px) { let c = this.camera2D, p = this.page2D; return [c.u + (px[0] - p.width / 2) / c.scale, c.v - (px[1] - p.height / 2) / c.scale]; }

    static TURN_RADIUS = 28; // Pixels from a pose to its turn handle
    // Where the turn handle of a pose is, on the page: along its heading
    __turnHandle(at, yaw) {
        let axes = ViewScene2D.axes(this.options.axisRight, this.options.axisUp);
        let ahead = ViewScene2D.project([Math.cos(yaw), Math.sin(yaw), 0], axes), origin = ViewScene2D.project([0, 0, 0], axes);
        let du = ahead[0] - origin[0], dv = ahead[1] - origin[1], length = Math.hypot(du, dv) || 1;
        let center = this.__toPage(at);
        return [center[0] + du / length * ViewScene2D.TURN_RADIUS, center[1] - dv / length * ViewScene2D.TURN_RADIUS];
    }

    // A press on the map: grabs the ghost (its center to move it, its handle to turn it) or a writable pose / point (a ghost starts
    // from where it is). Returns true when something was grabbed.
    __commandDown(px) {
        if(!this.page2D) return false;
        let near = (a, b, r) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r;
        if(!TELEPLOT.state.commands) { // A writable pose or point pressed while commands are off: nothing is sent, the view says why
            let locked = this.lockedEditables.find((e) => near(px, this.__toPage(e.at), 12));
            if(!locked || !TELEPLOT.commands.blockedWhileOff(locked.telem)) return false;
            this.__showOffNote(locked.telem);
            return true;
        }
        let ghost = this.ghost;
        if(ghost) {
            if(ghost.type === "pose2d" && near(px, this.__turnHandle(ghost.at, ghost.yaw), 9)) { ghost.drag = "turn"; return true; }
            if(near(px, this.__toPage(ghost.at), 12)) { ghost.drag = "move"; ghost.offset = [ghost.at[0] - this.__fromPage(px)[0], ghost.at[1] - this.__fromPage(px)[1]]; return true; }
        }
        for(let editable of this.editables) {
            let turn = editable.type === "pose2d" && near(px, this.__turnHandle(editable.at, editable.yaw), 9);
            if(!turn && !near(px, this.__toPage(editable.at), 12)) continue;
            this.ghost = { id: editable.id, type: editable.type, at: editable.at.slice(), yaw: editable.yaw, drag: turn ? "turn" : "move", offset: [0, 0] };
            if(!turn) { let w = this.__fromPage(px); this.ghost.offset = [editable.at[0] - w[0], editable.at[1] - w[1]]; }
            this.__syncGhostButtons();
            this.__requestDraw();
            return true;
        }
        return false;
    }

    __commandMove(px) {
        let ghost = this.ghost;
        if(ghost.drag === "move") { let w = this.__fromPage(px); ghost.at = [w[0] + ghost.offset[0], w[1] + ghost.offset[1]]; }
        else if(ghost.drag === "turn") {
            let center = this.__toPage(ghost.at);
            ghost.yaw = ViewScene2D.yawOf(px[0] - center[0], -(px[1] - center[1]), ViewScene2D.axes(this.options.axisRight, this.options.axisUp));
        }
        this.__syncGhostButtons();
        this.__requestDraw();
    }

    __sendGhost() {
        let ghost = this.ghost;
        if(!ghost) return;
        let telem = TELEPLOT.datastore.getTelemetry(ghost.id);
        if(telem) TELEPLOT.commands.write(telem, ViewScene2D.ghostValue(ghost.type, ghost.at, ghost.yaw, ViewScene2D.axes(this.options.axisRight, this.options.axisUp)));
        this.ghost = undefined;
        this.__syncGhostButtons();
        this.__requestDraw();
    }

    __syncGhostButtons() {
        let page = this.page2D;
        if(!page || !page.ghostButtons) return;
        let buttons = page.ghostButtons, ghost = this.ghost;
        buttons.hidden = !ghost;
        if(!ghost) return;
        let at = this.__toPage(ghost.at);
        buttons.style.left = Math.max(4, Math.min(page.width - 130, at[0] + 18)) + "px";
        buttons.style.top = Math.max(4, Math.min(page.height - 30, at[1] + 16)) + "px";
    }

    // Handles of what can be placed (under the pointer), what was asked and not yet applied (dashed), the ghost being placed
    __drawCommands(context, element) {
        if(!this.editables.length && !this.ghost) return;
        let primary = TELEPLOT.theme.color("--teleplot-primary", element, "#2980b9"), warn = TELEPLOT.theme.color("--teleplot-warn", element, "#b87500");
        let axes = ViewScene2D.axes(this.options.axisRight, this.options.axisUp);
        let glyph = (at, yaw, type, color, dashed) => {
            let p = this.__toPage(at);
            context.fillStyle = context.strokeStyle = color;
            if(type === "pose2d") {
                let h = this.__turnHandle(at, yaw), length = Math.hypot(h[0] - p[0], h[1] - p[1]) || 1;
                ViewScene2D.drawPose(context, p[0], p[1], (h[0] - p[0]) / length, (h[1] - p[1]) / length, dashed);
            }
            else { context.beginPath(); context.arc(p[0], p[1], 6, 0, 2 * Math.PI); context.setLineDash(dashed ? [3, 2] : []); context.lineWidth = 2; context.stroke(); context.setLineDash([]); }
        };
        let handles = (at, yaw, type) => {
            let p = this.__toPage(at);
            context.strokeStyle = primary;
            context.lineWidth = 1;
            context.setLineDash([2, 3]);
            context.beginPath(); context.arc(p[0], p[1], ViewScene2D.TURN_RADIUS, 0, 2 * Math.PI); context.stroke();
            context.setLineDash([]);
            if(type === "pose2d") { let h = this.__turnHandle(at, yaw); context.fillStyle = TELEPLOT.theme.color("--teleplot-surface", element, "#fff"); context.lineWidth = 1.5; context.beginPath(); context.arc(h[0], h[1], 4.5, 0, 2 * Math.PI); context.fill(); context.stroke(); }
        };
        for(let editable of this.editables) {
            let request = editable.request;
            if(request && (request.status === "pending" || request.status === "kept") && Array.isArray(request.target)) {
                let at = ViewScene2D.project([request.target[0], request.target[1], 0], axes);
                glyph(at, request.target[2] || 0, editable.type, request.status === "kept" ? warn : primary, true);
            }
            let p = this.__toPage(editable.at);
            if(!this.ghost && this.pointer && Math.hypot(this.pointer[0] - p[0], this.pointer[1] - p[1]) < ViewScene2D.TURN_RADIUS + 12) handles(editable.at, editable.yaw, editable.type);
        }
        let ghost = this.ghost;
        if(ghost) {
            context.globalAlpha = 0.9;
            glyph(ghost.at, ghost.yaw, ghost.type, primary, true);
            context.globalAlpha = 1;
            handles(ghost.at, ghost.yaw, ghost.type);
            let value = ViewScene2D.ghostValue(ghost.type, ghost.at, ghost.yaw, axes);
            let label = ghost.type === "pose2d" ? value[0] + ", " + value[1] + " · " + value[2] : value.join(", ");
            let p = this.__toPage(ghost.at);
            context.font = "600 11px system-ui, sans-serif";
            let width = context.measureText(label).width + 12;
            context.fillStyle = primary;
            context.beginPath(); context.roundRect ? context.roundRect(p[0] - width / 2, p[1] - 44, width, 16, 8) : context.rect(p[0] - width / 2, p[1] - 44, width, 16); context.fill();
            context.fillStyle = "#fff"; context.textAlign = "center"; context.textBaseline = "middle";
            context.fillText(label, p[0], p[1] - 36);
            context.textAlign = "start";
        }
    }

    // The view shows everything drawn so far: when something gets out of what it frames, it steps back (it never zooms in by itself)
    __keepInFrame2D() {
        let page = this.page2D, camera = this.camera2D;
        let bounds = ViewScene2D.itemsBounds(this.items);
        if(!bounds || !page.width) return;
        if(camera.content) { bounds.min = bounds.min.map((v, i) => Math.min(v, camera.content.min[i])); bounds.max = bounds.max.map((v, i) => Math.max(v, camera.content.max[i])); }
        camera.content = { min: bounds.min.slice(), max: bounds.max.slice() };
        if(camera.looking !== this.options.axisRight + "," + this.options.axisUp) { camera.looking = this.options.axisRight + "," + this.options.axisUp; camera.content = undefined; camera.framed = undefined; bounds = ViewScene2D.itemsBounds(this.items); } // Seen another way: framed again
        let extent = ViewScene3D.frameExtent([bounds.min[0], bounds.min[1], 0], [bounds.max[0], bounds.max[1], 0]); // (with the origin, unless the content is tiny and far from it)
        let framed = { min: extent.min.slice(0, 2), max: extent.max.slice(0, 2), origin: extent.origin, size: page.width + "x" + page.height };
        let previous = camera.framed;
        if(previous && previous.origin === framed.origin && previous.size === framed.size && [0, 1].every((i) => framed.min[i] >= previous.min[i] && framed.max[i] <= previous.max[i])) return;
        if(previous && previous.origin === framed.origin) { framed.min = framed.min.map((v, i) => Math.min(v, previous.min[i])); framed.max = framed.max.map((v, i) => Math.max(v, previous.max[i])); }
        camera.framed = framed;
        Object.assign(camera, ViewScene2D.fit(framed, page.width, page.height));
    }

    __draw() {
        let page = this.page2D;
        if(!page || !page.width) return;
        let context = page.context, camera = this.camera2D;
        let element = document.getElementById(this.divId);
        context.setTransform(page.ratio, 0, 0, page.ratio, 0, 0);
        context.clearRect(0, 0, page.width, page.height);
        let view = { width: page.width, height: page.height, u: camera.u, v: camera.v, scale: camera.scale, down: false };
        let style = { line: TELEPLOT.theme.color("--teleplot-line", element, "#d5dbe0"), strong: TELEPLOT.theme.color("--teleplot-muted", element, "#66717c"), muted: TELEPLOT.theme.color("--teleplot-muted", element, "#66717c") };
        // Under everything: backgrounds (textured rectangles on the ground), then the grid, then the rest
        let grounds = this.items.filter((item) => item.texture && !(item.z > 0)), others = this.items.filter((item) => !grounds.includes(item));
        let images = (url) => this.__image2D(url);
        let size = Math.max(1, Math.min(20, Number(this.options.pointSize) || 3));
        ViewScene2D.draw(context, grounds, view, images, size);
        if(this.options.displayGrid || this.options.displayAxes) ViewScene2D.drawGrid(context, view, style, ViewScene2D.axes(this.options.axisRight, this.options.axisUp), !!this.options.displayGrid, !!this.options.displayAxes);
        ViewScene2D.draw(context, others, view, images, size);
        this.__drawCommands(context, element);
        this.__syncGhostButtons();
    }
}

TELEPLOT.view.ViewScene2D = ViewScene2D;

// The buttons next to a ghost (a pose or a point being placed, see __drawCommands)
{
    let elem = document.createElement('style');
    elem.textContent = `@scope (.teleplot-js-style) { .teleplot-js-2d-ghost-buttons { position: absolute; z-index: 3; display: flex; gap: 0.3em; } .teleplot-js-2d-ghost-buttons[hidden] { display: none; } .teleplot-js-2d-offnote { position: absolute; z-index: 4; left: 0.5em; right: 0.5em; bottom: 0.5em; margin: 0; } .teleplot-js-2d-offnote[hidden] { display: none; } }`;
    document.head.appendChild(elem);
}
