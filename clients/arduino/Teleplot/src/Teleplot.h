// Teleplot client for microcontrollers (Arduino, ESP32, RP2040, STM32...): telemetry as lines of the text protocol on any Print
// (Serial, a WiFiUDP, an SD file), and commands from the page. Source: https://github.com/nesnes/teleplot. One header, C++11, no
// heap, no STL. The same API as the C++ client for computers (clients/cpp/Teleplot.h): doc/cpp-client-api.md.
//
//     #include <Teleplot.h>
//     Teleplot tp(Serial);                                     // lines start with ">" on a serial port
//     void setup() { Serial.begin(115200); tp.telemetry("temperature").unit("°C").range(0, 50); }
//     void loop()  { tp.update("temperature", analogRead(A0) * 0.1); tp.poll(); }
//
// Times: micros() since boot (the page dates them when they arrive, option "Times since boot" of the source), or tp.clock(fn).
// Strings given to descriptions (names, units, labels...) are kept as pointers: give literals, or strings that live as long.
//
// #define before including:
//   TELEPLOT_DISABLE            every call does nothing
//   TELEPLOT_MAX_TELEMETRIES    described telemetries kept (to send their descriptions again every 5 s): 16, 4 on AVR
//   TELEPLOT_MAX_PARAMS (8, 2 on AVR), TELEPLOT_MAX_ACTIONS (4, 1), TELEPLOT_MAX_ARGS (4, 2), TELEPLOT_MAX_THRESHOLDS (8, 2),
//   TELEPLOT_MAX_STACKS (4, 1) and TELEPLOT_STACK_SIZE (longest path: 64, 32)
//   TELEPLOT_RESEND             0: samples sent once (a shape's size, position, color, thresholds, a camera) are not sent again
//                               (default 1, 0 on AVR: it keeps their values, about 100 bytes per telemetry)
//   TELEPLOT_LINE_SIZE          longest line read from the page (128, 64 on AVR)
//   TELEPLOT_RESULT_SIZE        longest text an action answers with (40, 16 on AVR)
// Memory: about 5 KB with the defaults, about 1 KB on AVR (an Uno has 2 KB): lower the limits above for what the sketch uses.

#ifndef TELEPLOT_MICRO_H
#define TELEPLOT_MICRO_H

#include <Arduino.h>
#include <ctype.h>
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

// The AVR core makes min(a, b) and max(a, b) macros: they would take the place of the min(v) and max(v) calls of this library, in
// it and in the sketch. They are replaced by functions that give the same (the smaller / larger of the two, in their common type).
#ifdef min
    #undef min
    template<class A, class B> inline auto min(A a, B b) -> decltype(a + b) { return a < b ? a : b; }
#endif
#ifdef max
    #undef max
    template<class A, class B> inline auto max(A a, B b) -> decltype(a + b) { return a > b ? a : b; }
#endif

#ifndef TELEPLOT_MAX_TELEMETRIES
    #ifdef __AVR__
        #define TELEPLOT_MAX_TELEMETRIES 4
    #else
        #define TELEPLOT_MAX_TELEMETRIES 16
    #endif
#endif
#ifndef TELEPLOT_MAX_PARAMS
    #ifdef __AVR__
        #define TELEPLOT_MAX_PARAMS 2
    #else
        #define TELEPLOT_MAX_PARAMS 8
    #endif
#endif
#ifndef TELEPLOT_MAX_ACTIONS
    #ifdef __AVR__
        #define TELEPLOT_MAX_ACTIONS 1
    #else
        #define TELEPLOT_MAX_ACTIONS 4
    #endif
#endif
#ifndef TELEPLOT_MAX_ARGS
    #ifdef __AVR__
        #define TELEPLOT_MAX_ARGS 2
    #else
        #define TELEPLOT_MAX_ARGS 4
    #endif
#endif
#ifndef TELEPLOT_MAX_THRESHOLDS
    #ifdef __AVR__
        #define TELEPLOT_MAX_THRESHOLDS 2
    #else
        #define TELEPLOT_MAX_THRESHOLDS 8
    #endif
#endif
#ifndef TELEPLOT_MAX_STACKS
    #ifdef __AVR__
        #define TELEPLOT_MAX_STACKS 1
    #else
        #define TELEPLOT_MAX_STACKS 4
    #endif
#endif
#ifndef TELEPLOT_STACK_SIZE
    #ifdef __AVR__
        #define TELEPLOT_STACK_SIZE 32
    #else
        #define TELEPLOT_STACK_SIZE 64
    #endif
#endif
#ifndef TELEPLOT_RESEND
    #ifdef __AVR__
        #define TELEPLOT_RESEND 0
    #else
        #define TELEPLOT_RESEND 1
    #endif
#endif
#ifndef TELEPLOT_LINE_SIZE
    #ifdef __AVR__
        #define TELEPLOT_LINE_SIZE 64
    #else
        #define TELEPLOT_LINE_SIZE 128
    #endif
#endif
#ifndef TELEPLOT_MAX_OUTPUTS
    #ifdef __AVR__
        #define TELEPLOT_MAX_OUTPUTS 2
    #else
        #define TELEPLOT_MAX_OUTPUTS 3
    #endif
#endif
#ifndef TELEPLOT_RESULT_SIZE
    #ifdef __AVR__
        #define TELEPLOT_RESULT_SIZE 16
    #else
        #define TELEPLOT_RESULT_SIZE 40
    #endif
#endif

// (Plain types, outside the class, as in the C++ client)
namespace teleplot_types {
    struct Number2D { double x, y; Number2D(double x_ = 0, double y_ = 0) : x(x_), y(y_) {} };
    struct Number3D { double x, y, z; Number3D(double x_ = 0, double y_ = 0, double z_ = 0) : x(x_), y(y_), z(z_) {} };
    struct Pose2D { double x, y, yaw; Pose2D(double x_ = 0, double y_ = 0, double yaw_ = 0) : x(x_), y(y_), yaw(yaw_) {} }; // yaw in radians
    struct Rgb { uint8_t r, g, b; Rgb(uint8_t r_ = 0, uint8_t g_ = 0, uint8_t b_ = 0) : r(r_), g(g_), b(b_) {} };
    // A time: nanoseconds (since boot by default, since 1970 when the clock gives a date)
    struct Time { int64_t ns; constexpr Time(int64_t v = 0) : ns(v) {} };
    // What a handler answers: ok (with a short result) or an error (why). The text is copied.
    struct Result {
        uint8_t status;
        char text[TELEPLOT_RESULT_SIZE];
        Result(uint8_t s = 0, const char* t = "") : status(s) { strncpy(text, t ? t : "", sizeof(text) - 1); text[sizeof(text) - 1] = 0; }
    };
    struct Stats { uint32_t samples, bytes, tooBig, dropped; Stats() : samples(0), bytes(0), tooBig(0), dropped(0) {} };
}

class Teleplot
{
    struct Entry_;
    struct Param_;
    struct Action_;

public:
    typedef teleplot_types::Number2D Number2D;
    typedef teleplot_types::Number3D Number3D;
    typedef teleplot_types::Pose2D Pose2D;
    typedef teleplot_types::Rgb Rgb;
    typedef teleplot_types::Time Time;
    typedef teleplot_types::Result Result;
    typedef teleplot_types::Stats Stats;

    static constexpr Time ms(double v) { return Time(static_cast<int64_t>(v * 1e6)); }
    static constexpr Time us(double v) { return Time(static_cast<int64_t>(v * 1e3)); }
    static constexpr Time ns(int64_t v) { return Time(v); }
    static constexpr double deg(double degrees) { return degrees * 3.14159265358979323846 / 180.0; }
    static Result ok(const char* text = "") { return Result(0, text); }
    // The time now on the default clock: micros() since boot, made 64 bits (what samples get when no clock() was given)
    static Time now() {
        static uint32_t last = 0, high = 0;
        uint32_t m = micros();
        if (m < last) { high++; }
        last = m;
        return Time(static_cast<int64_t>((static_cast<uint64_t>(high) << 32) | m) * 1000);
    }
    static Result error(const char* why) { return Result(1, why); }

    enum ShapeType : uint8_t { Cube = 0, Sphere = 1, Cylinder = 2, Rect = 3, Circle = 4, Line = 5, Polygon = 6, Arrow = 7, Text = 8, Stl = 10 };
    enum ImageType : uint8_t { Jpeg = 0, Png = 1, Raw = 2 }; // Raw: plain numbers (a depth map: doc/depth.md)
    enum ThresholdSide : uint8_t { Below = 0, Above = 1 };
    enum Axis : uint8_t { X = 1, Y = 2, Yaw = 4 };

    // An argument of an action
    class Arg {
    public:
        enum Type : uint8_t { Number = 1, Bool = 2, Text = 3, XY = 4, XYZ = 5, Pose2D = 6 };
        Arg(const char* name = "", Type type = Number) : name_(name), unit_(0), desc_(0), choices_(0), count_(0), type_(type), optional_(false), min_(NAN), max_(NAN), step_(NAN) { default_[0] = 0; }
        Arg& optional(bool v = true) { optional_ = v; return *this; }
        Arg& defaultValue(double v) { char text[32]; Teleplot::formatNumber_(v, 9, text, sizeof(text)); return defaultValue(static_cast<const char*>(text)); }
        Arg& defaultValue(int v) { return defaultValue(static_cast<double>(v)); }
        Arg& defaultValue(bool v) { strcpy(default_, v ? "true" : "false"); return *this; }
        Arg& defaultValue(const char* v) { strncpy(default_, v, sizeof(default_) - 1); default_[sizeof(default_) - 1] = 0; return *this; }
        Arg& range(double min, double max) { min_ = min; max_ = max; return *this; }
        Arg& min(double v) { min_ = v; return *this; }
        Arg& max(double v) { max_ = v; return *this; }
        Arg& step(double v) { step_ = v; return *this; }
        Arg& unit(const char* v) { unit_ = v; return *this; }
        Arg& desc(const char* v) { desc_ = v; return *this; }
        template<size_t N> Arg& enumValues(const char* const (&list)[N]) { choices_ = list; count_ = N; return *this; } // the texts it can take
    private:
        friend class Teleplot;
        const char* name_;
        const char* unit_;
        const char* desc_;
        const char* const* choices_;
        uint8_t count_;
        Type type_;
        bool optional_;
        float min_, max_, step_;
        char default_[16];
    };

