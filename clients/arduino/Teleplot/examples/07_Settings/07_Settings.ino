// 7. A setting the page can change: switch CMD on in the page, then edit "blink.period" in its view.
// poll() reads what the page wrote, applies it (within the range, by steps) and sends it back.
#include <Teleplot.h>

#ifndef LED_BUILTIN
#define LED_BUILTIN 2  // (boards that do not say where their LED is, as the generic ESP32: GPIO 2 on most of them)
#endif

Teleplot tp(Serial);
float period = 0.5;  // seconds

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  tp.param("blink.period", &period).range(0.1, 2).step(0.1).unit("s");
}

void loop() {
  bool on = (millis() / (unsigned long)(period * 1000)) % 2;
  digitalWrite(LED_BUILTIN, on ? HIGH : LOW);
  tp.poll();
  delay(10);
}
