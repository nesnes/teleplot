/*
 * Sample data: a tiny robot wandering in a 4 x 3 m arena, to demo every kind of telemetry.
 * Self-contained: only uses the Teleplot API (TP.datastore, TP.view, TP.dashboards).
 * Numbers (wheels, current, battery, gyro, distance), 2D numbers (position), text (state, log lines shown in a Log view), image (camera).
 * TODO: 3D telemetries (robot position/rotation) once the 3D views exist.
 *
 *   const robot = createRobotSample(TP);   // robot.start(), robot.stop(), robot.running, robot.dashboard
 */
function createRobotSample(TP) {
    const P = TP.protocol;
    const W = 4, H = 3, WHEEL_BASE = 0.3, STEP = 0.02; // arena (m), distance between wheels (m), simulation step (s)
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
            bot.log = `Wall at ${d.toFixed(2)} m, turning ${bot.dir > 0 ? "left" : "right"}`;
        } else if (bot.state == "turning" && bot.t > bot.until) {
            bot.state = "forward";
            bot.log = "Path clear, driving forward";
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
        put("robot.camera", IMAGE, [P.IMAGE_TYPE_PNG, camera()]);
        if (bot.log) { put("robot.log", TEXT, [`[${bot.t.toFixed(1)} s] ${bot.log}`]); bot.log = ""; }
    }

    // Front camera: 128x96 raycast view of the arena, each wall has its own shade (base64 PNG)
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 96;
    const g = canvas.getContext("2d");
    function camera() {
        g.fillStyle = "#cfe8ff"; g.fillRect(0, 0, 128, 48); // sky
        g.fillStyle = "#8a8f98"; g.fillRect(0, 48, 128, 48); // floor
        const shades = ["#c0392b", "#e67e22", "#2980b9", "#27ae60"];
        for (let col = 0; col < 128; col++) {
            const a = bot.a + (col / 127 - 0.5) * 1.05; // ~60 degree field of view
            const hit = ray(a);
            const h = Math.min(96, 40 / (hit.d * Math.cos(a - bot.a)));
            g.fillStyle = shades[hit.wall];
            g.fillRect(col, 48 - h / 2, 1, h);
        }
        return canvas.toDataURL("image/png").split(",")[1];
    }

    // --- Dashboard (built once) ---
    function createDashboard() {
        const dashboard = TP.dashboards.getOrCreateDashboard("Robot sample");
        const group = dashboard.getGroupName();
        const chart = (names, w, h) => { const v = new TP.view.ViewChart("", names, group); v.setSize(w, h); return v; };
        const values = (names, w, h) => { const v = new TP.view.ViewCurrentValue("", names, group); v.setSize(w, h); return v; };
        const layout = (type, w, h) => { const l = new TP.view.ViewLayout("", group); l.layout.type = type; l.setSize(w, h); return l; };

        const main = layout("column"), top = layout("row"), bottom = layout("row"), side = layout("column", 2, 4);
        dashboard.setView(main);
        main.addView(top);
        main.addView(bottom);
        top.addView(chart(["robot.wheel.left", "robot.wheel.right"], 3, 4));
        top.addView(chart(["robot.distance"], 2, 4));
        top.addView(chart(["robot.current.left", "robot.current.right"], 3, 4));
        bottom.addView(values(["robot.camera"], 2, 4));
        bottom.addView(side);
        side.addView(values(["robot.state", "robot.position", "robot.heading", "robot.battery"], 2, 3));
        const stack = new TP.view.ViewStack("", group);
        stack.setSize(2, 4);
        bottom.addView(stack);
        const log = new TP.view.ViewLog("", ["robot.log"], group); log.setSize(2, 4); log.name = "Log"; stack.addView(log);
        const gyro = chart(["robot.gyro.z"], 2, 4); gyro.name = "Gyro"; stack.addView(gyro);
        return dashboard;
    }

    // --- Public API ---
    let timer = null, lastSlow = 0;
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
                if (bot.t - lastSlow >= 0.2) { lastSlow = bot.t; publishSlow(); }
            }, 20);
        },
        stop() { clearInterval(timer); timer = null; },
    };
}