    // The arguments of a call, read from its line ("!goto#21:target=1.5,2:speed=1")
    class Args {
    public:
        bool has(const char* name) const { return find_(name) != 0; }
        double number(const char* name, double fallback = NAN) const { const char* v = find_(name); return v ? strtod(v, 0) : fallback; }
        bool flag(const char* name, bool fallback = false) const { const char* v = find_(name); return v ? !(v[0] == '0' || v[0] == 'f' || v[0] == 'n' || v[0] == ':' || v[0] == 0) : fallback; }
        const char* text(const char* name, const char* fallback = "") const {
            const char* v = find_(name);
            if (!v) { return fallback; }
            size_t n = 0;
            while (*v && *v != ':' && n < sizeof(text_) - 1) { text_[n++] = *v; ++v; }
            text_[n] = 0;
            Teleplot::unescape_(text_);
            return text_;
        }
        Number2D xy(const char* name, Number2D fallback = Number2D()) const { double v[3]; return numbers_(name, v, 2) ? Number2D(v[0], v[1]) : fallback; }
        Number3D xyz(const char* name, Number3D fallback = Number3D()) const { double v[3]; return numbers_(name, v, 3) ? Number3D(v[0], v[1], v[2]) : fallback; }
        Teleplot::Pose2D pose2d(const char* name, Teleplot::Pose2D fallback = Teleplot::Pose2D()) const { double v[3]; return numbers_(name, v, 3) ? Teleplot::Pose2D(v[0], v[1], v[2]) : fallback; }
    private:
        friend class Teleplot;
        Args(const char* fields) : fields_(fields) {}
        const char* fields_;    // after the id: ":name=value:name=value"
        mutable char text_[64];
        const char* find_(const char* name) const {
            size_t length = strlen(name);
            for (const char* at = fields_; at && *at; ) {
                if (*at == ':') { ++at; }
                if (strncmp(at, name, length) == 0 && at[length] == '=') { return at + length + 1; }
                at = strchr(at, ':');
            }
            return 0;
        }
        bool numbers_(const char* name, double* out, int count) const {
            const char* v = find_(name);
            if (!v) { return false; }
            for (int i = 0; i < count; ++i) {
                char* end;
                out[i] = strtod(v, &end);
                if (end == v) { return false; }
                v = end;
                if (i < count - 1) { if (*v != ',') { return false; } ++v; }
            }
            return true;
        }
    };

    class Samples;
    class Telemetry;
    template<class T> class Param;
    class Action;
    class Stack;

    // What describes a telemetry: the same calls on a Telemetry and on the Samples of a chain
    template<class Self>
    class Describe {
    public:
        Self& unit(const char* v) { if (Entry_* e = entry_()) { e->unit = v; e->dirty = true; } return self_(); }
        Self& label(const char* v) { if (Entry_* e = entry_()) { e->label = v; } return self_(); }
        Self& desc(const char* v) { if (Entry_* e = entry_()) { e->desc = v; e->dirty = true; } return self_(); }
        Self& range(double min, double max) { if (Entry_* e = entry_()) { e->min = static_cast<float>(min); e->max = static_cast<float>(max); e->flags |= HAS_MIN_ | HAS_MAX_; e->dirty = true; } return self_(); }
        Self& min(double v) { if (Entry_* e = entry_()) { e->min = static_cast<float>(v); e->flags |= HAS_MIN_; e->dirty = true; } return self_(); }
        Self& max(double v) { if (Entry_* e = entry_()) { e->max = static_cast<float>(v); e->flags |= HAS_MAX_; e->dirty = true; } return self_(); }
        Self& autoplot(bool v) { return flag_(NP_, !v); }
        Self& log(bool v = true) { return flag_(LOG_, v); }
        Self& stack(bool v = true) { return flag_(STACK_, v); }
        Self& frame(const char* name) { if (Entry_* e = entry_()) { e->frame = name; e->flags &= static_cast<uint8_t>(~PIXELS_); tp_->shapeLine_(*this, "F", name); } return self_(); }
        Self& pixelsOf(const char* image) { if (Entry_* e = entry_()) { e->frame = image; e->flags |= PIXELS_; tp_->shapeLine_(*this, "FPX", image); } return self_(); }
        Self& shape(ShapeType type) { if (Entry_* e = entry_()) { e->shape = type; e->flags |= SHAPE_; e->url = 0; } tp_->shapeLine_(*this, "S", shapeName_(type)); return self_(); }
        Self& stl(const char* url) { if (Entry_* e = entry_()) { e->shape = Stl; e->flags |= SHAPE_; e->url = url; } tp_->shapeLine_(*this, "S", "stl", "U", url); return self_(); }
        Self& maxRate(double hz) { if (Entry_* e = entry_()) { e->minGapUs = hz > 0 ? static_cast<uint32_t>(1e6 / hz) : 0; } return self_(); }
        Self& precise(bool v = true) { return flag_(PRECISE_, v); }
        Self& nonBlocking(bool = true) { return self_(); } // (one thread: nothing to wait for)
        Self& oneThread(bool = true) { return self_(); }
        Self& timeout(Time) { return self_(); }             // (the text protocol has no data timeout)
        // Pictures of numbers: a pixel is worth its number x scale (noData: what means none, NAN: none). A depth map is placed in 3D.
        Self& depthMap(double scale, double noData = 0) { return pixels_(1, scale, noData); }
        Self& pixelValues(double scale, double noData = 0) { return pixels_(2, scale, noData); }
    protected:
        Describe(Teleplot* tp, const char* name, int8_t index) : tp_(tp), name_(name), index_(index) {}
        Self& self_() { return static_cast<Self&>(*this); }
        Entry_* entry_() { return index_ >= 0 ? &tp_->entries_[index_] : 0; }
        Self& pixels_(uint8_t kind, double scale, double noData) { if (Entry_* e = entry_()) { e->pixels = kind; e->pixelScale = static_cast<float>(scale); e->pixelNoData = static_cast<float>(noData); e->dirty = true; } return self_(); }
        Self& flag_(uint8_t bit, bool v) { if (Entry_* e = entry_()) { if (v) { e->flags |= bit; } else { e->flags &= static_cast<uint8_t>(~bit); } } return self_(); }
        friend class Teleplot;
        Teleplot* tp_;
        const char* name_;
        int8_t index_;
    };

    // Samples of a chain: they all get the time of the chain, taken by its first sample (or given by at())
    class Samples : public Describe<Samples> {
    public:
        Samples& update(double v) { tp_->numberSample_(*this, v); return *this; }
        Samples& update(float v) { return update(static_cast<double>(v)); }
        Samples& update(int v) { return update(static_cast<double>(v)); }
        Samples& update(long v) { return update(static_cast<double>(v)); }
        Samples& update(unsigned int v) { return update(static_cast<double>(v)); }
        Samples& update(unsigned long v) { return update(static_cast<double>(v)); }
        Samples& update(long long v) { return update(static_cast<double>(v)); }
        Samples& update(unsigned long long v) { return update(static_cast<double>(v)); }
        Samples& update(bool v) { return update(v ? 1.0 : 0.0); }
        Samples& update(const char* v) { tp_->text_(*this, v); return *this; }
#ifdef ARDUINO
        Samples& update(const String& v) { return update(v.c_str()); }
#endif
        Samples& update(Number2D v) { tp_->xy_(*this, v.x, v.y, 0, false); return *this; }
        Samples& update(Number3D v) { tp_->xy_(*this, v.x, v.y, v.z, true); return *this; }
        Samples& update(Teleplot::Pose2D v) { tp_->xy_(*this, v.x, v.y, v.yaw, true); return *this; }

        Samples& threshold(const char* name, ThresholdSide side, double value, const char* color = "") { tp_->threshold_(*this, name, side, value, color); return *this; }
        Samples& removeThreshold(const char* name) { tp_->threshold_(*this, name, Below, NAN, ""); return *this; }

        // Its structure (doc/graph.md), from the time of the chain until a newer one: the texts it can take (states, nodes: paths with
        // "/" between levels, "#kind" at the end of one) and its transitions ("from>to" or "from>to=event"). Static arrays.
        template<size_t N> Samples& enumValues(const char* const (&list)[N]) { tp_->structure_(*this, list, N, false); return *this; }
        template<size_t N> Samples& edges(const char* const (&list)[N]) { tp_->structure_(*this, list, N, true); return *this; }

