export type DayType = "normal" | "dayoff" | "holiday";

const FIXED_HOLIDAYS: Record<string, string> = {
  "01-01": "Tết Dương lịch (1/1)",
  "04-30": "Ngày Giải phóng 30/4",
  "05-01": "Ngày Quốc tế Lao động 1/5",
  "09-02": "Ngày Quốc khánh 2/9",
};

type LunarGroup = { dates: string[]; name: string };

const LUNAR_GROUPS: LunarGroup[] = [
  { dates: ["2023-01-20","2023-01-21","2023-01-22","2023-01-23","2023-01-24","2023-01-25","2023-01-26"], name: "Tết Nguyên Đán 2023 (Quý Mão)" },
  { dates: ["2023-04-29"], name: "Giỗ Tổ Hùng Vương 2023" },
  { dates: ["2024-02-08","2024-02-09","2024-02-10","2024-02-11","2024-02-12","2024-02-13","2024-02-14"], name: "Tết Nguyên Đán 2024 (Giáp Thìn)" },
  { dates: ["2024-04-18"], name: "Giỗ Tổ Hùng Vương 2024" },
  { dates: ["2025-01-27","2025-01-28","2025-01-29","2025-01-30","2025-01-31","2025-02-01","2025-02-02"], name: "Tết Nguyên Đán 2025 (Ất Tỵ)" },
  { dates: ["2025-04-07"], name: "Giỗ Tổ Hùng Vương 2025" },
  { dates: ["2026-02-15","2026-02-16","2026-02-17","2026-02-18","2026-02-19","2026-02-20","2026-02-21"], name: "Tết Nguyên Đán 2026 (Bính Ngọ)" },
  { dates: ["2026-04-27"], name: "Giỗ Tổ Hùng Vương 2026" },
  { dates: ["2027-02-05","2027-02-06","2027-02-07","2027-02-08","2027-02-09"], name: "Tết Nguyên Đán 2027 (Đinh Mùi)" },
  { dates: ["2027-04-16"], name: "Giỗ Tổ Hùng Vương 2027" },
  { dates: ["2028-01-26","2028-01-27","2028-01-28","2028-01-29","2028-01-30"], name: "Tết Nguyên Đán 2028 (Mậu Thân)" },
  { dates: ["2028-04-04"], name: "Giỗ Tổ Hùng Vương 2028" },
  { dates: ["2029-02-12","2029-02-13","2029-02-14","2029-02-15","2029-02-16"], name: "Tết Nguyên Đán 2029 (Kỷ Dậu)" },
  { dates: ["2029-04-21"], name: "Giỗ Tổ Hùng Vương 2029" },
  { dates: ["2030-02-02","2030-02-03","2030-02-04","2030-02-05","2030-02-06"], name: "Tết Nguyên Đán 2030 (Canh Tuất)" },
  { dates: ["2030-04-11"], name: "Giỗ Tổ Hùng Vương 2030" },
];

const LUNAR_DATE_MAP = new Map<string, string>();
for (const g of LUNAR_GROUPS) {
  for (const d of g.dates) LUNAR_DATE_MAP.set(d, g.name);
}

const VN_DOW_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const VN_DOW_FULL  = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function parseDate(dateStr: string): Date {
  return new Date(dateStr + "T12:00:00");
}

export function detectDayType(dateStr: string): DayType {
  const date = parseDate(dateStr);
  const monthDay = dateStr.slice(5);
  if (FIXED_HOLIDAYS[monthDay]) return "holiday";
  if (LUNAR_DATE_MAP.has(dateStr)) return "holiday";
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return "dayoff";
  return "normal";
}

export function getDayOfWeekShort(dateStr: string): string {
  return VN_DOW_SHORT[parseDate(dateStr).getDay()];
}

export function getAutoReason(dateStr: string): string | null {
  const monthDay = dateStr.slice(5);
  if (FIXED_HOLIDAYS[monthDay]) return FIXED_HOLIDAYS[monthDay];
  if (LUNAR_DATE_MAP.has(dateStr)) return LUNAR_DATE_MAP.get(dateStr)!;
  const dow = parseDate(dateStr).getDay();
  if (dow === 0 || dow === 6) return VN_DOW_FULL[dow];
  return null;
}
