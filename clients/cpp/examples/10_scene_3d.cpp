// 10. A 3D scene: a body that turns, an arm placed in the frame of the body (it follows the body without being computed here), and
// a point in space with its trail. Frame of the scene: x forward, y to the left, z up. Positions in your own units.
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    auto body = tp.telemetry("body");
    body.shape(Teleplot::Cube).size(0.6, 0.4, 0.2).color("#3498db");
    tp.telemetry("arm").shape(Teleplot::Cylinder).size(0.05, 0.05, 0.5).color("orange").frame("body");  // relative to the body
    tp.telemetry("arm").position(0.2, 0, 0.35);
    for (double t = 0;; t += 0.025) {
        body.position(std::cos(t), std::sin(t), 0.1).quaternion(std::cos(t / 2), 0, 0, std::sin(t / 2));  // turning around z
        tp.update("drone", Teleplot::Number3D{ 1.5 * std::cos(t * 2), 1.5 * std::sin(t * 2), 1 + 0.3 * std::sin(t * 3) });
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
