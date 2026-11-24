// Bring-up sketch for the game-night band. It checks an assembled board before the firmware exists.
// It is not the firmware: it has no Wi-Fi and records nothing. The check numbers are the ones in
// ../FIRMWARE.md, "Bring-up checks".
//
// Setup, once, in the Arduino IDE:
//   1. Tools > Board > Boards Manager: install "esp32" by Espressif Systems (compiled with 3.3.12).
//   2. Tools > Board > esp32: choose XIAO_ESP32C6. Leave "USB CDC On Boot" enabled.
//
// Never wear a band while USB is plugged in. Hold the board by its edges: skin oil around the
// skin-conductance parts changes what they read.
//
// On the cell alone (checks 1 and 4). The band switches its electrodes off whenever USB is plugged in,
// so these run without it and are saved on the board:
//   1. USB unplugged, SW1 on. The LED lights for 2 s, then blinks once a second.
//   2. Tape 100 kOhm across E1 and E2. Don't hold it on: fingers on both ends add your own skin to the
//      reading. The LED goes solid if it reads right, or blinks fast if not. Leave it 5 s.
//   3. Plug in the finger lead and do the same across its tip and ring snaps.
//
// On USB (checks 2, 3 and 5), with the cell in, SW1 on and the resistor still across E1 and E2. Open the
// Serial Monitor and send a key:
//   r   run the checks and show what the last run on the cell saved
//   p   plot the pulse (check 6): open Tools > Serial Plotter and rest a fingertip on the sensor, clear
//       of E1 and E2. Any key stops it.
//
// Check 7 is by hand: hold TP4 to ground (the USB socket's shell is ground), touch TP5 to ground and let
// go. The LED stays off and the sketch stops answering. Touch TP5 again, without TP4, to go back.

#include <Preferences.h>
#include <Wire.h>

#if !ARDUINO_USB_CDC_ON_BOOT
#error "Enable Tools > USB CDC On Boot. The other serial port uses the status LED's pin."
#endif

constexpr float TEST_OHMS = 100000;  // the resistor used for check 4

const uint8_t PPG_INT = D0, IMU_INT = D1, VLED_EN = D2, VBUS_DIV = D3, STATUS_LED = D6, PLUG_DET = D8,
              ADC_RDY = D9, GAUGE_ALRT = D10;
const uint8_t GAUGE = 0x36, ADS = 0x48, TMP = 0x49, PPG = 0x57, IMU = 0x6A;

// What the last run on the cell saw. Index 0 is the wrist contacts, 1 is the finger lead.
struct CellRun {
  float volts;
  float open[2];
  float loaded[2];
};

CellRun cellRun = { NAN, { NAN, NAN }, { NAN, NAN } };
Preferences store;

// ---- I2C ----

bool answers(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

void write8(uint8_t address, uint8_t reg, uint8_t value) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

void write16(uint8_t address, uint8_t reg, uint16_t value) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  Wire.write(value >> 8);
  Wire.write(value & 0xFF);
  Wire.endTransmission();
}

void readBytes(uint8_t address, uint8_t reg, uint8_t *bytes, uint8_t count) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(address, count);
  for (uint8_t i = 0; i < count; i++) bytes[i] = Wire.read();
}

uint8_t read8(uint8_t address, uint8_t reg) {
  uint8_t value;
  readBytes(address, reg, &value, 1);
  return value;
}

uint16_t read16(uint8_t address, uint8_t reg) {
  uint8_t b[2];
  readBytes(address, reg, b, 2);
  return b[0] << 8 | b[1];
}

// ---- Skin conductance (ADS1115) ----

