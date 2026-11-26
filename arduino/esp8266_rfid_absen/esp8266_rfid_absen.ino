/*
 * ======================================================================================
 * PROJEK ABSENSI PINTAR: ESP8266 LOLIN NODEMCU V3 + RC522 RFID READER
 * ======================================================================================
 * Deskripsi:
 * Membaca kartu RFID murid dan mengirim UID ke server absensi via Wi-Fi secara real-time.
 * Setelah kartu di-tap pada alat ini, layar TV / Kiosk otomatis beralih ke verifikasi wajah biometrik!
 *
 * --------------------------------------------------------------------------------------
 * SKEMA KABEL / WIRING (NodeMCU V3 Lolin ESP8266 <---> Modul RFID RC522):
 * --------------------------------------------------------------------------------------
 *  RC522 Pin       NodeMCU V3 (Lolin) Pin      Keterangan
 *  ---------       ----------------------      ----------
 *  3.3V            3V3                         ⚠️ JANGAN ke 5V! (Wajib 3.3V)
 *  GND             GND                         Ground
 *  RST             D3  (GPIO 0)                Reset Pin
 *  SDA / SS        D4  (GPIO 2) atau D8        Slave Select Pin (SPI)
 *  SCK             D5  (GPIO 14)               SPI Clock
 *  MISO            D6  (GPIO 12)               SPI MISO
 *  MOSI            D7  (GPIO 13)               SPI MOSI
 *  IRQ             (Tidak Dihubungkan)         Dibiarkan kosong
 *
 * OPSI TAMBAHAN (Indikator Suara & LED):
 *  Buzzer (+)      D1  (GPIO 5)                Buzzer aktif (kaki negatif ke GND)
 *  LED Hijau (+)   D2  (GPIO 4)                Melalui resistor 220 Ohm ke GND
 * ======================================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <SPI.h>
#include <MFRC522.h>

// --------------------------------------------------------------------------------------
// DEFINISI PIN NODEMCU ESP8266 (Mencegah error 'D4 was not declared')
// --------------------------------------------------------------------------------------
#ifndef D0
  #define D0 16
#endif
#ifndef D1
  #define D1 5   // GPIO 5 (Buzzer)
#endif
#ifndef D2
  #define D2 4   // GPIO 4 (LED)
#endif
#ifndef D3
  #define D3 0   // GPIO 0 (RST RC522)
#endif
#ifndef D4
  #define D4 2   // GPIO 2 (SDA/SS RC522)
#endif
#ifndef D5
  #define D5 14  // GPIO 14 (SCK RC522)
#endif
#ifndef D6
  #define D6 12  // GPIO 12 (MISO RC522)
#endif
#ifndef D7
  #define D7 13  // GPIO 13 (MOSI RC522)
#endif
#ifndef D8
  #define D8 15  // GPIO 15
#endif

// --------------------------------------------------------------------------------------
// 1. KONFIGURASI WI-FI & ALAMAT SERVER
// --------------------------------------------------------------------------------------
const char* WIFI_SSID     = "Nazwafir";       // Ganti dengan SSID Wi-Fi sekolah / router
const char* WIFI_PASSWORD = "musaddiq3f";   // Ganti dengan password Wi-Fi

// Ganti IP di bawah ini dengan IP Komputer Server Anda (Cek via `ipconfig` di command prompt)
// Contoh IP lokal laptop server: 192.168.1.4
const char* SERVER_HOST   = "192.168.1.4"; 
const int   SERVER_PORT   = 3001;

// Endpoint API server untuk menerima tap RFID
const String API_URL      = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/rfid/tap";
const String PING_URL     = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/rfid/ping";

// --------------------------------------------------------------------------------------
// 2. DEFINISI PIN HARDWARE
// --------------------------------------------------------------------------------------
#define RST_PIN   D3    // Pin Reset RC522 (GPIO 0)
#define SS_PIN    D4    // Pin SDA / SS RC522 (GPIO 2)
#define BUZZER_PIN D1   // Pin Buzzer (GPIO 5)
#define LED_PIN    D2   // Pin LED Status (GPIO 4)

MFRC522 rfrc(SS_PIN, RST_PIN);  // Objek MFRC522

// Variabel debounce agar kartu tidak terbaca berulang kali dalam 1 detik
String lastCardUid = "";
unsigned long lastCardTime = 0;
const unsigned long DEBOUNCE_DELAY = 1500; // 1.5 detik jeda per tap

unsigned long lastPingTime = 0;
const unsigned long PING_INTERVAL = 25000; // Ping server setiap 25 detik

// --------------------------------------------------------------------------------------
// FUNGSI NADA SUARA & INDIKATOR
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

// --------------------------------------------------------------------------------------
// SETUP UTAMA
// --------------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n\n=======================================================");
  Serial.println("  SISTEM ABSENSI IoT: ESP8266 LOLIN NODEMCU V3 + RFID");
  Serial.println("=======================================================");

  // Inisialisasi Pin Output
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Inisialisasi SPI Bus & Modul RC522
  SPI.begin();
  rfrc.PCD_Init();
  delay(100);
  
  // Tampilkan versi firmware RFID reader
  rfrc.PCD_DumpVersionToSerial();
  Serial.println(">> Modul RFID RC522 Berhasil Diinisialisasi.");

  // Hubungkan ke Jaringan Wi-Fi
  connectWiFi();

  // Bunyi tanda siap
  beep(1200, 100);
  Serial.println(">> ALAT SIAP! Tempelkan kartu RFID pada sensor...");
}

// --------------------------------------------------------------------------------------
// LOOP UTAMA
// --------------------------------------------------------------------------------------
void loop() {
  // Pastikan Wi-Fi tetap terhubung
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_PIN, LOW);
    connectWiFi();
    return;
  } else {
    digitalWrite(LED_PIN, HIGH);
  }

  // Kirim Ping berkala ke server untuk status online
  if (millis() - lastPingTime > PING_INTERVAL) {
    lastPingTime = millis();
    sendHeartbeat();
  }

  // Cek apakah ada kartu baru di dekat sensor
  if (!rfrc.PICC_IsNewCardPresent()) {
    return;
  }

  // Baca serial number / UID kartu
  if (!rfrc.PICC_ReadCardSerial()) {
    return;
  }

  // Konversi UID byte array menjadi String HEX yang rapi (contoh: "A1B2C3D4")
  String cardUid = "";
  for (byte i = 0; i < rfrc.uid.size; i++) {
    if (rfrc.uid.uidByte[i] < 0x10) cardUid += "0";
    cardUid += String(rfrc.uid.uidByte[i], HEX);
  }
  cardUid.toUpperCase();

  // Debounce check: Jangan kirim ulang kartu yang sama sebelum jeda waktu selesai
  if (cardUid == lastCardUid && (millis() - lastCardTime < DEBOUNCE_DELAY)) {
    rfrc.PICC_HaltA();
    rfrc.PCD_StopCrypto1();
    return;
  }

  lastCardUid = cardUid;
  lastCardTime = millis();

  Serial.println("\n-------------------------------------------------------");
  Serial.print("💳 KARTU RFID TERDETEKSI! UID: ");
  Serial.println(cardUid);

  // Bunyi tap kartu
  beep(800, 60);

  // Kirim data ke backend server absensi
  sendCardToServer(cardUid);

  // Hentikan komunikasi dengan kartu saat ini
  rfrc.PICC_HaltA();
  rfrc.PCD_StopCrypto1();
}

// --------------------------------------------------------------------------------------
// FUNGSI MENGIRIM KARTU KE SERVER VIA HTTP POST
// --------------------------------------------------------------------------------------
void sendCardToServer(String uid) {
  WiFiClient client;
  HTTPClient http;

  Serial.print(">> Mengirim ke Server: ");
  Serial.println(API_URL);

  http.begin(client, API_URL);
  http.addHeader("Content-Type", "application/json");

  // Format JSON payload
  String jsonPayload = "{\"uid\":\"" + uid + "\"}";

  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print(">> Respon Server [HTTP ");
    Serial.print(httpResponseCode);
    Serial.print("]: ");
    Serial.println(response);

    if (httpResponseCode == 200) {
      // Murid ditemukan dan kartu valid!
      Serial.println("✅ SUKSES: Kartu dikenali! Layar TV beralih ke verifikasi wajah.");
      beepSuccess();
    } else if (httpResponseCode == 404) {
      // Kartu belum terdaftar
      Serial.println("⚠️ PERINGATAN: Kartu belum terdaftar di sistem!");
      beepError();
    } else {
      beep(600, 100);
    }
  } else {
    Serial.print("❌ GAGAL MENGHUBUNGI SERVER! Error code: ");
    Serial.println(httpResponseCode);
    beepError();
  }

  http.end();
}

// --------------------------------------------------------------------------------------
// FUNGSI PING / HEARTBEAT KE SERVER
// --------------------------------------------------------------------------------------
void sendHeartbeat() {
  WiFiClient client;
  HTTPClient http;
  http.begin(client, PING_URL);
  http.addHeader("Content-Type", "application/json");
  http.POST("{\"device\":\"NodeMCU-V3\"}");
  http.end();
}

// --------------------------------------------------------------------------------------
// FUNGSI KONEKSI WI-FI
// --------------------------------------------------------------------------------------
void connectWiFi() {
  Serial.print(">> Menghubungkan ke Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Wi-Fi Terhubung!");
    Serial.print(">> Alamat IP NodeMCU: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ Gagal terhubung ke Wi-Fi. Cek SSID dan password.");
  }
}