        Samples& position(double x, double y, double z = 0) { double v[3] = { x, y, z }; tp_->shapeNumbers_(*this, "P", v, 3, POS_); return *this; }
        Samples& rotation(double roll, double pitch, double yaw) { double v[3] = { roll, pitch, yaw }; tp_->shapeNumbers_(*this, "R", v, 3, ROT_); return *this; }
        Samples& yaw(double a) { return rotation(0, 0, a); }
        Samples& quaternion(double w, double x, double y, double z) { double v[4] = { x, y, z, w }; tp_->shapeNumbers_(*this, "Q", v, 4, QUAT_); return *this; } // (written x:y:z:w)
        Samples& size(double x, double y, double z) { double v[3] = { x, y, z }; tp_->shapeNumbers_(*this, "SC", v, 3, SIZE_); return *this; }
        Samples& size(double x, double y) { double v[2] = { x, y }; tp_->shapeNumbers_(*this, "SC", v, 2, SIZE_); return *this; } // (z kept)
        Samples& size(double s) { return size(s, s, s); }
        Samples& color(const char* c) { tp_->color_(*this, c, false); return *this; }
        Samples& color(Rgb c) { char hex[8]; Teleplot::hex_(c, hex); tp_->color_(*this, hex, true); return *this; }
        Samples& opacity(double v) { tp_->shapeNumbers_(*this, "O", &v, 1, 0); return *this; }
        Samples& texture(const char* url) { tp_->shapeText_(*this, "T", "url", url); return *this; }
        Samples& textureFrom(const char* image) { tp_->shapeText_(*this, "T", "telem", image); return *this; }
        Samples& vector(double x, double y, double z = 0) { double v[3] = { x, y, z }; tp_->shapeNumbers_(*this, "V", v, 3, 0); return *this; }
        Samples& text(const char* v) { tp_->shapeText_(*this, "TX", 0, v); return *this; }
        Samples& textSize(double h) { tp_->shapeNumbers_(*this, "TS", &h, 1, 0); return *this; }
        Samples& lineWidth(double w) { tp_->shapeNumbers_(*this, "LW", &w, 1, 0); return *this; }
        Samples& points(const Number2D* p, size_t n) { tp_->points_(*this, p, n); return *this; }
        Samples& points(const Number3D* p, size_t n) { tp_->points_(*this, p, n); return *this; }
        Samples& cloud(const Number3D* p, size_t n, const float* intensities = 0, const Rgb* colors = 0) { tp_->cloud_(*this, p, n, intensities, colors); return *this; }
        Samples& cloud(const Number3D* p, size_t n, const Rgb* colors) { return cloud(p, n, 0, colors); }
        Samples& image(ImageType type, const void* bytes, size_t size) { tp_->image_(*this, type, static_cast<const uint8_t*>(bytes), size); return *this; }
        Samples& intrinsics(double width, double height, double fx, double fy, double cx, double cy) { double v[6] = { fx, fy, cx, cy, width, height }; tp_->shapeNumbers_(*this, "K", v, 6, K_); return *this; }
        Samples& distortion(double k1, double k2, double p1, double p2, double k3) { double v[5] = { k1, k2, p1, p2, k3 }; tp_->shapeNumbers_(*this, "DC", v, 5, DC_); return *this; }

        // (at() starts a chain: in the middle of one it would give it two times)
        template<class T = int> Samples& at(Time) { static_assert(sizeof(T) == 0, "Teleplot: at() must be the first call of a chain: telemetry.at(t).position(...)"); return *this; }

    private:
        friend class Teleplot;
        friend class Telemetry;
        Samples(Teleplot* tp, const char* name, int8_t index, bool timed, Time t) : Describe<Samples>(tp, name, index), timed_(timed), time_(t) {}
        Time t_() { if (!timed_) { time_ = tp_->now_(); timed_ = true; } return time_; }
        bool timed_;
        Time time_;
    };

    // The handle of a telemetry: describe it, send its samples
    class Telemetry : public Describe<Telemetry> {
    public:
        Samples at(Time t) { return Samples(tp_, name_, index_, true, t); }
        Telemetry& color(const char* c) { Samples(tp_, name_, index_, false, Time()).color(c); return *this; }
        Telemetry& color(Rgb c) { Samples(tp_, name_, index_, false, Time()).color(c); return *this; }
#define TELEPLOT_SAMPLE_CALL_(name) \
        template<class A> Samples name(A a) { Samples s(tp_, name_, index_, false, Time()); s.name(a); return s; } \
        template<class A, class B> Samples name(A a, B b) { Samples s(tp_, name_, index_, false, Time()); s.name(a, b); return s; } \
        template<class A, class B, class C> Samples name(A a, B b, C c) { Samples s(tp_, name_, index_, false, Time()); s.name(a, b, c); return s; } \
        template<class A, class B, class C, class D> Samples name(A a, B b, C c, D d) { Samples s(tp_, name_, index_, false, Time()); s.name(a, b, c, d); return s; } \
        template<class A, class B, class C, class D, class E> Samples name(A a, B b, C c, D d, E e) { Samples s(tp_, name_, index_, false, Time()); s.name(a, b, c, d, e); return s; } \
        template<class A, class B, class C, class D, class E, class F> Samples name(A a, B b, C c, D d, E e, F f) { Samples s(tp_, name_, index_, false, Time()); s.name(a, b, c, d, e, f); return s; }
        TELEPLOT_SAMPLE_CALL_(update) TELEPLOT_SAMPLE_CALL_(threshold) TELEPLOT_SAMPLE_CALL_(removeThreshold) TELEPLOT_SAMPLE_CALL_(position)
        TELEPLOT_SAMPLE_CALL_(rotation) TELEPLOT_SAMPLE_CALL_(yaw) TELEPLOT_SAMPLE_CALL_(quaternion) TELEPLOT_SAMPLE_CALL_(size)
        TELEPLOT_SAMPLE_CALL_(opacity) TELEPLOT_SAMPLE_CALL_(texture) TELEPLOT_SAMPLE_CALL_(textureFrom) TELEPLOT_SAMPLE_CALL_(vector)
        TELEPLOT_SAMPLE_CALL_(text) TELEPLOT_SAMPLE_CALL_(textSize) TELEPLOT_SAMPLE_CALL_(lineWidth) TELEPLOT_SAMPLE_CALL_(points)
        TELEPLOT_SAMPLE_CALL_(cloud) TELEPLOT_SAMPLE_CALL_(image) TELEPLOT_SAMPLE_CALL_(intrinsics) TELEPLOT_SAMPLE_CALL_(distortion)
#undef TELEPLOT_SAMPLE_CALL_
        template<size_t N> Samples enumValues(const char* const (&list)[N]) { Samples s(tp_, name_, index_, false, Time()); s.enumValues(list); return s; } // (an array: not through the templates above)
        template<size_t N> Samples edges(const char* const (&list)[N]) { Samples s(tp_, name_, index_, false, Time()); s.edges(list); return s; }
        const char* name() const { return name_; }
    private:
        friend class Teleplot;
        Telemetry(Teleplot* tp, const char* name, int8_t index) : Describe<Telemetry>(tp, name, index) {}
    };

    // A setting the page may write: the variable is applied by poll() (clamped to the range, rounded to the step) and published
    template<class T>
    class Param {
    public:
        Param& range(double min, double max) { if (p_) { p_->min = static_cast<float>(min); p_->max = static_cast<float>(max); } return *this; }
        Param& min(double v) { if (p_) { p_->min = static_cast<float>(v); } return *this; }
        Param& max(double v) { if (p_) { p_->max = static_cast<float>(v); } return *this; }
        Param& step(double v) { if (p_) { p_->step = static_cast<float>(v); } return *this; }
        Param& unit(const char* v) { if (p_) { p_->unit = v; } return *this; }
        Param& desc(const char* v) { if (p_) { p_->desc = v; } return *this; }
        // The texts it can take (its enum structure, doc/graph.md); "text#caption": words shown with a choice. A static array.
        template<size_t N> Param& enumValues(const char* const (&list)[N]) { if (p_) { p_->choices = list; p_->count = N; } return *this; }
        Param& rate(double hz) { if (p_) { p_->rate = static_cast<uint16_t>(hz); } return *this; }
        Param& hold(int ms) { if (p_) { p_->hold = static_cast<uint16_t>(ms); } return *this; }
        Param& axes(uint8_t bits) { if (p_) { p_->axes = bits; } return *this; }
        // Called before a value the page wrote is applied: return error("why") to refuse it (nothing changes)
        Param& onChange(Result (*fn)(T const&)) { if (p_) { p_->onChange = reinterpret_cast<void (*)()>(fn); } return *this; }
    private:
        friend class Teleplot;
        Param(Param_* p) : p_(p) {}
        Param_* p_;
    };

    // An action the page may call
    class Action {
    public:
        Action& title(const char* v) { if (a_) { a_->title = v; } return *this; }
        Action& desc(const char* v) { if (a_) { a_->desc = v; } return *this; }
        Action& color(const char* v) { if (a_) { a_->color = v; } return *this; }
        Action& confirm(bool v = true) { if (a_) { a_->confirm = v; } return *this; }
        Action& longpress(bool v = true) { if (a_) { a_->longpress = v; } return *this; }
        Action& arg(Arg a) { if (a_ && room_(a_->argCount, TELEPLOT_MAX_ARGS)) { a_->args[a_->argCount++] = a; } return *this; }
    private:
        friend class Teleplot;
        Action(Action_* a) : a_(a) {}
        Action_* a_;
    };

    // A level of a stack (what runs) while it lives: Teleplot::Stack level(tp, "robot.task", "plan");
    class Stack {
    public:
        Stack(Teleplot& tp, const char* name, const char* level) : tp_(&tp), slot_(-1), before_(0) { slot_ = tp.stackPush_(name, level, before_); }
        ~Stack() { if (slot_ >= 0) { tp_->stackPop_(slot_, before_); } }
    private:
        Stack(Stack const&);
        Stack& operator=(Stack const&);
        Teleplot* tp_;
        int8_t slot_;
        size_t before_;
    };

    // ------------------------------------------------------------------ Client
    // A serial port (lines start with ">", and what the page writes is read from it), or another Stream with serialLines false
    explicit Teleplot(Stream& stream, bool serialLines = true) { init_(); outputs_[0].print = &stream; outputs_[0].prefix = serialLines; outputCount_ = 1; input_ = &stream; }
    // Lines on a Print, as they are (a file)
    explicit Teleplot(Print& print) { init_(); outputs_[0].print = &print; outputCount_ = 1; }
    // A UDP socket (WiFiUDP, EthernetUDP): lines in packets to host:port (the Teleplot server), what comes back read from it
    template<class U> Teleplot(U& udp, const char* host, uint16_t port) {
        init_();
        outputs_[0].print = &udp;
        outputs_[0].udp = &udp;
        outputs_[0].begin = [](void* u, const char* h, uint16_t p) { static_cast<U*>(u)->beginPacket(h, p); };
        outputs_[0].end = [](void* u) { static_cast<U*>(u)->endPacket(); };
        outputs_[0].parse = [](void* u) -> int { return static_cast<U*>(u)->parsePacket(); };
        outputs_[0].host = host;
        outputs_[0].port = port;
        outputCount_ = 1;
        input_ = &udp;
    }

    // The default one: Serial
    static Teleplot& instance() { static Teleplot teleplot(Serial); return teleplot; }

