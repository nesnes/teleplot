#include "Teleplot.h"
#include <cassert>
// Builds a packet as the page writes it (see 025-commands.js): header, sections, checksum
struct P { std::vector<std::byte> b; template<typename T> P& w(T v) { auto* p = reinterpret_cast<std::byte*>(&v); b.insert(b.end(), p, p + sizeof(T)); return *this; } P& s(std::string const& t) { for (char c : t) b.push_back(std::byte(c)); b.push_back(std::byte{0}); return *this; } };
int main() {
    std::vector<std::vector<std::byte>> sent;
    Teleplot tp({ .clientName = "test", .clientId = 7, .sendPacketFunction = [&](std::vector<std::byte> const& p) { sent.push_back(p); } });
    float kp = 0.4f; bool motors = false; Teleplot::Number3D pose{1, 2, 0};
    tp.param("kp", &kp, { .min = 0.0, .max = 10.0, .step = 0.01 });
    tp.param("motors", &motors);
    tp.param("pose", &pose, { .pose2d = true });
    std::vector<double> got;
    tp.action("goto", [&](Teleplot::Args const& a) { got = std::get<std::vector<double>>(a.at("target")); return Teleplot::ok("arrived"); },
        { .title = "Go to", .args = { { .name = "target", .type = Teleplot::WriteType::XY }, { .name = "speed", .optional = true } } });
    tp.flush();
    assert(!sent.empty());
    std::uint16_t kpId = static_cast<std::uint16_t>(std::hash<std::string>{}("kp")), gotoId = static_cast<std::uint16_t>(std::hash<std::string>{}("goto")), poseId = static_cast<std::uint16_t>(std::hash<std::string>{}("pose")), motorsId = static_cast<std::uint16_t>(std::hash<std::string>{}("motors"));
    sent.clear();
    // The page writes kp = 12.3 (clamped to 10), motors = 1, pose
    P a; a.w<std::uint8_t>(0x10).w<std::uint8_t>(1).w<std::uint16_t>(7);
    a.w<std::uint8_t>(20).w<std::uint16_t>(kpId).w<std::uint64_t>(0).w<std::uint8_t>(1).w<std::uint32_t>(0).w<float>(12.3f);
    a.w<std::uint8_t>(20).w<std::uint16_t>(motorsId).w<std::uint64_t>(0).w<std::uint8_t>(1).w<std::uint32_t>(0).w<float>(1.f);
    a.w<std::uint8_t>(22).w<std::uint16_t>(poseId).w<std::uint64_t>(0).w<std::uint8_t>(1).w<std::uint32_t>(0).w<float>(3.f).w<float>(2.5f).w<float>(0.5f);
    a.w<std::uint16_t>(0);
    tp.handlePacket(a.b.data(), a.b.size());
    assert(kp == 10.f && motors && pose.x == 3.f && pose.z == 0.5f);
    // A call, twice: run once, answered twice
    P c; c.w<std::uint8_t>(0x10).w<std::uint8_t>(1).w<std::uint16_t>(7).w<std::uint8_t>(41).w<std::uint16_t>(gotoId).w<std::uint16_t>(21).w<std::uint8_t>(1).w<std::uint8_t>(0).w<double>(1.5).w<double>(2.0).w<std::uint16_t>(0);
    int runs = 0;
    tp.handlePacket(c.b.data(), c.b.size()); runs += got.size() == 2;
    got.clear();
    tp.handlePacket(c.b.data(), c.b.size());
    assert(runs == 1 && got.empty());
    int answers = 0;
    for (auto const& p : sent) if (p.size() > 8 && p[4] == std::byte{42}) { answers++; }
    assert(answers == 3); // run, ok, and ok again
    // A call without its required argument
    P m; m.w<std::uint8_t>(0x10).w<std::uint8_t>(1).w<std::uint16_t>(7).w<std::uint8_t>(41).w<std::uint16_t>(gotoId).w<std::uint16_t>(22).w<std::uint8_t>(0).w<std::uint16_t>(0);
    sent.clear(); tp.handlePacket(m.b.data(), m.b.size());
    assert(sent.size() == 1 && sent[0][9] == std::byte{1});
    std::cout << "cpp client ok" << std::endl;
}
