#pragma once
#include "Arduino.h"
#define FILE_WRITE 1
class File : public TestStream { public: void flush() {} };
extern File sdFile;
struct SDClass { bool begin(int) { return true; } File& open(const char*, int) { return sdFile; } };
extern SDClass SD;