// Inputs: 0 = AIN0-AIN1 (the current), 3 = AIN2-AIN3 (the excitation), and 4, 5 and 7 = AIN0, AIN1 and
// AIN3 against ground. Range: 1 = 4.096 V, 2 = 2.048 V, 3 = 1.024 V.
float adcVolts(uint8_t input, uint8_t range) {
  const float fullScale[] = { 6.144, 4.096, 2.048, 1.024 };
  float sum = 0;
  for (int i = 0; i < 40; i++) {  // about 100 ms, so mains hum mostly averages out
    write16(ADS, 1, 0x8000 | input << 12 | range << 9 | 0x0100 | 6 << 5 | 3);  // single shot, 475 SPS
    uint32_t start = millis();
    while (!(read16(ADS, 1) & 0x8000) && millis() - start < 10) {}
    sum += (int16_t)read16(ADS, 0);
  }
  return sum / 40 / 32768 * fullScale[range];
}

float microsiemens() {
  float amps = adcVolts(0, 2) / 68000;
  float volts = adcVolts(3, 3);
  if (volts < 0.1) return NAN;
  float g = amps / volts;
  return 1e6 * g / (1 - 2400 * g);  // without the 2 x 1 kOhm and the switch, in series with the skin
}

// ---- Pulse (MAX30101) ----

void ppgStart() {
  write8(PPG, 0x09, 0x40);  // reset
  delay(10);
  write8(PPG, 0x08, 0x10);  // the FIFO rolls over
  write8(PPG, 0x0A, 0x47);  // 8192 nA range, 100 Hz, 411 us
  write8(PPG, 0x0E, 0x24);  // both green drivers, 7 mA each
  write8(PPG, 0x0F, 0x24);
  write8(PPG, 0x11, 0x03);  // slot 1 is green, the only slot
  write8(PPG, 0x09, 0x07);  // multi-LED mode
}

void plotPulse() {
  digitalWrite(VLED_EN, HIGH);
  delay(10);
  ppgStart();
  float level = 0, pulse = 0;
  while (!Serial.available() && digitalRead(VBUS_DIV)) {
    while (read8(PPG, 0x04) != read8(PPG, 0x06)) {
      uint8_t b[3];
      readBytes(PPG, 0x07, b, 3);
      float green = (b[0] & 3) << 16 | b[1] << 8 | b[2];
      if (level == 0) level = green;
      level += (green - level) / 100;           // the slow level, over about a second
      pulse += (level - green - pulse) / 5;     // blood absorbs green, so a beat points up
      Serial.printf("pulse:%.0f\n", pulse);
    }
    delay(5);
  }
  write8(PPG, 0x09, 0x80);  // shut down
  digitalWrite(VLED_EN, LOW);
}

// ---- Interrupt lines ----

volatile uint32_t edges;
void IRAM_ATTR onEdge() {
  edges = edges + 1;
}

// Edges on a pin in half a second, while service() reads the sensor so it keeps raising them.
uint32_t countEdges(uint8_t pin, int mode, void (*service)()) {
  edges = 0;
  attachInterrupt(digitalPinToInterrupt(pin), onEdge, mode);
  for (uint32_t start = millis(); millis() - start < 500;) {
    service();
    delay(1);
  }
  detachInterrupt(digitalPinToInterrupt(pin));
  return edges;
}

// Raises the gauge's alert with a threshold above any cell, then puts its defaults back.
bool gaugeAlertWorks() {
  write16(GAUGE, 0x14, 0xFFFF);  // alert below 5.1 V
  // Under a second, or up to 45 s if the gauge was hibernating when the sketch started.
  for (uint32_t start = millis(); digitalRead(GAUGE_ALRT) && millis() - start < 50000;) delay(10);
  bool fell = !digitalRead(GAUGE_ALRT);
  write16(GAUGE, 0x14, 0x00FF);
  delay(1000);
  write16(GAUGE, 0x1A, 0x0000);  // clear the flags
  write16(GAUGE, 0x0C, 0x971C);  // clear the alert
  delay(10);
  return fell && digitalRead(GAUGE_ALRT);
}

// ---- The checks ----

bool near(float value, float target, float tolerance) {
  return fabsf(value - target) <= tolerance * target;
}

void result(bool ok, const char *check) {
  Serial.printf("%s  %s  ", ok ? "pass" : "FAIL", check);
}

