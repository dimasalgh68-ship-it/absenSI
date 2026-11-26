# 🎓 AbsenSI — Sistem Absensi Pintar 2-Faktor (RFID IoT + Verifikasi Wajah AI)

Sistem presensi siswa modern berbasis **2-Factor Authentication (2FA)** yang menggabungkan **Kartu RFID (ESP32 / ESP8266 + RC522)** dan **Verifikasi Wajah Biometrik (`face-api.js`)** secara *real-time* untuk mencegah titip absen (*anti-joki*).

Dilengkapi dengan **Mode Layar TV Kiosk** layar penuh, **Suara AI pemandu berbahasa Indonesia**, **Dashboard Admin terproteksi Auth**, **Manajemen Kelas & Murid**, serta **Export Rekap Excel** multi-sheet.

---

## ✨ Fitur Utama

1. **Absensi 2-Faktor (Anti-Joki / Anti-Titip Absen)**:
   - **Langkah 1**: Murid menempelkan kartu RFID ke scanner **ESP32 / ESP8266** (atau USB RFID Reader).
   - **Langkah 2**: Kamera otomatis aktif mencocokkan wajah di depan kamera dengan data biometrik pemilik kartu. Jika wajah berbeda, absensi ditolak dan peringatan berbunyi.
2. **Mode Layar TV Kiosk (`/tv` & `/kiosk`)**:
   - Tampilan khusus layar TV/monitor besar **tanpa navbar dan tanpa tombol keluar** agar siswa tidak dapat mengakses dashboard admin.
   - Saat verifikasi wajah, **kamera tampil Full Screen (`100vw × 100vh`) dengan mode Wide `0.5x`**.
   - Terhubung *real-time* via **Server-Sent Events (SSE)** dari ESP32/ESP8266 ke browser.
3. **Suara AI Pemandu (`id-ID`)**:
   - Menyapa nama murid saat kartu di-tap, mengonfirmasi keberhasilan/keterlambatan absen, dan memberi tahu jika murid sudah absen hari ini.
4. **Keamanan Dashboard (Admin Auth)**:
   - Seluruh halaman admin (`/`, `/absen`, `/daftar`, `/kelas`, `/rekap`, `/pengaturan`) dilindungi login.
   - Halaman `/tv` tetap terbuka untuk siswa tanpa perlu login.
5. **Pendaftaran RFID Real-Time**:
   - Cukup tempelkan kartu fisik baru ke scanner saat mengisi formulir pendaftaran murid, UID kartu otomatis terisi dengan deteksi duplikasi.
6. **Pengaturan Lengkap & Export Excel**:
   - Profil sekolah, jam masuk/batas terlambat/jam pulang, sensitivitas AI (`faceThreshold`), suara beep, suara AI, auto-capture, backup JSON, reset data, ubah password admin, serta ekspor Excel (`.xlsx`) lengkap dengan status **Tepat Waktu / Terlambat**.

---

## 📁 Struktur Direktori

