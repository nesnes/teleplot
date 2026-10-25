// 4. Logs: lines to read one after the other, shown in a log view and as marks on the charts.
#include "../Teleplot.h"
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    tp.log("events", "started");
    for (int presses = 1;; ++presses) {
        tp.update("presses", presses);
        if (presses % 20 == 0) { tp.log("events", "twenty more"); }
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}