void runChecks() {
  Serial.println("\ngame-night band bring-up");

  // 2: each chip is asked 100 times, so a joint that only sometimes connects shows up.
  const uint8_t chips[] = { GAUGE, ADS, TMP, PPG, IMU };
  int replies[5] = {};
  bool allReply = true;
  for (int i = 0; i < 5; i++) {
    for (int n = 0; n < 100; n++) replies[i] += answers(chips[i]);
    allReply &= replies[i] == 100;
  }
  result(allReply, "2");
  Serial.print("I2C, replies out of 100:");
  for (int i = 0; i < 5; i++) Serial.printf("  %02X %d", chips[i], replies[i]);
  for (uint8_t a = 0x08; a < 0x78; a++) {
    if (a != GAUGE && a != ADS && a != TMP && a != PPG && a != IMU && answers(a)) {
      Serial.printf("  unexpected %02X", a);
    }
  }
  Serial.println();

  // 3: the same three points as TP2, TP3 and TP1, read by the ADC.
  float v15 = adcVolts(5, 2), v10 = adcVolts(7, 2), out = adcVolts(4, 1);
  // 5%: the ADC's own input loads the V15 and V10 dividers by 1 to 2%, on top of the 3.3 V tolerance.
  result(near(v15, 1.5, 0.05) && near(v10, 1.0, 0.05) && near(out, 1.5, 0.05), "3");
  Serial.printf("TP2 %.3f V (1.50)  TP3 %.3f V (1.00)  TP1 %.3f V (1.50)\n", v15, v10, out);

  // 5
  float skin = microsiemens();
  float cell = read16(GAUGE, 0x02) * 78.125e-6;
  float rate = (int16_t)read16(GAUGE, 0x16) * 0.208;
  bool usb = digitalRead(VBUS_DIV);
  result(usb && fabsf(skin) < 0.05 && rate > 0, "5");
  Serial.printf("usb %d  skin %.3f uS (open)  cell %.2f V  charging %.1f %%/h", usb, skin, cell, rate);
  if (rate <= 0) Serial.print(" - needs a cell that isn't full, SW1 on and a few minutes");
  Serial.println();

  // The rest of the sensors
  float celsius = (int16_t)read16(TMP, 0x00) * 0.0078125;
  result((read16(TMP, 0x0F) & 0xFFF) == 0x117 && celsius > 10 && celsius < 45, "-");
  Serial.printf("skin temperature sensor %.2f C\n", celsius);

  write8(IMU, 0x0E, 0x01);  // data ready on INT2
  write8(IMU, 0x10, 0x28);  // 26 Hz, 4 g
  delay(200);
  uint8_t raw[6];
  readBytes(IMU, 0x28, raw, 6);
  float g = 0;
  for (int i = 0; i < 3; i++) {
    float axis = (int16_t)(raw[2 * i + 1] << 8 | raw[2 * i]) * 0.000122;
    g += axis * axis;
  }
  g = sqrtf(g);
  result(read8(IMU, 0x0F) == 0x6C && near(g, 1, 0.1), "-");
  Serial.printf("motion sensor %.2f g (1.00, held still)\n", g);

  // Every interrupt line
  ppgStart();
  write8(PPG, 0x02, 0x40);  // interrupt on each new sample
  uint32_t ppgEdges = countEdges(PPG_INT, FALLING, [] { read8(PPG, 0x00); });
  bool ppgPart = read8(PPG, 0xFF) == 0x15;
  write8(PPG, 0x09, 0x80);
  uint32_t imuEdges = countEdges(IMU_INT, RISING, [] {
    uint8_t b[6];
    readBytes(IMU, 0x28, b, 6);
  });
  write16(ADS, 3, 0x8000);  // these two thresholds turn ALERT/RDY into conversion-ready
  write16(ADS, 2, 0x0000);
  write16(ADS, 1, 2 << 9 | 6 << 5);  // continuous, 475 SPS
  uint32_t adcEdges = countEdges(ADC_RDY, FALLING, [] {});
  write16(ADS, 1, 0x0583);  // the default: stopped
  bool alert = gaugeAlertWorks();
  result(ppgPart && ppgEdges > 25 && imuEdges > 6 && adcEdges > 100 && alert, "-");
  Serial.printf("interrupts in 0.5 s: pulse %lu (about 50)  motion %lu (about 13)  ADC %lu (about 237)  gauge alert %s\n",
                (unsigned long)ppgEdges, (unsigned long)imuEdges, (unsigned long)adcEdges, alert ? "ok" : "FAILED");

  // 1 and 4, from the last run on the cell
  result(cellRun.volts > 3, "1");
  Serial.printf("last run on the cell started at %.2f V\n", cellRun.volts);
  float want = 1e6 / TEST_OHMS;
  result(near(cellRun.loaded[0], want, 0.05) && near(cellRun.loaded[1], want, 0.05), "4");
  Serial.printf("%.0f ohms should read %.1f uS: wrist %.2f  lead %.2f  (nothing attached: %.3f, %.3f)\n", TEST_OHMS,
                want, cellRun.loaded[0], cellRun.loaded[1], cellRun.open[0], cellRun.open[1]);

  Serial.println("todo  6  send p and rest a finger on the pulse sensor");
  Serial.println("todo  7  by hand: TP4 to ground, then TP5 to ground and let go");
}

