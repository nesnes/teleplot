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

#define TELEPLOT_FLAG_DEFAULT ""
#define TELEPLOT_FLAG_NOPLOT "np"
#define TELEPLOT_FLAG_2D "xy"
#define TELEPLOT_FLAG_TEXT "text"

class ShapeTeleplot {
public:
    ShapeTeleplot(std::string name, std::string type, std::string color="")
    {
        this->name = name;
        this->type = type;
        this->color = color;
    };

    std::string getName()
    {
        return this->name;
    }

    ShapeTeleplot* setPosAndRot(int* posX, int* posY, int* posZ, int* rotX, int* rotY, int* rotZ, int* rotW)
    {
        this->posX = posX;
        this->posY = posY;
        this->posZ = posZ;
        this->rotX = rotX;
        this->rotY = rotY;
        this->rotZ = rotZ;
        this->rotW = rotW;

        return this;
    }

    ShapeTeleplot* setCubeProperties(int* height, int* width, int* depth)
    {
        this->height = height;
        this->width = width;
        this->depth = depth;

        return this;
    }

    ShapeTeleplot* setSphereProperties(int* radius, int* precision)
    {
        this->radius = radius;
        this->precision = precision;

        return this;
    }

    std::string toString()
    {
        std::string result = "S:"+this->type;

        if (this->color != "") result += ":C:"+this->color;
        
        if (this->posX != NULL || this->posY != NULL || this->posZ != NULL) 
        {
            result += ":P:";

            if (this->posX != NULL)
                result += std::to_string(*(this->posX));
            result += ":";

            if (this->posY != NULL) 
                result += std::to_string(*(this->posY));
            result += ":";

            if (this->posZ != NULL) 
                result += std::to_string(*(this->posZ));
        }

        if (this->rotX != NULL || this->rotY != NULL || this->rotZ != NULL || this->rotW != NULL) 
        {
            if (this->rotW != NULL)
                result += ":Q:";
            else
                result += ":R:";

            if (this->rotX != NULL)
                result += std::to_string(*(this->rotX));
            result += ":";

            if (this->rotY != NULL)
                result += std::to_string(*(this->rotY));
            result += ":";

            if (this->rotZ != NULL) 
                result += std::to_string(*(this->rotZ));

            if (this->rotW != NULL)
                result += (":"+ std::to_string(*(this->rotW)));
        }

        if (this->type == "sphere")
        {
            if (this->radius != NULL)
            {
                result += ":RA:";
                result += std::to_string(*(this->radius));
            }
            if (this->precision != NULL)
            {
                result += ":P:";
                result += std::to_string(*(this->precision));
            }
        }

        if (this->type == "cube")
        {
            if (this->height!= NULL)
            {
                result += ":H:";
                result += std::to_string(*(this->height));
            }
            if (this->width != NULL)
            {
                result += ":W:";
                result += std::to_string(*(this->width));
            }
            if (this->depth != NULL)
            {
                result += ":D:";
                result += std::to_string(*(this->depth));
            }
        }

        return result;
    }

private:
    std::string name = "";
    std::string type = "";
    std::string color = "";

    int* posX = NULL;
    int* posY = NULL;
    int* posZ = NULL;

    int* rotX = NULL;
    int* rotY = NULL;
    int* rotZ = NULL;
    int* rotW = NULL;

    int* height = NULL;
    int* width = NULL;
    int* depth = NULL;
    
    int* radius = NULL;
    int* precision = NULL;

};

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
    void update(std::string const& key, T const& value, std::string unit = "", unsigned int maxFrequencyHz=0, std::string flags=TELEPLOT_FLAG_DEFAULT) {
        #ifdef TELEPLOT_DISABLE
            return ;
        #endif
        int64_t nowUs = std::chrono::time_point_cast<std::chrono::microseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
        double nowMs = static_cast<double>(nowUs)/1000.d;
        updateData(key, nowMs, value, 0, flags, maxFrequencyHz, unit);
    }

    template<typename T1, typename T2>
    void update2D(std::string const& key, T1 const& valueX, T2 const& valueY, unsigned int maxFrequencyHz=0, std::string flags=TELEPLOT_FLAG_2D) {
        #ifdef TELEPLOT_DISABLE
            return ;
        #endif
        int64_t nowUs = std::chrono::time_point_cast<std::chrono::microseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
        double nowMs = static_cast<double>(nowUs)/1000.d;
        updateData(key, valueX, valueY, nowMs, flags, maxFrequencyHz);
    }

    void update3D(ShapeTeleplot* mshape, unsigned int maxFrequencyHz=0, std::string flags=TELEPLOT_FLAG_DEFAULT) {
        #ifdef TELEPLOT_DISABLE
            return ;
        #endif
        int64_t nowUs = std::chrono::time_point_cast<std::chrono::microseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
        double nowMs = static_cast<double>(nowUs)/1000.0;
        updateData(mshape->getName(), nowMs, NULL, NULL, flags, maxFrequencyHz, "", mshape);
    }

    void log(std::string const& log){
        int64_t nowMs = std::chrono::time_point_cast<std::chrono::milliseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
        emit(">"+std::to_string(nowMs)+":"+log);
    }

    bool shouldUpdateData(std::string const& key, unsigned int frequency)
    {
#ifdef TELEPLOT_USE_FREQUENCY 
        if(frequency<=0) return true;
        int64_t nowUs = std::chrono::time_point_cast<std::chrono::microseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
        if(updateTimestampsUs_.find(key) == updateTimestampsUs_.end()) {
            return true;
        }
        int64_t elasped = nowUs - updateTimestampsUs_[key];
        if(elasped >= static_cast<int64_t>(1e6/frequency)) {
            return true;
        }
        return false;
#else
        return true;
#endif
    }

