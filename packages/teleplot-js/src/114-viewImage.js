/*
 * Pictures: an image view shows the pictures of its image telemetries, with the 3D telemetries of the view (shapes, 3D points, clouds)
 * drawn over them as each camera saw them. See doc/3d.md "The image view".
 * - PictureFrame draws one picture, and is what every view that shows a picture uses: the image view (one per picture shown, one per
 *   thumbnail of its filmstrip) and the values view (one per picture line). It is not a view of a dashboard: its owner (the view it is in)
 *   gives it its picture, its options and its group, and updates it.
 * - ViewImage shows one picture of its telemetries (the first at first); when it has several, a filmstrip under the pictures shows
 *   a thumbnail of each: a click shows that one, Shift+click adds it to the selection or takes it away (option "show": the names of the
 *   pictures selected, in the order they were clicked, kept with the dashboard). Option "cameras": "beside" (default), every picture
 *   selected is shown side by side and none is drawn over another; "over", the first one selected is the base, the next ones that can be
 *   drawn in the scene (a depth map with its camera: its points) are drawn over it instead of being shown, the others (plain pictures,
 *   depth maps without camera) are shown beside it; every picture shown then draws the other cameras of the selection, as a 3D view
 *   draws them (their depth points; their cones too when option "cameraCones" is on: off by default here). A toggle at the right end of
 *   the filmstrip switches the option; the one beside it switches "outline", and the first one cycles "overlays" (what is drawn over the
 *   pictures: 2D + 3D, nothing, 2D only, 3D only; the cameras drawn over in "over" mode stay, whatever it says).
 * - A picture is shown as it was received: never resized in its data, never undistorted.
 * - To draw over it the picture needs a camera: intrinsics (TELEM_DATA_CAMERA_INTRINSICS: fx, fy, cx, cy in pixels, for an image of
 *   width x height), optionally lens distortion (TELEM_DATA_CAMERA_DISTORTION: k1, k2, p1, p2, k3), and where the camera is (the shape
 *   position and rotation/quaternion sections, on the image telemetry itself; at the origin and looking along x when never sent).
 *   Intrinsics and distortion follow the usual image convention (pinhole + Brown-Conrady model as in OpenCV: pixel (0, 0) is the center of
 *   the top left pixel, u to the right, v down). The pose is in the frame of the scene: the camera looks along its x, y is to the left of
 *   the image, z to its top.
 * - Without distortion the scene is drawn straight with the camera of the intrinsics. With distortion it is drawn with an ideal camera on
 *   a wider field, and that drawing is bent by the distortion model before being laid over the picture (the picture is not touched).
 *   Without intrinsics nothing can be placed: the picture is shown alone, and a note says why.
 * - What is given in the pixels of a picture (frame FRAME_TYPE_PIXELS) is drawn over it, without any camera.
 * - "outline" option (on by default): only the outline of what is drawn is laid over the picture (a line in the color of each object, where it ends or
 *   meets an object of another color), so that the picture stays visible inside the objects.
 * - Time: everything is shown as it was when the picture was taken (the last sample of each telemetry at or before the time of the
 *   image). Nothing is interpolated. Like the other views it follows the cursor of its group.
 * - The WebGL canvas only exists when there is something to draw over the picture.
 * - A picture of values (a depth map: 16-bit gray PNG or plain pixels, see 108-pictures.js) is decoded by the library and drawn in
 *   colors (option "colormap", between the range of the telemetry or what the picture holds: option "valueRange"), one color per
 *   pixel (never smoothed); pixels without measure stay empty. The pointer reads the value of the pixel under it.
 * The scene itself (objects, legend, hide / highlight) is the one of the 3D view.
 */
class PictureFrame extends ViewScene3D {
    constructor(divId, owner){
        super(divId, [], owner.group);
        this.name = "picture";
        this.type = "teleplot-picture";
        this.owner = owner;          // The view it is in: its options, its group, its telemetries (what is drawn over the picture)
        this.picture = undefined;    // Id of the image telemetry it shows
        this.chrome = true;          // Its color scale, its readout and its notes are drawn on it (false: the owner writes them where it writes values)
        this.overlays = true;        // What is drawn over the picture (false: the picture alone, a thumbnail)
        for(let key in PictureFrame.DEFAULTS) this.options[key] = PictureFrame.DEFAULTS[key];
        this.options.displayLegend = false;

        this.state.imageUrl = "";  // The picture, as a data url
        this.state.frameWidth = 0; // Size of the picture on the page (px): it is fitted in its place
        this.state.frameHeight = 0;
        this.state.note = "";      // Why nothing is drawn over the picture, when something should be
        this.state.valuesShown = false; // The picture is one of values, drawn in colors on a canvas (not an img)
        this.state.colorScale = undefined; // {gradient, low, high, unit}: the colors of a picture of values and what they are worth
        this.state.readout = undefined;    // {text, x, y}: the value of the pixel under the pointer
        this.state.scaleCorner = "br";     // Corner of the color scale: bottom right, unless it would hide the pixel under the pointer (see scaleCorner)
        this.values = TELEPLOT.Vue.markRaw({ decoded: undefined, key: "", lut: {}, imageData: undefined, pointer: undefined, settings: undefined, error: "" });
        this.imageKey = "";
        this.natural = undefined;  // {width, height} of the picture, in its own pixels
    }

