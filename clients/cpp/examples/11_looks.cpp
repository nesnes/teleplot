// 11. How shapes look: a sphere in a color of numbers, a cube you see through, a mesh from an STL file, a picture on a rectangle.
// Files are urls the page can read: here the ones the Teleplot page serves (media/).
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    tp.telemetry("ball").shape(Teleplot::Sphere).size(0.5).position(0, 0, 0.25);
    tp.telemetry("glass").shape(Teleplot::Cube).size(1, 1, 1).position(0, 0, 0.5).color("lightblue").opacity(0.3);
    tp.telemetry("pawn").stl("media/pawn.stl").size(0.02).position(1.5, 0, 0).color("gold");
    tp.telemetry("sign").shape(Teleplot::Rect).size(2, 1.5).position(-1.5, 0, 0).texture("media/floor-plan.png");
    for (double t = 0;; t += 0.05) {
        tp.telemetry("ball").color(Teleplot::Rgb{ static_cast<std::uint8_t>(127 + 127 * std::sin(t)), 80, 200 });  // a color that changes
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
