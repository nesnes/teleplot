// Writes what the C++ client sends, in binary data files (doc/files.md), for client.test.js: the library of the page reads them back
// with its own parser, as it reads a live connection. Usage: scenarios <output folder>
#include "../Teleplot.h"
#include <string>
#include <thread>
#include <vector>

static const std::int64_t T0 = 1760000000000000000LL; // ns since 1970 (2025-10-09)
static const std::int64_t MS = 1000000LL;

static Teleplot::Options fileOptions(std::string const& path) {
    return Teleplot::Options().file(path).name("cpp_test").flushInterval(std::chrono::milliseconds(0));
}

// Numbers, texts, descriptions, logs, stacks, precision, rate, sizes and names
static void basics(std::string const& dir) {
    Teleplot tp(fileOptions(dir + "/basics.teleplot"));
    std::int64_t now = T0;
    tp.clock([&] { return Teleplot::ns(now); });

    tp.telemetry("battery").unit("V").range(10.5, 12.6).desc("Main battery").label("power")
        .threshold("low", Teleplot::Below, 11.0, "orange").threshold("empty", Teleplot::Below, 10.8);
    tp.update("battery", 12.25);
    for (int i = 0; i < 600; ++i) { now = T0 + i * 10 * MS; tp.update("speed", i * 0.5); } // more than 255 per section, over more than 4.29 s
    now = T0;
    tp.update("count", 7);
    tp.update("flag", true);
    tp.update("mode", "docking");
    tp.update("xy", Teleplot::Number2D{ 1.5, -2 });
    tp.update("p3", Teleplot::Number3D{ 1, 2, 3 });
    tp.update("explicit", 4.25, Teleplot::ns(T0 - 1000 * MS));
    tp.telemetry("gps").precise();
    tp.update("gps", Teleplot::Number2D{ 2.294481, 48.858370 });
    tp.telemetry("rated").maxRate(10);
    for (int i = 0; i < 1000; ++i) { now = T0 + i * MS; tp.update("rated", i); }
    now = T0;
    tp.log("events", "docked");
    tp.log("plain line");
    tp.stack("task", "loop/plan");
    {
        Teleplot::Stack loop(tp, "task2", "loop");
        { Teleplot::Stack plan(tp, "task2", "plan"); }
    }
    tp.telemetry("hidden").autoplot(false).update(1);
    tp.telemetry("tmo").timeout(Teleplot::ms(1500)).update(1);
    tp.telemetry("colored").color("red").update(2);
    tp.update("long", std::string(2000, 'x'));
    tp.dashboard("DASH|Robot/Motion:chart:speed|w=2");
    for (int i = 0; i < 1000; ++i) { tp.update("c" + std::to_string(i), i); } // some of these names have the same 16-bit hash
}

// Shapes, frames, flat shapes, clouds, pictures and cameras
static void scene(std::string const& dir) {
    Teleplot tp(fileOptions(dir + "/scene.teleplot"));
    std::int64_t now = T0;
    tp.clock([&] { return Teleplot::ns(now); });

    auto body = tp.telemetry("robot.body");
    body.shape(Teleplot::Cube).size(0.4, 0.3, 0.2).color("#2ecc71");
    body.at(Teleplot::ns(T0 + 1000 * MS)).position(1, 2).yaw(0.5);
    now = T0 + 2000 * MS;
    body.quaternion(1, 0, 0, 0);
    now = T0;
    tp.telemetry("arm").color("blue").shape(Teleplot::Cylinder);
    tp.telemetry("lidar").frame("robot.body").position(0.15, 0, 0.25);
    std::vector<Teleplot::Number3D> points;
    std::vector<float> intensities;
    std::vector<Teleplot::Rgb> colors;
    for (int i = 0; i < 500; ++i) {
        points.push_back({ i * 0.01, -i * 0.02, 0.5 });
        intensities.push_back(static_cast<float>(i));
        colors.push_back({ static_cast<std::uint8_t>(i % 256), 20, 30 });
    }
    tp.telemetry("lidar").cloud(points.data(), points.size(), intensities.data(), colors.data());
    tp.telemetry("path").shape(Teleplot::Line).lineWidth(0.02).points(std::vector<Teleplot::Number2D>{ { 0, 0 }, { 1, 0.5 }, { 2, 0.25 } });
    tp.telemetry("goal").shape(Teleplot::Arrow).position(2, 1).vector(0.5, 0).opacity(0.5);
    tp.telemetry("label").shape(Teleplot::Text).position(2, 1.25).text("goal").textSize(0.1);
    tp.telemetry("flat").shape(Teleplot::Rect).size(2, 3);
    std::vector<std::uint8_t> picture(5000);
    for (std::size_t i = 0; i < picture.size(); ++i) { picture[i] = static_cast<std::uint8_t>(i % 251); }
    tp.telemetry("cam").intrinsics(640, 480, 520, 521, 320, 240).distortion(-0.25, 0.0625, 0.001, 0.002, 0).image(Teleplot::Jpeg, picture);
    tp.telemetry("detection").pixelsOf("cam").shape(Teleplot::Rect).position(320, 200).size(80, 60);
    tp.telemetry("tex").shape(Teleplot::Cube).texture("http://x/a.png");
    tp.telemetry("tex2").shape(Teleplot::Cube).textureFrom("cam");
    tp.telemetry("rgb").shape(Teleplot::Sphere).color(Teleplot::Rgb{ 10, 20, 30 });
    tp.telemetry("stl").stl("http://x/a.stl");
}