    // Options of a picture (the image view has them; another owner, the values view, may not: these are used then)
    static DEFAULTS = {
        overlayOpacity: 50,      // Percent: how much what is drawn over the picture hides it
        outline: true,           // Only the outlines of the objects (the picture stays visible inside them), not the objects themselves
        outlineWidth: 3,         // Width of those outlines, in pixels of the page
        pixelDrawings: true,     // What is drawn in the pixels of the picture (frame FRAME_TYPE_PIXELS) is drawn over it
        colormap: "turbo",       // Pictures of values: their colors
        valueRange: "range",     // Pictures of values: colors between the ends of the range of the telemetry when it has both ("range"), or what each picture holds ("picture")
        displayColorScale: true, // Pictures of values: the colors and their values, under the picture
        overlays: "both",        // What is drawn over the picture: "both", "2d" (what is given in its pixels), "3d" (the scene, through its camera), "none"
        cameraCones: false,      // Other cameras drawn over the picture ("over" mode): their cones too, not only their depth points (a camera a few centimetres away has a cone that crosses the whole picture)
    };
    static OVERLAYS = ["both", "2d", "3d", "none"];
    // What a picture draws over it, for option "overlays": {pixelSources (in its pixels: 2D), sources (in the scene, through its camera: 3D), overlays}.
    // The other cameras drawn over it (option "cameras" "over": their depth points) are not concerned: their own toggle says.
    static splitOverlays(all, option) {
        let overlays = PictureFrame.OVERLAYS.includes(option) ? option : "both";
        let pixelSources = all.filter((source) => ViewScene3D.pixelFrame(source.telem) !== undefined);
        let sources = all.filter((source) => !pixelSources.includes(source));
        let cameras = sources.filter((source) => source.kind === "camera" && source.telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE] !== undefined);
        if(overlays === "none" || overlays === "3d") pixelSources = [];
        if(overlays === "none" || overlays === "2d") sources = cameras;
        return { pixelSources, sources, overlays };
    }
    // What the frame takes from its owner when the owner has it
    static OWNER_OPTIONS = [...Object.keys(PictureFrame.DEFAULTS), "displayNumberDecimals", "trailLength", "pointSize", "pointColorByHeight", "cloudCount", "cloudInterval", "depthPoints"];

    // The telemetries drawn in the pixels of the pictures of an image telemetry (by its name), looked for again only when telemetries come
    static pixelTelemetries(name) {
        let count = Object.keys(TELEPLOT.datastore.telemetries).length;
        let cached = PictureFrame.__pixelCache.get(name);
        if(cached && cached.count === count) return cached.ids;
        let ids = [];
        for(let id in TELEPLOT.datastore.telemetries) if(ViewScene3D.pixelFrame(TELEPLOT.datastore.telemetries[id]) === name) ids.push(TELEPLOT.datastore.telemetries[id].id);
        PictureFrame.__pixelCache.set(name, { count, ids });
        return ids;
    }
    static __pixelCache = new Map();

    // Its options, group, hidden telemetries and telemetries come from its owner. The telemetries are the owner's, in its order (the
    // same colors as in the owner's legend), with what is drawn in the pixels of the picture.
    __followOwner() {
        let owner = this.owner;
        this.group = owner.group;
        for(let key of PictureFrame.OWNER_OPTIONS) {
            let value = owner.options[key];
            if(value !== undefined && this.options[key] !== value) this.options[key] = value;
        }
        if(owner.hidden) this.hidden = owner.hidden;
        this.highlighted = owner.highlighted;
        let picture = TELEPLOT.datastore.getTelemetry(this.picture);
        let list = this.overlays ? Array.from(owner.telemetryIdOrNameList || []) : [];
        if(picture !== undefined) {
            let ids = list.map((entry) => { let telem = TELEPLOT.datastore.getTelemetry(entry); return telem ? telem.id : entry; });
            if(!ids.includes(picture.id)) list.unshift(picture.id);
            let name = picture.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME);
            if(this.overlays && this.options.pixelDrawings && name) for(let id of PictureFrame.pixelTelemetries(name)) if(!ids.includes(id)) list.push(id);
        }
        this.telemetryIdOrNameList = list;
    }

    getImageTelemetry() {
        return TELEPLOT.datastore.getTelemetry(this.picture);
    }

    // Draws over the picture what is in its pixels, and the scene; never another picture of the same view
    __takesFrame(pixels) {
        if(pixels === undefined) return true;
        let telem = this.getImageTelemetry();
        return telem !== undefined && telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) === pixels;
    }
    // Pictures are not drawn over each other, but in "over" mode the other cameras of the owner's selection are (its own is not)
    __skipsTelemetry(telem) {
        if(telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE] === undefined) return false;
        let owner = this.owner;
        if(!this.overlays || !owner || owner.options.cameras !== "over" || typeof owner.selectedPictures !== "function") return true;
        return telem.id === this.picture || !ViewScene3D.isCamera(telem) || !owner.selectedPictures().includes(telem);
    }

    getEmptyState() { return { text: "", hint: "" }; }
    __sync(element) {} // (not a view of a dashboard: no title, no time group mark, no top color)

    // Draws, over the picture, what is given in its pixels: no camera is needed for that. The canvas has the size of the picture on the page.
    __drawPixels(element, sources, timestamp, since) {
        let canvas = element && element.querySelector(".teleplot-js-image-pixels");
        if(!canvas) return;
        let width = this.state.frameWidth, height = this.state.frameHeight;
        let ratio = Math.min(window.devicePixelRatio || 1, 2);
        if(canvas.width !== Math.max(1, Math.floor(width * ratio)) || canvas.height !== Math.max(1, Math.floor(height * ratio))) {
            canvas.width = Math.max(1, Math.floor(width * ratio)); canvas.height = Math.max(1, Math.floor(height * ratio));
        }
        let context = canvas.getContext("2d");
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        if(!sources.length || !this.natural || !width || !height) return;
        const View2D = TELEPLOT.view.ViewScene2D;
        let items = View2D.buildItems(sources, { pixels: true, timestamp, since, trailLength: this.options.trailLength });
        // Pixel (0, 0) is the center of the top left pixel: the picture goes from -0.5 to its size - 0.5
        let scale = width / this.natural.width;
        View2D.draw(context, items, { width, height, u: this.natural.width / 2 - 0.5, v: this.natural.height / 2 - 0.5, scale, down: true }, undefined, Math.max(1, Number(this.options.pointSize) || 3));
    }

    // ------------------------------------------------------------------ Pictures of values

    // Colors of a decoded picture of values on the canvas of the view, again only when the picture or how it is colored changes
    __drawValues(element, telem, decoded, imageKey) {
        let settings = TELEPLOT.pictures.settings(telem);
        let range = decoded.values ? TELEPLOT.pictures.colorRange(decoded, settings, telem, this.options.valueRange) : undefined;
        let colormap = TELEPLOT.pictures.COLORMAPS[this.options.colormap] ? this.options.colormap : "turbo";
        let canvas = element && element.querySelector(".teleplot-js-image-values");
        let key = `${imageKey}:${decoded.width}x${decoded.height}:${colormap}:${range ? range.min + "," + range.max : ""}:${settings.scale}:${settings.invalid}:${!!canvas}`;
        if(key === this.values.key && this.values.decoded === decoded) return;
        this.values.key = key;
        this.values.decoded = decoded;
        this.values.settings = settings;
        this.values.error = decoded.error ? "This picture of values cannot be read: " + decoded.error : "";
        if(!canvas || !decoded.values) return;
        if(canvas.width !== decoded.width || canvas.height !== decoded.height) { canvas.width = decoded.width; canvas.height = decoded.height; }
        let context = canvas.getContext("2d");
        let imageData = this.values.imageData;
        if(!imageData || imageData.width !== decoded.width || imageData.height !== decoded.height) imageData = this.values.imageData = context.createImageData(decoded.width, decoded.height);
        if(range) TELEPLOT.pictures.colorize(decoded, { min: range.min, max: range.max, colormap, scale: settings.scale, invalid: settings.invalid }, imageData.data, this.values.lut);
        else imageData.data.fill(0); // No pixel has a measure
        context.putImageData(imageData, 0, 0);
        if(!this.natural || this.natural.width !== decoded.width || this.natural.height !== decoded.height) {
            this.natural = { width: decoded.width, height: decoded.height };
            this.__layoutFrame();
        }
        let unit = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT) || "";
        this.__showValueInfo(range ? { gradient: TELEPLOT.pictures.gradient(colormap), low: this.__formatValue(range.min), high: this.__formatValue(range.max), unit } : undefined);
        this.__readout();
    }

    __formatValue(value) {
        let decimals = Math.max(0, Math.min(10, Math.floor(Number(this.options.displayNumberDecimals)) || 0));
        return ViewScene3D.formatPosition([value], decimals);
    }

    __showValueInfo(scale) {
        if(!this.options.displayColorScale) scale = undefined;
        if(JSON.stringify(scale) !== JSON.stringify(this.state.colorScale)) this.state.colorScale = scale;
    }

    // The pointer on the picture (undefined: it left): the value of the pixel under it
    __framePointer(event) {
        let corner = "br";
        if(event === undefined) this.values.pointer = undefined;
        else {
            let box = event.currentTarget.getBoundingClientRect();
            this.values.pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
            let element = document.getElementById(this.divId);
            let scale = element && element.querySelector(".teleplot-js-image-scale"), place = element && element.querySelector(".teleplot-js-picture");
            if(scale && place) corner = PictureFrame.scaleCorner({ x: event.clientX, y: event.clientY }, scale.getBoundingClientRect(), place.getBoundingClientRect(), this.state.scaleCorner);
        }
        if(corner !== this.state.scaleCorner) this.state.scaleCorner = corner;
        this.__readout();
    }

    // The corner of the color scale ("br", "bl", "tr", "tl"): where it is, unless it would cover the pointer; then the first corner of
    // bottom right, bottom left, top right, top left where it would not. pointer: {x, y}, scale and place: rectangles {left, top, right,
    // bottom} of the scale (where it is now) and of the place of the picture, in the same coordinates. Its margins are kept.
    static scaleCorner(pointer, scale, place, current="br", pad=4) {
        let width = scale.right - scale.left, height = scale.bottom - scale.top;
        let mx = current[1] === "r" ? place.right - scale.right : scale.left - place.left;
        let my = current[0] === "b" ? place.bottom - scale.bottom : scale.top - place.top;
        let covers = (corner) => {
            let left = corner[1] === "r" ? place.right - mx - width : place.left + mx;
            let top = corner[0] === "b" ? place.bottom - my - height : place.top + my;
            return pointer.x >= left - pad && pointer.x <= left + width + pad && pointer.y >= top - pad && pointer.y <= top + height + pad;
        };
        if(!covers(current)) return current;
        return ["br", "bl", "tr", "tl"].find((corner) => !covers(corner)) || current;
    }

    __readout() {
        let pointer = this.values.pointer, decoded = this.values.decoded;
        let width = this.state.frameWidth, height = this.state.frameHeight;
        let readout = undefined;
        if(pointer && this.state.valuesShown && decoded && decoded.values && width > 0 && height > 0) {
            let u = Math.floor(pointer.x / width * decoded.width), v = Math.floor(pointer.y / height * decoded.height);
            if(u >= 0 && v >= 0 && u < decoded.width && v < decoded.height) {
                let value = TELEPLOT.pictures.valueAt(decoded, u, v, this.values.settings);
                let telem = TELEPLOT.datastore.getTelemetry(this.picture);
                let unit = telem ? telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_UNIT) || "" : "";
                let text = (value === undefined ? "no measure" : this.__formatValue(value) + (unit ? " " + unit : "")) + "  (" + u + ", " + v + ")";
                readout = { text, x: pointer.x, y: pointer.y, right: pointer.x > width / 2, below: pointer.y < 40 };
            }
        }
        if(JSON.stringify(readout) !== JSON.stringify(this.state.readout)) this.state.readout = readout;
    }

    // ------------------------------------------------------------------ Page

    __mounted(element) {
        this.imageKey = "";
        this.state.imageUrl = "";
        this.values.key = "";
        this.lastKey = "";
        let stage = element.querySelector(".teleplot-js-image-stage");
        this.stageObserver = new ResizeObserver(() => this.__layoutFrame());
        this.stageObserver.observe(stage);
    }

    __imageLoaded(img) {
        this.natural = { width: img.naturalWidth, height: img.naturalHeight };
        this.__layoutFrame();
    }

    // The picture takes as much of its place as it can without being deformed; what is drawn over it has exactly its place
    __layoutFrame() {
        let element = document.getElementById(this.divId);
        let stage = element && element.querySelector(".teleplot-js-image-stage");
        if(!stage || !this.natural || !this.natural.width || !this.natural.height) return;
        let scale = Math.min(stage.clientWidth / this.natural.width, stage.clientHeight / this.natural.height);
        let width = Math.max(0, Math.floor(this.natural.width * scale)), height = Math.max(0, Math.floor(this.natural.height * scale));
        if(width != this.state.frameWidth) this.state.frameWidth = width;
        if(height != this.state.frameHeight) this.state.frameHeight = height;
    }

    dispose() {
        if(this.stageObserver) { this.stageObserver.disconnect(); this.stageObserver = undefined; }
        super.dispose();
    }

    __disposeThree() {
        if(this.three) this.__disposeWarp(this.three);
        super.__disposeThree();
    }

    // ------------------------------------------------------------------ Update (called by its owner)

    update(){
        this.__followOwner();
        if (!super.__before_update()) return;
        let element = document.getElementById(this.divId);
        let viewGroup = TELEPLOT.view.groups[this.group];
        let cursor = viewGroup.cursorTimestamp;
        let since = (viewGroup.cursorActive && viewGroup.timestampFrom < viewGroup.timestampTo) ? viewGroup.timestampFrom : -Infinity;

        // The picture
        let imageTelem = this.getImageTelemetry();
        let image = imageTelem ? ViewScene3D.imageAt(imageTelem, cursor) : undefined;
        let imageKey = image ? imageTelem.id + ":" + image.t : "";
        let values = image !== undefined && TELEPLOT.pictures.isValues(image.entry, image.index);
        if(values) {
            // Decoded by the library (a PNG takes a few updates): the picture shown so far stays until then
            let decoded = TELEPLOT.pictures.decode(image.entry, image.index);
            if(decoded !== undefined) this.__drawValues(element, imageTelem, decoded, imageKey);
            if(this.state.imageUrl) this.state.imageUrl = "";
            if(!this.state.valuesShown) this.state.valuesShown = true;
            this.imageKey = imageKey;
        }
        else {
            if(this.state.valuesShown) { this.state.valuesShown = false; this.values.decoded = undefined; this.values.key = ""; this.values.error = ""; this.state.readout = undefined; this.__showValueInfo(undefined); }
            if(imageKey != this.imageKey) {
                this.imageKey = imageKey;
                this.state.imageUrl = image ? image.url : "";
            }
        }

        // What to draw over it: the scene as it was when the picture was taken, seen by its camera
        let timestamp = image ? image.t : cursor;
        let camera = image ? ViewScene3D.cameraState(imageTelem, timestamp) : undefined;
        let collected = this.overlays ? this.__collectSources(timestamp, imageTelem) : { sources: [], key: "" }, key = collected.key;
        let { pixelSources, sources, overlays } = PictureFrame.splitOverlays(collected.sources, this.options.overlays);
        key += "|" + overlays;
        let note = (image && sources.length && !camera) ? "No camera parameters for this image: nothing can be drawn over it" : "";
        if(values && this.values.error) note = this.values.error;
        if(note != this.state.note) this.state.note = note;
        let draw = sources.length > 0 && camera !== undefined && this.state.frameWidth > 0 && this.state.frameHeight > 0;
        if(draw && !this.three) this.__setupOverlay(element);

        key += `|${since},${JSON.stringify(camera)},${this.state.frameWidth}x${this.state.frameHeight},${this.natural ? this.natural.width + "x" + this.natural.height : ""},${draw},${!!this.three},${element ? element.clientWidth : 0},${this.options.outline},${this.options.outlineWidth}`;
        if(key == this.lastKey) return;
        this.lastKey = key;

        this.__drawPixels(element, image ? pixelSources : [], timestamp, since);
        let three = this.three;
        if(!three) return;
        three.canvas.style.visibility = draw ? "" : "hidden";
        three.ready = draw;
        if(!draw) return;
        this.__syncObjects(three, sources, timestamp, since);
        this.__applyCamera(three, camera);
        this.__requestRender();
    }

    __setupOverlay(element) {
        let host = element && element.querySelector(".teleplot-js-image-overlay");
        if(!host) return;
        let three = this.__createThree(host);
        if(!three) return;
        three.ready = false;
        three.warp = undefined; // Second pass, when the drawing is not laid as it is: bent like the lens does (distortion), reduced to outlines
        three.lights.flat = new TELEPLOT.THREE.AmbientLight(0xffffff, Math.PI); // Outlines: every object in its plain color, no shading
        three.lights.flat.visible = false;
        three.scene.add(three.lights.flat);
        three.sizeKey = "";
        this.three = three;
    }

    // The three.js camera becomes the camera of the picture
    __applyCamera(three, camera) {
        const THREE = TELEPLOT.THREE;
        let width = this.state.frameWidth, height = this.state.frameHeight;
        if(three.sizeKey != width + "x" + height) {
            three.sizeKey = width + "x" + height;
            this.__setSize(three, width, height);
        }

        // Depth range: from very close to behind everything there is
        let eye = new THREE.Vector3(camera.position[0], camera.position[1], camera.position[2]);
        let far = 1000;
        let box = this.__bounds();
        if(box) {
            let sphere = box.getBoundingSphere(new THREE.Sphere());
            far = Math.max((eye.distanceTo(sphere.center) + sphere.radius) * 1.5, 1e-6);
        }
        let near = far / 5000;

        let win = camera.distortion ? ViewImage.idealWindow(camera) : ViewImage.imageWindow(camera);
        three.camera.projectionMatrix.fromArray(ViewImage.projectionMatrix(camera, win, near, far));
        three.camera.projectionMatrixInverse.copy(three.camera.projectionMatrix).invert();
        let fix = ViewImage.THREE_CAMERA_ROTATION;
        three.camera.position.copy(eye);
        three.camera.quaternion.set(camera.quaternion[1], camera.quaternion[2], camera.quaternion[3], camera.quaternion[0])
            .multiply(new THREE.Quaternion(fix[1], fix[2], fix[3], fix[0]));
        three.camera.updateMatrixWorld(true);

        // Outlines are found where colors change: objects are drawn in their plain color, without the shading of the lights
        let outline = !!this.options.outline;
        three.lights.flat.visible = outline;
        three.lights.sky.visible = three.lights.sun.visible = !outline;

        if(camera.distortion || outline) this.__updateWarp(three, camera, win, outline);
        else this.__disposeWarp(three);
    }

    // Second pass: the scene is drawn by the ideal camera in a texture, which this pass lays onto the picture.
    // - Distortion: for each pixel of the picture, the pass finds the ideal point the lens sends there (same approximations as
    //   undistortPoint) and takes its color. Without distortion the coefficients are null and the point is the pixel itself.
    // - Outlines: a pixel is only drawn where what is around it has another color (the edge of an object).
    __updateWarp(three, camera, win, outline) {
        const THREE = TELEPLOT.THREE;
        if(!three.warp) {
            let material = new THREE.ShaderMaterial({
                uniforms: {
                    map: { value: null }, focal: { value: new THREE.Vector2() }, center: { value: new THREE.Vector2() }, size: { value: new THREE.Vector2() },
                    radial: { value: new THREE.Vector3() }, tangential: { value: new THREE.Vector2() }, win: { value: new THREE.Vector4() },
                    outline: { value: 0 }
                },
                vertexShader: ViewImage.warpVertexShader, fragmentShader: ViewImage.warpFragmentShader,
                blending: THREE.NoBlending, depthTest: false, depthWrite: false
            });
            let scene = new THREE.Scene();
            scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
            three.warp = { target: undefined, targetKey: "", material, scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
        }
        // The texture covers the ideal window with the pixel density of the picture on the page
        let ratio = three.renderer.getPixelRatio();
        let targetWidth = Math.min(4096, Math.max(1, Math.round(this.state.frameWidth * ratio * (win.u1 - win.u0) / camera.width)));
        let targetHeight = Math.min(4096, Math.max(1, Math.round(this.state.frameHeight * ratio * (win.v1 - win.v0) / camera.height)));
        if(three.warp.targetKey != targetWidth + "x" + targetHeight) {
            three.warp.targetKey = targetWidth + "x" + targetHeight;
            if(three.warp.target) three.warp.target.dispose();
            three.warp.target = new THREE.WebGLRenderTarget(targetWidth, targetHeight, { samples: 4 });
        }
        let uniforms = three.warp.material.uniforms, d = camera.distortion || [0, 0, 0, 0, 0];
        let lineWidth = Math.max(1, Math.min(20, Number(this.options.outlineWidth) || 3)); // px of the page
        uniforms.outline.value = outline ? lineWidth / 2 * camera.width / Math.max(1, this.state.frameWidth) : 0; // Half the width of the line, in pixels of the picture
        uniforms.map.value = three.warp.target.texture;
        uniforms.focal.value.set(camera.fx, camera.fy);
        uniforms.center.value.set(camera.cx, camera.cy);
        uniforms.size.value.set(camera.width, camera.height);
        uniforms.radial.value.set(d[0], d[1], d[4]);
        uniforms.tangential.value.set(d[2], d[3]);
        uniforms.win.value.set(win.u0, win.v0, win.u1, win.v1);
    }

    __disposeWarp(three) {
        if(!three.warp) return;
        if(three.warp.target) three.warp.target.dispose();
        three.warp.material.dispose();
        three.warp.scene.children[0].geometry.dispose();
        three.warp = undefined;
    }

    __render() {
        let three = this.three;
        if(!three || !three.ready) return;
        this.__present(three, (renderer) => {
            if(!three.warp) { renderer.render(three.scene, three.camera); return; }
            renderer.setRenderTarget(three.warp.target);
            renderer.clear();
            renderer.render(three.scene, three.camera);
            renderer.setRenderTarget(null);
            renderer.render(three.warp.scene, three.warp.camera);
        });
    }

    static vueHTML = `
        <div class="teleplot-js-picture">
          <div class="teleplot-js-image-stage">
              <div class="teleplot-js-image-frame" v-bind:style="state.frameWidth ? {width: state.frameWidth + 'px', height: state.frameHeight + 'px'} : {}"
                v-on:pointermove="onFramePointer($event)" v-on:pointerleave="onFrameLeave()">
                  <img v-if="state.imageUrl" v-bind:src="state.imageUrl" draggable="false" alt="" v-on:load="onImageLoad($event)"/>
                  <canvas v-show="state.valuesShown" class="teleplot-js-image-values"></canvas>
                  <div class="teleplot-js-image-overlay" v-bind:style="{opacity: Math.max(0, Math.min(100, options.overlayOpacity)) / 100}"></div>
                  <canvas class="teleplot-js-image-pixels"></canvas>
                  <div v-if="state.readout && self.chrome" class="teleplot-js-image-readout" v-bind:class="{right: state.readout.right, below: state.readout.below}"
                    v-bind:style="{left: state.readout.x + 'px', top: state.readout.y + 'px'}">{{state.readout.text}}</div>
              </div>
          </div>
          <div v-if="self.chrome && state.colorScale && state.valuesShown" class="teleplot-js-image-scale" v-bind:class="'teleplot-js-image-scale-' + state.scaleCorner">
              <span>{{state.colorScale.low}}</span><i v-bind:style="{background: state.colorScale.gradient}"></i><span>{{state.colorScale.high}}<small v-if="state.colorScale.unit"> {{state.colorScale.unit}}</small></span>
          </div>
          <div v-if="self.chrome && (state.note || state.error || state.loadNote)" class="teleplot-js-image-note teleplot-js-note" v-bind:class="{'teleplot-js-note-folded': state.noteFolded}"
              v-bind:title="state.noteFolded ? (state.error || state.note || state.loadNote) : 'Click to fold this note'" v-on:click.stop="onNoteClick()">{{state.noteFolded ? noteShort(state.error || state.note || state.loadNote) : (state.error || state.note || state.loadNote)}}</div>
        </div>
    `;
}

