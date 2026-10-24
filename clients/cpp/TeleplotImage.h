// Teleplot pictures: what the pixels a program has (a camera, OpenCV, ROS, a depth sensor) need to be sent with Teleplot.h, and
// nothing more (no image processing: drawings over a picture are shapes in its pixels, pixelsOf()). One header, C++17, no
// dependency. Source: https://github.com/nesnes/teleplot. Doc: doc/cpp-client-api.md "Pictures".
//
//     #include "Teleplot.h"
//     #include "TeleplotImage.h"
//     TeleplotImage::Pixels frame{ data, 640, 480, TeleplotImage::BGR8 };     // a view of your buffer (stride: padded rows)
//     tp.telemetry("camera").image(TeleplotImage::encode(frame));             // JPEG, quality 80, here and now
//     TeleplotImage::send(tp.telemetry("camera"), frame);                     // the same on a thread: the call only copies
//     TeleplotImage::send(tp.telemetry("depth"), depth, TeleplotImage::Png{}); // lossless (16 bits for a depth image)
//     TeleplotImage::send(tp.telemetry("depth"), depth, TeleplotImage::Raw{}); // the numbers as they are (Gray16, Float32): no encoding
//
// encode(): JPEG (baseline, 4:2:0), PNG (lossless) or Raw (plain numbers, for depth maps: Gray16 or Float32). Pixels: Gray8,
// Gray16 (PNG, Raw), Float32 (Raw only), RGB8, BGR8, RGBA8, BGRA8 (JPEG drops alpha), YUYV (webcams). load(): a .jpg / .png file, as it is. shrink(): smaller by a whole factor (the camera of a picture
// stays right: its intrinsics hold for any size of the same proportions).
// send(): one encoding thread per Teleplot, a slot per telemetry: the picture being encoded always finishes and is sent; of the
// ones asked meanwhile only the latest is kept (the others are counted in stats()). The thread's priority: Teleplot's
// threadPriority() and threadAffinity() (default: one step under the thread that called send(), on its CPUs). TELEPLOT_SINGLE_THREAD: encoded
// in the call.

#ifndef CPP_TELEPLOT_IMAGE_H
#define CPP_TELEPLOT_IMAGE_H

#include "Teleplot.h"
#include <array>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <map>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

namespace TeleplotImage {

    enum Format : std::uint8_t {
        Gray8,  // 1 byte per pixel
        Gray16, // 2 bytes per pixel, in the byte order of the machine (a depth image): PNG only
        RGB8, BGR8, RGBA8, BGRA8,
        YUYV,   // 4 bytes per 2 pixels: Y0 U Y1 V (BT.601, the order of most webcams); width must be even
        Float32, // 4 bytes per pixel, a float in the byte order of the machine (a depth map in metres, ROS 32FC1): Raw only
    };

    // A view of pixels that are somewhere else: nothing is copied. stride: bytes from a row to the next (0: rows without padding).
    struct Pixels {
        const void* data = nullptr;
        int width = 0, height = 0;
        Format format = RGB8;
        std::size_t stride = 0;
    };
    // Pixels it holds (what shrink() gives, what send() keeps)
    struct Image {
        std::vector<std::uint8_t> data;
        int width = 0, height = 0;
        Format format = RGB8;
        operator Pixels() const { return Pixels{ data.data(), width, height, format, 0 }; }
    };
    // An encoded picture: tp.telemetry("camera").image(picture). Empty bytes: it failed, error says why.
    struct Picture {
        Teleplot::ImageType type = Teleplot::Jpeg;
        std::vector<std::uint8_t> bytes;
        std::string error;
        explicit operator bool() const { return !bytes.empty(); }
    };
    struct Jpeg { int quality = 80; };  // 1 (small) to 100 (close to the pixels)
    struct Png {};                      // the pixels exactly
    struct Raw {};                      // the numbers as they are, not compressed: Gray16 or Float32 (a depth map)
    struct Stats { std::uint64_t encoded = 0, replaced = 0, failed = 0, priorityRefused = 0; };

