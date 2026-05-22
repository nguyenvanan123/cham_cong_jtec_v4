import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Shift } from "@/lib/supabase";
import { Plus, Pencil, Trash2, Save, X, RefreshCw, Layers } from "lucide-react";

type ShiftForm = Omit<Shift, "id" | "created_at">;

const EMPTY: ShiftForm = {
  name: "",
  start_time: "06:00",
  end_time: "14:00",
  base_wage: 0,
  overtime_wage: 0,
  bonus: 0,
  attendance_bonus: 0,
  base_wage_dayoff: 0,
  overtime_wage_dayoff: 0,
  base_wage_holiday: 0,
  overtime_wage_holiday: 0,
  base_wage_12h: 0,
  base_wage_dayoff_12h: 0,
  base_wage_holiday_12h: 0,
};

const SQL = `-- Bước 1: Tạo bảng (nếu chưa có)
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

-- Bước 2: Thêm cột lương nếu bảng đã tồn tại nhưng thiếu cột
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS base_wage NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS overtime_wage NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS bonus NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS attendance_bonus NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS base_wage_dayoff NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS overtime_wage_dayoff NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS base_wage_holiday NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS overtime_wage_holiday NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS base_wage_12h NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS base_wage_dayoff_12h NUMERIC DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS base_wage_holiday_12h NUMERIC DEFAULT 0;

-- Bước 3: Tắt RLS (bắt buộc để thêm/sửa/xóa được)
ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;`;

