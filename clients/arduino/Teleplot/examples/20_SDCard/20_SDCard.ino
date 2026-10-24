// 20. Recording on an SD card: the same lines go to the serial port and to a file. Open the file in the page (Export and import
// panel, or drop it on the page). Without a clock that gives the date (19_Dates), its times count from the boot of the board.
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
