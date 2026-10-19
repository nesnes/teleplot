// Teleplot
// Source: https://github.com/nesnes/teleplot

#ifndef CPP_TELEPLOT_H
#define CPP_TELEPLOT_H

#include <arpa/inet.h>
#include <fcntl.h>
#include <string>
#include <unistd.h>
#include <functional>
#include <optional>
#include <cstdint>
#include <iostream>
#include <chrono>
#include <unordered_map>
#include <deque>
#include <variant>
#include <numeric>
#include <limits>
#include <algorithm>
#include <map>
#include <cmath>

// Binary encoder
#include <bit>
#include <cstddef>
#include <cstring>
#include <string_view>
#include <type_traits>
#include <vector>

// #define TELEPLOT_DISABLE // Would prevent teleplot from doing anything, useful for production builds

class Teleplot 
{
    class BinaryEncoder;

public:

    constexpr static std::uint32_t MAX_PACKET_SIZE = 1432; // from https://github.com/statsd/statsd/blob/master/docs/metric_types.md
    constexpr static std::uint32_t CHECKSUM_SIZE = 2;
    constexpr static std::uint8_t BINARY_MARKER = 0x10; 
    constexpr static std::uint8_t BINARY_PROTOCOL_VERSION = 1; 

    struct TeleplotOptions
    {
        std::string address = "127.0.0.1";
        std::uint16_t udpPort = 47269;
        std::string clientName = "";
        std::uint16_t clientId = 0; // IDs of each telemetry will be incremented from here. Change this number to avoid collisions with multiple clients
        std::chrono::milliseconds targetAttributesFlushInterval = std::chrono::milliseconds(5000); // How often to re-send telemetry attributes to the server (and some teleplot options like the client name)
        std::function<void(std::vector<std::byte> const&)> sendPacketFunction = nullptr; // select function used to send packets, default to internal function
    };

    enum TELEM_ATTR : std::uint8_t {
        TELEM_ATTR_NAME          = 0,
        TELEM_ATTR_UNIT          = 1,
        TELEM_ATTR_COLOR         = 2,
        TELEM_ATTR_AUTOPLOT      = 3,
        TELEM_ATTR_DATA_TIMEOUT  = 4,
        TELEM_ATTR_SHAPE         = 5,
        TELEM_ATTR_RANGE         = 9,
        // Commands (doc/telecmd.md)
        TELEM_ATTR_WRITE         = 11,
        TELEM_ATTR_CHOICES       = 12,
        TELEM_ATTR_ARGS          = 13,
        TELEM_ATTR_DESC          = 14,
        TELEM_ATTR_TITLE         = 15,
    };
    enum TELEM_ATTR_SHAPE_TYPE : std::uint8_t {
        TELEM_ATTR_SHAPE_TYPE_CUBE = 0,
        TELEM_ATTR_SHAPE_TYPE_SPHERE = 1,
        TELEM_ATTR_SHAPE_TYPE_CYLINDER = 2,
        TELEM_ATTR_SHAPE_TYPE_STL = 10,
    };

    enum SECTION_TYPE : std::uint8_t {
        SECTION_TYPE_RESERVED = 0,
        SECTION_TYPE_CLIENT_NAME = 1,
        SECTION_TYPE_TELEM_ATTR = 10,
        SECTION_TYPE_TELEM_DATA_NUMBER = 20,
        SECTION_TYPE_TELEM_DATA_NUMBER_2D = 21,
        SECTION_TYPE_TELEM_DATA_NUMBER_3D = 22,
        SECTION_TYPE_TELEM_DATA_TEXT = 23,
        SECTION_TYPE_TELEM_DATA_IMAGE = 24,
        SECTION_TYPE_TELEM_DATA_SHAPE_3D_POSITION = 25,
        SECTION_TYPE_TELEM_DATA_SHAPE_3D_ROTATION = 26,
        SECTION_TYPE_TELEM_DATA_SHAPE_3D_QUATERNION = 27,
        SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_STR = 28,
        SECTION_TYPE_TELEM_DATA_SHAPE_COLOR_RGB = 29,
        SECTION_TYPE_TELEM_DATA_SHAPE_OPACITY = 30,
        SECTION_TYPE_TELEM_DATA_SHAPE_SIZE = 31,
        SECTION_TYPE_TELEM_DATA_SHAPE_TEXTURE = 32,
        SECTION_TYPE_CALL = 41,        // Page to device: a call of an action
        SECTION_TYPE_CALL_ANSWER = 42, // Device to page: run, ok or err
    };

