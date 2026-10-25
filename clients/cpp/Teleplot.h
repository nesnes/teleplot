// Teleplot client for C++ (computers: Linux, macOS, Windows): telemetry in the binary protocol over UDP, and commands from the page.
// Source: https://github.com/nesnes/teleplot. One header, C++17, no dependency.
//
//     #include "Teleplot.h"
//     Teleplot::instance().update("battery", 12.4);                       // 127.0.0.1:47269, sent every 20 ms
//     Teleplot& tp = Teleplot::instance();
//     tp.telemetry("battery").unit("V").range(10.5, 12.6);                // described once
//     tp.telemetry("robot").shape(Teleplot::Cube).size(0.4, 0.3, 0.2);    // a shape...
//     tp.telemetry("robot").position(x, y).yaw(theta);                    // ...that moves (one chain: one time)
//
// API and samples: doc/cpp-client-api.md. Protocol: doc/binaryProtocol.md. Commands: doc/telecmd.md.
//
// #define TELEPLOT_DISABLE        before including: every call does nothing (production builds)
// #define TELEPLOT_SINGLE_THREAD  before including: no lock (a program that uses its Teleplot from one thread only)

#ifndef CPP_TELEPLOT_H
#define CPP_TELEPLOT_H

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstddef>
#include <cerrno>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <functional>
#include <initializer_list>
#include <limits>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <thread>
#include <type_traits>
#include <typeindex>
#include <unordered_map>
#include <utility>
#include <variant>
#include <vector>

#ifdef _WIN32
    #ifndef WIN32_LEAN_AND_MEAN
        #define WIN32_LEAN_AND_MEAN
    #endif
    #ifndef NOMINMAX
        #define NOMINMAX
    #endif
    #include <winsock2.h>
    #include <ws2tcpip.h>
    #include <windows.h>
    #ifdef _MSC_VER
        #pragma comment(lib, "ws2_32.lib") // (MinGW: link with -lws2_32)
    #endif
#else
    #include <arpa/inet.h>
    #include <fcntl.h>
    #include <netinet/in.h>
    #include <pthread.h>
    #include <sched.h>
    #include <sys/resource.h>
    #include <sys/socket.h>
    #include <unistd.h>
    #if defined(__linux__)
        #include <sys/syscall.h>
    #endif
    #if defined(__APPLE__)
        #include <pthread/qos.h>
    #endif
#endif

// (Plain types, outside the class: a nested struct with default values cannot be a default argument inside its enclosing class)
namespace teleplot_types {
    struct Number2D { double x = 0, y = 0; };
    struct Number3D { double x = 0, y = 0, z = 0; };
    struct Pose2D { double x = 0, y = 0, yaw = 0; }; // yaw in radians
    struct Rgb { std::uint8_t r = 0, g = 0, b = 0; };

    // A time: nanoseconds since 1970 (or since whatever the clock counts from). From any std::chrono duration or time point.
    struct Time {
        std::int64_t ns = 0;
        constexpr Time() = default;
        template<class R, class P> constexpr Time(std::chrono::duration<R, P> d) : ns(static_cast<std::int64_t>(std::chrono::duration_cast<std::chrono::duration<double, std::nano>>(d).count())) {}
        template<class C, class D> constexpr Time(std::chrono::time_point<C, D> t) : Time(t.time_since_epoch()) {}
    };

    // What a handler answers: ok (with a short result), an error (why), or running (finish it later with answer())
    struct Result { std::uint8_t status = 0; std::string text; };

    struct Stats {
        std::uint64_t packets = 0, bytes = 0, samples = 0;
        std::uint64_t dropped = 0;     // samples dropped: queue full (maxQueuedBytes), or lock busy for a nonBlocking telemetry
        std::uint64_t tooBig = 0;      // texts cut to fit a packet, dashboard lines that could not
        std::uint64_t sendErrors = 0;  // socket or file errors
        std::uint64_t wrongThread = 0; // samples of a oneThread() stack from another thread (dropped)
        std::uint64_t priorityRefused = 0; // the system refused the priority asked for a thread of Teleplot (it kept its own)
    };

}

class Teleplot
{
    struct Entry_;
    struct ParamBase_;
    template<class T> struct ParamImpl_;
    struct ActionImpl_;
    class Lock_;

public:
    // ------------------------------------------------------------------ Types
    using Number2D = teleplot_types::Number2D;
    using Number3D = teleplot_types::Number3D;
    using Pose2D = teleplot_types::Pose2D;
    using Rgb = teleplot_types::Rgb;
    using Time = teleplot_types::Time;
    static constexpr Time ms(double v) { return Time(std::chrono::duration<double, std::milli>(v)); }
    static constexpr Time us(double v) { return Time(std::chrono::duration<double, std::micro>(v)); }
    static constexpr Time ns(std::int64_t v) { return Time(std::chrono::nanoseconds(v)); }
    static Time now() { return Time(std::chrono::system_clock::now()); }
    static constexpr double deg(double degrees) { return degrees * 3.14159265358979323846 / 180.0; } // degrees to radians

    enum ShapeType : std::uint8_t { Cube = 0, Sphere = 1, Cylinder = 2, Rect = 3, Circle = 4, Line = 5, Polygon = 6, Arrow = 7, Text = 8, Stl = 10 };
    enum ImageType : std::uint8_t { Jpeg = 0, Png = 1, Raw = 2 }; // Raw: plain numbers (a depth map), see TeleplotImage::Raw
    enum ThresholdSide : std::uint8_t { Below = 0, Above = 1 };
    enum SendFrom : std::uint8_t { Caller = 0, Thread = 1 };
    enum Axis : std::uint8_t { X = 1, Y = 2, Yaw = 4 };

    using Result = teleplot_types::Result;
    static Result ok(std::string text = "") { return { 0, std::move(text) }; }
    static Result error(std::string why) { return { 1, std::move(why) }; }
    static Result running() { return { 2, "" }; }

    using Stats = teleplot_types::Stats;

    // The threads Teleplot starts (the sending thread of sendFrom(Thread), the encoding thread of TeleplotImage.h): their priority and
    // their CPUs, in Options or at run time. See doc/cpp-client-api.md "Threads of Teleplot".
    enum PriorityKind : std::uint8_t { BelowCaller = 0, Normal = 1, Low = 2, Realtime = 3, PriorityValue = 4 };
    class ThreadPriority {
    public:
        ThreadPriority(PriorityKind kind = BelowCaller) : kind_(kind) {}
        static ThreadPriority belowCaller() { return BelowCaller; } // one step under the thread that asked for the work (default)
        static ThreadPriority normal() { return Normal; }           // the default priority of the system
        static ThreadPriority low() { return Low; }                 // under normal threads (what is sent may then lag)
        // A real-time priority (POSIX SCHED_FIFO, or SCHED_RR): Linux 1 to 99, macOS its own range. Windows: refused.
        static ThreadPriority realtime(int priority, bool roundRobin = false) { ThreadPriority p(Realtime); p.number_ = priority; p.roundRobin_ = roundRobin; return p; }
        // The system's own number for a normal thread, given as is: Linux its nice (-20 to 19), Windows its level (THREAD_PRIORITY_*,
        // -15 to 15), macOS its relative priority in the default QoS class (-15 to 0)
        static ThreadPriority value(int number) { ThreadPriority p(PriorityValue); p.number_ = number; return p; }
        PriorityKind kind() const { return kind_; }
        int number() const { return number_; }
        bool roundRobin() const { return roundRobin_; }
        bool operator==(ThreadPriority const& o) const { return kind_ == o.kind_ && number_ == o.number_ && roundRobin_ == o.roundRobin_; }
        bool operator!=(ThreadPriority const& o) const { return !(*this == o); }
    private:
        PriorityKind kind_;
        int number_ = 0;
        bool roundRobin_ = false;
    };
    class ThreadAffinity {
    public:
        enum Kind : std::uint8_t { Automatic, FollowCaller, Any, Cpus };
        static ThreadAffinity automatic() { return ThreadAffinity(Automatic); }       // the caller's CPUs with BelowCaller, any otherwise (default)
        static ThreadAffinity followCaller() { return ThreadAffinity(FollowCaller); } // the CPUs of the thread that asked for the work
        static ThreadAffinity any() { return ThreadAffinity(Any); }                   // the CPUs of the process
        static ThreadAffinity cpus(std::vector<int> list) { ThreadAffinity a(Cpus); a.cpus_ = std::move(list); return a; } // these CPUs (Windows: of the current group). macOS: refused
        Kind kind() const { return kind_; }
        std::vector<int> const& list() const { return cpus_; }
        bool operator==(ThreadAffinity const& o) const { return kind_ == o.kind_ && cpus_ == o.cpus_; }
        bool operator!=(ThreadAffinity const& o) const { return !(*this == o); }
        ThreadAffinity() = default;
    private:
        explicit ThreadAffinity(Kind kind) : kind_(kind) {}
        Kind kind_ = Automatic;
        std::vector<int> cpus_;
    };

    // How a thread is scheduled: taken from one thread (the caller), given to another as a ThreadPriority and a ThreadAffinity say.
    //   BelowCaller: Linux the caller's policy (real-time: priority - 1), nice + 1 otherwise; macOS its QoS class, relative priority - 1;
    //   Windows its level - 1. Following the caller's CPUs: Linux its CPU set, Windows its group affinity, macOS nothing (no affinity).
    class Scheduling {
    public:
        static Scheduling ofCurrentThread() {
            Scheduling s;
#if defined(TELEPLOT_SINGLE_THREAD)
#elif defined(_WIN32)
            s.priority_ = GetThreadPriority(GetCurrentThread());
            s.hasCpus_ = GetThreadGroupAffinity(GetCurrentThread(), &s.cpus_) != 0;
#elif defined(__APPLE__)
            qos_class_t qos = QOS_CLASS_UNSPECIFIED;
            int relative = 0;
            pthread_get_qos_class_np(pthread_self(), &qos, &relative);
            s.qos_ = static_cast<int>(qos);
            s.priority_ = relative;
#else
            sched_param param{};
            pthread_getschedparam(pthread_self(), &s.policy_, &param);
            s.priority_ = param.sched_priority;
    #if defined(__linux__)
            errno = 0;
            s.nice_ = getpriority(PRIO_PROCESS, static_cast<id_t>(syscall(SYS_gettid)));
            CPU_ZERO(&s.cpus_);
            s.hasCpus_ = pthread_getaffinity_np(pthread_self(), sizeof(s.cpus_), &s.cpus_) == 0;
    #endif
#endif
            return s;
        }
        // Gives the calling thread a priority and CPUs (relative to this scheduling: the caller's). false: the system refused part of
        // it (the thread keeps what it had for that part).
        bool applyToCurrentThread(ThreadPriority priority, ThreadAffinity affinity = ThreadAffinity::automatic()) const {
            bool follow = affinity.kind() == ThreadAffinity::FollowCaller || (affinity.kind() == ThreadAffinity::Automatic && priority.kind() == BelowCaller);
            bool priorityApplied = applyPriority_(priority); // (both are tried, whatever the first gives)
            bool affinityApplied = applyAffinity_(follow ? ThreadAffinity::followCaller() : affinity.kind() == ThreadAffinity::Automatic ? ThreadAffinity::any() : affinity);
            return priorityApplied && affinityApplied;
        }
        bool same(Scheduling const& o) const {
            bool cpus = true;
#if defined(_WIN32)
            cpus = hasCpus_ == o.hasCpus_ && cpus_.Group == o.cpus_.Group && cpus_.Mask == o.cpus_.Mask;
#elif defined(__linux__)
            cpus = hasCpus_ == o.hasCpus_ && CPU_EQUAL(&cpus_, &o.cpus_);
#endif
            return policy_ == o.policy_ && priority_ == o.priority_ && nice_ == o.nice_ && qos_ == o.qos_ && cpus;
        }
    private:
        bool applyPriority_(ThreadPriority p) const {
            PriorityKind kind = p.kind();
#if defined(TELEPLOT_SINGLE_THREAD)
            (void)kind;
            return true;
#elif defined(_WIN32)
            static const int levels[] = { THREAD_PRIORITY_IDLE, THREAD_PRIORITY_LOWEST, THREAD_PRIORITY_BELOW_NORMAL, THREAD_PRIORITY_NORMAL,
                                          THREAD_PRIORITY_ABOVE_NORMAL, THREAD_PRIORITY_HIGHEST, THREAD_PRIORITY_TIME_CRITICAL };
            if (kind == Realtime) { return false; } // (no real-time policy for a thread on Windows)
            int target = kind == Low ? THREAD_PRIORITY_LOWEST : kind == PriorityValue ? p.number() : THREAD_PRIORITY_NORMAL;
            if (kind == BelowCaller) { int i = 0; while (i < 6 && levels[i + 1] <= priority_) { ++i; } target = levels[i > 0 ? i - 1 : 0]; }
            return SetThreadPriority(GetCurrentThread(), target) != 0;
#elif defined(__APPLE__)
            if (kind == Realtime) {
                int policy = p.roundRobin() ? SCHED_RR : SCHED_FIFO;
                sched_param param{};
                param.sched_priority = p.number();
                return pthread_setschedparam(pthread_self(), policy, &param) == 0;
            }
            qos_class_t qos = kind == Low ? QOS_CLASS_UTILITY : QOS_CLASS_DEFAULT;
            int relative = kind == PriorityValue ? p.number() : 0;
            if (kind == BelowCaller) {
                qos = qos_ == static_cast<int>(QOS_CLASS_UNSPECIFIED) ? QOS_CLASS_DEFAULT : static_cast<qos_class_t>(qos_);
                relative = std::max(QOS_MIN_RELATIVE_PRIORITY, priority_ - 1);
            }
            return pthread_set_qos_class_self_np(qos, relative) == 0;
#else
            sched_param param{};
            if (kind == Realtime) {
                param.sched_priority = p.number();
                return pthread_setschedparam(pthread_self(), p.roundRobin() ? SCHED_RR : SCHED_FIFO, &param) == 0;
            }
            if (kind == BelowCaller && (policy_ == SCHED_FIFO || policy_ == SCHED_RR)) {
                param.sched_priority = std::max(sched_get_priority_min(policy_), priority_ - 1);
                return pthread_setschedparam(pthread_self(), policy_, &param) == 0;
            }
            bool ok = pthread_setschedparam(pthread_self(), SCHED_OTHER, &param) == 0;
    #if defined(__linux__)
            int nice = kind == PriorityValue ? p.number() : std::min(19, (kind == BelowCaller ? nice_ : getpriority(PRIO_PROCESS, 0)) + (kind == Low ? 10 : kind == BelowCaller ? 1 : 0));
            ok = setpriority(PRIO_PROCESS, static_cast<id_t>(syscall(SYS_gettid)), nice) == 0 && ok;
    #else
            if (kind == PriorityValue) { ok = false; } // (no nice per thread here)
    #endif
            return ok;
#endif
        }
        bool applyAffinity_(ThreadAffinity const& a) const {
#if defined(TELEPLOT_SINGLE_THREAD)
            (void)a;
            return true;
#elif defined(_WIN32)
            if (a.kind() == ThreadAffinity::FollowCaller) { return !hasCpus_ || SetThreadGroupAffinity(GetCurrentThread(), &cpus_, nullptr) != 0; }
            DWORD_PTR mask = 0, system = 0;
            if (a.kind() == ThreadAffinity::Any) { if (!GetProcessAffinityMask(GetCurrentProcess(), &mask, &system)) { return false; } }
            else { for (int cpu : a.list()) { if (cpu < 0 || cpu >= static_cast<int>(sizeof(DWORD_PTR) * 8)) { return false; } mask |= DWORD_PTR(1) << cpu; } }
            return mask != 0 && SetThreadAffinityMask(GetCurrentThread(), mask) != 0;
#elif defined(__linux__)
            cpu_set_t set;
            CPU_ZERO(&set);
            if (a.kind() == ThreadAffinity::FollowCaller) { if (!hasCpus_) { return true; } set = cpus_; }
            else if (a.kind() == ThreadAffinity::Any) { if (sched_getaffinity(getpid(), sizeof(set), &set) != 0) { return false; } }
            else { for (int cpu : a.list()) { if (cpu < 0 || cpu >= CPU_SETSIZE) { return false; } CPU_SET(cpu, &set); } if (a.list().empty()) { return false; } }
            return pthread_setaffinity_np(pthread_self(), sizeof(set), &set) == 0;
#else
            return a.kind() != ThreadAffinity::Cpus; // (macOS: no affinity to set; following the caller or any CPU is what it does)
#endif
        }
        int policy_ = 0, priority_ = 0, nice_ = 0, qos_ = 0;
#if defined(_WIN32)
        GROUP_AFFINITY cpus_{};
        bool hasCpus_ = false;
#elif defined(__linux__)
        cpu_set_t cpus_;
        bool hasCpus_ = false;
#endif
    };