/*
 * The image view: the pictures of its telemetries, one at first, and a filmstrip of all of them when there are several (see above).
 */
class ViewImage extends ViewScene3D {
    constructor(divId, telemetryIdOrNameList, group="default"){
        super(divId, telemetryIdOrNameList, group);
        this.name = "image";
        this.type = "teleplot-image";
        this.supportedDataTypes = [""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE];
        this.supportedLabel = "image";

        for(let key in PictureFrame.DEFAULTS) this.options[key] = PictureFrame.DEFAULTS[key]; // (see PictureFrame.DEFAULTS; pixelDrawings: the view also takes those telemetries in its list)
        this.options.show = []; // Names of the pictures selected, in the order they were clicked (none: the first one). The filmstrip sets it.
        this.options.cameras = "beside"; // "beside": the pictures selected side by side; "over": the first is the base, the cameras that can be drawn go over it (see above)

        this.layout.width = 2;
        this.layout.height = 6;

        this.state.shown = []; // [{id, divId}]: the places of the pictures shown
        this.state.strip = []; // [{id, divId, name, tip, selected, order, over}]: the filmstrip, when there are several pictures
        this.state.cameras = "beside"; // The toggles of the filmstrip: option "cameras", option "outline"
        this.state.outline = true;
        this.state.overlays = "both";
        this.frames = TELEPLOT.Vue.markRaw(new Map()); // "shown:<id>" / "strip:<id>" -> PictureFrame
        this.pixelsKnown = TELEPLOT.Vue.markRaw({ counts: new Map(), taken: new Set() }); // Telemetries drawn in the pixels of its pictures that the view took by itself
    }