// ---- On the cell ----

void saveCellRun() {
  store.putBytes("cell", &cellRun, sizeof cellRun);
}

void startCellRun() {
  cellRun = { (float)(read16(GAUGE, 0x02) * 78.125e-6), { NAN, NAN }, { NAN, NAN } };
  saveCellRun();
}

// Takes one reading, about 0.25 s, and returns whether the LED should be lit.
bool readOnCell(uint32_t pass) {
  static float last = NAN;
  static int lastSite = -1;
  static uint32_t savedAt = 0;

  int site = digitalRead(PLUG_DET);
  float skin = microsiemens();
  bool attached = skin > 0.05;
  bool steady = site == lastSite && fabsf(skin - last) < (attached ? 0.01 * skin : 0.005);
  last = skin;
  lastSite = site;

  float &saved = attached ? cellRun.loaded[site] : cellRun.open[site];
  if (steady && millis() - savedAt > 2000) {
    saved = skin;
    saveCellRun();
    savedAt = millis();
  }
  if (!attached) return pass % 4 == 0;
  return near(skin, 1e6 / TEST_OHMS, 0.05) || pass % 2 == 0;
}

// ---- Arduino ----

void setup() {
  pinMode(VLED_EN, OUTPUT);
  digitalWrite(VLED_EN, LOW);
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);  // lit
  for (uint8_t pin : { PPG_INT, IMU_INT, VBUS_DIV, PLUG_DET, ADC_RDY, GAUGE_ALRT }) pinMode(pin, INPUT);
  Serial.begin(115200);
  Wire.begin();
  Wire.setClock(400000);
  write16(GAUGE, 0x0A, 0x0000);  // no hibernation until it next loses power, so its readings stay fresh
  store.begin("bringup");
  store.getBytes("cell", &cellRun, sizeof cellRun);
  delay(2000);
}

void loop() {
  static bool wasOnUsb = true;
  static bool greeted = false;
  static uint32_t pass = 0;

  bool onUsb = digitalRead(VBUS_DIV);
  if (wasOnUsb && !onUsb) startCellRun();
  wasOnUsb = onUsb;
  pass++;

  if (!onUsb) {
    digitalWrite(STATUS_LED, readOnCell(pass) ? LOW : HIGH);
    return;
  }

  digitalWrite(STATUS_LED, pass % 4 == 0 ? LOW : HIGH);
  if (!greeted && pass % 20 == 0) Serial.println("send r to run the checks, p to plot the pulse");
  if (Serial.available()) {
    greeted = true;
    char key = Serial.read();
    if (key == 'r') runChecks();
    if (key == 'p') {
      delay(50);
      while (Serial.available()) Serial.read();  // the newline after p would stop the plot
      plotPulse();
      while (Serial.available()) Serial.read();
    }
  }
  delay(250);
}