    class Options {
    public:
        Options& udp(std::string host, std::uint16_t port = 47269) { outputs_.push_back({ 0, std::move(host), port, {}, nullptr }); return *this; }
        Options& file(std::string path) { outputs_.push_back({ 1, {}, 0, std::move(path), nullptr }); return *this; }
        Options& output(std::function<void(const std::byte*, std::size_t)> fn) { outputs_.push_back({ 2, {}, 0, {}, std::move(fn) }); return *this; }
        Options& name(std::string clientName) { name_ = std::move(clientName); return *this; }
        Options& clientId(std::uint16_t id) { clientId_ = id; return *this; }
        Options& flushInterval(std::chrono::milliseconds v) { flushInterval_ = v; return *this; }
        Options& sendFrom(SendFrom v) { sendFrom_ = v; return *this; }
        Options& describeInterval(std::chrono::milliseconds v) { describeInterval_ = v; return *this; }
        Options& publishInterval(std::chrono::milliseconds v) { publishInterval_ = v; return *this; }
        Options& maxQueuedBytes(std::size_t v) { maxQueuedBytes_ = v; return *this; }
        Options& nonBlocking(bool v = true) { nonBlocking_ = v; return *this; }
        Options& threadPriority(ThreadPriority v) { threadPriority_ = v; return *this; }
        Options& threadAffinity(ThreadAffinity v) { threadAffinity_ = std::move(v); return *this; }
    private:
        friend class Teleplot;
        struct Output { int kind; std::string host; std::uint16_t port; std::string path; std::function<void(const std::byte*, std::size_t)> fn; };
        std::vector<Output> outputs_;
        std::string name_;
        std::uint16_t clientId_ = 0;
        std::chrono::milliseconds flushInterval_{20}, describeInterval_{5000}, publishInterval_{200};
        SendFrom sendFrom_ = Caller;
        std::size_t maxQueuedBytes_ = 1 << 20;
        bool nonBlocking_ = false;
        ThreadPriority threadPriority_ = BelowCaller;
        ThreadAffinity threadAffinity_;
    };

    // An argument of an action
    class Arg {
    public:
        enum Type : std::uint8_t { Number = 1, Bool = 2, Text = 3, XY = 4, XYZ = 5, Pose2D = 6 };
        Arg(std::string name, Type type = Number) : name_(std::move(name)), type_(type) {}
        Arg& optional(bool v = true) { optional_ = v; return *this; }
        template<class V> Arg& defaultValue(V const& v) { default_ = valueText_(v); return *this; }
        Arg& range(double min, double max) { min_ = min; max_ = max; return *this; }
        Arg& min(double v) { min_ = v; return *this; }
        Arg& max(double v) { max_ = v; return *this; }
        Arg& step(double v) { step_ = v; return *this; }
        Arg& unit(std::string v) { unit_ = std::move(v); return *this; }
        Arg& choices(std::vector<std::string> v) { choices_ = std::move(v); return *this; }
        Arg& desc(std::string v) { desc_ = std::move(v); return *this; }
    private:
        friend class Teleplot;
        std::string name_, unit_, default_, desc_;
        Type type_;
        bool optional_ = false;
        double min_ = std::nan(""), max_ = std::nan(""), step_ = std::nan("");
        std::vector<std::string> choices_;
    };

    struct Call { std::uint16_t telemetry = 0, id = 0; };

    // The arguments of a call, by name (an optional one left empty is missing: has() is false, the readers give the fallback)
    class Args {
    public:
        bool has(std::string_view name) const { return find_(name) != nullptr; }
        double number(std::string_view name, double fallback = std::nan("")) const { auto v = find_(name); return v && std::holds_alternative<double>(*v) ? std::get<double>(*v) : fallback; }
        bool flag(std::string_view name, bool fallback = false) const { auto v = find_(name); return v && std::holds_alternative<bool>(*v) ? std::get<bool>(*v) : fallback; }
        std::string text(std::string_view name, std::string fallback = "") const { auto v = find_(name); return v && std::holds_alternative<std::string>(*v) ? std::get<std::string>(*v) : fallback; }
        Number2D xy(std::string_view name, Number2D fallback = {}) const { auto n = numbers_(name, 2); return n ? Number2D{ (*n)[0], (*n)[1] } : fallback; }
        Number3D xyz(std::string_view name, Number3D fallback = {}) const { auto n = numbers_(name, 3); return n ? Number3D{ (*n)[0], (*n)[1], (*n)[2] } : fallback; }
        Teleplot::Pose2D pose2d(std::string_view name, Teleplot::Pose2D fallback = {}) const { auto n = numbers_(name, 3); return n ? Teleplot::Pose2D{ (*n)[0], (*n)[1], (*n)[2] } : fallback; }
        Teleplot::Call call() const { return call_; }
    private:
        friend class Teleplot;
        using Value = std::variant<double, bool, std::string, std::vector<double>>;
        std::vector<std::pair<std::string, Value>> values_;
        Teleplot::Call call_;
        const Value* find_(std::string_view name) const { for (auto const& [n, v] : values_) { if (n == name) { return &v; } } return nullptr; }
        const std::vector<double>* numbers_(std::string_view name, std::size_t count) const {
            auto v = find_(name);
            return v && std::holds_alternative<std::vector<double>>(*v) && std::get<std::vector<double>>(*v).size() >= count ? &std::get<std::vector<double>>(*v) : nullptr;
        }
    };

    class Samples;
    class Telemetry;
    template<class T> class Param;
    class Action;
    class Stack;

    // What describes a telemetry: the same calls on a Telemetry and on the Samples of a chain (describing after a sample is allowed)
    template<class Self>
    class Describe {
    public:
        Self& unit(std::string_view v) { tp_->attrText_(index_, ATTR_UNIT, v); return self_(); }
        Self& label(std::string_view v) { tp_->labelOf_(index_, v); return self_(); } // telemetries of a label share a view; a path (Robot/Motion) places it
        Self& desc(std::string_view v) { tp_->attrText_(index_, ATTR_DESC, v); return self_(); }
        Self& range(double min, double max) { tp_->range_(index_, min, max, 3); return self_(); }
        Self& min(double v) { tp_->range_(index_, v, 0, 1); return self_(); }
        Self& max(double v) { tp_->range_(index_, 0, v, 2); return self_(); }
        Self& autoplot(bool v) { tp_->attrBytes_(index_, ATTR_AUTOPLOT, Bytes_().u8(v ? 1 : 0)); return self_(); }
        Self& timeout(Time t) { tp_->attrBytes_(index_, ATTR_DATA_TIMEOUT, Bytes_().u64(static_cast<std::uint64_t>(std::max<std::int64_t>(0, t.ns)))); return self_(); }
        Self& log(bool v = true) { tp_->attrBytes_(index_, ATTR_LOG, Bytes_().u8(v ? 1 : 0)); return self_(); }
        Self& stack(bool v = true) { tp_->attrBytes_(index_, ATTR_STACK, Bytes_().u8(v ? 1 : 0)); return self_(); }
        Self& frame(std::string_view name) { tp_->attrBytes_(index_, ATTR_FRAME, Bytes_().u8(0).str(name)); return self_(); }
        Self& pixelsOf(std::string_view imageTelemetry) { tp_->attrBytes_(index_, ATTR_FRAME, Bytes_().u8(1).str(imageTelemetry)); return self_(); }
        // Pictures of numbers (Gray16 / Float32, 16-bit PNG): a pixel is worth number x scale (in the unit of the telemetry), noData is the
        // number of a pixel without measure (NAN: every number is one). depthMap: distances along the axis of its camera (placed in 3D
        // views); pixelValues: other values (a temperature...).
        Self& depthMap(double scale, double noData = 0) { tp_->attrBytes_(index_, ATTR_PIXELS, Bytes_().f64(scale).f64(noData).u8(0)); return self_(); }
        Self& pixelValues(double scale, double noData = 0) { tp_->attrBytes_(index_, ATTR_PIXELS, Bytes_().f64(scale).f64(noData).u8(1)); return self_(); }
        Self& shape(ShapeType type) { tp_->shape_(index_, type, ""); return self_(); }
        Self& stl(std::string_view url) { tp_->shape_(index_, Stl, url); return self_(); }
        Self& maxRate(double hz) { tp_->setting_(index_, [hz](Entry_& e) { e.maxRate = hz; }); return self_(); }
        Self& precise(bool v = true) { tp_->setting_(index_, [v](Entry_& e) { e.precise = v; }); return self_(); }
        Self& nonBlocking(bool v = true) { tp_->setting_(index_, [v](Entry_& e) { e.nonBlocking.store(v ? 1 : 0); }); return self_(); }
        Self& oneThread(bool v = true) { tp_->setting_(index_, [v](Entry_& e) { e.oneThread = v; }); return self_(); }
    protected:
        Describe(Teleplot* owner, std::uint32_t index) : tp_(owner), index_(index) {}
        Self& self_() { return static_cast<Self&>(*this); }
        Teleplot* tp_;
        std::uint32_t index_;
    };

