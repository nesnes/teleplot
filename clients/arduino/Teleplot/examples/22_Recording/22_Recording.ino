// 22. Recording on an SD card: the same lines go to the serial port and to a file. Open the file in the page (Export and import
// panel, or drop it on the page). Without a clock that gives the date (21_Clock), its times count from the boot of the board.
// The SD library takes about 1 KB of RAM (a block of 512 bytes and more): on an Uno (2 KB), Teleplot keeps only the tables this
// sketch uses (see 31_SmallBoards).
#define TELEPLOT_MAX_TELEMETRIES 1
#define TELEPLOT_MAX_PARAMS 0
#define TELEPLOT_MAX_ACTIONS 0
#define TELEPLOT_MAX_ARGS 1
#define TELEPLOT_MAX_THRESHOLDS 0
#define TELEPLOT_MAX_STACKS 0
#define TELEPLOT_LINE_SIZE 16
#define TELEPLOT_RESULT_SIZE 4
#include <SD.h>
#include <Teleplot.h>

Teleplot tp(Serial);
File file;

void setup() {
  Serial.begin(115200);
  if (SD.begin(4)) {                                   // 4: the chip select pin of your SD card reader
    file = SD.open("run.txt", FILE_WRITE);             // (a .teleplot.txt name once on the computer)
    tp.addOutput(file);
  }
}

void loop() {
  tp.update("temperature", 20 + analogRead(A0) * 0.01);
  file.flush();                                        // written to the card now (or a few lines are lost at power off)
  delay(500);
}
