// Board functions the examples call, for run_example.cpp: time is simulated (delay() moves it forward), pins do nothing
#ifndef TELEPLOT_TEST_ARDUINO_FUNCTIONS_H
#define TELEPLOT_TEST_ARDUINO_FUNCTIONS_H
#include "Arduino.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>
#define A0 14
#define LED_BUILTIN 13
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#ifndef PI
#define PI 3.14159265358979323846
#endif
extern uint64_t simulatedMicros;
inline void delay(unsigned long ms) { simulatedMicros += ms * 1000ULL; }
inline void delayMicroseconds(unsigned int us) { simulatedMicros += us; }
inline int analogRead(int) { return 512; }
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
inline long random(long from, long to) { return from + rand() % (to - from); }
inline void configTime(long, int, const char*) {}
#endif
