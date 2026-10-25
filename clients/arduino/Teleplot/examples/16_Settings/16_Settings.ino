// 16. A setting the page can change: switch CMD on in the page, then edit "gain" in its view.
// poll() reads what the page wrote, applies it (within the range, by steps) and sends it back.
#include <Teleplot.h>

Teleplot tp(Serial);
float gain = 1;

void setup() {
  Serial.begin(115200);
  tp.param("gain", &gain).range(0, 5).step(0.1).desc("How big the wave is");
}

void loop() {
  tp.poll();
  tp.update("wave", gain * sin(millis() / 1000.0));
  delay(20);
}