    // ------------------------------------------------------------------ Commands (telecmd, doc/telecmd.md)
    // What the page may write (a setting) or call (an action). The page sends packets back to the socket the telemetry comes from:
    // call poll() often, it reads them, applies them, answers, and publishes the settings (their echo tells the page they were applied).
    enum class WriteType : std::uint8_t { Data = 0, Number = 1, Bool = 2, Text = 3, XY = 4, XYZ = 5, Pose2D = 6 };
    enum WriteAxis : std::uint8_t { AXIS_X = 1, AXIS_Y = 2, AXIS_YAW = 4 };
    struct ParamOptions {
        std::optional<double> min = std::nullopt, max = std::nullopt, step = std::nullopt;
        std::optional<std::string> unit = std::nullopt, desc = std::nullopt;
        std::vector<std::string> choices = {};
        std::uint16_t rate = 0, hold = 0; // Continuous (a joystick): writes per second, ms after which it goes back to rest
        std::uint8_t axes = 0;            // Of an xy or pose2d: AXIS_X | AXIS_YAW for a base that cannot go sideways (0: all)
        bool pose2d = false;              // A Number3D that is x, y, yaw
        std::function<std::optional<std::string>(void)> onChange = nullptr; // Called after a write; a text refuses it (the value is put back)
    };
    struct ArgSpec {
        std::string name;
        WriteType type = WriteType::Number;
        bool optional = false;
        std::optional<double> min = std::nullopt, max = std::nullopt, step = std::nullopt;
        std::string unit = "", defaultValue = "", desc = "";
        std::vector<std::string> choices = {};
    };
    struct ActionOptions {
        std::string title = "", desc = "", color = "";
        bool confirm = false, longpress = false;
        std::vector<ArgSpec> args = {};
    };
    using ArgValue = std::variant<double, bool, std::string, std::vector<double>>; // number, bool, text, xy / xyz / pose2d
    using Args = std::unordered_map<std::string, ArgValue>;
    struct ActionResult { bool ok = true; std::string text = ""; };
    static ActionResult ok(std::string text = "") { return { true, std::move(text) }; }
    static ActionResult error(std::string text) { return { false, std::move(text) }; }

    enum TELEM_DATA_IMAGE_TYPE : std::uint8_t {
        TELEM_DATA_IMAGE_TYPE_PNG = 0,
        TELEM_DATA_IMAGE_TYPE_JPG = 1,
    };

    /*struct Telemetry
    {
        Telemetry() {};
        std::unordered_map<TELEM_ATTR, std::any> attributes;
    };
    
    std::unordered_map<std::string, Telemetry> telemetryMap;*/
    struct TelemetryAttributes {
        // name is not optional
        std::optional<std::string> unit = std::nullopt;
        std::optional<std::string> color = std::nullopt;
        std::optional<bool> autoplot = std::nullopt;
        std::optional<std::uint64_t> dataTimeout = std::nullopt;
        std::optional<TELEM_ATTR_SHAPE_TYPE> shape = std::nullopt;
        std::optional<std::string> shapeData = std::nullopt;
        std::vector<std::pair<TELEM_ATTR, std::vector<std::byte>>> extra = {}; // Already encoded (commands: write, choices, arguments...)

        bool hasChanged = true;
        void update(TelemetryAttributes const& other) {
            if (other.unit.has_value())             { hasChanged |= (unit != other.unit);               unit = other.unit; }
            if (other.color.has_value())            { hasChanged |= (color != other.color);             color = other.color; }
            if (other.autoplot.has_value())         { hasChanged |= (autoplot != other.autoplot);       autoplot = other.autoplot; }
            if (other.dataTimeout.has_value())      { hasChanged |= (dataTimeout != other.dataTimeout); dataTimeout = other.dataTimeout; }
            if (other.shape.has_value())            { hasChanged |= (shape != other.shape);             shape = other.shape; }
            if (other.shapeData.has_value())        { hasChanged |= (shapeData != other.shapeData);     shapeData = other.shapeData; }
            if (!other.extra.empty())               { hasChanged |= (extra != other.extra);             extra = other.extra; }
        };
    };

    // TELEMETRY DATA TYPES
    // Number needs no struct
    struct Number2D {
        float x;
        float y;
    };
    struct Number3D {
        float x;
        float y;
        float z;
    };
    // Text needs no struct
    struct Image {
        TELEM_DATA_IMAGE_TYPE type;
        std::size_t size;
        std::byte* data;
    };
    
    Teleplot() {
        TeleplotOptions defaultOptions;
        setOptions(defaultOptions);
    }

    Teleplot(TeleplotOptions options) {
        setOptions(options);
    }
    
    // Static localhost instance
    static Teleplot &instance() {static Teleplot teleplot; return teleplot;}
    
    ~Teleplot() {
        
    }

    void enable() {
        enabled_ = true;
        connect();
    }

    void disable() {
        enabled_ = false;
        disconnect();
    }

    void setOptions(TeleplotOptions const& options) {
        options_ = options;
        // Resolve client id
        if (options_.clientId == 0 and not options_.clientName.empty()) {
            options_.clientId = static_cast<std::uint16_t>(hashString_(options_.clientName));
        }
        connect();
    }

    TeleplotOptions getOptions() const {
        return options_;
    }

    struct Telemetry {
        std::string name;
        std::uint16_t id;
        SECTION_TYPE type;
        TelemetryAttributes attributes;
        std::chrono::milliseconds lastAttributesFlushTime_ = std::chrono::milliseconds(0);
        std::deque<std::pair<std::chrono::nanoseconds, std::variant<float, Number2D, Number3D, std::string, Image>>> data = {};
    };

