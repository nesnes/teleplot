// 31. Small boards (an Uno has 2 KB of RAM). The library keeps what it must send again in fixed tables: choose their sizes for
// what the sketch uses, BEFORE including it. sendStats() shows in the page what did not fit ("teleplot.tooBig").
// Defaults on AVR: 4 telemetries, 2 settings, 1 action.
#define TELEPLOT_MAX_TELEMETRIES 2   // telemetries given a description (unit, range, label...)
#define TELEPLOT_MAX_PARAMS 1
#define TELEPLOT_MAX_ACTIONS 0
#define TELEPLOT_MAX_STACKS 0
#define TELEPLOT_LINE_SIZE 32        // longest line the page writes (a setting: "name:value")
#include <Teleplot.h>

Teleplot tp(Serial);
float gain = 1;

void setup() {
  Serial.begin(115200);
  tp.telemetry("a").unit("V");
  tp.telemetry("b").unit("A");
  tp.telemetry("c").unit("W");       // a third one does not fit: its unit is not sent (counted in stats().tooBig)
  tp.param("gain", &gain);
  tp.sendStats(Teleplot::ms(1000));  // teleplot.samples, teleplot.bytes, teleplot.tooBig, teleplot.dropped, every second
}

void loop() {
  tp.update("a", 5.0);
  tp.update("b", 0.2 * gain);
  tp.update("c", 1.0);               // values are always sent, whatever the tables
  tp.poll();
  delay(100);
}
