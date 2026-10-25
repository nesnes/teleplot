// 14. A camera: its pictures, its lens (intrinsics, distortion) and where it is. The page draws the scene over its pictures as the
// lens sees it (a box in the scene), and drawings made in the pixels of the picture (a detection).
#include "../Teleplot.h"
#include "../TeleplotImage.h"
#include <cmath>
#include <thread>
#include <vector>

int main() {
    Teleplot& tp = Teleplot::instance();
    const int width = 160, height = 120;
    auto camera = tp.telemetry("camera");
    camera.intrinsics(width, height, 140, 140, width / 2.0, height / 2.0).distortion(-0.1, 0.01, 0, 0, 0);
    camera.position(-2, 0, 0.5);                                  // looking along its x axis: toward the box
    tp.telemetry("box").shape(Teleplot::Cube).size(0.5).position(0, 0, 0.25).color("orange");
    auto detection = tp.telemetry("detection").pixelsOf("camera").shape(Teleplot::Rect).color("red");
    std::vector<std::uint8_t> gray(width * height);
    for (int i = 0;; ++i) {
        for (int p = 0; p < width * height; ++p) { gray[p] = static_cast<std::uint8_t>((p % width + p / width + i) % 64 + 64); }
        TeleplotImage::send(camera, TeleplotImage::Pixels{ gray.data(), width, height, TeleplotImage::Gray8 });
        detection.position(80 + 30 * std::sin(i * 0.1), 60).size(40, 30);  // a box in pixels (u to the right, v down)
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}
