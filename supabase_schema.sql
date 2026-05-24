-- ============================================================
--  JTEC Chấm Công — Supabase Schema (tạo lại toàn bộ DB)
--  Chạy toàn bộ file này trong Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. BẢNG shifts — danh sách ca làm việc
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shifts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  start_time            TEXT NOT NULL,          -- HH:mm
  end_time              TEXT NOT NULL,          -- HH:mm
  base_wage             NUMERIC NOT NULL DEFAULT 0,
  overtime_wage         NUMERIC NOT NULL DEFAULT 0,
  bonus                 NUMERIC NOT NULL DEFAULT 0,
  attendance_bonus      NUMERIC NOT NULL DEFAULT 0,
  base_wage_dayoff      NUMERIC NOT NULL DEFAULT 0,
  overtime_wage_dayoff  NUMERIC NOT NULL DEFAULT 0,
  base_wage_holiday     NUMERIC NOT NULL DEFAULT 0,
  overtime_wage_holiday NUMERIC NOT NULL DEFAULT 0,
  base_wage_12h         NUMERIC NOT NULL DEFAULT 0,
  base_wage_dayoff_12h  NUMERIC NOT NULL DEFAULT 0,
  base_wage_holiday_12h NUMERIC NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shifts DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 2. BẢNG configs — cài đặt hệ thống (key-value)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.configs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.configs DISABLE ROW LEVEL SECURITY;

-- Giá trị mặc định
INSERT INTO public.configs (key, value) VALUES
  ('admin_password',             ''),
  ('banner_status',              'off'),
  ('banner_url',                 ''),
  ('popup_status',               'off'),
  ('popup_title',                'Cơ hội việc làm'),
  ('popup_content',              'Chúng tôi đang tuyển dụng! Bấm xem chi tiết.'),
  ('recruitment_link',           '/gioi-thieu'),
  ('zalo_admin_link',            ''),
  ('attendance_open_time',       ''),
  ('attendance_close_time',      ''),
  ('attendance_closed_message',  ''),
  ('shopee_link',                ''),
  ('shopee_delay',               '5'),
  ('affiliate_status',           'off'),
  ('affiliate_show_popup',       'on'),
  ('ung_tuyen_affiliate_status', 'off'),
  ('ung_tuyen_affiliate_show_popup', 'on'),
  ('ung_tuyen_shopee_link',      ''),
  ('ung_tuyen_shopee_delay',     '3')
ON CONFLICT (key) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 3. BẢNG attendance — chấm công (check-in / check-out)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  work_date     DATE NOT NULL,
  work_date_end DATE,                           -- ca đêm: ngày kết thúc
  shift         TEXT NOT NULL,
  action_type   TEXT NOT NULL CHECK (action_type IN ('check-in', 'check-out')),
  image_url     TEXT,                           -- Cloudinary URL ảnh
  video_url     TEXT,                           -- Cloudinary URL video
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_employee_date_idx
  ON public.attendance (employee_id, work_date);

ALTER TABLE public.attendance DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 4. BẢNG reconciliations — bảng tổng hợp công / lương
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reconciliations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  work_date         DATE NOT NULL,
  work_date_end     DATE,
  shift_name        TEXT NOT NULL,
  check_in_time     TEXT,
  check_out_time    TEXT,
  total_hours       NUMERIC NOT NULL DEFAULT 0,
  normal_hours      NUMERIC NOT NULL DEFAULT 0,
  overtime_hours    NUMERIC NOT NULL DEFAULT 0,
  base_wage         NUMERIC NOT NULL DEFAULT 0,
  overtime_pay      NUMERIC NOT NULL DEFAULT 0,
  bonus             NUMERIC NOT NULL DEFAULT 0,
  attendance_bonus  NUMERIC NOT NULL DEFAULT 0,
  total_wage        NUMERIC NOT NULL DEFAULT 0,
  bank_account      TEXT NOT NULL DEFAULT '',
  bank_name         TEXT NOT NULL DEFAULT '',
  check_in_image    TEXT NOT NULL DEFAULT '',   -- Cloudinary URL
  check_out_image   TEXT NOT NULL DEFAULT '',   -- Cloudinary URL
  check_in_video    TEXT,                       -- Cloudinary URL
  check_out_video   TEXT,                       -- Cloudinary URL
  start_date        DATE,
  day_type          TEXT NOT NULL DEFAULT 'normal' CHECK (day_type IN ('normal', 'dayoff', 'holiday')),
  employee_type     TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS reconciliations_employee_date_idx
  ON public.reconciliations (employee_id, work_date);

ALTER TABLE public.reconciliations DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 5. BẢNG job_applications — đơn ứng tuyển
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name             TEXT NOT NULL,
  phone                 TEXT NOT NULL DEFAULT '',
  cccd_front_url        TEXT NOT NULL DEFAULT '', -- Cloudinary URL ảnh CCCD mặt trước
  cccd_back_url         TEXT NOT NULL DEFAULT '', -- Cloudinary URL ảnh CCCD mặt sau
  referrer_name         TEXT NOT NULL DEFAULT '',
  referrer_id           TEXT NOT NULL DEFAULT '',
  referrer_bank_account TEXT NOT NULL DEFAULT '',
  referrer_bank_name    TEXT NOT NULL DEFAULT '',
  bank_account          TEXT NOT NULL DEFAULT '',
  bank_name             TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'pending',
  shopee_link           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.job_applications DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 6. STORAGE BUCKETS
--    Tạo thủ công trong Supabase Dashboard > Storage:
--
--    • checkin_photos   — Public bucket — lưu ảnh/video chấm công
--      (Nếu vẫn dùng Supabase Storage cho video fallback)
--
--    • application_docs — Public bucket — lưu ảnh CCCD
--      (Nếu vẫn dùng Supabase Storage cho CCCD fallback)
--
--    Hoặc nếu toàn bộ ảnh đã chuyển sang Cloudinary thì
--    không cần tạo bucket nào cả.
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- Xong! Tất cả bảng đã được tạo với RLS tắt (phù hợp dev).
-- Nhớ review RLS trước khi đưa lên production.
-- ─────────────────────────────────────────────────────────────