```text
d:\hack\
├── arduino/
│   ├── esp32_rfid_absen/
│   │   └── esp32_rfid_absen.ino        # Firmware ESP32 DevKit V1 + RC522
│   └── esp8266_rfid_absen/
│       └── esp8266_rfid_absen.ino      # Firmware ESP8266 Lolin NodeMCU V3 + RC522
├── data/
│   └── db.json                         # Database JSON (murid, kelas, absensi, pengaturan, auth)
├── src/
│   ├── api.js                          # Client API & Auth token helper
│   ├── App.jsx                         # Routing & Auth Guard Dashboard
│   ├── App.css                         # Styling Dashboard & TV Kiosk
│   ├── pages/
│   │   ├── LoginPage.jsx               # Halaman Login Admin
│   │   ├── DashboardPage.jsx           # Ringkasan statistik & kehadiran harian
│   │   ├── AbsenPage.jsx               # Halaman presensi admin (RFID+Wajah / Wajah saja)
│   │   ├── TvKioskPage.jsx             # Halaman khusus TV Kiosk Fullscreen (tanpa navbar)
│   │   ├── DaftarPage.jsx              # Pendaftaran murid, foto biometrik & auto-capture RFID
│   │   ├── KelasPage.jsx               # Manajemen kelas & daftar murid per kelas
│   │   ├── RekapPage.jsx               # Filter laporan & export Excel
│   │   └── SettingsPage.jsx            # Pengaturan sistem, jadwal, suara AI & password admin
│   └── utils/
│       ├── aiVoice.js                  # Utilitas Text-to-Speech Bahasa Indonesia
│       └── exportExcel.js              # Generator laporan ExcelJS multi-sheet
├── server.js                           # Backend Express + SSE IoT RFID + Auth API (Port 3001)
├── buka_firewall_3001.bat              # Script 1-klik buka port 3001 di Windows Firewall
└── package.json
```

---

## 💻 1. Instalasi & Menjalankan Aplikasi (Software)

### Prasyarat
- **Node.js** versi `18+` atau `20+`
- Browser modern (**Google Chrome / Microsoft Edge**) dengan izin akses **Kamera (Webcam)**
- **Arduino IDE 2.x** (untuk upload program ke ESP32/ESP8266)

### Langkah Instalasi

1. **Install Dependensi**:
   ```bash
   npm install
   ```

2. **Jalankan Backend Server (Port `3001`)**:
   ```bash
   npm run server
   ```
   *Atau:*
   ```bash
   node server.js
   ```
   Server akan berjalan di `http://localhost:3001` dan mendengarkan seluruh IP jaringan lokal (`0.0.0.0:3001`).

3. **Jalankan Frontend**:
   - **Mode Development**:
     ```bash
     npm run dev
     ```
     Akses aplikasi di `http://localhost:5173`.
   - **Mode Production (Build)**:
     ```bash
     npm run build
     npm run preview -- --host
     ```

4. **Buka Port `3001` di Windows Firewall (Wajib untuk ESP32/ESP8266)**:
   Agar alat ESP32/ESP8266 dapat mengirim data tap kartu ke server melalui Wi-Fi lokal:
   - Klik kanan file **`buka_firewall_3001.bat`** di folder project -> pilih **Run as administrator**.
   - Atau jalankan di Command Prompt (Administrator):
     ```bat
     netsh advfirewall firewall add rule name="Absensi Server 3001" dir=in action=allow protocol=TCP localport=3001 profile=any
     ```

---

## 🔌 2. Pemasangan Hardware (Wiring ESP32 / ESP8266 + RFID RC522)

> ⚠️ **PERINGATAN PENTING:** Modul RFID **RC522 WAJIB dihubungkan ke pin `3.3V` (`3V3`)**. Jangan pernah menghubungkan ke `5V` / `VIN` karena dapat merusak modul RC522 secara permanen.

### Opsi A: Menggunakan **ESP32 DevKit V1** *(Direkomendasikan)*
File firmware: `arduino/esp32_rfid_absen/esp32_rfid_absen.ino`

| Pin Modul RC522 | Pin ESP32 DevKit V1 | Keterangan |
|---|---|---|
| **3.3V** | **3V3** | Sumber daya 3.3V (Wajib) |
| **GND** | **GND** | Ground |
| **RST** | **GPIO 22 (D22)** | Reset Pin |
| **SDA / SS** | **GPIO 5 (D5)** | Slave Select SPI (VSPI) |
| **SCK** | **GPIO 18 (D18)** | Clock SPI (VSPI) |
| **MISO** | **GPIO 19 (D19)** | MISO SPI (VSPI) |
| **MOSI** | **GPIO 23 (D23)** | MOSI SPI (VSPI) |
| **IRQ** | *(Tidak Dipakai)* | Biarkan kosong |
| **Buzzer (+)** *(opsional)* | **GPIO 4 (D4)** | Kaki negatif buzzer ke `GND` |
| **LED Status** | **GPIO 2 (D2)** | LED biru bawaan board ESP32 |

