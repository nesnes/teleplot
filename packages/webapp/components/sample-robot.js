/*
 * Sample data: a tiny robot wandering in a 4 x 3 m arena, to demo every kind of telemetry.
 * Self-contained: only uses the Teleplot API (TP.datastore, TP.view, TP.dashboards).
 * Numbers (wheels, current, battery, gyro, distance), 2D numbers (position), text (state, zone, and one log per subsystem merged in a Log view), image (camera),
 * ranges (battery, heading, distance: a bar under their value) and thresholds (currents, battery, and how close a wall may get: that one changes
 * as the robot does, so its line on the chart is a step), a timeline of the states and logs (with what its camera does for each
 * picture as a stack: a row per level, two of its steps really measured), the state as marks on a chart,
 * 3D (the robot in its arena: shapes for the floor, the walls, the body, the wheels, a screen showing the camera, what the distance sensor hits; a 3D point for its path).
 * Frame of the 3D telemetries: x forward, y left, z up, in meters.
 * Frames: what the robot carries (wheels, screen, camera, lidar, an arrow for its heading, the circle of how far it looks) is described
 * once, in the frame of its body: only the body is moved. 2D: flat shapes (a zone, texts, the arrow, the circle) and a map, a 2D view
 * of the same telemetries as the 3D scene. Pixels: what the robot "detects" is drawn in the pixels of the camera pictures.
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
    const bot = { x: 1, y: 1, a: 0.5, v: 0, w: 0, vl: 0, vr: 0, state: "forward", until: 0, battery: 25.2, t: 0, reach: 0.5 };
    const DOCK = [0.15, 0.15, 0.95, 0.7]; // The zone drawn on the floor: x and y of two opposite corners

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
        // How close a wall may get before the robot turns: it is more careful every other half minute (a limit that changes over time)
        const reach = Math.floor(bot.t / 30) % 2 ? 0.8 : 0.5;
        if (reach != bot.reach) { bot.reach = reach; log("robot.nav.log", "INFO", `Keeping ${reach} m from the walls`); }
        if (bot.state == "forward" && d < bot.reach) {
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
    // What a number is expected between (an attribute: a bar under its value) and its thresholds (data: [name, "<" or ">", value, color]),
    // said again when they were forgotten (data cleared from the Data menu)
    const describe = (name, range, thresholds = []) => {
        const telem = TP.datastore.getTelemetry(name);
        if (range && !telem.getAttribute(P.TELEM_ATTR_RANGE)) telem.setAttribute(P.TELEM_ATTR_RANGE, { min: range[0], max: range[1] });
        if (thresholds.length && !telem.data[P.SECTION_TYPE_TELEM_DATA_THRESHOLD]) for (const threshold of thresholds) limit(name, ...threshold);
    };
    const limit = (name, thresholdName, operator, value, color = "") => put(name, P.SECTION_TYPE_TELEM_DATA_THRESHOLD, [operator == ">" ? P.THRESHOLD_ABOVE : P.THRESHOLD_BELOW, value, thresholdName, color]);
    const NUMBER = P.SECTION_TYPE_TELEM_DATA_NUMBER, NUMBER_2D = P.SECTION_TYPE_TELEM_DATA_NUMBER_2D;
    const TEXT = P.SECTION_TYPE_TELEM_DATA_TEXT, IMAGE = P.SECTION_TYPE_TELEM_DATA_IMAGE;
    const log = (name, level, text) => { // One text telemetry per subsystem, merged by the Log view; they share the view label "logs"
        put(name, TEXT, [`[${level}] ${text}`]);
        TP.datastore.getTelemetry(name).setAttribute(P.TELEM_ATTR_VIEW_LABEL, "logs");
        TP.datastore.getTelemetry(name).setAttribute(P.TELEM_ATTR_LOG, true); // Text emitted as a log (robot.state is text emitted as a state)
    };

    // 3D shapes: a shape is a telemetry with a shape attribute, its data are its position, orientation, size, color...
    const POSITION = P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION, QUATERNION = P.SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION, SIZE = P.SECTION_TYPE_TELEM_DATA_SHAPE_SIZE;
    // View labels: what makes the robot and what makes its environment. Telemetries of a label are displayed together by default, and the
    // Telemetries panel has a card per label to drag them all at once.
    const ROBOT = "robot", ENVIRONMENT = "environment";
    // In the frame of another telemetry: positions are relative to it, and follow it
    const inFrame = (name, parent, position, quaternion) => {
        if (position) put(name, POSITION, position);
        if (quaternion) put(name, QUATERNION, quaternion);
        TP.datastore.getTelemetry(name).setAttribute(P.TELEM_ATTR_FRAME, { type: P.FRAME_TYPE_POSE, name: parent });
    };
    const BODY = "robot.3d.body", BODY_Z = 0.09;
    function publishBody() { // The only thing that moves the robot: everything it carries is in its frame
        put(BODY, POSITION, [bot.x, bot.y, BODY_Z]);
        put(BODY, QUATERNION, [Math.cos(bot.a / 2), 0, 0, Math.sin(bot.a / 2)]); // (w, x, y, z): the heading is a rotation around z
    }
    const shape = (name, label, type, size, color, opacity = 255) => { // What does not change is sent once
        if (TP.datastore.getTelemetry(name)) return;
        if (size) put(name, SIZE, size);
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
        shape(BODY, ROBOT, CUBE, [0.3, WHEEL_BASE - 0.06, 0.1], "#2980b9");
        if (!TP.datastore.getTelemetry("robot.3d.screen")) {
            // What the robot carries, once: placed in the frame of its body (wheels are cylinders laid on their side: turned around x)
            const h = Math.SQRT1_2;
            for (const [name, side] of [["robot.3d.wheel.left", 1], ["robot.3d.wheel.right", -1]]) {
                shape(name, ROBOT, CYLINDER, [0.12, 0.12, 0.04], "#2c3e50");
                inFrame(name, BODY, [0, side * WHEEL_BASE / 2, -0.03], [h, h, 0, 0]);
            }
            shape("robot.3d.screen", ROBOT, CUBE, [0.01, 0.24, 0.18], "white");
            inFrame("robot.3d.screen", BODY, [-0.1, 0, 0.15]);
            put("robot.3d.screen", P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE, [P.TEXTURE_TYPE_IMAGE, "robot.camera"]); // Shows the image telemetry
            // Flat shapes, in the frame of the body too: an arrow for where it looks, the circle of how close a wall can get before it turns
            shape("robot.map.heading", ROBOT, P.TELEM_ATTR_SHAPE_TYPE_ARROW, [1, 1, 1], "#f39c12");
            put("robot.map.heading", P.SECTION_TYPE_TELEM_DATA_SHAPE_VECTOR, [0.35, 0, 0]);
            put("robot.map.heading", P.SECTION_TYPE_TELEM_DATA_SHAPE_LINE_WIDTH, [0.025]);
            inFrame("robot.map.heading", BODY, [0, 0, 0.06]);
            shape("robot.map.reach", ROBOT, P.TELEM_ATTR_SHAPE_TYPE_CIRCLE, [1, 1, 1], "#e74c3c", 28);
            inFrame("robot.map.reach", BODY, [0, 0, -BODY_Z + 0.004]);
            // Flat shapes of the arena: a zone (a polygon is the surface inside its points) and its name
            shape("robot.map.dock", ENVIRONMENT, P.TELEM_ATTR_SHAPE_TYPE_POLYGON, [1, 1, 1], "#27ae60", 90);
            put("robot.map.dock", P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD, [Float32Array.from([DOCK[0], DOCK[1], 0.003, DOCK[2], DOCK[1], 0.003, DOCK[2], DOCK[3], 0.003, DOCK[0], DOCK[3], 0.003]), null, null]);
            shape("robot.map.dock.name", ENVIRONMENT, P.TELEM_ATTR_SHAPE_TYPE_TEXT, [0.13, 0.13, 0.13], "#1e8449"); // (its size is its height)
            put("robot.map.dock.name", P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXT, ["Dock"]);
            put("robot.map.dock.name", POSITION, [0.2, 0.82, 0.003]);
            // What the distance sensor hits, and a text that follows it (in its frame)
            shape("robot.3d.obstacle", ENVIRONMENT, SPHERE, [0.1, 0.1, 0.1], "#e74c3c", 170);
            shape("robot.map.obstacle.name", ENVIRONMENT, P.TELEM_ATTR_SHAPE_TYPE_TEXT, null, "#c0392b"); // No size: a steady size on screen
            inFrame("robot.map.obstacle.name", "robot.3d.obstacle", [0.07, 0.07, 0.08]);
        }

        publishBody();
        const d = ray(bot.a).d;
        put("robot.3d.obstacle", POSITION, [bot.x + Math.cos(bot.a) * d, bot.y + Math.sin(bot.a) * d, 0.09]);
        put("robot.map.obstacle.name", P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXT, [d.toFixed(2) + " m"]);
        put("robot.path", P.SECTION_TYPE_TELEM_DATA_NUMBER_3D, [bot.x, bot.y, 0.005], "m");
        TP.datastore.getTelemetry("robot.path").setAttribute(P.TELEM_ATTR_VIEW_LABEL, ROBOT);
    }

    // A 2D lidar on top of the robot: one turn of 240 rays, 10 times per second. A point cloud telemetry: the points are in the frame
    // of the sensor (x forward, y left, z = 0 for a flat scan), each with an intensity (how well its wall reflects, weaker with the
    // distance). The sensor is in the frame of the body (sent once): each scan lands where the robot was when it was taken.
    const LIDAR = { rays: 240, up: 0.16, reflectivity: [0.9, 0.55, 0.75, 0.35] };
    function publishLidar() {
        const positions = new Float32Array(LIDAR.rays * 3), intensities = new Float32Array(LIDAR.rays);
        for (let i = 0; i < LIDAR.rays; i++) {
            const angle = i / LIDAR.rays * 2 * Math.PI;
            const hit = ray(bot.a + angle), d = hit.d + noise(0.01);
            positions[i * 3] = Math.cos(angle) * d;
            positions[i * 3 + 1] = Math.sin(angle) * d;
            intensities[i] = LIDAR.reflectivity[hit.wall] / (1 + 0.15 * d * d) + noise(0.02);
        }
        publishBody(); // Where the robot is now: what the scan is placed with
        put("robot.lidar", P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD, [positions, intensities, null]);
        if (!TP.datastore.getTelemetry("robot.lidar").getAttribute(P.TELEM_ATTR_FRAME)) {
            inFrame("robot.lidar", BODY, [0, 0, LIDAR.up - BODY_Z]);
            TP.datastore.getTelemetry("robot.lidar").setAttribute(P.TELEM_ATTR_VIEW_LABEL, ROBOT);
        }
    }

    function publishFast() { // every step
        put("robot.wheel.left", NUMBER, [bot.vl + noise(0.01)], "m/s");
        put("robot.wheel.right", NUMBER, [bot.vr + noise(0.01)], "m/s");
        put("robot.current.left", NUMBER, [bot.il + noise(0.03)], "A");
        put("robot.current.right", NUMBER, [bot.ir + noise(0.03)], "A");
        put("robot.gyro.z", NUMBER, [bot.w + noise(0.02)], "rad/s");
        put("robot.distance", NUMBER, [ray(bot.a).d + noise(0.01)], "m");
        describe("robot.current.left", null, [["spike", ">", 1.6]]);
        describe("robot.current.right", null, [["spike", ">", 1.6]]);
        describe("robot.distance", [0, 5]);
        // The distance at which the robot turns is a threshold that changes: sent when it does, it holds from then on
        if (bot.reach != bot.reachSent || !TP.datastore.getTelemetry("robot.distance").data[P.SECTION_TYPE_TELEM_DATA_THRESHOLD]) {
            bot.reachSent = bot.reach;
            limit("robot.distance", "wall", "<", bot.reach, "#e74c3c");
            if (TP.datastore.getTelemetry("robot.map.reach")) put("robot.map.reach", SIZE, [bot.reach * 2, bot.reach * 2, 1]); // (the circle around the robot on the map)
        }
    }
    function publishSlow() { // 5 Hz
        put("robot.position", NUMBER_2D, [bot.x, bot.y], "m");
        put("robot.heading", NUMBER, [(bot.a * 180 / Math.PI % 360 + 360) % 360], "°");
        put("robot.battery", NUMBER, [bot.battery - 0.1 * (bot.il + bot.ir) + noise(0.01)], "V");
        describe("robot.heading", [0, 360]);
        describe("robot.battery", [20, 25.2], [["low", "<", 22], ["empty", "<", 20.5, "#e74c3c"]]);
        put("robot.state", TEXT, [bot.state]);
        // Where it is: the name of the zone, or nothing (an empty text: a hole in the timeline)
        put("robot.zone", TEXT, [bot.x > DOCK[0] && bot.x < DOCK[2] && bot.y > DOCK[1] && bot.y < DOCK[3] ? "dock" : ""]);
        // The camera: its parameters and where it is on the robot (once: it is in the frame of the body, looking along its x), then
        // where the robot is when the picture is taken, and the picture
        const eye = [bot.x + Math.cos(bot.a) * CAMERA.forward, bot.y + Math.sin(bot.a) * CAMERA.forward, CAMERA.up];
        if (!TP.datastore.getTelemetry("robot.camera")) {
            put("robot.camera", P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS, [CAMERA.width, CAMERA.height, CAMERA.fx, CAMERA.fy, CAMERA.cx, CAMERA.cy]);
            put("robot.camera", P.SECTION_TYPE_TELEM_DATA_CAMERA_DISTORTION, CAMERA.distortion);
            put("robot.camera", SIZE, [0.35, 1, 1]); // how far its pyramid is drawn in 3D views
            inFrame("robot.camera", BODY, [CAMERA.forward, 0, CAMERA.up - BODY_Z]);
        }
        publishBody();
        // What the robot "detects": a box around the obstacle, drawn in the pixels of the picture (no camera model is needed to show
        // it: only the pixels). Here they are computed with the model of the camera, as a detector would find them in the picture.
        const depth = ray(bot.a).d - CAMERA.forward;
        const pixel = TP.view.ViewImage.projectPoint(CAMERA, [depth, 0, BODY_Z - CAMERA.up]);
        const found = "robot.camera.found", radius = Math.max(3, CAMERA.fx * 0.05 / Math.max(depth, 0.05) * 1.4);
        if (!TP.datastore.getTelemetry(found)) {
            for (const [name, type] of [[found, P.TELEM_ATTR_SHAPE_TYPE_RECT], [found + ".name", P.TELEM_ATTR_SHAPE_TYPE_TEXT]]) {
                put(name, P.SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR, ["#f1c40f"]);
                TP.datastore.getTelemetry(name).setAttribute(P.TELEM_ATTR_SHAPE, { type, data: "" });
                TP.datastore.getTelemetry(name).setAttribute(P.TELEM_ATTR_FRAME, { type: P.FRAME_TYPE_PIXELS, name: "robot.camera" });
            }
            put(found, P.SECTION_TYPE_TELEM_DATA_SHAPE_LINE_WIDTH, [1.5]); // (pixels of the picture)
        }
        const seen = pixel !== undefined && pixel[0] > 0 && pixel[0] < CAMERA.width && pixel[1] > 0 && pixel[1] < CAMERA.height;
        put(found, P.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY, [seen ? 60 : 0]);
        put(found + ".name", P.SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY, [seen ? 255 : 0]);
        if (seen) {
            put(found, POSITION, [pixel[0], pixel[1], 0]);
            put(found, SIZE, [radius * 2, radius * 2, 1]);
            put(found + ".name", POSITION, [Math.max(2, pixel[0] - radius), Math.max(8, pixel[1] - radius - 8), 0]);
            put(found + ".name", P.SECTION_TYPE_TELEM_DATA_SHAPE_TEXT, ["obstacle " + (depth + CAMERA.forward).toFixed(2) + " m"]);
        }
        put("robot.camera", IMAGE, [P.IMAGE_TYPE_PNG, camera(eye)]);
        publishPipeline(seen);
    }

    // What the camera does for each picture, as a stack (the path of what is running: a row per level in the timeline), dated like a
    // device that times its own code would: finer than a millisecond. Two of the four steps are really measured here: "read out" is
    // the time it took to compute the picture, "encode" the time to make a PNG of it. The two others are pretended, and move like
    // real ones do: the exposure drifts slowly (auto exposure) and the detection takes longer when there is something to find.
    const timing = { readOut: 0, encode: 0 }; // (milliseconds, measured by camera())
    function publishPipeline(seen) {
        const name = "robot.camera.task";
        const exposure = Math.max(8, 32 + 10 * Math.sin(bot.t / 7) + noise(3));
        const detect = Math.max(6, (seen ? 55 : 30) + noise(9) + (Math.random() < 0.08 ? 25 : 0)); // (now and then a slow one)
        // The picture is out now: its steps ended one after the other just before
        const end = performance.timeOrigin + performance.now();
        const steps = [["frame/expose", exposure], ["frame/read out", timing.readOut], ["frame/encode", timing.encode], ["frame/detect", detect]];
        let start = end - steps.reduce((sum, step) => sum + step[1], 0);
        if (!TP.datastore.getTelemetry(name)) {
            const telem = TP.datastore.getOrCreateTelemetry(name);
            telem.setAttribute(P.TELEM_ATTR_AUTOPLOT, false);
            telem.setAttribute(P.TELEM_ATTR_STACK, true);
        }
        const times = [], texts = [];
        for (const [path, duration] of steps) { times.push(start / 1000); texts.push(path); start += duration; }
        times.push(end / 1000); texts.push(""); // (nothing runs until the next picture)
        TP.datastore.getTelemetry(name).addData(TEXT, times, [texts]);
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
        const began = performance.now();
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
        const computed = performance.now();
        g.putImageData(frame, 0, 0);
        const png = canvas.toDataURL("image/png").split(",")[1];
        timing.readOut = computed - began;          // (what the camera pipeline reports: see publishPipeline)
        timing.encode = performance.now() - computed;
        return png;
    }

    // --- Dashboard (built once) ---
    function createDashboard() {
        const dashboard = TP.dashboards.getOrCreateDashboard("Robot sample");
        const group = dashboard.getGroupName();
        const chart = (names, w, h) => { const v = new TP.view.ViewChart("", names, group); v.setSize(w, h); return v; };
        const values = (names, w, h) => { const v = new TP.view.ViewCurrentValue("", names, group); v.setSize(w, h); return v; };
        const layout = (type, w, h) => { const l = new TP.view.ViewLayout("", group); l.layout.type = type; l.layout.align = "stretch"; l.setSize(w, h); return l; }; // stretch: views of a row share its height

        const stack = (w, h) => { const s = new TP.view.ViewStack("", group); s.setSize(w, h); return s; };
        const timeGroup = (view, name) => { view.setOption("timeGroup", "custom"); view.setOption("timeGroupName", name); return view; };

        // On top, where the robot is: the 3D scene, the same telemetries on a map (a 2D view), what its camera sees, its state and the
        // merged logs of all subsystems.
        // Under it, the motion charts. The plain camera picture is alone in a time group of its own ("Live"): nothing moves its
        // cursor, so it keeps showing the latest picture while the rest of the dashboard is zoomed or follows the pointer.
        // Between them, the timeline: the states of the robot as bands (where it is leaves holes: it is in no zone most of the time) and
        // two of its logs as ticks. On the charts, the state and the motor log are marks, and the thresholds are dashed lines.
        const main = layout("column"), top = layout("row"), bottom = layout("row");
        const cameras = layout("column", 2, 7), state = layout("column", 3, 7), tabs = stack(2, 5);
        dashboard.setView(main);
        main.addView(top);
        // (numbers can have a lane too: the distance has a threshold, it is a band while a wall is too close; the gyro is a plain line)
        const timeline = new TP.view.ViewTimeline("", ["robot.state", "robot.camera.task", "robot.zone", "robot.distance", "robot.gyro.z", "robot.nav.log", "robot.motor.log"], group);
        timeline.setSize(12, 5);
        main.addView(timeline);
        main.addView(bottom);

        const scene = new TP.view.ViewScene3D("", ["robot.3d.floor", "robot.3d.wall.back", "robot.3d.wall.front", "robot.3d.wall.right", "robot.3d.wall.left", "robot.3d.body", "robot.3d.wheel.left", "robot.3d.wheel.right", "robot.3d.screen", "robot.3d.obstacle", "robot.camera", "robot.path", "robot.lidar", "robot.map.dock", "robot.map.dock.name", "robot.map.heading", "robot.map.reach", "robot.map.obstacle.name"], group);
        scene.setSize(4, 7);
        scene.setOption("trailLength", 500);
        top.addView(scene);
        // The map: the same telemetries seen from above (solids are drawn as what they cover on the ground). Nothing is sent twice.
        const map = new TP.view.ViewScene2D("", ["robot.3d.floor", "robot.map.dock", "robot.map.dock.name", "robot.3d.wall.back", "robot.3d.wall.front", "robot.3d.wall.right", "robot.3d.wall.left", "robot.map.reach", "robot.path", "robot.lidar", "robot.3d.body", "robot.3d.wheel.left", "robot.3d.wheel.right", "robot.camera", "robot.map.heading", "robot.3d.obstacle", "robot.map.obstacle.name"], group);
        map.setSize(3, 7);
        map.setOption("trailLength", 500);
        map.setOption("displayLegend", false);
        map.setOption("title", "Map"); // (seen from above: x to the right, y up. axisRight / axisUp choose another way to look at it)
        top.addView(map);
        top.addView(cameras);
        top.addView(state);

        const rawView = timeGroup(new TP.view.ViewImage("", ["robot.camera"], group), "Live"); // The pictures, with nothing over them
        rawView.setSize(2, 3);
        rawView.setOption("pixelDrawings", false); // (the other camera view takes what is drawn in the pixels of the picture)
        rawView.setOption("title", "Camera");
        cameras.addView(rawView);
        // The same pictures with what the 3D telemetries say drawn over them: the walls must fall on the walls of the picture
        const cameraView = new TP.view.ViewImage("", ["robot.camera", "robot.3d.wall.back", "robot.3d.wall.front", "robot.3d.wall.right", "robot.3d.wall.left", "robot.3d.obstacle", "robot.lidar"], group);
        cameraView.setSize(2, 3);
        cameraView.setOption("outline", true); // Outlines only: the picture stays visible inside the walls
        cameraView.setOption("overlayOpacity", 100);
        cameraView.setOption("title", "Camera + 3D");
        cameras.addView(cameraView);

        state.addView(values(["robot.state", "robot.position", "robot.heading", "robot.battery", "robot.distance"], 3, 3));
        const logView = new TP.view.ViewLog("", ["robot.nav.log", "robot.motor.log", "robot.power.log", "robot.camera.log"], group);
        logView.setSize(3, 4);
        state.addView(logView);

        bottom.addView(chart(["robot.current.left", "robot.current.right", "robot.motor.log"], 3, 5));
        bottom.addView(chart(["robot.wheel.left", "robot.wheel.right", "robot.state"], 3, 5));
        bottom.addView(tabs);
        const distance = chart(["robot.distance"], 2, 5), gyro = chart(["robot.gyro.z"], 2, 5);
        distance.setOption("title", "Distance"); // (the title of a view is the name of its tab)
        gyro.setOption("title", "Gyro");
        tabs.addView(distance);
        tabs.addView(gyro);
        return dashboard;
    }

    // --- Public API ---
    let timer = null, lastSlow = 0, last3D = 0, lastLidar = 0;
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
                if (bot.t - lastLidar >= 0.099) { lastLidar = bot.t; publishLidar(); }
                if (bot.t - lastSlow >= 0.2) { lastSlow = bot.t; publishSlow(); }
            }, 20);
        },
        stop() { clearInterval(timer); timer = null; },
    };
}
