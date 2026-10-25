// 22. Recording: what is sent also goes to a file, which the page opens (Export and import panel, or dropped on the page).
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    tp.setOptions(Teleplot::Options().udp("127.0.0.1", 47269).file("run.teleplot"));
    for (double t = 0;; t += 0.05) {
        tp.update("temperature", 20 + std::sin(t));
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }
}
