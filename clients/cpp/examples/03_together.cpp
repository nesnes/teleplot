// 3. Values that belong together: the same label puts them in the same chart.
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    tp.telemetry("motor.left").unit("rpm").label("motors");
    tp.telemetry("motor.right").unit("rpm").label("motors");
    for (double t = 0;; t += 0.05) {
        tp.update("motor.left", 100 + 20 * std::sin(t));
        tp.update("motor.right", 100 + 20 * std::cos(t));
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
