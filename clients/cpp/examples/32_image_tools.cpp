// 32. Pictures, in more detail: encoded in the call (JPEG or PNG), a part of a bigger buffer (its stride), smaller by a factor
// (shrink), saved to a file and sent from it as it is (load).
#include "../Teleplot.h"
#include "../TeleplotImage.h"
#include <fstream>
#include <thread>
#include <vector>

int main() {
    Teleplot& tp = Teleplot::instance();
    const int width = 320, height = 240;
    std::vector<std::uint8_t> bgr(width * height * 3);  // as OpenCV gives them: blue, green, red
    for (int i = 0; i < width * height; ++i) { bgr[i * 3] = static_cast<std::uint8_t>(i % width); bgr[i * 3 + 1] = static_cast<std::uint8_t>(i / width); bgr[i * 3 + 2] = 200; }
    TeleplotImage::Pixels frame{ bgr.data(), width, height, TeleplotImage::BGR8 };
    TeleplotImage::Picture png = TeleplotImage::encode(frame, TeleplotImage::Png{});
    std::ofstream("frame.png", std::ios::binary).write(reinterpret_cast<const char*>(png.bytes.data()), static_cast<std::streamsize>(png.bytes.size()));
    for (;;) {
        tp.telemetry("small").image(TeleplotImage::encode(TeleplotImage::shrink(frame, 4), TeleplotImage::Jpeg{ 60 }));
        TeleplotImage::Pixels corner{ bgr.data() + (40 * width + 40) * 3, 100, 80, TeleplotImage::BGR8, width * 3 };  // 100 x 80 from (40, 40)
        tp.telemetry("view").image(TeleplotImage::encode(corner));
        tp.telemetry("file").image(TeleplotImage::load("frame.png"));
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }
}
