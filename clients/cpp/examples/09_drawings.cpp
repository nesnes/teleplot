// 9. Drawings on a map: a path (a line through points), a zone (a polygon), a spot (a circle), an arrow and a text. They are flat
// shapes: the page shows them in 2D.
#include "../Teleplot.h"
#include <cmath>
#include <thread>

int main() {
    Teleplot& tp = Teleplot::instance();
    tp.telemetry("path").shape(Teleplot::Line).lineWidth(0.03).color("gray").points(std::vector<Teleplot::Number2D>{ { 0, 0 }, { 1, 0.5 }, { 2, 0.25 }, { 3, 1 } });
    tp.telemetry("zone").shape(Teleplot::Polygon).color("rgba(46, 204, 113, 0.3)").points(std::vector<Teleplot::Number2D>{ { 1, -1 }, { 3, -1 }, { 2.5, -0.2 } });
    tp.telemetry("spot").shape(Teleplot::Circle).size(0.4).color("orange").position(0, 1);
    tp.telemetry("goal").shape(Teleplot::Text).position(3, 1.2).text("goal").textSize(0.2);
    tp.telemetry("wind").shape(Teleplot::Arrow).color("teal");
    for (double t = 0;; t += 0.1) {
        tp.telemetry("wind").position(0, 1.5).vector(0.6 * std::cos(t), 0.6 * std::sin(t));  // an arrow that turns
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}
