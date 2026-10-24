// TeleplotImage.h: checks that need no decoder here, and files for image.test.js, which decodes the PNGs (zlib of Node) and the
// JPEGs (djpeg of libjpeg, when installed) and compares them with the pixels. Usage: test_image <output folder>
#include "../Teleplot.h"
#include "../TeleplotImage.h"
#include <atomic>
#include <cstdio>
#include <string>
#include <thread>
#include <vector>

static int failures = 0;
#define CHECK(what, cond) do { if (cond) { std::printf("ok   %s\n", what); } else { std::printf("FAIL %s (%s)\n", what, #cond); failures++; } } while (0)
using namespace TeleplotImage;

static void save(std::string const& path, const void* data, std::size_t size) { FILE* f = std::fopen(path.c_str(), "wb"); std::fwrite(data, 1, size, f); std::fclose(f); }

// A test picture in a format: gradients, a checker, edges that are not a multiple of 8 or 16
static std::vector<std::uint8_t> picture(Format format, int w, int h, std::size_t stride = 0) {
    std::size_t bpp = format == Gray8 ? 1 : format == Gray16 ? 2 : format == RGB8 || format == BGR8 ? 3 : format == YUYV ? 2 : 4;
    std::size_t line = stride ? stride : w * bpp;
    std::vector<std::uint8_t> data(line * h, 0xEE);
    for (int y = 0; y < h; ++y) {
        for (int x = 0; x < w; ++x) {
            int r = x * 255 / w, g = y * 255 / h, b = ((x / 6 + y / 6) % 2) ? 220 : 30;
            std::uint8_t* p = data.data() + y * line + x * bpp;
            switch (format) {
                case Gray8: p[0] = static_cast<std::uint8_t>((r + g + b) / 3); break;
                case Gray16: { std::uint16_t v = static_cast<std::uint16_t>(x * 997 + y * 131); std::memcpy(p, &v, 2); break; }
                case RGB8: p[0] = r; p[1] = g; p[2] = b; break;
                case BGR8: p[0] = b; p[1] = g; p[2] = r; break;
                case RGBA8: p[0] = r; p[1] = g; p[2] = b; p[3] = static_cast<std::uint8_t>(x * 7); break;
                case BGRA8: p[0] = b; p[1] = g; p[2] = r; p[3] = static_cast<std::uint8_t>(x * 7); break;
                case YUYV: if (x % 2 == 0) { std::uint8_t* q = data.data() + y * line + x * 2; q[0] = static_cast<std::uint8_t>(16 + r * 219 / 255); q[1] = static_cast<std::uint8_t>(128 + (b - 128) / 2); q[2] = static_cast<std::uint8_t>(16 + g * 219 / 255); q[3] = static_cast<std::uint8_t>(128 + (r - 128) / 2); } break;
            }
        }
    }
    return data;
}

