// 15. A depth map: a picture of distances (16-bit numbers, here in millimeters), sent as they are (Raw). The page shows it in colors,
// the distance under the pointer, and places it in 3D with the lens of its camera.
#include "../Teleplot.h"
#include "../TeleplotImage.h"
#include <cmath>
#include <thread>
#include <vector>

int main() {
    Teleplot& tp = Teleplot::instance();
    const int width = 80, height = 60;
    auto depth = tp.telemetry("depth");
    depth.depthMap(0.001).intrinsics(width, height, 70, 70, width / 2.0, height / 2.0);  // a pixel is worth 1 mm; 0 is "no data"
    std::vector<std::uint16_t> millimeters(width * height);
    for (double t = 0;; t += 0.1) {
        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) { millimeters[y * width + x] = static_cast<std::uint16_t>(1500 + 500 * std::sin(x * 0.1 + t) * std::cos(y * 0.1)); }
        }
        TeleplotImage::send(depth, TeleplotImage::Pixels{ millimeters.data(), width, height, TeleplotImage::Gray16 }, TeleplotImage::Raw{});
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}
