/*
 * Sample data: a tiny robot wandering in a 4 x 3 m arena, to demo every kind of telemetry.
 * Self-contained: only uses the Teleplot API (TP.datastore, TP.view, TP.dashboards).
 * Numbers (wheels, current, battery, gyro, distance), 2D numbers (position), text (state, and one log per subsystem merged in a Log view), image (camera),
 * 3D (the robot in its arena: shapes for the floor, the walls, the body, the wheels, a screen showing the camera, what the distance sensor hits; a 3D point for its path).
 * Frame of the 3D telemetries: x forward, y left, z up, in meters.
 * The camera is a real one: a wide angle lens with distortion, whose pictures are computed pixel by pixel from the arena. It publishes its
 * intrinsics, its distortion and where it is, so that an image view can draw the 3D telemetries over its pictures.
 *
 *   const robot = createRobotSample(TP);   // robot.start(), robot.stop(), robot.running, robot.dashboard
 */
function createRobotSample(TP) {
    const P = TP.protocol;
    const W = 4, H = 3, WHEEL_BASE = 0.3, STEP = 0.02; // arena (m), distance between wheels (m), simulation step (s)
    const WALL_T = 0.03, WALL_TALL = 0.3; // walls: thickness and height (m)
    // Camera: at the front of the robot, looking forward. Pinhole model in pixels (center of the top left pixel = 0, 0) + lens distortion k1, k2, p1, p2, k3
    const CAMERA = { width: 160, height: 120, fx: 105, fy: 105, cx: 79.5, cy: 59.5, distortion: [-0.26, 0.07, 0, 0, 0], forward: 0.12, up: 0.2 };
    const WALL_COLORS = ["#c0392b", "#e67e22", "#2980b9", "#27ae60"]; // walls at x = 0, x = W, y = 0, y = H: same colors in the camera image and in the 3D view
    const noise = (s) => (Math.random() + Math.random() + Math.random() - 1.5) * s; // ~gaussian

    // --- Simulation: unicycle that drives straight and turns away from walls ---
    const bot = { x: 1, y: 1, a: 0.5, v: 0, w: 0, vl: 0, vr: 0, state: "forward", until: 0, battery: 25.2, t: 0 };

    // Distance to the arena walls along an angle, and which wall (0..3) is hit
    function ray(a) {
        const dx = Math.cos(a), dy = Math.sin(a);
        const hits = [dx > 0 ? (W - bot.x) / dx : -bot.x / dx, dy > 0 ? (H - bot.y) / dy : -bot.y / dy];
        const wall = hits[0] < hits[1] ? 0 : 1;
        return { d: hits[wall], wall: wall * 2 + (wall ? dy > 0 : dx > 0) };
    }

    function step() {
        bot.t += STEP;
        const d = ray(bot.a).d;
        if (bot.state == "forward" && d < 0.5) {
            bot.state = "turning";
            bot.dir = Math.random() < 0.5 ? -1 : 1;
            bot.until = bot.t + 0.6 + Math.random() * 1.2;
            log("robot.nav.log", "INFO", `Wall at ${d.toFixed(2)} m, turning ${bot.dir > 0 ? "left" : "right"}`);
        } else if (bot.state == "turning" && bot.t > bot.until) {
            bot.state = "forward";
            log("robot.nav.log", "INFO", "Path clear, driving forward");
        }
        const vTarget = bot.state == "forward" ? 0.4 : 0;
        const wTarget = bot.state == "turning" ? 1.5 * bot.dir : 0;
        const prevVl = bot.vl, prevVr = bot.vr;
        bot.v += (vTarget - bot.v) * STEP / 0.2; // first-order lag: motors don't answer instantly
        bot.w += (wTarget - bot.w) * STEP / 0.2;
        bot.a += bot.w * STEP;
        bot.x += Math.cos(bot.a) * bot.v * STEP;
        bot.y += Math.sin(bot.a) * bot.v * STEP;
        bot.vl = bot.v - bot.w * WHEEL_BASE / 2;
        bot.vr = bot.v + bot.w * WHEEL_BASE / 2;
        bot.il = 0.2 + Math.abs(bot.vl) * 1.5 + Math.abs(bot.vl - prevVl) / STEP * 0.8;
        bot.ir = 0.2 + Math.abs(bot.vr) * 1.5 + Math.abs(bot.vr - prevVr) / STEP * 0.8;
        bot.battery = Math.max(20, bot.battery - 0.0004 * STEP * 50); // slow discharge
        // Logs from the other subsystems: each one is its own text telemetry
        for (const [side, i] of [["left", bot.il], ["right", bot.ir]]) {
            if (i > 1.6 && bot.t - (bot.lastSpike || 0) > 1.5) { bot.lastSpike = bot.t; log("robot.motor.log", "WARN", `${side} motor current spike: ${i.toFixed(2)} A`); }
        }
        if (bot.t - (bot.lastPower || 0) > 4) { bot.lastPower = bot.t; log("robot.power.log", "INFO", `Battery ${bot.battery.toFixed(2)} V, drawing ${(bot.il + bot.ir).toFixed(2)} A`); }
        if (bot.t - (bot.lastCam || 0) > 7) { bot.lastCam = bot.t; log("robot.camera.log", Math.random() < 0.2 ? "WARN" : "INFO", Math.random() < 0.2 ? "Frame dropped, USB bandwidth low" : "Streaming 5 fps, exposure auto"); }
    }

    // --- Telemetry output ---
    const put = (name, type, values, unit) => {
        let telem = TP.datastore.getTelemetry(name);
        if (!telem) {
            telem = TP.datastore.getOrCreateTelemetry(name);
            telem.setAttribute(P.TELEM_ATTR_AUTOPLOT, false); // We build our own dashboard: no automatic one for these
            if (unit) telem.setAttribute(P.TELEM_ATTR_UNIT, unit);
        }
        telem.addData(type, [Date.now() / 1000], values.map(v => [v]));
    };
    const NUMBER = P.SECTION_TYPE_TELEM_DATA_NUMBER, NUMBER_2D = P.SECTION_TYPE_TELEM_DATA_NUMBER_2D;
    const TEXT = P.SECTION_TYPE_TELEM_DATA_TEXT, IMAGE = P.SECTION_TYPE_TELEM_DATA_IMAGE;
    const log = (name, level, text) => { // One text telemetry per subsystem, merged by the Log view; they share the view label "logs"
        put(name, TEXT, [`[${level}] ${text}`]);
        TP.datastore.getTelemetry(name).setAttribute(P.TELEM_ATTR_VIEW_LABEL, "logs");
    };

    // 3D shapes: a shape is a telemetry with a shape attribute, its data are its position, orientation, size, color...
    const POSITION = P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION, QUATERNION = P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION, SIZE = P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE;
    // View labels: what makes the robot and what makes its environment. Telemetries of a label are displayed together by default, and the
    // Telemetries panel has a card per label to drag them all at once.
    const ROBOT = "robot", ENVIRONMENT = "environment";
    const shape = (name, label, type, size, color, opacity = 255) => { // What does not change is sent once
        if (TP.datastore.getTelemetry(name)) return;
        put(name, SIZE, size);
        put(name, P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR, [color]);
        if (opacity < 255) put(name, P.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY, [opacity]);
        TP.datastore.getTelemetry(name).setAttribute(P.TELEM_ATTR_SHAPE, { type, data: "" });
        TP.datastore.getTelemetry(name).setAttribute(P.TELEM_ATTR_VIEW_LABEL, label);
    };
    function publish3D() { // 25 Hz
        const CUBE = P.TELEM_ATTR_SHAPE_TYPE_CUBE, CYLINDER = P.TELEM_ATTR_SHAPE_TYPE_CYLINDER, SPHERE = P.TELEM_ATTR_SHAPE_TYPE_SPHERE;
        if (!TP.datastore.getTelemetry("robot.3d.floor")) {
            shape("robot.3d.floor", ENVIRONMENT, CUBE, [W, H, 0.02], "#7f8c8d", 110);
            put("robot.3d.floor", POSITION, [W / 2, H / 2, -0.01]);
            // Walls: low and a bit transparent, so that the robot stays visible from outside the arena
            const T = WALL_T, TALL = WALL_TALL;
            const walls = [["back", [-T / 2, H / 2], [T, H]], ["front", [W + T / 2, H / 2], [T, H]], ["right", [W / 2, -T / 2], [W, T]], ["left", [W / 2, H + T / 2], [W, T]]];
            walls.forEach(([name, [x, y], [sx, sy]], i) => {
                shape("robot.3d.wall." + name, ENVIRONMENT, CUBE, [sx, sy, TALL], WALL_COLORS[i], 200);
                put("robot.3d.wall." + name, POSITION, [x, y, TALL / 2]);
            });
        }
        shape("robot.3d.body", ROBOT, CUBE, [0.3, WHEEL_BASE - 0.06, 0.1], "#2980b9");
        shape("robot.3d.wheel.left", ROBOT, CYLINDER, [0.12, 0.12, 0.04], "#2c3e50");
        shape("robot.3d.wheel.right", ROBOT, CYLINDER, [0.12, 0.12, 0.04], "#2c3e50");
        shape("robot.3d.screen", ROBOT, CUBE, [0.01, 0.24, 0.18], "white");
        shape("robot.3d.obstacle", ENVIRONMENT, SPHERE, [0.1, 0.1, 0.1], "#e74c3c", 170);
        if (!TP.datastore.getTelemetry("robot.3d.screen").data[P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE]) {
            put("robot.3d.screen", P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE, [P.TEXTURE_TYPE_IMAGE, "robot.camera"]); // Shows the image telemetry
        }

        // Orientation as quaternions (w, x, y, z): the heading is a rotation around z; wheels are cylinders laid on their side first (around x)
        const c = Math.cos(bot.a / 2), s = Math.sin(bot.a / 2), h = Math.SQRT1_2;
        const yaw = [c, 0, 0, s], wheel = [c * h, c * h, s * h, s * h];
        const left = [-Math.sin(bot.a), Math.cos(bot.a)]; // unit vector to the left of the robot
        put("robot.3d.body", POSITION, [bot.x, bot.y, 0.09]);
        put("robot.3d.body", QUATERNION, yaw);
        for (const [name, side] of [["robot.3d.wheel.left", 1], ["robot.3d.wheel.right", -1]]) {
            put(name, POSITION, [bot.x + left[0] * side * WHEEL_BASE / 2, bot.y + left[1] * side * WHEEL_BASE / 2, 0.06]);
            put(name, QUATERNION, wheel);
        }
        put("robot.3d.screen", POSITION, [bot.x - Math.cos(bot.a) * 0.1, bot.y - Math.sin(bot.a) * 0.1, 0.24]);
        put("robot.3d.screen", QUATERNION, yaw);
        const d = ray(bot.a).d;
        put("robot.3d.obstacle", POSITION, [bot.x + Math.cos(bot.a) * d, bot.y + Math.sin(bot.a) * d, 0.09]);
        put("robot.path", P.SECTION_TYPE_TELEM_DATA_NUMBER_3D, [bot.x, bot.y, 0.005], "m");
        TP.datastore.getTelemetry("robot.path").setAttribute(P.TELEM_ATTR_VIEW_LABEL, ROBOT);
    }

    function publishFast() { // every step
        put("robot.wheel.left", NUMBER, [bot.vl + noise(0.01)], "m/s");
        put("robot.wheel.right", NUMBER, [bot.vr + noise(0.01)], "m/s");
        put("robot.current.left", NUMBER, [bot.il + noise(0.03)], "A");
        put("robot.current.right", NUMBER, [bot.ir + noise(0.03)], "A");
        put("robot.gyro.z", NUMBER, [bot.w + noise(0.02)], "rad/s");
        put("robot.distance", NUMBER, [ray(bot.a).d + noise(0.01)], "m");
    }
    function publishSlow() { // 5 Hz
        put("robot.position", NUMBER_2D, [bot.x, bot.y], "m");
        put("robot.heading", NUMBER, [(bot.a * 180 / Math.PI % 360 + 360) % 360], "°");
        put("robot.battery", NUMBER, [bot.battery - 0.1 * (bot.il + bot.ir) + noise(0.01)], "V");
        put("robot.state", TEXT, [bot.state]);
        // The camera: its parameters and where it is when the picture is taken, then the picture
        const eye = [bot.x + Math.cos(bot.a) * CAMERA.forward, bot.y + Math.sin(bot.a) * CAMERA.forward, CAMERA.up];
        put("robot.camera", P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS, [CAMERA.width, CAMERA.height, CAMERA.fx, CAMERA.fy, CAMERA.cx, CAMERA.cy]);
        put("robot.camera", P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION, CAMERA.distortion);
        put("robot.camera", POSITION, eye);
        put("robot.camera", QUATERNION, [Math.cos(bot.a / 2), 0, 0, Math.sin(bot.a / 2)]); // looks along the x of the robot
        put("robot.camera", SIZE, [0.35, 1, 1]); // how far its pyramid is drawn in 3D views
        put("robot.camera", IMAGE, [P.IMAGE_TYPE_PNG, camera(eye)]);
    }

    // Front camera: each pixel is the color of what its ray hits in the arena (a wall, the floor, or nothing), as a base64 PNG.
    // The ray of a pixel goes through the lens backwards: the distortion is undone to know where the pixel looks (once, it never changes).
    const canvas = document.createElement("canvas");
    canvas.width = CAMERA.width; canvas.height = CAMERA.height;
    const g = canvas.getContext("2d");
    const frame = g.createImageData(CAMERA.width, CAMERA.height);
    const rays = new Float32Array(CAMERA.width * CAMERA.height * 2); // per pixel: how much the ray goes left and up for 1 forward
    for (let v = 0, i = 0; v < CAMERA.height; v++) for (let u = 0; u < CAMERA.width; u++) {
        const [x, y] = TP.view.ViewImage.undistortPoint((u - CAMERA.cx) / CAMERA.fx, (v - CAMERA.cy) / CAMERA.fy, CAMERA.distortion);
        rays[i++] = -x; rays[i++] = -y; // image x goes right and y down
    }
    // Like a real camera, the picture is not perfect: washed out colors, darker corners, and noise that changes on every picture
    const rgb = (hex) => { const c = [1, 3, 5].map((at) => parseInt(hex.substr(at, 2), 16)), gray = (c[0] + c[1] + c[2]) / 3; return c.map((v) => v + (gray - v) * 0.45); };
    const vignette = new Float32Array(CAMERA.width * CAMERA.height);
    for (let v = 0, i = 0; v < CAMERA.height; v++) for (let u = 0; u < CAMERA.width; u++) vignette[i++] = 1 - 0.45 * (((u - CAMERA.cx) / CAMERA.cx) ** 2 + ((v - CAMERA.cy) / CAMERA.cx) ** 2);
    const COLORS = { walls: WALL_COLORS.map(rgb), floor: rgb("#8a8f98"), sky: rgb("#cfe8ff"), outside: rgb("#b9bec5") };
    function camera(eye) {
        const cos = Math.cos(bot.a), sin = Math.sin(bot.a), pixels = frame.data;
        for (let i = 0, n = CAMERA.width * CAMERA.height; i < n; i++) {
            const left = rays[i * 2], up = rays[i * 2 + 1];
            const dx = cos - sin * left, dy = sin + cos * left; // direction of the ray in the arena (dz = up)
            // First wall on the way: x = 0 or W, y = 0 or H
            const tx = dx > 0 ? (W - eye[0]) / dx : (dx < 0 ? -eye[0] / dx : Infinity), ty = dy > 0 ? (H - eye[1]) / dy : (dy < 0 ? -eye[1] / dy : Infinity);
            const t = Math.min(tx, ty), z = eye[2] + t * up;
            let color = COLORS.sky;
            if (z < 0) color = COLORS.floor;                  // reaches the floor before the wall
            else if (z <= WALL_TALL) color = COLORS.walls[tx < ty ? (dx > 0 ? 1 : 0) : (dy > 0 ? 3 : 2)];
            else if (up < 0) color = COLORS.outside;          // passes over the wall and comes down behind it
            const light = vignette[i], grain = (Math.random() - 0.5) * 14; // (values out of range are clamped by the image)
            pixels[i * 4] = color[0] * light + grain; pixels[i * 4 + 1] = color[1] * light + grain; pixels[i * 4 + 2] = color[2] * light + grain; pixels[i * 4 + 3] = 255;
        }
        g.putImageData(frame, 0, 0);
        return canvas.toDataURL("image/png").split(",")[1];
    }

    // --- Dashboard (built once) ---
    function createDashboard() {
        const dashboard = TP.dashboards.getOrCreateDashboard("Robot sample");
        const group = dashboard.getGroupName();
        const chart = (names, w, h) => { const v = new TP.view.ViewChart("", names, group); v.setSize(w, h); return v; };
        const values = (names, w, h) => { const v = new TP.view.ViewCurrentValue("", names, group); v.setSize(w, h); return v; };
        const layout = (type, w, h) => { const l = new TP.view.ViewLayout("", group); l.layout.type = type; l.layout.align = "stretch"; l.setSize(w, h); return l; }; // stretch: views of a row share its height

        // Everything visible at once: motion charts on top, then camera, values and the merged logs of all subsystems
        const main = layout("column"), top = layout("row"), bottom = layout("row"), small = layout("column", 2, 5);
        dashboard.setView(main);
        main.addView(top);
        main.addView(bottom);
        top.addView(chart(["robot.wheel.left", "robot.wheel.right"], 3, 5));
        top.addView(chart(["robot.current.left", "robot.current.right"], 3, 5));
        top.addView(small);
        small.addView(chart(["robot.distance"], 2, 4));
        small.addView(chart(["robot.gyro.z"], 2, 4));
        // The camera pictures, with what the 3D telemetries say drawn over them: the walls must fall on the walls of the picture
        const cameraView = new TP.view.ViewImage("", ["robot.camera", "robot.3d.wall.back", "robot.3d.wall.front", "robot.3d.wall.right", "robot.3d.wall.left", "robot.3d.obstacle"], group);
        cameraView.setSize(2, 5);
        cameraView.setOption("outline", true); // Outlines only: the picture stays visible inside the walls
        cameraView.setOption("overlayOpacity", 100);
        cameraView.setOption("title", "Camera + 3D");
        bottom.addView(cameraView);
        const rawView = new TP.view.ViewImage("", ["robot.camera"], group); // The same pictures, with nothing over them
        rawView.setSize(2, 5);
        rawView.setOption("title", "Camera");
        bottom.addView(rawView);
        bottom.addView(values(["robot.state", "robot.position", "robot.heading", "robot.battery"], 2, 5));
        const logView = new TP.view.ViewLog("", ["robot.nav.log", "robot.motor.log", "robot.power.log", "robot.camera.log"], group);
        logView.setSize(3, 5);
        bottom.addView(logView);
        const scene = new TP.view.ViewScene3D("", ["robot.3d.floor", "robot.3d.wall.back", "robot.3d.wall.front", "robot.3d.wall.right", "robot.3d.wall.left", "robot.3d.body", "robot.3d.wheel.left", "robot.3d.wheel.right", "robot.3d.screen", "robot.3d.obstacle", "robot.camera", "robot.path"], group);
        scene.setSize(3, 5);
        scene.setOption("trailLength", 500);
        bottom.addView(scene, 0);
        return dashboard;
    }

    // --- Public API ---
    let timer = null, lastSlow = 0, last3D = 0;
    return {
        get running() { return timer !== null; },
        get dashboard() { return TP.dashboards.getDashboard("Robot sample"); },
        start() {
            if (timer !== null) return;
            if (!this.dashboard) createDashboard();
            let last = Date.now();
            timer = setInterval(() => { // Catch up if the page was throttled, so that simulated time follows real time
                const now = Date.now();
                for (let n = Math.min(50, Math.floor((now - last) / (STEP * 1000))); n > 0; n--) { step(); publishFast(); last += STEP * 1000; }
                if (bot.t - last3D >= 0.039) { last3D = bot.t; publish3D(); }
                if (bot.t - lastSlow >= 0.2) { lastSlow = bot.t; publishSlow(); }
            }, 20);
        },
        stop() { clearInterval(timer); timer = null; },
    };
}