    // Samples of a chain: they all get the time of the chain, taken by its first sample (or given by at())
    class Samples : public Describe<Samples> {
    public:
        Samples& update(double v) { tp_->numbers_(index_, SECT_NUMBER, t_(), { v }); return *this; }
        Samples& update(bool v) { return update(v ? 1.0 : 0.0); }
        template<class V, std::enable_if_t<std::is_arithmetic_v<V> && !std::is_same_v<V, bool>, int> = 0> Samples& update(V v) { return update(static_cast<double>(v)); }
        Samples& update(std::string_view v) { tp_->text_(index_, SECT_TEXT, t_(), v); return *this; }
        Samples& update(const char* v) { return update(std::string_view(v)); }
        Samples& update(std::string const& v) { return update(std::string_view(v)); }
        Samples& update(Number2D v) { tp_->numbers_(index_, SECT_NUMBER_2D, t_(), { v.x, v.y }); return *this; }
        Samples& update(Number3D v) { tp_->numbers_(index_, SECT_NUMBER_3D, t_(), { v.x, v.y, v.z }); return *this; }
        Samples& update(Teleplot::Pose2D v) { tp_->numbers_(index_, SECT_NUMBER_3D, t_(), { v.x, v.y, v.yaw }); return *this; }

        Samples& threshold(std::string_view name, ThresholdSide side, double value, std::string_view color = "") { tp_->threshold_(index_, t_(), name, side, value, color); return *this; }
        Samples& removeThreshold(std::string_view name) { tp_->threshold_(index_, t_(), name, Below, std::nan(""), ""); return *this; }

        Samples& position(double x, double y, double z = 0) { tp_->numbers_(index_, SECT_POSITION, t_(), { x, y, z }); return *this; }
        Samples& rotation(double roll, double pitch, double yaw) { tp_->numbers_(index_, SECT_ROTATION, t_(), { roll, pitch, yaw }); return *this; }
        Samples& yaw(double a) { return rotation(0, 0, a); }
        Samples& quaternion(double w, double x, double y, double z) { tp_->numbers_(index_, SECT_QUATERNION, t_(), { w, x, y, z }); return *this; }
        Samples& size(double x, double y, double z) { tp_->numbers_(index_, SECT_SIZE, t_(), { x, y, z }); return *this; }
        Samples& size(double x, double y) { tp_->numbers_(index_, SECT_SIZE, t_(), { x, y, tp_->sizeZ_(index_) }); return *this; }
        Samples& size(double s) { return size(s, s, s); }
        Samples& color(std::string_view c) { tp_->color_(index_, t_(), c); return *this; }
        Samples& color(Rgb c) { tp_->color_(index_, t_(), c); return *this; }
        Samples& opacity(double v) { tp_->numbers_(index_, SECT_OPACITY, t_(), { std::round(std::clamp(v, 0.0, 1.0) * 255) }); return *this; }
        Samples& texture(std::string_view url) { tp_->texture_(index_, t_(), 1, url); return *this; }
        Samples& textureFrom(std::string_view imageTelemetry) { tp_->texture_(index_, t_(), 2, imageTelemetry); return *this; }
        Samples& vector(double x, double y, double z = 0) { tp_->numbers_(index_, SECT_VECTOR, t_(), { x, y, z }); return *this; }
        Samples& text(std::string_view v) { tp_->text_(index_, SECT_SHAPE_TEXT, t_(), v); return *this; }
        Samples& textSize(double h) { return size(h); }
        Samples& lineWidth(double w) { tp_->numbers_(index_, SECT_LINE_WIDTH, t_(), { w }); return *this; }
        Samples& points(const Number2D* p, std::size_t n) { tp_->cloud_(index_, t_(), p, n, nullptr, nullptr); return *this; }
        Samples& points(const Number3D* p, std::size_t n) { tp_->cloud_(index_, t_(), p, n, nullptr, nullptr); return *this; }
        Samples& points(std::vector<Number2D> const& p) { return points(p.data(), p.size()); }
        Samples& points(std::vector<Number3D> const& p) { return points(p.data(), p.size()); }
        Samples& cloud(const Number3D* p, std::size_t n, const float* intensities = nullptr, const Rgb* colors = nullptr) { tp_->cloud_(index_, t_(), p, n, intensities, colors); return *this; }
        Samples& cloud(const Number3D* p, std::size_t n, const Rgb* colors) { return cloud(p, n, nullptr, colors); }
        Samples& cloud(std::vector<Number3D> const& p) { return cloud(p.data(), p.size()); }
        Samples& cloud(std::vector<Number3D> const& p, std::vector<float> const& intensities) { return cloud(p.data(), p.size(), intensities.size() >= p.size() ? intensities.data() : nullptr); }
        Samples& cloud(std::vector<Number3D> const& p, std::vector<Rgb> const& colors) { return cloud(p.data(), p.size(), nullptr, colors.size() >= p.size() ? colors.data() : nullptr); }
        Samples& image(ImageType type, const void* bytes, std::size_t size) { tp_->image_(index_, t_(), type, static_cast<const std::byte*>(bytes), size); return *this; }
        template<class B> Samples& image(ImageType type, std::vector<B> const& bytes) { static_assert(sizeof(B) == 1, "image(): a vector of bytes"); return image(type, bytes.data(), bytes.size()); }
        // An encoded picture: anything with .type (ImageType) and .bytes (TeleplotImage::Picture). An empty one sends nothing.
        template<class P, class = decltype(ImageType(std::declval<P const&>().type)), class = decltype(std::declval<P const&>().bytes.data())>
        Samples& image(P const& picture) { return picture.bytes.empty() ? *this : image(picture.type, picture.bytes.data(), picture.bytes.size()); }
        Samples& intrinsics(double width, double height, double fx, double fy, double cx, double cy) { tp_->numbers_(index_, SECT_INTRINSICS, t_(), { width, height, fx, fy, cx, cy }); return *this; }
        Samples& distortion(double k1, double k2, double p1, double p2, double k3) { tp_->numbers_(index_, SECT_DISTORTION, t_(), { k1, k2, p1, p2, k3 }); return *this; }

        // (at() starts a chain: in the middle of one it would give it two times)
        template<class T = int> Samples& at(Time) { static_assert(sizeof(T) == 0, "Teleplot: at() must be the first call of a chain: telemetry.at(t).position(...)"); return *this; }

    private:
        friend class Teleplot;
        friend class Telemetry;
        Samples(Teleplot* owner, std::uint32_t index, std::optional<Time> t) : Describe<Samples>(owner, index), time_(t) {}
        std::int64_t t_() { if (!time_) { time_ = Time{}; time_->ns = tp_->nowNs_(); } return time_->ns; }
        std::optional<Time> time_;
    };

    // The handle of a telemetry: describe it, send its samples. Stays valid as long as its Teleplot.
    class Telemetry : public Describe<Telemetry> {
    public:
        Samples at(Time t) { return Samples(tp_, index_, t); }
        Telemetry& color(std::string_view c) { tp_->color_(index_, std::nullopt, c); return *this; }
        Telemetry& color(Rgb c) { tp_->color_(index_, std::nullopt, c); return *this; }
        // Every sample call of Samples, starting a chain at "now"
        #define TELEPLOT_SAMPLE_CALL_(name) template<class... A> Samples name(A&&... a) { Samples s(tp_, index_, std::nullopt); s.name(std::forward<A>(a)...); return s; }
        TELEPLOT_SAMPLE_CALL_(update) TELEPLOT_SAMPLE_CALL_(threshold) TELEPLOT_SAMPLE_CALL_(removeThreshold) TELEPLOT_SAMPLE_CALL_(position)
        TELEPLOT_SAMPLE_CALL_(rotation) TELEPLOT_SAMPLE_CALL_(yaw) TELEPLOT_SAMPLE_CALL_(quaternion) TELEPLOT_SAMPLE_CALL_(size)
        TELEPLOT_SAMPLE_CALL_(opacity) TELEPLOT_SAMPLE_CALL_(texture) TELEPLOT_SAMPLE_CALL_(textureFrom) TELEPLOT_SAMPLE_CALL_(vector)
        TELEPLOT_SAMPLE_CALL_(text) TELEPLOT_SAMPLE_CALL_(textSize) TELEPLOT_SAMPLE_CALL_(lineWidth) TELEPLOT_SAMPLE_CALL_(points)
        TELEPLOT_SAMPLE_CALL_(cloud) TELEPLOT_SAMPLE_CALL_(image) TELEPLOT_SAMPLE_CALL_(intrinsics) TELEPLOT_SAMPLE_CALL_(distortion)
        #undef TELEPLOT_SAMPLE_CALL_
        std::string_view name() const { return tp_->entry_(index_).name; }
        Teleplot& teleplot() const { return *tp_; }
    private:
        friend class Teleplot;
        Telemetry(Teleplot* owner, std::uint32_t index) : Describe<Telemetry>(owner, index) {}
    };

    // A setting the page may write: the variable is applied by poll() (clamped to the range, rounded to the step) and published
    template<class T>
    class Param {
    public:
        Param& range(double min, double max) { return set_([=](ParamBase_& p) { p.min = min; p.max = max; }); }
        Param& min(double v) { return set_([=](ParamBase_& p) { p.min = v; }); }
        Param& max(double v) { return set_([=](ParamBase_& p) { p.max = v; }); }
        Param& step(double v) { return set_([=](ParamBase_& p) { p.step = v; }); }
        Param& unit(std::string_view v) { tp_->attrText_(index_, ATTR_UNIT, v); return *this; }
        Param& desc(std::string_view v) { tp_->attrText_(index_, ATTR_DESC, v); return *this; }
        Param& choices(std::vector<std::string> v) { return set_([v = std::move(v)](ParamBase_& p) mutable { p.choices = std::move(v); }); }
        Param& rate(double hz) { return set_([=](ParamBase_& p) { p.rate = static_cast<std::uint16_t>(std::clamp(hz, 0.0, 65535.0)); }); }
        Param& hold(std::chrono::milliseconds v) { return set_([=](ParamBase_& p) { p.hold = static_cast<std::uint16_t>(std::clamp<long long>(v.count(), 0, 65535)); }); }
        Param& hold(int ms) { return hold(std::chrono::milliseconds(ms)); }
        Param& axes(std::uint8_t bits) { return set_([=](ParamBase_& p) { p.axes = bits; }); }
        // Called before a value the page wrote is applied: return error("why") to refuse it (nothing changes)
        Param& onChange(std::function<Result(T const&)> fn) { std::lock_guard<Lock_> g(tp_->lock_); impl_->onChange = std::move(fn); return *this; }
    private:
        friend class Teleplot;
        Param(Teleplot* owner, std::uint32_t index, std::shared_ptr<ParamImpl_<T>> impl) : tp_(owner), index_(index), impl_(std::move(impl)) {}
        template<class F> Param& set_(F f) { { std::lock_guard<Lock_> g(tp_->lock_); f(*impl_); } tp_->declareParam_(index_, *impl_); return *this; }
        Teleplot* tp_;
        std::uint32_t index_;
        std::shared_ptr<ParamImpl_<T>> impl_;
    };

    // An action the page may call
    class Action {
    public:
        Action& title(std::string_view v) { tp_->attrText_(index_, ATTR_TITLE, v); return *this; }
        Action& desc(std::string_view v) { tp_->attrText_(index_, ATTR_DESC, v); return *this; }
        Action& color(std::string_view v) { tp_->attrText_(index_, ATTR_COLOR, v); return *this; }
        Action& confirm(bool v = true) { return flag_(1, v); }
        Action& longpress(bool v = true) { return flag_(2, v); }
        Action& arg(Arg a) { tp_->actionArg_(index_, impl_, std::move(a)); return *this; }
    private:
        friend class Teleplot;
        Action(Teleplot* owner, std::uint32_t index, std::shared_ptr<ActionImpl_> impl) : tp_(owner), index_(index), impl_(std::move(impl)) {}
        Action& flag_(std::uint8_t bit, bool v) { { std::lock_guard<Lock_> g(tp_->lock_); impl_->flags = static_cast<std::uint8_t>(v ? (impl_->flags | bit) : (impl_->flags & ~bit)); } tp_->declareAction_(index_, *impl_); return *this; }
        Teleplot* tp_;
        std::uint32_t index_;
        std::shared_ptr<ActionImpl_> impl_;
    };

    // A level of a stack (what runs) while it lives: Teleplot::Stack level(tp, "robot.task", "plan");
    class Stack {
    public:
        Stack(Teleplot& owner, std::string_view name, std::string_view level) : tp_(&owner) { index_ = owner.stackPush_(name, level, before_); }
        ~Stack() { if (index_ != NONE_) { tp_->stackPop_(index_, before_); } }
        Stack(Stack const&) = delete;
        Stack& operator=(Stack const&) = delete;
    private:
        Teleplot* tp_;
        std::uint32_t index_ = NONE_;
        std::size_t before_ = 0;
    };

