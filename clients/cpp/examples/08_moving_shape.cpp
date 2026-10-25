// 8. A shape that moves: described once (its kind, size and color), then only its position and heading are sent.
// The page shows it on a map (2D view). Angles are in radians: Teleplot::deg() converts degrees.
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    auto robot = tp.telemetry("robot");
    robot.shape(Teleplot::Rect).size(0.4, 0.3).color("#2ecc71");
    for (double t = 0;; t += 0.015) {
        robot.position(2 * std::cos(t), 2 * std::sin(t)).yaw(t + Teleplot::deg(90));  // one chain: both at the same time
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
