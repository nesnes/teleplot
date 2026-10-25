# The scenario of clients/arduino/Teleplot/tests/shared.inc, line by line in Python: the page must get the same telemetries from it as
# from the C++ client (binary) and from the Arduino library (text). Usage: python3 parity.py <folder>: writes python.teleplot (binary)
# and python.teleplot.txt (text). Read by parity.test.js.
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from teleplot import Teleplot

T0 = 1760000000000000000  # ns since 1970
clock_ns = T0


def test_clock():
    return Teleplot.ns(clock_ns)


def goto_handler(args):
    return Teleplot.ok("arrived") if args.has("target") else Teleplot.error("no target")


def shared_scenario(tp):
    global clock_ns
    tp.clock(test_clock)

    tp.telemetry("battery").unit("V").range(10.5, 12.5).desc("Main battery").label("power")
    tp.telemetry("battery").threshold("low", Teleplot.Below, 11.0, "orange")
    tp.update("battery", 12.25)
    for i in range(20):
        clock_ns = T0 + i * 10000000
        tp.update("speed", i * 0.5)
    clock_ns = T0
    tp.update("count", 7)
    tp.update("flag", True)
    tp.update("mode", "docking")
    tp.update("xy", Teleplot.Number2D(1.5, -2))
    tp.update("p3", Teleplot.Number3D(1, 2, 3))
    tp.update("explicit", 4.25, Teleplot.ns(T0 - 1000000000))
    tp.log("events", "docked")
    tp.stack("task", "loop/plan")
    with Teleplot.Stack(tp, "task2", "loop"):
        with Teleplot.Stack(tp, "task2", "plan"):
            pass

    body = tp.telemetry("robot.body")
    body.shape(Teleplot.Cube).size(0.5, 0.25, 0.125).color("#2ecc71")
    body.at(Teleplot.ns(T0 + 1000000000)).position(1, 2).yaw(0.5)
    clock_ns = T0 + 2000000000
    body.quaternion(1, 0, 0, 0)
    clock_ns = T0
    tp.telemetry("arm").color("blue").shape(Teleplot.Cylinder)
    tp.telemetry("lidar").frame("robot.body").position(0.25, 0, 0.5)
    tp.telemetry("lidar").cloud([Teleplot.Number3D(1, 0.5, 0), Teleplot.Number3D(2, -0.5, 0.25), Teleplot.Number3D(3, 1, 0)])
    tp.telemetry("path").shape(Teleplot.Line).lineWidth(0.03125).points([Teleplot.Number2D(0, 0), Teleplot.Number2D(1, 0.5), Teleplot.Number2D(2, 0.25)])
    tp.telemetry("goal").shape(Teleplot.Arrow).position(2, 1).vector(0.5, 0).opacity(0.5)
    tp.telemetry("label").shape(Teleplot.Text).position(2, 1.25).text("goal").textSize(0.125)
    picture = bytes(i % 251 for i in range(2000))
    tp.telemetry("cam").intrinsics(640, 480, 520, 521, 320, 240).distortion(-0.25, 0.0625, 0.5, 0.25, 0).image(Teleplot.Jpeg, picture)
    tp.telemetry("detection").pixelsOf("cam").shape(Teleplot.Rect).position(320, 200).size(80, 60)
    tp.telemetry("tex").shape(Teleplot.Cube).texture("http://x/a.png")
    tp.telemetry("stl").stl("http://x/a.stl")
    tp.dashboard("DASH|Robot/Motion:chart:battery|w=2")

    tp.param("kp", 0.5).range(0, 10).step(0.5).desc("Proportional gain").unit("1/s")
    tp.action("goto", goto_handler) \
        .title("Go to").confirm() \
        .arg(Teleplot.Arg("target", Teleplot.Arg.XY)) \
        .arg(Teleplot.Arg("speed").optional().defaultValue(0.25).range(0.125, 1).unit("m/s"))
    tp.poll()
    tp.flush()


if __name__ == "__main__":
    folder = sys.argv[1] if len(sys.argv) > 1 else "."
    with Teleplot(file=os.path.join(folder, "python.teleplot"), flushInterval=0) as tp:
        shared_scenario(tp)
    clock_ns = T0
    with Teleplot(file=os.path.join(folder, "python.teleplot.txt"), protocol=Teleplot.TEXT_PROTOCOL, flushInterval=0) as tp:
        shared_scenario(tp)