    // ------------------------------------------------------------------ Client
    Teleplot() : Teleplot(Options()) {}
    explicit Teleplot(Options options) { setOptions(std::move(options)); }
    Teleplot(Teleplot const&) = delete;
    Teleplot& operator=(Teleplot const&) = delete;
    ~Teleplot() {
        std::map<std::type_index, std::shared_ptr<void>> extensions;
        { std::lock_guard<std::mutex> l(extensionsMutex_); extensions.swap(extensions_); }
        extensions.clear(); // (companions first: what they still had to send goes out)
        stopThread_();
        flush();
        closeOutputs_();
    }

    // The default one: 127.0.0.1:47269
    static Teleplot& instance() { static Teleplot teleplot; return teleplot; }

    void setOptions(Options options) {
        stopThread_();
        {
            std::lock_guard<std::mutex> s(sendLock_);
            std::lock_guard<Lock_> g(lock_);
            closeOutputs_();
            options_ = std::move(options);
            if (options_.outputs_.empty()) { options_.udp("127.0.0.1", 47269); }
            if (options_.name_.empty()) { options_.name_ = programName_(); }
            clientId_ = options_.clientId_ != 0 ? options_.clientId_ : static_cast<std::uint16_t>(hash16_(options_.name_));
            if (clientId_ == 0xFFFF) { clientId_ = 0xFFFE; } // (0xFFFF: telemetries identified by name)
            openOutputs_();
            nameSentMs_ = std::numeric_limits<std::int64_t>::min() / 2;
        }
        { std::lock_guard<std::mutex> l(threadMutex_); threadPriority_ = options_.threadPriority_; threadAffinity_ = options_.threadAffinity_; threadReference_ = Scheduling::ofCurrentThread(); threadGeneration_++; }
        if (options_.sendFrom_ == Thread) { startThread_(); }
    }
    Options const& options() const { return options_; }

    // The priority and the CPUs of the threads of Teleplot, changed at run time ("the caller": for the sending thread, the thread
    // that calls this; for the work asked of a companion thread, the thread that asked it)
    void threadPriority(ThreadPriority priority) {
        { std::lock_guard<std::mutex> l(threadMutex_); threadPriority_ = priority; threadReference_ = Scheduling::ofCurrentThread(); threadGeneration_++; }
        threadWake_.notify_all();
    }
    void threadAffinity(ThreadAffinity affinity) {
        { std::lock_guard<std::mutex> l(threadMutex_); threadAffinity_ = std::move(affinity); threadReference_ = Scheduling::ofCurrentThread(); threadGeneration_++; }
        threadWake_.notify_all();
    }
    ThreadPriority threadPriority() const { std::lock_guard<std::mutex> l(threadMutex_); return threadPriority_; }
    ThreadAffinity threadAffinity() const { std::lock_guard<std::mutex> l(threadMutex_); return threadAffinity_; }

    // Companion headers keep their state in their Teleplot (TeleplotImage.h: its encoding thread), destroyed first with it
    template<class T> T& extension() {
        std::lock_guard<std::mutex> l(extensionsMutex_);
        auto& slot = extensions_[std::type_index(typeid(T))];
        if (!slot) { slot = std::make_shared<T>(*this); }
        return *static_cast<T*>(slot.get());
    }

    // "Now" on the clock of this Teleplot (clock(), or system_clock)
    Time currentTime() const { Time t; t.ns = nowNs_(); return t; }

    // The stats of this Teleplot sent as telemetries every "every" (0: no more; off by default): rates of what is sent (label
    // "teleplot sent"), the queue, problems as totals ("teleplot problems"); TeleplotImage.h adds its own ("teleplot images").
    // They are counted in what they report.
    void sendStats(Time every) {
        std::lock_guard<std::mutex> l(statsMutex_);
        statsEveryMs_ = every.ns / 1000000;
        statsAtMs_ = steadyMs_();
        statsBefore_ = stats();
    }
    Time statsInterval() const { std::lock_guard<std::mutex> l(statsMutex_); Time t; t.ns = statsEveryMs_ * 1000000; return t; }

    void enable() { enabled_ = true; }
    void disable() { enabled_ = false; }

    // Where "now" comes from (default: system_clock, ns since 1970). Set it before sending.
    void clock(std::function<Time()> fn) { clock_ = std::move(fn); }

    // The handle of a telemetry (created on first use)
    Telemetry telemetry(std::string_view name) { std::lock_guard<Lock_> g(lock_); return Telemetry(this, find_(name)); }

    template<class V> void update(std::string_view name, V const& value) { if (auto i = lookup_(name)) { Samples(this, *i, std::nullopt).update(value); } }
    template<class V> void update(std::string_view name, V const& value, Time t) { if (auto i = lookup_(name)) { Samples(this, *i, t).update(value); } }

    // A log line (the "log" attribute is set on first use); without a name: the telemetry "log"
    void log(std::string_view text) { log("log", text); }
    void log(std::string_view name, std::string_view text) { logAt_(name, text, std::nullopt); }
    void log(std::string_view name, std::string_view text, Time t) { logAt_(name, text, t); }

    // What runs, as a whole path ("loop/plan/search"; "" = nothing). Threads other than the main one get a telemetry of their own.
    void stack(std::string_view name, std::string_view path) { stackAt_(name, path, std::nullopt); }
    void stack(std::string_view name, std::string_view path, Time t) { stackAt_(name, path, t); }

    // The name of the calling thread, for the telemetries of its stacks ("robot.task.control")
    static void threadName(std::string name) { threadName_() = std::move(name); }

    // Dashboard lines of the text protocol (DASH|Robot/Motion:chart:speed|w=2), several separated by line feeds
    void dashboard(std::string_view lines) {
        if (!active_()) { return; }
        std::lock_guard<Lock_> g(lock_);
        std::size_t at = 0;
        while (at <= lines.size()) {
            std::size_t end = lines.find('\n', at);
            if (end == std::string_view::npos) { end = lines.size(); }
            std::string_view line = lines.substr(at, end - at);
            if (!line.empty()) {
                if (line.size() > MAX_TEXT_) { stats_.tooBig++; }
                else { dashboards_.emplace_back(line); }
            }
            at = end + 1;
        }
    }

    // A setting the page may write. T: float, double, integers, bool, std::string, Number2D (xy), Number3D (xyz), Pose2D.
    template<class T>
    Param<T> param(std::string_view name, T* variable) {
        static_assert(std::is_arithmetic_v<T> || std::is_same_v<T, std::string> || std::is_same_v<T, Number2D> || std::is_same_v<T, Number3D> || std::is_same_v<T, Teleplot::Pose2D>,
            "Teleplot param(): float, double, integers, bool, std::string, Number2D, Number3D or Pose2D");
        auto impl = std::make_shared<ParamImpl_<T>>();
        impl->variable = variable;
        impl->type = std::is_same_v<T, bool> ? 2 : std::is_arithmetic_v<T> ? 1 : std::is_same_v<T, std::string> ? 3 : std::is_same_v<T, Number2D> ? 4 : std::is_same_v<T, Number3D> ? 5 : 6;
        std::uint32_t index;
        {
            std::lock_guard<Lock_> g(lock_);
            index = find_(name);
            impl->name = std::string(name);
            params_[entries_[index].id] = impl;
        }
        declareParam_(index, *impl);
        impl->publish(*this);
        return Param<T>(this, index, impl);
    }

    // An action the page may call: handler(args) returns ok(), error("why") or running(). It runs in poll().
    Action action(std::string_view name, std::function<Result(Args const&)> handler) {
        auto impl = std::make_shared<ActionImpl_>();
        impl->handler = std::move(handler);
        std::uint32_t index;
        {
            std::lock_guard<Lock_> g(lock_);
            index = find_(name);
            actions_[entries_[index].id] = impl;
        }
        declareAction_(index, *impl);
        return Action(this, index, impl);
    }

    // Finishes a call whose handler returned running()
    void answer(Call call, Result result) {
        {
            std::lock_guard<Lock_> g(lock_);
            auto found = actions_.find(call.telemetry);
            if (found != actions_.end()) {
                for (auto& [id, r] : found->second->recent) { if (id == call.id) { r = result; } }
            }
        }
        answer_(call.telemetry, call.id, result.status, result.text);
    }

    // Reads what the page wrote (settings, calls) on the UDP sockets, applies it, answers, publishes the settings, sends
    void poll() {
        if (!active_()) { return; }
        std::vector<std::vector<std::byte>> received;
        {
            std::lock_guard<std::mutex> s(sendLock_);
            for (auto& out : outputs_) {
                if (out.socket == BAD_SOCKET_) { continue; }
                std::byte buffer[2048];
                for (;;) {
                    auto n = ::recvfrom(out.socket, reinterpret_cast<char*>(buffer), static_cast<int>(sizeof(buffer)), 0, nullptr, nullptr);
                    if (n <= 0) { break; }
                    received.emplace_back(buffer, buffer + n);
                }
            }
        }
        for (auto const& packet : received) { handlePacket(packet.data(), packet.size()); }
        std::int64_t now = steadyMs_();
        std::vector<std::shared_ptr<ParamBase_>> params;
        { std::lock_guard<Lock_> g(lock_); for (auto& [id, p] : params_) { params.push_back(p); } }
        bool publishAll = now - lastPublishMs_ >= options_.publishInterval_.count();
        for (auto& p : params) {
            if (p->hold > 0 && p->writtenAtMs != 0 && now - p->writtenAtMs > p->hold) { p->rest(); p->writtenAtMs = 0; p->publish(*this); } // nobody drives it any more
            else if (publishAll) { p->publish(*this); }
        }
        if (publishAll) { lastPublishMs_ = now; }
        flush();
    }

    // A packet of the binary protocol written by the page (poll() reads them from the UDP sockets; public for other transports)
    void handlePacket(const std::byte* data, std::size_t size) {
        if (!active_()) { return; }
        Reader_ r{ data, size >= 2 ? size - 2 : 0, 0 }; // (without the checksum)
        if (r.u8() != MARKER_ || r.u8() != VERSION_) { return; }
        r.u16(); // (our client id)
        while (r.ok() && r.at < r.size) {
            std::uint8_t section = r.u8();
            if (section == SECT_CALL) { if (!handleCall_(r)) { return; } continue; }
            if (section < SECT_NUMBER || section > SECT_TEXT) { return; } // (not something written to a setting)
            std::uint16_t telemId = r.u16();
            r.u64(); // (time reference of the page: meaningless here)
            std::uint8_t count = r.u8();
            std::vector<double> numbers;
            std::string text;
            for (std::uint8_t i = 0; i < count && r.ok(); ++i) {
                r.u32();
                numbers.clear();
                if (section == SECT_TEXT) { text = r.str(); }
                else { for (int c = 0; c < section - SECT_NUMBER + 1; ++c) { numbers.push_back(r.f32()); } }
            }
            if (!r.ok() || count == 0) { return; }
            std::shared_ptr<ParamBase_> p;
            { std::lock_guard<Lock_> g(lock_); auto found = params_.find(telemId); if (found != params_.end()) { p = found->second; } }
            if (!p) { continue; } // (not declared: ignored)
            std::optional<std::string> refused = p->write(*this, numbers, text);
            if (refused) { answer_(telemId, CALL_ID_SETTING_, 1, *refused); }
            else { p->writtenAtMs = steadyMs_(); }
            p->publish(*this); // the echo: what is applied
        }
    }

    // Sends what is queued now
    void flush() { flush_(false); }

    Stats stats() const { std::lock_guard<Lock_> g(lock_); Stats s = stats_; s.dropped += busy_.load(); s.priorityRefused += priorityRefused_.load(); return s; }

private:
    // ------------------------------------------------------------------ Protocol (doc/binaryProtocol.md)
    static constexpr std::size_t PACKET_SIZE_ = 1432; // from https://github.com/statsd/statsd/blob/master/docs/metric_types.md
    static constexpr std::size_t MAX_TEXT_ = 1380;    // a text sample or a dashboard line (cut / refused beyond: it must fit a packet)
    static constexpr std::size_t MAX_ATTR_TEXT_ = 900;
    static constexpr std::size_t MAX_NAME_ = 300;
    static constexpr std::size_t PART_BYTES_ = 1380;  // bytes of a part of an image or a cloud
    static constexpr std::uint8_t MARKER_ = 0x10, VERSION_ = 1;
    static constexpr std::uint16_t CALL_ID_SETTING_ = 0xFFFF;
    static constexpr std::uint32_t NONE_ = 0xFFFFFFFF;
    enum : std::uint8_t {
        ATTR_NAME = 0, ATTR_UNIT = 1, ATTR_COLOR = 2, ATTR_AUTOPLOT = 3, ATTR_DATA_TIMEOUT = 4, ATTR_SHAPE = 5, ATTR_LABEL = 6, ATTR_LOG = 7,
        ATTR_FRAME = 8, ATTR_RANGE = 9, ATTR_STACK = 10, ATTR_WRITE = 11, ATTR_CHOICES = 12, ATTR_ARGS = 13, ATTR_DESC = 14, ATTR_TITLE = 15,
        ATTR_PIXELS = 16,
    };
    enum : std::uint8_t {
        SECT_CLIENT_NAME = 1, SECT_DASHBOARD = 2, SECT_ATTR = 10, SECT_NUMBER = 20, SECT_NUMBER_2D = 21, SECT_NUMBER_3D = 22, SECT_TEXT = 23,
        SECT_IMAGE = 24, SECT_POSITION = 25, SECT_ROTATION = 26, SECT_QUATERNION = 27, SECT_COLOR_STR = 28, SECT_COLOR_RGB = 29, SECT_OPACITY = 30,
        SECT_SIZE = 31, SECT_TEXTURE = 32, SECT_INTRINSICS = 33, SECT_DISTORTION = 34, SECT_CLOUD = 35, SECT_FLOAT64 = 36, SECT_VECTOR = 37,
        SECT_SHAPE_TEXT = 38, SECT_LINE_WIDTH = 39, SECT_THRESHOLD = 40, SECT_CALL = 41, SECT_CALL_ANSWER = 42,
    };
    // Samples sent once (a size, a fixed position, camera parameters, thresholds) are sent again with the descriptions, so that a
    // page opened later draws them too. Streams (numbers, texts, pictures, clouds) are not.
    static bool latched_(std::uint8_t type) { return (type >= SECT_POSITION && type <= SECT_DISTORTION) || (type >= SECT_VECTOR && type <= SECT_THRESHOLD); }