    // The telemetries of the view that have pictures, in its order
    getPictureTelemetries() {
        let pictures = [];
        for(let entry of this.telemetryIdOrNameList) {
            let telem = TELEPLOT.datastore.getTelemetry(entry);
            if(telem !== undefined && telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE] !== undefined && !pictures.includes(telem)) pictures.push(telem);
        }
        return pictures;
    }

    // The first of them
    getImageTelemetry() {
        return this.getPictureTelemetries()[0];
    }

    // The pictures selected: the ones the option "show" names, in its order (the order they were clicked); the first picture of the
    // view when it names none of them
    selectedPictures(pictures = this.getPictureTelemetries()) {
        let names = Array.isArray(this.options.show) ? this.options.show : [];
        let selected = [];
        for(let name of names) {
            let telem = pictures.find((t) => t.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) === name);
            if(telem !== undefined && !selected.includes(telem)) selected.push(telem);
        }
        return selected.length ? selected : pictures.slice(0, 1);
    }

    // Can a picture be drawn over another one ("over" mode) ? A depth map with its camera: its points are placed in the scene
    static drawsOver(telem) {
        if(!ViewScene3D.isCamera(telem) || !TELEPLOT.pictures.settings(telem).depth) return false;
        let entry = telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE];
        return !!entry && TELEPLOT.pictures.isValues(entry, entry.timestamps.length - 1);
    }

    // The pictures shown: the selection ("beside"); in "over" mode its first one and those that cannot be drawn over it
    shownPictures(pictures = this.getPictureTelemetries()) {
        let selected = this.selectedPictures(pictures);
        if(this.options.cameras !== "over") return selected;
        return selected.filter((telem, i) => i === 0 || !ViewImage.drawsOver(telem));
    }

    // A click on a thumbnail: that picture alone (add: after the others, or taken away when it is selected; one always stays)
    choosePicture(id, add=false) {
        let pictures = this.getPictureTelemetries();
        let telem = pictures.find((t) => t.id == id);
        if(telem === undefined) return;
        let selected = this.selectedPictures(pictures);
        let next = [telem];
        if(add) {
            next = selected.includes(telem) ? selected.filter((t) => t !== telem) : selected.concat([telem]);
            if(next.length === 0) return;
        }
        this.options.show = next.map((t) => t.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME));
    }

    // The toggles of the filmstrip: the other cameras beside, or over the base; what is drawn over the pictures as outlines, or whole
    toggleCameras() {
        this.options.cameras = this.options.cameras === "over" ? "beside" : "over";
    }
    toggleOutline() {
        this.options.outline = !this.options.outline;
    }
    // Cycles what is drawn over the pictures: 2D + 3D, nothing, 2D only, 3D only
    cycleOverlays() {
        let order = ["both", "none", "2d", "3d"], at = order.indexOf(this.options.overlays);
        this.options.overlays = order[(at < 0 ? 0 : at + 1) % order.length];
    }

    // What is drawn in the pixels of a picture belongs on it: the view takes those telemetries by itself (once each: one that was
    // removed from the view is not taken again)
    __takePixelTelemetries(imageTelem) {
        let name = imageTelem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME);
        let count = Object.keys(TELEPLOT.datastore.telemetries).length;
        if(!name || this.pixelsKnown.counts.get(name) === count) return;
        this.pixelsKnown.counts.set(name, count);
        for(let id of PictureFrame.pixelTelemetries(name)) {
            if(this.pixelsKnown.taken.has(id)) continue;
            this.pixelsKnown.taken.add(id);
            this.addTelemetry(id);
        }
    }

    // Its legend lists what is drawn over its pictures (not the pictures themselves)
    __takesFrame(pixels) {
        return pixels === undefined || this.getPictureTelemetries().some((telem) => telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) === pixels);
    }
    // (and, in "over" mode with several pictures selected, the cameras drawn over the others)
    __skipsTelemetry(telem) {
        if(telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE] === undefined) return false;
        if(this.options.cameras !== "over") return true;
        let selected = this.selectedPictures();
        return selected.length < 2 || !selected.includes(telem) || !ViewScene3D.isCamera(telem);
    }

    getEmptyState() {
        return ViewTelemetries.prototype.getEmptyState.call(this); // Nothing to show without an image, whatever else there is
    }

    // ------------------------------------------------------------------ Camera model (no three.js here)

    // Lens distortion (Brown-Conrady, the model of OpenCV) of a point of the normalised image plane (x = X/Z, y = Y/Z): where the lens
    // really sends it. distortion: [k1, k2, p1, p2, k3]
    static distortPoint(x, y, distortion) {
        let [k1, k2, p1, p2, k3] = distortion;
        let r2 = x * x + y * y;
        let radial = 1 + r2 * (k1 + r2 * (k2 + r2 * k3));
        return [x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x), y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y];
    }

    // The other way round: the ideal point that the lens sends to (xd, yd). No formula exists: successive approximations (same as OpenCV).
    static undistortPoint(xd, yd, distortion, iterations=20) {
        let [k1, k2, p1, p2, k3] = distortion;
        let x = xd, y = yd;
        for(let i = 0; i < iterations; i++) {
            let r2 = x * x + y * y;
            let radial = 1 + r2 * (k1 + r2 * (k2 + r2 * k3));
            let dx = 2 * p1 * x * y + p2 * (r2 + 2 * x * x), dy = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;
            x = (xd - dx) / radial;
            y = (yd - dy) / radial;
        }
        return [x, y];
    }

    // Pixel where a camera sees a point given in its own frame (x forward, y left, z up), lens distortion included: [u, v], or undefined
    // for a point that is not in front of it. The reference of what the view draws.
    static projectPoint(camera, point) {
        let [forward, left, up] = point;
        if(!(forward > 0)) return undefined;
        let x = -left / forward, y = -up / forward; // Image plane: x to the right, y down
        if(camera.distortion) [x, y] = ViewImage.distortPoint(x, y, camera.distortion);
        return [camera.fx * x + camera.cx, camera.fy * y + camera.cy];
    }

    // Part of the image plane to draw, in pixels: {u0, v0, u1, v1}. The picture itself: half a pixel around the centers of its pixels.
    static imageWindow(camera) {
        return { u0: -0.5, v0: -0.5, u1: camera.width - 0.5, v1: camera.height - 0.5 };
    }

    // With distortion: the part of the ideal (pinhole) image that the lens brings into the picture, found by following its border.
    // Limited to 3 times the picture around it: coefficients that make no sense must not ask for a gigantic drawing.
    static idealWindow(camera, steps=32) {
        let win = ViewImage.imageWindow(camera);
        if(!camera.distortion) return win;
        let box = { u0: Infinity, v0: Infinity, u1: -Infinity, v1: -Infinity };
        let add = (u, v) => {
            let [x, y] = ViewImage.undistortPoint((u - camera.cx) / camera.fx, (v - camera.cy) / camera.fy, camera.distortion);
            let iu = camera.fx * x + camera.cx, iv = camera.fy * y + camera.cy;
            if(!Number.isFinite(iu) || !Number.isFinite(iv)) return;
            box.u0 = Math.min(box.u0, iu); box.u1 = Math.max(box.u1, iu);
            box.v0 = Math.min(box.v0, iv); box.v1 = Math.max(box.v1, iv);
        };
        for(let i = 0; i <= steps; i++) {
            let u = win.u0 + (win.u1 - win.u0) * i / steps, v = win.v0 + (win.v1 - win.v0) * i / steps;
            add(u, win.v0); add(u, win.v1); add(win.u0, v); add(win.u1, v);
        }
        if(!(box.u1 > box.u0 && box.v1 > box.v0)) return win;
        return {
            u0: Math.max(Math.min(box.u0, win.u0), win.u0 - camera.width), u1: Math.min(Math.max(box.u1, win.u1), win.u1 + camera.width),
            v0: Math.max(Math.min(box.v0, win.v0), win.v0 - camera.height), v1: Math.min(Math.max(box.v1, win.v1), win.v1 + camera.height)
        };
    }

    // Projection matrix (16 numbers, column after column: what three.js and WebGL take) of the pinhole camera of the intrinsics, drawing
    // the window "win" of the image plane. For a camera that looks along -z with y up and x to the right, as three.js cameras do.
    static projectionMatrix(camera, win, near, far) {
        let w = win.u1 - win.u0, h = win.v1 - win.v0;
        return [
            2 * camera.fx / w, 0, 0, 0,
            0, 2 * camera.fy / h, 0, 0,
            1 - 2 * (camera.cx - win.u0) / w, 2 * (camera.cy - win.v0) / h - 1, -(far + near) / (far - near), -1,
            0, 0, -2 * far * near / (far - near), 0
        ];
    }

    // Rotation [w, x, y, z] from the axes of a three.js camera (x right, y up, looking along -z) to the ones of our cameras (x forward,
    // y left, z up): orientation of the three.js camera = orientation of the camera telemetry x this.
    static THREE_CAMERA_ROTATION = [0.5, 0.5, -0.5, -0.5];

    getOptionsSchema() {
        return [
            { key: "outline", label: "Outlines only", type: "bool" },
            { key: "outlineWidth", label: "Outline width (px)", type: "int", min: 1, max: 20, step: 1 },
            { key: "overlayOpacity", label: "Overlay opacity (%)", type: "int", min: 0, max: 100, step: 10 },
            { key: "pixelDrawings", label: "Takes what is drawn in its pixels", type: "bool" },
            { key: "colormap", label: "Colors of values (depth)", type: "choice", choices: TELEPLOT.pictures.COLORMAP_NAMES },
            { key: "valueRange", label: "Colors between", type: "choice", choices: [["range", "The range of the telemetry"], ["picture", "What each picture holds"]] },
            { key: "displayColorScale", label: "Color scale", type: "bool" },
            { key: "overlays", label: "Drawn over", type: "choice", choices: [["both", "2D and 3D"], ["2d", "2D only (in its pixels)"], ["3d", "3D only (through its camera)"], ["none", "Nothing"]] },
            { key: "cameras", label: "Other cameras", type: "choice", choices: [["beside", "Beside"], ["over", "Drawn over"]] },
            { key: "cameraCones", label: "Camera cones", type: "bool" },
            { key: "displayLegend", label: "Legend", type: "bool" },
            { key: "displayNumberDecimals", label: "Decimals", type: "int", min: 0, max: 10, step: 1 },
            { key: "trailLength", label: "Trail length", type: "int", min: 0, max: 100000, step: 50 },
            ...ViewScene3D.CLOUD_OPTIONS_SCHEMA,
        ];
    }

    // ------------------------------------------------------------------ Page

    __mounted(element) {
        this.legendKey = "";
        this.lastKey = "";
    }

    dispose() {
        for(let frame of this.frames.values()) frame.dispose();
        this.frames.clear();
        super.dispose();
    }

    // Names of the thumbnails: without the beginning they all share, up to a separator ("robot.camera", "robot.depth" -> "camera", "depth")
    static shortNames(names) {
        if(names.length < 2) return names.slice();
        let common = names[0];
        for(let name of names) { let i = 0; while(i < common.length && i < name.length && common[i] === name[i]) i++; common = common.slice(0, i); }
        let cut = Math.max(...[".", "/", "_", "-", " ", ":"].map((c) => common.lastIndexOf(c))) + 1;
        if(cut <= 0 || names.some((name) => name.length <= cut)) return names.slice();
        return names.map((name) => name.slice(cut));
    }

    __frameDivId(place, telemId) {
        return this.id + "-" + place + "-" + String(telemId).replace(/[^A-Za-z0-9_-]/g, "_");
    }

    // ------------------------------------------------------------------ Update

    update(){
        if (!super.__before_update()) return;
        const P = TELEPLOT.protocol;
        let element = document.getElementById(this.divId);
        let pictures = this.getPictureTelemetries();
        if(this.options.pixelDrawings) for(let telem of pictures) this.__takePixelTelemetries(telem);

        // Places of the pictures shown, and the filmstrip (only with several pictures)
        let selected = this.selectedPictures(pictures), shown = this.shownPictures(pictures);
        let strip = pictures.length >= 2 ? pictures : [];
        let shownState = shown.map((telem) => ({ id: telem.id, divId: this.__frameDivId("shown", telem.id) }));
        let short = ViewImage.shortNames(strip.map((telem) => telem.getAttribute(P.TELEM_ATTR_NAME) || String(telem.id)));
        // A thumbnail: its place in the selection (1 = the base, in "over" mode) and whether it is drawn over the pictures shown
        let stripState = strip.map((telem, i) => ({ id: telem.id, divId: this.__frameDivId("strip", telem.id), name: short[i],
            tip: TELEPLOT.view.telemetryTip(telem), selected: selected.includes(telem), order: selected.length > 1 ? selected.indexOf(telem) + 1 : 0,
            over: selected.includes(telem) && !shown.includes(telem) }));
        let cameras = this.options.cameras === "over" ? "over" : "beside";
        if(this.state.cameras !== cameras) this.state.cameras = cameras;
        if(this.state.outline !== !!this.options.outline) this.state.outline = !!this.options.outline;
        let overlays = PictureFrame.OVERLAYS.includes(this.options.overlays) ? this.options.overlays : "both";
        if(this.state.overlays !== overlays) this.state.overlays = overlays;
        if(JSON.stringify(shownState) !== JSON.stringify(this.state.shown)) this.state.shown = shownState;
        if(JSON.stringify(stripState) !== JSON.stringify(this.state.strip)) this.state.strip = stripState;

        // A frame per place: the pictures shown with what is drawn over them, the thumbnails alone
        let wanted = new Map();
        for(let place of shownState) wanted.set("shown:" + place.id, { id: place.id, divId: place.divId, thumbnail: false });
        for(let place of stripState) wanted.set("strip:" + place.id, { id: place.id, divId: place.divId, thumbnail: true });
        for(let [key, frame] of this.frames) if(!wanted.has(key)) { frame.dispose(); this.frames.delete(key); }
        for(let [key, place] of wanted) {
            let frame = this.frames.get(key);
            if(frame === undefined) {
                frame = new PictureFrame(place.divId, this);
                frame.picture = place.id;
                frame.chrome = frame.overlays = !place.thumbnail;
                this.frames.set(key, frame);
            }
            frame.update();
        }

        // The legend: what is drawn over the pictures, as it is at the time shown
        let viewGroup = TELEPLOT.view.groups[this.group];
        let collected = this.__collectSources(viewGroup.cursorTimestamp);
        let key = collected.key + "|" + (element ? element.clientWidth : 0);
        if(key === this.lastKey) return;
        this.lastKey = key;
        this.__updateLegend(collected.sources, element);
    }

    static warpVertexShader = `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `;

    static warpFragmentShader = `
        uniform sampler2D map;
        uniform vec2 focal, center, size, tangential;
        uniform vec3 radial;
        uniform vec4 win;
        uniform float outline;
        varying vec2 vUv;
        // Color (multiplied by its opacity) of what is drawn at a pixel of the picture; nothing outside of what was drawn
        vec4 look(vec2 pixel) {
            vec2 seen = (pixel - center) / focal;
            vec2 ideal = seen;
            for(int i = 0; i < 12; i++) {
                float r2 = dot(ideal, ideal);
                float k = 1.0 + r2 * (radial.x + r2 * (radial.y + r2 * radial.z));
                vec2 t = vec2(2.0 * tangential.x * ideal.x * ideal.y + tangential.y * (r2 + 2.0 * ideal.x * ideal.x),
                              tangential.x * (r2 + 2.0 * ideal.y * ideal.y) + 2.0 * tangential.y * ideal.x * ideal.y);
                ideal = (seen - t) / k;
            }
            vec2 at = ideal * focal + center;
            vec2 st = vec2((at.x - win.x) / (win.z - win.x), 1.0 - (at.y - win.y) / (win.w - win.y));
            if(st.x < 0.0 || st.x > 1.0 || st.y < 0.0 || st.y > 1.0) return vec4(0.0);
            return texture2D(map, st);
        }
        void main() {
            vec2 pixel = vec2(vUv.x * size.x - 0.5, (1.0 - vUv.y) * size.y - 0.5); // of the picture: centers at whole numbers, v down
            vec4 color = look(pixel);
            if(outline > 0.0) { // Only where the color changes around the pixel, in the color of the most opaque thing there
                vec4 a = look(pixel + vec2(outline, 0.0)), b = look(pixel - vec2(outline, 0.0));
                vec4 c = look(pixel + vec2(0.0, outline)), d = look(pixel - vec2(0.0, outline));
                vec4 change = max(max(abs(a - color), abs(b - color)), max(abs(c - color), abs(d - color)));
                if(max(max(change.r, change.g), max(change.b, change.a)) < 0.1) discard;
                if(a.a > color.a) color = a;
                if(b.a > color.a) color = b;
                if(c.a > color.a) color = c;
                if(d.a > color.a) color = d;
                if(color.a > 0.0) color = vec4(color.rgb / color.a, 1.0);
                gl_FragColor = color;
            }
            else {
                if(color.a <= 0.0) discard;
                color.rgb /= color.a;
                gl_FragColor = color;
            }
            #include <colorspace_fragment>
            gl_FragColor.rgb *= gl_FragColor.a;
        }
    `;

    static vueHTML = `
        <div class="teleplot-js-image-container teleplot-js-telemetry-card"
        :style=" { '--layout-width': layout.width, '--layout-height': layout.height }"
        ${ViewTelemetries.dragDropHtml}>
          <div class="teleplot-js-image-pictures" v-bind:class="{'teleplot-js-image-with-strip': state.strip.length > 0}">
              <div v-for="place in state.shown" v-bind:key="place.divId" v-bind:id="place.divId" class="teleplot-js-image-place"></div>
          </div>
          <div v-if="state.strip.length > 0" class="teleplot-js-image-strip">
              <div class="teleplot-js-image-thumbs">
              <button v-for="thumb in state.strip" v-bind:key="thumb.divId" type="button" class="teleplot-js-image-thumb" v-bind:class="{selected: thumb.selected, over: thumb.over}"
                v-bind:title="thumb.tip + (thumb.over ? '\\nDrawn over the pictures shown' : '') + (thumb.selected ? '\\nShift+click: take it away' : '\\nClick: show it. Shift+click: add it') + (state.cameras == 'over' ? ' (the first one is the base, depth cameras go over it)' : ' (beside the others)')" v-on:click="onPictureChoose(thumb.id, $event)">
                  <span v-bind:id="thumb.divId" class="teleplot-js-image-thumb-picture"></span><span class="teleplot-js-image-thumb-name">{{thumb.name}}</span>
                  <span v-if="thumb.order" class="teleplot-js-image-thumb-order">{{thumb.order}}</span>
              </button>
              </div>
              <span class="teleplot-js-image-tools">
              <button type="button" class="teleplot-js-image-tool teleplot-js-image-tool-text" v-bind:class="{on: state.overlays != 'none'}" v-on:click="onOverlaysCycle()"
                v-bind:aria-label="'Drawn over the pictures: ' + ({both: '2D and 3D', '2d': '2D only', '3d': '3D only', none: 'nothing'})[state.overlays] + '. Click for the next choice'"
                v-bind:title="'Drawn over the pictures: ' + ({both: 'what is in their pixels (2D) and the scene through their camera (3D)', '2d': 'what is in their pixels only (2D)', '3d': 'the scene through their camera only (3D)', none: 'nothing'})[state.overlays] + '. Click: ' + ({both: 'nothing', none: '2D only', '2d': '3D only', '3d': '2D and 3D'})[state.overlays]">{{({both: '2D+3D', '2d': '2D', '3d': '3D', none: 'None'})[state.overlays]}}</button>
              <button type="button" class="teleplot-js-image-tool" v-bind:class="{on: state.outline}" v-on:click="onOutlineToggle()"
                v-bind:aria-label="state.outline ? 'Outlines only: draw the objects whole instead' : 'Objects drawn whole: draw their outlines only instead'"
                v-bind:title="state.outline ? 'Outlines only over the pictures. Click: the objects whole' : 'Objects drawn whole over the pictures. Click: their outlines only'">
                  <svg v-if="state.outline" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 L14 5 V11.5 L8 15 L2 11.5 V5 Z M8 8.2 V15 M8 8.2 L2 5 M8 8.2 L14 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"></path></svg>
                  <svg v-else width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 L14 5 L8 8.2 L2 5 Z" fill="currentColor" fill-opacity="0.9"></path><path d="M2 5 L8 8.2 V15 L2 11.5 Z" fill="currentColor" fill-opacity="0.55"></path><path d="M8 8.2 L14 5 V11.5 L8 15 Z" fill="currentColor" fill-opacity="0.3"></path></svg>
              </button>
              <button type="button" class="teleplot-js-image-tool" v-bind:class="{on: state.cameras == 'over'}" v-on:click="onCamerasToggle()"
                v-bind:aria-label="state.cameras == 'over' ? 'Cameras drawn over the first picture: show them beside instead' : 'Pictures beside each other: draw the depth cameras over the first picture instead'"
                v-bind:title="state.cameras == 'over' ? 'Cameras drawn over the first picture selected. Click: beside each other' : 'Pictures beside each other. Click: depth cameras drawn over the first picture selected'">
                  <svg v-if="state.cameras == 'over'" width="18" height="13" viewBox="0 0 20 14" aria-hidden="true"><rect x="2" y="1" width="12" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"></rect><rect x="6" y="4" width="12" height="9" rx="1" fill="var(--teleplot-surface)" stroke="currentColor" stroke-width="1.6"></rect></svg>
                  <svg v-else width="18" height="13" viewBox="0 0 20 14" aria-hidden="true"><rect x="1" y="2" width="8" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"></rect><rect x="11" y="2" width="8" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"></rect></svg>
              </button>
              </span>
          </div>
          ${ViewScene3D.legendHTML}
          <div v-if="emptyState.text" class="teleplot-js-empty">
              <div class="teleplot-js-empty-title">{{emptyState.text}}</div>
              <div v-if="emptyState.hint" class="teleplot-js-empty-hint">{{emptyState.hint}}</div>
          </div>
        </div>
    `;

    __sync(element) {
        super.__sync(element);
        element.classList.add("teleplot-js-image-view"); // (its title is over the picture, see the CSS)
    }

    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            /* The title is over the picture too: same background as the legend, and the color of plain text */
            .teleplot-js-image-view > .teleplot-js-view-title {
                top: 0.45em; left: 0.5em; padding: 0.1em 0.6em; border-radius: 1em;
                color: var(--teleplot-text); background: color-mix(in srgb, var(--teleplot-surface) 82%, transparent);
            }
            .teleplot-js-image-container {
                position: relative;
                width: 100%;
                height: 100%;
                padding: 0;
                overflow: hidden;
            }
            /* The pictures shown share the room side by side, out of the flow: they take the size of the view, never the other way round */
            .teleplot-js-image-pictures { position: absolute; inset: var(--teleplot-accent-w, 2px) 0 0 0; display: flex; gap: 0.3em; }
            .teleplot-js-image-pictures.teleplot-js-image-with-strip { bottom: 3.4em; }
            .teleplot-js-image-place { flex: 1 1 0; min-width: 0; position: relative; }
            /* The filmstrip: a band of its own under the pictures, a thumbnail per picture */
            .teleplot-js-image-strip {
                position: absolute; left: 0; right: 0; bottom: 0; height: 3.4em; box-sizing: border-box; padding: 0.25em 0.5em;
                display: flex; gap: 0.5em; align-items: center; border-top: 1px solid var(--teleplot-line);
            }
            .teleplot-js-image-thumbs { /* the thumbnails scroll, the toggles stay at the right end */
                flex: 1 1 auto; min-width: 0; height: 100%; display: flex; gap: 0.5em; justify-content: safe center; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; box-sizing: border-box; padding: 0.3em 0.4em 0; /* (room for the numbers of the thumbnails) */
            }
            .teleplot-js-image-thumb {
                all: unset; box-sizing: border-box; flex: none; width: 4.2em; height: 100%; display: grid; grid-template-rows: 1fr auto; gap: 0.1em; position: relative;
                cursor: pointer; font-size: 0.8em; color: var(--teleplot-muted); text-align: center;
            }
            .teleplot-js-image-thumb:focus-visible { outline: 2px solid var(--teleplot-primary); outline-offset: 1px; border-radius: 3px; }
            .teleplot-js-image-thumb-picture { position: relative; display: block; min-height: 0; border-radius: 3px; box-shadow: 0 0 0 1px var(--teleplot-line); overflow: hidden; }
            .teleplot-js-image-thumb.selected { color: var(--teleplot-text); }
            .teleplot-js-image-thumb.selected .teleplot-js-image-thumb-picture { box-shadow: 0 0 0 2px var(--teleplot-primary); }
            .teleplot-js-image-thumb:not(.selected) .teleplot-js-image-thumb-picture { opacity: 0.6; }
            .teleplot-js-image-thumb:hover .teleplot-js-image-thumb-picture { opacity: 1; }
            .teleplot-js-image-thumb-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
            .teleplot-js-image-thumb.over .teleplot-js-image-thumb-picture { outline: 1px dashed var(--teleplot-primary); outline-offset: 2px; } /* drawn over the pictures shown */
            .teleplot-js-image-thumb-order { /* its place in the selection: 1 is the base (beside the picture's element: a frame mounts in that one) */
                position: absolute; right: -0.3em; top: -0.2em; z-index: 3; min-width: 1.2em; height: 1.2em; padding: 0 0.2em; box-sizing: border-box; border-radius: 0.6em;
                font-size: 0.85em; font-weight: 700; line-height: 1.2em; text-align: center; color: #fff; background: var(--teleplot-primary);
            }
            .teleplot-js-image-tools { /* the toggles at the right end of the filmstrip: what is drawn over, outlines, cameras beside / over */
                flex: none; display: flex; gap: 0.3em;
            }
            .teleplot-js-image-tool {
                all: unset; box-sizing: border-box; width: 2.2em; height: 1.8em; border-radius: 0.4em; cursor: pointer;
                display: flex; align-items: center; justify-content: center; color: var(--teleplot-muted); border: 1px solid var(--teleplot-line);
            }
            .teleplot-js-image-tool:hover, .teleplot-js-image-tool.on { color: var(--teleplot-primary); }
            .teleplot-js-image-tool-text { width: auto; min-width: 2.2em; padding: 0 0.45em; font-size: 0.8em; font-weight: 700; white-space: nowrap; }
            .teleplot-js-image-tool:focus-visible { outline: 2px solid var(--teleplot-primary); outline-offset: 1px; }
            /* A picture (PictureFrame), wherever it is */
            .teleplot-js-picture { position: absolute; inset: 0; }
            .teleplot-js-image-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
            .teleplot-js-image-frame { position: relative; flex: none; max-width: 100%; max-height: 100%; }
            .teleplot-js-image-frame img { display: block; width: 100%; height: 100%; }
            .teleplot-js-image-frame:not([style]) img { width: auto; height: auto; max-width: 100%; visibility: hidden; } /* Until its size is known */
            .teleplot-js-image-frame canvas.teleplot-js-image-values { display: block; width: 100%; height: 100%; image-rendering: pixelated; } /* A pixel is one value: never smoothed */
            .teleplot-js-image-frame:not([style]) canvas.teleplot-js-image-values { visibility: hidden; }
            .teleplot-js-image-readout {
                position: absolute; transform: translate(12px, -130%); white-space: pre; pointer-events: none; z-index: 2;
                padding: 0.1em 0.6em; border-radius: 6px; font-size: 0.8em; font-variant-numeric: tabular-nums;
                color: var(--teleplot-text); background: color-mix(in srgb, var(--teleplot-surface) 90%, transparent); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
            }
            .teleplot-js-image-readout.right { transform: translate(calc(-100% - 12px), -130%); }
            .teleplot-js-image-readout.below { margin-top: 2.6em; }
            .teleplot-js-image-scale {
                position: absolute; right: 0.6em; bottom: 0.5em; display: flex; align-items: center; gap: 0.4em; pointer-events: none;
                padding: 0.1em 0.6em; border-radius: 1em; font-size: 0.75em; font-variant-numeric: tabular-nums;
                color: var(--teleplot-text); background: color-mix(in srgb, var(--teleplot-surface) 82%, transparent);
            }
            .teleplot-js-image-scale i { display: block; width: 6em; height: 0.6em; border-radius: 0.3em; }
            .teleplot-js-image-scale-bl { right: auto; left: 0.6em; }   /* (moved: it would have hidden the pixel under the pointer) */
            .teleplot-js-image-scale-tr { bottom: auto; top: 0.5em; }
            .teleplot-js-image-scale-tl { right: auto; left: 0.6em; bottom: auto; top: 0.5em; }
            .teleplot-js-image-scale small { color: var(--teleplot-muted); font-size: 0.9em; }
            .teleplot-js-image-overlay { position: absolute; inset: 0; pointer-events: none; }
            .teleplot-js-image-overlay canvas { display: block; }
            .teleplot-js-image-pixels { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; } /* What is given in the pixels of the picture */
            /* The legend is over the picture: its entries get a background to stay readable on anything */
            .teleplot-js-image-container .teleplot-js-scene3d-legend .teleplot-js-chart-legend { gap: 0.5em; }
            .teleplot-js-image-container .teleplot-js-scene3d-legend > .teleplot-js-chart-legend > .teleplot-js-chart-legend-block {
                padding: 0 0.6em; border-radius: 1em; background: color-mix(in srgb, var(--teleplot-surface) 82%, transparent);
            }
            .teleplot-js-image-container .teleplot-js-chart-legend-more { background: color-mix(in srgb, var(--teleplot-surface) 82%, transparent); }
            .teleplot-js-image-note {
                position: absolute; left: 0.6em; right: 0.6em; bottom: 0.5em; padding: 0.2em 0.7em; border-radius: 6px; font-size: 0.8em; text-align: center;
                color: var(--teleplot-text); background: color-mix(in srgb, var(--teleplot-surface) 85%, transparent);
            }
        }
    `;
}

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = ViewImage.vueCSS;
    document.head.appendChild(elem);
}

TELEPLOT.view.ViewImage = ViewImage;
TELEPLOT.view.PictureFrame = PictureFrame;
