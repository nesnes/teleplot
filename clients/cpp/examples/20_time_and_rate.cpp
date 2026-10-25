// 20. Times and rates. A sample is dated when it is sent; at() gives the time it was measured instead (a sensor read earlier).
// maxRate() keeps at most that many samples per second of a fast value: the rest are not sent.
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    tp.telemetry("fast").maxRate(20);
    for (double t = 0;; t += 0.1) {
        Teleplot::Time measuredAt = Teleplot::now();
        double reading = std::sin(t);                                  // measured now...
        std::this_thread::sleep_for(std::chrono::milliseconds(30));   // ...sent later
        tp.telemetry("reading").at(measuredAt).update(reading);
        for (int i = 0; i < 100; ++i) {
            tp.update("fast", std::sin(t + i * 0.01));                  // called 100 times, sent at most 20 times per second
            std::this_thread::sleep_for(std::chrono::microseconds(500));
        }
    }
}
