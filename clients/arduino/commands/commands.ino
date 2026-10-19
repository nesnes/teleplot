// Teleplot commands over a serial port (doc/telecmd.md): a setting the page can change, an action it can call.
// Open the port from the Sources panel of the page, then switch CMD on (top menu).
// Telemetry lines start with ">" (the text protocol after it); what the page writes arrives as plain lines:
//   "speed:0.5"                 a setting, the line the board would send
//   "!blink#12:times=3"         a call: the action, its number, its arguments by name
// The board answers a call with ">ACK|blink#12:run", then ">ACK|blink#12:ok" (or ":err:why").

float speed = 0.2;          // A setting: 0 to 1
bool led = false;           // Another one
unsigned lastCall = 0;      // The last call that ran: a call sent again is answered again, not run twice
String line;

void declare() {            // Once at start, and again from time to time: the page may be opened later
  Serial.println(">ATTR|speed|write|min=0|max=1|step=0.05|desc=Speed of the blinking");
  Serial.println(">ATTR|led|write=bool");
  Serial.println(">ATTR|blink|action|title=Blink");
  Serial.println(">ATTR|blink|arg=times|type=number|optional|default=3|min=1|max=10");
}

void publish() {            // What is applied: when it comes back as asked, the page knows it was applied
  Serial.print(">speed:"); Serial.println(speed);
  Serial.print(">led:"); Serial.println(led ? 1 : 0);
}

void handle(String text) {
  if (text.startsWith("!")) {                                   // A call: !blink#12:times=3
    int hash = text.indexOf('#'), colon = text.indexOf(':');
    String name = text.substring(1, hash);
    unsigned id = text.substring(hash + 1, colon < 0 ? text.length() : colon).toInt();
    String head = name + "#" + String(id);
    if (name != "blink") { Serial.println(">ACK|" + head + ":err:unknown action"); return; }
    if (id == lastCall) { Serial.println(">ACK|" + head + ":ok"); return; }
    int times = 3, at = text.indexOf("times=");
    if (at >= 0) times = constrain(text.substring(at + 6).toInt(), 1, 10);
    Serial.println(">ACK|" + head + ":run");
    for (int i = 0; i < times; i++) { digitalWrite(LED_BUILTIN, HIGH); delay(150); digitalWrite(LED_BUILTIN, LOW); delay(150); }
    lastCall = id;
    Serial.println(">ACK|" + head + ":ok");
    return;
  }
  int colon = text.indexOf(':');                                // A setting: name:value
  if (colon < 0) return;
  String name = text.substring(0, colon), value = text.substring(colon + 1);
  if (name == "speed") speed = constrain(round(value.toFloat() / 0.05) * 0.05, 0, 1);
  else if (name == "led") led = value.toInt() != 0;
  publish();                                                    // The echo, right away
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  declare();
}

void loop() {
  static unsigned long lastDeclare = 0, lastPublish = 0;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') { line.trim(); if (line.length()) handle(line); line = ""; }
    else line += c;
  }
  if (millis() - lastDeclare > 5000) { lastDeclare = millis(); declare(); }
  if (millis() - lastPublish > 200) { lastPublish = millis(); publish(); }
  digitalWrite(LED_BUILTIN, led ? HIGH : LOW);
}
