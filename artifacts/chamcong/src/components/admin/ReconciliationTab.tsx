import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { AttendanceRecord, Shift, Reconciliation } from "@/lib/supabase";
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
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS employee_type CHAR(1) DEFAULT '';
ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Bước 3: Tắt RLS (bắt buộc để lưu dữ liệu đối soát)
ALTER TABLE reconciliations DISABLE ROW LEVEL SECURITY;`;

const EMP_TYPE_KEY = (id: string) => `jtec_emp_type_${id}`;

export function ReconciliationTab({ allRecords }: { allRecords: AttendanceRecord[] }) {
  const [date, setDate] = useState(todayLocal());
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
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [lightboxVideo, setLightboxVideo] = useState<string | null>(null);

  const loadShifts = useCallback(async () => {
    const { data } = await supabase.from("shifts").select("*").order("created_at");
    setShifts((data || []) as Shift[]);
  }, []);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  useEffect(() => {
    const recs = allRecords.filter(r => r.work_date === date);
    const map = new Map<string, Group>();
    for (const r of recs) {
      if (!map.has(r.employee_id)) {
        map.set(r.employee_id, { employee_id: r.employee_id, full_name: r.full_name, work_date: r.work_date, shift: r.shift, checkIn: null, checkOut: null });
      }
      const g = map.get(r.employee_id)!;
      if (r.action_type === "check-in") g.checkIn = r;
      else g.checkOut = r;
    }
    setGroups(Array.from(map.values()));
    // Load trạng thái đã đối soát + employee_type từ DB
    supabase
      .from("reconciliations")
      .select("employee_id, employee_type")
      .eq("work_date", date)
      .then(({ data }) => {
        setSavedIds((data || []).map((r: { employee_id: string }) => r.employee_id));
        const typeMap: Record<string, string> = {};
        for (const r of (data || []) as { employee_id: string; employee_type?: string }[]) {
          const t = r.employee_type || localStorage.getItem(EMP_TYPE_KEY(r.employee_id)) || "";
          if (t) typeMap[r.employee_id] = t;
        }
        setEmpTypes(typeMap);
      });
  }, [date, allRecords]);

  const openPopup = async (g: Group) => {
    setSelected(g);
    // Đặt giá trị mặc định từ attendance trước
    setInTime(g.checkIn ? toHHMM(g.checkIn.created_at) : "");
    setOutTime(g.checkOut ? toHHMM(g.checkOut.created_at) : "");
    const matched = shifts.find(s =>
      g.shift.toLowerCase().includes(s.name.toLowerCase()) ||
      s.name.toLowerCase().includes(g.shift.split(" ")[0].toLowerCase())
    );
    setShiftId(matched?.id ?? shifts[0]?.id ?? "");
    setBankAccount("");
    setBankName("");
    setNotes("");
    // Load loại NV từ localStorage trước (nhanh)
    const storedType = localStorage.getItem(EMP_TYPE_KEY(g.employee_id));
    setEmployeeType((storedType as "N" | "O") || "");
    // Nếu đã đối soát trước đó, load lại toàn bộ dữ liệu đã xác nhận
    const { data } = await supabase.from("reconciliations")
      .select("check_in_time, check_out_time, shift_name, bank_account, bank_name, employee_type, notes")
      .eq("employee_id", g.employee_id)
      .eq("work_date", g.work_date)
      .limit(1);
    if (data?.[0]) {
      const saved = data[0] as {
        check_in_time: string; check_out_time: string;
        shift_name: string; bank_account: string; bank_name: string;
        employee_type?: string; notes?: string;
      };
      if (saved.check_in_time) setInTime(saved.check_in_time);
      if (saved.check_out_time) setOutTime(saved.check_out_time);
      if (saved.bank_account) setBankAccount(saved.bank_account);
      if (saved.bank_name) setBankName(saved.bank_name);
      setNotes(saved.notes || "");
      // employee_type từ DB ưu tiên hơn localStorage
      if (saved.employee_type) setEmployeeType(saved.employee_type as "N" | "O");
      // Khớp lại shift từ tên đã lưu
      if (saved.shift_name) {
        const prevShift = shifts.find(s =>
          saved.shift_name.toLowerCase().includes(s.name.toLowerCase()) ||
          s.name.toLowerCase().includes(saved.shift_name.split(" ")[0].toLowerCase())
        );
        if (prevShift) setShiftId(prevShift.id);
      }
    }
  };

  const closePopup = () => { setSelected(null); setNotes(""); };

  const shift = shifts.find(s => s.id === shiftId) ?? null;
  const hrs = calcHours(inTime, outTime);
  const wages = hrs && shift ? {
    base: shift.base_wage,
    overtime: hrs.overtime * shift.overtime_wage,
    bonus: shift.bonus,
    attendance: shift.attendance_bonus,
    total: shift.base_wage + hrs.overtime * shift.overtime_wage + shift.bonus + shift.attendance_bonus,
  } : null;

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveErrMsg(null);

    // Lưu loại NV vào localStorage ngay lập tức (không cần DB)
    if (employeeType) {
      localStorage.setItem(EMP_TYPE_KEY(selected.employee_id), employeeType);
      setEmpTypes(prev => ({ ...prev, [selected.employee_id]: employeeType }));
    }

    const baseRec: Omit<Reconciliation, "id" | "created_at" | "employee_type"> = {
      employee_id: selected.employee_id,
      full_name: selected.full_name,
      work_date: selected.work_date,
      shift_name: selected.shift,
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
      notes: notes,
    };

    // Thử lưu với employee_type trước
    const recWithType = { ...baseRec, employee_type: employeeType };
    let { error } = await supabase.from("reconciliations").upsert(recWithType, { onConflict: "employee_id,work_date" });

    // Nếu cột chưa tồn tại trong DB → thử lại không có employee_type
    if (error?.message?.includes("employee_type")) {
      ({ error } = await supabase.from("reconciliations").upsert(baseRec, { onConflict: "employee_id,work_date" }));
      if (!error) setSaveErrMsg("⚠️ Đã lưu thành công (trừ loại NV). Chạy SQL migration để lưu cột employee_type vào DB.");
    }

    if (error) {
      if (error.message.includes("does not exist")) {
        setDbError(true);
        setSaveErrMsg("Bảng 'reconciliations' chưa tồn tại. Chạy SQL bên trên trong Supabase.");
      } else if (error.code === "42501" || error.message.toLowerCase().includes("rls") || error.message.toLowerCase().includes("policy") || error.message.toLowerCase().includes("permission") || error.message.toLowerCase().includes("row-level")) {
        setSaveErrMsg("Bị chặn bởi RLS. Chạy: ALTER TABLE reconciliations DISABLE ROW LEVEL SECURITY;");
        setDbError(true);
      } else {
        setSaveErrMsg("Lỗi lưu: " + error.message);
      }
    } else {
      setSavedIds(prev => [...prev.filter(id => id !== selected.employee_id), selected.employee_id]);
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

      <div className="bg-white rounded-2xl border border-border shadow-sm p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <CalendarCheck size={18} className="text-muted-foreground" />
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Ngày đối soát</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
          <span>{groups.length} nhân viên</span>
          <span>·</span>
          <span className="text-green-600">{savedIds.length} đã đối soát</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        {groups.length === 0 ? (
          <div className="p-16 text-center">
            <Search size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Không có dữ liệu chấm công ngày {date}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["Trạng thái", "Loại", "Mã NV", "Họ tên", "Ca làm", "Check-in", "Check-out", "TG gửi", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map(g => {
                  const saved = savedIds.includes(g.employee_id);
                  const complete = !!g.checkIn && !!g.checkOut;
                  return (
                    <tr key={g.employee_id} className="hover:bg-muted/20 transition-colors">
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
                      <td className="px-4 py-3 font-mono text-xs font-bold">{g.employee_id}</td>
                      <td className="px-4 py-3 font-medium">{g.full_name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{g.shift.split("(")[0].trim()}</td>
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
                <p className="text-white/70 text-xs">{selected.employee_id} · {selected.work_date}</p>
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
                        <img src={img} alt={label} className={`w-full aspect-video object-cover rounded-xl border-2 ${imgBorder}`} />
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
                        <video src={vid} className={`w-full aspect-video object-cover rounded-xl border-2 ${vidBorder}`} muted playsInline />
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

              {hrs && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100">
                  <p className="text-xs font-semibold text-foreground mb-3">📊 Kết quả tính toán</p>
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
                        ["Lương cơ bản", wages.base, "text-green-700"],
                        ["Lương tăng ca", wages.overtime, "text-orange-600"],
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
            src={lightboxImg}
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
            src={lightboxVideo}
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