    // Another destination for the same lines (an SD file: a .teleplot.txt file the page opens)
    void addOutput(Print& print) { if (room_(outputCount_, TELEPLOT_MAX_OUTPUTS)) { outputs_[outputCount_] = Output_(); outputs_[outputCount_].print = &print; outputCount_++; } }

    void enable() { enabled_ = true; }
    void disable() { enabled_ = false; }

    // Where "now" comes from: micros() since boot by default; a function that gives a date (RTC, NTP) for files read later
    void clock(Time (*fn)()) { clock_ = fn; }

    Telemetry telemetry(const char* name) { return Telemetry(this, name, entry_(name, true)); }

    template<class V> void update(const char* name, V value) { Samples(this, name, entry_(name, false), false, Time()).update(value); }
    template<class V> void update(const char* name, V value, Time t) { Samples(this, name, entry_(name, false), true, t).update(value); }

    // A log line (default name "log")
    void log(const char* text) { log("log", text); }
    void log(const char* name, const char* text) { logAt_(name, text, false, Time()); }
    void log(const char* name, const char* text, Time t) { logAt_(name, text, true, t); }

    // What runs, as a whole path ("loop/plan/search"; "" = nothing)
    void stack(const char* name, const char* path) { stackAt_(name, path, false, Time()); }
    void stack(const char* name, const char* path, Time t) { stackAt_(name, path, true, t); }

    // Dashboard lines (DASH|Robot/Motion:chart:speed|w=2), several separated by line feeds
    void dashboard(const char* lines) {
        if (!active_()) { return; }
        bool start = true;
        for (const char* c = lines; *c; ++c) {
            if (start) { lineStart_(); start = false; }
            if (*c == '\n') { lineEnd_(); start = true; }
            else { put_(*c); }
        }
        if (!start) { lineEnd_(); }
    }

    // A setting the page may write. T: float, double, int, long, bool, char[N] (a text), Number2D, Number3D, Pose2D.
    template<class T> Param<T> param(const char* name, T* variable) { return Param<T>(newParam_(name, variable, writeType_(variable), &Trampoline_<T>::write, &Trampoline_<T>::publish, &Trampoline_<T>::rest)); }
    template<size_t N> Param<char[N]> param(const char* name, char (*variable)[N]) { return Param<char[N]>(newParam_(name, variable, 3, &Trampoline_<char[N]>::write, &Trampoline_<char[N]>::publish, &Trampoline_<char[N]>::rest)); }

    // An action the page may call: handler(args) returns ok() or error("why"). It runs in poll().
    Action action(const char* name, Result (*handler)(Args const&)) {
        if (!room_(actionCount_, TELEPLOT_MAX_ACTIONS)) { stats_.tooBig++; return Action(0); }
        Action_& a = actions_[actionCount_++];
        a = Action_();
        a.name = name;
        a.handler = handler;
        declareDue_ = true;
        return Action(&a);
    }

    // Reads what the page wrote, applies it and answers; describes again and publishes the settings when it is time; sends
    void poll() {
        if (!active_()) { return; }
        if (input_) {
            Output_& o = outputs_[0];
            if (o.udp) { if (o.parse(o.udp) > 0) { readLines_(); } }
            else { readLines_(); }
        }
        uint32_t now = millis();
        for (uint8_t i = 0; i < paramCount_; ++i) {
            Param_& p = params_[i];
            if (p.hold > 0 && p.writtenAt != 0 && now - p.writtenAt > p.hold) { p.rest(p.variable); p.writtenAt = 0; publish_(p); } // nobody drives it any more
        }
        if (now - publishedAt_ >= 200) { publishedAt_ = now; for (uint8_t i = 0; i < paramCount_; ++i) { publish_(params_[i]); } }
        tick_();
        flush();
    }

    // A line written by the page ("name:value" for a setting, "!name#id:arg=value" for a call), read by poll(); public for other ways
    void handleLine(char* line) {
        size_t n = strlen(line);
        while (n && (line[n - 1] == '\r' || line[n - 1] == ' ')) { line[--n] = 0; }
        if (n == 0) { return; }
        if (line[0] == '!') { handleCall_(line + 1); return; }
        char* colon = strchr(line, ':');
        if (!colon) { return; }
        *colon = 0;
        for (uint8_t i = 0; i < paramCount_; ++i) {
            Param_& p = params_[i];
            if (strcmp(p.name, line) != 0) { continue; }
            char why[40] = { 0 };
            if (p.write(p, colon + 1, why)) { p.writtenAt = millis(); if (p.writtenAt == 0) { p.writtenAt = 1; } }
            else { lineStart_(); puts_("ACK|"); puts_(p.name); puts_(":err:"); escaped_(why, "%\n\r"); lineEnd_(); }
            publish_(p); // the echo: what is applied
            return;
        }
    }

    // Sends a UDP packet now (lines on a Print are written at once)
    void flush() {
        for (uint8_t i = 0; i < outputCount_; ++i) {
            Output_& o = outputs_[i];
            if (o.udp && o.open) { o.end(o.udp); o.open = false; }
        }
    }

    Stats stats() const { return stats_; }

    // The stats sent as telemetries every "every" (0: no more; off by default): samples and bytes per second (label "teleplot sent"),
    // lines too long or cut, lines from the page dropped, as totals ("teleplot problems"). Written directly: no table slot. They are
    // counted in what they report.
    void sendStats(Time every) { statsEveryMs_ = static_cast<uint32_t>(every.ns / 1000000); statsAtMs_ = millis(); statsBefore_ = stats_; statsDescribedAt_ = 0; }
    Time statsInterval() const { return Time(static_cast<int64_t>(statsEveryMs_) * 1000000); }

private:
    // ------------------------------------------------------------------ State
    enum : uint8_t { HAS_MIN_ = 1, HAS_MAX_ = 2, NP_ = 4, LOG_ = 8, STACK_ = 16, PIXELS_ = 32, PRECISE_ = 64, SHAPE_ = 128 };
    static const uint8_t NO_SHAPE_ = 0xFF; // (a telemetry with a position is drawn, but has no shape type unless it was given one)
    enum : uint8_t { POS_ = 1, ROT_ = 2, QUAT_ = 4, SIZE_ = 8, FILL_ = 16, K_ = 32, DC_ = 64 };
    struct Entry_ {
        const char* name;
        const char* unit;
        const char* desc;
        const char* label;
        const char* color;     // the attribute
        const char* frame;
        const char* url;
        float min, max;
        uint8_t pixels;         // 1: a depth map, 2: values (pictures of numbers)
        float pixelScale, pixelNoData;
        uint32_t minGapUs, lastUs;
        uint8_t flags, shape;  // shape: its type, NO_SHAPE_ when not given
        bool dirty, sent;
#if TELEPLOT_RESEND
        uint8_t latched;       // what is kept to be sent again (POS_...)
        float pos[3], rot[4], size[3], k[6], dc[5];
        uint8_t sizeCount;
        const char* fill;      // a color sample of the shape
        Time posT, rotT, sizeT, fillT, kT, dcT;
        const char* const* structure[2]; // its enum and its edges (static arrays), sent again with their time
        uint8_t structureCount[2];
        Time structureT[2];
#endif
    };
    struct Threshold_ { int8_t entry; const char* name; const char* color; float value; uint8_t side; Time t; };
    struct Param_ {
        const char* name;
        void* variable;
        uint8_t type, axes, count;
        float min, max, step;
        uint16_t rate, hold;
        const char* unit;
        const char* desc;
        const char* const* choices;
        Time choicesT;           // the time of its enum, taken when it is first declared (sent again with it)
        void (*onChange)();
        bool (*write)(Param_&, const char* value, char* why);
        void (*publish)(Teleplot&, Param_&);
        void (*rest)(void*);
        uint32_t writtenAt;
        double clamp(double v) const {
            if (!isnan(min) && v < min) { v = min; }
            if (!isnan(max) && v > max) { v = max; }
            if (!isnan(step) && step > 0) { double base = isnan(min) ? 0.0 : min; v = base + floor((v - base) / step + 0.5) * step; }
            return v;
        }
    };
    struct Action_ {
        const char* name;
        const char* title;
        const char* desc;
        const char* color;
        Result (*handler)(Args const&);
        Arg args[TELEPLOT_MAX_ARGS];
        uint8_t argCount;
        bool confirm, longpress;
        long lastCall;
        Result last;
        Action_() : name(0), title(0), desc(0), color(0), handler(0), argCount(0), confirm(false), longpress(false), lastCall(-1) {}
    };
    struct StackSlot_ { const char* name; char path[TELEPLOT_STACK_SIZE]; Time last; };
    struct Output_ {
        Print* print;
        void* udp;
        void (*begin)(void*, const char*, uint16_t);
        void (*end)(void*);
        int (*parse)(void*);
        const char* host;
        uint16_t port;
        bool prefix, open;
        uint32_t openedAt;
        size_t size;
        Output_() : print(0), udp(0), begin(0), end(0), parse(0), host(0), port(0), prefix(false), open(false), openedAt(0), size(0) {}
    };

    Output_ outputs_[TELEPLOT_MAX_OUTPUTS];
    uint8_t outputCount_;
    Stream* input_;
    Entry_ entries_[(TELEPLOT_MAX_TELEMETRIES) > 0 ? (TELEPLOT_MAX_TELEMETRIES) : 1]; // (0: none, the table keeps one unused slot)
    uint8_t entryCount_;
    Threshold_ thresholds_[(TELEPLOT_MAX_THRESHOLDS) > 0 ? (TELEPLOT_MAX_THRESHOLDS) : 1]; // (0: none, the table keeps one unused slot)
    uint8_t thresholdCount_;
    Param_ params_[(TELEPLOT_MAX_PARAMS) > 0 ? (TELEPLOT_MAX_PARAMS) : 1]; // (0: none, the table keeps one unused slot)
    uint8_t paramCount_;
    Action_ actions_[(TELEPLOT_MAX_ACTIONS) > 0 ? (TELEPLOT_MAX_ACTIONS) : 1]; // (0: none, the table keeps one unused slot)
    // Is there room in a table of max entries holding count ? (A function: a table of 0, which a sketch may ask for, makes the
    // plain comparison always true, and compilers say so)
    static bool room_(int count, int max) { return count < max; }
    uint8_t actionCount_;
    StackSlot_ stacks_[(TELEPLOT_MAX_STACKS) > 0 ? (TELEPLOT_MAX_STACKS) : 1]; // (0: none, the table keeps one unused slot)
    uint8_t stackCount_;
    char line_[TELEPLOT_LINE_SIZE];
    size_t lineLength_;
    bool lineTooLong_, enabled_, declareDue_;
    Time (*clock_)();
    uint32_t describedAt_, publishedAt_, statsEveryMs_, statsAtMs_, statsDescribedAt_;
    Stats statsBefore_;
    Stats stats_;