    namespace detail {
        inline std::size_t bytesPerPixel(Format f) { return f == Gray8 ? 1 : f == Gray16 ? 2 : f == RGB8 || f == BGR8 ? 3 : f == YUYV ? 2 : 4; } // (RGBA8, BGRA8, Float32: 4)
        inline std::size_t rowBytes(Pixels const& p) { return static_cast<std::size_t>(p.width) * bytesPerPixel(p.format); }
        inline std::size_t strideOf(Pixels const& p) { return p.stride ? p.stride : rowBytes(p); }
        inline const std::uint8_t* row(Pixels const& p, int y) { return static_cast<const std::uint8_t*>(p.data) + static_cast<std::size_t>(y) * strideOf(p); }
        inline std::string check(Pixels const& p) {
            if (!p.data || p.width <= 0 || p.height <= 0) { return "no pixels"; }
            if (p.stride && p.stride < rowBytes(p)) { return "stride shorter than a row"; }
            if (p.format == YUYV && p.width % 2) { return "YUYV needs an even width"; }
            if (p.format > Float32) { return "unknown format"; }
            return "";
        }
        inline std::uint8_t clip(int v) { return static_cast<std::uint8_t>(v < 0 ? 0 : v > 255 ? 255 : v); }
        // A row as RGB (3 bytes per pixel)
        inline void rgbRow(Pixels const& p, int y, std::uint8_t* out) {
            const std::uint8_t* in = row(p, y);
            switch (p.format) {
                case Gray8: for (int x = 0; x < p.width; ++x) { out[3 * x] = out[3 * x + 1] = out[3 * x + 2] = in[x]; } break;
                case Gray16: for (int x = 0; x < p.width; ++x) { std::uint16_t v; std::memcpy(&v, in + 2 * x, 2); out[3 * x] = out[3 * x + 1] = out[3 * x + 2] = static_cast<std::uint8_t>(v >> 8); } break;
                case RGB8: std::memcpy(out, in, static_cast<std::size_t>(p.width) * 3); break;
                case BGR8: for (int x = 0; x < p.width; ++x) { out[3 * x] = in[3 * x + 2]; out[3 * x + 1] = in[3 * x + 1]; out[3 * x + 2] = in[3 * x]; } break;
                case RGBA8: for (int x = 0; x < p.width; ++x) { out[3 * x] = in[4 * x]; out[3 * x + 1] = in[4 * x + 1]; out[3 * x + 2] = in[4 * x + 2]; } break;
                case BGRA8: for (int x = 0; x < p.width; ++x) { out[3 * x] = in[4 * x + 2]; out[3 * x + 1] = in[4 * x + 1]; out[3 * x + 2] = in[4 * x]; } break;
                case YUYV:
                    for (int x = 0; x < p.width; x += 2) {
                        const std::uint8_t* q = in + 2 * x;
                        int d = q[1] - 128, e = q[3] - 128;
                        for (int k = 0; k < 2; ++k) {
                            int c = (k ? q[2] : q[0]) - 16;
                            out[3 * (x + k)] = clip((298 * c + 409 * e + 128) >> 8);
                            out[3 * (x + k) + 1] = clip((298 * c - 100 * d - 208 * e + 128) >> 8);
                            out[3 * (x + k) + 2] = clip((298 * c + 516 * d + 128) >> 8);
                        }
                    }
                    break;
                case Float32: break; // (not a picture to show: Raw only, refused before)
            }
        }

        // ------------------------------------------------------------------ JPEG (baseline, standard tables of the JPEG norm, Annex K)
        static const std::uint8_t zigzag[64] = { 0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
            35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63 };
        static const std::uint8_t lumaQ[64] = { 16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
            18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99 };
        static const std::uint8_t chromaQ[64] = { 17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
            99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99 };
        static const std::uint8_t dcLumaBits[16] = { 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0 };
        static const std::uint8_t dcChromaBits[16] = { 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0 };
        static const std::uint8_t dcValues[12] = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 };
        static const std::uint8_t acLumaBits[16] = { 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d };
        static const std::uint8_t acLumaValues[162] = {
            0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
            0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
            0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
            0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
            0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
            0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
            0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa };
        static const std::uint8_t acChromaBits[16] = { 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77 };
        static const std::uint8_t acChromaValues[162] = {
            0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
            0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
            0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
            0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
            0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
            0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
            0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa };

        struct Huffman { std::uint16_t code[256] = {}; std::uint8_t size[256] = {}; };
        inline Huffman huffman(const std::uint8_t* bits, const std::uint8_t* values) {
            Huffman h;
            std::uint16_t code = 0;
            for (int length = 1, k = 0; length <= 16; ++length) {
                for (int i = 0; i < bits[length - 1]; ++i, ++k) { h.code[values[k]] = code++; h.size[values[k]] = static_cast<std::uint8_t>(length); }
                code = static_cast<std::uint16_t>(code << 1);
            }
            return h;
        }

        class JpegWriter {
        public:
            std::vector<std::uint8_t> out;
            void byte(int b) { out.push_back(static_cast<std::uint8_t>(b)); }
            void word(int w) { byte(w >> 8); byte(w & 0xFF); }
            void bits(std::uint32_t value, int count) { // MSB first, 0xFF followed by 0x00 in the entropy-coded data
                buffer_ = (buffer_ << count) | (value & ((1u << count) - 1));
                filled_ += count;
                while (filled_ >= 8) {
                    int b = static_cast<int>((buffer_ >> (filled_ - 8)) & 0xFF);
                    byte(b);
                    if (b == 0xFF) { byte(0); }
                    filled_ -= 8;
                }
            }
            void flushBits() { if (filled_ > 0) { bits(0x7F, 8 - filled_); } }
        private:
            std::uint32_t buffer_ = 0;
            int filled_ = 0;
        };

