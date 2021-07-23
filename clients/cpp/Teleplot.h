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

class Teleplot {
public:
    Teleplot(std::string address) : address_(address)
    {
        sockfd_ = socket(AF_INET, SOCK_DGRAM, 0);
        serv_.sin_family = AF_INET;
        serv_.sin_port = htons(47269);
        serv_.sin_addr.s_addr = inet_addr(address_.c_str());
    };
    ~Teleplot() = default;

    // Static localhost instance
    static Teleplot &localhost() {static Teleplot teleplot("127.0.0.1"); return teleplot;}
    
    template<typename T>
    void update(std::string const& key, T value, unsigned int maxFrequencyHz=0) {
        if(shouldUpdateData(key ,maxFrequencyHz)) { // may be used to reduce the update frequency by ignoring some values
            emit(format(key, std::to_string(value)));    
        }
    }

private:
    std::string format(std::string const &key, std::string const& value){
        std::ostringstream oss;
        int64_t nowMs = std::chrono::time_point_cast<std::chrono::milliseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
        oss << key << ":" << value << ":" << nowMs << "|g";
        return oss.str();
    }

    void emit(std::string data)
    {
        int rp= sendto(sockfd_, data.c_str(), data.size(), 0, (struct sockaddr *)&serv_, sizeof(serv_));
    }

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

    int sockfd_;
    std::string address_;
    sockaddr_in serv_;
    std::map<std::string, int64_t> updateTimestampsUs_;
};

#endif
