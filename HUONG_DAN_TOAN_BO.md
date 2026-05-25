# Hướng dẫn Toàn bộ — JTEC Chấm Công

> Tài liệu này dành cho **người mới hoàn toàn** chưa có Supabase, Cloudinary, hay tài khoản deploy nào.
> Đọc theo thứ tự từ trên xuống. Phần 0 là bắt buộc nếu bạn tạo dự án lần đầu.

---

## PHẦN 0 — TẠO CÁC DỊCH VỤ CẦN THIẾT (làm 1 lần duy nhất)

Hệ thống cần 2 dịch vụ bên ngoài:

| Dịch vụ | Dùng để làm gì | Miễn phí không? |
|---------|---------------|-----------------|
| **Supabase** | Cơ sở dữ liệu (PostgreSQL) | ✅ Free tier đủ dùng |
| **Cloudinary** | Lưu trữ ảnh check-in/out, CCCD, video | ✅ Free 25GB |

---

### 0A. Tạo tài khoản Supabase

1. Vào **https://supabase.com** → **Start your project** → đăng ký bằng GitHub hoặc email
2. Tạo project mới:
   - **Organization**: tạo org mới hoặc dùng mặc định
   - **Name**: `jtec-chamcong` (đặt tùy ý)
   - **Database Password**: đặt mật khẩu mạnh, **lưu lại chỗ an toàn**
   - **Region**: Southeast Asia (Singapore) — gần Việt Nam nhất
3. Chờ khoảng 1 phút để project khởi tạo xong

#### Lấy API Keys

Vào **Project Settings** (icon bánh răng) → **API**:

- **Project URL** → copy, ví dụ: `https://abcxyz.supabase.co`
- **anon / public** → copy key (bắt đầu bằng `sb_publishable_...` hoặc `eyJ...`)
- **service_role (secret)** → copy key này — **KHÔNG chia sẻ với ai, chỉ dùng server-side**

> ⚠️ Giữ `service_role` key bí mật tuyệt đối. Nếu lộ, kẻ xấu có thể đọc/xóa toàn bộ DB.

#### Chạy SQL Schema

Vào **SQL Editor** → **New query** → paste toàn bộ nội dung file `supabase_schema.sql` → nhấn **Run**.

Tiếp theo chạy file `supabase_fix_rls_and_data.sql` để thêm dữ liệu mẫu (ca làm, mật khẩu admin mặc định `12345678`).

> Sau khi deploy production, chạy thêm `supabase_security_rls.sql` để bật bảo mật RLS.

---

### 0B. Tạo tài khoản Cloudinary

1. Vào **https://cloudinary.com** → **Sign up for free**
2. Sau khi đăng nhập, vào **Dashboard** — ghi lại **Cloud Name** (ví dụ: `dtvqq32lt`)

#### Tạo Upload Preset (cho phép upload không cần đăng nhập)

1. Vào **Settings** → **Upload** → kéo xuống phần **Upload presets**
2. Nhấn **Add upload preset**:
   - **Preset name**: `chamcong_unsigned`
   - **Signing Mode**: **Unsigned** ← quan trọng!
   - **Folder**: `chamcong` (tùy chọn)
3. Nhấn **Save**

#### Cập nhật Cloud Name vào code

Nếu Cloud Name của bạn **khác** với `dtvqq32lt`, cần sửa 2 file:

**`artifacts/chamcong/src/pages/ChamCong.tsx`** — dòng 47–48:
```typescript
const CLOUDINARY_CLOUD = "TEN_CLOUD_CUA_BAN";  // ← đổi ở đây
const CLOUDINARY_PRESET = "chamcong_unsigned";
```

**`artifacts/chamcong/src/pages/UngTuyen.tsx`** — dòng 10–11:
```typescript
const CLOUDINARY_CLOUD = "TEN_CLOUD_CUA_BAN";  // ← đổi ở đây
const CLOUDINARY_PRESET = "chamcong_unsigned";
```

> Nếu bạn dùng lại Cloud Name `dtvqq32lt` của dự án gốc (JTEC), không cần sửa gì.

---

## PHẦN A — CHẠY LOCAL TRÊN VS CODE

### A1. Cài đặt công cụ (làm 1 lần)

