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
    
    template<typename T>
    void update(std::string const& key, T value) { emit(format(key, std::to_string(value))); }

private:
    std::string format(std::string const &key, std::string const& value){
        std::ostringstream oss;
        oss << key << ":" << value << "|g";
        return oss.str();
    }

    void emit(std::string data)
    {
        int rp= sendto(sockfd_, data.c_str(), data.size(), 0, (struct sockaddr *)&serv_, sizeof(serv_));
    }

    int sockfd_;
    std::string address_;
    sockaddr_in serv_;
};

#endif
