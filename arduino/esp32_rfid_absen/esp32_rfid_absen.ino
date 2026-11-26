/*
 * ======================================================================================
 * PROJEK ABSENSI PINTAR: ESP32 DEVKIT V1 + RC522 RFID READER
 * ======================================================================================
 * Deskripsi:
 * Membaca kartu RFID murid dan mengirim UID ke server absensi via Wi-Fi secara real-time.
 * Setelah kartu di-tap pada alat ini, layar TV / Kiosk otomatis beralih ke verifikasi wajah biometrik!
 *
 * --------------------------------------------------------------------------------------
 * SKEMA KABEL / WIRING (ESP32 DevKit V1 30-Pin / 38-Pin <---> Modul RFID RC522):
 * --------------------------------------------------------------------------------------
 *  RC522 Pin       ESP32 Pin                   Keterangan
 *  ---------       ---------                   ----------
 *  3.3V            3V3                         ⚠️ WAJIB 3.3V! (Jangan hubungkan ke 5V / VIN)
 *  GND             GND                         Ground
 *  RST             GPIO 22 (Pin D22)           Reset Pin
 *  SDA / SS        GPIO 5  (Pin D5)            Slave Select SPI Pin
 *  SCK             GPIO 18 (Pin D18)           SPI Clock (VSPI)
 *  MISO            GPIO 19 (Pin D19)           SPI MISO (VSPI)
 *  MOSI            GPIO 23 (Pin D23)           SPI MOSI (VSPI)
 *  IRQ             (Tidak Dihubungkan)         Dibiarkan kosong
 *
 * OPSI TAMBAHAN (Indikator Suara & LED):
 *  Buzzer (+)      GPIO 4  (Pin D4)            Buzzer aktif (kaki negatif ke GND)
 *  LED Status      GPIO 2  (Pin D2)            Onboard Blue LED ESP32
 * ======================================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>

// --------------------------------------------------------------------------------------
// 1. KONFIGURASI WI-FI & ALAMAT SERVER
// --------------------------------------------------------------------------------------
const char* WIFI_SSID     = "Nazwafir";       // Ganti dengan SSID Wi-Fi sekolah / router
const char* WIFI_PASSWORD = "musaddiq3f";   // Ganti dengan password Wi-Fi

// IP Komputer Server (Pastikan laptop/PC server dan ESP32 di jaringan Wi-Fi yang sama)
const char* SERVER_HOST   = "192.168.1.4"; 
const int   SERVER_PORT   = 3001;

// Endpoint API server untuk menerima tap RFID
const String API_URL      = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/rfid/tap";
const String PING_URL     = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/rfid/ping";

// --------------------------------------------------------------------------------------
// 2. DEFINISI PIN HARDWARE (ESP32 VSPI)
// --------------------------------------------------------------------------------------
#define SS_PIN     5    // Pin SDA / SS RC522 (GPIO 5)
#define RST_PIN    22   // Pin RST RC522 (GPIO 22)
#define BUZZER_PIN 4    // Pin Buzzer (GPIO 4)
#define LED_PIN    2    // Onboard Blue LED ESP32 (GPIO 2)

MFRC522 rfrc(SS_PIN, RST_PIN);

// Variabel debounce agar kartu tidak terbaca berulang kali dalam 1.5 detik
String lastCardUid = "";
unsigned long lastCardTime = 0;
const unsigned long DEBOUNCE_DELAY = 1500;

unsigned long lastPingTime = 0;
const unsigned long PING_INTERVAL = 25000; // Heartbeat setiap 25 detik

// --------------------------------------------------------------------------------------
// FUNGSI SUARA & INDIKATOR
// --------------------------------------------------------------------------------------
void beep(int freq, int durationMs) {
  #ifdef BUZZER_PIN
  tone(BUZZER_PIN, freq, durationMs);
  delay(durationMs);
  noTone(BUZZER_PIN);
  #endif
}

void beepSuccess() {
  beep(1000, 80);
  delay(50);
  beep(1500, 120);
}

void beepError() {
  beep(400, 250);
}

void blinkLed(int times = 1, int delayMs = 100) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(LED_PIN, LOW);
    if (i < times - 1) delay(delayMs);
  }
}

// --------------------------------------------------------------------------------------
// SETUP UTAMA
// --------------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n\n=======================================================");
  Serial.println("   SISTEM ABSENSI IoT: ESP32 DEVKIT V1 + RFID RC522    ");
  Serial.println("=======================================================");

  // Inisialisasi Pin Output
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Inisialisasi SPI Bus & MFRC522 (VSPI ESP32)
  SPI.begin(18, 19, 23, SS_PIN); // SCK=18, MISO=19, MOSI=23, SS=5
  rfrc.PCD_Init();
  delay(50);

  // Periksa apakah modul RC522 terdeteksi
  byte v = rfrc.PCD_ReadRegister(rfrc.VersionReg);
  Serial.print("[RFID] Versi Modul RC522: 0x");
  Serial.println(v, HEX);
  if (v == 0x00 || v == 0xFF) {
    Serial.println("⚠️ PERINGATAN: Modul RC522 tidak terdeteksi!");
    Serial.println("   Periksa kabel jumper ke ESP32 (khususnya 3.3V, GND, MOSI, MISO, SCK, SDA)");
  } else {
    Serial.println("✅ Modul RC522 Berhasil Diinisialisasi!");
  }

  // Koneksi Wi-Fi
  connectWiFi();

  // Nada tanda alat siap digunakan
  beepSuccess();
  blinkLed(2, 100);
  Serial.println(">> Siap! Tempelkan kartu RFID pada sensor...");
}

// --------------------------------------------------------------------------------------
// KONEKSI WI-FI
// --------------------------------------------------------------------------------------
void connectWiFi() {
  Serial.print("[WiFi] Menyambungkan ke ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN)); // Blink saat mencari sinyal
    attempts++;
  }

  digitalWrite(LED_PIN, LOW);

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] ✅ Berhasil terhubung!");
    Serial.print("[WiFi] IP ESP32: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] Menghubungkan ke Server: ");
    Serial.println(API_URL);
    sendHeartbeat();
  } else {
    Serial.println("\n[WiFi] ❌ Gagal terhubung ke Wi-Fi. Cek SSID & Password!");
  }
}

// --------------------------------------------------------------------------------------
// LOOP UTAMA
// --------------------------------------------------------------------------------------
void loop() {
  // Reconnect Wi-Fi jika terputus
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_PIN, LOW);
    connectWiFi();
    return;
  }

  // Kirim heartbeat / ping berkala ke server
  if (millis() - lastPingTime > PING_INTERVAL) {
    lastPingTime = millis();
    sendHeartbeat();
  }

  // Cek apakah ada kartu baru di dekat sensor
  if (!rfrc.PICC_IsNewCardPresent()) {
    return;
  }

  // Baca serial number kartu
  if (!rfrc.PICC_ReadCardSerial()) {
    return;
  }

  // Konversi UID kartu menjadi format HEX String
  String cardUid = "";
  for (byte i = 0; i < rfrc.uid.size; i++) {
    if (rfrc.uid.uidByte[i] < 0x10) cardUid += "0";
    cardUid += String(rfrc.uid.uidByte[i], HEX);
  }
  cardUid.toUpperCase();

  // Debounce check: hindari pembacaan berulang kartu yang sama dalam 1.5 detik
  if (cardUid == lastCardUid && (millis() - lastCardTime < DEBOUNCE_DELAY)) {
    rfrc.PICC_HaltA();
    rfrc.PCD_StopCrypto1();
    return;
  }

  lastCardUid = cardUid;
  lastCardTime = millis();

  Serial.println("\n========================================");
  Serial.print("💳 Kartu Ditempelkan! UID: ");
  Serial.println(cardUid);

  // Indikator LED menyala
  digitalWrite(LED_PIN, HIGH);
  beep(1200, 70); // Feedback instan saat kartu menyentuh sensor

  // Kirim data tap ke Server Absensi
  kirimTapKeServer(cardUid);

  digitalWrite(LED_PIN, LOW);

  // Hentikan komunikasi dengan kartu saat ini
  rfrc.PICC_HaltA();
  rfrc.PCD_StopCrypto1();
}

// --------------------------------------------------------------------------------------
// MENGIRIM DATA TAP KE SERVER VIA HTTP POST
// --------------------------------------------------------------------------------------
void kirimTapKeServer(String rfid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] Error: Wi-Fi terputus");
    beepError();
    return;
  }

  WiFiClient client;
  HTTPClient http;

  Serial.print("[HTTP] Mengirim UID ke: ");
  Serial.println(API_URL);

  if (http.begin(client, API_URL)) {
    http.addHeader("Content-Type", "application/json");

    // Body JSON yang dikirim ke backend
    String payload = "{\"rfid\":\"" + rfid + "\",\"device\":\"ESP32_DEVKIT_V1\"}";

    int httpCode = http.POST(payload);

    if (httpCode > 0) {
      String response = http.getString();
      Serial.print("[HTTP] Response (Code ");
      Serial.print(httpCode);
      Serial.print("): ");
      Serial.println(response);

      if (httpCode == HTTP_CODE_OK || httpCode == 201) {
        Serial.println("✅ BERHASIL: Kartu terdaftar, layar TV beralih ke verifikasi wajah!");
        beepSuccess();
        blinkLed(3, 80);
      } else {
        Serial.println("⚠️ Kartu tidak terdaftar di database server!");
        beepError();
      }
    } else {
      Serial.print("[HTTP] ❌ Gagal menghubungi server. Error: ");
      Serial.println(http.errorToString(httpCode).c_str());
      beepError();
    }

    http.end();
  } else {
    Serial.println("[HTTP] Gagal inisialisasi koneksi HTTP");
    beepError();
  }
}

// --------------------------------------------------------------------------------------
// KIRIM PING / HEARTBEAT KE SERVER
// --------------------------------------------------------------------------------------
void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client;
  HTTPClient http;

  if (http.begin(client, PING_URL)) {
    http.addHeader("Content-Type", "application/json");
    String payload = "{\"device\":\"ESP32_DEVKIT_V1\",\"status\":\"online\"}";
    int code = http.POST(payload);
    if (code > 0) {
      Serial.println("[Heartbeat] Ping ke server OK");
    }
    http.end();
  }
}