    void init_() {
        outputCount_ = 0; input_ = 0; entryCount_ = 0; thresholdCount_ = 0; paramCount_ = 0; actionCount_ = 0; stackCount_ = 0; lineLength_ = 0; lineTooLong_ = false;
        enabled_ = true; declareDue_ = false; clock_ = 0; describedAt_ = 0; publishedAt_ = 0; statsEveryMs_ = 0; statsAtMs_ = 0; statsDescribedAt_ = 0;
    }
    static constexpr bool disabled_() {
#ifdef TELEPLOT_DISABLE
        return true;
#else
        return false;
#endif
    }
    bool active_() const { return !disabled_() && enabled_; }

        Time now_() { return clock_ ? clock_() : now(); }

    int8_t entry_(const char* name, bool create) {
        for (uint8_t i = 0; i < entryCount_; ++i) { if (entries_[i].name == name || strcmp(entries_[i].name, name) == 0) { return static_cast<int8_t>(i); } }
        if (!create) { return -1; }
        if (!room_(entryCount_, TELEPLOT_MAX_TELEMETRIES)) { stats_.tooBig++; return -1; }
        Entry_& e = entries_[entryCount_];
        e = Entry_();
        e.name = name;
        e.min = NAN;
        e.max = NAN;
        e.shape = NO_SHAPE_;
        return static_cast<int8_t>(entryCount_++);
    }

    // ------------------------------------------------------------------ Writing lines
    void raw_(const char* s, size_t n) {
        for (uint8_t i = 0; i < outputCount_; ++i) { outputs_[i].print->write(reinterpret_cast<const uint8_t*>(s), n); outputs_[i].size += n; }
        stats_.bytes += n;
    }
    void put_(char c) { raw_(&c, 1); }
    void puts_(const char* s) { if (s) { raw_(s, strlen(s)); } }
    void lineStart_() {
        for (uint8_t i = 0; i < outputCount_; ++i) {
            Output_& o = outputs_[i];
            if (o.udp && o.open && o.size > 1200) { o.end(o.udp); o.open = false; }
            if (o.udp && !o.open) { o.begin(o.udp, o.host, o.port); o.open = true; o.openedAt = millis(); o.size = 0; }
            if (o.prefix) { o.print->write(static_cast<uint8_t>('>')); }
        }
    }
    void lineEnd_() { put_('\n'); }
    void escaped_(const char* s, const char* special) {
        static const char hex[] = "0123456789ABCDEF";
        for (; s && *s; ++s) {
            if (strchr(special, *s)) { char e[3] = { '%', hex[(*s >> 4) & 15], hex[*s & 15] }; raw_(e, 3); }
            else { put_(*s); }
        }
    }
    // A text sample: one line, no "§" (it would start a unit)
    void textValue_(const char* s) {
        for (; s && *s; ++s) {
            if (*s == '\n' || *s == '\r') { put_(' '); }
            else if (static_cast<uint8_t>(s[0]) == 0xC2 && static_cast<uint8_t>(s[1]) == 0xA7) { put_('?'); ++s; }
            else { put_(*s); }
        }
    }
    void number_(double v, bool precise) { char buffer[32]; formatNumber_(v, precise ? 15 : 9, buffer, sizeof(buffer)); puts_(buffer); } // (9 digits: any float32 exactly)
    void time_(Time t) { // ms with 3 decimals
        char buffer[24];
        uint64_t us = static_cast<uint64_t>(t.ns < 0 ? 0 : t.ns) / 1000;
        uint64_t whole = us / 1000;
        unsigned frac = static_cast<unsigned>(us % 1000);
        char* end = buffer + sizeof(buffer);
        char* at = end;
        *--at = 0;
        *--at = static_cast<char>('0' + frac % 10);
        *--at = static_cast<char>('0' + frac / 10 % 10);
        *--at = static_cast<char>('0' + frac / 100);
        *--at = '.';
        do { *--at = static_cast<char>('0' + static_cast<int>(whole % 10)); whole /= 10; } while (whole);
        puts_(at);
    }
    // name[,label]:time:  (the head of a sample line)
    template<class S> void head_(S& s) {
        lineStart_();
        puts_(s.name_);
        Entry_* e = s.entry_();
        if (e && e->label) { put_(','); puts_(e->label); }
        put_(':');
        time_(s.t_());
        put_(':');
    }
    void flags_(Entry_* e, const char* kind) {
        bool np = e && (e->flags & NP_);
        if (!kind && !np) { lineEnd_(); return; }
        put_('|');
        if (kind) { puts_(kind); }
        if (np) { puts_(kind ? ",np" : "np"); }
        lineEnd_();
    }

    // Before a sample: the descriptions it waits for, the rate it is kept at, and what is due
    template<class S> bool begin_(S& s) {
        if (!active_()) { return false; }
        tick_();
        Entry_* e = s.entry_();
        if (e) {
            if (e->dirty) { describe_(*e); }
            if (e->minGapUs) {
                uint32_t now = micros();
                if (e->sent && now - e->lastUs < e->minGapUs) { return false; }
                e->lastUs = now;
                e->sent = true;
            }
        }
        stats_.samples++;
        return true;
    }
    template<class S> void numberSample_(S& s, double v) {
        if (!begin_(s)) { return; }
        Entry_* e = s.entry_();
        head_(s);
        number_(v, e && (e->flags & PRECISE_));
        flags_(e, 0);
    }
    template<class S> void text_(S& s, const char* v) {
        if (!begin_(s)) { return; }
        Entry_* e = s.entry_();
        head_(s);
        textValue_(v);
        flags_(e, e && (e->flags & LOG_) ? "log" : e && (e->flags & STACK_) ? "stack" : "t");
    }
    template<class S> void xy_(S& s, double x, double y, double z, bool three) { // x:y[:z]:time
        if (!begin_(s)) { return; }
        Entry_* e = s.entry_();
        bool precise = e && (e->flags & PRECISE_);
        lineStart_();
        puts_(s.name_);
        if (e && e->label) { put_(','); puts_(e->label); }
        put_(':');
        number_(x, precise); put_(':'); number_(y, precise); put_(':');
        if (three) { number_(z, precise); put_(':'); }
        time_(s.t_());
        flags_(e, three ? "xyz" : "xy");
    }
    void logAt_(const char* name, const char* text, bool timed, Time t) {
        int8_t i = entry_(name, true);
        if (i >= 0) { entries_[i].flags = static_cast<uint8_t>((entries_[i].flags | LOG_) & ~STACK_); }
        Samples s(this, name, i, timed, t);
        if (i < 0) { if (!begin_(s)) { return; } head_(s); textValue_(text); flags_(0, "log"); return; }
        text_(s, text);
    }

    // name:time:item,item|enum (or |edges): a structure (doc/graph.md). The items are written as given ("," ";" "|" in them as %XX).
    void structureLine_(const char* name, Time t, const char* const* list, uint8_t count, bool edges) {
        lineStart_(); puts_(name); put_(':'); time_(t); put_(':');
        for (uint8_t i = 0; i < count; ++i) { if (i) { put_(','); } escaped_(list[i], ",;|\n\r"); }
        puts_(edges ? "|edges" : "|enum");
        lineEnd_();
    }
    template<class S> void structure_(S& s, const char* const* list, uint8_t count, bool edges) {
        if (!begin_(s)) { return; }
        structureLine_(s.name_, s.t_(), list, count, edges);
#if TELEPLOT_RESEND
        if (Entry_* e = s.entry_()) { e->structure[edges] = list; e->structureCount[edges] = count; e->structureT[edges] = s.t_(); }
#endif
    }

