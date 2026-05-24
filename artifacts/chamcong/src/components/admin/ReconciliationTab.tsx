import { useState, useEffect, useCallback } from "react";
import { getOptimizedUrl } from "@/utils/cloudinaryUtils";
import { supabase } from "@/lib/supabase";
import type { AttendanceRecord, Shift, Reconciliation } from "@/lib/supabase";
import { adminApi } from "@/lib/adminApi";
import { detectDayType, getDayOfWeekShort, getAutoReason } from "@/lib/vn-holidays";
import { X, CheckCircle, Clock, Banknote, CalendarCheck, RefreshCw, Search, Save, AlertCircle, ZoomIn, Play } from "lucide-react";

type Group = {
  employee_id: string;
  full_name: string;
  work_date: string;
  shift: string;
  checkIn: AttendanceRecord | null;
  checkOut: AttendanceRecord | null;
};

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayLocal() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toHHMM(isoDate: string) {
  return new Date(isoDate).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function calcHours(inT: string, outT: string) {
  if (!inT || !outT) return null;
  const [ih, im] = inT.split(":").map(Number);
  const [oh, om] = outT.split(":").map(Number);
  let mins = (oh * 60 + om) - (ih * 60 + im);
  if (mins < 0) mins += 1440;
  const total = mins / 60;
  return { total, normal: Math.min(total, 8), overtime: Math.max(0, total - 8) };
}

function fH(n: number) { return n.toFixed(2) + "h"; }
function fM(n: number) { return n.toLocaleString("vi-VN") + "đ"; }

const SQL_RECON = `-- Bước 1: Tạo bảng reconciliations (nếu chưa có)
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
  employee_type CHAR(1) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bước 2: Bổ sung cột nếu bảng đã tồn tại nhưng thiếu cột
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS shift_name TEXT DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS check_in_time TEXT DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS check_out_time TEXT DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS total_hours NUMERIC DEFAULT 0;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS normal_hours NUMERIC DEFAULT 0;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC DEFAULT 0;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS base_wage NUMERIC DEFAULT 0;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS overtime_pay NUMERIC DEFAULT 0;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS bonus NUMERIC DEFAULT 0;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS attendance_bonus NUMERIC DEFAULT 0;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS total_wage NUMERIC DEFAULT 0;
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS bank_account TEXT DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS check_in_image TEXT DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS check_out_image TEXT DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS check_in_video TEXT DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS check_out_video TEXT DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS start_date TEXT DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS day_type TEXT DEFAULT 'normal';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS employee_type CHAR(1) DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS work_date_end DATE;

-- Bước 3: Tắt RLS (bắt buộc để lưu dữ liệu đối soát)
ALTER TABLE reconciliations DISABLE ROW LEVEL SECURITY;`;

const EMP_TYPE_KEY = (id: string) => `jtec_emp_type_${id}`;
const START_DATE_KEY = (id: string) => `jtec_start_date_${id}`;

export function ReconciliationTab({ allRecords }: { allRecords: AttendanceRecord[] }) {
  const [dateFrom, setDateFrom] = useState(yesterdayLocal());
  const [dateTo, setDateTo] = useState(todayLocal());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Group | null>(null);
  const [dbError, setDbError] = useState(false);
  const [saveErrMsg, setSaveErrMsg] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  // Map employee_id -> employee_type đã lưu (để hiển thị badge trên danh sách)
  const [empTypes, setEmpTypes] = useState<Record<string, string>>({});

  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankName, setBankName] = useState("");
  const [employeeType, setEmployeeType] = useState<"N" | "O" | "">("");
  const [startDate, setStartDate] = useState("");
  const [startDates, setStartDates] = useState<Record<string, string>>({});
  const [dayType, setDayType] = useState<"normal" | "dayoff" | "holiday">("normal");
  const [dayTypes, setDayTypes] = useState<Record<string, string>>({});
  const [shiftDurationOverride, setShiftDurationOverride] = useState<"8h" | "12h" | null>(null);
  const [notes, setNotes] = useState("");
  const [workDateStart, setWorkDateStart] = useState("");
  const [workDateEnd, setWorkDateEnd] = useState("");
  const [workDateEnds, setWorkDateEnds] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [lightboxVideo, setLightboxVideo] = useState<string | null>(null);

  const loadShifts = useCallback(async () => {
    const { data } = await supabase.from("shifts").select("*").order("created_at");
    setShifts((data || []) as Shift[]);
  }, []);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  // Tính ngày hôm trước
  function prevDay(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  useEffect(() => {
    // Lọc attendance theo khoảng ngày
    const recs = allRecords.filter(r => r.work_date >= dateFrom && r.work_date <= dateTo);
    // Key = employee_id + work_date để hỗ trợ nhiều ngày
    const map = new Map<string, Group>();
    for (const r of recs) {
      const key = `${r.employee_id}_${r.work_date}`;
      if (!map.has(key)) {
        map.set(key, { employee_id: r.employee_id, full_name: r.full_name, work_date: r.work_date, shift: r.shift, checkIn: null, checkOut: null });
      }
      const g = map.get(key)!;
      if (r.action_type === "check-in") g.checkIn = r;
      else g.checkOut = r;
    }
    // Sắp xếp: ngày mới nhất trước, cùng ngày thì ai gửi gần nhất lên trước
    setGroups(Array.from(map.values()).sort((a, b) => {
      const dateCmp = b.work_date.localeCompare(a.work_date);
      if (dateCmp !== 0) return dateCmp;
      const aAt = a.checkOut?.created_at ?? a.checkIn?.created_at ?? "";
      const bAt = b.checkOut?.created_at ?? b.checkIn?.created_at ?? "";
      return bAt.localeCompare(aAt);
    }));

    // Load trạng thái đã đối soát — savedIds lưu dạng "employee_id_attendance_date"
    Promise.all([
      supabase
        .from("reconciliations")
        .select("employee_id, employee_type, start_date, day_type, work_date, work_date_end")
        .gte("work_date", dateFrom)
        .lte("work_date", dateTo),
      supabase
        .from("reconciliations")
        .select("employee_id, employee_type, start_date, day_type, work_date, work_date_end")
        .gte("work_date_end", dateFrom)
        .lte("work_date_end", dateTo),
    ]).then(([res1, res2]) => {
      type ReconRow = { employee_id: string; employee_type?: string; start_date?: string; day_type?: string; work_date?: string; work_date_end?: string };
      const combined = [...(res1.data || []), ...(res2.data || [])] as ReconRow[];
      // Dedupe by "employee_id_attendance_date"
      const seen = new Set<string>();
      const deduped = combined.filter(r => {
        // Ca đêm: attendance_date = work_date_end; ca ngày: attendance_date = work_date
        const attendanceDate = (r.work_date_end && r.work_date_end !== r.work_date) ? r.work_date_end : r.work_date;
        const key = `${r.employee_id}_${attendanceDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // savedIds lưu dạng "employee_id_attendance_date"
      setSavedIds(deduped.map(r => {
        const attendanceDate = (r.work_date_end && r.work_date_end !== r.work_date) ? r.work_date_end : r.work_date;
        return `${r.employee_id}_${attendanceDate}`;
      }));
      const typeMap: Record<string, string> = {};
      const sdMap: Record<string, string> = {};
      const dtMap: Record<string, string> = {};
      const wedMap: Record<string, string> = {};
      for (const r of deduped) {
        const t = r.employee_type?.trim() || localStorage.getItem(EMP_TYPE_KEY(r.employee_id)) || "";
        if (t) typeMap[r.employee_id] = t;
        const sd = r.start_date || localStorage.getItem(START_DATE_KEY(r.employee_id)) || "";
        if (sd) sdMap[r.employee_id] = sd;
        const attendanceDate = (r.work_date_end && r.work_date_end !== r.work_date) ? r.work_date_end : r.work_date;
        if (r.day_type && attendanceDate) dtMap[`${r.employee_id}_${attendanceDate}`] = r.day_type;
        if (r.work_date_end && attendanceDate) wedMap[`${r.employee_id}_${attendanceDate}`] = r.work_date_end;
      }
      setEmpTypes(typeMap);
      setStartDates(sdMap);
      setDayTypes(dtMap);
      setWorkDateEnds(wedMap);
    });
  }, [dateFrom, dateTo, allRecords]);

  const openPopup = async (g: Group) => {
    setSelected(g);
    // Đặt giá trị mặc định từ attendance trước
    setInTime(g.checkIn ? toHHMM(g.checkIn.created_at) : "");
    setOutTime(g.checkOut ? toHHMM(g.checkOut.created_at) : "");
    // Khớp ca: tìm ca mà tên ca nằm trong chuỗi ca nhân viên đã chọn
    // VD: g.shift="ca 3 (22:00 - 06:00)" → khớp với s.name="ca 3"
    const matched = shifts.find(s =>
      g.shift.toLowerCase().includes(s.name.toLowerCase())
    );
    setShiftId(matched?.id ?? "");
    setBankAccount("");
    setBankName("");
    setNotes("");
    setDayType(detectDayType(g.work_date));
    setShiftDurationOverride(null);
    // Overnight shift: ngày bắt đầu = ngày TRƯỚC ngày nhân viên gửi, ngày kết thúc = ngày gửi
    const isOvernightMatched = matched ? matched.end_time < matched.start_time : false;
    if (isOvernightMatched) {
      setWorkDateStart(prevDay(g.work_date));
      setWorkDateEnd(g.work_date);
    } else {
      setWorkDateStart(g.work_date);
      setWorkDateEnd("");
    }
    // Load loại NV và ngày vào làm từ localStorage trước (nhanh)
    const storedType = localStorage.getItem(EMP_TYPE_KEY(g.employee_id));
    setEmployeeType((storedType as "N" | "O") || "");
    const storedStartDate = localStorage.getItem(START_DATE_KEY(g.employee_id));
    setStartDate(storedStartDate || "");
    // Nếu đã đối soát trước đó, load lại toàn bộ dữ liệu đã xác nhận
    // Ca đêm: tìm theo work_date = ngày trước, hoặc work_date_end = ngày hiện tại
    const [res1, res2] = await Promise.all([
      supabase.from("reconciliations")
        .select("check_in_time, check_out_time, shift_name, bank_account, bank_name, employee_type, start_date, day_type, notes, work_date, work_date_end")
        .eq("employee_id", g.employee_id)
        .eq("work_date", isOvernightMatched ? prevDay(g.work_date) : g.work_date)
        .limit(1),
      isOvernightMatched
        ? supabase.from("reconciliations")
            .select("check_in_time, check_out_time, shift_name, bank_account, bank_name, employee_type, start_date, day_type, notes, work_date, work_date_end")
            .eq("employee_id", g.employee_id)
            .eq("work_date_end", g.work_date)
            .limit(1)
        : Promise.resolve({ data: [] }),
    ]);
    const savedRaw = res1.data?.[0] || res2.data?.[0];
    if (savedRaw) {
      const saved = savedRaw as {
        check_in_time: string; check_out_time: string;
        shift_name: string; bank_account: string; bank_name: string;
        employee_type?: string; start_date?: string; day_type?: string; notes?: string;
        work_date?: string; work_date_end?: string;
      };
      if (saved.check_in_time) setInTime(saved.check_in_time);
      if (saved.check_out_time) setOutTime(saved.check_out_time);
      if (saved.bank_account) setBankAccount(saved.bank_account);
      if (saved.bank_name) setBankName(saved.bank_name);
      setNotes(saved.notes || "");
      if (saved.employee_type) setEmployeeType(saved.employee_type as "N" | "O");
      if (saved.start_date) setStartDate(saved.start_date);
      if (saved.day_type) setDayType(saved.day_type as "normal" | "dayoff" | "holiday");
      // Khôi phục ngày bắt đầu/kết thúc ca đêm đã lưu
      if (isOvernightMatched) {
        if (saved.work_date) setWorkDateStart(saved.work_date);
        if (saved.work_date_end) setWorkDateEnd(saved.work_date_end);
      }
      if (saved.shift_name) {
        const prevShift = shifts.find(s =>
          saved.shift_name.toLowerCase().includes(s.name.toLowerCase())
        );
        if (prevShift) setShiftId(prevShift.id);
      }
    }
    // Nếu chưa có trong bản ghi hôm nay, tìm start_date từ bất kỳ ngày nào trước đó
    if (!savedRaw?.start_date && !storedStartDate) {
      const { data: anyRec } = await supabase.from("reconciliations")
        .select("start_date")
        .eq("employee_id", g.employee_id)
        .not("start_date", "is", null)
        .neq("start_date", "")
        .order("created_at", { ascending: false })
        .limit(1);
      if (anyRec?.[0]?.start_date) setStartDate(anyRec[0].start_date);
    }
  };

  const closePopup = () => { setSelected(null); setNotes(""); };

  const shift = shifts.find(s => s.id === shiftId) ?? null;
  const hrs = calcHours(inTime, outTime);

  // Shift duration: auto from hours (>=12h → 12h tier), overrideable manually
  const autoDuration = hrs && hrs.total >= 12 ? "12h" : "8h";
  const shiftDuration = shiftDurationOverride ?? autoDuration;
  const isOvernightShift = shift ? shift.end_time < shift.start_time : false;

  // Auto day type detection from work date
  const autoDetectedType = selected ? detectDayType(selected.work_date) : "normal";
  const autoReason = selected ? getAutoReason(selected.work_date) : null;
  const workDayOfWeek = selected ? getDayOfWeekShort(selected.work_date) : "";

  const effectiveBaseWage = !shift ? 0
    : dayType === "holiday"
      ? (shiftDuration === "12h" ? (shift.base_wage_holiday_12h || 0) : (shift.base_wage_holiday || 0))
    : dayType === "dayoff"
      ? (shiftDuration === "12h" ? (shift.base_wage_dayoff_12h || 0) : (shift.base_wage_dayoff || 0))
    : (shiftDuration === "12h" ? (shift.base_wage_12h || 0) : shift.base_wage);
  const effectiveOTWage = !shift ? 0
    : dayType === "holiday" ? (shift.overtime_wage_holiday || 0)
    : dayType === "dayoff"  ? (shift.overtime_wage_dayoff || 0)
    : shift.overtime_wage;
  const wages = hrs && shift ? {
    base: effectiveBaseWage,
    overtime: hrs.overtime * effectiveOTWage,
    bonus: shift.bonus,
    attendance: shift.attendance_bonus,
    total: effectiveBaseWage + hrs.overtime * effectiveOTWage + shift.bonus + shift.attendance_bonus,
  } : null;
  const wageTheme = dayType === "holiday"
    ? { grad: "from-red-50 to-rose-50 border-red-100", title: "text-red-700", base: "text-red-700", ot: "text-orange-600", label: "🔴 Ngày lễ" }
    : dayType === "dayoff"
    ? { grad: "from-orange-50 to-amber-50 border-orange-100", title: "text-orange-700", base: "text-orange-700", ot: "text-amber-600", label: "🟠 Ngày nghỉ" }
    : { grad: "from-blue-50 to-indigo-50 border-blue-100", title: "text-foreground", base: "text-green-700", ot: "text-orange-600", label: "🟢 Ngày thường" };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveErrMsg(null);

    // Lưu loại NV và ngày vào làm vào localStorage ngay lập tức
    if (employeeType) {
      localStorage.setItem(EMP_TYPE_KEY(selected.employee_id), employeeType);
      setEmpTypes(prev => ({ ...prev, [selected.employee_id]: employeeType }));
    }
    if (startDate) {
      localStorage.setItem(START_DATE_KEY(selected.employee_id), startDate);
      setStartDates(prev => ({ ...prev, [selected.employee_id]: startDate }));
    }
    setDayTypes(prev => ({ ...prev, [selected.employee_id]: dayType }));

    const baseRec: Omit<Reconciliation, "id" | "created_at" | "employee_type"> = {
      employee_id: selected.employee_id,
      full_name: selected.full_name,
      // Ca đêm: lưu work_date = ngày bắt đầu ca (ngày trước), ca ngày: lưu work_date = ngày gửi dữ liệu
      work_date: isOvernightShift ? workDateStart : selected.work_date,
      shift_name: shift?.name ?? selected.shift,
      check_in_time: inTime,
      check_out_time: outTime,
      total_hours: hrs?.total ?? 0,
      normal_hours: hrs?.normal ?? 0,
      overtime_hours: hrs?.overtime ?? 0,
      base_wage: wages?.base ?? 0,
      overtime_pay: wages?.overtime ?? 0,
      bonus: wages?.bonus ?? 0,
      attendance_bonus: wages?.attendance ?? 0,
      total_wage: wages?.total ?? 0,
      bank_account: bankAccount,
      bank_name: bankName,
      check_in_image: selected.checkIn?.image_url ?? "",
      check_out_image: selected.checkOut?.image_url ?? "",
      check_in_video: selected.checkIn?.video_url ?? "",
      check_out_video: selected.checkOut?.video_url ?? "",
      start_date: startDate,
      day_type: dayType,
      notes: notes,
      work_date_end: isOvernightShift ? workDateEnd : "",
    };

    // Lưu qua backend API (service role key — bypass RLS)
    const recWithType = { ...baseRec, employee_type: employeeType };
    let apiError: string | null = null;
    try {
      await adminApi.upsertReconciliation(recWithType as unknown as Record<string, unknown>);
    } catch (err) {
      apiError = err instanceof Error ? err.message : String(err);
    }

    if (apiError) {
      if (apiError.includes("relation") && apiError.includes("does not exist")) {
        setDbError(true);
        setSaveErrMsg("Bảng 'reconciliations' chưa tồn tại. Chạy SQL bên trên trong Supabase.");
      } else if (apiError.toLowerCase().includes("rls") || apiError.toLowerCase().includes("policy") || apiError.toLowerCase().includes("permission")) {
        setSaveErrMsg("Bị chặn bởi RLS trên backend.");
        setDbError(true);
      } else {
        setSaveErrMsg("Lỗi lưu: " + apiError);
      }
    } else {
      // savedIds lưu "employee_id_attendance_date"
      const savedKey = `${selected.employee_id}_${selected.work_date}`;
      setSavedIds(prev => [...prev.filter(id => id !== savedKey), savedKey]);
      const gKey = `${selected.employee_id}_${selected.work_date}`;
      setDayTypes(prev => ({ ...prev, [gKey]: dayType }));
      if (isOvernightShift && workDateEnd) setWorkDateEnds(prev => ({ ...prev, [gKey]: workDateEnd }));
      if (!saveErrMsg) closePopup();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {dbError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">
            ⚠️ Chưa có bảng <code className="bg-amber-100 px-1 rounded">reconciliations</code>. Chạy SQL sau:
          </p>
          <pre className="bg-white border border-amber-200 rounded-xl p-3 text-xs text-amber-900 overflow-x-auto">{SQL_RECON}</pre>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-border shadow-sm p-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <CalendarCheck size={18} className="text-muted-foreground shrink-0 hidden sm:block" />
        <div className="flex items-end gap-2 flex-wrap w-full sm:w-auto">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Từ ngày</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <span className="text-muted-foreground text-sm pb-2">→</span>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Đến ngày</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground sm:ml-auto">
          <span>{groups.length} bản ghi</span>
          <span>·</span>
          <span className="text-green-600">{savedIds.length} đã đối soát</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        {groups.length === 0 ? (
          <div className="p-16 text-center">
            <Search size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Không có dữ liệu chấm công từ {dateFrom} đến {dateTo}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["Trạng thái", "Loại", "Ngày", "Mã NV", "Họ tên", "Ngày vào làm", "Loại ngày", "Ca làm", "Check-in", "Check-out", "TG gửi", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map(g => {
                  const gKey = `${g.employee_id}_${g.work_date}`;
                  const saved = savedIds.includes(gKey);
                  const complete = !!g.checkIn && !!g.checkOut;
                  return (
                    <tr key={gKey} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        {saved ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            <CheckCircle size={11} />Đã xong
                          </span>
                        ) : complete ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                            Đủ media
                            {(g.checkIn?.video_url || g.checkOut?.video_url) && <Play size={9} />}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                            <AlertCircle size={11} />Thiếu media
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {empTypes[g.employee_id] === "N" && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-black">N</span>
                        )}
                        {empTypes[g.employee_id] === "O" && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-700 text-white text-xs font-black">O</span>
                        )}
                        {!empTypes[g.employee_id] && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs">?</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap font-medium text-muted-foreground">
                        {g.work_date.slice(5).replace("-", "/")}
                        <span className="block text-[10px] text-muted-foreground/60">{getDayOfWeekShort(g.work_date)}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-bold">{g.employee_id}</td>
                      <td className="px-4 py-3 font-medium">{g.full_name}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {startDates[g.employee_id]
                          ? <span className="text-violet-700 font-medium">{startDates[g.employee_id]}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {dayTypes[gKey] === "holiday" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">🔴 Ngày lễ</span>
                        ) : dayTypes[gKey] === "dayoff" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">🟠 Ngày nghỉ</span>
                        ) : saved ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">🟢 Thường</span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        <span>{g.shift.split("(")[0].trim()}</span>
                        {workDateEnds[gKey] && (
                          <span className="block text-indigo-600 font-medium text-[10px]">🌙 {g.work_date.slice(5)} → {workDateEnds[gKey].slice(5)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">{g.checkIn ? <span className="text-green-600 font-medium">{toHHMM(g.checkIn.created_at)}</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3 text-xs">{g.checkOut ? <span className="text-blue-600 font-medium">{toHHMM(g.checkOut.created_at)}</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {(g.checkIn ?? g.checkOut) ? (
                          <span className="flex flex-col">
                            <span>{new Date((g.checkIn ?? g.checkOut)!.created_at).toLocaleDateString("vi-VN")}</span>
                            <span className="font-medium text-foreground">{new Date((g.checkIn ?? g.checkOut)!.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                          </span>
                        ) : <span>—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openPopup(g)}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition font-medium">
                          <Clock size={12} />Đối soát
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
            <div className="bg-gradient-to-r from-primary to-indigo-600 px-5 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-white font-bold">{selected.full_name}</h3>
                <p className="text-white/70 text-xs">
                  {selected.employee_id} · {isOvernightShift && workDateStart && workDateEnd
                    ? `${workDateStart} → ${workDateEnd}`
                    : selected.work_date}
                </p>
              </div>
              <button onClick={closePopup} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center">
                <X size={16} className="text-white" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: "Check-in", img: selected.checkIn?.image_url, vid: selected.checkIn?.video_url, imgBorder: "border-green-200", vidBorder: "border-green-300" },
                  { label: "Check-out", img: selected.checkOut?.image_url, vid: selected.checkOut?.video_url, imgBorder: "border-blue-200", vidBorder: "border-blue-300" },
                ] as { label: string; img?: string | null; vid?: string | null; imgBorder: string; vidBorder: string }[]).map(({ label, img, vid, imgBorder, vidBorder }) => (
                  <div key={label} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                    {img ? (
                      <div className="relative group cursor-pointer" onClick={() => setLightboxImg(img)}>
                        <img src={getOptimizedUrl(img)} alt={label} className={`w-full aspect-video object-cover rounded-xl border-2 ${imgBorder}`} />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-xl transition-all flex items-center justify-center">
                          <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ) : (
                      <div className={`w-full aspect-video rounded-xl border-2 border-dashed ${imgBorder} bg-muted/20 flex items-center justify-center`}>
                        <p className="text-xs text-muted-foreground">Không có ảnh</p>
                      </div>
                    )}
                    {vid ? (
                      <div className="relative group cursor-pointer" onClick={() => setLightboxVideo(vid)}>
                        <video src={getOptimizedUrl(vid)} className={`w-full aspect-video object-cover rounded-xl border-2 ${vidBorder}`} muted playsInline />
                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 rounded-xl transition-all flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                            <Play size={14} className="text-gray-800 ml-0.5" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`w-full aspect-video rounded-xl border-2 border-dashed ${vidBorder} bg-muted/10 flex items-center justify-center`}>
                        <p className="text-xs text-muted-foreground">Không có video</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {([["Giờ check-in thực tế", inTime, setInTime], ["Giờ check-out thực tế", outTime, setOutTime]] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
                  <div key={label}>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
                    <input type="time" value={val} onChange={e => setter(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                ))}
              </div>

              {isOvernightShift && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
                    🌙 Ca xuyên đêm — Ngày làm việc
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Ngày bắt đầu *</label>
                      <input type="date" value={workDateStart} onChange={e => setWorkDateStart(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                      <p className="text-[10px] text-indigo-500 mt-0.5">Mặc định: ngày trước ngày gửi</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Ngày kết thúc *</label>
                      <input type="date" value={workDateEnd} onChange={e => setWorkDateEnd(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                      <p className="text-[10px] text-indigo-500 mt-0.5">Mặc định: ngày nhân viên gửi dữ liệu</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Ca làm việc (tính lương)</label>
                <select value={shiftId} onChange={e => setShiftId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  <option value="">-- Chưa chọn ca --</option>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
                </select>
                {shifts.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Hãy tạo ca trong tab "Quản lý ca làm" trước.</p>
                )}
              </div>

              {/* Phân loại ngày */}
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5 flex items-center justify-between">
                  <span>Phân loại ngày làm việc</span>
                  {selected && (
                    <span className="text-xs font-normal text-muted-foreground font-mono">{workDayOfWeek} · {selected.work_date}</span>
                  )}
                </p>
                <div className="flex gap-2">
                  {([
                    ["normal",  "🟢 Thường", "bg-green-600 text-white border-green-600",  "border-green-200 text-green-700 bg-green-50"],
                    ["dayoff",  "🟠 Nghỉ",   "bg-orange-500 text-white border-orange-500","border-orange-200 text-orange-600 bg-orange-50"],
                    ["holiday", "🔴 Lễ",     "bg-red-500 text-white border-red-500",      "border-red-200 text-red-600 bg-red-50"],
                  ] as [string, string, string, string][]).map(([val, label, active, base]) => (
                    <button key={val} type="button"
                      onClick={() => setDayType(val as "normal" | "dayoff" | "holiday")}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition ${dayType === val ? active : base}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {autoReason && (
                  <p className={`text-xs mt-2 rounded-lg px-3 py-1.5 flex items-center gap-1.5 ${dayType === autoDetectedType ? "bg-blue-50 border border-blue-100 text-blue-700" : "bg-amber-50 border border-amber-100 text-amber-700"}`}>
                    🤖 Tự động phát hiện: <strong>{autoReason}</strong>
                    {dayType !== autoDetectedType && <span className="ml-1 opacity-70">(đã thay đổi thủ công)</span>}
                  </p>
                )}
              </div>

              {/* Mức lương theo ca: 8h / 12h */}
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5 flex items-center justify-between">
                  <span>Mức lương theo ca</span>
                  {hrs && <span className="text-xs font-normal text-muted-foreground">{fH(hrs.total)} thực tế</span>}
                </p>
                <div className="flex gap-2">
                  {([
                    ["8h",  "🕗 Ca 8 tiếng",  "bg-indigo-600 text-white border-indigo-600", "border-indigo-200 text-indigo-700 bg-indigo-50"],
                    ["12h", "🕛 Ca 12 tiếng", "bg-purple-600 text-white border-purple-600", "border-purple-200 text-purple-700 bg-purple-50"],
                  ] as [string, string, string, string][]).map(([val, label, active, base]) => (
                    <button key={val} type="button"
                      onClick={() => setShiftDurationOverride(prev => prev === val ? null : val as "8h" | "12h")}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition ${shiftDuration === val ? active : base}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {!shiftDurationOverride && hrs && (
                  <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1">
                    🤖 Tự động chọn dựa theo {fH(hrs.total)} thực tế làm việc
                  </p>
                )}
                {shiftDurationOverride && (
                  <p className="text-xs text-amber-700 mt-1.5 flex items-center gap-1">
                    ✏️ Đã chọn thủ công ca {shiftDurationOverride} —
                    <button type="button" className="underline ml-1" onClick={() => setShiftDurationOverride(null)}>đặt lại tự động</button>
                  </p>
                )}
              </div>

              {hrs && (
                <div className={`bg-gradient-to-br ${wageTheme.grad} rounded-2xl p-4 border`}>
                  <p className={`text-xs font-semibold ${wageTheme.title} mb-3`}>
                    📊 {wageTheme.label} · Ca {shiftDuration}
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 text-center mb-4">
                    {[
                      { label: "Tổng giờ", val: fH(hrs.total), color: "text-foreground" },
                      { label: "Giờ thường", val: fH(hrs.normal), color: "text-green-600" },
                      { label: "Tăng ca", val: fH(hrs.overtime), color: "text-orange-600" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="bg-white rounded-xl p-2 border border-border">
                        <p className={`text-base font-bold ${color}`}>{val}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                  {wages ? (
                    <div className="space-y-1.5 text-sm">
                      {([
                        ["Lương cơ bản", wages.base, wageTheme.base],
                        ["Lương tăng ca", wages.overtime, wageTheme.ot],
                        ["Thưởng", wages.bonus, "text-blue-600"],
                        ["Chuyên cần", wages.attendance, "text-violet-600"],
                      ] as [string, number, string][]).map(([label, val, cls]) => (
                        <div key={label} className="flex justify-between">
                          <span className="text-muted-foreground">{label}</span>
                          <span className={`font-medium ${cls}`}>{fM(val)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 border-t border-border/60 mt-2">
                        <span className="font-bold text-foreground">TỔNG LƯƠNG</span>
                        <span className="font-black text-primary text-base">{fM(wages.total)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center">Chọn ca để tính lương</p>
                  )}
                </div>
              )}

              {/* Ngày vào làm */}
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">📅 Ngày vào làm (ngày đầu tiên làm tại công ty)</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {startDate && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle size={11} />Đã nhớ — tự động điền lần sau
                  </p>
                )}
              </div>

              {/* Loại nhân viên */}
              <div>
                <p className="text-xs font-semibold text-foreground mb-2">Loại nhân viên</p>
                <div className="flex gap-2">
                  {([["N", "Nhân viên mới", "border-orange-300 text-orange-600 bg-orange-50", "bg-orange-500 text-white border-orange-500"],
                    ["O", "Nhân viên cũ", "border-blue-300 text-blue-700 bg-blue-50", "bg-blue-700 text-white border-blue-700"]] as [string, string, string, string][]).map(([val, label, base, active]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setEmployeeType(prev => prev === val ? "" : val as "N" | "O")}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition ${employeeType === val ? active : base}`}
                    >
                      <span className="text-lg leading-none">{val}</span>
                      <span className="text-xs font-medium block mt-0.5 opacity-80">{label}</span>
                    </button>
                  ))}
                </div>
                {employeeType && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle size={11} />Đã nhớ loại NV — tự động điền lần sau
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
                  <Banknote size={13} />Thông tin ngân hàng
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Số tài khoản</label>
                    <input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="VD: 0123456789"
                      className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Tên ngân hàng</label>
                    <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="VD: Vietcombank"
                      className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                </div>
                {(bankAccount || bankName) && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle size={11} />Đã tự điền từ lần trước</p>
                )}
              </div>

              {/* Ghi chú */}
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">📝 Ghi chú</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Nhập ghi chú về ca này, lý do đặc biệt... (tuỳ chọn)"
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>
            </div>

            {saveErrMsg && (
              <div className="mx-5 mb-1 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-medium">
                ❌ {saveErrMsg}
              </div>
            )}
            <div className="flex gap-3 px-5 py-4 border-t border-border flex-shrink-0">
              <button onClick={closePopup} className="flex-1 py-3 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition">Hủy</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 transition">
                <Save size={15} />{saving ? "Đang lưu..." : "Xác nhận OK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxImg && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setLightboxImg(null)}
        >
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition"
          >
            <X size={20} className="text-white" />
          </button>
          <img
            src={getOptimizedUrl(lightboxImg)}
            alt="Phóng to"
            className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {lightboxVideo && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm"
          onClick={() => setLightboxVideo(null)}
        >
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10" onClick={e => e.stopPropagation()}>
            <span className="text-white text-sm font-medium">Video chấm công</span>
            <div className="flex items-center gap-2">
              <a href={lightboxVideo} download target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition"
                onClick={e => e.stopPropagation()}>
                <Save size={13} />Tải xuống
              </a>
              <button onClick={() => setLightboxVideo(null)} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition">
                <X size={16} className="text-white" />
              </button>
            </div>
          </div>
          <video
            src={getOptimizedUrl(lightboxVideo)}
            controls
            autoPlay
            className="max-w-full max-h-[85vh] rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <p className="absolute bottom-4 text-white/50 text-xs">Nhấn bên ngoài để đóng • ESC để đóng</p>
        </div>
      )}
    </div>
  );
}