    // (overloads rather than default arguments: a default argument of a nested struct with member initializers does not compile everywhere)
    template<typename T> void update(std::string const& name, T value) { update(name, value, std::nullopt, TelemetryAttributes{}); }
    template<typename T> void update(std::string const& name, T value, std::optional<std::chrono::nanoseconds> timestamp) { update(name, value, timestamp, TelemetryAttributes{}); }
    template<typename T>
    void update(std::string const& name, T value, std::optional<std::chrono::nanoseconds> timestamp, TelemetryAttributes const& attributes) {
        #ifdef TELEPLOT_DISABLE
            return;
        #endif
        if(not enabled_) { return; }
        if (name.empty()) { return; }

        SECTION_TYPE type = SECTION_TYPE_RESERVED;
        if constexpr (std::is_convertible_v<T, std::string>) { type = SECTION_TYPE_TELEM_DATA_TEXT; }
        else if constexpr (std::is_arithmetic_v<T>)          { type = SECTION_TYPE_TELEM_DATA_NUMBER; }
        else if constexpr (std::is_same_v<T, Number2D>)      { type = SECTION_TYPE_TELEM_DATA_NUMBER_2D;}
        else if constexpr (std::is_same_v<T, Number3D>)      { type = SECTION_TYPE_TELEM_DATA_NUMBER_3D; }
        else if constexpr (std::is_same_v<T, Image>)         { type = SECTION_TYPE_TELEM_DATA_IMAGE; }
        else {
            static_assert(sizeof(T) == -1, "Value type provided to Teleplot update(...) function is no supported.");
        }
        
        // Only insert in map if missing
        telemetryMap_.emplace(name, Telemetry{name, static_cast<std::uint16_t>(hashString_(name)), type, attributes});

        // Update attributes
        telemetryMap_[name].attributes.update(attributes);

        // Use current timestamp if not provided
        if (not timestamp.has_value()) {
            timestamp = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::system_clock::now().time_since_epoch());
        }

        // Insert data into telemetry
        if constexpr (std::is_arithmetic_v<T>) {
            telemetryMap_[name].data.emplace_back(timestamp.value(), static_cast<float>(value));
        }
        else {
            telemetryMap_[name].data.emplace_back(timestamp.value(), value);
        }

