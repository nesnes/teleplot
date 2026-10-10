/*
 * 3D view: shapes and 3D points in one scene (three.js, embedded as TELEPLOT.THREE).
 * - A shape is a telemetry with the TELEM_ATTR_SHAPE attribute (cube, sphere, cylinder, STL file) and/or shape data: position, rotation
 *   (roll, pitch, yaw) or quaternion, color, opacity, size, texture (an url, or the latest image of an image telemetry). What was never
 *   sent has a default: a cube of 1 at the origin, in the color of the telemetry.
 * - A telemetry of 3D numbers (TELEM_DATA_NUMBER_3D) is a point, followed by the trail of its latest positions ("trailLength" option).
 * - A telemetry with camera intrinsics (TELEM_DATA_CAMERA_INTRINSICS, usually an image telemetry) is a camera: drawn as what it sees, a
 *   pyramid from where it is (its size along x is how far the pyramid goes). The image view (114) draws the scene as seen from it.
 * - Frame: right-handed, x forward, y left, z up. The grid is the ground (z = 0); axes: x red, y green, z blue.
 * - Follows the cursor of its group: while another view is hovered, the scene shows the state at that time (the latest one otherwise).
 * - Camera: until the user moves it, it keeps everything that was drawn so far in the frame (it only ever zooms out: a shape that moves
 *   around ends up with a steady view of the space it lives in). Drag to orbit, right drag (or two fingers) to pan, wheel to zoom,
 *   double click to frame what is drawn now and let the camera follow again.
 * - Legend: the one of the charts (same markup and style): name and position of each telemetry in a row at the top, what does not fit is
 *   folded behind a "+N" chip that opens the whole list. Click an entry to hide or show its shape, hover it to make it stand out.
 * The state of the scene is computed without three.js (shapeState, trailRange...): that part is unit tested.
 */
class ViewScene3D extends ViewTelemetries {
    constructor(divId, telemetryIdOrNameList, group="default"){
        super(divId, group);
        this.name = "3d";
        this.type = "teleplot-3d";
        this.telemetryIdOrNameList = telemetryIdOrNameList;
        this.supportedDataTypes = [TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D].concat(TELEPLOT.protocol.SHAPE_DATA_TYPES).map(String);
        this.supportedLabel = "3D";

        this.options.displayGrid = true;    // Ground grid (z = 0)
        this.options.displayAxes = true;    // x, y, z axes at the origin
        this.options.displayLegend = true;  // Names and positions of the telemetries, with their colors
        this.options.displayNumberDecimals = 2;
        this.options.trailLength = 200;     // Points: number of past positions drawn as a line (0: none)

        this.layout.width = 2;
        this.layout.height = 6;

        // Vue data
        this.state = TELEPLOT.Vue.reactive({
            legend: [], // [{id, name, unit, color, value, valueChars}]
            error: ""   // Why nothing can be drawn (no WebGL)
        });
        this.hidden = TELEPLOT.Vue.reactive({});  // { telemetryId: true } telemetries switched off by a click on their legend entry
        this.legend = TELEPLOT.Vue.reactive({ visible: Infinity, folded: 0, open: false });
        this.highlighted = undefined;             // Telemetry whose legend entry is hovered: the others are faded
        this.valueChars = {};                     // Width (characters) of the value slot of each legend entry: only grows, so entries never shake
        this.legendKey = "";
        this.lastKey = "";
    }

    // ------------------------------------------------------------------ State of the scene (no three.js here)

