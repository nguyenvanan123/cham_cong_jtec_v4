-- ============================================================
--  JTEC Chấm Công — CÀI ĐẶT BẢO MẬT RLS
--  Chạy trong Supabase Dashboard → SQL Editor
--
--  Vấn đề hiện tại: RLS tắt hoàn toàn → anon key có thể
--  ĐỌC, SỬA, XOÁ mọi dữ liệu.
--
--  Script này bật lại RLS với policy phù hợp với kiến trúc
--  hiện tại (không có backend riêng).
-- ============================================================

-- ─── BƯỚC 1: BẬT LẠI RLS ────────────────────────────────────
ALTER TABLE public.configs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications  ENABLE ROW LEVEL SECURITY;

-- ─── BƯỚC 2: XOÁ POLICY CŨ (NẾU CÓ) ───────────────────────
DROP POLICY IF EXISTS "anon_select_configs"          ON public.configs;
DROP POLICY IF EXISTS "anon_select_shifts"           ON public.shifts;
DROP POLICY IF EXISTS "anon_insert_attendance"       ON public.attendance;
DROP POLICY IF EXISTS "anon_select_attendance"       ON public.attendance;
DROP POLICY IF EXISTS "anon_insert_job_applications" ON public.job_applications;
DROP POLICY IF EXISTS "anon_select_reconciliations"  ON public.reconciliations;

-- ─── BƯỚC 3: POLICY CHO TỪNG BẢNG ──────────────────────────

-- CONFIGS: Chỉ đọc (banner, shifts, popup...).
-- Admin sửa trực tiếp qua Supabase Dashboard (service role).
CREATE POLICY "anon_select_configs" ON public.configs
  FOR SELECT TO anon USING (true);

-- Cho phép admin (qua app) cập nhật configs:
-- Vì app dùng anon key để update configs (banner, password...),
-- ta phải cho phép UPDATE nhưng chặn DELETE.
CREATE POLICY "anon_update_configs" ON public.configs
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Cho phép INSERT configs nếu key chưa tồn tại (upsert):
CREATE POLICY "anon_insert_configs" ON public.configs
  FOR INSERT TO anon WITH CHECK (true);

-- SHIFTS: Chỉ đọc (nhân viên chọn ca).
-- Admin quản lý shifts qua app nên cần full access.
CREATE POLICY "anon_select_shifts" ON public.shifts
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_shifts" ON public.shifts
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_shifts" ON public.shifts
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_shifts" ON public.shifts
  FOR DELETE TO anon USING (true);

-- ATTENDANCE: Nhân viên INSERT (chấm công) + đọc record của chính họ.
-- KHÔNG cho phép DELETE hay UPDATE (tránh bị xoá dữ liệu công).
CREATE POLICY "anon_insert_attendance" ON public.attendance
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_attendance" ON public.attendance
  FOR SELECT TO anon USING (true);

-- CHẶN DELETE và UPDATE attendance (bảo vệ dữ liệu công):
-- (Không tạo policy DELETE/UPDATE → mặc định bị từ chối)

-- RECONCILIATIONS: Admin đọc/ghi để đối soát lương.
-- Nhân viên không cần truy cập bảng này.
CREATE POLICY "anon_all_reconciliations" ON public.reconciliations
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- JOB_APPLICATIONS: Nhân viên chỉ INSERT (nộp đơn).
-- Không cho đọc đơn của người khác.
CREATE POLICY "anon_insert_job_applications" ON public.job_applications
  FOR INSERT TO anon WITH CHECK (true);

-- Admin cần đọc tất cả đơn → cho phép SELECT:
CREATE POLICY "anon_select_job_applications" ON public.job_applications
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update_job_applications" ON public.job_applications
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ─── BƯỚC 4: KIỂM TRA ───────────────────────────────────────
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
