// 23. Choosing where values go: dashboard lines describe the views of a dashboard ("Robot": a chart, then the values beside it).
// A label that is a path does it for one value ("Robot/State"). Sent once; the page shows that dashboard.
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    tp.dashboard("DASH|Robot:row\n"
                 "DASH|Robot/Motion:chart:speed,accel|w=2\n"
                 "DASH|Robot/State:values:battery,mode");
    tp.telemetry("temperature").label("Robot/State");  // the same view, by its path
    for (double t = 0;; t += 0.05) {
        tp.update("speed", std::sin(t));
        tp.update("accel", std::cos(t));
        tp.update("battery", 12.3);
        tp.update("mode", "running");
        tp.update("temperature", 21.5);
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