    static isCamera(telem) {
        return telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS] !== undefined;
    }

    static isShape(telem) {
        if(ViewScene3D.isCamera(telem)) return false; // Its position and orientation are those of a camera
        if(telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_SHAPE) !== undefined) return true;
        return TELEPLOT.protocol.SHAPE_DATA_TYPES.some((type) => telem.data[type] !== undefined);
    }

    static isPoint(telem) {
        return !ViewScene3D.isCamera(telem) && !ViewScene3D.isShape(telem) && telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D] !== undefined;
    }

    // How a telemetry is drawn in a scene: "camera", "shape", "point", or undefined (not a 3D telemetry)
    static kindOf(telem) {
        if(ViewScene3D.isCamera(telem)) return "camera";
        if(ViewScene3D.isShape(telem)) return "shape";
        return ViewScene3D.isPoint(telem) ? "point" : undefined;
    }

    // Camera of a telemetry at a time (negative: now), undefined when it has no (valid) intrinsics:
    //   {width, height, fx, fy, cx, cy, distortion: [k1, k2, p1, p2, k3] or undefined, position: [x, y, z], quaternion: [w, x, y, z], depth}
    // Intrinsics and distortion follow the usual image convention (pinhole model, pixels, origin at the center of the top left pixel, u to
    // the right, v down). The pose is in the frame of the scene like any shape: the camera looks along its x, its y is to the left of the
    // image and its z to the top. "depth" is how far its pyramid is drawn (the size of the telemetry along x, 1 by default).
    static cameraState(telem, timestamp=-1) {
        const P = TELEPLOT.protocol;
        let sample = (dataType) => {
            let entry = telem.data[dataType];
            let index = ViewScene3D.sampleIndex(entry, timestamp);
            return index < 0 ? undefined : entry.data.map((channel) => channel[index]);
        };
        let intrinsics = sample(P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS);
        if(!intrinsics || !intrinsics.every(Number.isFinite)) return undefined;
        let [width, height, fx, fy, cx, cy] = intrinsics;
        if(!(width > 0 && height > 0 && fx > 0 && fy > 0)) return undefined;
        let distortion = sample(P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION);
        if(distortion && (!distortion.every(Number.isFinite) || distortion.every((v) => v === 0))) distortion = undefined; // No distortion: a plain pinhole
        let pose = ViewScene3D.shapeState(telem, timestamp);
        return { width, height, fx, fy, cx, cy, distortion, position: pose.position, quaternion: pose.quaternion, depth: pose.size[0] };
    }

    // Corners of the image of a camera, "depth" in front of it, in the frame of the camera (x forward, y left, z up): top left, top right,
    // bottom right, bottom left. With the camera itself (0, 0, 0) they make the pyramid of what it sees (without lens distortion).
    static cameraCorners(camera, depth=camera.depth) {
        let corner = (u, v) => [depth, -depth * (u - camera.cx) / camera.fx, -depth * (v - camera.cy) / camera.fy];
        let u0 = -0.5, v0 = -0.5, u1 = camera.width - 0.5, v1 = camera.height - 0.5; // Edges of the image: half a pixel around the pixel centers
        return [corner(u0, v0), corner(u1, v0), corner(u1, v1), corner(u0, v1)];
    }

    // Index of the sample in effect at a time: the last one at or before it (the first one when the time is before all of them).
    // A negative time means "now": the latest sample. -1 when there is no sample.
    static sampleIndex(entry, timestamp=-1) {
        if(entry === undefined || entry.timestamps.length == 0) return -1;
        let timestamps = entry.timestamps;
        if(timestamp < 0 || timestamps[timestamps.length-1] <= timestamp) return timestamps.length-1;
        let lo = 0, hi = timestamps.length; // First sample after the time
        while(lo < hi) { let mid = (lo + hi) >> 1; if(timestamps[mid] <= timestamp) lo = mid + 1; else hi = mid; }
        return Math.max(0, lo - 1);
    }

    // Roll (around x), pitch (around y), yaw (around z) in radians, applied in that order around the fixed axes -> [w, x, y, z]
    static eulerToQuaternion(roll, pitch, yaw) {
        let cr = Math.cos(roll / 2), sr = Math.sin(roll / 2);
        let cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
        let cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
        return [cr*cp*cy + sr*sp*sy, sr*cp*cy - cr*sp*sy, cr*sp*cy + sr*cp*sy, cr*cp*sy - sr*sp*cy];
    }

    // Everything needed to draw a shape telemetry at a time (negative: now). fallbackColor is used when the shape has no color of its own.
    //   {type, url, position: [x, y, z], quaternion: [w, x, y, z], size: [x, y, z], color, opacity (0 to 1), texture: {type, value}}
    static shapeState(telem, timestamp=-1, fallbackColor="gray") {
        const P = TELEPLOT.protocol;
        let sample = (dataType) => {
            let entry = telem.data[dataType];
            let index = ViewScene3D.sampleIndex(entry, timestamp);
            if(index < 0) return undefined;
            // "t" tells which of two samples is the one in effect: a sample from after the time asked (nothing older exists) never wins
            let t = entry.timestamps[index];
            return { t: (timestamp >= 0 && t > timestamp) ? -Infinity : t, values: entry.data.map((channel) => channel[index]) };
        };
        let finite = (values, defaults) => values.map((v, i) => Number.isFinite(v) ? v : defaults[i]);

        let attr = telem.getAttribute(P.TELEM_ATTR_SHAPE) || {};
        let state = {
            type: attr.type !== undefined ? attr.type : P.TELEM_ATTR_SHAPE_TYPE_CUBE,
            url: attr.data || "",
            position: [0, 0, 0], quaternion: [1, 0, 0, 0], size: [1, 1, 1],
            color: telem.getAttribute(P.TELEM_ATTR_COLOR) || fallbackColor, opacity: 1,
            texture: { type: P.TEXTURE_TYPE_NONE, value: "" }
        };

        let position = sample(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION);
        if(position) state.position = finite(position.values, state.position);

        // Orientation: whichever of the rotation and the quaternion came last (the quaternion when they came together)
        let rotation = sample(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION), quaternion = sample(P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION);
        if(quaternion && (!rotation || quaternion.t >= rotation.t)) {
            let q = finite(quaternion.values, [1, 0, 0, 0]);
            let norm = Math.hypot(q[0], q[1], q[2], q[3]);
            state.quaternion = norm > 0 ? q.map((v) => v / norm) : [1, 0, 0, 0];
        }
        else if(rotation) state.quaternion = ViewScene3D.eulerToQuaternion(...finite(rotation.values, [0, 0, 0]));

        let size = sample(P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE);
        if(size) state.size = finite(size.values, state.size);

        let colorStr = sample(P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR), colorRgb = sample(P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB);
        if(colorRgb && (!colorStr || colorRgb.t >= colorStr.t)) state.color = `rgb(${colorRgb.values.map((v) => Math.max(0, Math.min(255, Math.round(v) || 0))).join(",")})`;
        else if(colorStr && colorStr.values[0]) state.color = String(colorStr.values[0]);

        let opacity = sample(P.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY);
        if(opacity && Number.isFinite(opacity.values[0])) state.opacity = Math.max(0, Math.min(255, opacity.values[0])) / 255;

        let texture = sample(P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE);
        if(texture && texture.values[0] !== P.TEXTURE_TYPE_NONE && texture.values[1]) state.texture = { type: texture.values[0], value: String(texture.values[1]) };
        return state;
    }

    // Samples of a 3D point to draw at a time (negative: now): {from, to} indexes, "to" is the current position (included) and at most
    // maxPoints samples before it make the trail, not older than "since". Undefined when there is no sample.
    static trailRange(entry, timestamp=-1, maxPoints=0, since=-Infinity) {
        let to = ViewScene3D.sampleIndex(entry, timestamp);
        if(to < 0) return undefined;
        let from = Math.max(0, to - Math.max(0, maxPoints));
        while(from < to && entry.timestamps[from] < since) from++;
        return { from, to };
    }

    // "data:" url of the image of an image telemetry at a time, and the time of that image (to know when it changes). Undefined when none.
    static imageAt(telem, timestamp=-1) {
        const P = TELEPLOT.protocol;
        let entry = telem ? telem.data[P.SECTION_TYPE_TELEM_DATA_IMAGE] : undefined;
        let index = ViewScene3D.sampleIndex(entry, timestamp);
        if(index < 0) return undefined;
        let type = entry.data[0][index] == P.IMAGE_TYPE_PNG ? "png" : "jpeg";
        return { t: entry.timestamps[index], url: "data:image/" + type + ";base64," + entry.data[1][index] };
    }

    getOptionsSchema() {
        return [
            { key: "displayGrid", label: "Grid", type: "bool" },
            { key: "displayAxes", label: "Axes", type: "bool" },
            { key: "displayLegend", label: "Legend", type: "bool" },
            { key: "displayNumberDecimals", label: "Decimals", type: "int", min: 0, max: 10, step: 1 },
            { key: "trailLength", label: "Trail length", type: "int", min: 0, max: 100000, step: 50 },
        ];
    }

    // Shows or hides what draws a telemetry (click on its legend entry)
    toggleTelemetry(id) {
        if(this.hidden[id]) delete this.hidden[id]; else this.hidden[id] = true;
        this.highlighted = this.hidden[id] ? undefined : id; // The pointer is still on the entry
    }

    // Makes a telemetry stand out by fading the others (hover on its legend entry), no id: back to normal
    highlightTelemetry(id) {
        this.highlighted = (id !== undefined && this.hidden[id]) ? undefined : id;
    }

    // "1.5, 0.25, 3": a position as written in the legend
    static formatPosition(position, decimals=2) {
        let formatter = new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: decimals });
        return position.map((v) => formatter.format(Number.isFinite(v) ? v : 0)).join(", ");
    }

    // A shape that only has its attribute (nothing sent about its position...) is drawn at the origin: that is something to show
    getEmptyState() {
        let empty = super.getEmptyState();
        if(!empty.text) return empty;
        let hasShape = this.telemetryIdOrNameList.some((entry) => {
            let telem = TELEPLOT.datastore.getTelemetry(entry);
            return telem !== undefined && telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_SHAPE) !== undefined;
        });
        return hasShape ? { text: "", hint: "" } : empty;
    }

    // ------------------------------------------------------------------ Page

    init(){
        super.init();

        let self = this;
        this.vue.component(this.type, {
            name: this.type,
            data() {
                return {
                    self: self,
                    state: self.state,
                    hidden: self.hidden,
                    legend: self.legend,
                    options : self.options,
                    layout : self.layout,
                    dragContext: self.dragContext,
                    emptyState: self.emptyState
                }
            },
            methods: {
                onDragEnter: self.onDragEnter,
                onDragLeave: self.onDragLeave,
                onDragDrop: self.onDragDrop,
                onDoubleClick() { self.fitCamera(); },
                onImageLoad(event) { if(self.__imageLoaded) self.__imageLoaded(event.target); },
                onLegendClick(id) { self.toggleTelemetry(id); },
                onLegendEnter(id) { self.highlightTelemetry(id); },
                onLegendLeave() { self.highlightTelemetry(undefined); },
                onLegendMore() { if(self.legend.open) self.closeLegendList(); else self.openLegendList(); }
            },
            template: this.constructor.vueHTML,
        });

        // Add component to DOM and start vuejs
        let element = document.getElementById(this.divId);
        if(element == null) { throw new Error(`Cannot create ${this.type} as #${this.divId} doesn't exists`); return; }
        let innerElement = document.createElement(this.type);
        element.append(innerElement);
        this.vue.mount(`#${this.divId}`);

        this.lastKey = "";
        this.legendKey = "";
        this.__mounted(element);
    }

    // The view is on the page: start drawing in it
    __mounted(element) {
        this.__setupScene(element.querySelector(".teleplot-js-scene3d-canvas"));
    }

    // Legend: the entries that fit in the row are shown, the others are counted by the "+N" chip (same rule as the charts)
    layoutLegend() {
        let element = document.getElementById(this.divId);
        let legendEl = element && element.querySelector(".teleplot-js-scene3d-legend > .teleplot-js-chart-legend");
        if(!legendEl) return;
        let { visible, folded } = TELEPLOT.view.ViewChart.fitLegend(legendEl);
        if(this.legend.visible !== visible) this.legend.visible = visible;
        if(this.legend.folded !== folded) this.legend.folded = folded;
        if(!folded && this.legend.open) this.closeLegendList();
    }

    // List of all the telemetries, under the legend: closed by a click elsewhere or Escape
    openLegendList() {
        if(this.legend.open) return;
        this.legend.open = true;
        this.outsideHandler = (e) => {
            let host = document.getElementById(this.divId);
            let legendEl = host && host.querySelector(".teleplot-js-scene3d-legend");
            let path = e.composedPath ? e.composedPath() : [];
            if(legendEl && path.includes(legendEl)) return;
            this.closeLegendList();
        };
        this.keyHandler = (e) => { if(e.key === "Escape") this.closeLegendList(); };
        document.addEventListener("pointerdown", this.outsideHandler, true);
        document.addEventListener("keydown", this.keyHandler, true);
    }

    closeLegendList() {
        if(this.outsideHandler) document.removeEventListener("pointerdown", this.outsideHandler, true);
        if(this.keyHandler) document.removeEventListener("keydown", this.keyHandler, true);
        this.outsideHandler = this.keyHandler = undefined;
        this.legend.open = false;
        this.highlighted = undefined;
    }

    // Renderer, scene, lights and what shapes are made of, in a canvas added to "host" (shared by the views that draw 3D telemetries).
    // Undefined (and state.error says why) when WebGL is not available.
    __createThree(host) {
        const THREE = TELEPLOT.THREE;
        let renderer;
        try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } // Transparent: what is behind the canvas shows
        catch(e) { this.state.error = "3D needs WebGL, which is not available here"; return undefined; }
        this.state.error = "";
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        host.appendChild(renderer.domElement);

        let scene = new THREE.Scene();
        let camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
        let sky = new THREE.HemisphereLight(0xffffff, 0x555555, 2.2);
        sky.position.set(0, 0, 1);
        let sun = new THREE.DirectionalLight(0xffffff, 1.6);
        sun.position.set(-2, -3, 5);
        scene.add(sky, sun);

        // Raw (not reactive): an application wrapping the library in a UI framework would turn every three.js object into a proxy,
        // which three.js does not survive (and would be slow)
        return TELEPLOT.Vue.markRaw({
            host, renderer, scene, camera, controls: undefined,
            lights: { sky, sun },
            objects: new Map(), // telemetry id -> what draws it
            geometries: {       // Shared, of size 1: shapes are scaled to their size
                cube: new THREE.BoxGeometry(1, 1, 1).rotateX(Math.PI / 2),                  // textures upright on the sides (image top towards z)
                sphere: new THREE.SphereGeometry(0.5, 32, 16).rotateX(Math.PI / 2),         // poles on z
                cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 32).rotateX(Math.PI / 2)  // axis on z
            },
            stl: new Map(),     // url -> {geometry} (undefined while loading or after a failure)
            helpers: undefined, helpersKey: "", unit: 1,
            framed: undefined,  // Box the camera frames: everything drawn so far
            userMoved: false, frame: 0, resizeObserver: undefined
        });
    }

    __setupScene(host) {
        const THREE = TELEPLOT.THREE;
        let three = this.__createThree(host);
        if(!three) return;
        this.three = three;
        three.camera.up.set(0, 0, 1); // z up
        three.camera.position.set(-4, -2.5, 3); // Behind and above: x goes away from the viewer, y to the left
        three.controls = new THREE.OrbitControls(three.camera, three.renderer.domElement);
        three.controls.addEventListener("change", () => this.__requestRender());
        three.controls.addEventListener("start", () => { if(this.three) this.three.userMoved = true; }); // The camera is the user's from now on
        three.resizeObserver = new ResizeObserver(() => this.__resize());
        three.resizeObserver.observe(host);
        this.__resize();
    }

    // Gives back everything __createThree made (and what the view added to it)
    __disposeThree() {
        let three = this.three;
        if(!three) return;
        this.three = undefined;
        cancelAnimationFrame(three.frame);
        if(three.resizeObserver) three.resizeObserver.disconnect();
        if(three.controls) three.controls.dispose();
        for(let object of three.objects.values()) this.__disposeObject(three, object);
        for(let geometry of Object.values(three.geometries)) geometry.dispose();
        for(let entry of three.stl.values()) if(entry.geometry) entry.geometry.dispose();
        this.__disposeHelpers(three);
        three.renderer.dispose();
        three.renderer.forceContextLoss(); // Browsers only allow a few WebGL contexts: give this one back now
        three.renderer.domElement.remove();
    }

    dispose() {
        this.closeLegendList();
        this.__disposeThree();
        super.dispose();
    }

    __resize() {
        let three = this.three;
        if(!three) return;
        let width = three.host.clientWidth, height = three.host.clientHeight;
        if(!width || !height) return;
        three.renderer.setSize(width, height);
        three.camera.aspect = width / height;
        three.camera.updateProjectionMatrix();
        this.__render(); // Right away: a canvas that was resized is blank until drawn
    }

    __requestRender() {
        let three = this.three;
        if(!three || three.frame) return;
        three.frame = requestAnimationFrame(() => { three.frame = 0; this.__render(); });
    }

    __render() {
        if(this.three) this.three.renderer.render(this.three.scene, this.three.camera);
    }

    // ------------------------------------------------------------------ Update

    update(){
        if (!super.__before_update()) return;
        let three = this.three;
        if(!three) return;

        const P = TELEPLOT.protocol;
        let viewGroup = TELEPLOT.view.groups[this.group];
        let timestamp = viewGroup.cursorTimestamp;
        let since = (viewGroup.cursorActive && viewGroup.timestampFrom < viewGroup.timestampTo) ? viewGroup.timestampFrom : -Infinity;

        // Telemetries to draw, and what changed since the last update
        let element = document.getElementById(this.divId);
        let { sources, key } = this.__collectSources(timestamp);
        key += `|${since},${TELEPLOT.theme.key()},${this.options.displayGrid},${this.options.displayAxes},${three.unit},${element ? element.clientWidth : 0}`;
        if(key == this.lastKey) return;
        this.lastKey = key;

        this.__syncObjects(three, sources, timestamp, since);
        this.__updateLegend(sources, element);

        if(!three.userMoved) this.__keepInFrame(three);
        this.__updateHelpers(three);
        this.__requestRender();
    }

    // Telemetries of the view that can be drawn at a time (but "exclude", a telemetry), with what there is to know to draw them:
    // {sources: [{telem, kind, color, state, camera, image, position, hidden, faded}], key}. The key changes when the drawing has to.
    __collectSources(timestamp, exclude) {
        const P = TELEPLOT.protocol;
        let sources = [];
        let key = `${timestamp},${this.options.displayLegend},${this.options.trailLength},${this.options.displayNumberDecimals},${this.highlighted},${Object.keys(this.hidden).join("/")}`;
        let serieIdx = 0;
        for(let telemIdOrName of this.telemetryIdOrNameList){
            let telem = TELEPLOT.datastore.getTelemetry(telemIdOrName);
            if(telem === undefined) continue;
            serieIdx++;
            if(exclude !== undefined && telem.id == exclude.id) continue;
            let kind = ViewScene3D.kindOf(telem);
            if(kind === undefined) continue;
            let shape = kind == "shape";
            let color = telem.getAttribute(P.TELEM_ATTR_COLOR) || TELEPLOT.colors.getColor(serieIdx).toStrRGB();
            let source = { telem, kind, shape, color, state: undefined, camera: undefined, image: undefined, position: undefined,
                hidden: !!this.hidden[telem.id], faded: this.highlighted !== undefined && this.highlighted != telem.id };
            key += `|${telem.id}:${kind}:${color}`;
            if(kind == "camera") {
                source.camera = ViewScene3D.cameraState(telem, timestamp);
                if(!source.camera) continue; // Intrinsics that make no sense
                source.position = source.camera.position;
                key += ":" + JSON.stringify(source.camera);
            }
            else if(shape) {
                source.state = ViewScene3D.shapeState(telem, timestamp, color);
                key += ":" + JSON.stringify(source.state);
                if(source.state.texture.type == P.TEXTURE_TYPE_IMAGE) { // The image of another telemetry: follows it
                    source.image = ViewScene3D.imageAt(TELEPLOT.datastore.getTelemetry(source.state.texture.value), timestamp);
                    key += ":" + (source.image ? source.image.t : "");
                }
                if(source.state.type == P.TELEM_ATTR_SHAPE_TYPE_STL) key += ":" + this.__stlStatus(source.state.url);
            }
            else {
                let entry = telem.data[P.SECTION_TYPE_TELEM_DATA_NUMBER_3D];
                key += `:${entry.lastUpdate}:${entry.timestamps.length}:${entry.lateInsertions}`;
                let index = ViewScene3D.sampleIndex(entry, timestamp);
                if(index >= 0) source.position = entry.data.map((channel) => channel[index]);
            }
            sources.push(source);
        }
        return { sources, key };
    }

    // Objects of the telemetries on display, without the ones that left
    __syncObjects(three, sources, timestamp, since) {
        let kinds = new Map(sources.map((source) => [source.telem.id, source.kind]));
        for(let [id, object] of three.objects) {
            if(kinds.get(id) == object.kind) continue;
            this.__disposeObject(three, object);
            three.objects.delete(id);
        }
        for(let source of sources) {
            if(source.kind == "camera") this.__updateCamera(three, source);
            else if(source.shape) this.__updateShape(three, source);
            else this.__updatePoint(three, source, timestamp, since);
        }
    }

    // Legend: where each telemetry is, in value slots that only grow (entries do not shake when digits come and go)
    __updateLegend(sources, element) {
        const P = TELEPLOT.protocol;
        let legend = sources.map((source) => {
            let id = source.telem.id;
            let position = source.shape ? source.state.position : source.position;
            let value = position ? ViewScene3D.formatPosition(position, this.options.displayNumberDecimals) : "";
            if(value.length > (this.valueChars[id] || 0)) this.valueChars[id] = value.length;
            return { id, name: source.telem.getAttribute(P.TELEM_ATTR_NAME) || String(id), unit: source.telem.getAttribute(P.TELEM_ATTR_UNIT) || "",
                color: source.shape ? source.state.color : source.color, value, valueChars: this.valueChars[id] || 0 };
        });
        if(JSON.stringify(legend) != JSON.stringify(this.state.legend)) this.state.legend = legend;
        let legendKey = legend.map((item) => `${item.id}:${item.valueChars}:${item.name}:${item.unit}`).join("|") + "|" + (element ? element.clientWidth : 0) + "|" + this.options.displayLegend;
        if(legendKey !== this.legendKey) {
            this.legendKey = legendKey;
            TELEPLOT.Vue.nextTick(() => this.layoutLegend()); // The DOM follows the data on the next tick
        }
    }

    // A camera: the pyramid of what it sees, from where it is to the corners of its image
    __updateCamera(three, source) {
        const THREE = TELEPLOT.THREE;
        let camera = source.camera;
        let object = three.objects.get(source.telem.id);
        if(!object) {
            let lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true }));
            object = { kind: "camera", lines, color: "", shapeKey: "" };
            three.objects.set(source.telem.id, object);
            three.scene.add(object.lines);
        }
        let shapeKey = [camera.width, camera.height, camera.fx, camera.fy, camera.cx, camera.cy, camera.depth].join(",");
        if(object.shapeKey != shapeKey) {
            object.shapeKey = shapeKey;
            let c = ViewScene3D.cameraCorners(camera), o = [0, 0, 0];
            let segments = [o, c[0], o, c[1], o, c[2], o, c[3], c[0], c[1], c[1], c[2], c[2], c[3], c[3], c[0]];
            object.lines.geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments.flat(), 3));
            object.lines.geometry.computeBoundingSphere();
            object.lines.geometry.computeBoundingBox();
        }
        object.lines.position.set(camera.position[0], camera.position[1], camera.position[2]);
        object.lines.quaternion.set(camera.quaternion[1], camera.quaternion[2], camera.quaternion[3], camera.quaternion[0]);
        object.lines.visible = !source.hidden;
        object.lines.material.opacity = source.faded ? 0.15 : 1;
        if(object.color != source.color) {
            object.color = source.color;
            ViewScene3D.setColor(object.lines.material.color, source.color);
        }
    }

    __updateShape(three, source) {
        const THREE = TELEPLOT.THREE, P = TELEPLOT.protocol;
        let state = source.state;
        let object = three.objects.get(source.telem.id);
        if(!object) {
            let material = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
            object = { kind: "shape", mesh: new THREE.Mesh(three.geometries.cube, material), color: "", textureKey: "", texture: undefined };
            three.objects.set(source.telem.id, object);
            three.scene.add(object.mesh);
        }
        let mesh = object.mesh;

        // Geometry: an STL file is hidden until it is loaded (and stays hidden when it can't be)
        let geometry = three.geometries.cube;
        if(state.type == P.TELEM_ATTR_SHAPE_TYPE_SPHERE) geometry = three.geometries.sphere;
        else if(state.type == P.TELEM_ATTR_SHAPE_TYPE_CYLINDER) geometry = three.geometries.cylinder;
        else if(state.type == P.TELEM_ATTR_SHAPE_TYPE_STL) geometry = this.__stlGeometry(three, state.url);
        mesh.visible = geometry !== undefined && !source.hidden;
        if(geometry !== undefined && mesh.geometry !== geometry) mesh.geometry = geometry;

        mesh.position.set(state.position[0], state.position[1], state.position[2]);
        mesh.quaternion.set(state.quaternion[1], state.quaternion[2], state.quaternion[3], state.quaternion[0]);
        mesh.scale.set(state.size[0], state.size[1], state.size[2]);

        if(object.color != state.color) {
            object.color = state.color;
            ViewScene3D.setColor(mesh.material.color, state.color);
        }
        let opacity = state.opacity * (source.faded ? 0.15 : 1);
        let transparent = opacity < 1;
        if(mesh.material.transparent != transparent) { mesh.material.transparent = transparent; mesh.material.depthWrite = !transparent; mesh.material.needsUpdate = true; }
        mesh.material.opacity = opacity;

        // Texture: loaded again only when its source changes
        let textureUrl = "";
        if(state.texture.type == P.TEXTURE_TYPE_URL) textureUrl = state.texture.value;
        else if(state.texture.type == P.TEXTURE_TYPE_IMAGE && source.image) textureUrl = source.image.url;
        let textureKey = state.texture.type == P.TEXTURE_TYPE_IMAGE && source.image ? "image:" + state.texture.value + ":" + source.image.t : textureUrl;
        if(textureKey != object.textureKey) {
            object.textureKey = textureKey;
            if(!textureUrl) this.__setTexture(object, undefined);
            else new THREE.TextureLoader().load(textureUrl, (texture) => {
                if(object.textureKey != textureKey || !this.three) { texture.dispose(); return; } // Replaced meanwhile
                texture.colorSpace = THREE.SRGBColorSpace;
                this.__setTexture(object, texture);
                this.__requestRender();
            }, undefined, () => console.warn("Teleplot 3D: cannot load the texture", state.texture.value));
        }
    }

    __setTexture(object, texture) {
        if(object.texture) object.texture.dispose();
        object.texture = texture;
        object.mesh.material.map = texture || null;
        object.mesh.material.needsUpdate = true;
    }

    // Colors come from users: an unknown one must not break the view (three.js warns and keeps the previous color)
    static setColor(target, color) {
        try { target.set(color); } catch(e) { console.warn("Teleplot 3D: unknown color", color); }
    }

    __stlStatus(url) {
        let entry = this.three ? this.three.stl.get(url) : undefined;
        return !entry ? "new" : (entry.geometry ? "ready" : (entry.failed ? "failed" : "loading"));
    }

    __stlGeometry(three, url) {
        if(!url) return undefined;
        let entry = three.stl.get(url);
        if(!entry) {
            entry = { geometry: undefined, failed: false };
            three.stl.set(url, entry);
            new TELEPLOT.THREE.STLLoader().load(url, (geometry) => {
                if(this.three !== three) { geometry.dispose(); return; }
                geometry.computeVertexNormals(); // Many files have no (or null) normals: without them the shape is black
                entry.geometry = geometry;
            }, undefined, (error) => {
                entry.failed = true;
                console.warn("Teleplot 3D: cannot load the STL file", url, error);
            });
        }
        return entry.geometry;
    }

    __updatePoint(three, source, timestamp, since) {
        const THREE = TELEPLOT.THREE;
        let entry = source.telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_NUMBER_3D];
        let object = three.objects.get(source.telem.id);
        if(!object) {
            // The point is a dot of a fixed size on screen (the scale of the scene is unknown), the trail a line behind it
            let dot = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, transparent: true }));
            dot.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
            let line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 }));
            dot.frustumCulled = false; line.frustumCulled = false; // Their bounds change all the time
            object = { kind: "point", dot, line, capacity: 0, color: "" };
            three.objects.set(source.telem.id, object);
            three.scene.add(dot, line);
        }
        if(object.color != source.color) {
            object.color = source.color;
            ViewScene3D.setColor(object.dot.material.color, source.color);
            ViewScene3D.setColor(object.line.material.color, source.color);
        }

        let range = ViewScene3D.trailRange(entry, timestamp, this.options.trailLength, since);
        object.dot.visible = object.line.visible = range !== undefined && !source.hidden;
        object.dot.material.opacity = source.faded ? 0.15 : 1;
        object.line.material.opacity = source.faded ? 0.1 : 0.7;
        if(!range || source.hidden) return;
        let count = range.to - range.from + 1;
        if(count > object.capacity) { // Grows by steps: no allocation on every sample
            object.capacity = Math.max(count, object.capacity * 2, 64);
            object.line.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(object.capacity * 3), 3));
        }
        let positions = object.line.geometry.getAttribute("position");
        let [xs, ys, zs] = entry.data;
        for(let i = 0; i < count; i++) positions.setXYZ(i, xs[range.from + i] || 0, ys[range.from + i] || 0, zs[range.from + i] || 0);
        positions.needsUpdate = true;
        object.line.geometry.setDrawRange(0, count);
        object.line.visible = count > 1;
        let current = object.dot.geometry.getAttribute("position");
        current.setXYZ(0, xs[range.to] || 0, ys[range.to] || 0, zs[range.to] || 0);
        current.needsUpdate = true;
    }

    __disposeObject(three, object) {
        if(object.kind == "camera") {
            three.scene.remove(object.lines);
            object.lines.geometry.dispose();
            object.lines.material.dispose();
        }
        else if(object.kind == "shape") {
            three.scene.remove(object.mesh);
            if(object.texture) object.texture.dispose();
            object.textureKey = "disposed"; // A texture still loading is dropped when it arrives
            object.mesh.material.dispose(); // The geometry is shared
        }
        else {
            three.scene.remove(object.dot, object.line);
            for(let part of [object.dot, object.line]) { part.geometry.dispose(); part.material.dispose(); }
        }
    }

    // Box around everything drawn: {min: [x, y, z], max: [x, y, z]}, undefined when there is nothing
    __bounds() {
        const THREE = TELEPLOT.THREE;
        let box = new THREE.Box3();
        for(let object of this.three.objects.values()) {
            if(object.kind == "camera") { if(object.lines.visible) box.expandByObject(object.lines); }
            else if(object.kind == "shape") { if(object.mesh.visible) box.expandByObject(object.mesh); }
            else if(object.line.visible || object.dot.visible) {
                let positions = object.line.geometry.getAttribute("position");
                let count = positions ? object.line.geometry.drawRange.count : 0;
                for(let i = 0; i < count && i < positions.count; i++) box.expandByPoint(new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)));
                let current = object.dot.geometry.getAttribute("position");
                box.expandByPoint(new THREE.Vector3(current.getX(0), current.getY(0), current.getZ(0)));
            }
        }
        return box.isEmpty() ? undefined : box;
    }

    // Frame what is drawn now, and let the camera keep things in the frame again (double click)
    fitCamera() {
        if(!this.three) return;
        this.three.userMoved = false;
        this.three.framed = undefined;
        this.lastKey = ""; // Framed by the next update
    }

    // The camera looks at everything drawn so far: when something gets out of the box it frames, the box grows and the camera steps back,
    // without changing the direction it looks from.
    __keepInFrame(three) {
        const THREE = TELEPLOT.THREE;
        let box = this.__bounds();
        if(!box || (three.framed && three.framed.containsBox(box))) return;
        if(three.framed) box.union(three.framed);
        three.framed = box;

        let center = box.getCenter(new THREE.Vector3());
        let radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-6);
        let direction = three.camera.position.clone().sub(three.controls.target).normalize();
        let distance = radius / Math.sin(three.camera.fov * Math.PI / 360) ; // The sphere around the box fits in the height of the view
        three.camera.position.copy(center).addScaledVector(direction, distance);
        three.camera.near = distance / 1000;
        three.camera.far = distance * 1000;
        three.camera.updateProjectionMatrix();
        three.controls.target.copy(center);
        three.controls.update();

        // The grid and the axes scale with how far things are from the origin: cells of 1, 10, 0.1...
        let reach = box.clone().expandByPoint(new THREE.Vector3(0, 0, 0)).getSize(new THREE.Vector3()).length() / 2;
        three.unit = Math.pow(10, Math.floor(Math.log10(Math.max(reach, 1e-6))));
    }

    // Ground grid and axes, in the colors of the theme and at the scale of the scene (cells of 1, 10, 0.1...)
    __updateHelpers(three) {
        const THREE = TELEPLOT.THREE;
        let element = document.getElementById(this.divId);
        let line = TELEPLOT.theme.color("--teleplot-line", element, "#d5dbe0"), strong = TELEPLOT.theme.color("--teleplot-muted", element, "#66717c");
        let key = `${this.options.displayGrid},${this.options.displayAxes},${three.unit},${line},${strong}`;
        if(key == three.helpersKey) return;
        three.helpersKey = key;
        this.__disposeHelpers(three);
        three.helpers = new THREE.Group();
        if(this.options.displayGrid) {
            let grid = new THREE.GridHelper(20 * three.unit, 20, new THREE.Color(strong), new THREE.Color(line));
            grid.rotation.x = Math.PI / 2; // three.js grids lie on xz: ours is the ground, xy
            three.helpers.add(grid);
        }
        if(this.options.displayAxes) {
            let axes = new THREE.AxesHelper(three.unit);
            axes.material.depthTest = false; // Always readable, even inside a shape
            axes.renderOrder = 1;
            three.helpers.add(axes);
        }
        three.scene.add(three.helpers);
    }

    __disposeHelpers(three) {
        if(!three.helpers) return;
        three.scene.remove(three.helpers);
        for(let helper of three.helpers.children) helper.dispose();
        three.helpers = undefined;
    }

    // Legend of the telemetries drawn (shared with the image view)
    static legendHTML = `
          <div v-if="options.displayLegend && state.legend.length" class="teleplot-js-scene3d-legend">
              <div class="teleplot-js-chart-legend">
                  <div v-for="(item, i) in state.legend" v-bind:key="item.id" class="teleplot-js-chart-legend-block"
                      v-bind:class="{'teleplot-js-chart-legend-folded': i >= legend.visible, 'teleplot-js-chart-legend-off': hidden[item.id]}"
                      v-bind:style="{'--chip-color': item.color}"
                      v-on:click="onLegendClick(item.id)" v-on:mouseenter="onLegendEnter(item.id)" v-on:mouseleave="onLegendLeave()">
                      <div v-if="item.value" class="teleplot-js-chart-legend-value" v-bind:style="{'min-width': item.valueChars + 'ch'}"><span>{{item.value}}</span></div>
                      <div class="teleplot-js-chart-legend-name"><span>{{item.name}}</span><span v-if="item.unit"> ({{item.unit}})</span></div>
                  </div>
                  <button v-if="legend.folded > 0" type="button" class="teleplot-js-chart-legend-more" v-bind:class="{'teleplot-js-chart-legend-more-open': legend.open}"
                      title="All the telemetries" v-on:click.stop="onLegendMore()">+{{legend.folded}} <span>&#9662;</span></button>
              </div>
              <div v-if="legend.open" class="teleplot-js-scene3d-popover">
                  <div v-for="item in state.legend" v-bind:key="item.id" class="teleplot-js-chart-legend-block"
                      v-bind:class="{'teleplot-js-chart-legend-off': hidden[item.id]}" v-bind:style="{'--chip-color': item.color}"
                      v-on:click="onLegendClick(item.id)" v-on:mouseenter="onLegendEnter(item.id)" v-on:mouseleave="onLegendLeave()">
                      <div class="teleplot-js-chart-legend-name"><span>{{item.name}}</span><span v-if="item.unit"> ({{item.unit}})</span></div>
                      <div class="teleplot-js-chart-legend-value"><span>{{item.value}}</span></div>
                  </div>
              </div>
          </div>
    `;

    static vueHTML = `
        <div class="teleplot-js-scene3d-container teleplot-js-telemetry-card"
        :style=" { '--layout-width': layout.width, '--layout-height': layout.height }"
        ${ViewTelemetries.dragDropHtml}>
          <div class="teleplot-js-scene3d-canvas" @dblclick="onDoubleClick()"></div>
          ${ViewScene3D.legendHTML}
          <div v-if="emptyState.text || state.error" class="teleplot-js-empty">
              <div class="teleplot-js-empty-title">{{state.error || emptyState.text}}</div>
              <div v-if="emptyState.hint && !state.error" class="teleplot-js-empty-hint">{{emptyState.hint}}</div>
          </div>
        </div>
    `;

    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-scene3d-container {
                position: relative;
                width: 100%;
                height: 100%;
                padding: 0;
                overflow: hidden;
            }
            .teleplot-js-scene3d-canvas { /* Out of the flow: the canvas takes the size of the view, never the other way round */
                position: absolute;
                inset: var(--teleplot-accent-w, 2px) 0 0 0; /* The top color of the card stays visible */
                cursor: grab;
                touch-action: none;
            }
            .teleplot-js-scene3d-canvas:active { cursor: grabbing; }
            .teleplot-js-scene3d-canvas canvas { display: block; }
            /* Legend: the row of the charts (.teleplot-js-chart-legend...), at the same place, over the scene. Only its entries take the mouse:
               the scene can be dragged from between them. */
            .teleplot-js-scene3d-legend { position: absolute; z-index: 3; top: 0.5em; left: 0.75em; right: 0.75em; font-size: 0.8em; pointer-events: none; }
            .teleplot-js-scene3d-legend .teleplot-js-chart-legend-block, .teleplot-js-scene3d-legend .teleplot-js-chart-legend-more { pointer-events: auto; }
            .teleplot-js-scene3d-popover { /* the list of all the telemetries, over the scene */
                position: absolute; z-index: 20; top: 1.7em; left: 0; width: min(30em, 100%); max-height: calc(var(--layout-height, 4) * 4em); overflow-y: auto; scrollbar-width: thin;
                font-size: 1.15em; padding: 0.3em 0; box-sizing: border-box; pointer-events: auto;
                background: var(--teleplot-surface); border: 1px solid var(--teleplot-line); border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.25);
            }
            .teleplot-js-scene3d-popover .teleplot-js-chart-legend-block { justify-content: space-between; gap: 1.2em; padding: 0.3em 0.8em; }
            .teleplot-js-scene3d-popover .teleplot-js-chart-legend-block:hover { background: color-mix(in srgb, var(--teleplot-text) 8%, transparent); }
            .teleplot-js-scene3d-popover .teleplot-js-chart-legend-name { overflow: hidden; text-overflow: ellipsis; }
        }
    `;
}

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = ViewScene3D.vueCSS;
    document.head.appendChild(elem);
}

TELEPLOT.view.ViewScene3D = ViewScene3D;