### Opsi B: Menggunakan **ESP8266 Lolin NodeMCU V3**
File firmware: `arduino/esp8266_rfid_absen/esp8266_rfid_absen.ino`

| Pin Modul RC522 | Pin NodeMCU V3 | Keterangan |
|---|---|---|
| **3.3V** | **3V3** | Sumber daya 3.3V (Wajib) |
| **GND** | **GND** | Ground |
| **RST** | **D3** *(GPIO 0)* | Reset Pin |
| **SDA / SS** | **D4** *(GPIO 2)* | Slave Select SPI |
| **SCK** | **D5** *(GPIO 14)* | Clock SPI |
| **MISO** | **D6** *(GPIO 12)* | MISO SPI |
| **MOSI** | **D7** *(GPIO 13)* | MOSI SPI |
| **IRQ** | *(Tidak Dipakai)* | Biarkan kosong |
| **Buzzer (+)** *(opsional)* | **D1** *(GPIO 5)* | Kaki negatif buzzer ke `GND` |
| **LED Hijau (+)** *(opsional)* | **D2** *(GPIO 4)* | Melalui resistor 220Ω ke `GND` |

---

## 📲 3. Upload Firmware ke Mikrokontroler (Arduino IDE)

1. Buka **Arduino IDE**.
2. Install library **MFRC522**:
   - Buka menu **Sketch -> Include Library -> Manage Libraries...**
   - Cari `MFRC522` (oleh *GithubCommunity*), lalu klik **Install**.
3. Pastikan Board Package sudah terpasang:
   - Untuk **ESP32**: Pilih **Tools -> Board -> esp32 -> ESP32 Dev Module**.
   - Untuk **ESP8266**: Tambahkan URL `http://arduino.esp8266.com/stable/package_esp8266com_index.json` di *File -> Preferences -> Additional Boards Manager URLs*, install `esp8266` di *Boards Manager*, lalu pilih **NodeMCU 1.0 (ESP-12E Module)**.
4. Buka file `.ino` sesuai board yang dipakai (`esp32_rfid_absen.ino` atau `esp8266_rfid_absen.ino`).
5. Sesuaikan konfigurasi Wi-Fi & IP Server di bagian atas kode:
   ```cpp
   const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
   const char* WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";
   const char* SERVER_HOST   = "192.168.1.4"; // Ganti dengan IPv4 komputer server (cek via ipconfig)
   const int   SERVER_PORT   = 3001;
   ```
6. Pilih port COM yang sesuai di **Tools -> Port**, lalu klik **Upload (→)**.
   *(Pada ESP32, jika muncul `Connecting......` terlalu lama, tekan dan tahan tombol **BOOT** di board selama 2 detik lalu lepas).*
7. Buka **Serial Monitor** (Baud rate `115200`) untuk memastikan Wi-Fi terhubung dan RC522 terdeteksi.

---

## 🚀 4. Panduan Deployment (Produksi di Sekolah)

### Skenario 1: Deployment Server Lokal Sekolah (Paling Direkomendasikan)
Cocok untuk dipasang di komputer lobi/gerbang sekolah yang terhubung ke TV & webcam:

1. **Build Frontend**:
   ```bash
   npm run build
   ```
   *(Opsional: Anda bisa menyajikan folder `dist/` melalui `npx serve -s dist -l 5173` atau `npm run preview`).*

2. **Jalankan Backend Secara Permanen dengan PM2**:
   ```bash
   npm install -g pm2
   pm2 start server.js --name absensi-backend
   pm2 start "npx vite preview --host --port 5173" --name absensi-frontend
   pm2 save
   ```
   *(Dengan PM2, server akan otomatis restart jika terjadi error atau saat komputer dinyalakan ulang jika dikonfigurasi startup).*