        // TODO send data
        // Need a default automatic way but that is a bit smart like
        // Need a user-delegated way (like a flush or a send function)

    }

    void flush() {
        #ifdef TELEPLOT_DISABLE
            return;
        #endif
        if(not enabled_) { return; }

        while (hasDataToFlush()) {
            bool encoderFull = false;
            BinaryEncoder encoder;

            // Header
            encoder << BINARY_MARKER << BINARY_PROTOCOL_VERSION << options_.clientId;

            // Options
            if (shallFlushOptions()) {
                // Flush options
                encoder << SECTION_TYPE_CLIENT_NAME;
                encoder << options_.clientName;
                lastOptionsFlushTime_ = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch());
            }

            // Attributes
            for (auto& [name, telemetry] : telemetryMap_) {
                if (shallFlushTelemetryAttributes(telemetry)) {
                    BinaryEncoder sectionEncoder;
                    sectionEncoder << SECTION_TYPE_TELEM_ATTR << telemetry.id;
                    std::unordered_map<TELEM_ATTR, BinaryEncoder> attributesToFlush;
                    // Name
                    attributesToFlush[TELEM_ATTR_NAME] << telemetry.name;
                    if (telemetry.attributes.unit.has_value())          { attributesToFlush[TELEM_ATTR_UNIT] << telemetry.attributes.unit.value(); }
                    if (telemetry.attributes.color.has_value())         { attributesToFlush[TELEM_ATTR_COLOR] << telemetry.attributes.color.value(); }
                    if (telemetry.attributes.autoplot.has_value())      { attributesToFlush[TELEM_ATTR_AUTOPLOT] << telemetry.attributes.autoplot.value(); }
                    if (telemetry.attributes.dataTimeout.has_value())   { attributesToFlush[TELEM_ATTR_DATA_TIMEOUT] << telemetry.attributes.dataTimeout.value(); }
                    if (telemetry.attributes.shape.has_value()) { 
                        attributesToFlush[TELEM_ATTR_SHAPE] << telemetry.attributes.shape.value();
                        if (telemetry.attributes.shape.value() == TELEM_ATTR_SHAPE_TYPE_STL) {
                            std::string data = "";
                            if (telemetry.attributes.shapeData.has_value()) { data = telemetry.attributes.shapeData.value(); }
                            attributesToFlush[TELEM_ATTR_SHAPE] << data;
                        }
                    }

                    // Get total telemetry attributes size
                    std::size_t attrSize = sizeof(std::uint8_t) + std::accumulate(attributesToFlush.begin(), attributesToFlush.end(), std::size_t(0), [](std::size_t sum, auto const& pair) {
                        return sum + sizeof(TELEM_ATTR) + pair.second.size();
                    });
                    for (auto const& [attrType, bytes] : telemetry.attributes.extra) { attrSize += sizeof(TELEM_ATTR) + bytes.size(); }

                    if (encoder.remainingCapacity() - CHECKSUM_SIZE >= attrSize) {
                        sectionEncoder << static_cast<std::uint8_t>(attributesToFlush.size() + telemetry.attributes.extra.size());
                        for (auto& [attrType, attrEncoder] : attributesToFlush) {
                            sectionEncoder << attrType << attrEncoder;
                        }
                        // (the attributes the protocol added later go last: a viewer that does not know them stops reading there)
                        for (auto const& [attrType, bytes] : telemetry.attributes.extra) {
                            sectionEncoder << attrType;
                            sectionEncoder.write(bytes.data(), bytes.size());
                        }
                        encoder << sectionEncoder;
                        telemetry.attributes.hasChanged = false;
                        telemetry.lastAttributesFlushTime_ = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch());
                    }
                    else { encoderFull = true; break; }
                }
            }

            // Telemetry data
            if (!encoderFull and encoder.remainingCapacity() >= 20) { // 20 is a random margin to avoid appending new data to an almost-full encoder (avoids edge cases close to encoder full)
                for (auto& [name, telemetry] : telemetryMap_) {
                    if (! shallFlushTelemetryData(telemetry)) { continue; }
                    BinaryEncoder sectionEncoder;
                    sectionEncoder << telemetry.type << telemetry.id;

                    // Find the time reference
                    std::chrono::nanoseconds timeReference = telemetry.data.front().first;
                    sectionEncoder << static_cast<std::uint64_t>(timeReference.count());
                    std::size_t dataCountIndex = sectionEncoder.position();
                    std::uint8_t dataCount = 0;
                    sectionEncoder << static_cast<std::uint8_t>(0);
                    
                    // Add data
                    for (auto& [timestamp, value] : telemetry.data) {
                        BinaryEncoder dataEncoder; // Create a new encoder for each data point to check if it fits in the section encoder
                        // Timediff from reference
                        std::chrono::nanoseconds timeDiff = timestamp - timeReference;
                        // TIMEDIFF is an uint32 of nanoseconds (about 4.29 s): a sample outside of its range (too late after the reference, or before it)
                        // can't be encoded in this section. It stays queued and is sent as the reference of a new section (next flush loop).
                        if (timeDiff.count() < 0 or timeDiff.count() > std::numeric_limits<std::uint32_t>::max()) { break; }
                        dataEncoder << static_cast<std::uint32_t>(timeDiff.count());
                        // Data
                        switch (telemetry.type) {
                            case SECTION_TYPE_TELEM_DATA_NUMBER:    { dataEncoder << std::get<float>(value); break; }
                            case SECTION_TYPE_TELEM_DATA_NUMBER_2D: { dataEncoder << std::get<Number2D>(value).x << std::get<Number2D>(value).y; break; }
                            case SECTION_TYPE_TELEM_DATA_NUMBER_3D: { dataEncoder << std::get<Number3D>(value).x << std::get<Number3D>(value).y << std::get<Number3D>(value).z; break; }
                            case SECTION_TYPE_TELEM_DATA_TEXT:      { dataEncoder << std::get<std::string>(value); break; }
                            case SECTION_TYPE_TELEM_DATA_IMAGE:     { break;  }
                            default: { break; }
                        }

                        // Add data in packet
                        if(encoder.remainingCapacity() - CHECKSUM_SIZE - sectionEncoder.size() >= dataEncoder.size() && dataCount < 255) {
                            telemetry.data.pop_front();
                            sectionEncoder << dataEncoder;
                            dataCount++;
                            *reinterpret_cast<std::uint8_t*>(sectionEncoder.data_at(dataCountIndex)) = dataCount;
                        }
                        else { encoderFull = true; break; }                        
                    }
                    encoder << sectionEncoder;
                    if (encoderFull) { break; }
                }
            }

            sendPacket(encoder);
        }
    }

    // ------------------------------------------------------------------ Commands
    // A setting the page may write. *value is applied by poll() (clamped to min / max, rounded to step) and published, so read it
    // after poll(). T: float, double, int, bool, std::string, Number2D, Number3D (pose2d with options.pose2d).
    template<typename T> void param(std::string const& name, T* value) { param(name, value, ParamOptions{}); }
    template<typename T>
    void param(std::string const& name, T* value, ParamOptions options) {
        WriteType type = WriteType::Number;
        if constexpr (std::is_same_v<T, bool>)             { type = WriteType::Bool; }
        else if constexpr (std::is_arithmetic_v<T>)        { type = WriteType::Number; }
        else if constexpr (std::is_same_v<T, std::string>) { type = WriteType::Text; }
        else if constexpr (std::is_same_v<T, Number2D>)    { type = WriteType::XY; }
        else if constexpr (std::is_same_v<T, Number3D>)    { type = options.pose2d ? WriteType::Pose2D : WriteType::XYZ; }
        else { static_assert(sizeof(T) == -1, "Teleplot param(...): float, double, int, bool, std::string, Number2D or Number3D"); }
        Param p;
        p.type = type;
        p.options = options;
        p.publish = [this, name, value]() {
            if constexpr (std::is_same_v<T, bool>) { update(name, *value ? 1.0f : 0.0f); }
            else { update(name, *value); }
        };
        p.write = [value, type, options](std::vector<double> const& numbers, std::string const& text) {
            (void)type; (void)text; // (used by some of the types only)
            auto clamp = [&](double v) {
                if (options.min) { v = std::max(*options.min, v); }
                if (options.max) { v = std::min(*options.max, v); }
                if (options.step && *options.step > 0) { double base = options.min.value_or(0.0); v = base + std::round((v - base) / *options.step) * *options.step; }
                return v;
            };
            if constexpr (std::is_same_v<T, bool>)             { *value = !numbers.empty() && numbers[0] != 0; }
            else if constexpr (std::is_arithmetic_v<T>)        { if (!numbers.empty()) { *value = static_cast<T>(clamp(numbers[0])); } }
            else if constexpr (std::is_same_v<T, std::string>) { *value = text; }
            else if constexpr (std::is_same_v<T, Number2D>)    { if (numbers.size() >= 2) { *value = { static_cast<float>(clamp(numbers[0])), static_cast<float>(clamp(numbers[1])) }; } }
            else if constexpr (std::is_same_v<T, Number3D>)    { if (numbers.size() >= 3) { *value = { static_cast<float>(clamp(numbers[0])), static_cast<float>(clamp(numbers[1])), static_cast<float>(type == WriteType::Pose2D ? numbers[2] : clamp(numbers[2])) }; } }
        };
        p.rest = [value]() { (void)value; if constexpr (std::is_arithmetic_v<T> && !std::is_same_v<T, bool>) { *value = 0; } else if constexpr (std::is_same_v<T, Number2D>) { *value = { 0, 0 }; } else if constexpr (std::is_same_v<T, Number3D>) { *value = { 0, 0, 0 }; } };
        TelemetryAttributes attributes;
        attributes.unit = options.unit;
        attributes.extra.push_back({ TELEM_ATTR_WRITE, encodeWrite_(1, type, 0, options.step, options.rate, options.hold, options.axes) });
        if (!options.choices.empty()) { attributes.extra.push_back({ TELEM_ATTR_CHOICES, encodeText_(join_(options.choices)) }); }
        if (options.desc) { attributes.extra.push_back({ TELEM_ATTR_DESC, encodeText_(*options.desc) }); }
        params_[static_cast<std::uint16_t>(hashString_(name))] = p;
        params_[static_cast<std::uint16_t>(hashString_(name))].name = name;
        if constexpr (std::is_same_v<T, bool>) { update(name, *value ? 1.0f : 0.0f, std::nullopt, attributes); }
        else { update(name, *value, std::nullopt, attributes); }
        if (options.min || options.max) { // The range (TELEM_ATTR_RANGE): the bar of the value in the page, and the limits of its slider
            BinaryEncoder e;
            e << options.min.value_or(std::nan("")) << options.max.value_or(std::nan(""));
            telemetryMap_[name].attributes.extra.push_back({ TELEM_ATTR_RANGE, e.data() });
            telemetryMap_[name].attributes.hasChanged = true;
        }
    }

    // An action the page may call: handler(args) returns ok() or error("why"). It runs in poll().
    void action(std::string const& name, std::function<ActionResult(Args const&)> handler) { action(name, handler, ActionOptions{}); }
    void action(std::string const& name, std::function<ActionResult(Args const&)> handler, ActionOptions options) {
        std::uint16_t id = static_cast<std::uint16_t>(hashString_(name));
        actions_[id] = { name, handler, options, {} };
        TelemetryAttributes attributes;
        std::uint8_t flags = (options.confirm ? 1 : 0) | (options.longpress ? 2 : 0);
        attributes.extra.push_back({ TELEM_ATTR_WRITE, encodeWrite_(2, WriteType::Data, flags, std::nullopt, 0, 0, 0) });
        if (!options.title.empty()) { attributes.extra.push_back({ TELEM_ATTR_TITLE, encodeText_(options.title) }); }
        if (!options.desc.empty()) { attributes.extra.push_back({ TELEM_ATTR_DESC, encodeText_(options.desc) }); }
        if (!options.color.empty()) { attributes.color = options.color; }
        for (std::size_t i = 0; i < options.args.size(); ++i) {
            ArgSpec const& arg = options.args[i];
            BinaryEncoder e;
            e << static_cast<std::uint8_t>(i) << static_cast<std::uint8_t>(arg.type) << static_cast<std::uint8_t>(arg.optional ? 1 : 0);
            e << arg.min.value_or(std::nan("")) << arg.max.value_or(std::nan("")) << arg.step.value_or(std::nan(""));
            e << std::string_view(arg.name) << std::string_view(arg.unit) << std::string_view(arg.defaultValue) << std::string_view(join_(arg.choices)) << std::string_view(arg.desc);
            attributes.extra.push_back({ TELEM_ATTR_ARGS, e.data() });
        }
        telemetryMap_.emplace(name, Telemetry{name, id, SECTION_TYPE_RESERVED, attributes});
        telemetryMap_[name].attributes.update(attributes);
    }

    // Reads what the page sent, applies it and answers; publishes the settings (their echo) every publishInterval; flushes.
    void poll() { poll(std::chrono::milliseconds(200)); }
    void poll(std::chrono::milliseconds publishInterval) {
        #ifdef TELEPLOT_DISABLE
            return;
        #endif
        if (not enabled_) { return; }
        if (sockfd_ >= 0) {
            std::byte buffer[2048];
            for (;;) {
                ssize_t n = recvfrom(sockfd_, buffer, sizeof(buffer), 0, nullptr, nullptr);
                if (n <= 0) { break; }
                handlePacket(buffer, static_cast<std::size_t>(n));
            }
        }
        auto now = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch());
        for (auto& [id, p] : params_) { // A continuous setting nobody drives any more goes back to rest
            if (p.options.hold > 0 && p.writtenAt.count() > 0 && now - p.writtenAt > std::chrono::milliseconds(p.options.hold)) { p.rest(); p.writtenAt = std::chrono::milliseconds(0); p.publish(); }
        }
        if (now - lastPublishTime_ >= publishInterval) {
            for (auto& [id, p] : params_) { p.publish(); }
            lastPublishTime_ = now;
        }
        flush();
    }

    // A packet of the binary protocol written by the page (poll() reads them from the socket; public for other transports)
    void handlePacket(std::byte const* data, std::size_t size) {
        Reader r{data, size - (size >= CHECKSUM_SIZE ? CHECKSUM_SIZE : size), 0};
        if (r.u8() != BINARY_MARKER || r.u8() != BINARY_PROTOCOL_VERSION) { return; }
        r.u16(); // (the client id: ours)
        while (r.ok() && r.at < r.size) {
            std::uint8_t section = r.u8();
            if (section == SECTION_TYPE_CALL) {
                std::uint16_t telemId = r.u16(), callId = r.u16();
                std::uint8_t count = r.u8();
                auto found = actions_.find(telemId);
                Args args;
                for (std::uint8_t i = 0; i < count && r.ok(); ++i) {
                    std::uint8_t index = r.u8();
                    if (found == actions_.end() || index >= found->second.options.args.size()) { return; } // (its arguments cannot be read)
                    ArgSpec const& spec = found->second.options.args[index];
                    switch (spec.type) {
                        case WriteType::Bool: { args[spec.name] = r.u8() != 0; break; }
                        case WriteType::Text: { args[spec.name] = r.str(); break; }
                        case WriteType::XY:   { std::vector<double> v{ r.f64(), r.f64() }; args[spec.name] = v; break; }
                        case WriteType::XYZ: case WriteType::Pose2D: { std::vector<double> v{ r.f64(), r.f64(), r.f64() }; args[spec.name] = v; break; }
                        default: { args[spec.name] = r.f64(); break; }
                    }
                }
                if (!r.ok()) { return; }
                if (found == actions_.end()) { answer_(telemId, callId, 1, "unknown action"); continue; }
                Action& a = found->second;
                auto done = std::find_if(a.recent.begin(), a.recent.end(), [&](auto const& c) { return c.first == callId; });
                if (done != a.recent.end()) { answer_(telemId, callId, done->second.ok ? 0 : 1, done->second.text); continue; } // (sent again: answered again, not run twice)
                for (ArgSpec const& spec : a.options.args) {
                    if (!spec.optional && args.find(spec.name) == args.end()) { answer_(telemId, callId, 1, "missing " + spec.name); return; }
                }
                answer_(telemId, callId, 2, "");
                ActionResult result = a.handler(args);
                a.recent.push_back({ callId, result });
                if (a.recent.size() > 16) { a.recent.erase(a.recent.begin()); }
                answer_(telemId, callId, result.ok ? 0 : 1, result.text);
                continue;
            }
            if (section < SECTION_TYPE_TELEM_DATA_NUMBER || section > SECTION_TYPE_TELEM_DATA_TEXT) { return; } // (not something written to a setting)
            std::uint16_t telemId = r.u16();
            r.u64(); // (time reference: the page's, meaningless here)
            std::uint8_t count = r.u8();
            std::vector<double> numbers;
            std::string text;
            for (std::uint8_t i = 0; i < count && r.ok(); ++i) {
                r.u32();
                numbers.clear();
                if (section == SECTION_TYPE_TELEM_DATA_TEXT) { text = r.str(); }
                else { for (int c = 0; c < section - SECTION_TYPE_TELEM_DATA_NUMBER + 1; ++c) { numbers.push_back(r.f32()); } }
            }
            auto found = params_.find(telemId);
            if (!r.ok() || found == params_.end()) { continue; } // (not declared: ignored)
            Param& p = found->second;
            p.write(numbers, text);
            p.writtenAt = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch());
            if (p.options.onChange) {
                std::optional<std::string> refused = p.options.onChange();
                if (refused) { answer_(telemId, CALL_ID_SETTING, 1, *refused); }
            }
            p.publish(); // The echo: what is applied
        }
    }

    constexpr static std::uint16_t CALL_ID_SETTING = 0xFFFF;