        // One 8x8 block: DCT, quantization, entropy coding. dc: the DC value of the previous block of the same component.
        inline void block(JpegWriter& w, const float* pixels, const float* scaled, int& dc, Huffman const& dcTable, Huffman const& acTable) {
            static float cosines[8][8];
            static bool ready = [] { for (int x = 0; x < 8; ++x) { for (int u = 0; u < 8; ++u) { cosines[x][u] = static_cast<float>(std::cos((2 * x + 1) * u * 3.14159265358979323846 / 16)); } } return true; }();
            (void)ready;
            float rows[64];
            for (int y = 0; y < 8; ++y) {
                for (int u = 0; u < 8; ++u) { float s = 0; for (int x = 0; x < 8; ++x) { s += pixels[y * 8 + x] * cosines[x][u]; } rows[y * 8 + u] = s; }
            }
            int coefficients[64];
            for (int u = 0; u < 8; ++u) {
                for (int v = 0; v < 8; ++v) {
                    float s = 0;
                    for (int y = 0; y < 8; ++y) { s += rows[y * 8 + u] * cosines[y][v]; }
                    float c = (u ? 1.0f : 0.70710678f) * (v ? 1.0f : 0.70710678f) * 0.25f;
                    coefficients[v * 8 + u] = static_cast<int>(std::lround(s * c / scaled[v * 8 + u]));
                }
            }
            auto magnitude = [](int v, int& size) { int a = v < 0 ? -v : v; size = 0; while (a) { size++; a >>= 1; } return v < 0 ? v + (1 << size) - 1 : v; };
            int size;
            int diff = coefficients[0] - dc;
            dc = coefficients[0];
            int bitsOf = magnitude(diff, size);
            w.bits(dcTable.code[size], dcTable.size[size]);
            if (size) { w.bits(static_cast<std::uint32_t>(bitsOf), size); }
            int run = 0;
            for (int i = 1; i < 64; ++i) {
                int v = coefficients[zigzag[i]];
                if (v == 0) { run++; continue; }
                while (run > 15) { w.bits(acTable.code[0xF0], acTable.size[0xF0]); run -= 16; }
                bitsOf = magnitude(v, size);
                int symbol = (run << 4) | size;
                w.bits(acTable.code[symbol], acTable.size[symbol]);
                w.bits(static_cast<std::uint32_t>(bitsOf), size);
                run = 0;
            }
            if (run) { w.bits(acTable.code[0x00], acTable.size[0x00]); }
        }

        inline Picture jpeg(Pixels const& p, int quality) {
            Picture picture;
            picture.type = Teleplot::Jpeg;
            if ((picture.error = check(p)) != "") { return picture; }
            if (p.format == Gray16) { picture.error = "a JPEG holds 8 bits: Png{} or Raw{} for Gray16"; return picture; }
            if (p.format == Float32) { picture.error = "a JPEG holds 8 bits: Raw{} for Float32"; return picture; }
            if (p.width > 65535 || p.height > 65535) { picture.error = "too big for a JPEG"; return picture; }
            bool gray = p.format == Gray8;
            quality = quality < 1 ? 1 : quality > 100 ? 100 : quality;
            int scale = quality < 50 ? 5000 / quality : 200 - quality * 2;
            std::uint8_t tables[2][64];
            float scaled[2][64];
            for (int t = 0; t < 2; ++t) {
                for (int i = 0; i < 64; ++i) {
                    int q = ((t ? chromaQ : lumaQ)[i] * scale + 50) / 100;
                    tables[t][i] = static_cast<std::uint8_t>(q < 1 ? 1 : q > 255 ? 255 : q);
                    scaled[t][i] = tables[t][i];
                }
            }
            // Planes of Y, Cb, Cr (JFIF: full range), centered on 0
            int w = p.width, h = p.height;
            std::vector<float> Y(static_cast<std::size_t>(w) * h), Cb(gray ? 0 : Y.size()), Cr(gray ? 0 : Y.size());
            std::vector<std::uint8_t> rgb(static_cast<std::size_t>(w) * 3);
            for (int y = 0; y < h; ++y) {
                if (gray) { const std::uint8_t* in = row(p, y); for (int x = 0; x < w; ++x) { Y[static_cast<std::size_t>(y) * w + x] = in[x] - 128.0f; } continue; }
                rgbRow(p, y, rgb.data());
                for (int x = 0; x < w; ++x) {
                    float r = rgb[3 * x], g = rgb[3 * x + 1], b = rgb[3 * x + 2];
                    std::size_t i = static_cast<std::size_t>(y) * w + x;
                    Y[i] = 0.299f * r + 0.587f * g + 0.114f * b - 128;
                    Cb[i] = -0.168736f * r - 0.331264f * g + 0.5f * b;
                    Cr[i] = 0.5f * r - 0.418688f * g - 0.081312f * b;
                }
            }
            JpegWriter out;
            out.out.reserve(static_cast<std::size_t>(w) * h / 4 + 1024);
            out.word(0xFFD8);                                                          // SOI
            out.word(0xFFE0); out.word(16); out.byte('J'); out.byte('F'); out.byte('I'); out.byte('F'); out.byte(0); // APP0 JFIF 1.1, no density
            out.byte(1); out.byte(1); out.byte(0); out.word(1); out.word(1); out.byte(0); out.byte(0);
            for (int t = 0; t < (gray ? 1 : 2); ++t) { out.word(0xFFDB); out.word(67); out.byte(t); for (int i = 0; i < 64; ++i) { out.byte(tables[t][zigzag[i]]); } } // DQT
            out.word(0xFFC0); out.word(gray ? 11 : 17); out.byte(8); out.word(h); out.word(w); out.byte(gray ? 1 : 3); // SOF0
            out.byte(1); out.byte(gray ? 0x11 : 0x22); out.byte(0);
            if (!gray) { out.byte(2); out.byte(0x11); out.byte(1); out.byte(3); out.byte(0x11); out.byte(1); }
            auto table = [&](int id, const std::uint8_t* bits, const std::uint8_t* values, int count) {
                out.word(0xFFC4); out.word(3 + 16 + count); out.byte(id);
                for (int i = 0; i < 16; ++i) { out.byte(bits[i]); }
                for (int i = 0; i < count; ++i) { out.byte(values[i]); }
            };
            table(0x00, dcLumaBits, dcValues, 12);
            table(0x10, acLumaBits, acLumaValues, 162);
            if (!gray) { table(0x01, dcChromaBits, dcValues, 12); table(0x11, acChromaBits, acChromaValues, 162); }
            out.word(0xFFDA); out.word(gray ? 8 : 12); out.byte(gray ? 1 : 3);          // SOS
            out.byte(1); out.byte(0x00);
            if (!gray) { out.byte(2); out.byte(0x11); out.byte(3); out.byte(0x11); }
            out.byte(0); out.byte(63); out.byte(0);

            static const Huffman dcL = huffman(dcLumaBits, dcValues), acL = huffman(acLumaBits, acLumaValues);
            static const Huffman dcC = huffman(dcChromaBits, dcValues), acC = huffman(acChromaBits, acChromaValues);
            auto at = [&](std::vector<float> const& plane, int x, int y) { return plane[static_cast<std::size_t>(y < h ? y : h - 1) * w + (x < w ? x : w - 1)]; }; // (edges: repeated)
            int dcY = 0, dcCb = 0, dcCr = 0;
            float pixels[64];
            int mcu = gray ? 8 : 16;
            for (int my = 0; my < h; my += mcu) {
                for (int mx = 0; mx < w; mx += mcu) {
                    for (int by = 0; by < mcu; by += 8) {
                        for (int bx = 0; bx < mcu; bx += 8) {
                            for (int i = 0; i < 64; ++i) { pixels[i] = at(Y, mx + bx + i % 8, my + by + i / 8); }
                            block(out, pixels, scaled[0], dcY, dcL, acL);
                        }
                    }
                    if (gray) { continue; }
                    for (int c = 0; c < 2; ++c) { // 4:2:0: the average of 2 x 2 pixels
                        std::vector<float> const& plane = c ? Cr : Cb;
                        for (int i = 0; i < 64; ++i) {
                            int x = mx + 2 * (i % 8), y = my + 2 * (i / 8);
                            pixels[i] = (at(plane, x, y) + at(plane, x + 1, y) + at(plane, x, y + 1) + at(plane, x + 1, y + 1)) / 4;
                        }
                        block(out, pixels, scaled[1], c ? dcCr : dcCb, dcC, acC);
                    }
                }
            }
            out.flushBits();
            out.word(0xFFD9);                                                          // EOI
            picture.bytes = std::move(out.out);
            return picture;
        }