3. **Menampilkan Layar TV Kiosk Secara Otomatis**:
   - Buka browser Chrome/Edge di komputer yang terhubung ke TV/Monitor.
   - Buka URL: `http://localhost:5173/tv`
   - Tekan **`F11`** atau klik tombol layar penuh untuk mengunci tampilan TV.
   - Berikan izin akses **Kamera** (*Allow*) saat pertama kali diminta browser.

> 💡 **Catatan Kamera & Keamanan Browser:** Browser hanya mengizinkan akses Webcam pada **`http://localhost`** atau domain **`https://`**. Jika komputer TV mengakses server dari komputer lain via IP (misal `http://192.168.1.4:5173/tv`), browser akan memblokir webcam kecuali menggunakan **HTTPS** atau dijalankan langsung di komputer server via `localhost`.

### Skenario 2: Deployment ke VPS / Cloud Server (HTTPS)
Jika ingin diakses dari jarak jauh oleh banyak perangkat:
1. Deploy backend (`server.js`) di VPS (misal Ubuntu + PM2) pada port `3001`.
2. Gunakan **Nginx** + **Certbot (SSL/HTTPS)** sebagai *reverse proxy* untuk domain sekolah (misal `absen.sekolah.sch.id`).
3. Arahkan `/api/` ke `http://127.0.0.1:3001` (pastikan konfigurasi Nginx mendukung **SSE** dengan `proxy_buffering off;` dan `proxy_read_timeout 86400s;`).
4. Sesuaikan `BASE` URL pada `src/api.js`, `EventSource` pada `AbsenPage.jsx` / `DaftarPage.jsx` / `TvKioskPage.jsx`, serta `API_URL` pada kode Arduino ESP32/ESP8266 ke alamat domain server Anda.

---

## 🔐 5. Akses & Keamanan Dashboard

| Halaman | URL | Akses |
|---|---|---|
| **Layar TV Kiosk (Murid)** | `/tv` atau `/kiosk` | **Terbuka** (Tanpa login & tanpa navbar) |
| **Dashboard & Admin** | `/`, `/absen`, `/daftar`, `/kelas`, `/rekap`, `/pengaturan` | **Wajib Login Admin** |

- **Akun Login Default**:
  - **Username**: `admin`
  - **Password**: `admin123`
- **Mengganti Password**:
  Masuk ke menu **Pengaturan -> Tab Data & Backup -> Keamanan & Password Dashboard Admin**.
- **Mengunci Dashboard**:
  Klik tombol **Keluar (Kunci)** di pojok kiri bawah sidebar.

---

## 🛠️ 6. Troubleshooting

1. **ESP32/ESP8266 menampilkan `Error: connection refused`**:
   - Pastikan komputer server dan ESP32 terhubung ke **jaringan Wi-Fi yang sama**.
   - Pastikan `SERVER_HOST` di kode `.ino` sama dengan IPv4 komputer server (`ipconfig`).
   - Pastikan port `3001` sudah dibuka di Windows Firewall (jalankan `buka_firewall_3001.bat` sebagai Administrator).
   - Matikan sementara **VPN / Cloudflare WARP** di komputer server jika aktif.
2. **Modul RC522 tidak terdeteksi (`Versi Modul RC522: 0x0` atau `0xFF`)**:
   - Periksa ulang kabel jumper SPI (`MOSI`, `MISO`, `SCK`, `SDA`, `RST`), terutama kabel daya **`3.3V`** dan **`GND`**.
3. **Suara AI tidak terdengar**:
   - Pastikan volume perangkat TV/komputer menyala, dan opsi **Suara AI** aktif di menu **Pengaturan -> Kamera & AI**.
   - Klik satu kali di halaman browser (kebijakan *autoplay* browser mewajibkan interaksi awal atau izinkan *Sound* di pengaturan situs browser).
