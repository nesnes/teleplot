// Teleplot
// Source: https://github.com/nesnes/teleplot

#ifndef TELEPLOT_H
#define TELEPLOT_H

#include <iostream>
#include <arpa/inet.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <sstream> 
#include <map>
#include <chrono>

// Enable/Disable implementation optimisations:
//#define TELEPLOT_DISABLE // Would prevent teleplot from doing anything, useful for production builds
#define TELEPLOT_USE_FREQUENCY // Allows to set a maxFrequency on updates (per key) but will instanciate a dynamic map
#define TELEPLOT_USE_BUFFERING // Allows to group updates sent, but will use a dynamic buffer map

#define TELEPLOT_FLAG_DEFAULT "g"
#define TELEPLOT_FLAG_NOPLOT "np"
#define TELEPLOT_FLAG_2D "xy"

class Teleplot {
public:
    Teleplot(std::string address, unsigned int bufferingFrequencyHz = 30)
        : address_(address)
        , bufferingFrequencyHz_(bufferingFrequencyHz)
    {
        #ifdef TELEPLOT_DISABLE
            return ;
        #endif
        // Create UDP socket
        sockfd_ = socket(AF_INET, SOCK_DGRAM, 0);
        serv_.sin_family = AF_INET;
        serv_.sin_port = htons(47269);
        serv_.sin_addr.s_addr = inet_addr(address_.c_str());
    };
    ~Teleplot() = default;

    // Static localhost instance
    static Teleplot &localhost() {static Teleplot teleplot("127.0.0.1"); return teleplot;}
    
    template<typename T>
    void update(std::string const& key, T const& value, unsigned int maxFrequencyHz=0, std::string flags=TELEPLOT_FLAG_DEFAULT) {
        #ifdef TELEPLOT_DISABLE
            return ;
        #endif
        double nowUs = std::chrono::time_point_cast<std::chrono::microseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
        double nowMs = nowUs/1000.f;
        updateData(key, nowMs, value, flags, maxFrequencyHz);
    }

    template<typename T1, typename T2>
    void update2D(std::string const& key, T1 const& valueX, T2 const& valueY, unsigned int maxFrequencyHz=0, std::string flags=TELEPLOT_FLAG_2D) {
        #ifdef TELEPLOT_DISABLE
            return ;
        #endif
        updateData(key, valueX, valueY, flags, maxFrequencyHz);
    }

    void log(std::string const& log){
        int64_t nowMs = std::chrono::time_point_cast<std::chrono::milliseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
        emit(">"+std::to_string(nowMs)+":"+log);
    }

private:
    template<typename T1, typename T2>
    void updateData(std::string const& key, T1 const& valueX, T2 const& valueY, std::string const& flags, unsigned int maxFrequencyHz) {
        #ifdef TELEPLOT_DISABLE
            return ;
        #endif
        // Filter
        #ifdef TELEPLOT_USE_FREQUENCY
            if(not shouldUpdateData(key ,maxFrequencyHz)) return; // may be used to reduce the update frequency by ignoring some values
        #endif

        // Format
        std::string valueStr = formatValues(valueX, valueY);

        // Emit
        #ifdef TELEPLOT_USE_BUFFERING
            buffer(key, valueStr, flags);
        #else
            emit(formatPacket(key, valueStr, flags));    
        #endif
    }

    template<typename T1, typename T2>
    std::string formatValues(T1 const& valueX, T2 const& valueY){
        std::ostringstream oss;
        oss << std::fixed << valueX << ":" << valueY;
        return oss.str();
    }

    std::string formatPacket(std::string const &key, std::string const& values, std::string const& flags){
        std::ostringstream oss;
        oss << key << ":" << values << "|" << flags;
        return oss.str();
    }

    void emit(std::string const& data){
        int rp = sendto(sockfd_, data.c_str(), data.size(), 0, (struct sockaddr *)&serv_, sizeof(serv_));
    }

    #ifdef TELEPLOT_USE_FREQUENCY 
        bool shouldUpdateData(std::string const& key, unsigned int frequency)
        {
            if(frequency==0) return true;
            int64_t nowUs = std::chrono::time_point_cast<std::chrono::microseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
            if(updateTimestampsUs_.find(key) == updateTimestampsUs_.end()) {
                updateTimestampsUs_[key] = nowUs;
                return true;
            }
            int64_t elasped = nowUs - updateTimestampsUs_[key];
            if(elasped >= 1e6/frequency) {
                updateTimestampsUs_[key] = nowUs;
                return true;
            }
            return false;
        }
        std::map<std::string, int64_t> updateTimestampsUs_;
    #endif

    #ifdef TELEPLOT_USE_BUFFERING
        void buffer(std::string const &key, std::string const& values, std::string const& flags) {
            //Make sure buffer exists
            if(bufferingMap_.find(key) == bufferingMap_.end()) {
                bufferingMap_[key] = "";
                bufferingFlushTimestampsUs_[key] = 0;
            }
            // Check that buffer isn't about to blow up
            size_t keySize = key.size() + 1;    // +1 is the separator
            size_t valuesSize = bufferingMap_[key].size() + values.size() + 1; // +1 is the separator
            size_t flagSize = 1 + flags.size(); // +1 is the separator
            size_t nextSize = keySize + valuesSize + flagSize;
            if(nextSize > maxBufferingSize_) {
                flushBuffer(key, flags, true); // Force flush
            }
            bufferingMap_[key] += values + ";";
            flushBuffer(key, flags);
        }

        void flushBuffer(std::string const& key, std::string const& flags, bool force=false) {
            // Flush the buffer if the frequency is reached
            int64_t nowUs = std::chrono::time_point_cast<std::chrono::microseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
            int64_t elasped = nowUs - bufferingFlushTimestampsUs_[key];
            if(force || elasped >= 1e6/bufferingFrequencyHz_) {
                emit(formatPacket(key, bufferingMap_[key], flags));
                bufferingMap_[key].clear();
                bufferingFlushTimestampsUs_[key] = nowUs;
            }
        }
        std::map<std::string, std::string> bufferingMap_;
        std::map<std::string, int64_t> bufferingFlushTimestampsUs_;
        size_t maxBufferingSize_ = 1432; // from https://github.com/statsd/statsd/blob/master/docs/metric_types.md
    #endif

    int sockfd_;
    std::string address_;
    sockaddr_in serv_;
    unsigned int bufferingFrequencyHz_;
    int64_t lastBufferingFlushTimestampUs_=0;
};

#endif
