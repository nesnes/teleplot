// 19. Rules of a setting: a text among choices (its enum), and a check before applying (onChange): the page shows why it was refused.
// The program only gets what it accepts.
#include "../Teleplot.h"
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    std::string mode = "manual";
    int target = 10;
    tp.param("mode", &mode).enumValues({ "manual", "auto#follows the line", "off" });
    tp.param("target", &target).range(0, 100).onChange([&](int const& value) {
        if (mode == "off") { return Teleplot::error("mode is off"); }
        if (value % 5) { return Teleplot::error("by 5"); }
        return Teleplot::ok();
    });
    for (;;) {
        tp.poll();
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
}
