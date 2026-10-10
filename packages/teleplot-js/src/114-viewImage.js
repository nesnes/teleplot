/*
 * Image view: the images of an image telemetry, and the 3D telemetries of the view (shapes, 3D points, other cameras) drawn over them as
 * the camera saw them.
 * - The first telemetry of the view that has images is the picture. It is shown as it was received: never resized in its data, never
 *   undistorted.
 * - To draw over it the picture needs a camera: intrinsics (TELEM_DATA_CAMERA_INTRINSICS: fx, fy, cx, cy in pixels, for an image of
 *   width x height), optionally lens distortion (TELEM_DATA_CAMERA_DISTORTION: k1, k2, p1, p2, k3), and where the camera is (the shape
 *   position and rotation/quaternion sections, on the image telemetry itself; at the origin and looking along x when never sent).
 *   Intrinsics and distortion follow the usual image convention (pinhole + Brown-Conrady model as in OpenCV: pixel (0, 0) is the center of
 *   the top left pixel, u to the right, v down). The pose is in the frame of the scene: the camera looks along its x, y is to the left of
 *   the image, z to its top.
 * - Without distortion the scene is drawn straight with the camera of the intrinsics. With distortion it is drawn with an ideal camera on
 *   a wider field, and that drawing is bent by the distortion model before being laid over the picture (the picture is not touched).
 *   Without intrinsics nothing can be placed: the picture is shown alone, and a note says why.
 * - "outline" option (on by default): only the outline of what is drawn is laid over the picture (a line in the color of each object, where it ends or
 *   meets an object of another color), so that the picture stays visible inside the objects.
 * - Time: everything is shown as it was when the picture was taken (the last sample of each telemetry at or before the time of the
 *   image). Nothing is interpolated. Like the other views it follows the cursor of its group.
 * - The WebGL canvas only exists when there is something to draw over the picture.
 * The scene itself (objects, legend, hide / highlight) is the one of the 3D view.
 */
