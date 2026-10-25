// 12. A point cloud (a lidar scan): all the points of a scan are one sample, in the frame of the sensor, each with its intensity.
// The sensor is placed in the scene like a shape; the page draws each scan where the sensor was.
#include "../Teleplot.h"
#include <cmath>
#include <thread>
#include <vector>

int main() {
    Teleplot& tp = Teleplot::instance();
    auto lidar = tp.telemetry("lidar");
    lidar.position(0, 0, 0.2);  // where the sensor is
    for (double t = 0;; t += 0.2) {
        std::vector<Teleplot::Number3D> scan;
        std::vector<float> intensities;
        for (int i = 0; i < 72; ++i) {
            double angle = i * 2 * 3.14159265358979 / 72, distance = 2 + 0.5 * std::sin(angle * 3 + t);  // a wall that moves
            scan.push_back({ distance * std::cos(angle), distance * std::sin(angle), 0 });
            intensities.push_back(static_cast<float>(1 / distance));
        }
        lidar.cloud(scan, intensities);
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
    }
}
