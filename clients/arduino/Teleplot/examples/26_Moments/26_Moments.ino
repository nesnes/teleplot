// 26. Moments: periods of your application, a cycle, an operation, a phase. The page steps through them, replays them and exports them.
// "#42" numbers each occurrence, "/" nests, "=ok" ends a moment with its result.
#include <Teleplot.h>

Teleplot tp(Serial);
int pick = 0;

void setup() {
  Serial.begin(115200);
  tp.telemetry("cycle").moment();
}

void loop() {
  char path[32];
  pick++;
  snprintf(path, sizeof(path), "run 1/pick#%d/approach", pick);
  tp.stack("cycle", path);
  delay(100);
  snprintf(path, sizeof(path), "run 1/pick#%d/grip", pick);
  tp.stack("cycle", path);
  delay(100);
  snprintf(path, sizeof(path), "run 1/pick#%d=%s", pick, pick % 7 == 0 ? "failed" : "ok");
  tp.stack("cycle", path);
  delay(50);
}
