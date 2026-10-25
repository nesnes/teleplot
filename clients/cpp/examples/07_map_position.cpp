// 7. A position on a map: two numbers (x, y) make a point, drawn with its trail.
// GPS coordinates need more digits than a float holds: precise() sends them exactly (float64).
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    tp.telemetry("gps").precise();
    for (double t = 0;; t += 0.02) {
        tp.update("gps", Teleplot::Number2D{ 2.294481 + 0.0005 * std::cos(t), 48.858370 + 0.0003 * std::sin(t) });
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}