private:
    #ifdef TELEPLOT_USE_FREQUENCY
    void saveUpdateDataTime(std::string const& key) {
        int64_t nowUs = std::chrono::time_point_cast<std::chrono::microseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
        updateTimestampsUs_[key] = nowUs;
    }
    #endif

    template<typename T1, typename T2, typename T3>
    void updateData(std::string const& key, T1 const& valueX, T2 const& valueY, T3 const& valueZ, std::string const& flags, unsigned int maxFrequencyHz, std::string unit="", ShapeTeleplot* mshape = NULL) {
        #ifdef TELEPLOT_DISABLE
            return ;
        #endif
        // Filter
        #ifdef TELEPLOT_USE_FREQUENCY
            if(not shouldUpdateData(key ,maxFrequencyHz)) return; // may be used to reduce the update frequency by ignoring some values
            saveUpdateDataTime(key);
        #endif

        // Format
        std::string valueStr = formatValues(valueX, valueY, valueZ, mshape, flags);

        // Emit
        bool is3D = mshape != NULL;

        #ifdef TELEPLOT_USE_BUFFERING
            buffer(key, valueStr, flags, unit, is3D);
        #else
            emit(formatPacket(key, valueStr, flags, unit, is3D));    
        #endif
    }

    template<typename T1, typename T2, typename T3>
    std::string formatValues(T1 const& valueX, T2 const& valueY, T3 const& valueZ, ShapeTeleplot* mshape, std::string const& flags){
        std::ostringstream oss;
        if (mshape != NULL) 
        {
            // valueX contains the timestamp
            oss << std::fixed << valueX << ":" << mshape->toString();
        }
        else
        {
            oss << std::fixed << valueX << ":" << valueY;
            if(flags.find(TELEPLOT_FLAG_2D) != std::string::npos){ oss << std::fixed << ":" << valueZ; }
        }
        return oss.str();
    }

    std::string formatPacket(std::string const &key, std::string const& values, std::string const& flags, std::string unit, bool is3D=false){
        std::ostringstream oss;        
        std::string unitFormatted = (unit == "") ? "" : "§" + unit;

        if (is3D)
            oss << "3D|";
            
        oss << key << ":" << values << unitFormatted <<"|" << flags;
        return oss.str();
    }

    void emit(std::string const& data){
        (void) sendto(sockfd_, data.c_str(), data.size(), 0, (struct sockaddr *)&serv_, sizeof(serv_));
    }

    #ifdef TELEPLOT_USE_BUFFERING
        void buffer(std::string const &key, std::string const& values, std::string const& flags, std::string unit, bool is3D = false) {
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
                flushBuffer(key, flags, unit, true, is3D); // Force flush
            }
            bufferingMap_[key] += values + ";";
            flushBuffer(key, flags, unit, false, is3D);
        }

        void flushBuffer(std::string const& key, std::string const& flags, std::string unit, bool force, bool is3D=false) {
            // Flush the buffer if the frequency is reached
            int64_t nowUs = std::chrono::time_point_cast<std::chrono::microseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
            int64_t elasped = nowUs - bufferingFlushTimestampsUs_[key];
            if(force || elasped >= static_cast<int64_t>(1e6/bufferingFrequencyHz_)) {
                emit(formatPacket(key, bufferingMap_[key], flags, unit, is3D));
                bufferingMap_[key].clear();
                bufferingFlushTimestampsUs_[key] = nowUs;
            }
        }
        std::map<std::string, std::string> bufferingMap_;

        std::map<std::string, int64_t> bufferingFlushTimestampsUs_;
        size_t maxBufferingSize_ = 1432; // from https://github.com/statsd/statsd/blob/master/docs/metric_types.md
    #endif
    #ifdef TELEPLOT_USE_FREQUENCY 
        std::map<std::string, int64_t> updateTimestampsUs_;
    #endif

    int sockfd_;
    std::string address_;
    sockaddr_in serv_;
    unsigned int bufferingFrequencyHz_;
    int64_t lastBufferingFlushTimestampUs_=0;
};

#endif
