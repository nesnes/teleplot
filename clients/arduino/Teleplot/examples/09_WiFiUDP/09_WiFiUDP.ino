// 9. Over WiFi (ESP32): the same calls, sent over UDP to the Teleplot server on your computer (port 47269).
// Set your network and the address of the computer that runs the server.
#include <WiFi.h>
#include <WiFiUdp.h>
#include <Teleplot.h>

const char* NETWORK = "my-network";
const char* PASSWORD = "my-password";
const char* COMPUTER = "192.168.1.10";

WiFiUDP udp;
Teleplot tp(udp, COMPUTER, 47269);

void setup() {
  WiFi.begin(NETWORK, PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(200);
  }
  udp.begin(47270);  // a port of the board: what the page writes back comes to it
}

void loop() {
  tp.update("rssi", WiFi.RSSI());
  tp.update("wave", sin(millis() / 1000.0));
  tp.poll();   // sends the lines waiting in a packet, reads what came back
  delay(50);
}