    // 3D|name[,label]:time:PROPERTY:values (a shape: each property is a sample of its own kind)
    template<class S> void shapeHead_(S& s, const char* property) {
        Entry_* e = s.entry_();
        lineStart_();
        puts_("3D|");
        puts_(s.name_);
        if (e && e->label) { put_(','); puts_(e->label); }
        put_(':');
        time_(s.t_());
        put_(':');
        puts_(property);
    }
    template<class S> void shapeLine_(S& s, const char* property, const char* value, const char* property2 = 0, const char* value2 = 0) {
        if (!active_()) { return; }
        if (s.index_ >= 0 && entries_[s.index_].dirty) { describe_(entries_[s.index_]); } // (descriptions before what follows them)
        Samples timed(this, s.name_, s.index_, false, Time());
        shapeHead_(timed, property);
        put_(':'); quoted_(value);
        if (property2) { put_(':'); puts_(property2); put_(':'); quoted_(value2); }
        lineEnd_();
    }
    void quoted_(const char* v) { // (a value in quotes may hold ":" and "|"; a quote inside is turned into the other one)
        put_('"');
        for (; v && *v; ++v) { put_(*v == '"' ? '\'' : (*v == '\n' || *v == '\r') ? ' ' : *v); }
        put_('"');
    }
    template<class S> void shapeNumbers_(S& s, const char* property, const double* v, uint8_t count, uint8_t latch) {
        if (!begin_(s)) { return; }
        Entry_* e = s.entry_();
        bool precise = e && (e->flags & PRECISE_);
        if (e && strcmp(property, "K") != 0 && strcmp(property, "DC") != 0) { e->flags |= SHAPE_; }
        shapeHead_(s, property);
        for (uint8_t i = 0; i < count; ++i) { put_(':'); number_(v[i], precise); }
        lineEnd_();
#if TELEPLOT_RESEND
        if (e && latch) {
            Time t = s.t_();
            float* to = latch == POS_ ? e->pos : latch == ROT_ || latch == QUAT_ ? e->rot : latch == SIZE_ ? e->size : latch == K_ ? e->k : e->dc;
            for (uint8_t i = 0; i < count; ++i) { to[i] = static_cast<float>(v[i]); }
            if (latch == POS_) { e->posT = t; }
            if (latch == ROT_ || latch == QUAT_) { e->rotT = t; e->latched &= static_cast<uint8_t>(~(ROT_ | QUAT_)); }
            if (latch == SIZE_) { e->sizeT = t; e->sizeCount = count; }
            if (latch == K_) { e->kT = t; }
            if (latch == DC_) { e->dcT = t; }
            e->latched |= latch;
        }
#else
        (void)latch;
#endif
    }
    template<class S> void shapeText_(S& s, const char* property, const char* kind, const char* value) {
        if (!begin_(s)) { return; }
        Entry_* e = s.entry_();
        if (e) { e->flags |= SHAPE_; }
        shapeHead_(s, property);
        if (kind) { put_(':'); puts_(kind); }
        put_(':');
        quoted_(value);
        lineEnd_();
    }
    template<class S> void color_(S& s, const char* c, bool copied) {
        Entry_* e = s.entry_();
        if (!(e && (e->flags & SHAPE_)) && !copied) { if (e) { e->color = c; e->dirty = true; } return; } // not a shape (yet): the color of the telemetry
        if (!(e && (e->flags & SHAPE_))) { if (!begin_(s)) { return; } lineStart_(); puts_("ATTR|"); puts_(s.name_); puts_("|color="); escaped_(c, "%|,=:\n\r"); lineEnd_(); return; } // (an Rgb has no string that lives)
        if (!begin_(s)) { return; }
        shapeHead_(s, "C");
        put_(':');
        puts_(c);
        lineEnd_();
#if TELEPLOT_RESEND
        if (!copied) { e->fill = c; e->fillT = s.t_(); e->latched |= FILL_; }
#endif
    }
    template<class S> void threshold_(S& s, const char* name, ThresholdSide side, double value, const char* color) {
        if (!begin_(s)) { return; }
        lineStart_();
        puts_("TH|");
        puts_(s.name_);
        put_(':');
        Time t = s.t_();
        time_(t);
        put_(':');
        escaped_(name, "%:;|<>,");
        put_(side == Above ? '>' : '<');
        if (!isnan(value)) { number_(value, true); }
        if (color && *color) { put_(','); escaped_(color, "%:;|<>,"); }
        lineEnd_();
#if TELEPLOT_RESEND
        Threshold_* th = 0;
        for (uint8_t i = 0; i < thresholdCount_; ++i) { if (thresholds_[i].entry == s.index_ && strcmp(thresholds_[i].name, name) == 0) { th = &thresholds_[i]; } }
        if (!th && s.index_ >= 0 && room_(thresholdCount_, TELEPLOT_MAX_THRESHOLDS)) { th = &thresholds_[thresholdCount_++]; }
        if (th) { th->entry = s.index_; th->name = name; th->side = side; th->value = static_cast<float>(value); th->color = color; th->t = t; }
#endif
    }
    template<class S, class P> void points_(S& s, const P* p, size_t n) {
        if (!begin_(s)) { return; }
        shapeHead_(s, "PT");
        for (size_t i = 0; i < n; ++i) { put_(':'); number_(p[i].x, false); put_(':'); number_(p[i].y, false); put_(':'); number_(z_(p[i]), false); }
        lineEnd_();
    }
    static double z_(Number2D const&) { return 0; }
    static double z_(Number3D const& p) { return p.z; }
    template<class S> void cloud_(S& s, const Number3D* p, size_t n, const float* intensities, const Rgb* colors) { // name:time;x:y:z[:i][:r:g:b];...|pc
        if (!begin_(s)) { return; }
        Entry_* e = s.entry_();
        lineStart_();
        puts_(s.name_);
        if (e && e->label) { put_(','); puts_(e->label); }
        put_(':');
        time_(s.t_());
        for (size_t i = 0; i < n; ++i) {
            put_(';'); number_(p[i].x, false); put_(':'); number_(p[i].y, false); put_(':'); number_(p[i].z, false);
            if (intensities) { put_(':'); number_(intensities[i], false); }
            if (colors) { put_(':'); number_(colors[i].r, false); put_(':'); number_(colors[i].g, false); put_(':'); number_(colors[i].b, false); }
        }
        flags_(e, "pc");
    }
    template<class S> void image_(S& s, ImageType type, const uint8_t* bytes, size_t size) { // JPG|name[,label]:time:i/n:base64, parts of 768 bytes
        if (!begin_(s)) { return; }
        Entry_* e = s.entry_();
        const size_t part = 768;
        size_t count = size == 0 ? 1 : (size + part - 1) / part;
        Time t = s.t_();
        for (size_t i = 0; i < count; ++i) {
            lineStart_();
            puts_(type == Png ? "PNG|" : type == Raw ? "RAW|" : "JPG|");
            puts_(s.name_);
            if (e && e->label) { put_(','); puts_(e->label); }
            put_(':');
            time_(t);
            put_(':');
            char index[24];
            formatNumber_(static_cast<double>(i + 1), 7, index, sizeof(index)); puts_(index); put_('/');
            formatNumber_(static_cast<double>(count), 7, index, sizeof(index)); puts_(index); put_(':');
            size_t from = i * part, to = from + part < size ? from + part : size;
            base64_(bytes + from, to - from);
            lineEnd_();
        }
    }
    void base64_(const uint8_t* p, size_t n) {
        static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        for (size_t i = 0; i < n; i += 3) {
            uint32_t v = static_cast<uint32_t>(p[i]) << 16 | (i + 1 < n ? static_cast<uint32_t>(p[i + 1]) << 8 : 0) | (i + 2 < n ? p[i + 2] : 0);
            char out[4] = { table[(v >> 18) & 63], table[(v >> 12) & 63], i + 1 < n ? table[(v >> 6) & 63] : '=', i + 2 < n ? table[v & 63] : '=' };
            raw_(out, 4);
        }
    }

    // ------------------------------------------------------------------ Descriptions
    void describe_(Entry_& e) {
        e.dirty = false;
        if (!e.unit && !e.desc && !e.color && !(e.flags & (HAS_MIN_ | HAS_MAX_)) && !e.pixels) { return; }
        lineStart_();
        puts_("ATTR|");
        puts_(e.name);
        if (e.unit) { puts_("|unit="); escaped_(e.unit, "%|,=:\n\r"); }
        if (e.desc) { puts_("|desc="); escaped_(e.desc, "%|,=:\n\r"); }
        if (e.color) { puts_("|color="); escaped_(e.color, "%|,=:\n\r"); }
        if (e.flags & HAS_MIN_) { puts_("|min="); number_(e.min, true); }
        if (e.flags & HAS_MAX_) { puts_("|max="); number_(e.max, true); }
        if (e.pixels) {
            puts_("|scale="); number_(e.pixelScale, true);
            puts_("|nodata="); if (!isnan(e.pixelNoData)) { number_(e.pixelNoData, true); }
            puts_(e.pixels == 1 ? "|depth=1" : "|depth=0");
        }
        lineEnd_();
    }
    // The stats as lines, when it is time (sendStats)
    void statsDue_(uint32_t now) {
        if (!statsEveryMs_ || now - statsAtMs_ < statsEveryMs_) { return; }
        float seconds = (now - statsAtMs_) / 1000.0f;
        Stats before = statsBefore_;
        statsBefore_ = stats_;
        statsAtMs_ = now;
        if (statsDescribedAt_ == 0 || now - statsDescribedAt_ >= 5000) {
            statsDescribedAt_ = now ? now : 1;
            const char* const descriptions[] = { "ATTR|teleplot.samples|unit=/s|desc=Samples sent per second", "ATTR|teleplot.bytes|unit=B/s|desc=Bytes written per second",
                "ATTR|teleplot.tooBig|desc=Lines too long or cut%2C descriptions that did not fit%2C since the start", "ATTR|teleplot.dropped|desc=Lines from the page too long to be read%2C since the start" };
            for (uint8_t i = 0; i < 4; ++i) { lineStart_(); puts_(descriptions[i]); lineEnd_(); }
        }
        statLine_("teleplot.samples", "teleplot sent", (statsBefore_.samples - before.samples) / seconds);
        statLine_("teleplot.bytes", "teleplot sent", (statsBefore_.bytes - before.bytes) / seconds);
        statLine_("teleplot.tooBig", "teleplot problems", statsBefore_.tooBig);
        statLine_("teleplot.dropped", "teleplot problems", statsBefore_.dropped);
    }
    void statLine_(const char* name, const char* label, double value) {
        lineStart_(); puts_(name); put_(','); puts_(label); put_(':'); time_(now_()); put_(':'); number_(value, false); lineEnd_();
        stats_.samples++;
    }