private:
    struct Param {
        std::string name;
        WriteType type = WriteType::Number;
        ParamOptions options;
        std::function<void()> publish, rest;
        std::function<void(std::vector<double> const&, std::string const&)> write;
        std::chrono::milliseconds writtenAt = std::chrono::milliseconds(0);
    };
    struct Action {
        std::string name;
        std::function<ActionResult(Args const&)> handler;
        ActionOptions options;
        std::vector<std::pair<std::uint16_t, ActionResult>> recent; // Calls already run, and what they gave
    };
    struct Reader {
        std::byte const* data; std::size_t size; std::size_t at; bool failed = false;
        bool ok() const { return !failed; }
        bool need(std::size_t n) { if (at + n > size) { failed = true; return false; } return true; }
        template<typename T> T raw() { T v{}; if (need(sizeof(T))) { std::memcpy(&v, data + at, sizeof(T)); at += sizeof(T); } return v; } // (little-endian machines: the protocol's order)
        std::uint8_t u8() { return raw<std::uint8_t>(); }
        std::uint16_t u16() { return raw<std::uint16_t>(); }
        std::uint32_t u32() { return raw<std::uint32_t>(); }
        std::uint64_t u64() { return raw<std::uint64_t>(); }
        float f32() { return raw<float>(); }
        double f64() { return raw<double>(); }
        std::string str() { std::string s; while (!failed && need(1) && data[at] != std::byte{0}) { s.push_back(static_cast<char>(data[at])); ++at; } if (need(1)) { ++at; } return s; }
    };
    static std::string join_(std::vector<std::string> const& list) { std::string out; for (auto const& s : list) { out += (out.empty() ? "" : "\n") + s; } return out; }
    static std::vector<std::byte> encodeText_(std::string const& text) { BinaryEncoder e; e << std::string_view(text); return e.data(); }
    static std::vector<std::byte> encodeWrite_(std::uint8_t kind, WriteType type, std::uint8_t flags, std::optional<double> step, std::uint16_t rate, std::uint16_t hold, std::uint8_t axes) {
        BinaryEncoder e;
        e << kind << static_cast<std::uint8_t>(type) << flags << step.value_or(std::nan("")) << rate << hold << axes;
        return e.data();
    }
    void answer_(std::uint16_t telemId, std::uint16_t callId, std::uint8_t status, std::string const& text) {
        BinaryEncoder encoder;
        encoder << BINARY_MARKER << BINARY_PROTOCOL_VERSION << options_.clientId;
        encoder << SECTION_TYPE_CALL_ANSWER << telemId << callId << status << std::string_view(text);
        sendPacket(encoder);
    }
    std::map<std::uint16_t, Param> params_;
    std::map<std::uint16_t, Action> actions_;
    std::chrono::milliseconds lastPublishTime_ = std::chrono::milliseconds(0);

    void connect() {
        #ifdef TELEPLOT_DISABLE
            return;
        #endif
        if(not enabled_) { return; }

        disconnect();

        // Create UDP socket
        sockfd_ = socket(AF_INET, SOCK_DGRAM, 0);
        serv_.sin_family = AF_INET;
        serv_.sin_port = htons(static_cast<std::uint16_t>(options_.udpPort));
        serv_.sin_addr.s_addr = inet_addr(options_.address.c_str());
        if (sockfd_ >= 0) {
            int fl = fcntl(sockfd_, F_GETFL, 0);
            if (fl >= 0) (void)fcntl(sockfd_, F_SETFL, fl | O_NONBLOCK);
        }
        std::cout << "connected" << std::endl;
    }

    void disconnect() {
        if (sockfd_ >= 0) { (void)::close(sockfd_); sockfd_ = -1; }
    }

    bool shallFlushOptions() const {
        std::chrono::milliseconds now = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch());
        return (now - lastOptionsFlushTime_ >= options_.targetAttributesFlushInterval);
    }

    bool shallFlushTelemetryAttributes(Telemetry const& telemetry) const {
        std::chrono::milliseconds now = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch());
        return telemetry.attributes.hasChanged or (now - telemetry.lastAttributesFlushTime_ >= options_.targetAttributesFlushInterval);
    }

     bool shallFlushTelemetryData(Telemetry const& telemetry) const {
        return not telemetry.data.empty();
     }

    bool hasDataToFlush() const {
        return shallFlushOptions() or std::any_of(telemetryMap_.begin(), telemetryMap_.end(), [this](auto const& pair) {
            return shallFlushTelemetryAttributes(pair.second) or shallFlushTelemetryData(pair.second);
        });
    }

    void sendPacket(BinaryEncoder& encoder) {
         #ifdef TELEPLOT_DISABLE
            return;
        #endif
        if(not enabled_) { return; }

        // Checksum
        std::uint16_t checksum = 0;
        for (std::size_t i = 0; i < encoder.size(); ++i) {
            checksum += static_cast<std::uint16_t>(encoder.data()[i]);
        }
        encoder << checksum;

        // Send packet
        if (options_.sendPacketFunction != nullptr) {
            options_.sendPacketFunction(encoder.data());
        }
        else {
            if (sockfd_ >= 0) {
                (void)sendto(sockfd_, encoder.data().data(), encoder.size(), 0, (struct sockaddr *)&serv_, sizeof(serv_));
                std::cout << "sent" << encoder.size() << std::endl;
            }
        }
    }

    // Options
    bool enabled_ = true;
    TeleplotOptions options_;

    // Flush
    std::chrono::milliseconds lastOptionsFlushTime_ = std::chrono::milliseconds(0);
    std::chrono::milliseconds lastFlushTime_ = std::chrono::milliseconds(0);

    // Tools
    std::hash<std::string> hashString_;

    // Network
    int sockfd_{-1};
    sockaddr_in serv_;

    // Telemetry data
    std::unordered_map<std::string, Telemetry> telemetryMap_;




    class BinaryEncoder
    {
    public:

        explicit BinaryEncoder(std::endian order = std::endian::little) : order_(order) { // Protocol byte order (see doc/binaryProtocol.md). No swap is needed on little-endian machines
            buffer_.reserve(Teleplot::MAX_PACKET_SIZE);
        }

        std::size_t remainingCapacity() const noexcept {
            return Teleplot::MAX_PACKET_SIZE - buffer_.size();
        }

        std::size_t size() const noexcept {
            return buffer_.size();
        }

        BinaryEncoder& operator<<(bool value)
        {
            std::uint8_t byte = value ? 1 : 0;
            buffer_.push_back(std::byte{byte});
            return *this;
        }

        template<typename T, std::enable_if_t<std::is_integral_v<T>, int> = 0>
        BinaryEncoder& operator<<(T value) {
            using U = std::make_unsigned_t<T>;
            U bits = static_cast<U>(value);
            if (needs_swap()) { bits = byteswap(bits); }
            append(bits);
            return *this;
        }

        template<typename T, std::enable_if_t<std::is_floating_point_v<T>, int> = 0>
        BinaryEncoder& operator<<(T value) {
            if constexpr (sizeof(T) == 4) { 
                std::uint32_t u;
                memcpy(&u, &value, 4);
                return *this << u;
            }
            else {
                std::uint64_t u;
                memcpy(&u, &value, 8);
                return *this << u;
            }
        }

        template<typename E, std::enable_if_t<std::is_enum_v<E>, int> = 0>
        BinaryEncoder& operator<<(E value) {
            return *this << static_cast<std::underlying_type_t<E>>(value);
        }

        BinaryEncoder& operator<<(std::string_view s) {
            const auto* bytes = reinterpret_cast<const std::byte*>(s.data());
            buffer_.insert(buffer_.end(), bytes, bytes + s.size());
            buffer_.push_back(std::byte{0}); // Null terminator
            return *this;
        }

        BinaryEncoder& operator<<(const BinaryEncoder& other)
        {
            buffer_.insert(buffer_.end(), other.buffer_.begin(), other.buffer_.end());
            return *this;
        }

        BinaryEncoder& write(const std::byte* data, std::size_t size) {
            buffer_.insert(buffer_.end(), data, data + size);
            return *this;
        }

        [[nodiscard]]
        const std::vector<std::byte>& data() const noexcept {
            return buffer_;
        }

        [[nodiscard]]
        std::size_t position() const noexcept
        {
            return buffer_.size();
        }

        [[nodiscard]]
        std::byte* data_at(std::size_t offset) noexcept
        {
            return buffer_.data() + offset;
        }

    private:
        template<typename T>
        void append(const T& value) {
            static_assert(std::is_trivially_copyable_v<T>);
            const auto* bytes = reinterpret_cast<const std::byte*>(&value);
            buffer_.insert(buffer_.end(), bytes, bytes + sizeof(T));
        }

        [[nodiscard]]
        bool needs_swap() const noexcept {
            static_assert( std::endian::native == std::endian::little || std::endian::native == std::endian::big);
            if constexpr (std::endian::native == std::endian::little) { return order_ == std::endian::big; }
            else                                                      { return order_ == std::endian::little; }
        }

        template<typename T>
        static constexpr T byteswap(T value) noexcept
        {
            static_assert(std::is_unsigned_v<T>);
            if constexpr (sizeof(T) == 1) { return value; } // (a byte has nothing to swap)
            T result = 0;
            for (std::size_t i = 0; i < sizeof(T); ++i) {
                result <<= 8;
                result |= value & T{0xff};
                value >>= 8;
            }
            return result;
        }

        std::endian order_;
        std::vector<std::byte> buffer_;
    };
};

#endif