class ViewImage extends ViewScene3D {
    constructor(divId, telemetryIdOrNameList, group="default"){
        super(divId, telemetryIdOrNameList, group);
        this.name = "image";
        this.type = "teleplot-image";
        this.supportedDataTypes = [""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE];
        this.supportedLabel = "image";

        this.options.overlayOpacity = 70; // Percent: how much what is drawn over the picture hides it
        this.options.outline = true;      // Only the outlines of the objects (the picture stays visible inside them), not the objects themselves
        this.options.outlineWidth = 3;    // Width of those outlines, in pixels of the page

        this.layout.width = 2;
        this.layout.height = 6;

        this.state.imageUrl = "";  // The picture, as a data url
        this.state.frameWidth = 0; // Size of the picture on the page (px): it is fitted in the view
        this.state.frameHeight = 0;
        this.state.note = "";      // Why nothing is drawn over the picture, when something should be
        this.imageKey = "";
        this.natural = undefined;  // {width, height} of the picture, in its own pixels
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
            { key: "displayLegend", label: "Legend", type: "bool" },
            { key: "displayNumberDecimals", label: "Decimals", type: "int", min: 0, max: 10, step: 1 },
            { key: "trailLength", label: "Trail length", type: "int", min: 0, max: 100000, step: 50 },
        ];
    }

    // The telemetry whose images are shown: the first of the view that has some
    getImageTelemetry() {
        for(let entry of this.telemetryIdOrNameList) {
            let telem = TELEPLOT.datastore.getTelemetry(entry);
            if(telem !== undefined && telem.data[TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_IMAGE] !== undefined) return telem;
        }
        return undefined;
    }

    getEmptyState() {
        return ViewTelemetries.prototype.getEmptyState.call(this); // Nothing to show without an image, whatever else there is
    }

    // ------------------------------------------------------------------ Page

    __mounted(element) {
        this.imageKey = "";
        this.state.imageUrl = "";
        let stage = element.querySelector(".teleplot-js-image-stage");
        this.stageObserver = new ResizeObserver(() => this.__layoutFrame());
        this.stageObserver.observe(stage);
    }

    __imageLoaded(img) {
        this.natural = { width: img.naturalWidth, height: img.naturalHeight };
        this.__layoutFrame();
    }

    // The picture takes as much of the view as it can without being deformed; what is drawn over it has exactly its place
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

    // ------------------------------------------------------------------ Update

    update(){
        if (!super.__before_update()) return;
        let element = document.getElementById(this.divId);
        let viewGroup = TELEPLOT.view.groups[this.group];
        let cursor = viewGroup.cursorTimestamp;
        let since = (viewGroup.cursorActive && viewGroup.timestampFrom < viewGroup.timestampTo) ? viewGroup.timestampFrom : -Infinity;

        // The picture
        let imageTelem = this.getImageTelemetry();
        let image = imageTelem ? ViewScene3D.imageAt(imageTelem, cursor) : undefined;
        let imageKey = image ? imageTelem.id + ":" + image.t : "";
        if(imageKey != this.imageKey) {
            this.imageKey = imageKey;
            this.state.imageUrl = image ? image.url : "";
        }

        // What to draw over it: the scene as it was when the picture was taken, seen by its camera
        let timestamp = image ? image.t : cursor;
        let camera = image ? ViewScene3D.cameraState(imageTelem, timestamp) : undefined;
        let { sources, key } = this.__collectSources(timestamp, imageTelem);
        let note = (image && sources.length && !camera) ? "No camera parameters for this image: nothing can be drawn over it" : "";
        if(note != this.state.note) this.state.note = note;
        let draw = sources.length > 0 && camera !== undefined && this.state.frameWidth > 0 && this.state.frameHeight > 0;
        if(draw && !this.three) this.__setupOverlay(element);

        key += `|${since},${JSON.stringify(camera)},${this.state.frameWidth}x${this.state.frameHeight},${draw},${!!this.three},${element ? element.clientWidth : 0},${this.options.outline},${this.options.outlineWidth}`;
        if(key == this.lastKey) return;
        this.lastKey = key;

        this.__updateLegend(sources, element);
        let three = this.three;
        if(!three) return;
        three.renderer.domElement.style.visibility = draw ? "" : "hidden";
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
            three.renderer.setSize(width, height);
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
        if(!three.warp) { three.renderer.render(three.scene, three.camera); return; }
        three.renderer.setRenderTarget(three.warp.target);
        three.renderer.clear();
        three.renderer.render(three.scene, three.camera);
        three.renderer.setRenderTarget(null);
        three.renderer.render(three.warp.scene, three.warp.camera);
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
          <div class="teleplot-js-image-stage">
              <div class="teleplot-js-image-frame" v-bind:style="state.frameWidth ? {width: state.frameWidth + 'px', height: state.frameHeight + 'px'} : {}">
                  <img v-if="state.imageUrl" v-bind:src="state.imageUrl" draggable="false" alt="" v-on:load="onImageLoad($event)"/>
                  <div class="teleplot-js-image-overlay" v-bind:style="{opacity: Math.max(0, Math.min(100, options.overlayOpacity)) / 100}"></div>
              </div>
          </div>
          ${ViewScene3D.legendHTML}
          <div v-if="state.note || state.error" class="teleplot-js-image-note">{{state.error || state.note}}</div>
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
            .teleplot-js-image-stage { /* Out of the flow: the picture takes the size of the view, never the other way round */
                position: absolute;
                inset: var(--teleplot-accent-w, 2px) 0 0 0;
                display: flex; align-items: center; justify-content: center;
            }
            .teleplot-js-image-frame { position: relative; flex: none; max-width: 100%; max-height: 100%; }
            .teleplot-js-image-frame img { display: block; width: 100%; height: 100%; }
            .teleplot-js-image-frame:not([style]) img { width: auto; height: auto; max-width: 100%; visibility: hidden; } /* Until its size is known */
            .teleplot-js-image-overlay { position: absolute; inset: 0; pointer-events: none; }
            .teleplot-js-image-overlay canvas { display: block; }
            /* The legend is over the picture: its entries get a background to stay readable on anything */
            .teleplot-js-image-container .teleplot-js-scene3d-legend .teleplot-js-chart-legend { gap: 0.5em; }
            .teleplot-js-image-container .teleplot-js-scene3d-legend > .teleplot-js-chart-legend > .teleplot-js-chart-legend-block {
                padding: 0 0.6em; border-radius: 1em; background: color-mix(in srgb, var(--teleplot-surface) 82%, transparent);
            }
            .teleplot-js-image-container .teleplot-js-chart-legend-more { background: color-mix(in srgb, var(--teleplot-surface) 82%, transparent); }
            .teleplot-js-image-note {
                position: absolute; left: 0.6em; right: 0.6em; bottom: 0.5em; padding: 0.2em 0.7em; border-radius: 6px; font-size: 0.8em; text-align: center;
                color: var(--teleplot-text); background: color-mix(in srgb, var(--teleplot-surface) 85%, transparent); pointer-events: none;
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