- [**Node.js 20+**](https://nodejs.org) — tải bản LTS, cài như phần mềm bình thường
- **pnpm**: mở Terminal/Command Prompt, chạy:
  ```bash
  npm install -g pnpm
  ```
- [**VS Code**](https://code.visualstudio.com)

### A2. Tải code và giải nén

- Trong Replit: nhấn nút **⋮** (ba chấm góc trên phải) → **Download as zip**
- Giải nén vào thư mục bất kỳ, ví dụ: `D:\jtec-chamcong`
- Mở VS Code → **File** → **Open Folder** → chọn thư mục vừa giải nén

### A3. Tạo file môi trường

> ⚠️ **Đây là bước hay bị bỏ qua nhất — nếu thiếu sẽ báo lỗi ngay khi khởi động.**

Trong thư mục dự án đã có sẵn 2 file **`.env.example`** làm mẫu. Bạn chỉ cần **sao chép** và **điền thông tin thật**:

#### Bước 1 — Sao chép file mẫu

Mở Terminal trong VS Code (Ctrl + `` ` ``) và chạy:

```bash
cp artifacts/chamcong/.env.example artifacts/chamcong/.env
cp artifacts/api-server/.env.example artifacts/api-server/.env
```

> **Windows** dùng lệnh: `copy` thay vì `cp`
> ```cmd
> copy artifacts\chamcong\.env.example artifacts\chamcong\.env
> copy artifacts\api-server\.env.example artifacts\api-server\.env
> ```

#### Bước 2 — Điền thông tin vào `artifacts/chamcong/.env`

Mở file vừa tạo, thay các giá trị `YOUR_...` bằng thông tin từ Supabase:

```env
VITE_SUPABASE_URL=https://abcxyz.supabase.co        ← Project URL
VITE_SUPABASE_ANON_KEY=sb_publishable_eyJ...         ← anon / public key
PORT=5000
BASE_PATH=/
```

#### Bước 3 — Điền thông tin vào `artifacts/api-server/.env`

```env
PORT=8080
VITE_SUPABASE_URL=https://abcxyz.supabase.co         ← Project URL (giống trên)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1...        ← service_role key (secret!)
```

> **Lấy thông tin ở đâu?** Supabase Dashboard → chọn project → **Project Settings** (icon bánh răng) → **API**
> - `Project URL` → điền vào `VITE_SUPABASE_URL` (cả 2 file)
> - `anon / public` → điền vào `VITE_SUPABASE_ANON_KEY`
> - `service_role` → điền vào `SUPABASE_SERVICE_ROLE_KEY` (**giữ bí mật!**)

### A4. Cài dependencies

Mở Terminal trong VS Code (Ctrl + `` ` ``) và chạy:

```bash
pnpm install
```

### A5. Chạy hệ thống (cần 2 terminal)

**Terminal 1 — API Server (backend):**
```bash
pnpm --filter @workspace/api-server run dev
```
Chờ thấy: `Server listening port: 8080`

**Terminal 2 — Frontend:**
```bash
pnpm --filter @workspace/chamcong run dev
```
Chờ thấy: `Local: http://localhost:5000/`

Mở trình duyệt: **http://localhost:5000**

> Cả 2 phải chạy cùng lúc. API server xử lý các thao tác admin (xóa, lưu cấu hình). Frontend tự động proxy `/api` sang port 8080.

### A6. Extension VS Code nên cài

- **ESLint** — phát hiện lỗi code
- **Prettier** — tự format code
- **Tailwind CSS IntelliSense** — gợi ý class Tailwind
- **TypeScript** — đã có sẵn trong VS Code

---

## PHẦN B — DEPLOY LÊN NETLIFY + RAILWAY

Khi deploy production, bạn cần deploy **2 thứ riêng biệt**:

| Thứ | Nền tảng | Ghi chú |
|-----|----------|---------|
| **Frontend** (React) | Netlify | Free, tự động build từ GitHub |
| **API Server** (Express) | Railway hoặc Render | Free tier có, cần luôn bật cho admin |

---

### B1. Đưa code lên GitHub

1. Tạo tài khoản [GitHub](https://github.com) nếu chưa có
2. Tạo repository mới (có thể để **Private**)
3. Trong VS Code Terminal:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
```

---

### B2. Deploy Frontend lên Netlify

1. Vào [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project** → chọn GitHub
2. Chọn repository vừa tạo
3. Cấu hình Build:

| Mục | Giá trị |
|-----|---------|
| Base directory | *(để trống)* |
| Build command | `npm install -g pnpm && pnpm install && pnpm --filter @workspace/chamcong run build` |
| Publish directory | `artifacts/chamcong/dist/public` |

4. **Environment Variables** (Netlify → Site settings → Environment variables):

```
VITE_SUPABASE_URL       = https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY  = sb_publishable_YOUR_ANON_KEY
VITE_API_URL            = https://YOUR_RAILWAY_APP.railway.app
```

> `VITE_API_URL` trỏ đến Railway server (xem phần B3). Nếu chưa có, để trống — admin sẽ không hoạt động trên production cho đến khi có.

5. Nhấn **Deploy site** → đợi build xong → nhận domain `xxx.netlify.app`

#### SPA Routing

File `artifacts/chamcong/public/_redirects` đã có sẵn với nội dung:
```
/*  /index.html  200
```
Đảm bảo file này tồn tại để các route như `/admin`, `/tra-cuu` không bị 404 khi refresh.

---

### B3. Deploy API Server lên Railway (cho admin operations)

1. Vào [railway.app](https://railway.app) → đăng nhập bằng GitHub → **New Project** → **Deploy from GitHub repo**
2. Chọn repository, Railway sẽ tự detect Node.js

3. Vào **Settings** → **Variables**, thêm:

```
PORT                    = 8080
VITE_SUPABASE_URL       = https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY = YOUR_SERVICE_ROLE_KEY_SECRET
```

4. Vào **Settings** → **Networking** → **Generate Domain** để lấy URL public
5. Copy URL (dạng `https://xxx.railway.app`) → dán vào `VITE_API_URL` trên Netlify

> **Lưu ý Railway free tier**: Có 500 giờ/tháng miễn phí. Nếu hết, server ngủ → admin không xóa/lưu được. Nâng plan $5/tháng để luôn bật.

**Thay thế Railway:** [Render.com](https://render.com) — tương tự, free tier có (ngủ sau 15 phút không dùng).

---

### B4. Kết nối Cloudinary với Netlify

Cloudinary dùng **upload preset** không yêu cầu key bí mật — nên **không cần** thêm env var Cloudinary vào Netlify. Cloud name và preset name đã hardcode trong code.

Chỉ cần đảm bảo:
- Cloudinary account còn hoạt động
- Upload preset `chamcong_unsigned` vẫn ở chế độ **Unsigned**

---

## PHẦN C — BẢO MẬT

### Kiểm tra trước khi deploy production

- [ ] Chạy `supabase_security_rls.sql` trong Supabase SQL Editor để bật RLS
- [ ] `service_role` key chỉ nằm ở Railway/Render — **không commit lên GitHub**
- [ ] File `.env` đã trong `.gitignore` (đã cấu hình sẵn)
- [ ] Đổi mật khẩu admin mặc định (`12345678`) qua trang `/admin` → Cài đặt → Đổi mật khẩu
- [ ] Upload preset Cloudinary ở chế độ **Unsigned** (chỉ cho phép upload, không đọc/xóa)

### Tóm tắt luồng bảo mật

```
Nhân viên (browser)
  ├── Chấm công     → Supabase anon key (RLS cho phép INSERT)
  ├── Tra cứu       → Supabase anon key (RLS cho phép SELECT)
  └── Upload ảnh    → Cloudinary unsigned preset (chỉ upload)

Admin (browser)
  ├── Đăng nhập    → Railway API server (kiểm tra mật khẩu)
  ├── Mọi thao tác xóa/sửa → Railway API server (service role key)
  └── Xem dữ liệu  → Supabase anon key (RLS cho phép SELECT)
```

---

## PHẦN D — TÓM TẮT NHANH (cấu hình đang dùng)

| Thông tin | Giá trị |
|-----------|---------|
| Supabase URL | `https://qsxntomjaintphxslfyt.supabase.co` |
| Supabase Anon Key | `sb_publishable_j8pF01lpzsv7IMgbamCdsQ_GhjbABgB` |
| Cloudinary Cloud Name | `dtvqq32lt` |
| Cloudinary Upload Preset | `chamcong_unsigned` |
| Frontend port (local) | `5000` |
| API server port (local) | `8080` |
| Mật khẩu admin mặc định | `12345678` (SHA-256 trong DB) |

> ⚠️ Phần này dành cho người nhận zip dự án gốc. Nếu bạn tạo dự án mới với Supabase/Cloudinary riêng, thay bằng thông tin của bạn.

---

## PHẦN E — XỬ LÝ SỰ CỐ THƯỜNG GẶP

| Vấn đề | Nguyên nhân | Giải pháp |
|--------|-------------|-----------|
| Admin đăng nhập được nhưng xóa/lưu thất bại | API server chưa chạy | Chạy `pnpm --filter @workspace/api-server run dev` ở terminal riêng |
| Ảnh không upload được | Cloudinary preset sai hoặc Unsigned chưa bật | Kiểm tra preset `chamcong_unsigned` ở Cloudinary Settings |
| Lỗi `Missing Supabase env vars` khi khởi động API server | Thiếu `.env` trong `artifacts/api-server/` | Tạo file theo hướng dẫn A3 |
| Netlify build thất bại | Thiếu env vars | Kiểm tra Environment Variables trong Netlify site settings |
| Admin trên Netlify không xóa được dữ liệu | `VITE_API_URL` chưa set hoặc Railway chưa deploy | Deploy Railway trước, lấy URL, điền vào Netlify env |
| Lỗi 404 khi refresh trang `/admin` | Thiếu file `_redirects` | Đảm bảo `artifacts/chamcong/public/_redirects` tồn tại |
| DB trống, không có ca làm việc | Chưa chạy SQL | Chạy `supabase_fix_rls_and_data.sql` trong Supabase SQL Editor |