        // ------------------------------------------------------------------ PNG (filtered rows, deflate with fixed codes)
        inline std::uint32_t crc32(const std::uint8_t* data, std::size_t size, std::uint32_t crc = 0) {
            static std::array<std::uint32_t, 256> table = [] {
                std::array<std::uint32_t, 256> t{};
                for (std::uint32_t n = 0; n < 256; ++n) { std::uint32_t c = n; for (int k = 0; k < 8; ++k) { c = c & 1 ? 0xEDB88320u ^ (c >> 1) : c >> 1; } t[n] = c; }
                return t;
            }();
            crc = ~crc;
            for (std::size_t i = 0; i < size; ++i) { crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8); }
            return ~crc;
        }

        class BitWriter { // LSB first, as deflate wants
        public:
            std::vector<std::uint8_t>& out;
            explicit BitWriter(std::vector<std::uint8_t>& o) : out(o) {}
            void bits(std::uint32_t value, int count) { buffer_ |= static_cast<std::uint64_t>(value) << filled_; filled_ += count; while (filled_ >= 8) { out.push_back(static_cast<std::uint8_t>(buffer_)); buffer_ >>= 8; filled_ -= 8; } }
            void code(std::uint32_t code, int length) { std::uint32_t r = 0; for (int i = 0; i < length; ++i) { r = (r << 1) | ((code >> i) & 1); } bits(r, length); } // (Huffman codes: most significant bit first)
            void flush() { if (filled_ > 0) { out.push_back(static_cast<std::uint8_t>(buffer_)); } buffer_ = 0; filled_ = 0; }
        private:
            std::uint64_t buffer_ = 0;
            int filled_ = 0;
        };

        // zlib stream of data: one deflate block with the fixed codes, LZ77 on a 32 KB window (hash chains)
        inline std::vector<std::uint8_t> zlib(std::vector<std::uint8_t> const& data) {
            static const int lengthBase[29] = { 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258 };
            static const int lengthExtra[29] = { 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0 };
            static const int distanceBase[30] = { 1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577 };
            static const int distanceExtra[30] = { 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13 };
            std::vector<std::uint8_t> out{ 0x78, 0x01 };
            BitWriter w(out);
            w.bits(1, 1); // last block
            w.bits(1, 2); // fixed codes
            auto symbol = [&](int s) {
                if (s < 144) { w.code(static_cast<std::uint32_t>(0x30 + s), 8); }
                else if (s < 256) { w.code(static_cast<std::uint32_t>(0x190 + s - 144), 9); }
                else if (s < 280) { w.code(static_cast<std::uint32_t>(s - 256), 7); }
                else { w.code(static_cast<std::uint32_t>(0xC0 + s - 280), 8); }
            };
            const std::size_t n = data.size(), window = 32768, chain = 32;
            std::vector<std::int64_t> head(1 << 15, -1), previous(window, -1);
            auto hash = [&](std::size_t i) { return ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & 0x7FFF; };
            std::size_t i = 0;
            while (i < n) {
                int bestLength = 0;
                std::size_t bestDistance = 0;
                if (i + 3 <= n) {
                    std::size_t h = static_cast<std::size_t>(hash(i));
                    std::int64_t candidate = head[h];
                    for (std::size_t tries = 0; candidate >= 0 && tries < chain && i - static_cast<std::size_t>(candidate) <= window; ++tries) {
                        std::size_t c = static_cast<std::size_t>(candidate);
                        int length = 0;
                        while (length < 258 && i + length < n && data[c + length] == data[i + length]) { length++; }
                        if (length > bestLength) { bestLength = length; bestDistance = i - c; if (length == 258) { break; } }
                        candidate = previous[c % window];
                    }
                }
                std::size_t step = bestLength >= 3 ? static_cast<std::size_t>(bestLength) : 1;
                if (bestLength >= 3) {
                    int l = 28; while (lengthBase[l] > bestLength) { --l; }
                    symbol(257 + l);
                    if (lengthExtra[l]) { w.bits(static_cast<std::uint32_t>(bestLength - lengthBase[l]), lengthExtra[l]); }
                    int d = 29; while (distanceBase[d] > static_cast<int>(bestDistance)) { --d; }
                    w.code(static_cast<std::uint32_t>(d), 5);
                    if (distanceExtra[d]) { w.bits(static_cast<std::uint32_t>(bestDistance - distanceBase[d]), distanceExtra[d]); }
                }
                else { symbol(data[i]); }
                for (std::size_t k = 0; k < step; ++k, ++i) { // (every position goes in the chains)
                    if (i + 3 <= n) { std::size_t h = static_cast<std::size_t>(hash(i)); previous[i % window] = head[h]; head[h] = static_cast<std::int64_t>(i); }
                }
            }
            symbol(256);
            w.flush();
            std::uint32_t a = 1, b = 0;
            for (std::uint8_t byte : data) { a = (a + byte) % 65521; b = (b + a) % 65521; }
            std::uint32_t adler = (b << 16) | a;
            for (int k = 3; k >= 0; --k) { out.push_back(static_cast<std::uint8_t>(adler >> (8 * k))); }
            return out;
        }

        inline Picture png(Pixels const& p) {
            Picture picture;
            picture.type = Teleplot::Png;
            if ((picture.error = check(p)) != "") { return picture; }
            if (p.format == Float32) { picture.error = "a PNG holds whole numbers: Raw{} for Float32"; return picture; }
            // What PNG stores: gray 8 or 16 bits (16: big endian), RGB, RGBA
            int channels = p.format == Gray8 || p.format == Gray16 ? 1 : p.format == RGBA8 || p.format == BGRA8 ? 4 : 3;
            int depth = p.format == Gray16 ? 16 : 8;
            std::size_t bpp = static_cast<std::size_t>(channels) * depth / 8, line = static_cast<std::size_t>(p.width) * bpp;
            std::vector<std::uint8_t> raw(line), previous(line, 0), filtered;
            filtered.reserve((line + 1) * static_cast<std::size_t>(p.height));
            std::vector<std::uint8_t> candidates[5];
            for (auto& c : candidates) { c.resize(line); }
            for (int y = 0; y < p.height; ++y) {
                const std::uint8_t* in = row(p, y);
                switch (p.format) {
                    case Gray8: case RGB8: case RGBA8: std::memcpy(raw.data(), in, line); break;
                    case Gray16: for (int x = 0; x < p.width; ++x) { std::uint16_t v; std::memcpy(&v, in + 2 * x, 2); raw[2 * x] = static_cast<std::uint8_t>(v >> 8); raw[2 * x + 1] = static_cast<std::uint8_t>(v); } break;
                    case BGRA8: for (int x = 0; x < p.width; ++x) { raw[4 * x] = in[4 * x + 2]; raw[4 * x + 1] = in[4 * x + 1]; raw[4 * x + 2] = in[4 * x]; raw[4 * x + 3] = in[4 * x + 3]; } break;
                    default: rgbRow(p, y, raw.data()); break; // BGR8, YUYV
                }
                // The filter that gives the smallest sum of differences (the usual choice of PNG encoders)
                std::size_t best = 0, bestSum = ~std::size_t(0);
                for (int f = 0; f < 5; ++f) {
                    std::size_t sum = 0;
                    for (std::size_t i = 0; i < line; ++i) {
                        int a = i >= bpp ? raw[i - bpp] : 0, b = previous[i], c = i >= bpp ? previous[i - bpp] : 0, predicted = 0;
                        if (f == 1) { predicted = a; } else if (f == 2) { predicted = b; } else if (f == 3) { predicted = (a + b) / 2; }
                        else if (f == 4) { int pa = std::abs(b - c), pb = std::abs(a - c), pc = std::abs(a + b - 2 * c); predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
                        std::uint8_t v = static_cast<std::uint8_t>(raw[i] - predicted);
                        candidates[f][i] = v;
                        sum += v < 128 ? v : 256 - v;
                    }
                    if (sum < bestSum) { bestSum = sum; best = static_cast<std::size_t>(f); }
                }
                filtered.push_back(static_cast<std::uint8_t>(best));
                filtered.insert(filtered.end(), candidates[best].begin(), candidates[best].end());
                previous.swap(raw);
            }
            std::vector<std::uint8_t>& out = picture.bytes;
            static const std::uint8_t signature[8] = { 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A };
            out.assign(signature, signature + 8);
            auto chunk = [&](const char* type, std::vector<std::uint8_t> const& data) {
                for (int k = 3; k >= 0; --k) { out.push_back(static_cast<std::uint8_t>(data.size() >> (8 * k))); }
                std::size_t start = out.size();
                out.insert(out.end(), type, type + 4);
                out.insert(out.end(), data.begin(), data.end());
                std::uint32_t crc = crc32(out.data() + start, out.size() - start);
                for (int k = 3; k >= 0; --k) { out.push_back(static_cast<std::uint8_t>(crc >> (8 * k))); }
            };
            std::vector<std::uint8_t> header;
            for (int v : { p.width, p.height }) { for (int k = 3; k >= 0; --k) { header.push_back(static_cast<std::uint8_t>(static_cast<std::uint32_t>(v) >> (8 * k))); } }
            header.push_back(static_cast<std::uint8_t>(depth));
            header.push_back(static_cast<std::uint8_t>(channels == 1 ? 0 : channels == 3 ? 2 : 6));
            header.push_back(0); header.push_back(0); header.push_back(0);
            chunk("IHDR", header);
            chunk("IDAT", zlib(filtered));
            chunk("IEND", {});
            return picture;
        }
    }

    namespace detail {
        // ------------------------------------------------------------------ Raw: {width[16]} {height[16]} {format[8]: 0 gray16, 1 float32} {3 bytes at 0}, then the numbers, rows packed, little-endian
        inline Picture raw(Pixels const& p) {
            Picture picture;
            picture.type = Teleplot::Raw;
            if ((picture.error = check(p)) != "") { return picture; }
            if (p.format != Gray16 && p.format != Float32) { picture.error = "Raw{} is for numbers: Gray16 or Float32"; return picture; }
            if (p.width > 65535 || p.height > 65535) { picture.error = "too big for a Raw picture"; return picture; }
            std::size_t size = bytesPerPixel(p.format), line = rowBytes(p);
            std::vector<std::uint8_t>& out = picture.bytes;
            out.resize(8 + line * static_cast<std::size_t>(p.height));
            out[0] = static_cast<std::uint8_t>(p.width); out[1] = static_cast<std::uint8_t>(p.width >> 8);
            out[2] = static_cast<std::uint8_t>(p.height); out[3] = static_cast<std::uint8_t>(p.height >> 8);
            out[4] = p.format == Float32 ? 1 : 0;
            const std::uint16_t one = 1;
            bool little = *reinterpret_cast<const std::uint8_t*>(&one) == 1;
            for (int y = 0; y < p.height; ++y) {
                std::uint8_t* to = out.data() + 8 + line * static_cast<std::size_t>(y);
                std::memcpy(to, row(p, y), line);
                if (!little) { for (std::size_t i = 0; i < line; i += size) { for (std::size_t a = i, b = i + size - 1; a < b; ++a, --b) { std::swap(to[a], to[b]); } } }
            }
            return picture;
        }
    }

    // ------------------------------------------------------------------ Encoding, files
    inline Picture encode(Pixels const& pixels, Jpeg jpeg = {}) { return detail::jpeg(pixels, jpeg.quality); }
    inline Picture encode(Pixels const& pixels, Png) { return detail::png(pixels); }
    inline Picture encode(Pixels const& pixels, Raw) { return detail::raw(pixels); }

    // What a picture is, from its first bytes (nothing else is read)
    inline std::optional<Teleplot::ImageType> typeOf(const void* bytes, std::size_t size) {
        const std::uint8_t* b = static_cast<const std::uint8_t*>(bytes);
        if (size >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) { return Teleplot::Jpeg; }
        if (size >= 8 && b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G' && b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A) { return Teleplot::Png; }
        return std::nullopt;
    }

    // A .jpg / .png file, as it is (not decoded)
    inline Picture load(std::string const& path) {
        Picture picture;
        std::ifstream file(path, std::ios::binary);
        if (!file) { picture.error = "cannot open " + path; return picture; }
        std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
        auto type = typeOf(bytes.data(), bytes.size());
        if (!type) { picture.error = path + " is not a JPEG nor a PNG"; return picture; }
        picture.type = *type;
        picture.bytes = std::move(bytes);
        return picture;
    }

    // Smaller by a whole factor (2: half the width and height): each pixel is the average of factor x factor pixels; what does not
    // fill a whole square at the right and bottom edges is left out. YUYV gives RGB8. Not for Float32 (an empty Image).
    inline Image shrink(Pixels const& p, int factor) {
        Image image;
        if (detail::check(p) != "" || factor < 1 || p.format == Float32) { return image; }
        image.width = p.width / factor;
        image.height = p.height / factor;
        image.format = p.format == YUYV ? RGB8 : p.format;
        if (image.width == 0 || image.height == 0) { image.width = image.height = 0; return image; }
        int channels = static_cast<int>(detail::bytesPerPixel(image.format)) / (image.format == Gray16 ? 2 : 1);
        image.data.resize(static_cast<std::size_t>(image.width) * image.height * detail::bytesPerPixel(image.format));
        std::vector<std::uint32_t> sums(static_cast<std::size_t>(image.width) * channels);
        std::vector<std::uint8_t> rgb(p.format == YUYV ? static_cast<std::size_t>(p.width) * 3 : 0);
        for (int oy = 0; oy < image.height; ++oy) {
            std::fill(sums.begin(), sums.end(), 0);
            for (int dy = 0; dy < factor; ++dy) {
                const std::uint8_t* in = detail::row(p, oy * factor + dy);
                if (p.format == YUYV) { detail::rgbRow(p, oy * factor + dy, rgb.data()); in = rgb.data(); }
                for (int ox = 0; ox < image.width; ++ox) {
                    for (int dx = 0; dx < factor; ++dx) {
                        std::size_t x = static_cast<std::size_t>(ox * factor + dx);
                        for (int c = 0; c < channels; ++c) {
                            std::uint32_t v;
                            if (p.format == Gray16) { std::uint16_t s; std::memcpy(&s, in + 2 * x, 2); v = s; }
                            else { v = in[x * channels + c]; }
                            sums[static_cast<std::size_t>(ox) * channels + c] += v;
                        }
                    }
                }
            }
            std::uint32_t count = static_cast<std::uint32_t>(factor * factor);
            for (int ox = 0; ox < image.width; ++ox) {
                for (int c = 0; c < channels; ++c) {
                    std::uint32_t v = (sums[static_cast<std::size_t>(ox) * channels + c] + count / 2) / count;
                    std::size_t at = static_cast<std::size_t>(oy) * image.width + ox;
                    if (image.format == Gray16) { std::uint16_t s = static_cast<std::uint16_t>(v); std::memcpy(image.data.data() + 2 * at, &s, 2); }
                    else { image.data[at * channels + c] = static_cast<std::uint8_t>(v); }
                }
            }
        }
        return image;
    }

    // A copy of pixels, rows packed (what send() keeps: the buffer of a camera is used again at once)
    inline Image copy(Pixels const& p) {
        Image image;
        if (detail::check(p) != "") { return image; }
        image.width = p.width;
        image.height = p.height;
        image.format = p.format;
        std::size_t line = detail::rowBytes(p);
        image.data.resize(line * static_cast<std::size_t>(p.height));
        if (!p.stride || p.stride == line) { std::memcpy(image.data.data(), p.data, image.data.size()); }
        else { for (int y = 0; y < p.height; ++y) { std::memcpy(image.data.data() + line * y, detail::row(p, y), line); } }
        return image;
    }

    // ------------------------------------------------------------------ Encoding on a thread
    namespace detail {
        struct Job {
            std::optional<Teleplot::Telemetry> telemetry;
            Image image;
            int kind = 0; // 0 JPEG, 1 PNG, 2 Raw
            int quality = 80;
            Teleplot::Time time;
            Teleplot::Scheduling caller;
        };
        inline Picture encodeJob(Job const& job) { return job.kind == 2 ? detail::raw(job.image) : job.kind == 1 ? detail::png(job.image) : detail::jpeg(job.image, job.quality); }

        // One per Teleplot (Teleplot::extension): a thread, a slot per telemetry
        class Encoder {
        public:
            explicit Encoder(Teleplot& tp) : tp_(tp) {}
            ~Encoder() {
                { std::lock_guard<std::mutex> l(mutex_); stop_ = true; }
                wake_.notify_all();
                if (thread_.joinable()) { thread_.join(); } // (the picture being encoded is finished and sent)
            }
            void submit(Job&& job) {
                std::string name(job.telemetry->name());
                {
                    std::lock_guard<std::mutex> l(mutex_);
                    auto found = pending_.find(name);
                    if (found == pending_.end()) { order_.push_back(name); found = pending_.emplace(name, std::nullopt).first; }
                    if (found->second) { stats_.replaced++; } // (asked again before it was started: only the latest is kept)
                    found->second = std::move(job);
                    if (!thread_.joinable()) { thread_ = std::thread([this] { run(); }); }
                }
                wake_.notify_one();
            }
            Stats stats() const { std::lock_guard<std::mutex> l(mutex_); return stats_; }
        private:
            void run() {
                std::optional<Teleplot::Scheduling> applied;
                Teleplot::ThreadPriority appliedPriority;
                Teleplot::ThreadAffinity appliedAffinity;
                std::size_t next = 0;
                for (;;) {
                    Job job;
                    {
                        std::unique_lock<std::mutex> l(mutex_);
                        auto ready = [&] { for (auto const& [name, slot] : pending_) { if (slot) { return true; } } return false; };
                        wake_.wait(l, [&] { return stop_ || ready(); });
                        if (stop_) { for (auto& [name, slot] : pending_) { if (slot) { stats_.replaced++; } } return; }
                        for (std::size_t k = 0; k < order_.size(); ++k) { // (telemetries in turn: a fast one does not starve the others)
                            auto& slot = pending_[order_[(next + k) % order_.size()]];
                            if (slot) { job = std::move(*slot); slot.reset(); next = (next + k + 1) % order_.size(); break; }
                        }
                    }
                    Teleplot::ThreadPriority priority = tp_.threadPriority();
                    Teleplot::ThreadAffinity affinity = tp_.threadAffinity();
                    if (!applied || priority != appliedPriority || affinity != appliedAffinity || !applied->same(job.caller)) { // (applied again only when it changes)
                        if (!job.caller.applyToCurrentThread(priority, affinity)) { std::lock_guard<std::mutex> l(mutex_); stats_.priorityRefused++; }
                        applied = job.caller;
                        appliedPriority = priority;
                        appliedAffinity = affinity;
                    }
                    Picture picture = encodeJob(job);
                    { std::lock_guard<std::mutex> l(mutex_); (picture ? stats_.encoded : stats_.failed)++; }
                    if (picture) { job.telemetry->at(job.time).image(picture); }
                    statsDue();
                }
            }
            // Its stats as telemetries, when the Teleplot sends its own (sendStats)
            void statsDue() {
                std::int64_t every = tp_.statsInterval().ns / 1000000;
                std::int64_t ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
                if (every <= 0) { statsAtMs_ = 0; return; }
                Stats now = stats();
                if (statsAtMs_ == 0) { statsAtMs_ = ms; statsBefore_ = now; return; }
                if (ms - statsAtMs_ < every) { return; }
                double seconds = (ms - statsAtMs_) / 1000.0;
                tp_.telemetry("teleplot.images.encoded").unit("/s").label("teleplot images").desc("Pictures encoded per second").update((now.encoded - statsBefore_.encoded) / seconds);
                tp_.telemetry("teleplot.images.replaced").unit("/s").label("teleplot images").desc("Pictures replaced by a newer one before they were encoded, per second").update((now.replaced - statsBefore_.replaced) / seconds);
                tp_.telemetry("teleplot.images.failed").label("teleplot images").desc("Pictures that could not be encoded, since the start").update(static_cast<double>(now.failed));
                statsAtMs_ = ms;
                statsBefore_ = now;
            }
            std::int64_t statsAtMs_ = 0;
            Stats statsBefore_;
            Teleplot& tp_;
            mutable std::mutex mutex_;
            std::condition_variable wake_;
            std::map<std::string, std::optional<Job>> pending_;
            std::vector<std::string> order_;
            std::thread thread_;
            bool stop_ = false;
            Stats stats_;
        };

        inline void send(Teleplot::Telemetry telemetry, Image&& image, int kind, int quality, std::optional<Teleplot::Time> time) {
            Job job;
            job.time = time ? *time : telemetry.teleplot().currentTime(); // (dated when asked, not when encoded)
            job.telemetry = telemetry;
            job.image = std::move(image);
            job.kind = kind;
            job.quality = quality;
#if defined(TELEPLOT_SINGLE_THREAD)
            Encoder& encoder = telemetry.teleplot().extension<Encoder>();
            (void)encoder;
            Picture picture = encodeJob(job);
            if (picture) { telemetry.at(job.time).image(picture); }
#else
            job.caller = Teleplot::Scheduling::ofCurrentThread();
            telemetry.teleplot().extension<Encoder>().submit(std::move(job));
#endif
        }
    }

    // Encoded on the thread of the Teleplot, then sent (dated now, or at the time given). The pixels are copied: the buffer can be
    // used again as soon as it returns. An Image is taken as it is (moved: no copy).
    inline void send(Teleplot::Telemetry telemetry, Pixels const& pixels, Jpeg jpeg = {}) { detail::send(telemetry, copy(pixels), 0, jpeg.quality, std::nullopt); }
    inline void send(Teleplot::Telemetry telemetry, Pixels const& pixels, Png) { detail::send(telemetry, copy(pixels), 1, 0, std::nullopt); }
    inline void send(Teleplot::Telemetry telemetry, Pixels const& pixels, Raw) { detail::send(telemetry, copy(pixels), 2, 0, std::nullopt); }
    inline void send(Teleplot::Telemetry telemetry, Pixels const& pixels, Teleplot::Time time, Jpeg jpeg = {}) { detail::send(telemetry, copy(pixels), 0, jpeg.quality, time); }
    inline void send(Teleplot::Telemetry telemetry, Pixels const& pixels, Teleplot::Time time, Png) { detail::send(telemetry, copy(pixels), 1, 0, time); }
    inline void send(Teleplot::Telemetry telemetry, Pixels const& pixels, Teleplot::Time time, Raw) { detail::send(telemetry, copy(pixels), 2, 0, time); }
    inline void send(Teleplot::Telemetry telemetry, Image&& image, Jpeg jpeg = {}) { detail::send(telemetry, std::move(image), 0, jpeg.quality, std::nullopt); }
    inline void send(Teleplot::Telemetry telemetry, Image&& image, Png) { detail::send(telemetry, std::move(image), 1, 0, std::nullopt); }
    inline void send(Teleplot::Telemetry telemetry, Image&& image, Raw) { detail::send(telemetry, std::move(image), 2, 0, std::nullopt); }

    // What the encoding thread of a Teleplot did: encoded, replaced (a newer picture came before it started), failed, priority refused
    inline Stats stats(Teleplot& tp) { return tp.extension<detail::Encoder>().stats(); }
}

#endif
