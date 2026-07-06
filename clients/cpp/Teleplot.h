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
    };

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

        bool hasChanged = true;
        void update(TelemetryAttributes const& other) {
            if (other.unit.has_value())             { hasChanged |= (unit != other.unit);               unit = other.unit; }
            if (other.color.has_value())            { hasChanged |= (color != other.color);             color = other.color; }
            if (other.autoplot.has_value())         { hasChanged |= (autoplot != other.autoplot);       autoplot = other.autoplot; }
            if (other.dataTimeout.has_value())      { hasChanged |= (dataTimeout != other.dataTimeout); dataTimeout = other.dataTimeout; }
            if (other.shape.has_value())            { hasChanged |= (shape != other.shape);             shape = other.shape; }
            if (other.shapeData.has_value())        { hasChanged |= (shapeData != other.shapeData);     shapeData = other.shapeData; }
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

    template<typename T>
    void update(std::string const& name, T value, std::optional<std::chrono::nanoseconds> timestamp = std::nullopt, TelemetryAttributes const& attributes = {}) {
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

                    if (encoder.remainingCapacity() - CHECKSUM_SIZE >= attrSize) {
                        sectionEncoder << static_cast<std::uint8_t>(attributesToFlush.size());
                        for (auto& [attrType, attrEncoder] : attributesToFlush) {
                            sectionEncoder << attrType << attrEncoder;
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

private:
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

        explicit BinaryEncoder(std::endian order = std::endian::big) : order_(order) {
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