// Declarations of settings and actions
static void commands(std::string const& dir) {
    Teleplot tp(fileOptions(dir + "/commands.teleplot"));
    static float kp = 0.4f;
    static std::string mode = "auto";
    static Teleplot::Pose2D cmdVel;
    tp.param("kp", &kp).range(0, 10).step(0.01).desc("Proportional gain").unit("1/s");
    tp.param("mode", &mode).choices({ "auto", "manual" });
    tp.param("cmd_vel", &cmdVel).axes(Teleplot::X | Teleplot::Yaw).rate(20).hold(200);
    tp.action("goto", [](Teleplot::Args const&) { return Teleplot::ok(); })
        .title("Go to").confirm()
        .arg(Teleplot::Arg("target", Teleplot::Arg::XY))
        .arg(Teleplot::Arg("speed").optional().defaultValue(0.3).range(0.1, 1).unit("m/s"));
}

// Samples sent once are sent again with the descriptions
static void resend(std::string const& dir) {
    Teleplot tp(fileOptions(dir + "/resend.teleplot").describeInterval(std::chrono::milliseconds(1)));
    tp.clock([] { return Teleplot::ns(T0); });
    tp.telemetry("box").shape(Teleplot::Cube).size(1, 2, 3).threshold("hot", Teleplot::Above, 70);
    tp.update("stream", 1.0);
    for (int i = 0; i < 3; ++i) { tp.flush(); std::this_thread::sleep_for(std::chrono::milliseconds(5)); }
    tp.flush();
}

// Stacks of several threads
static void threads(std::string const& dir) {
    Teleplot tp(fileOptions(dir + "/threads.teleplot"));
    tp.clock([] { return Teleplot::ns(T0); });
    { Teleplot::Stack level(tp, "task", "main"); }
    std::thread worker([&] {
        Teleplot::threadName("worker");
        Teleplot::Stack level(tp, "task", "work");
    });
    worker.join();
}

// The stats of the client as telemetries (sendStats)
static void stats(std::string const& dir) {
    Teleplot tp(fileOptions(dir + "/stats.teleplot"));
    tp.sendStats(Teleplot::ms(10));
    for (int i = 0; i < 30; ++i) { tp.update("work", i); tp.flush(); std::this_thread::sleep_for(std::chrono::milliseconds(2)); }
    tp.update("long", std::string(2000, 'x')); // (too big: counted)
    std::this_thread::sleep_for(std::chrono::milliseconds(15));
    tp.flush();
    tp.sendStats(Teleplot::ms(0));
}

int main(int argc, char** argv) {
    std::string dir = argc > 1 ? argv[1] : ".";
    basics(dir);
    scene(dir);
    commands(dir);
    resend(dir);
    threads(dir);
    stats(dir);
    return 0;
}