    // Little-endian bytes, whatever the machine
    class Bytes_ {
    public:
        std::vector<std::byte> b;
        Bytes_& u8(std::uint8_t v) { b.push_back(static_cast<std::byte>(v)); return *this; }
        Bytes_& u16(std::uint16_t v) { return u8(static_cast<std::uint8_t>(v & 0xFF)).u8(static_cast<std::uint8_t>(v >> 8)); }
        Bytes_& u32(std::uint32_t v) { return u16(static_cast<std::uint16_t>(v & 0xFFFF)).u16(static_cast<std::uint16_t>(v >> 16)); }
        Bytes_& u64(std::uint64_t v) { return u32(v & 0xFFFFFFFFu).u32(static_cast<std::uint32_t>(v >> 32)); }
        Bytes_& f32(double v) { float f = static_cast<float>(v); std::uint32_t u; std::memcpy(&u, &f, 4); return u32(u); }
        Bytes_& f64(double v) { std::uint64_t u; std::memcpy(&u, &v, 8); return u64(u); }
        Bytes_& str(std::string_view s) { for (char c : s) { if (c == '\0') { break; } b.push_back(static_cast<std::byte>(c)); } return u8(0); }
        Bytes_& raw(const std::byte* p, std::size_t n) { b.insert(b.end(), p, p + n); return *this; }
        operator std::vector<std::byte>() const& { return b; }
    };
    // The same for a sample made of numbers, without allocating (at most 6 float64)
    struct Small_ {
        std::byte d[64];
        std::size_t n = 0;
        Small_& u8(std::uint8_t v) { d[n++] = static_cast<std::byte>(v); return *this; }
        Small_& le(std::uint64_t v, int bytes) { for (int i = 0; i < bytes; ++i) { u8(static_cast<std::uint8_t>(v >> (8 * i))); } return *this; }
        Small_& u16(std::uint16_t v) { return le(v, 2); }
        Small_& f32(double v) { float f = static_cast<float>(v); std::uint32_t u; std::memcpy(&u, &f, 4); return le(u, 4); }
        Small_& f64(double v) { std::uint64_t u; std::memcpy(&u, &v, 8); return le(u, 8); }
    };
    struct Reader_ {
        const std::byte* data; std::size_t size; std::size_t at; bool failed = false;
        bool ok() const { return !failed; }
        std::uint64_t le_(std::size_t n) { if (at + n > size) { failed = true; return 0; } std::uint64_t v = 0; for (std::size_t i = 0; i < n; ++i) { v |= static_cast<std::uint64_t>(data[at + i]) << (8 * i); } at += n; return v; }
        std::uint8_t u8() { return static_cast<std::uint8_t>(le_(1)); }
        std::uint16_t u16() { return static_cast<std::uint16_t>(le_(2)); }
        std::uint32_t u32() { return static_cast<std::uint32_t>(le_(4)); }
        std::uint64_t u64() { return le_(8); }
        float f32() { std::uint32_t u = u32(); float f; std::memcpy(&f, &u, 4); return f; }
        double f64() { std::uint64_t u = u64(); double d; std::memcpy(&d, &u, 8); return d; }
        std::string str() { std::string s; while (at < size && data[at] != std::byte{0}) { s.push_back(static_cast<char>(data[at++])); } if (at < size) { ++at; } else { failed = true; } return s; }
    };

    // ------------------------------------------------------------------ Lock
    // One lock for the queues. Never held while user code runs (handlers, onChange, outputs) nor while sending, so nothing
    // waits for long behind it. POSIX: priority inheritance (a low priority thread holding it gets the priority of the one waiting).
    class Lock_ {
    public:
#if defined(TELEPLOT_SINGLE_THREAD)
        void lock() {}
        bool try_lock() { return true; }
        void unlock() {}
#elif defined(_WIN32)
        void lock() { m_.lock(); }
        bool try_lock() { return m_.try_lock(); }
        void unlock() { m_.unlock(); }
    private:
        std::mutex m_;
#else
        Lock_() {
            pthread_mutexattr_t a;
            pthread_mutexattr_init(&a);
    #if defined(_POSIX_THREAD_PRIO_INHERIT) && _POSIX_THREAD_PRIO_INHERIT > 0
            pthread_mutexattr_setprotocol(&a, PTHREAD_PRIO_INHERIT);
    #endif
            pthread_mutex_init(&m_, &a);
            pthread_mutexattr_destroy(&a);
        }
        ~Lock_() { pthread_mutex_destroy(&m_); }
        void lock() { pthread_mutex_lock(&m_); }
        bool try_lock() { return pthread_mutex_trylock(&m_) == 0; }
        void unlock() { pthread_mutex_unlock(&m_); }
    private:
        pthread_mutex_t m_;
#endif
    };

    // ------------------------------------------------------------------ Telemetries
    struct Queue_ {
        struct Ref { std::int64_t ns; std::uint32_t at, size; };
        std::vector<std::byte> bytes;
        std::vector<Ref> refs;
        std::size_t head = 0;
        std::int64_t lastKeptNs = std::numeric_limits<std::int64_t>::min();
        bool empty() const { return head >= refs.size(); }
        std::size_t queuedBytes() const { return empty() ? 0 : bytes.size() - refs[head].at; }
        void push(std::int64_t ns, const std::byte* p, std::size_t n) { refs.push_back({ ns, static_cast<std::uint32_t>(bytes.size()), static_cast<std::uint32_t>(n) }); bytes.insert(bytes.end(), p, p + n); }
        void pop() { ++head; if (head == refs.size()) { refs.clear(); bytes.clear(); head = 0; } }
    };
    struct Latched_ { std::uint16_t key = 0; std::int64_t ns = 0; std::vector<std::vector<std::byte>> parts; std::int64_t sentMs = 0; };
    struct Entry_ {
        std::string name;
        std::uint16_t id = 0;
        std::map<std::uint8_t, std::vector<std::byte>> attrs; // code -> data (arguments of actions apart)
        std::vector<std::vector<std::byte>> args;
        std::vector<std::vector<std::byte>> items;            // what is sent: code + data, in order (name first, newer codes last)
        bool attrsDirty = true;
        std::size_t attrCursor = 0;
        std::int64_t attrsSentMs = std::numeric_limits<std::int64_t>::min() / 2;
        bool isShape = false, userLabel = false, oneThread = false, precise = false;
        std::uint8_t shapeType = 0;
        double rangeMin = std::nan(""), rangeMax = std::nan(""), maxRate = 0, sizeZ = 1;
        std::atomic<int> nonBlocking{-1}; // -1: as the options say
        std::thread::id owner;
        bool owned = false;
        std::string stackPath;
        std::map<std::uint16_t, Queue_> queues; // section type (or SECT_FLOAT64 << 8 | type)
        std::map<std::uint16_t, Latched_> latched;            // samples sent once, by section key
        std::map<std::string, Latched_> latchedThresholds;    // one per threshold name
    };
    struct ParamBase_ {
        std::string name;
        std::uint8_t type = 1, axes = 0;
        double min = std::nan(""), max = std::nan(""), step = std::nan("");
        std::uint16_t rate = 0, hold = 0;
        std::vector<std::string> choices;
        std::atomic<std::int64_t> writtenAtMs{0};
        virtual ~ParamBase_() = default;
        virtual void publish(Teleplot&) = 0;
        virtual std::optional<std::string> write(Teleplot&, std::vector<double> const& numbers, std::string const& text) = 0;
        virtual void rest() = 0;
        double clamp(double v) const {
            if (!std::isnan(min)) { v = std::max(min, v); }
            if (!std::isnan(max)) { v = std::min(max, v); }
            if (!std::isnan(step) && step > 0) { double base = std::isnan(min) ? 0.0 : min; v = base + std::round((v - base) / step) * step; }
            return v;
        }
    };
    template<class T>
    struct ParamImpl_ : ParamBase_ {
        T* variable = nullptr;
        std::function<Result(T const&)> onChange;
        void publish(Teleplot& owner) override { owner.update(name, *variable); }
        std::optional<std::string> write(Teleplot&, std::vector<double> const& n, std::string const& text) override {
            T value = *variable;
            if constexpr (std::is_same_v<T, bool>) { if (n.empty()) { return "a number"; } value = n[0] != 0; }
            else if constexpr (std::is_arithmetic_v<T>) { if (n.empty()) { return "a number"; } double v = clamp(n[0]); value = std::is_integral_v<T> ? static_cast<T>(std::llround(v)) : static_cast<T>(v); }
            else if constexpr (std::is_same_v<T, std::string>) {
                if (!choices.empty() && std::find(choices.begin(), choices.end(), text) == choices.end()) { std::string all; for (auto const& c : choices) { all += (all.empty() ? "" : ", ") + c; } return "one of " + all; }
                value = text;
            }
            else if constexpr (std::is_same_v<T, Number2D>) { if (n.size() < 2) { return "2 numbers"; } value = { clamp(n[0]), clamp(n[1]) }; }
            else if constexpr (std::is_same_v<T, Number3D>) { if (n.size() < 3) { return "3 numbers"; } value = { clamp(n[0]), clamp(n[1]), clamp(n[2]) }; }
            else { if (n.size() < 3) { return "3 numbers"; } value = { clamp(n[0]), clamp(n[1]), n[2] }; } // (a yaw is not clamped)
            if (onChange) { Result r = onChange(value); if (r.status == 1) { return r.text.empty() ? std::string("refused") : r.text; } }
            *variable = value;
            return std::nullopt;
        }
        void rest() override {
            if constexpr (std::is_arithmetic_v<T> && !std::is_same_v<T, bool>) { *variable = 0; }
            else if constexpr (std::is_same_v<T, Number2D> || std::is_same_v<T, Number3D> || std::is_same_v<T, Teleplot::Pose2D>) { *variable = T{}; }
        }
    };
    struct ActionImpl_ {
        std::function<Result(Args const&)> handler;
        std::vector<Arg> args;
        std::uint8_t flags = 0;
        std::deque<std::pair<std::uint16_t, Result>> recent; // calls already run, and what they gave (a call sent again is answered again, not run twice)
    };

    // ------------------------------------------------------------------ State
    Options options_;
    std::uint16_t clientId_ = 0;
    std::atomic<bool> enabled_{true};
    std::function<Time()> clock_;
    mutable Lock_ lock_;
    std::mutex sendLock_;
    std::deque<Entry_> entries_; // never moved: handles keep their index, the map keeps views of the names
    std::unordered_map<std::string_view, std::uint32_t> byName_;
    std::unordered_map<std::uint16_t, std::uint32_t> byId_;
    std::deque<std::string> dashboards_;
    std::map<std::uint16_t, std::shared_ptr<ParamBase_>> params_;
    std::map<std::uint16_t, std::shared_ptr<ActionImpl_>> actions_;
    std::size_t queued_ = 0, rr_ = 0;
    std::atomic<bool> packetReady_{false}; // a packet worth of samples is queued
    std::int64_t nameSentMs_ = 0, lastPublishMs_ = 0;
    std::atomic<std::int64_t> lastFlushMs_{0};
    Stats stats_;
    std::atomic<std::uint64_t> busy_{0};
    std::thread thread_;
    mutable std::mutex threadMutex_;
    mutable std::mutex statsMutex_;
    std::int64_t statsEveryMs_ = 0, statsAtMs_ = 0;
    Stats statsBefore_;
    std::condition_variable threadWake_;
    bool threadStop_ = false;
    ThreadPriority threadPriority_ = BelowCaller; // (threadMutex_)
    ThreadAffinity threadAffinity_;
    Scheduling threadReference_;            // the thread that set the options (or the priority): what BelowCaller is under
    std::uint64_t threadGeneration_ = 0;    // (changes when it does: the sending thread applies it again)
    std::atomic<std::uint64_t> priorityRefused_{0};
    std::map<std::type_index, std::shared_ptr<void>> extensions_;
    std::mutex extensionsMutex_;
    static inline const std::thread::id mainThread_ = std::this_thread::get_id(); // (taken while static objects are built, before main())

#ifdef _WIN32
    using Socket_ = SOCKET;
    static constexpr Socket_ BAD_SOCKET_ = INVALID_SOCKET;
#else
    using Socket_ = int;
    static constexpr Socket_ BAD_SOCKET_ = -1;
#endif
    struct OpenOutput_ { int kind; Socket_ socket = BAD_SOCKET_; sockaddr_in to{}; std::FILE* file = nullptr; std::function<void(const std::byte*, std::size_t)> fn; };
    std::vector<OpenOutput_> outputs_;

