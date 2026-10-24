// The C++ client alone: commands against packets written as the page writes them (025-commands.js), refusals, limits, threads.
// What it sends is checked by the library of the page in client.test.js.
#include "../Teleplot.h"
#include <cassert>
#include <iostream>

#define CHECK(what, cond) do { if (!(cond)) { std::cerr << "FAIL " << what << " (" #cond ")" << std::endl; std::exit(1); } std::cout << "ok   " << what << std::endl; } while (0)

// A packet as the page writes it: header, sections, checksum
struct P {
    std::vector<std::byte> b;
    template<class T> P& w(T v) { auto* p = reinterpret_cast<std::byte*>(&v); b.insert(b.end(), p, p + sizeof(T)); return *this; }
    P& s(std::string const& t) { for (char c : t) { b.push_back(std::byte(c)); } b.push_back(std::byte{0}); return *this; }
    P& head(std::uint16_t client) { return w<std::uint8_t>(0x10).w<std::uint8_t>(1).w<std::uint16_t>(client); }
    P& end() { return w<std::uint16_t>(0); }
};
static std::uint16_t idOf(std::string const& name) { // (as the client gives ids: FNV-1a folded to 16 bits, when no other name took it)
    std::uint32_t h = 2166136261u;
    for (char c : name) { h ^= static_cast<std::uint8_t>(c); h *= 16777619u; }
    return static_cast<std::uint16_t>((h >> 16) ^ (h & 0xFFFF));
}
static int answers(std::vector<std::vector<std::byte>> const& sent, std::uint8_t status) {
    int n = 0;
    for (auto const& p : sent) { if (p.size() > 9 && p[4] == std::byte{42} && p[9] == std::byte{status}) { n++; } }
    return n;
}

