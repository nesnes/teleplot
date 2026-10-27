// 23. Choosing where values go: dashboard lines describe the views of a dashboard ("Robot": a chart, then the values beside it).
// A view can also follow a group instead of naming telemetries ("follow=heat"): what is labelled heat joins it.
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    tp.dashboard("DASH|Robot:row\n"
                 "DASH|Robot/Motion:chart:speed,accel|w=2\n"
                 "DASH|Robot/State:values:battery,mode\n"
                 "DASH|Robot/Heat:chart|follow=heat");
    tp.telemetry("temperature").label("heat");  // its group: the view Heat follows it
    for (double t = 0;; t += 0.05) {
        tp.update("speed", std::sin(t));
        tp.update("accel", std::cos(t));
        tp.update("battery", 12.3);
        tp.update("mode", "running");
        tp.update("temperature", 21.5);
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
