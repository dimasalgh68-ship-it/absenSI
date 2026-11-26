@echo off
echo Membuka Port 3001 di Windows Firewall untuk Absensi RFID ESP32...
netsh advfirewall firewall add rule name="Absensi Server 3001" dir=in action=allow protocol=TCP localport=3001 profile=any
if %errorlevel% equ 0 (
    echo.
    echo [BERHASIL] Port 3001 sudah dibuka! Silakan tempelkan kartu ke ESP32.
) else (
    echo.
    echo [GAGAL] Klik kanan file ini lalu pilih "Run as administrator"!
)
pause
