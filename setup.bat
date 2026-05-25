@echo off
chcp 65001 >nul
:: JTEC Chấm Công — Script cài đặt tự động (Windows)
:: Chạy: nhấp đúp vào file này hoặc chạy trong Command Prompt

echo.
echo  ==========================================
echo       JTEC Cham Cong -- Cai dat Local
echo  ==========================================
echo.

:: ── Kiểm tra Node.js ─────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [LOI] Node.js chua duoc cai. Tai tai: https://nodejs.org
  pause
  exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [OK] Node.js: %NODE_VER%

:: ── Kiểm tra / cài pnpm ──────────────────────────
where pnpm >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [...] Dang cai pnpm...
  npm install -g pnpm
)
for /f "tokens=*" %%i in ('pnpm -v') do set PNPM_VER=%%i
echo [OK] pnpm: %PNPM_VER%

:: ── Tạo file .env ────────────────────────────────
echo.
echo [i] Tao file .env...

if not exist "artifacts\chamcong\.env" (
  copy "artifacts\chamcong\.env.example" "artifacts\chamcong\.env" >nul
  echo [OK] artifacts\chamcong\.env da tao
) else (
  echo [i]  artifacts\chamcong\.env da ton tai (giu nguyen)
)

if not exist "artifacts\api-server\.env" (
  copy "artifacts\api-server\.env.example" "artifacts\api-server\.env" >nul
  echo [OK] artifacts\api-server\.env da tao
) else (
  echo [i]  artifacts\api-server\.env da ton tai (giu nguyen)
)

:: ── Cài dependencies ─────────────────────────────
echo.
echo [...] Dang cai dependencies (pnpm install)...
call pnpm install
if %ERRORLEVEL% neq 0 (
  echo [LOI] pnpm install that bai
  pause
  exit /b 1
)

:: ── Xong ─────────────────────────────────────────
echo.
echo  ========================================================
echo   [OK] Cai dat xong! Chay he thong bang 2 lenh sau:
echo  ========================================================
echo.
echo   Terminal 1 -- API Server:
echo     pnpm --filter @workspace/api-server run dev
echo.
echo   Terminal 2 -- Frontend:
echo     pnpm --filter @workspace/chamcong run dev
echo.
echo   Trinh duyet: http://localhost:5000
echo   Admin:       http://localhost:5000/admin
echo   Mat khau:    12345678
echo  ========================================================
echo.
pause
