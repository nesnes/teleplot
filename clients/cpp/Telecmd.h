// Telecmd
// Source: https://github.com/nesnes/teleplot

#ifndef TELECMD_H
#define TELECMD_H

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <netinet/in.h>

#include <iostream>
#include <sstream> 
#include <map>
#include <functional>

//#define TELECMD_DISABLE // Would prevent telecmd from doing anything, useful for production builds

#define TELECMD_INPUT_BUFFER_SIZE 1024
class Telecmd {
public:
    Telecmd(std::string address) : address_(address)
    {
        #ifdef TELECMD_DISABLE
            return ;
        #endif
        // Create UDP socket
        sockfd_ = socket(AF_INET, SOCK_DGRAM, 0);
        memset(&serv_, 0, sizeof(serv_));
        memset(&client_, 0, sizeof(client_));
        serv_.sin_family = AF_INET; // IPv4
        serv_.sin_addr.s_addr = htonl(INADDR_ANY);
        serv_.sin_port = htons(47268);

        // Set addr reuse
        uint8_t yes = 1;
        setsockopt(sockfd_, SOL_SOCKET, SO_REUSEADDR, (char*) &yes, sizeof(yes));
        setsockopt(sockfd_, SOL_SOCKET, SO_REUSEPORT, (const char*)&yes, sizeof(yes));

        // Set socket timeout
        struct timeval timeout;
        timeout.tv_sec = 0;
        timeout.tv_usec = 100;
        setsockopt(sockfd_, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeout, sizeof(timeout));

        // Create Answer UDP socket
        sockfdOut_ = socket(AF_INET, SOCK_DGRAM, 0);
        servOut_.sin_family = AF_INET;
        servOut_.sin_port = htons(47269);
        servOut_.sin_addr.s_addr = inet_addr(address_.c_str());

        // Listen to UDP socket
        if ( bind(sockfd_, (const struct sockaddr *)&serv_, sizeof(serv_)) >= 0 ) {
            serverReady_ = true;
        }
        else {
            std::cout << "Telecmd init failed" <<std::endl;
        }
    };
    ~Telecmd() = default;

    // Static localhost instance
    static Telecmd &localhost() {static Telecmd telecmd("127.0.0.1"); return telecmd;}
    
    void run() {
        #ifdef TELECMD_DISABLE
            return ;
        #endif
        // Read input socket
        if(!serverReady_) return;
        socklen_t socklen = sizeof(client_);
        ssize_t n = recvfrom(sockfd_, (char *)inputBuffer_, sizeof(inputBuffer_), MSG_DONTWAIT, ( struct sockaddr *) &client_, &socklen);
        if(n<=0 or n>= TELECMD_INPUT_BUFFER_SIZE) return;
        std::string cmd(inputBuffer_, n);

        // Perform requested command
        if(cmd.rfind("|_telecmd_list_cmd|", 0) == 0){
            sendCommandList();
        }
        else {
            parseFunctionCall(cmd);
        }
    }

    void registerCmd(std::string name, std::function<void(std::string)> func){
        functionMap_[name] = func;
    }

private:
    void sendCommandList(){
        std::string cmdList = "|";
        for (auto const& registeredCmd : functionMap_)
        {
            cmdList += registeredCmd.first + "|";
        }
        sendto(sockfdOut_, cmdList.c_str(), cmdList.size(), MSG_CONFIRM, (const struct sockaddr *) &servOut_, sizeof(servOut_));
    }

    void parseFunctionCall(std::string const& cmd) {
        try {
            if(cmd.size() == 0 || cmd[0] != '|') return;
            // Function Name
            size_t nameEnd = cmd.find("|", 1);
            if(nameEnd == std::string::npos) return;
            std::string name = cmd.substr(1, nameEnd-1);
            // Function Params
            std::string params = "";
            size_t paramStart = nameEnd+1;
            if(paramStart<cmd.size())
            {
                size_t paramsEnd = cmd.find("|", paramStart);
                if(paramsEnd != std::string::npos) { params = cmd.substr(paramStart, paramsEnd-paramStart); }
            }
            callFunction(name, params);
        }
        catch(const std::exception& e){
            std::cout << e.what() << std::endl;
        }
    }

    void callFunction(std::string const& name, std::string const& params){
        // Find function in map
        if(functionMap_.find(name) == functionMap_.end()) return;
        functionMap_[name](params);   
    }

    int sockfd_;
    int sockfdOut_;
    bool serverReady_ = false;
    std::string address_;
    sockaddr_in serv_, client_, servOut_;
    char inputBuffer_[TELECMD_INPUT_BUFFER_SIZE];
    std::map<std::string, std::function<void(std::string const)>> functionMap_;
};

#endif