int main() {
    std::vector<std::vector<std::byte>> sent;
    Teleplot tp(Teleplot::Options().name("test").clientId(7).flushInterval(std::chrono::milliseconds(0))
        .output([&](const std::byte* p, std::size_t n) { sent.emplace_back(p, p + n); }));

    // Settings
    float kp = 0.4f; bool motors = false; Teleplot::Pose2D pose{ 1, 2, 0 }; std::string mode = "auto"; int count = 3;
    tp.param("kp", &kp).range(0, 10).step(0.01);
    tp.param("motors", &motors);
    tp.param("pose", &pose).range(-5, 5);
    tp.param("mode", &mode).choices({ "auto", "manual" });
    tp.param("count", &count).onChange([](int const& v) { return v % 2 ? Teleplot::ok() : Teleplot::error("odd only"); });
    tp.flush();
    CHECK("declarations are sent", !sent.empty());
    sent.clear();
    P a; a.head(7);
    a.w<std::uint8_t>(20).w<std::uint16_t>(idOf("kp")).w<std::uint64_t>(0).w<std::uint8_t>(1).w<std::uint32_t>(0).w<float>(12.3f);
    a.w<std::uint8_t>(20).w<std::uint16_t>(idOf("motors")).w<std::uint64_t>(0).w<std::uint8_t>(1).w<std::uint32_t>(0).w<float>(1.f);
    a.w<std::uint8_t>(22).w<std::uint16_t>(idOf("pose")).w<std::uint64_t>(0).w<std::uint8_t>(1).w<std::uint32_t>(0).w<float>(30.f).w<float>(2.5f).w<float>(7.f);
    a.end();
    tp.handlePacket(a.b.data(), a.b.size());
    CHECK("a number is clamped to its range", kp == 10.f);
    CHECK("a bool is applied", motors);
    CHECK("a pose2d: x, y clamped, yaw not", pose.x == 5 && pose.y == 2.5 && pose.yaw == 7);
    P m; m.head(7).w<std::uint8_t>(23).w<std::uint16_t>(idOf("mode")).w<std::uint64_t>(0).w<std::uint8_t>(1).w<std::uint32_t>(0).s("sport").end();
    sent.clear();
    tp.handlePacket(m.b.data(), m.b.size());
    CHECK("a text outside the choices is refused, nothing changes", mode == "auto" && answers(sent, 1) == 1);
    P c; c.head(7).w<std::uint8_t>(20).w<std::uint16_t>(idOf("count")).w<std::uint64_t>(0).w<std::uint8_t>(1).w<std::uint32_t>(0).w<float>(4.f).end();
    sent.clear();
    tp.handlePacket(c.b.data(), c.b.size());
    CHECK("onChange refuses before the value is applied", count == 3 && answers(sent, 1) == 1);

    // Actions: a call twice is run once, answered twice; a missing argument is refused; an action may finish later
    std::vector<double> got;
    int runs = 0;
    tp.action("goto", [&](Teleplot::Args const& args) { runs++; auto t = args.xy("target"); got = { t.x, t.y, args.number("speed", 0.3) }; return Teleplot::ok("arrived"); })
        .title("Go to").arg(Teleplot::Arg("target", Teleplot::Arg::XY)).arg(Teleplot::Arg("speed").optional());
    P call; call.head(7).w<std::uint8_t>(41).w<std::uint16_t>(idOf("goto")).w<std::uint16_t>(21).w<std::uint8_t>(1).w<std::uint8_t>(0).w<double>(1.5).w<double>(2.0).end();
    sent.clear();
    tp.handlePacket(call.b.data(), call.b.size());
    tp.handlePacket(call.b.data(), call.b.size());
    CHECK("a call sent twice runs once", runs == 1 && got == std::vector<double>({ 1.5, 2.0, 0.3 }));
    CHECK("it is answered run, ok, then ok again", answers(sent, 2) == 1 && answers(sent, 0) == 2);
    P missing; missing.head(7).w<std::uint8_t>(41).w<std::uint16_t>(idOf("goto")).w<std::uint16_t>(22).w<std::uint8_t>(0).end();
    sent.clear();
    tp.handlePacket(missing.b.data(), missing.b.size());
    CHECK("a call without a required argument is refused", runs == 1 && answers(sent, 1) == 1);
    Teleplot::Call later;
    tp.action("scan", [&](Teleplot::Args const& args) { later = args.call(); return Teleplot::running(); });
    P scan; scan.head(7).w<std::uint8_t>(41).w<std::uint16_t>(idOf("scan")).w<std::uint16_t>(5).w<std::uint8_t>(0).end();
    sent.clear();
    tp.handlePacket(scan.b.data(), scan.b.size());
    CHECK("running(): only run is answered", answers(sent, 2) == 1 && answers(sent, 0) == 0);
    tp.answer(later, Teleplot::ok("done"));
    tp.handlePacket(scan.b.data(), scan.b.size());
    CHECK("answer() finishes it; sent again, it is answered done", answers(sent, 0) == 2);

    // A text and a description too long for a packet: cut, never a flush that loops
    sent.clear();
    tp.update("long", std::string(5000, 'x'));
    tp.telemetry("verbose").desc(std::string(5000, 'd')).update(1);
    tp.flush();
    CHECK("too big: cut and counted, sent in a few packets", sent.size() < 5 && tp.stats().tooBig >= 2);

    // The queue has a limit: the oldest samples go first, counted
    {
        int packets = 0;
        Teleplot small(Teleplot::Options().maxQueuedBytes(4000).flushInterval(std::chrono::milliseconds(0)).output([&](const std::byte*, std::size_t) { packets++; }));
        for (int i = 0; i < 2000; ++i) { small.update("v", i); }
        CHECK("beyond maxQueuedBytes, samples are dropped and counted", small.stats().dropped > 1000);
        small.flush();
        CHECK("what is left is sent", packets >= 1 && packets < 10);
    }

    // Sent by the caller when it is time (flushInterval), or by a thread of its own
    {
        std::atomic<int> packets{0};
        Teleplot caller(Teleplot::Options().flushInterval(std::chrono::milliseconds(1)).output([&](const std::byte*, std::size_t) { packets++; }));
        caller.update("v", 1);
        std::this_thread::sleep_for(std::chrono::milliseconds(3));
        caller.update("v", 2);
        CHECK("Caller: update() sends when flushInterval has passed", packets >= 1);
        std::atomic<int> threaded{0};
        Teleplot thread(Teleplot::Options().sendFrom(Teleplot::Thread).flushInterval(std::chrono::milliseconds(2)).output([&](const std::byte*, std::size_t) { threaded++; }));
        thread.update("v", 1);
        for (int i = 0; i < 200 && threaded == 0; ++i) { std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
        CHECK("Thread: sent without flush()", threaded >= 1);
    }

    // Several threads at once, an output that sends from inside a send, disable()
    {
        std::atomic<int> packets{0};
        Teleplot shared(Teleplot::Options().flushInterval(std::chrono::milliseconds(1)).nonBlocking());
        shared.setOptions(Teleplot::Options().flushInterval(std::chrono::milliseconds(1)).output([&](const std::byte*, std::size_t) { packets++; shared.update("from.output", 1); shared.flush(); }));
        std::vector<std::thread> threads;
        for (int t = 0; t < 4; ++t) { threads.emplace_back([&, t] { for (int i = 0; i < 2000; ++i) { shared.update("t" + std::to_string(t), i); } }); }
        for (auto& th : threads) { th.join(); }
        shared.flush();
        Teleplot::Stats s = shared.stats();
        CHECK("4 threads: every sample is sent or counted as dropped", s.samples + s.dropped >= 8000 && packets > 0);
        shared.telemetry("solo").stack().oneThread();
        std::thread other([&] { Teleplot::Stack level(shared, "solo", "a"); });
        other.join();
        { Teleplot::Stack level(shared, "solo", "b"); }
        CHECK("oneThread(): another thread is counted and dropped", shared.stats().wrongThread == 1);
        int before = packets;
        shared.disable();
        shared.update("v", 1);
        shared.flush();
        CHECK("disable(): nothing is sent", packets == before);
    }
    std::cout << "cpp client ok" << std::endl;
    return 0;
}
