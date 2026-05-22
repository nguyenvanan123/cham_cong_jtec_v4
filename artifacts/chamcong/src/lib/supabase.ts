import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type AttendanceRecord = {
  id: string;
  employee_id: string;
  full_name: string;
  work_date: string;
  shift: string;
  action_type: "check-in" | "check-out";
  image_url: string | null;
  video_url: string | null;
  created_at: string;
};

export type Config = {
  id: string;
  key: string;
  value: string;
};

export type Shift = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  base_wage: number;
  overtime_wage: number;
  bonus: number;
  attendance_bonus: number;
  base_wage_dayoff: number;
  overtime_wage_dayoff: number;
  base_wage_holiday: number;
  overtime_wage_holiday: number;
  base_wage_12h: number;
  base_wage_dayoff_12h: number;
  base_wage_holiday_12h: number;
  created_at: string;
};

export type Reconciliation = {
  id: string;
  employee_id: string;
  full_name: string;
  work_date: string;
  shift_name: string;
  check_in_time: string;
  check_out_time: string;
  total_hours: number;
  normal_hours: number;
  overtime_hours: number;
  base_wage: number;
  overtime_pay: number;
  bonus: number;
  attendance_bonus: number;
  total_wage: number;
  bank_account: string;
  bank_name: string;
  check_in_image: string;
  check_out_image: string;
  check_in_video?: string;
  check_out_video?: string;
  start_date?: string;
  day_type?: string;
  employee_type?: string;
  notes?: string;
  created_at: string;
};

export type JobApplication = {
  id: string;
  full_name: string;
  phone: string;
  cccd_front_url: string;
  cccd_back_url: string;
  referrer_name: string;
  referrer_id: string;
  referrer_bank_account: string;
  referrer_bank_name: string;
  bank_account: string;
  status: string;
  shopee_link?: string | null;
  created_at: string;
};
