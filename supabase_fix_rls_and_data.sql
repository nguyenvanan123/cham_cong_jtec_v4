-- ============================================================
--  JTEC Chấm Công — FIX RLS + INSERT DATA
--  Chạy toàn bộ file này trong Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── BƯỚC 1: TẮT RLS TRÊN TẤT CẢ CÁC BẢNG ─────────────────
ALTER TABLE public.configs           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliations   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications  DISABLE ROW LEVEL SECURITY;

-- ─── BƯỚC 2: XOÁ POLICY CŨ NẾU CÓ ─────────────────────────
DROP POLICY IF EXISTS "allow_anon_upload"  ON storage.objects;
DROP POLICY IF EXISTS "allow_anon_select"  ON storage.objects;

-- ─── BƯỚC 3: CẤP QUYỀN CHO ANON ROLE ───────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configs          TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts           TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance       TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliations  TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applications TO anon;

-- ─── BƯỚC 4: INSERT CONFIGS MẶC ĐỊNH ────────────────────────
-- Mật khẩu admin mặc định: 12345678
INSERT INTO public.configs (key, value) VALUES
  ('admin_password',                '12345678'),
  ('banner_status',                 'off'),
  ('banner_url',                    ''),
  ('popup_status',                  'off'),
  ('popup_title',                   'Cơ hội việc làm'),
  ('popup_content',                 'Chúng tôi đang tuyển dụng! Bấm xem chi tiết.'),
  ('recruitment_link',              '/gioi-thieu'),
  ('zalo_admin_link',               ''),
  ('attendance_open_time',          ''),
  ('attendance_close_time',         ''),
  ('attendance_closed_message',     ''),
  ('shopee_link',                   ''),
  ('shopee_delay',                  '5'),
  ('affiliate_status',              'off'),
  ('affiliate_show_popup',          'on'),
  ('ung_tuyen_affiliate_status',    'off'),
  ('ung_tuyen_affiliate_show_popup','on'),
  ('ung_tuyen_shopee_link',         ''),
  ('ung_tuyen_shopee_delay',        '3')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ─── BƯỚC 5: INSERT CA LÀM VIỆC MẪU ────────────────────────
INSERT INTO public.shifts
  (name, start_time, end_time, base_wage, overtime_wage, bonus, attendance_bonus,
   base_wage_dayoff, overtime_wage_dayoff, base_wage_holiday, overtime_wage_holiday,
   base_wage_12h, base_wage_dayoff_12h, base_wage_holiday_12h)
VALUES
  ('Ca Sáng',  '06:00', '14:00', 280000, 52500, 0, 20000, 350000, 65625, 420000, 78750, 400000, 500000, 600000),
  ('Ca Chiều', '14:00', '22:00', 280000, 52500, 0, 20000, 350000, 65625, 420000, 78750, 400000, 500000, 600000),
  ('Ca Đêm',   '22:00', '06:00', 310000, 58125, 0, 20000, 385000, 72188, 462000, 86625, 440000, 550000, 660000)
ON CONFLICT DO NOTHING;

-- ─── KIỂM TRA KẾT QUẢ ───────────────────────────────────────
SELECT 'configs' AS bang, COUNT(*) AS so_dong FROM public.configs
UNION ALL
SELECT 'shifts',          COUNT(*) FROM public.shifts
UNION ALL
SELECT 'attendance',      COUNT(*) FROM public.attendance
UNION ALL
SELECT 'reconciliations', COUNT(*) FROM public.reconciliations
UNION ALL
SELECT 'job_applications',COUNT(*) FROM public.job_applications;
