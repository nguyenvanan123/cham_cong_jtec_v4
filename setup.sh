#!/bin/bash
# JTEC Chấm Công — Script cài đặt tự động (Mac / Linux)
# Chạy: bash setup.sh

set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      JTEC Chấm Công — Cài đặt Local      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Kiểm tra Node.js ─────────────────────────────
if ! command -v node &> /dev/null; then
  echo "❌  Node.js chưa được cài. Tải tại: https://nodejs.org"
  exit 1
fi
NODE_VER=$(node -v)
echo "✅  Node.js: $NODE_VER"

# ── Kiểm tra / cài pnpm ──────────────────────────
if ! command -v pnpm &> /dev/null; then
  echo "⏳  Đang cài pnpm..."
  npm install -g pnpm
fi
echo "✅  pnpm: $(pnpm -v)"

# ── Tạo file .env ────────────────────────────────
echo ""
echo "📄  Tạo file .env..."

if [ ! -f "artifacts/chamcong/.env" ]; then
  cp artifacts/chamcong/.env.example artifacts/chamcong/.env
  echo "    ✅  artifacts/chamcong/.env đã tạo"
else
  echo "    ℹ️   artifacts/chamcong/.env đã tồn tại (giữ nguyên)"
fi

if [ ! -f "artifacts/api-server/.env" ]; then
  cp artifacts/api-server/.env.example artifacts/api-server/.env
  echo "    ✅  artifacts/api-server/.env đã tạo"
else
  echo "    ℹ️   artifacts/api-server/.env đã tồn tại (giữ nguyên)"
fi

# ── Xóa node_modules cũ (tránh lỗi native binding cross-platform) ──
echo ""
echo "🧹  Xóa node_modules cũ (nếu có)..."
rm -rf node_modules
rm -rf artifacts/chamcong/node_modules
rm -rf artifacts/api-server/node_modules

# ── Cài dependencies ─────────────────────────────
echo ""
echo "📦  Đang cài dependencies (pnpm install)..."
pnpm install

# ── Xong ─────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅  Cài đặt xong! Chạy hệ thống bằng 2 lệnh sau:   ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  Terminal 1 — API Server:                            ║"
echo "║    pnpm --filter @workspace/api-server run dev       ║"
echo "║                                                      ║"
echo "║  Terminal 2 — Frontend:                              ║"
echo "║    pnpm --filter @workspace/chamcong run dev         ║"
echo "║                                                      ║"
echo "║  Trình duyệt: http://localhost:5000                  ║"
echo "║  Admin:       http://localhost:5000/admin            ║"
echo "║  Mật khẩu:    12345678                               ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