export function ShiftsTab() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ShiftForm>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("shifts").select("*").order("created_at");
    if (error) setDbError(true);
    else { setDbError(false); setShifts((data || []) as Shift[]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditId(null); setForm({ ...EMPTY }); setSaveError(null); setModal(true); };
  const openEdit = (s: Shift) => {
    setEditId(s.id);
    setForm({ name: s.name, start_time: s.start_time, end_time: s.end_time, base_wage: s.base_wage, overtime_wage: s.overtime_wage, bonus: s.bonus, attendance_bonus: s.attendance_bonus, base_wage_dayoff: s.base_wage_dayoff ?? 0, overtime_wage_dayoff: s.overtime_wage_dayoff ?? 0, base_wage_holiday: s.base_wage_holiday ?? 0, overtime_wage_holiday: s.overtime_wage_holiday ?? 0, base_wage_12h: s.base_wage_12h ?? 0, base_wage_dayoff_12h: s.base_wage_dayoff_12h ?? 0, base_wage_holiday_12h: s.base_wage_holiday_12h ?? 0 });
    setSaveError(null);
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setSaveError(null);
    const { error } = editId
      ? await supabase.from("shifts").update(form).eq("id", editId)
      : await supabase.from("shifts").insert(form);
    setSaving(false);
    if (error) {
      if (error.message.includes("does not exist")) {
        setSaveError("Bảng 'shifts' chưa tồn tại. Hãy chạy SQL bên dưới trong Supabase trước.");
        setDbError(true);
      } else if (error.code === "42501" || error.message.toLowerCase().includes("rls") || error.message.toLowerCase().includes("policy") || error.message.toLowerCase().includes("permission")) {
        setSaveError("Bị chặn bởi RLS. Chạy: ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;");
        setDbError(true);
      } else {
        setSaveError(error.message);
      }
      return;
    }
    setModal(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa ca này?")) return;
    setDeleting(id);
    const { error } = await supabase.from("shifts").delete().eq("id", id);
    setDeleting(null);
    if (!error) load();
  };

  const f = (n: number) => n.toLocaleString("vi-VN");
  const setField = <K extends keyof ShiftForm>(k: K, v: ShiftForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const numField = (k: keyof ShiftForm, label: string) => (
    <div key={k}>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <input
        type="number" min={0}
        value={form[k] as number}
        onChange={e => setField(k, Number(e.target.value) as ShiftForm[typeof k])}
        className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {dbError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">
            ⚠️ Chưa có bảng <code className="bg-amber-100 px-1 rounded">shifts</code>. Chạy SQL này trong Supabase SQL Editor:
          </p>
          <pre className="bg-white border border-amber-200 rounded-xl p-3 text-xs text-amber-900 overflow-x-auto">{SQL}</pre>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{shifts.length} ca làm việc</p>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition"
        >
          <Plus size={15} />Thêm ca
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
            <RefreshCw size={16} className="animate-spin" />Đang tải...
          </div>
        ) : shifts.length === 0 ? (
          <div className="p-16 text-center">
            <Layers size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Chưa có ca nào. Bấm "Thêm ca" để tạo mới.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["Tên ca", "Giờ", "🟢 Ngày thường", "🟠 Ngày nghỉ", "🔴 Ngày lễ", "Thưởng", "Chuyên cần", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shifts.map(s => (
                  <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">{s.name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{s.start_time} – {s.end_time}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-green-700">8h: {f(s.base_wage)}đ</div>
                      <div className="text-xs font-medium text-green-600">12h: {f(s.base_wage_12h ?? 0)}đ</div>
                      <div className="text-xs text-green-600/50">+{f(s.overtime_wage)}đ/h TC</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-orange-700">8h: {f(s.base_wage_dayoff ?? 0)}đ</div>
                      <div className="text-xs font-medium text-orange-600">12h: {f(s.base_wage_dayoff_12h ?? 0)}đ</div>
                      <div className="text-xs text-orange-600/50">+{f(s.overtime_wage_dayoff ?? 0)}đ/h TC</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-red-700">8h: {f(s.base_wage_holiday ?? 0)}đ</div>
                      <div className="text-xs font-medium text-red-600">12h: {f(s.base_wage_holiday_12h ?? 0)}đ</div>
                      <div className="text-xs text-red-600/50">+{f(s.overtime_wage_holiday ?? 0)}đ/h TC</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-blue-700 font-medium">{f(s.bonus)}đ</td>
                    <td className="px-4 py-3 text-xs text-violet-700 font-medium">{f(s.attendance_bonus)}đ</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition disabled:opacity-50">
                          {deleting === s.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-bold text-foreground">{editId ? "Sửa ca làm việc" : "Thêm ca mới"}</h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg hover:bg-muted transition"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tên ca *</label>
                <input
                  value={form.name}
                  onChange={e => setField("name", e.target.value)}
                  placeholder="VD: Ca sáng"
                  className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(["start_time", "end_time"] as const).map(k => (
                  <div key={k}>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      {k === "start_time" ? "Giờ bắt đầu" : "Giờ kết thúc"}
                    </label>
                    <input
                      type="time"
                      value={form[k]}
                      onChange={e => setField(k, e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                ))}
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-3">
                <p className="text-xs font-bold text-green-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />🟢 Ngày thường
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {numField("base_wage", "🕗 Ca 8 tiếng (đ)")}
                  {numField("base_wage_12h", "🕛 Ca 12 tiếng (đ)")}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {numField("overtime_wage", "Tăng ca/giờ (đ)")}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {numField("bonus", "Thưởng (đ)")}
                  {numField("attendance_bonus", "Chuyên cần (đ)")}
                </div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-3">
                <p className="text-xs font-bold text-orange-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />🟠 Ngày nghỉ (cuối tuần)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {numField("base_wage_dayoff", "🕗 Ca 8 tiếng (đ)")}
                  {numField("base_wage_dayoff_12h", "🕛 Ca 12 tiếng (đ)")}
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {numField("overtime_wage_dayoff", "Tăng ca/giờ (đ)")}
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-3">
                <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />🔴 Ngày lễ
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {numField("base_wage_holiday", "🕗 Ca 8 tiếng (đ)")}
                  {numField("base_wage_holiday_12h", "🕛 Ca 12 tiếng (đ)")}
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {numField("overtime_wage_holiday", "Tăng ca/giờ (đ)")}
                </div>
              </div>
            </div>
            {saveError && (
              <div className="mx-5 mb-1 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-medium">
                ❌ {saveError}
              </div>
            )}
            <div className="flex gap-3 px-5 py-4 border-t border-border">
              <button onClick={() => setModal(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition">Hủy</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
              >
                <Save size={14} />{saving ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
