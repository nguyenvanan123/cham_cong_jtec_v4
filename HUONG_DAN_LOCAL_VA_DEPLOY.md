# Hướng dẫn chạy Local (VS Code) và Deploy lên Netlify

## A. CHẠY LOCAL TRÊN VS CODE

### 1. Yêu cầu cài đặt
- [Node.js 20+](https://nodejs.org) — tải bản LTS
- pnpm: mở Terminal chạy `npm install -g pnpm`
- [VS Code](https://code.visualstudio.com)

### 2. Tải code từ Replit
- Trong Replit: nhấn nút **⋮ (ba chấm)** → **Download as zip**
- Giải nén vào thư mục bất kỳ, ví dụ `D:\jtec-chamcong`
- Mở VS Code → File → Open Folder → chọn thư mục đó

### 3. Tạo file môi trường
Tạo file `artifacts/chamcong/.env` với nội dung:

```env
VITE_SUPABASE_URL=https://qsxntomjaintphxslfyt.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_j8pF01lpzsv7IMgbamCdsQ_GhjbABgB
PORT=5000
BASE_PATH=/
```

### 4. Cài dependencies và chạy
Mở Terminal trong VS Code (Ctrl + `) rồi chạy:

```bash
pnpm install
pnpm --filter @workspace/chamcong run dev
```

Mở trình duyệt: http://localhost:5000

### 5. Extension VS Code nên cài
- **ESLint** — kiểm tra lỗi code
- **Prettier** — format code
- **Tailwind CSS IntelliSense** — gợi ý class Tailwind
- **TypeScript** (đã có sẵn)

---

## B. DEPLOY LÊN NETLIFY

### 1. Đưa code lên GitHub
- Tạo tài khoản [GitHub](https://github.com) nếu chưa có
- Tạo repository mới (private nếu muốn)
- Trong VS Code, mở Terminal:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Tạo site trên Netlify
- Vào [app.netlify.com](https://app.netlify.com) → **Add new site**
- Chọn **Import an existing project** → GitHub
- Chọn repository vừa tạo

### 3. Cấu hình Build
| Mục | Giá trị |
|-----|---------|
| Base directory | *(để trống)* |
| Build command | `npm install -g pnpm && pnpm install && pnpm --filter @workspace/chamcong run build` |
| Publish directory | `artifacts/chamcong/dist/public` |

### 4. Thêm Environment Variables
Netlify → Site settings → Environment variables:

```
VITE_SUPABASE_URL      = https://qsxntomjaintphxslfyt.supabase.co
VITE_SUPABASE_ANON_KEY = sb_publishable_j8pF01lpzsv7IMgbamCdsQ_GhjbABgB
```

### 5. Fix routing (SPA)
Tạo file `artifacts/chamcong/public/_redirects` với nội dung:
```
/*  /index.html  200
```
Điều này giúp các route như `/admin`, `/tra-cuu` hoạt động khi refresh trang.

### 6. Deploy
Nhấn **Deploy site** — Netlify sẽ tự build và cấp domain dạng `xxx.netlify.app`

---

## C. LƯU Ý BẢO MẬT KHI DEPLOY

- File `.env` **KHÔNG** được commit lên GitHub (đã có trong .gitignore)
- Anon key Supabase (`VITE_SUPABASE_*`) là public key — thiết kế để public, an toàn
- Chạy file `supabase_security_rls.sql` trước khi deploy production
