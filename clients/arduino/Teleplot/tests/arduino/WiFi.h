#pragma once
#include "Arduino.h"
#define WL_CONNECTED 3
struct WiFiClass { void begin(const char*, const char*) {} int status() { return WL_CONNECTED; } int RSSI() { return -60; } };
extern WiFiClass WiFi;