int main(int argc, char** argv) {
    std::string out = argc > 1 ? argv[1] : ".";
    const char* names[] = { "gray8", "gray16", "rgb8", "bgr8", "rgba8", "bgra8", "yuyv" };

    // Every format, in PNG and JPEG, with its expected pixels (RGB, or what PNG stores) for image.test.js
    for (int f = Gray8; f <= YUYV; ++f) {
        Format format = static_cast<Format>(f);
        int w = format == YUYV ? 38 : 37, h = 23;
        for (std::size_t stride : { std::size_t(0), std::size_t(200) }) {
            std::vector<std::uint8_t> data = picture(format, w, h, stride);
            Pixels pixels{ data.data(), w, h, format, stride };
            std::string base = out + "/" + names[f] + (stride ? "-stride" : "");
            Picture png = encode(pixels, Png{});
            save(base + ".png", png.bytes.data(), png.bytes.size());
            Image packed = copy(pixels);
            save(base + ".raw", packed.data.data(), packed.data.size());
            std::vector<std::uint8_t> rgb(static_cast<std::size_t>(w) * h * 3), line(static_cast<std::size_t>(w) * 3);
            for (int y = 0; y < h; ++y) { detail::rgbRow(pixels, y, line.data()); std::memcpy(rgb.data() + y * line.size(), line.data(), line.size()); }
            save(base + ".rgb", rgb.data(), rgb.size());
            if (format != Gray16) {
                for (int quality : { 80, 100 }) {
                    Picture jpeg = encode(pixels, Jpeg{ quality });
                    save(base + "-q" + std::to_string(quality) + ".jpg", jpeg.bytes.data(), jpeg.bytes.size());
                }
            }
        }
    }
    {   // A bigger one: sizes, and how long it takes
        std::vector<std::uint8_t> data = picture(BGR8, 640, 480);
        Pixels pixels{ data.data(), 640, 480, BGR8 };
        auto t0 = std::chrono::steady_clock::now();
        Picture jpeg = encode(pixels);
        auto t1 = std::chrono::steady_clock::now();
        Picture png = encode(pixels, Png{});
        auto t2 = std::chrono::steady_clock::now();
        std::printf("     640x480 BGR8: JPEG q80 %zu bytes in %.1f ms, PNG %zu bytes in %.1f ms\n", jpeg.bytes.size(), std::chrono::duration<double, std::milli>(t1 - t0).count(),
            png.bytes.size(), std::chrono::duration<double, std::milli>(t2 - t1).count());
        CHECK("640x480: both encoded", jpeg && png);
    }

    // What is refused, said in error
    {
        std::uint16_t depth[4] = { 1, 2, 3, 4 };
        Picture refused = encode(Pixels{ depth, 2, 2, Gray16 });
        CHECK("Gray16 in JPEG: refused, with why", !refused && refused.error.find("Png") != std::string::npos);
        std::uint8_t odd[6] = {};
        CHECK("YUYV with an odd width: refused", !encode(Pixels{ odd, 3, 1, YUYV }));
        CHECK("no pixels: refused", !encode(Pixels{}, Png{}));
    }

    // typeOf, load
    {
        std::vector<std::uint8_t> data = picture(RGB8, 8, 8);
        Picture jpeg = encode(Pixels{ data.data(), 8, 8, RGB8 }), png = encode(Pixels{ data.data(), 8, 8, RGB8 }, Png{});
        CHECK("typeOf: JPEG, PNG, other", typeOf(jpeg.bytes.data(), jpeg.bytes.size()) == Teleplot::Jpeg && typeOf(png.bytes.data(), png.bytes.size()) == Teleplot::Png && !typeOf("GIF89a", 6));
        save(out + "/load.png", png.bytes.data(), png.bytes.size());
        Picture loaded = load(out + "/load.png");
        CHECK("load: a PNG file as it is", loaded.type == Teleplot::Png && loaded.bytes == png.bytes);
        save(out + "/load.txt", "hello", 5);
        CHECK("load: not a picture, said", !load(out + "/load.txt") && !load(out + "/missing.png"));
    }

    // shrink: averages of whole squares
    {
        std::uint8_t gray[4 * 3] = { 0, 2, 10, 20, 4, 6, 30, 40, 99, 99, 99, 99 };
        Image small = shrink(Pixels{ gray, 4, 3, Gray8 }, 2);
        CHECK("shrink: 4x3 by 2 is 2x1, averages (rounded)", small.width == 2 && small.height == 1 && small.data[0] == 3 && small.data[1] == 25);
        std::uint16_t depth[4] = { 1000, 3000, 5000, 7001 };
        Image d = shrink(Pixels{ depth, 2, 2, Gray16 }, 2);
        std::uint16_t v; std::memcpy(&v, d.data.data(), 2);
        CHECK("shrink: Gray16 stays 16 bits", d.format == Gray16 && v == 4000);
        std::vector<std::uint8_t> yuyv = picture(YUYV, 38, 23);
        Image rgb = shrink(Pixels{ yuyv.data(), 38, 23, YUYV }, 3);
        CHECK("shrink: YUYV gives RGB8", rgb.format == RGB8 && rgb.width == 12 && rgb.height == 7 && rgb.data.size() == 12 * 7 * 3);
    }

    // send(): on the thread, dated when asked, the picture being encoded always sent, only the latest of the others, per telemetry
    {
        std::vector<std::vector<std::byte>> packets;
        std::mutex lock;
        std::atomic<std::int64_t> now{ 1000000000 };
        {
            Teleplot tp(Teleplot::Options().flushInterval(std::chrono::milliseconds(0)).output([&](const std::byte* p, std::size_t n) { std::lock_guard<std::mutex> l(lock); packets.emplace_back(p, p + n); }));
            tp.clock([&] { return Teleplot::ns(now.load()); });
            std::vector<std::uint8_t> big = picture(RGB8, 640, 480);
            for (int i = 0; i < 20; ++i) {
                now = 1000000000 + i;
                send(tp.telemetry("a"), Pixels{ big.data(), 640, 480, RGB8 });
                send(tp.telemetry("b"), Pixels{ big.data(), 320, 240, RGB8, 640 * 3 });
            }
            for (int i = 0; i < 400; ++i) { Stats s = stats(tp); if (s.encoded + s.replaced >= 40) { break; } std::this_thread::sleep_for(std::chrono::milliseconds(5)); }
            Stats s = stats(tp);
            std::printf("     20 + 20 pictures asked at once: %llu encoded, %llu replaced\n", static_cast<unsigned long long>(s.encoded), static_cast<unsigned long long>(s.replaced));
            CHECK("every picture is encoded or replaced by a newer one of its telemetry", s.encoded + s.replaced == 40 && s.failed == 0);
            CHECK("most are replaced (the thread keeps only the latest)", s.replaced > 10);
            CHECK("the thread got its priority", s.priorityRefused == 0);
            tp.flush();
        }
        std::size_t images = 0;
        for (auto const& p : packets) { for (std::size_t i = 4; i + 12 < p.size(); ++i) { if (p[i] == std::byte{ 24 }) { images++; } } }
        CHECK("pictures were sent", images > 0);
    }
    {   // The same into a file, for image.test.js: the latest picture of each telemetry, at the time it was asked
        std::atomic<std::int64_t> now{ 1000000000 };
        Teleplot tp(Teleplot::Options().file(out + "/send.teleplot").flushInterval(std::chrono::milliseconds(0)));
        tp.clock([&] { return Teleplot::ns(now.load()); });
        tp.sendStats(Teleplot::ms(1));
        std::vector<std::uint8_t> frames[5];
        for (int i = 0; i < 5; ++i) {
            frames[i].assign(64 * 48, static_cast<std::uint8_t>(i * 50));
            now = 1000000000 + i * 1000000;
            send(tp.telemetry("cam"), Pixels{ frames[i].data(), 64, 48, Gray8 }, Png{});
            std::this_thread::sleep_for(std::chrono::milliseconds(i < 2 ? 20 : 0)); // (the first ones encoded, the next asked at once)
        }
        for (int i = 0; i < 400; ++i) { Stats s = stats(tp); if (s.encoded + s.replaced >= 5) { break; } std::this_thread::sleep_for(std::chrono::milliseconds(5)); }
    }

    // Scheduling: a thread given BelowCaller gets one step under the caller
#if defined(__APPLE__)
    {
        pthread_set_qos_class_self_np(QOS_CLASS_USER_INITIATED, 0);
        Teleplot::Scheduling caller = Teleplot::Scheduling::ofCurrentThread();
        qos_class_t qos = QOS_CLASS_UNSPECIFIED;
        int relative = 99;
        bool applied = false;
        std::thread([&] { applied = caller.applyToCurrentThread(Teleplot::BelowCaller); pthread_get_qos_class_np(pthread_self(), &qos, &relative); }).join();
        CHECK("macOS: BelowCaller is the QoS of the caller, one step under", applied && qos == QOS_CLASS_USER_INITIATED && relative == -1);
        std::thread([&] { applied = caller.applyToCurrentThread(Teleplot::Low); pthread_get_qos_class_np(pthread_self(), &qos, &relative); }).join();
        CHECK("macOS: Low is QoS utility", applied && qos == QOS_CLASS_UTILITY);
        std::thread([&] { applied = caller.applyToCurrentThread(Teleplot::ThreadPriority::value(-5)); pthread_get_qos_class_np(pthread_self(), &qos, &relative); }).join();
        CHECK("macOS: value(-5) is the relative priority in the default QoS class", applied && qos == QOS_CLASS_DEFAULT && relative == -5);
        int policy = 0;
        sched_param param{};
        std::thread([&] { applied = caller.applyToCurrentThread(Teleplot::ThreadPriority::realtime(40, true)); pthread_getschedparam(pthread_self(), &policy, &param); }).join();
        CHECK("macOS: realtime(40, round robin) is SCHED_RR 40", applied && policy == SCHED_RR && param.sched_priority == 40);
        std::thread([&] { applied = caller.applyToCurrentThread(Teleplot::Normal, Teleplot::ThreadAffinity::cpus({ 0 })); }).join();
        CHECK("macOS: a list of CPUs is refused (no affinity on macOS)", !applied);
    }
#elif defined(__linux__)
    {
        int caller = getpriority(PRIO_PROCESS, static_cast<id_t>(syscall(SYS_gettid)));
        Teleplot::Scheduling scheduling = Teleplot::Scheduling::ofCurrentThread();
        int nice = 99;
        bool applied = false;
        std::thread([&] { applied = scheduling.applyToCurrentThread(Teleplot::BelowCaller); nice = getpriority(PRIO_PROCESS, static_cast<id_t>(syscall(SYS_gettid))); }).join();
        CHECK("Linux: BelowCaller of a normal thread is nice + 1", applied && nice == std::min(19, caller + 1));
        std::thread([&] { applied = scheduling.applyToCurrentThread(Teleplot::ThreadPriority::value(7)); nice = getpriority(PRIO_PROCESS, static_cast<id_t>(syscall(SYS_gettid))); }).join();
        CHECK("Linux: value(7) is nice 7", applied && nice == 7);
        cpu_set_t set;
        CPU_ZERO(&set);
        std::thread([&] { applied = scheduling.applyToCurrentThread(Teleplot::Normal, Teleplot::ThreadAffinity::cpus({ 0 })); pthread_getaffinity_np(pthread_self(), sizeof(set), &set); }).join();
        CHECK("Linux: cpus({0}) is CPU 0 only", applied && CPU_COUNT(&set) == 1 && CPU_ISSET(0, &set));
        int policy = 0;
        sched_param param{};
        std::thread([&] { applied = scheduling.applyToCurrentThread(Teleplot::ThreadPriority::realtime(10)); pthread_getschedparam(pthread_self(), &policy, &param); }).join();
        CHECK("Linux: realtime(10) is SCHED_FIFO 10, or refused without the right to it", applied ? policy == SCHED_FIFO && param.sched_priority == 10 : policy == SCHED_OTHER);
    }
#endif

    // The settings of a Teleplot: in Options, and at run time; its sending thread takes them
    {
        Teleplot tp(Teleplot::Options().sendFrom(Teleplot::Thread).threadPriority(Teleplot::ThreadPriority::value(-3)).threadAffinity(Teleplot::ThreadAffinity::any()).output([](const std::byte*, std::size_t) {}));
        CHECK("Options: priority and affinity kept", tp.threadPriority() == Teleplot::ThreadPriority::value(-3) && tp.threadAffinity() == Teleplot::ThreadAffinity::any());
        tp.threadPriority(Teleplot::Low);
        tp.threadAffinity(Teleplot::ThreadAffinity::followCaller());
        tp.update("x", 1);
        std::this_thread::sleep_for(std::chrono::milliseconds(60));
        CHECK("at run time: changed, and taken by the sending thread without refusal", tp.threadPriority() == Teleplot::Low && tp.threadAffinity() == Teleplot::ThreadAffinity::followCaller() && tp.stats().priorityRefused == 0);
    }

    std::printf(failures ? "%d failed\n" : "TeleplotImage ok\n", failures);
    return failures ? 1 : 0;
}
