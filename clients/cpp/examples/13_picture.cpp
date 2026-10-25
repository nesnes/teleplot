// 13. A picture: pixels (a camera, OpenCV or ROS give them the same way) encoded on a thread of Teleplot, then sent.
// TeleplotImage.h: JPEG (quality 80 by default) or PNG, no dependency.
#include "../Teleplot.h"
#include "../TeleplotImage.h"
#include <thread>
#include <vector>

int main() {
    Teleplot& tp = Teleplot::instance();
    const int width = 160, height = 120;
    std::vector<std::uint8_t> pixels(width * height * 3);
    for (int shift = 0;; shift += 4) {
        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) {
                std::uint8_t* p = &pixels[(y * width + x) * 3];
                p[0] = static_cast<std::uint8_t>((x + shift) * 2); p[1] = static_cast<std::uint8_t>(y * 2); p[2] = 128;
            }
        }
        TeleplotImage::send(tp.telemetry("camera"), TeleplotImage::Pixels{ pixels.data(), width, height, TeleplotImage::RGB8 });
        std::this_thread::sleep_for(std::chrono::milliseconds(100));  // send() returns at once: it only copies the pixels
    }
}
