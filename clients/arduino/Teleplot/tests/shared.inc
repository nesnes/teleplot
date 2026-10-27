// The same calls, built with each header (parity_full.cpp: clients/cpp/Teleplot.h, binary; parity_micro.cpp: this library, text):
// one API, and the page must get the same telemetries from both (parity.test.js). Values are exact in float32 and with 7 digits.
static const int64_t T0 = 1760000000000000000LL; // ns since 1970
static int64_t clockNs = T0;
static Teleplot::Time testClock() { return Teleplot::ns(clockNs); }
static Teleplot::Result gotoHandler(Teleplot::Args const& args) { return args.has("target") ? Teleplot::ok("arrived") : Teleplot::error("no target"); }
static float kp = 0.5f;

static void sharedScenario(Teleplot& tp) {
    tp.clock(testClock);

    tp.telemetry("battery").unit("V").range(10.5, 12.5).desc("Main battery").label("power");
    tp.telemetry("battery").threshold("low", Teleplot::Below, 11.0, "orange");
    tp.update("battery", 12.25);
    for (int i = 0; i < 20; ++i) { clockNs = T0 + i * 10000000LL; tp.update("speed", i * 0.5); }
    clockNs = T0;
    tp.update("count", 7);
    tp.update("flag", true);
    tp.update("mode", "docking");
    tp.update("xy", Teleplot::Number2D{ 1.5, -2 });
    tp.update("p3", Teleplot::Number3D{ 1, 2, 3 });
    tp.update("explicit", 4.25, Teleplot::ns(T0 - 1000000000LL));
    tp.log("events", "docked");
    tp.stack("task", "loop/plan");
    {
        Teleplot::Stack loop(tp, "task2", "loop");
        { Teleplot::Stack plan(tp, "task2", "plan"); }
    }

    auto body = tp.telemetry("robot.body");
    body.shape(Teleplot::Cube).size(0.5, 0.25, 0.125).color("#2ecc71");
    body.at(Teleplot::ns(T0 + 1000000000LL)).position(1, 2).yaw(0.5);
    clockNs = T0 + 2000000000LL;
    body.quaternion(1, 0, 0, 0);
    clockNs = T0;
    tp.telemetry("arm").color("blue").shape(Teleplot::Cylinder);
    tp.telemetry("lidar").frame("robot.body").position(0.25, 0, 0.5);
    Teleplot::Number3D points[3] = { Teleplot::Number3D{ 1, 0.5, 0 }, Teleplot::Number3D{ 2, -0.5, 0.25 }, Teleplot::Number3D{ 3, 1, 0 } };
    tp.telemetry("lidar").cloud(points, 3);
    Teleplot::Number2D line[3] = { Teleplot::Number2D{ 0, 0 }, Teleplot::Number2D{ 1, 0.5 }, Teleplot::Number2D{ 2, 0.25 } };
    tp.telemetry("path").shape(Teleplot::Line).lineWidth(0.03125).points(line, 3);
    tp.telemetry("goal").shape(Teleplot::Arrow).position(2, 1).vector(0.5, 0).opacity(0.5);
    tp.telemetry("label").shape(Teleplot::Text).position(2, 1.25).text("goal").textSize(0.125);
    static uint8_t picture[2000];
    for (int i = 0; i < 2000; ++i) { picture[i] = static_cast<uint8_t>(i % 251); }
    tp.telemetry("cam").intrinsics(640, 480, 520, 521, 320, 240).distortion(-0.25, 0.0625, 0.5, 0.25, 0).image(Teleplot::Jpeg, picture, sizeof(picture));
    tp.telemetry("detection").pixelsOf("cam").shape(Teleplot::Rect).position(320, 200).size(80, 60);
    tp.telemetry("tex").shape(Teleplot::Cube).texture("http://x/a.png");
    tp.telemetry("stl").stl("http://x/a.stl");
    tp.dashboard("DASH|Robot/Motion:chart:battery|w=2");
    static const char* const STATES[] = { "idle#waiting", "mission/goto", "mission/grasp", "error" };
    static const char* const TRANSITIONS[] = { "idle>mission=start", "mission/goto>mission/grasp=arrived", "mission>error=fault" };
    tp.telemetry("machine").stack().enumValues(STATES).edges(TRANSITIONS);
    tp.stack("machine", "mission/goto");
    tp.update("machine", "mission/goto=failure,error");

    tp.param("kp", &kp).range(0, 10).step(0.5).desc("Proportional gain").unit("1/s");
    tp.action("goto", gotoHandler)
        .title("Go to").confirm()
        .arg(Teleplot::Arg("target", Teleplot::Arg::XY))
        .arg(Teleplot::Arg("speed").optional().defaultValue(0.25).range(0.125, 1).unit("m/s"));
    tp.poll();
    tp.flush();
}