    // Every 5 s: descriptions, settings and actions again (a page opened later gets them), and what was sent once
    void tick_() {
        uint32_t now = millis();
        statsDue_(now);
        for (uint8_t i = 0; i < outputCount_; ++i) { Output_& o = outputs_[i]; if (o.udp && o.open && now - o.openedAt >= 20) { o.end(o.udp); o.open = false; } }
        if (!declareDue_ && now - describedAt_ < 5000) { return; }
        describedAt_ = now;
        declareDue_ = false;
        for (uint8_t i = 0; i < entryCount_; ++i) {
            Entry_& e = entries_[i];
            describe_(e);
            Samples s(this, e.name, static_cast<int8_t>(i), false, Time());
            if (e.shape != NO_SHAPE_) {
                if (e.shape == Stl && e.url) { shapeLine_(s, "S", "stl", "U", e.url); }
                else { shapeLine_(s, "S", shapeName_(e.shape)); }
            }
            if (e.frame) { shapeLine_(s, (e.flags & PIXELS_) ? "FPX" : "F", e.frame); }
#if TELEPLOT_RESEND
            uint8_t latched = e.latched;
            if (latched & POS_) { again_(e, i, e.posT, "P", e.pos, 3); }
            if (latched & ROT_) { again_(e, i, e.rotT, "R", e.rot, 3); }
            if (latched & QUAT_) { again_(e, i, e.rotT, "Q", e.rot, 4); }
            if (latched & SIZE_) { again_(e, i, e.sizeT, "SC", e.size, e.sizeCount); }
            if (latched & K_) { again_(e, i, e.kT, "K", e.k, 6); }
            if (latched & DC_) { again_(e, i, e.dcT, "DC", e.dc, 5); }
            if (latched & FILL_) { Samples f(this, e.name, static_cast<int8_t>(i), true, e.fillT); shapeHead_(f, "C"); put_(':'); puts_(e.fill); lineEnd_(); }
            for (uint8_t k = 0; k < 2; ++k) { if (e.structure[k]) { structureLine_(e.name, e.structureT[k], e.structure[k], e.structureCount[k], k == 1); } }
#endif
        }
#if TELEPLOT_RESEND
        for (uint8_t i = 0; i < thresholdCount_; ++i) {
            Threshold_& th = thresholds_[i];
            lineStart_(); puts_("TH|"); puts_(entries_[th.entry].name); put_(':'); time_(th.t); put_(':');
            escaped_(th.name, "%:;|<>,"); put_(th.side == Above ? '>' : '<');
            if (!isnan(th.value)) { number_(th.value, true); }
            if (th.color && *th.color) { put_(','); escaped_(th.color, "%:;|<>,"); }
            lineEnd_();
        }
#endif
        for (uint8_t i = 0; i < paramCount_; ++i) { declare_(params_[i]); }
        for (uint8_t i = 0; i < actionCount_; ++i) { declare_(actions_[i]); }
    }
#if TELEPLOT_RESEND
    void again_(Entry_& e, uint8_t index, Time t, const char* property, const float* v, uint8_t count) {
        Samples s(this, e.name, static_cast<int8_t>(index), true, t);
        shapeHead_(s, property);
        for (uint8_t i = 0; i < count; ++i) { put_(':'); number_(v[i], false); }
        lineEnd_();
    }
#endif
    static const char* shapeName_(uint8_t type) {
        switch (type) {
            case Sphere: return "sphere"; case Cylinder: return "cylinder"; case Rect: return "rect"; case Circle: return "circle";
            case Line: return "line"; case Polygon: return "polygon"; case Arrow: return "arrow"; case Text: return "text"; case Stl: return "stl";
            default: return "cube";
        }
    }

    // ------------------------------------------------------------------ Stacks (one thread: one path per stack name)
    int8_t stackSlot_(const char* name) {
        for (uint8_t i = 0; i < stackCount_; ++i) { if (strcmp(stacks_[i].name, name) == 0) { return static_cast<int8_t>(i); } }
        if (!room_(stackCount_, TELEPLOT_MAX_STACKS)) { stats_.tooBig++; return -1; }
        stacks_[stackCount_].name = name;
        stacks_[stackCount_].path[0] = 0;
        stacks_[stackCount_].last = Time(INT64_MIN / 2);
        int8_t e = entry_(name, true);
        if (e >= 0) { entries_[e].flags = static_cast<uint8_t>((entries_[e].flags | STACK_) & ~LOG_); }
        return static_cast<int8_t>(stackCount_++);
    }
    void sendStack_(int8_t slot, bool timed, Time t) {
        const char* name = stacks_[slot].name;
        if (!timed) { // At least 1 µs after its previous one: samples of a stack with the same time are parts of one for the page (doc/graph.md)
            t = now_();
            if (t.ns < stacks_[slot].last.ns + 1000) { t.ns = stacks_[slot].last.ns + 1000; }
            timed = true;
        }
        stacks_[slot].last = t;
        Samples s(this, name, entry_(name, false), timed, t);
        text_(s, stacks_[slot].path);
    }
    int8_t stackPush_(const char* name, const char* level, size_t& before) {
        if (!active_()) { return -1; }
        int8_t slot = stackSlot_(name);
        if (slot < 0) { return -1; }
        char* path = stacks_[slot].path;
        before = strlen(path);
        size_t room = sizeof(stacks_[slot].path) - 1 - before;
        if (before && room) { strcat(path, "/"); room--; }
        strncat(path, level, room);
        sendStack_(slot, false, Time());
        return slot;
    }
    void stackPop_(int8_t slot, size_t before) {
        stacks_[slot].path[before < sizeof(stacks_[slot].path) ? before : 0] = 0;
        sendStack_(slot, false, Time());
    }
    void stackAt_(const char* name, const char* path, bool timed, Time t) {
        if (!active_()) { return; }
        int8_t slot = stackSlot_(name);
        if (slot < 0) { return; }
        strncpy(stacks_[slot].path, path, sizeof(stacks_[slot].path) - 1);
        stacks_[slot].path[sizeof(stacks_[slot].path) - 1] = 0;
        sendStack_(slot, timed, t);
    }

    // ------------------------------------------------------------------ Commands
    static uint8_t writeType_(bool*) { return 2; }
    static uint8_t writeType_(Number2D*) { return 4; }
    static uint8_t writeType_(Number3D*) { return 5; }
    static uint8_t writeType_(Pose2D*) { return 6; }
    template<class T> static uint8_t writeType_(T*) { return 1; }
    static const char* typeName_(uint8_t type) {
        switch (type) { case 2: return "bool"; case 3: return "text"; case 4: return "xy"; case 5: return "xyz"; case 6: return "pose2d"; default: return "number"; }
    }

    template<class T> struct Trampoline_ {
        // A number (and bool)
        static bool write(Param_& p, const char* text, char* why) {
            char* end;
            double v = strtod(text, &end);
            if (end == text) { strcpy(why, "a number"); return false; }
            T value = static_cast<T>(writeType_(static_cast<T*>(0)) == 2 ? (v != 0) : p.clamp(v));
            if (!isFloat_(static_cast<T*>(0)) && writeType_(static_cast<T*>(0)) == 1) { value = static_cast<T>(floor(p.clamp(v) + 0.5)); }
            return apply_(p, value, why);
        }
        static void publish(Teleplot& tp, Param_& p) { tp.update(p.name, *static_cast<T*>(p.variable)); }
        static void rest(void* v) { if (writeType_(static_cast<T*>(0)) == 1) { *static_cast<T*>(v) = 0; } }
        static bool apply_(Param_& p, T const& value, char* why) {
            if (p.onChange) {
                Result r = reinterpret_cast<Result (*)(T const&)>(p.onChange)(value);
                if (r.status == 1) { strncpy(why, r.text[0] ? r.text : "refused", 39); return false; }
            }
            *static_cast<T*>(p.variable) = value;
            return true;
        }
    };
    static bool isFloat_(float*) { return true; }
    static bool isFloat_(double*) { return true; }
    template<class T> static bool isFloat_(T*) { return false; }

