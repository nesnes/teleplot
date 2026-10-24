// A small robot for Teleplot: numbers, a log, what runs, a shape that moves, and a setting and an action the page can use.
// Build: c++ -std=c++17 -pthread sample.cpp -o sample, start the Teleplot server, open the page, run ./sample. API: doc/cpp-client-api.md
#include "Teleplot.h"
#include <cmath>
#include <thread>

// Names only its own level of the stack: "loop/compute" when called from the loop of main()
static void myComputeFunction() {
    Teleplot::Stack level(Teleplot::instance(), "sample.task", "compute");
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
}

int main() {
    Teleplot& tp = Teleplot::instance(); // 127.0.0.1:47269, client named after the program

    tp.telemetry("battery").unit("V").range(10.5, 12.6).desc("Main battery").threshold("low", Teleplot::Below, 11.0, "orange");
    tp.telemetry("robot.body").shape(Teleplot::Cube).size(0.4, 0.3, 0.2).color("#2ecc71");

    float gain = 0.4f; // a setting the page can change (switch CMD on in the page)
    tp.param("sample.gain", &gain).range(0, 10).step(0.1).desc("A gain the page can change");

    bool running = true;
    tp.action("sample.stop", [&](Teleplot::Args const&) {
        running = false;
        return Teleplot::ok("stopped");
    }).title("Stop the sample").confirm();

    for (int i = 0; running && i < 6000; ++i) { // ten minutes at most
        double t = i * 0.1;
        Teleplot::Stack loop(tp, "sample.task", "loop");
        tp.update("sin", gain * std::sin(t));
        tp.update("battery", 12.6 - std::fmod(t * 0.01, 2.0));

        myComputeFunction();

        tp.telemetry("robot.body").position(std::cos(t * 0.2) * 2, std::sin(t * 0.2) * 2).yaw(t * 0.2 + Teleplot::deg(90));
        if (i % 50 == 0) {
            tp.log("sample.events", "lap " + std::to_string(i / 50));
        }

        // Wait for next cycle
        Teleplot::Stack level(tp, "sample.task", "wait");
        tp.poll(); // read any input param or action from the page
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    return 0;
}
