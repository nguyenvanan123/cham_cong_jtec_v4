-- Bật RLS cho bảng attendance
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Cho phép mọi người xem và thêm dữ liệu
CREATE POLICY "allow_select" ON attendance FOR SELECT USING (true);
CREATE POLICY "allow_insert" ON attendance FOR INSERT WITH CHECK (true);

-- Chỉ Admin mới xóa được (dùng Supabase dashboard để xóa thủ công)
-- Hoặc bật policy delete cho authenticated users:
CREATE POLICY "allow_delete_auth" ON attendance FOR DELETE USING (auth.role() = 'authenticated');

-- Bật RLS cho bảng configs
ALTER TABLE configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_select_configs" ON configs FOR SELECT USING (true);

-- Storage: cho phép upload ảnh
CREATE POLICY "allow_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'checkin_photos');
CREATE POLICY "allow_view" ON storage.objects FOR SELECT USING (bucket_id = 'checkin_photos');

INSERT INTO configs (key, value) 
VALUES ('banner_url', 'https://link-anh-banner-cua-ban.jpg');

INSERT INTO configs (key, value) 
VALUES ('admin_password', '1234')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;


-- Bảng đơn ứng tuyển
CREATE TABLE IF NOT EXISTS job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  bank_account text NOT NULL,
  referrer_name text,
  referrer_id text,
  cccd_front_url text NOT NULL,
  cccd_back_url text NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Bucket lưu CCCD (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('application_docs', 'application_docs', false) ON CONFLICT DO NOTHING;

-- Cài đặt popup mặc định
INSERT INTO configs (key, value) VALUES
  ('popup_status', 'off'),
  ('popup_title', 'Cơ hội việc làm'),
  ('popup_content', 'Chúng tôi đang tuyển dụng! Nhấn Xem chi tiết để biết thêm.'),
  ('recruitment_link', '/ung-tuyen'),
  ('shopee_link', 'https://shp.ee/your-link')
ON CONFLICT (key) DO NOTHING;


CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  base_salary numeric(12,0) DEFAULT 0,
  attendance_bonus numeric(12,0) DEFAULT 0,
  overtime_rate numeric(4,2) DEFAULT 1.5,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL,
  full_name text NOT NULL,
  work_date date NOT NULL,
  shift_name text,
  checkin_time text,
  checkout_time text,
  regular_hours numeric(5,2) DEFAULT 0,
  overtime_hours numeric(5,2) DEFAULT 0,
  base_salary numeric(12,0) DEFAULT 0,
  overtime_rate numeric(4,2) DEFAULT 1.5,
  total_salary numeric(12,0) DEFAULT 0,
  bank_account text,
  bank_name text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS employee_profiles (
  employee_id text PRIMARY KEY,
  full_name text,
  bank_account text,
  bank_name text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS phone text;

INSERT INTO configs (key, value)
VALUES ('shopee_redirect_seconds', '5')
ON CONFLICT (key) DO NOTHING;


CREATE TABLE reconciliations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id text NOT NULL,
  work_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, work_date)
);

ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS phone text;

-- Bảng đơn ứng tuyển
CREATE TABLE IF NOT EXISTS job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  bank_account text NOT NULL,
  referrer_name text,
  referrer_id text,
  cccd_front_url text NOT NULL,
  cccd_back_url text NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Bucket lưu CCCD (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('application_docs', 'application_docs', false) ON CONFLICT DO NOTHING;

-- Cài đặt popup mặc định
INSERT INTO configs (key, value) VALUES
  ('popup_status', 'off'),
  ('popup_title', 'Cơ hội việc làm'),
  ('popup_content', 'Chúng tôi đang tuyển dụng! Nhấn Xem chi tiết để biết thêm.'),
  ('recruitment_link', '/ung-tuyen'),
  ('shopee_link', 'https://shp.ee/your-link')
ON CONFLICT (key) DO NOTHING;


CREATE TABLE shifts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL, start_time text, end_time text,
  hourly_rate numeric(12,2) NOT NULL DEFAULT 0,
  overtime_multiplier numeric(4,2) NOT NULL DEFAULT 1.5,
  attendance_bonus numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE employee_bank_accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id text NOT NULL UNIQUE,
  account_number text, bank_name text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS checkin_time text;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS checkout_time text;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS regular_hours numeric(5,2);
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS overtime_hours numeric(5,2);
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS total_salary numeric(12,2);

CREATE TABLE shifts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '06:00',
  end_time TEXT NOT NULL DEFAULT '14:00',
  base_wage NUMERIC DEFAULT 0,
  overtime_wage NUMERIC DEFAULT 0,
  bonus NUMERIC DEFAULT 0,
  attendance_bonus NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reconciliations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  work_date DATE NOT NULL,
  shift_name TEXT DEFAULT '',
  check_in_time TEXT DEFAULT '',
  check_out_time TEXT DEFAULT '',
  total_hours NUMERIC DEFAULT 0,
  normal_hours NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  base_wage NUMERIC DEFAULT 0,
  overtime_pay NUMERIC DEFAULT 0,
  bonus NUMERIC DEFAULT 0,
  attendance_bonus NUMERIC DEFAULT 0,
  total_wage NUMERIC DEFAULT 0,
  bank_account TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  check_in_image TEXT DEFAULT '',
  check_out_image TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '06:00',
  end_time TEXT NOT NULL DEFAULT '14:00',
  base_wage NUMERIC DEFAULT 0,
  overtime_wage NUMERIC DEFAULT 0,
  bonus NUMERIC DEFAULT 0,
  attendance_bonus NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Bước 2: Tắt RLS (bắt buộc để thêm/sửa/xóa được)
ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS reconciliations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  work_date DATE NOT NULL,
  shift_name TEXT DEFAULT '',
  check_in_time TEXT DEFAULT '',
  check_out_time TEXT DEFAULT '',
  total_hours NUMERIC DEFAULT 0,
  normal_hours NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  base_wage NUMERIC DEFAULT 0,
  overtime_pay NUMERIC DEFAULT 0,
  bonus NUMERIC DEFAULT 0,
  attendance_bonus NUMERIC DEFAULT 0,
  total_wage NUMERIC DEFAULT 0,
  bank_account TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  check_in_image TEXT DEFAULT '',
  check_out_image TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reconciliations DISABLE ROW LEVEL SECURITY;P['
'