// 5. A state: a text whose latest value matters ("idle", "moving"...). The page shows it as a value, and over time on a timeline.
// Sending the same text again continues the state; an empty text means "nothing" (a hole on the timeline).
#include <Teleplot.h>

Teleplot tp(Serial);
const char* const STATES[] = { "idle", "moving", "charging", "" };

void setup() {
  Serial.begin(115200);
}

void loop() {
  const char* state = STATES[millis() / 3000 % 4];  // a new state every 3 s
  tp.update("mode", state);
  delay(100);
}