    Param_* newParam_(const char* name, void* variable, uint8_t type, bool (*write)(Param_&, const char*, char*), void (*publish)(Teleplot&, Param_&), void (*rest)(void*)) {
        if (!room_(paramCount_, TELEPLOT_MAX_PARAMS)) { stats_.tooBig++; return 0; }
        Param_& p = params_[paramCount_++];
        p = Param_();
        p.name = name; p.variable = variable; p.type = type; p.write = write; p.publish = publish; p.rest = rest;
        p.min = NAN; p.max = NAN; p.step = NAN;
        declareDue_ = true;
        return &p;
    }
    void publish_(Param_& p) { p.publish(*this, p); }
    void declare_(Param_& p) {
        lineStart_();
        puts_("ATTR|"); puts_(p.name); puts_("|write="); puts_(typeName_(p.type));
        if (!isnan(p.min)) { puts_("|min="); number_(p.min, true); }
        if (!isnan(p.max)) { puts_("|max="); number_(p.max, true); }
        if (!isnan(p.step)) { puts_("|step="); number_(p.step, true); }
        if (p.rate) { puts_("|rate="); number_(p.rate, false); }
        if (p.hold) { puts_("|hold="); number_(p.hold, false); }
        if (p.axes) { puts_("|axes="); bool first = true; const char* names[3] = { "x", "y", "yaw" }; for (int i = 0; i < 3; ++i) { if (p.axes & (1 << i)) { if (!first) { put_(','); } puts_(names[i]); first = false; } } }
        if (p.unit) { puts_("|unit="); escaped_(p.unit, "%|,=:\n\r"); }
        if (p.desc) { puts_("|desc="); escaped_(p.desc, "%|,=:\n\r"); }
        lineEnd_();
        if (p.count) { // The texts it can take: its enum, with the time of its first declaration (sent again, it is the same sample)
            if (p.choicesT.ns == 0) { p.choicesT = now_(); if (p.choicesT.ns == 0) { p.choicesT.ns = 1; } }
            structureLine_(p.name, p.choicesT, p.choices, p.count, false);
        }
    }
    void declare_(Action_& a) {
        lineStart_();
        puts_("ATTR|"); puts_(a.name); puts_("|action");
        if (a.title) { puts_("|title="); escaped_(a.title, "%|,=:\n\r"); }
        if (a.desc) { puts_("|desc="); escaped_(a.desc, "%|,=:\n\r"); }
        if (a.color) { puts_("|color="); escaped_(a.color, "%|,=:\n\r"); }
        if (a.confirm) { puts_("|confirm"); }
        if (a.longpress) { puts_("|longpress"); }
        lineEnd_();
        for (uint8_t i = 0; i < a.argCount; ++i) {
            Arg const& g = a.args[i];
            lineStart_();
            puts_("ATTR|"); puts_(a.name); puts_("|arg="); escaped_(g.name_, "%|,=:\n\r"); puts_("|type="); puts_(typeName_(g.type_));
            if (g.optional_) { puts_("|optional"); }
            if (g.default_[0]) { puts_("|default="); escaped_(g.default_, "%|,=:\n\r"); }
            if (!isnan(g.min_)) { puts_("|min="); number_(g.min_, true); }
            if (!isnan(g.max_)) { puts_("|max="); number_(g.max_, true); }
            if (!isnan(g.step_)) { puts_("|step="); number_(g.step_, true); }
            if (g.unit_) { puts_("|unit="); escaped_(g.unit_, "%|,=:\n\r"); }
            if (g.desc_) { puts_("|desc="); escaped_(g.desc_, "%|,=:\n\r"); }
            if (g.count_) { puts_("|enum="); for (uint8_t c = 0; c < g.count_; ++c) { if (c) { put_(','); } escaped_(g.choices_[c], "%|,=:\n\r"); } }
            lineEnd_();
        }
    }
    void answer_(const char* name, long id, const char* status, const char* text) {
        lineStart_();
        puts_("ACK|"); puts_(name); put_('#');
        char number[24]; formatNumber_(static_cast<double>(id), 15, number, sizeof(number)); puts_(number);
        put_(':'); puts_(status);
        if (text && *text) { put_(':'); escaped_(text, "%\n\r"); }
        lineEnd_();
    }
    void handleCall_(char* call) { // name#id:arg=value:...
        char* hash = strchr(call, '#');
        if (!hash) { return; }
        *hash = 0;
        char* fields = strchr(hash + 1, ':');
        long id = strtol(hash + 1, 0, 10);
        Action_* a = 0;
        for (uint8_t i = 0; i < actionCount_; ++i) { if (strcmp(actions_[i].name, call) == 0) { a = &actions_[i]; } }
        if (!a) { answer_(call, id, "err", "unknown action"); return; }
        if (a->lastCall == id) { answer_(call, id, a->last.status ? "err" : "ok", a->last.text); return; } // sent again: answered again, not run twice
        Args args(fields ? fields : "");
        for (uint8_t i = 0; i < a->argCount; ++i) {
            if (!a->args[i].optional_ && !args.has(a->args[i].name_)) { char why[48] = "missing "; strncat(why, a->args[i].name_, 39); answer_(call, id, "err", why); return; }
        }
        answer_(call, id, "run", 0);
        Result r = a->handler ? a->handler(args) : ok();
        a->lastCall = id;
        a->last = r;
        answer_(call, id, r.status ? "err" : "ok", r.text);
    }
    void readLines_() {
        while (input_->available() > 0) {
            int c = input_->read();
            if (c < 0) { break; }
            if (c == '\n') { line_[lineLength_] = 0; if (!lineTooLong_) { handleLine(line_); } lineLength_ = 0; lineTooLong_ = false; continue; }
            if (lineLength_ < sizeof(line_) - 1) { line_[lineLength_++] = static_cast<char>(c); }
            else if (!lineTooLong_) { lineTooLong_ = true; stats_.dropped++; } // (a line longer than TELEPLOT_LINE_SIZE: ignored)
        }
    }
    // Is a value the text of a choice ("manual%2C slow#by hand" is "manual, slow")? Its kind (after the last #) is not part of it.
    static bool choiceIs_(const char* item, const char* value) {
        const char* end = strrchr(item, '#');
        if (!end) { end = item + strlen(item); }
        while (item < end) {
            char c = *item;
            if (c == '%' && end - item > 2 && isxdigit(static_cast<unsigned char>(item[1])) && isxdigit(static_cast<unsigned char>(item[2]))) {
                char hex[3] = { item[1], item[2], 0 };
                c = static_cast<char>(strtol(hex, 0, 16));
                item += 3;
            }
            else { item++; }
            if (*value++ != c) { return false; }
        }
        return *value == 0;
    }
    static void unescape_(char* s) { // "%3A" -> ":"
        char* out = s;
        for (char* in = s; *in; ++in) {
            if (in[0] == '%' && isxdigit(static_cast<unsigned char>(in[1])) && isxdigit(static_cast<unsigned char>(in[2]))) { char hex[3] = { in[1], in[2], 0 }; *out++ = static_cast<char>(strtol(hex, 0, 16)); in += 2; }
            else { *out++ = *in; }
        }
        *out = 0;
    }
    static void hex_(Rgb c, char* out) {
        static const char hex[] = "0123456789abcdef";
        out[0] = '#'; out[1] = hex[c.r >> 4]; out[2] = hex[c.r & 15]; out[3] = hex[c.g >> 4]; out[4] = hex[c.g & 15]; out[5] = hex[c.b >> 4]; out[6] = hex[c.b & 15]; out[7] = 0;
    }

    // A number with "digits" significant digits, the shortest way (no printf: AVR has none for floats)
    static void formatNumber_(double v, int digits, char* out, size_t size) {
        if (size < 24) { if (size) { out[0] = 0; } return; }
        if (isnan(v)) { strcpy(out, "nan"); return; }
        if (isinf(v)) { strcpy(out, v > 0 ? "inf" : "-inf"); return; }
        char* at = out;
        if (v < 0) { *at++ = '-'; v = -v; }
        if (v == 0) { *at++ = '0'; *at = 0; return; }
        if (digits > 17) { digits = 17; }
        int exponent = static_cast<int>(floor(log10(v)));
        double scaled = v / pow(10.0, exponent - digits + 1);
        uint64_t mantissa = static_cast<uint64_t>(scaled + 0.5);
        uint64_t limit = 1;
        for (int i = 0; i < digits; ++i) { limit *= 10; }
        if (mantissa >= limit) { mantissa /= 10; exponent++; }
        char m[20];
        for (int i = digits - 1; i >= 0; --i) { m[i] = static_cast<char>('0' + static_cast<int>(mantissa % 10)); mantissa /= 10; }
        int used = digits;
        while (used > 1 && m[used - 1] == '0') { used--; }
        if (exponent >= -5 && exponent < digits) {
            if (exponent < 0) {
                *at++ = '0'; *at++ = '.';
                for (int i = -1; i > exponent; --i) { *at++ = '0'; }
                for (int i = 0; i < used; ++i) { *at++ = m[i]; }
            }
            else {
                for (int i = 0; i <= exponent; ++i) { *at++ = i < used ? m[i] : '0'; }
                if (used > exponent + 1) { *at++ = '.'; for (int i = exponent + 1; i < used; ++i) { *at++ = m[i]; } }
            }
        }
        else {
            *at++ = m[0];
            if (used > 1) { *at++ = '.'; for (int i = 1; i < used; ++i) { *at++ = m[i]; } }
            *at++ = 'e';
            if (exponent < 0) { *at++ = '-'; exponent = -exponent; }
            char e[6]; int n = 0;
            do { e[n++] = static_cast<char>('0' + exponent % 10); exponent /= 10; } while (exponent);
            while (n) { *at++ = e[--n]; }
        }
        *at = 0;
    }
};

// A text setting: char[N]
template<size_t N> struct Teleplot::Trampoline_<char[N]> {
    static bool write(Param_& p, const char* text, char* why) {
        char value[N];
        strncpy(value, text, N - 1);
        value[N - 1] = 0;
        unescape_(value);
        if (p.count) {
            bool known = false;
            for (uint8_t i = 0; i < p.count; ++i) { if (choiceIs_(p.choices[i], value)) { known = true; } }
            if (!known) { strcpy(why, "one of the choices"); return false; }
        }
        if (p.onChange) {
            typedef char Text[N];
            Result r = reinterpret_cast<Result (*)(Text const&)>(p.onChange)(value);
            if (r.status == 1) { strncpy(why, r.text[0] ? r.text : "refused", 39); return false; }
        }
        memcpy(p.variable, value, N);
        return true;
    }
    static void publish(Teleplot& tp, Param_& p) { tp.update(p.name, static_cast<const char*>(p.variable)); }
    static void rest(void*) {}
};
// xy, xyz, pose2d settings
#define TELEPLOT_POINT_PARAM_(T, COUNT, CLAMP_LAST)                                                                                  \
template<> struct Teleplot::Trampoline_<Teleplot::T> {                                                                               \
    static bool write(Param_& p, const char* text, char* why) {                                                                      \
        double v[3] = { 0, 0, 0 };                                                                                                    \
        const char* at = text;                                                                                                        \
        for (int i = 0; i < COUNT; ++i) {                                                                                             \
            char* end; v[i] = strtod(at, &end);                                                                                       \
            if (end == at) { strcpy(why, #COUNT " numbers"); return false; }                                                          \
            at = *end == ':' ? end + 1 : end;                                                                                         \
        }                                                                                                                             \
        Teleplot::T value; double* fields[3] = { &value.x, &value.y, 0 }; (void)fields;                                               \
        value.x = p.clamp(v[0]); value.y = p.clamp(v[1]);                                                                             \
        setLast_(value, CLAMP_LAST ? p.clamp(v[2]) : v[2]);                                                                           \
        if (p.onChange) {                                                                                                             \
            Result r = reinterpret_cast<Result (*)(Teleplot::T const&)>(p.onChange)(value);                                          \
            if (r.status == 1) { strncpy(why, r.text[0] ? r.text : "refused", 39); return false; }                                    \
        }                                                                                                                             \
        *static_cast<Teleplot::T*>(p.variable) = value;                                                                               \
        return true;                                                                                                                  \
    }                                                                                                                                 \
    static void publish(Teleplot& tp, Param_& p) { tp.update(p.name, *static_cast<Teleplot::T*>(p.variable)); }                      \
    static void rest(void* v) { *static_cast<Teleplot::T*>(v) = Teleplot::T(); }                                                     \
    static void setLast_(Teleplot::Number2D&, double) {}                                                                              \
    static void setLast_(Teleplot::Number3D& t, double v) { t.z = v; }                                                                \
    static void setLast_(Teleplot::Pose2D& t, double v) { t.yaw = v; }                                                                \
};
TELEPLOT_POINT_PARAM_(Number2D, 2, false)
TELEPLOT_POINT_PARAM_(Number3D, 3, true)
TELEPLOT_POINT_PARAM_(Pose2D, 3, false)
#undef TELEPLOT_POINT_PARAM_

#endif
