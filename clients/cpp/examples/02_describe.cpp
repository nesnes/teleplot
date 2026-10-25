// 2. Describe a value once: its unit, the range it is expected in, a description and a limit. With both ends of its range, the page
// shows it as a gauge; past the limit it says "low". Two more: a value shown only while it is recent, one kept out of the Live dashboard.
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    tp.telemetry("battery").unit("V").range(10.5, 12.6).desc("Main battery").threshold("low", Teleplot::Below, 11.0, "orange");
    tp.telemetry("link").timeout(Teleplot::ms(3000));  // gone from the views 3 s after its last sample
    tp.telemetry("debug").autoplot(false);             // not charted by itself (it is in the Telemetries panel)
    for (int i = 0;; ++i) {
        tp.update("battery", 12.6 - (i % 600) * 0.003);  // goes down for a minute, then starts again
        if (i % 100 < 50) { tp.update("link", -60 + i % 7); }
        tp.update("debug", i);
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}