    // ------------------------------------------------------------------ Helpers
    static constexpr bool disabled_() {
#ifdef TELEPLOT_DISABLE
        return true;
#else
        return false;
#endif
    }
    bool active_() const { return !disabled_() && enabled_.load(std::memory_order_relaxed); }
    static std::uint32_t fnv1a_(std::string_view s) { std::uint32_t h = 2166136261u; for (char c : s) { h ^= static_cast<std::uint8_t>(c); h *= 16777619u; } return h; }
    static std::uint16_t hash16_(std::string_view s) { std::uint32_t h = fnv1a_(s); return static_cast<std::uint16_t>((h >> 16) ^ (h & 0xFFFF)); }
    static std::int64_t steadyMs_() { return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
    std::int64_t nowNs_() const { return clock_ ? clock_().ns : now().ns; }
    static std::string& threadName_() { thread_local std::string name; return name; }
    static std::string cut_(std::string_view s, std::size_t max) { return std::string(s.substr(0, std::min(s.size(), max))); }
    template<class V> static std::string valueText_(V const& v) {
        if constexpr (std::is_same_v<V, bool>) { return v ? "true" : "false"; }
        else if constexpr (std::is_arithmetic_v<V>) { return numberText_(static_cast<double>(v)); }
        else if constexpr (std::is_same_v<V, Number2D>) { return numberText_(v.x) + "," + numberText_(v.y); }
        else if constexpr (std::is_same_v<V, Number3D>) { return numberText_(v.x) + "," + numberText_(v.y) + "," + numberText_(v.z); }
        else if constexpr (std::is_same_v<V, Teleplot::Pose2D>) { return numberText_(v.x) + "," + numberText_(v.y) + "," + numberText_(v.yaw); }
        else { return std::string(std::string_view(v)); }
    }
    static std::string numberText_(double v) {
        char buffer[40];
        for (int digits = 15; digits <= 17; ++digits) { std::snprintf(buffer, sizeof(buffer), "%.*g", digits, v); if (std::strtod(buffer, nullptr) == v) { break; } }
        return buffer;
    }
    static std::string programName_() {
#if defined(_WIN32)
        char path[MAX_PATH] = { 0 };
        GetModuleFileNameA(nullptr, path, MAX_PATH);
        std::string s(path);
        s = s.substr(s.find_last_of("\\/") + 1);
        if (s.size() > 4 && s.substr(s.size() - 4) == ".exe") { s.resize(s.size() - 4); }
        return s.empty() ? "cpp" : s;
#elif defined(__APPLE__) || defined(__FreeBSD__)
        const char* name = getprogname();
        return name ? name : "cpp";
#elif defined(__GLIBC__)
        return program_invocation_short_name ? program_invocation_short_name : "cpp";
#else
        return "cpp";
#endif
    }

    Entry_& entry_(std::uint32_t index) { return entries_[index]; }

    // The entry of a name, created if needed (lock held)
    std::uint32_t find_(std::string_view name) {
        name = name.substr(0, std::min(name.size(), MAX_NAME_));
        auto found = byName_.find(name);
        if (found != byName_.end()) { return found->second; }
        std::uint32_t index = static_cast<std::uint32_t>(entries_.size());
        Entry_& e = entries_.emplace_back();
        e.name = std::string(name);
        std::uint16_t id = hash16_(e.name);
        while (byId_.count(id)) { ++id; } // (two names with the same id: the second takes the next free one)
        e.id = id;
        byId_[id] = index;
        byName_[e.name] = index;
        return index;
    }
    std::optional<std::uint32_t> lookup_(std::string_view name) {
        if (!active_()) { return std::nullopt; }
        std::lock_guard<Lock_> g(lock_);
        return find_(name);
    }

    // Lock for a sample of an entry: a nonBlocking one does not wait (its sample is dropped and counted)
    bool lockFor_(std::uint32_t index) {
        if (!active_()) { return false; }
        int nb = entries_[index].nonBlocking.load(std::memory_order_relaxed);
        if (nb == 1 || (nb == -1 && options_.nonBlocking_)) {
            if (!lock_.try_lock()) { busy_++; return false; }
            return true;
        }
        lock_.lock();
        return true;
    }
    bool nonBlockingOf_(std::uint32_t index) const { int nb = entries_[index].nonBlocking.load(std::memory_order_relaxed); return nb == 1 || (nb == -1 && options_.nonBlocking_); }

    void attrBytes_(std::uint32_t index, std::uint8_t code, std::vector<std::byte> data) {
        if (!active_()) { return; }
        std::lock_guard<Lock_> g(lock_);
        Entry_& e = entries_[index];
        auto found = e.attrs.find(code);
        if (found != e.attrs.end() && found->second == data) { return; }
        e.attrs[code] = std::move(data);
        e.attrsDirty = true;
    }
    void attrText_(std::uint32_t index, std::uint8_t code, std::string_view text) {
        if (text.size() > MAX_ATTR_TEXT_) { std::lock_guard<Lock_> g(lock_); stats_.tooBig++; }
        attrBytes_(index, code, Bytes_().str(text.substr(0, std::min(text.size(), MAX_ATTR_TEXT_))));
    }
    void labelOf_(std::uint32_t index, std::string_view label) { { std::lock_guard<Lock_> g(lock_); entries_[index].userLabel = true; } attrText_(index, ATTR_LABEL, label); }
    void range_(std::uint32_t index, double min, double max, int sides) {
        std::vector<std::byte> data;
        {
            std::lock_guard<Lock_> g(lock_);
            Entry_& e = entries_[index];
            if (sides & 1) { e.rangeMin = min; }
            if (sides & 2) { e.rangeMax = max; }
            data = Bytes_().f64(e.rangeMin).f64(e.rangeMax);
        }
        attrBytes_(index, ATTR_RANGE, std::move(data));
    }
    void shape_(std::uint32_t index, ShapeType type, std::string_view url) {
        { std::lock_guard<Lock_> g(lock_); entries_[index].isShape = true; entries_[index].shapeType = type; }
        Bytes_ b; b.u8(type);
        if (type == Stl) { b.str(url.substr(0, std::min(url.size(), MAX_ATTR_TEXT_))); }
        attrBytes_(index, ATTR_SHAPE, b);
    }
    template<class F> void setting_(std::uint32_t index, F f) { std::lock_guard<Lock_> g(lock_); f(entries_[index]); }
    double sizeZ_(std::uint32_t index) { std::lock_guard<Lock_> g(lock_); return entries_[index].sizeZ; }

    // Queues a sample (lock held). key: section type, or SECT_FLOAT64 << 8 | type. Returns false when it is not kept (maxRate).
    bool push_(Entry_& e, std::uint16_t key, std::int64_t ns, const std::byte* data, std::size_t size, bool rated = true) {
        Queue_& q = e.queues[key];
        if (rated && e.maxRate > 0) {
            if (q.lastKeptNs != std::numeric_limits<std::int64_t>::min() && ns >= q.lastKeptNs && ns - q.lastKeptNs < static_cast<std::int64_t>(1e9 / e.maxRate)) { return false; }
            q.lastKeptNs = ns;
        }
        q.push(ns, data, size);
        queued_ += size + 8;
        stats_.samples++;
        std::uint8_t type = static_cast<std::uint8_t>(key & 0xFF);
        if (latched_(type) || (type == SECT_CLOUD && e.isShape && (e.shapeType == Line || e.shapeType == Polygon))) {
            Latched_* l;
            if (type == SECT_THRESHOLD) { // one per threshold name: {OPERATOR[8]} {VALUE[64]} {NAME} {COLOR}
                const char* name = reinterpret_cast<const char*>(data + 9);
                l = &e.latchedThresholds[std::string(name, strnlen(name, size - 9))];
            }
            else { l = &e.latched[key]; }
            bool firstPart = type != SECT_CLOUD || (static_cast<std::uint8_t>(data[1]) == 0 && static_cast<std::uint8_t>(data[2]) == 0); // (the points of a line come in parts)
            if (firstPart || l->ns != ns) { l->parts.resize(1); l->parts[0].assign(data, data + size); } // (reuses what it holds: no allocation at each sample)
            else { l->parts.emplace_back(data, data + size); }
            l->key = key;
            l->ns = ns;
            l->sentMs = steadyMs_();
        }
        if (queued_ > options_.maxQueuedBytes_) { dropOldest_(); }
        if (queued_ >= PACKET_SIZE_) { packetReady_.store(true, std::memory_order_relaxed); }
        return true;
    }
    void dropOldest_() {
        while (queued_ > options_.maxQueuedBytes_) {
            Queue_* biggest = nullptr;
            for (auto& e : entries_) { for (auto& [key, q] : e.queues) { if (!q.empty() && (!biggest || q.queuedBytes() > biggest->queuedBytes())) { biggest = &q; } } }
            if (!biggest) { queued_ = 0; return; }
            queued_ -= std::min<std::size_t>(queued_, biggest->refs[biggest->head].size + 8);
            biggest->pop();
            stats_.dropped++;
        }
    }
    void afterSample_(std::uint32_t index) {
        // Caller mode: the thread that sends a sample sends the packets when it is time (a nonBlocking one only if nobody else is sending)
        if (options_.sendFrom_ != Caller || options_.flushInterval_.count() <= 0) { return; }
        std::int64_t now = steadyMs_();
        if (now - lastFlushMs_.load(std::memory_order_relaxed) < options_.flushInterval_.count() && !packetReady_.load(std::memory_order_relaxed)) { return; }
        flush_(nonBlockingOf_(index));
    }

    // A sample made of numbers, in the layout of its section (or as float64 when the telemetry is precise())
    void numbers_(std::uint32_t index, std::uint8_t type, std::int64_t ns, std::initializer_list<double> values) {
        if (!lockFor_(index)) { return; }
        Entry_& e = entries_[index];
        if (type >= SECT_POSITION && type != SECT_INTRINSICS && type != SECT_DISTORTION) { e.isShape = true; }
        if (type == SECT_SIZE) { e.sizeZ = *(values.begin() + 2); }
        Small_ b;
        std::uint16_t key = type;
        if (e.precise) { key = static_cast<std::uint16_t>(SECT_FLOAT64 << 8 | type); for (double v : values) { b.f64(v); } }
        else {
            std::size_t i = 0;
            for (double v : values) {
                if (type == SECT_INTRINSICS && i < 2) { b.u16(static_cast<std::uint16_t>(std::clamp(v, 0.0, 65535.0))); }
                else if (type == SECT_COLOR_RGB || type == SECT_OPACITY) { b.u8(static_cast<std::uint8_t>(std::clamp(v, 0.0, 255.0))); }
                else { b.f32(v); }
                ++i;
            }
        }
        push_(e, key, ns, b.d, b.n);
        lock_.unlock();
        afterSample_(index);
    }
    void text_(std::uint32_t index, std::uint8_t type, std::int64_t ns, std::string_view text) {
        if (!lockFor_(index)) { return; }
        Entry_& e = entries_[index];
        if (type == SECT_SHAPE_TEXT) { e.isShape = true; }
        if (text.size() > MAX_TEXT_) { stats_.tooBig++; }
        Bytes_ b; b.str(text.substr(0, std::min(text.size(), MAX_TEXT_)));
        push_(e, type, ns, b.b.data(), b.b.size());
        lock_.unlock();
        afterSample_(index);
    }
    void color_(std::uint32_t index, std::optional<std::int64_t> ns, std::string_view color) {
        bool shape;
        { std::lock_guard<Lock_> g(lock_); shape = entries_[index].isShape; }
        if (!shape) { attrText_(index, ATTR_COLOR, color); return; } // not a shape (yet): the color of the telemetry
        text_(index, SECT_COLOR_STR, ns ? *ns : nowNs_(), color);
    }
    void color_(std::uint32_t index, std::optional<std::int64_t> ns, Rgb c) {
        bool shape;
        { std::lock_guard<Lock_> g(lock_); shape = entries_[index].isShape; }
        if (!shape) { char hex[8]; std::snprintf(hex, sizeof(hex), "#%02x%02x%02x", c.r, c.g, c.b); attrText_(index, ATTR_COLOR, hex); return; }
        numbers_(index, SECT_COLOR_RGB, ns ? *ns : nowNs_(), { static_cast<double>(c.r), static_cast<double>(c.g), static_cast<double>(c.b) });
    }
    void texture_(std::uint32_t index, std::int64_t ns, std::uint8_t kind, std::string_view value) {
        if (!lockFor_(index)) { return; }
        Entry_& e = entries_[index];
        e.isShape = true;
        Bytes_ b; b.u8(kind).str(value.substr(0, std::min(value.size(), MAX_TEXT_)));
        push_(e, SECT_TEXTURE, ns, b.b.data(), b.b.size());
        lock_.unlock();
        afterSample_(index);
    }
    void threshold_(std::uint32_t index, std::int64_t ns, std::string_view name, ThresholdSide side, double value, std::string_view color) {
        if (!lockFor_(index)) { return; }
        Bytes_ b; b.u8(side).f64(value).str(name.substr(0, std::min(name.size(), MAX_ATTR_TEXT_ / 2))).str(color.substr(0, std::min(color.size(), std::size_t(64))));
        push_(entries_[index], SECT_THRESHOLD, ns, b.b.data(), b.b.size(), false);
        lock_.unlock();
        afterSample_(index);
    }
    void image_(std::uint32_t index, std::int64_t ns, ImageType type, const std::byte* data, std::size_t size) {
        if (!lockFor_(index)) { return; }
        Entry_& e = entries_[index];
        Queue_& q = e.queues[SECT_IMAGE];
        bool kept = !(e.maxRate > 0 && q.lastKeptNs != std::numeric_limits<std::int64_t>::min() && ns >= q.lastKeptNs && ns - q.lastKeptNs < static_cast<std::int64_t>(1e9 / e.maxRate));
        std::size_t count = std::max<std::size_t>(1, (size + PART_BYTES_ - 1) / PART_BYTES_);
        if (kept && count <= 0xFFFF) {
            q.lastKeptNs = ns;
            for (std::size_t part = 0; part < count; ++part) {
                std::size_t at = part * PART_BYTES_, n = std::min(PART_BYTES_, size - std::min(size, at));
                Bytes_ b; b.u8(type).u16(static_cast<std::uint16_t>(part)).u16(static_cast<std::uint16_t>(count)).u16(static_cast<std::uint16_t>(n)).raw(data + at, n);
                push_(e, SECT_IMAGE, ns, b.b.data(), b.b.size(), false);
            }
        }
        else if (count > 0xFFFF) { stats_.tooBig++; }
        lock_.unlock();
        afterSample_(index);
    }
    template<class P>
    void cloud_(std::uint32_t index, std::int64_t ns, const P* points, std::size_t n, const float* intensities, const Rgb* colors) {
        if (!lockFor_(index)) { return; }
        Entry_& e = entries_[index];
        Queue_& q = e.queues[SECT_CLOUD];
        bool kept = !(e.maxRate > 0 && q.lastKeptNs != std::numeric_limits<std::int64_t>::min() && ns >= q.lastKeptNs && ns - q.lastKeptNs < static_cast<std::int64_t>(1e9 / e.maxRate));
        std::uint8_t flags = static_cast<std::uint8_t>((intensities ? 1 : 0) | (colors ? 2 : 0));
        std::size_t pointBytes = 12 + (intensities ? 4 : 0) + (colors ? 3 : 0), perPart = (PART_BYTES_ - 7) / pointBytes;
        std::size_t count = std::max<std::size_t>(1, (n + perPart - 1) / perPart);
        if (kept && count <= 0xFFFF) {
            q.lastKeptNs = ns;
            for (std::size_t part = 0; part < count; ++part) {
                std::size_t from = part * perPart, to = std::min(n, from + perPart);
                Bytes_ b; b.u8(flags).u16(static_cast<std::uint16_t>(part)).u16(static_cast<std::uint16_t>(count)).u16(static_cast<std::uint16_t>(to - from));
                for (std::size_t i = from; i < to; ++i) {
                    double z = 0;
                    if constexpr (std::is_same_v<P, Number3D>) { z = points[i].z; }
                    b.f32(points[i].x).f32(points[i].y).f32(z);
                    if (intensities) { b.f32(intensities[i]); }
                    if (colors) { b.u8(colors[i].r).u8(colors[i].g).u8(colors[i].b); }
                }
                push_(e, SECT_CLOUD, ns, b.b.data(), b.b.size(), false);
            }
        }
        else if (count > 0xFFFF) { stats_.tooBig++; }
        lock_.unlock();
        afterSample_(index);
    }

    void logAt_(std::string_view name, std::string_view text, std::optional<Time> t) {
        auto index = lookup_(name);
        if (!index) { return; }
        bool isLog;
        { std::lock_guard<Lock_> g(lock_); auto& a = entries_[*index].attrs; isLog = a.count(ATTR_LOG) && a[ATTR_LOG] == std::vector<std::byte>{ std::byte{1} }; }
        if (!isLog) { attrBytes_(*index, ATTR_LOG, Bytes_().u8(1)); }
        Samples(this, *index, t).update(text);
    }

    // ------------------------------------------------------------------ Stacks
    // The telemetry of a stack for the calling thread: the main thread sends to the stack as named, other threads to "name.thread"
    // with the label of the stack; a oneThread() stack belongs to the first thread that uses it. NONE_: another thread (dropped).
    std::uint32_t stackEntry_(std::string_view name) {
        if (!active_()) { return NONE_; }
        std::thread::id me = std::this_thread::get_id();
        std::uint32_t index;
        bool fresh = false;
        {
            std::lock_guard<Lock_> g(lock_);
            index = find_(name);
            Entry_& base = entries_[index];
            if (base.oneThread) {
                if (!base.owned) { base.owned = true; base.owner = me; }
                else if (base.owner != me) { stats_.wrongThread++; return NONE_; }
            }
            else if (me != mainThread_) {
                std::string& thread = threadName_();
                if (thread.empty()) {
#if !defined(_WIN32) && !defined(TELEPLOT_SINGLE_THREAD)
                    char os[64] = { 0 };
                    if (pthread_getname_np(pthread_self(), os, sizeof(os)) == 0) { thread = os; }
#endif
                    if (thread.empty()) { static std::atomic<int> counter{1}; thread = "thread " + std::to_string(++counter); }
                }
                std::string full = std::string(name) + "." + thread;
                fresh = byName_.find(std::string_view(full)) == byName_.end();
                index = find_(full);
            }
            fresh = fresh || !entries_[index].attrs.count(ATTR_STACK);
        }
        if (fresh) {
            attrBytes_(index, ATTR_STACK, Bytes_().u8(1));
            bool label;
            { std::lock_guard<Lock_> g(lock_); label = !entries_[index].userLabel && !entries_[index].attrs.count(ATTR_LABEL); }
            if (label) { attrText_(index, ATTR_LABEL, name); }
        }
        return index;
    }
    std::uint32_t stackPush_(std::string_view name, std::string_view level, std::size_t& before) {
        std::uint32_t index = stackEntry_(name);
        if (index == NONE_) { return NONE_; }
        std::string path;
        {
            std::lock_guard<Lock_> g(lock_);
            std::string& p = entries_[index].stackPath;
            before = p.size();
            if (!p.empty()) { p += "/"; }
            p += level;
            path = p;
        }
        Samples(this, index, std::nullopt).update(path);
        return index;
    }
    void stackPop_(std::uint32_t index, std::size_t before) {
        std::string path;
        { std::lock_guard<Lock_> g(lock_); std::string& p = entries_[index].stackPath; if (p.size() > before) { p.resize(before); } path = p; }
        Samples(this, index, std::nullopt).update(path);
    }
    void stackAt_(std::string_view name, std::string_view path, std::optional<Time> t) {
        std::uint32_t index = stackEntry_(name);
        if (index == NONE_) { return; }
        { std::lock_guard<Lock_> g(lock_); entries_[index].stackPath = std::string(path); }
        Samples(this, index, t).update(path);
    }

    // ------------------------------------------------------------------ Commands
    void declareParam_(std::uint32_t index, ParamBase_ const& p) {
        std::vector<std::byte> write, range, choices;
        {
            std::lock_guard<Lock_> g(lock_);
            write = Bytes_().u8(1).u8(p.type).u8(0).f64(p.step).u16(p.rate).u16(p.hold).u8(p.axes);
            range = Bytes_().f64(p.min).f64(p.max);
            std::string all; for (auto const& c : p.choices) { all += (all.empty() ? "" : "\n") + c; }
            choices = Bytes_().str(cut_(all, MAX_ATTR_TEXT_));
        }
        attrBytes_(index, ATTR_WRITE, std::move(write));
        attrBytes_(index, ATTR_RANGE, std::move(range));
        attrBytes_(index, ATTR_CHOICES, std::move(choices));
    }
    void declareAction_(std::uint32_t index, ActionImpl_ const& a) { attrBytes_(index, ATTR_WRITE, Bytes_().u8(2).u8(0).u8(a.flags).f64(std::nan("")).u16(0).u16(0).u8(0)); }
    void actionArg_(std::uint32_t index, std::shared_ptr<ActionImpl_> const& a, Arg arg) {
        if (!active_()) { return; }
        std::lock_guard<Lock_> g(lock_);
        std::string choices; for (auto const& c : arg.choices_) { choices += (choices.empty() ? "" : "\n") + c; }
        Bytes_ b;
        b.u8(static_cast<std::uint8_t>(a->args.size())).u8(arg.type_).u8(arg.optional_ ? 1 : 0).f64(arg.min_).f64(arg.max_).f64(arg.step_);
        b.str(cut_(arg.name_, 64)).str(cut_(arg.unit_, 32)).str(cut_(arg.default_, 128)).str(cut_(choices, 400)).str(cut_(arg.desc_, 300));
        a->args.push_back(std::move(arg));
        Entry_& e = entries_[index];
        e.args.push_back(std::move(b.b));
        e.attrsDirty = true;
    }
    bool handleCall_(Reader_& r) {
        std::uint16_t telemId = r.u16(), callId = r.u16();
        std::uint8_t count = r.u8();
        std::shared_ptr<ActionImpl_> a;
        { std::lock_guard<Lock_> g(lock_); auto found = actions_.find(telemId); if (found != actions_.end()) { a = found->second; } }
        Args args;
        args.call_ = { telemId, callId };
        for (std::uint8_t i = 0; i < count && r.ok(); ++i) {
            std::uint8_t at = r.u8();
            if (!a || at >= a->args.size()) { return false; } // (its arguments cannot be read: the rest of the packet neither)
            Arg const& spec = a->args[at];
            switch (spec.type_) {
                case Arg::Bool: { args.values_.push_back({ spec.name_, r.u8() != 0 }); break; }
                case Arg::Text: { args.values_.push_back({ spec.name_, r.str() }); break; }
                case Arg::XY: { std::vector<double> v{ r.f64() }; v.push_back(r.f64()); args.values_.push_back({ spec.name_, v }); break; }
                case Arg::XYZ: case Arg::Pose2D: { std::vector<double> v{ r.f64() }; v.push_back(r.f64()); v.push_back(r.f64()); args.values_.push_back({ spec.name_, v }); break; }
                default: { args.values_.push_back({ spec.name_, r.f64() }); break; }
            }
        }
        if (!r.ok()) { return false; }
        if (!a) { answer_(telemId, callId, 1, "unknown action"); return true; }
        std::optional<Result> again;
        { std::lock_guard<Lock_> g(lock_); for (auto const& [id, result] : a->recent) { if (id == callId) { again = result; } } }
        if (again) { answer_(telemId, callId, again->status, again->text); return true; } // sent again: answered again, not run twice
        for (Arg const& spec : a->args) {
            if (!spec.optional_ && !args.has(spec.name_)) { answer_(telemId, callId, 1, "missing " + spec.name_); return true; }
        }
        answer_(telemId, callId, 2, "");
        Result result = a->handler ? a->handler(args) : ok();
        {
            std::lock_guard<Lock_> g(lock_);
            a->recent.push_back({ callId, result });
            if (a->recent.size() > 16) { a->recent.pop_front(); }
        }
        if (result.status != 2) { answer_(telemId, callId, result.status, result.text); }
        return true;
    }
    void answer_(std::uint16_t telemId, std::uint16_t callId, std::uint8_t status, std::string const& text) {
        Bytes_ b;
        b.u8(MARKER_).u8(VERSION_).u16(clientId_).u8(SECT_CALL_ANSWER).u16(telemId).u16(callId).u8(status).str(cut_(text, MAX_TEXT_));
        std::lock_guard<std::mutex> s(sendLock_);
        sendPacket_(b.b);
    }

    // ------------------------------------------------------------------ Packets
    static bool& inSend_() { thread_local bool in = false; return in; }

    void flush_(bool tryOnly) {
        if (!active_() || inSend_()) { return; } // (an output that sends: not from inside a send)
        std::unique_lock<std::mutex> s(sendLock_, std::defer_lock);
        if (tryOnly) { if (!s.try_lock()) { return; } }
        else { s.lock(); }
        inSend_() = true;
        lastFlushMs_ = steadyMs_();
        packetReady_ = false;
        if (!tryOnly) { statsDue_(); } // (a nonBlocking caller does not wait for the lock they need)
        std::vector<std::byte> packet;
        // At most what was queued when it started: samples queued meanwhile (an output that logs what it sends) wait for the next one
        std::size_t packets = 0, limit = 0;
        for (;;) {
            bool built;
            if (tryOnly) { if (!lock_.try_lock()) { break; } }
            else { lock_.lock(); }
            if (packets == 0) { limit = 2 + entries_.size() + queued_ / 256; }
            built = ++packets <= limit && buildPacket_(packet);
            lock_.unlock();
            if (!built) { break; }
            sendPacket_(packet);
        }
        for (auto& out : outputs_) { if (out.file) { std::fflush(out.file); } }
        inSend_() = false;
    }

    // The next packet: client name, dashboards, descriptions, then samples (lock held). false: nothing to send.
    bool buildPacket_(std::vector<std::byte>& packet) {
        Bytes_ p;
        p.b.swap(packet);
        p.b.clear();
        p.u8(MARKER_).u8(VERSION_).u16(clientId_);
        const std::size_t start = p.b.size(), limit = PACKET_SIZE_ - 2; // (the checksum)
        auto room = [&]() { return limit - p.b.size(); };
        std::int64_t nowMs = steadyMs_(), every = options_.describeInterval_.count();

        if (nowMs - nameSentMs_ >= every) {
            p.u8(SECT_CLIENT_NAME).str(cut_(options_.name_, MAX_NAME_));
            nameSentMs_ = nowMs;
        }
        while (!dashboards_.empty() && dashboards_.front().size() + 2 <= room()) {
            p.u8(SECT_DASHBOARD).str(dashboards_.front());
            dashboards_.pop_front();
        }

        // Descriptions (and the samples sent once, again) of the telemetries whose turn it is
        std::vector<bool> waiting(entries_.size(), false); // descriptions not all sent: no sample of it in this packet
        bool full = false;
        for (std::uint32_t i = 0; i < entries_.size() && !full; ++i) {
            Entry_& e = entries_[i];
            if (!e.attrsDirty && nowMs - e.attrsSentMs < every) { continue; }
            if (e.attrCursor == 0) {
                e.items.clear();
                // Name first; codes in order, so the newer ones (11 and up: commands) come last, as the protocol asks
                e.items.push_back(Bytes_().u8(ATTR_NAME).str(e.name));
                for (auto const& [code, data] : e.attrs) { if (code < ATTR_ARGS) { e.items.push_back(Bytes_().u8(code).raw(data.data(), data.size())); } }
                for (auto const& a : e.args) { e.items.push_back(Bytes_().u8(ATTR_ARGS).raw(a.data(), a.size())); }
                for (auto const& [code, data] : e.attrs) { if (code > ATTR_ARGS) { e.items.push_back(Bytes_().u8(code).raw(data.data(), data.size())); } }
                auto again = [&](Latched_ const& l) { // sent once and not since: again, with its own time
                    if (nowMs - l.sentMs < every || !e.queues[l.key].empty()) { return; }
                    for (auto const& part : l.parts) { e.queues[l.key].push(l.ns, part.data(), part.size()); queued_ += part.size() + 8; }
                };
                for (auto const& [key, l] : e.latched) { again(l); }
                for (auto const& [name, l] : e.latchedThresholds) { again(l); }
            }
            while (e.attrCursor < e.items.size()) {
                if (room() < 4 + e.items[e.attrCursor].size()) {
                    if (p.b.size() == start) { e.attrCursor++; continue; } // (cannot fit even alone: skipped, never sent in a loop)
                    full = true;
                    break;
                }
                p.u8(SECT_ATTR).u16(e.id);
                std::size_t countAt = p.b.size();
                p.u8(0);
                std::uint8_t count = 0;
                while (e.attrCursor < e.items.size() && count < 255 && room() >= e.items[e.attrCursor].size()) {
                    p.raw(e.items[e.attrCursor].data(), e.items[e.attrCursor].size());
                    e.attrCursor++;
                    count++;
                }
                p.b[countAt] = static_cast<std::byte>(count);
            }
            if (e.attrCursor >= e.items.size()) { e.attrCursor = 0; e.attrsDirty = false; e.attrsSentMs = nowMs; }
            else { waiting[i] = true; }
        }

        // Samples, from a telemetry that changes at each packet (none waits behind a big one for ever)
        std::size_t n = entries_.size();
        for (std::size_t k = 0; k < n && !full; ++k) {
            std::uint32_t i = static_cast<std::uint32_t>((rr_ + k) % n);
            if (waiting[i]) { continue; }
            Entry_& e = entries_[i];
            for (auto& [key, q] : e.queues) {
                if (q.empty()) { continue; }
                bool f64 = (key >> 8) == SECT_FLOAT64;
                std::size_t header = 12 + (f64 ? 1 : 0);
                auto const& first = q.refs[q.head];
                if (room() < header + 4 + first.size) {
                    if (p.b.size() == start) { queued_ -= std::min<std::size_t>(queued_, first.size + 8); q.pop(); stats_.tooBig++; continue; }
                    full = true;
                    break;
                }
                std::int64_t reference = first.ns;
                p.u8(f64 ? static_cast<std::uint8_t>(SECT_FLOAT64) : static_cast<std::uint8_t>(key)).u16(e.id).u64(static_cast<std::uint64_t>(std::max<std::int64_t>(0, reference)));
                std::size_t countAt = p.b.size();
                p.u8(0);
                if (f64) { p.u8(static_cast<std::uint8_t>(key & 0xFF)); }
                std::uint8_t count = 0;
                while (!q.empty() && count < 255) {
                    auto const& ref = q.refs[q.head];
                    std::int64_t diff = ref.ns - reference;
                    // TIMEDIFF is an uint32 of ns (4.29 s): a sample out of it starts a section of its own
                    if (diff < 0 || diff > static_cast<std::int64_t>(std::numeric_limits<std::uint32_t>::max())) { break; }
                    if (room() < 4 + ref.size) { full = true; break; }
                    p.u32(static_cast<std::uint32_t>(diff)).raw(q.bytes.data() + ref.at, ref.size);
                    queued_ -= std::min<std::size_t>(queued_, ref.size + 8);
                    q.pop();
                    count++;
                }
                p.b[countAt] = static_cast<std::byte>(count);
                if (full) { break; }
            }
        }
        rr_++;
        bool any = p.b.size() > start;
        packet.swap(p.b);
        return any;
    }

    // The stats as telemetries, when it is time (sendStats). In a send: what they queue goes out with it.
    void statsDue_() {
        Stats now, before;
        double seconds;
        {
            std::lock_guard<std::mutex> l(statsMutex_);
            std::int64_t ms = steadyMs_();
            if (statsEveryMs_ <= 0 || ms - statsAtMs_ < statsEveryMs_) { return; }
            now = stats();
            before = statsBefore_;
            seconds = (ms - statsAtMs_) / 1000.0;
            statsBefore_ = now;
            statsAtMs_ = ms;
        }
        std::size_t queued;
        { std::lock_guard<Lock_> g(lock_); queued = queued_; }
        auto rate = [&](const char* name, std::uint64_t later, std::uint64_t earlier, const char* unit, const char* desc) {
            telemetry(name).unit(unit).label("teleplot sent").desc(desc).update(static_cast<double>(later - earlier) / seconds);
        };
        rate("teleplot.packets", now.packets, before.packets, "/s", "Packets sent per second");
        rate("teleplot.bytes", now.bytes, before.bytes, "B/s", "Bytes sent per second");
        rate("teleplot.samples", now.samples, before.samples, "/s", "Samples queued per second");
        telemetry("teleplot.queued").unit("B").label("teleplot sent").desc("Bytes waiting to be sent").update(static_cast<double>(queued));
        auto total = [&](const char* name, std::uint64_t value, const char* desc) { telemetry(name).label("teleplot problems").desc(desc).update(static_cast<double>(value)); };
        total("teleplot.dropped", now.dropped, "Samples dropped (queue full, or lock busy for a nonBlocking telemetry), since the start");
        total("teleplot.tooBig", now.tooBig, "Texts cut to fit a packet, lines refused, since the start");
        total("teleplot.sendErrors", now.sendErrors, "Socket or file errors, since the start");
        total("teleplot.wrongThread", now.wrongThread, "Samples of a oneThread() stack from another thread, since the start");
        total("teleplot.priorityRefused", now.priorityRefused, "Priorities or CPUs the system refused to a thread of Teleplot, since the start");
    }

    void sendPacket_(std::vector<std::byte>& packet) { // (send lock held)
        std::uint16_t checksum = 0;
        for (std::byte b : packet) { checksum = static_cast<std::uint16_t>(checksum + static_cast<std::uint8_t>(b)); }
        packet.push_back(static_cast<std::byte>(checksum & 0xFF));
        packet.push_back(static_cast<std::byte>(checksum >> 8));
        std::uint64_t errors = 0;
        for (auto& out : outputs_) {
            if (out.kind == 0 && out.socket != BAD_SOCKET_) {
                auto sent = ::sendto(out.socket, reinterpret_cast<const char*>(packet.data()), static_cast<int>(packet.size()), 0, reinterpret_cast<const sockaddr*>(&out.to), static_cast<int>(sizeof(out.to)));
                if (sent < 0) { errors++; }
            }
            else if (out.kind == 1 && out.file) {
                std::uint8_t length[4] = { static_cast<std::uint8_t>(packet.size()), static_cast<std::uint8_t>(packet.size() >> 8), static_cast<std::uint8_t>(packet.size() >> 16), static_cast<std::uint8_t>(packet.size() >> 24) };
                if (std::fwrite(length, 1, 4, out.file) != 4 || std::fwrite(packet.data(), 1, packet.size(), out.file) != packet.size()) { errors++; }
            }
            else if (out.kind == 2 && out.fn) { out.fn(packet.data(), packet.size()); }
            else { errors++; }
        }
        std::lock_guard<Lock_> g(lock_);
        stats_.packets++;
        stats_.bytes += packet.size();
        stats_.sendErrors += errors;
    }

    void openOutputs_() {
#ifdef _WIN32
        static bool started = [] { WSADATA data; return WSAStartup(MAKEWORD(2, 2), &data) == 0; }();
        (void)started;
#endif
        for (auto const& spec : options_.outputs_) {
            OpenOutput_ out;
            out.kind = spec.kind;
            if (spec.kind == 0) {
                out.socket = ::socket(AF_INET, SOCK_DGRAM, 0);
                out.to.sin_family = AF_INET;
                out.to.sin_port = htons(spec.port);
                if (inet_pton(AF_INET, spec.host.c_str(), &out.to.sin_addr) != 1) { out.to.sin_addr.s_addr = htonl(INADDR_LOOPBACK); stats_.sendErrors++; }
                if (out.socket != BAD_SOCKET_) {
#ifdef _WIN32
                    u_long nonBlocking = 1;
                    ioctlsocket(out.socket, FIONBIO, &nonBlocking);
#else
                    int flags = fcntl(out.socket, F_GETFL, 0);
                    if (flags >= 0) { fcntl(out.socket, F_SETFL, flags | O_NONBLOCK); }
#endif
                }
            }
            else if (spec.kind == 1) {
#ifdef _MSC_VER
                if (fopen_s(&out.file, spec.path.c_str(), "wb") != 0) { out.file = nullptr; }
#else
                out.file = std::fopen(spec.path.c_str(), "wb");
#endif
                static const std::uint8_t magic[8] = { 0x54, 0x50, 0x4C, 0x54, 0x0A, 0x01, 0x00, 0x00 }; // "TPLT", a line feed, the file version (doc/files.md)
                if (out.file) { std::fwrite(magic, 1, 8, out.file); } else { stats_.sendErrors++; }
            }
            else { out.fn = spec.fn; }
            outputs_.push_back(std::move(out));
        }
    }
    void closeOutputs_() {
        for (auto& out : outputs_) {
            if (out.socket != BAD_SOCKET_) {
#ifdef _WIN32
                closesocket(out.socket);
#else
                ::close(out.socket);
#endif
            }
            if (out.file) { std::fclose(out.file); }
        }
        outputs_.clear();
    }

    void startThread_() {
        threadStop_ = false;
        thread_ = std::thread([this] {
            std::unique_lock<std::mutex> l(threadMutex_);
            std::uint64_t applied = threadGeneration_ + 1;
            while (!threadStop_) {
                if (applied != threadGeneration_) { // (its priority, as set: again when it changes)
                    applied = threadGeneration_;
                    if (!threadReference_.applyToCurrentThread(threadPriority_, threadAffinity_)) { priorityRefused_++; }
                }
                threadWake_.wait_for(l, std::max(options_.flushInterval_, std::chrono::milliseconds(1)));
                if (threadStop_) { break; }
                l.unlock();
                flush();
                l.lock();
            }
        });
    }
    void stopThread_() {
        if (!thread_.joinable()) { return; }
        { std::lock_guard<std::mutex> l(threadMutex_); threadStop_ = true; }
        threadWake_.notify_all();
        thread_.join();
    }
};

#endif
