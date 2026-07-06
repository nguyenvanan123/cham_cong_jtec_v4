import { useState, useEffect, useCallback } from "react";
import { getOptimizedUrl } from "@/utils/cloudinaryUtils";
import { supabase } from "@/lib/supabase";
import type { AttendanceRecord, JobApplication, Shift } from "@/lib/supabase";
import { Link } from "wouter";
import {
  Camera, Search, X, ChevronLeft, ChevronRight, ChevronDown,
  Lock, Eye, EyeOff, LogOut, ShieldCheck,
  LayoutDashboard, ClipboardList, Settings,
  Download, Trash2, CheckCircle, XCircle,
  AlertCircle, Menu, Save, RefreshCw,
  TrendingUp, Clock, CheckCheck,
  UserPlus, Megaphone, ToggleLeft, ToggleRight,
  ExternalLink, Image as ImageIcon,
  Layers, CalendarCheck, FileSpreadsheet, Timer, MessageCircle,
  Video, Play
} from "lucide-react";
import { ShiftsTab } from "@/components/admin/ShiftsTab";
import { ReconciliationTab } from "@/components/admin/ReconciliationTab";
import { ExportTab } from "@/components/admin/ExportTab";
import { CleanupTab } from "@/components/admin/CleanupTab";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import type { LightboxImage } from "@/components/ui/ImageLightbox";

// ──────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────
type FilterStatus = "all" | "complete" | "incomplete";
type Tab = "overview" | "records" | "applications" | "settings" | "shifts" | "reconciliation" | "export" | "cleanup";

type GroupedEmployee = {
  employee_id: string;
  full_name: string;
  work_date: string;
  work_date_end?: string | null;
  shift: string;
  records: AttendanceRecord[];
  latestAt?: string;
};

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────
function groupByEmployee(records: AttendanceRecord[]): GroupedEmployee[] {
  const map = new Map<string, GroupedEmployee>();
  // records đã được Supabase sort created_at DESC nên record đầu tiên của mỗi group = mới nhất
  for (const r of records) {
    const key = `${r.employee_id}__${r.work_date}`;
    if (!map.has(key)) {
      map.set(key, { employee_id: r.employee_id, full_name: r.full_name, work_date: r.work_date, work_date_end: r.work_date_end, shift: r.shift, records: [], latestAt: r.created_at });
    }
    const g = map.get(key)!;
    if (r.work_date_end) g.work_date_end = r.work_date_end;
    // Cập nhật thời gian mới nhất của group
    if (r.created_at > (g.latestAt ?? "")) g.latestAt = r.created_at;
    g.records.push(r);
  }
  return Array.from(map.values()).sort((a, b) =>
    // Ưu tiên 1: ngày làm mới nhất trước
    b.work_date.localeCompare(a.work_date) ||
    // Ưu tiên 2: cùng ngày thì ai gửi gần nhất lên trước
    (b.latestAt ?? "").localeCompare(a.latestAt ?? "")
  );
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function exportCSV(grouped: GroupedEmployee[]) {
  const rows = [
    ["Mã NV", "Tên", "Ngày", "Ca", "Check-in", "Check-out", "Thời gian gửi", "Trạng thái"],
    ...grouped.map(g => {
      const inRec = g.records.find(r => r.action_type === "check-in");
      const outRec = g.records.find(r => r.action_type === "check-out");
      const firstRec = inRec ?? outRec;
      const status = inRec && outRec ? "Đủ" : inRec ? "Thiếu out" : outRec ? "Thiếu in" : "Thiếu";
      return [
        g.employee_id,
        g.full_name,
        g.work_date,
        g.shift,
        inRec ? new Date(inRec.created_at).toLocaleTimeString("vi-VN") : "-",
        outRec ? new Date(outRec.created_at).toLocaleTimeString("vi-VN") : "-",
        firstRec ? new Date(firstRec.created_at).toLocaleString("vi-VN") : "-",
        status,
      ];
    }),
  ];
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chamcong_${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ──────────────────────────────────────────────────────
// Stat Card
// ──────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-border shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Mini Bar Chart (thay thế recharts để tránh cài thêm)
// ──────────────────────────────────────────────────────
function MiniBarChart({ data }: { data: { date: string; complete: number; incomplete: number }[] }) {
  const max = Math.max(...data.map(d => d.complete + d.incomplete), 1);
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map((d, i) => {
        const total = d.complete + d.incomplete;
        const completeH = Math.round((d.complete / max) * 100);
        const incompleteH = Math.round((d.incomplete / max) * 100);
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none z-10">
              {d.date}: {total} lượt
            </div>
            <div className="w-full flex flex-col-reverse gap-px">
              <div className="w-full bg-green-400 rounded-t transition-all" style={{ height: `${completeH}%`, minHeight: d.complete > 0 ? 4 : 0 }} />
              <div className="w-full bg-red-300 rounded-t transition-all" style={{ height: `${incompleteH}%`, minHeight: d.incomplete > 0 ? 4 : 0 }} />
            </div>
            <span className="text-[10px] text-muted-foreground mt-1 hidden sm:block truncate w-full text-center">
              {d.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Tab: Overview
// ──────────────────────────────────────────────────────
function OverviewTab({ allRecords }: { allRecords: AttendanceRecord[] }) {
  const grouped = groupByEmployee(allRecords);
  const today = todayStr();
  const todayGrouped = grouped.filter(g => g.work_date === today);
  const todayComplete = todayGrouped.filter(g => g.records.some(r => r.action_type === "check-in") && g.records.some(r => r.action_type === "check-out"));
  const todayMissing = todayGrouped.length - todayComplete.length;

  // 7 ngày gần nhất
  const last7: { date: string; complete: number; incomplete: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayGroup = grouped.filter(g => g.work_date === dateStr);
    const complete = dayGroup.filter(g => g.records.some(r => r.action_type === "check-in") && g.records.some(r => r.action_type === "check-out")).length;
    last7.push({ date: dateStr, complete, incomplete: dayGroup.length - complete });
  }

  // Thống kê theo ca
  const shiftMap = new Map<string, number>();
  for (const g of grouped) {
    shiftMap.set(g.shift, (shiftMap.get(g.shift) || 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Tổng lượt chấm" value={grouped.length} icon={<ClipboardList size={22} className="text-blue-600" />} color="bg-blue-50" />
        <StatCard label="Hôm nay" value={todayGrouped.length} icon={<Clock size={22} className="text-indigo-600" />} color="bg-indigo-50" />
        <StatCard label="Đủ hôm nay" value={todayComplete.length} icon={<CheckCheck size={22} className="text-green-600" />} color="bg-green-50" />
        <StatCard label="Thiếu hôm nay" value={todayMissing} icon={<AlertCircle size={22} className="text-red-500" />} color="bg-red-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Biểu đồ 7 ngày */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-border shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground text-sm">Chấm công 7 ngày gần nhất</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" />Đủ</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-300 inline-block" />Thiếu</span>
            </div>
          </div>
          <MiniBarChart data={last7} />
        </div>

        {/* Thống kê ca */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
          <h3 className="font-semibold text-foreground text-sm mb-4">Theo ca làm việc</h3>
          <div className="space-y-3">
            {Array.from(shiftMap.entries()).map(([shift, count]) => {
              const pct = Math.round((count / grouped.length) * 100) || 0;
              const shortShift = shift.split(" ")[0] + " " + shift.split(" ")[1];
              return (
                <div key={shift}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground truncate max-w-[140px]">{shortShift}</span>
                    <span className="font-semibold text-foreground">{count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {shiftMap.size === 0 && <p className="text-xs text-muted-foreground text-center py-4">Chưa có dữ liệu</p>}
          </div>
        </div>
      </div>

      {/* Danh sách thiếu hôm nay */}
      {todayMissing > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-5">
          <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500" />
            Nhân viên thiếu chấm công hôm nay ({todayMissing})
          </h3>
          <div className="space-y-2">
            {todayGrouped
              .filter(g => !(g.records.some(r => r.action_type === "check-in") && g.records.some(r => r.action_type === "check-out")))
              .map((g, i) => {
                const hasIn = g.records.some(r => r.action_type === "check-in");
                const hasOut = g.records.some(r => r.action_type === "check-out");
                return (
                  <div key={i} className="flex items-center justify-between bg-red-50/50 rounded-xl px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{g.full_name}</p>
                      <p className="text-xs text-muted-foreground">{g.employee_id} · {g.shift}</p>
                    </div>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      {hasIn ? "Thiếu out" : hasOut ? "Thiếu in" : "Chưa chấm"}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Tab: Records
// ──────────────────────────────────────────────────────
function RecordsTab({ allRecords, onRefresh }: { allRecords: AttendanceRecord[]; onRefresh: () => void }) {
  const [filterEmployeeId, setFilterEmployeeId] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterShift, setFilterShift] = useState("");
  const [dbShifts, setDbShifts] = useState<Shift[]>([]);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [modalVideo, setModalVideo] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 12;

  useEffect(() => {
    supabase.from("shifts").select("*").order("created_at").then(({ data }) => {
      setDbShifts((data || []) as Shift[]);
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalVideo(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const grouped = groupByEmployee(allRecords);

  const shiftOptions = dbShifts.map(s => ({ value: s.name, label: `${s.name} (${s.start_time} - ${s.end_time})` }));

  const filtered = grouped.filter(g => {
    const hasIn = g.records.some(r => r.action_type === "check-in");
    const hasOut = g.records.some(r => r.action_type === "check-out");
    if (filterStatus === "complete" && !(hasIn && hasOut)) return false;
    if (filterStatus === "incomplete" && hasIn && hasOut) return false;
    if (filterEmployeeId && !g.employee_id.toLowerCase().includes(filterEmployeeId.toLowerCase())) return false;
    if (filterName && !g.full_name.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterDateFrom && g.work_date < filterDateFrom) return false;
    if (filterDateTo && g.work_date > filterDateTo) return false;
    if (filterShift && !g.shift.toLowerCase().includes(filterShift.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleDelete = async (g: GroupedEmployee) => {
    const key = `${g.employee_id}__${g.work_date}`;
    if (!confirm(`Xóa toàn bộ dữ liệu chấm công của ${g.full_name} ngày ${g.work_date}?`)) return;
    setDeletingKey(key);
    setDeleteError(null);
    const ids = g.records.map(r => r.id);
    const { error } = await supabase.from("attendance").delete().in("id", ids);
    if (error) {
      setDeleteError("Không thể xóa — bảng 'attendance' đang bị RLS chặn. Chạy SQL sau trong Supabase: ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;");
    } else {
      onRefresh();
    }
    setDeletingKey(null);
  };

  const clearFilters = () => {
    setFilterEmployeeId(""); setFilterName(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterStatus("all"); setFilterShift(""); setPage(1);
  };

  return (
    <div className="space-y-4">
      {deleteError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-red-700 mb-2">❌ {deleteError}</p>
          <pre className="bg-white border border-red-200 rounded-xl p-3 text-xs text-red-900 overflow-x-auto">ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;</pre>
        </div>
      )}
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-foreground">Bộ lọc</h3>
          <div className="flex gap-2">
            <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition">
              <X size={12} />Xóa lọc
            </button>
            <button
              onClick={() => exportCSV(filtered)}
              className="flex items-center gap-1.5 text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-600 transition font-medium"
            >
              <Download size={12} />
              Xuất CSV ({filtered.length})
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <input type="text" placeholder="Mã NV..." value={filterEmployeeId} onChange={e => { setFilterEmployeeId(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
          <input type="text" placeholder="Tên NV..." value={filterName} onChange={e => { setFilterName(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
          <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
          <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
          <select value={filterShift} onChange={e => { setFilterShift(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition">
            <option value="">Tất cả ca</option>
            {shiftOptions.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as FilterStatus); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition">
            <option value="all">Tất cả trạng thái</option>
            <option value="complete">Hoàn thành</option>
            <option value="incomplete">Thiếu</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            {filtered.length} kết quả
          </p>
        </div>
        {filtered.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground text-sm">Không có dữ liệu</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] sm:min-w-[500px] md:min-w-[700px] text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide w-24">Trạng thái</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Mã NV</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Họ tên</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">Ngày</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Ca</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">TG gửi</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Media</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((g, idx) => {
                    const hasIn = g.records.some(r => r.action_type === "check-in");
                    const hasOut = g.records.some(r => r.action_type === "check-out");
                    const isComplete = hasIn && hasOut;
                    const inRec = g.records.find(r => r.action_type === "check-in");
                    const outRec = g.records.find(r => r.action_type === "check-out");
                    const images = g.records.filter(r => r.image_url).map(r => ({ url: r.image_url!, type: r.action_type }));
                    const videos = g.records.filter(r => r.video_url).map(r => ({ url: r.video_url!, type: r.action_type }));
                    const key = `${g.employee_id}__${g.work_date}`;
                    const isDeleting = deletingKey === key;
                    return (
                      <tr key={idx} data-testid={`row-${g.employee_id}-${g.work_date}`}
                        className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${isComplete ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isComplete ? "bg-green-500" : "bg-red-500"}`} />
                            {isComplete ? "Đủ" : "Thiếu"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-bold text-foreground">{g.employee_id}</td>
                        <td className="px-4 py-3 text-foreground font-medium">{g.full_name}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap hidden sm:table-cell">
                          {g.work_date_end && g.work_date_end !== g.work_date
                            ? <span>{g.work_date} <span className="text-indigo-500">→</span> {g.work_date_end}</span>
                            : g.work_date}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap hidden md:table-cell">{g.shift.split("(")[0].trim()}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell">
                          {(inRec ?? outRec) ? (
                            <span className="flex flex-col">
                              <span>{new Date((inRec ?? outRec)!.created_at).toLocaleDateString("vi-VN")}</span>
                              <span className="font-medium text-foreground">{new Date((inRec ?? outRec)!.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                            </span>
                          ) : <span>—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {images.map((img, i) => (
                              <button key={i} onClick={() => {
                                setLightboxImages(images.map(im => ({ url: im.url, label: `Ảnh ${im.type} — ${g.full_name}` })));
                                setLightboxIndex(i);
                              }}
                                className="relative w-8 h-8 rounded-lg overflow-hidden border border-border hover:ring-2 hover:ring-primary/40 transition group">
                                <img src={getOptimizedUrl(img.url)} alt="ảnh" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                  <Search size={10} className="text-white" />
                                </div>
                              </button>
                            ))}
                            {videos.map((vid, i) => (
                              <button key={`v${i}`} onClick={() => setModalVideo(vid.url)}
                                title={`Video ${vid.type}`}
                                className="w-8 h-8 rounded-lg border border-violet-300 bg-violet-50 hover:ring-2 hover:ring-violet-400/40 transition flex items-center justify-center">
                                <Play size={13} className="text-violet-600" />
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleDelete(g)} disabled={isDeleting}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50">
                            {isDeleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} / {filtered.length}</p>
                <div className="flex gap-2 items-center">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition"><ChevronLeft size={14} /></button>
                  <span className="text-sm font-medium px-2">{page} / {totalPages}</span>
                  <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition"><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Image Lightbox */}
      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
        />
      )}

      {/* Video Modal — full HD */}
      {modalVideo && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center" onClick={() => setModalVideo(null)}>
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10" onClick={e => e.stopPropagation()}>
            <span className="text-white text-sm font-medium">Video chấm công</span>
            <div className="flex items-center gap-2">
              <a
                href={modalVideo}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition"
                onClick={e => e.stopPropagation()}
              >
                <Download size={13} />
                Tải xuống
              </a>
              <button onClick={() => setModalVideo(null)} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition">
                <X size={16} className="text-white" />
              </button>
            </div>
          </div>
          <div className="w-full max-w-4xl px-4 pt-14 pb-10" onClick={e => e.stopPropagation()}>
            <video
              src={getOptimizedUrl(modalVideo)}
              controls
              autoPlay
              className="w-full max-h-[80vh] rounded-2xl shadow-2xl bg-black"
            />
          </div>
          <p className="absolute bottom-4 text-white/50 text-xs">ESC để đóng</p>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Tab: Job Applications
// ──────────────────────────────────────────────────────
function JobApplicationsTab() {
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [modalImages, setModalImages] = useState<{ front: string | null; back: string | null; appName?: string } | null>(null);
  const [modalImageTab, setModalImageTab] = useState<"front" | "back">("front");
  const [modalImageZoom, setModalImageZoom] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const PER_PAGE = 10;

  const fetchApps = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("job_applications").select("*").order("created_at", { ascending: false });
    setApps((data || []) as JobApplication[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const handleViewCCCD = async (app: JobApplication) => {
    setLoadingImages(true);
    setModalImageTab("front");
    setModalImageZoom(false);
    setModalImages({ front: null, back: null, appName: app.full_name });
    const [{ data: frontData }, { data: backData }] = await Promise.all([
      supabase.storage.from("application_docs").createSignedUrl(app.cccd_front_url, 300),
      supabase.storage.from("application_docs").createSignedUrl(app.cccd_back_url, 300),
    ]);
    setModalImages({
      front: frontData?.signedUrl ?? null,
      back: backData?.signedUrl ?? null,
      appName: app.full_name,
    });
    setLoadingImages(false);
  };

  const handleStatusChange = async (id: string, status: string) => {
    await supabase.from("job_applications").update({ status }).eq("id", id);
    setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa đơn ứng tuyển này?")) return;
    await supabase.from("job_applications").delete().eq("id", id);
    setApps(prev => prev.filter(a => a.id !== id));
  };

  const filtered = apps.filter(a => {
    if (filterName && !a.full_name.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (filterDateFrom) {
      const submitted = new Date(a.created_at).toISOString().slice(0, 10);
      if (submitted < filterDateFrom) return false;
    }
    if (filterDateTo) {
      const submitted = new Date(a.created_at).toISOString().slice(0, 10);
      if (submitted > filterDateTo) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const statusColor: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-600",
  };
  const statusLabel: Record<string, string> = {
    pending: "Chờ duyệt",
    approved: "Đã duyệt",
    rejected: "Từ chối",
  };

  return (
    <div className="space-y-4">
      {/* Stats mini */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tổng đơn", value: apps.length, color: "text-primary" },
          { label: "Chờ duyệt", value: apps.filter(a => a.status === "pending").length, color: "text-amber-600" },
          { label: "Đã duyệt", value: apps.filter(a => a.status === "approved").length, color: "text-green-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-border shadow-sm p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-4 space-y-3">
        <div className="flex gap-3 flex-wrap">
          <input type="text" placeholder="Tìm theo tên..." value={filterName}
            onChange={e => { setFilterName(e.target.value); setPage(1); }}
            className="flex-1 min-w-40 px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition">
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
          </select>
          <button onClick={fetchApps} className="px-3 py-2 rounded-xl border border-input text-sm text-muted-foreground hover:bg-muted transition flex items-center gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Làm mới
          </button>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Ngày nộp:</span>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={filterDateFrom}
              onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
            <span className="text-xs text-muted-foreground">đến</span>
            <input type="date" value={filterDateTo}
              onChange={e => { setFilterDateTo(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
            {(filterDateFrom || filterDateTo) && (
              <button onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setPage(1); }}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted transition">
                Xóa lọc
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Chưa có đơn ứng tuyển nào.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trạng thái</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Họ tên</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Người GT</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">STK NH người GT</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ngày nộp</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">CCCD</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map(app => (
                    <tr key={app.id} data-testid={`app-row-${app.id}`} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <select
                          value={app.status}
                          onChange={e => handleStatusChange(app.id, e.target.value)}
                          className={`text-xs font-semibold px-2 py-1 rounded-full border-0 focus:outline-none cursor-pointer ${statusColor[app.status] || "bg-gray-100 text-gray-600"}`}
                        >
                          <option value="pending">Chờ duyệt</option>
                          <option value="approved">Đã duyệt</option>
                          <option value="rejected">Từ chối</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{app.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {app.referrer_name || "—"}
                        {app.referrer_id && <span className="block text-muted-foreground/60">{app.referrer_id}</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{app.referrer_bank_account || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(app.created_at).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          data-testid={`btn-view-cccd-${app.id}`}
                          onClick={() => handleViewCCCD(app)}
                          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 bg-primary/10 px-2.5 py-1 rounded-lg transition"
                        >
                          <ImageIcon size={12} />
                          Xem CCCD
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDelete(app.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} / {filtered.length}</p>
                <div className="flex gap-2 items-center">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition"><ChevronLeft size={14} /></button>
                  <span className="text-sm font-medium px-2">{page} / {totalPages}</span>
                  <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition"><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* CCCD Modal */}
      {modalImages && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => { setModalImages(null); setModalImageZoom(false); }}>
          <div className="relative w-full max-w-2xl bg-white rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-foreground text-base">Ảnh CCCD / CMND</h3>
                {modalImages.appName && <p className="text-xs text-muted-foreground mt-0.5">{modalImages.appName}</p>}
              </div>
              <button onClick={() => { setModalImages(null); setModalImageZoom(false); }} className="p-1.5 rounded-lg hover:bg-muted transition">
                <X size={16} />
              </button>
            </div>

            {loadingImages ? (
              <div className="py-20 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                <RefreshCw size={18} className="animate-spin" />Đang tải ảnh...
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div className="flex border-b border-border">
                  {(["front", "back"] as const).map(side => (
                    <button
                      key={side}
                      onClick={() => { setModalImageTab(side); setModalImageZoom(false); }}
                      className={`flex-1 py-3 text-sm font-semibold transition ${modalImageTab === side ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:bg-muted/50"}`}
                    >
                      {side === "front" ? "Mặt trước" : "Mặt sau"}
                    </button>
                  ))}
                </div>

                {/* Image area */}
                <div className="p-5">
                  {(() => {
                    const src = modalImageTab === "front" ? modalImages.front : modalImages.back;
                    const label = modalImageTab === "front" ? "CCCD mặt trước" : "CCCD mặt sau";
                    return src ? (
                      <div className="space-y-3">
                        <div
                          className="relative rounded-xl overflow-hidden border border-border bg-muted/20 cursor-zoom-in"
                          onClick={() => setModalImageZoom(true)}
                        >
                          <img src={getOptimizedUrl(src)} alt={label} className="w-full object-contain max-h-80" />
                          <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                            <Search size={11} /> Nhấn để phóng to
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <a
                            href={src}
                            download={label}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition"
                            onClick={e => e.stopPropagation()}
                          >
                            <Download size={14} /> Tải xuống
                          </a>
                          <button
                            onClick={() => setModalImageZoom(true)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition"
                          >
                            <ExternalLink size={14} /> Xem toàn màn hình
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="aspect-video bg-muted rounded-xl flex items-center justify-center text-sm text-muted-foreground">
                        Không tải được ảnh
                      </div>
                    );
                  })()}
                </div>

                {/* Prev / Next buttons */}
                <div className="flex border-t border-border">
                  <button
                    disabled={modalImageTab === "front"}
                    onClick={() => { setModalImageTab("front"); setModalImageZoom(false); }}
                    className="flex-1 py-3 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30 transition"
                  >
                    <ChevronLeft size={16} /> Mặt trước
                  </button>
                  <div className="w-px bg-border" />
                  <button
                    disabled={modalImageTab === "back"}
                    onClick={() => { setModalImageTab("back"); setModalImageZoom(false); }}
                    className="flex-1 py-3 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30 transition"
                  >
                    Mặt sau <ChevronRight size={16} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Full-screen zoom overlay */}
          {modalImageZoom && (() => {
            const src = modalImageTab === "front" ? modalImages.front : modalImages.back;
            return src ? (
              <div
                className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
                onClick={() => setModalImageZoom(false)}
              >
                <button
                  onClick={() => setModalImageZoom(false)}
                  className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition z-10"
                >
                  <X size={20} />
                </button>
                <img
                  src={getOptimizedUrl(src)}
                  alt="CCCD phóng to"
                  className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
                  onClick={e => e.stopPropagation()}
                />
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Tab: Settings
// ──────────────────────────────────────────────────────
function SettingsTab() {
  const [adminPassword, setAdminPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerStatus, setBannerStatus] = useState("off");
  const [savingPw, setSavingPw] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);
  const [msgPw, setMsgPw] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [msgBanner, setMsgBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showPw, setShowPw] = useState(false);
  // Popup state
  const [popupStatus, setPopupStatus] = useState("off");
  const [popupTitle, setPopupTitle] = useState("");
  const [popupContent, setPopupContent] = useState("");
  const [recruitmentLink, setRecruitmentLink] = useState("");
  const [savingPopup, setSavingPopup] = useState(false);
  const [msgPopup, setMsgPopup] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // Affiliate state (trang chấm công)
  const [shopeeLink, setShopeeLink] = useState("");
  const [shopeeDelay, setShopeeDelay] = useState("5");
  const [affiliateStatus, setAffiliateStatus] = useState("off");
  const [affiliateShowPopup, setAffiliateShowPopup] = useState("on");
  const [savingAffiliate, setSavingAffiliate] = useState(false);
  const [msgAffiliate, setMsgAffiliate] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // Affiliate state (trang ứng tuyển)
  const [ungTuyenAffiliateStatus, setUngTuyenAffiliateStatus] = useState("off");
  const [ungTuyenAffiliateShowPopup, setUngTuyenAffiliateShowPopup] = useState("on");
  const [ungTuyenShopeeLink, setUngTuyenShopeeLink] = useState("");
  const [ungTuyenShopeeDelay, setUngTuyenShopeeDelay] = useState("3");
  const [savingUngTuyenAffiliate, setSavingUngTuyenAffiliate] = useState(false);
  const [msgUngTuyenAffiliate, setMsgUngTuyenAffiliate] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // Attendance hours
  const [attendanceOpenTime, setAttendanceOpenTime] = useState("");
  const [attendanceCloseTime, setAttendanceCloseTime] = useState("");
  const [attendanceClosedMessage, setAttendanceClosedMessage] = useState("");
  const [zaloAdminLink, setZaloAdminLink] = useState("");
  const [savingHours, setSavingHours] = useState(false);
  const [msgHours, setMsgHours] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showSqlSetup, setShowSqlSetup] = useState(false);

  useEffect(() => {
    supabase.from("configs").select("key,value")
      .in("key", ["admin_password", "banner_url", "banner_status", "popup_status", "popup_title", "popup_content", "recruitment_link", "shopee_link", "shopee_delay", "affiliate_status", "affiliate_show_popup", "attendance_open_time", "attendance_close_time", "attendance_closed_message", "zalo_admin_link", "ung_tuyen_affiliate_status", "ung_tuyen_affiliate_show_popup", "ung_tuyen_shopee_link", "ung_tuyen_shopee_delay"])
      .then(({ data }) => {
        if (!data) return;
        const get = (key: string) => (data as { key: string; value: string }[]).find(d => d.key === key)?.value ?? "";
        setAdminPassword(get("admin_password"));
        setBannerUrl(get("banner_url"));
        setBannerStatus(get("banner_status") || "off");
        setPopupStatus(get("popup_status") || "off");
        setPopupTitle(get("popup_title") || "Cơ hội việc làm");
        setPopupContent(get("popup_content") || "Chúng tôi đang tuyển dụng!");
        setRecruitmentLink(get("recruitment_link") || "/gioi-thieu");
        setShopeeLink(get("shopee_link"));
        setShopeeDelay(get("shopee_delay") || "5");
        setAffiliateStatus(get("affiliate_status") || "off");
        setAffiliateShowPopup(get("affiliate_show_popup") || "on");
        setAttendanceOpenTime(get("attendance_open_time"));
        setAttendanceCloseTime(get("attendance_close_time"));
        setAttendanceClosedMessage(get("attendance_closed_message"));
        setZaloAdminLink(get("zalo_admin_link"));
        setUngTuyenAffiliateStatus(get("ung_tuyen_affiliate_status") || "off");
        setUngTuyenAffiliateShowPopup(get("ung_tuyen_affiliate_show_popup") || "on");
        setUngTuyenShopeeLink(get("ung_tuyen_shopee_link"));
        setUngTuyenShopeeDelay(get("ung_tuyen_shopee_delay") || "3");
      });
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setMsgPw({ type: "err", text: "Mật khẩu xác nhận không khớp." }); return; }
    if (newPassword.length < 8) { setMsgPw({ type: "err", text: "Mật khẩu mới phải có ít nhất 8 ký tự." }); return; }
    if (adminPassword) {
      const { data } = await supabase.from("configs").select("value").eq("key", "admin_password").single();
      const stored = data?.value ?? "";
      const hashedCurrent = await sha256(adminPassword);
      const match = stored === hashedCurrent || stored === adminPassword;
      if (!match) { setMsgPw({ type: "err", text: "Mật khẩu hiện tại không đúng." }); return; }
    }
    setSavingPw(true);
    const hashedNew = await sha256(newPassword);
    await supabase.from("configs").upsert({ key: "admin_password", value: hashedNew }, { onConflict: "key" });
    setMsgPw({ type: "ok", text: "Đổi mật khẩu thành công! Mật khẩu đã được mã hoá SHA-256." });
    setAdminPassword(newPassword); setNewPassword(""); setConfirmPassword("");
    setSavingPw(false);
    setTimeout(() => setMsgPw(null), 4000);
  };

  const handleToggleBanner = async () => {
    const next = bannerStatus === "on" ? "off" : "on";
    setBannerStatus(next);
    const { error } = await supabase.from("configs").upsert({ key: "banner_status", value: next }, { onConflict: "key" });
    if (error) alert(`Lỗi: ${error.message}`);
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBanner(true);
    const { error } = await supabase.from("configs").upsert({ key: "banner_url", value: bannerUrl.trim() }, { onConflict: "key" });
    if (error) {
      setMsgBanner({ type: "err", text: `Lỗi lưu: ${error.message}. Hãy chạy SQL Setup trong Supabase.` });
    } else {
      setMsgBanner({ type: "ok", text: "Lưu banner thành công!" });
    }
    setSavingBanner(false);
    setTimeout(() => setMsgBanner(null), 6000);
  };

  const handleTogglePopup = async () => {
    const next = popupStatus === "on" ? "off" : "on";
    setPopupStatus(next);
    const { error } = await supabase.from("configs").upsert({ key: "popup_status", value: next }, { onConflict: "key" });
    if (error) alert(`Lỗi lưu trạng thái popup: ${error.message}`);
  };

  const handleSavePopup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPopup(true);
    const results = await Promise.all([
      supabase.from("configs").upsert({ key: "popup_title", value: popupTitle }, { onConflict: "key" }),
      supabase.from("configs").upsert({ key: "popup_content", value: popupContent }, { onConflict: "key" }),
      supabase.from("configs").upsert({ key: "recruitment_link", value: recruitmentLink }, { onConflict: "key" }),
    ]);
    const err = results.find(r => r.error)?.error;
    if (err) {
      setMsgPopup({ type: "err", text: `Lỗi lưu: ${err.message}. Hãy chạy SQL Setup trong Supabase.` });
    } else {
      setMsgPopup({ type: "ok", text: "Lưu cài đặt popup thành công!" });
    }
    setSavingPopup(false);
    setTimeout(() => setMsgPopup(null), 6000);
  };

  const handleToggleAffiliate = async () => {
    const next = affiliateStatus === "on" ? "off" : "on";
    setAffiliateStatus(next);
    const { error } = await supabase.from("configs").upsert({ key: "affiliate_status", value: next }, { onConflict: "key" });
    if (error) alert(`Lỗi: ${error.message}`);
  };

  const handleToggleAffiliatePopup = async () => {
    const next = affiliateShowPopup === "on" ? "off" : "on";
    setAffiliateShowPopup(next);
    const { error } = await supabase.from("configs").upsert({ key: "affiliate_show_popup", value: next }, { onConflict: "key" });
    if (error) alert(`Lỗi: ${error.message}`);
  };

  const handleSaveAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAffiliate(true);
    const results = await Promise.all([
      supabase.from("configs").upsert({ key: "shopee_link", value: shopeeLink }, { onConflict: "key" }),
      supabase.from("configs").upsert({ key: "shopee_delay", value: shopeeDelay }, { onConflict: "key" }),
    ]);
    const err = results.find(r => r.error)?.error;
    if (err) {
      setMsgAffiliate({ type: "err", text: `Lỗi lưu: ${err.message}. Hãy chạy SQL Setup trong Supabase.` });
    } else {
      setMsgAffiliate({ type: "ok", text: "Lưu cài đặt Affiliate thành công!" });
    }
    setSavingAffiliate(false);
    setTimeout(() => setMsgAffiliate(null), 6000);
  };

  const handleToggleUngTuyenAffiliate = async () => {
    const next = ungTuyenAffiliateStatus === "on" ? "off" : "on";
    setUngTuyenAffiliateStatus(next);
    const { error } = await supabase.from("configs").upsert({ key: "ung_tuyen_affiliate_status", value: next }, { onConflict: "key" });
    if (error) alert(`Lỗi: ${error.message}`);
  };

  const handleToggleUngTuyenAffiliatePopup = async () => {
    const next = ungTuyenAffiliateShowPopup === "on" ? "off" : "on";
    setUngTuyenAffiliateShowPopup(next);
    const { error } = await supabase.from("configs").upsert({ key: "ung_tuyen_affiliate_show_popup", value: next }, { onConflict: "key" });
    if (error) alert(`Lỗi: ${error.message}`);
  };

  const handleSaveUngTuyenAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUngTuyenAffiliate(true);
    const results = await Promise.all([
      supabase.from("configs").upsert({ key: "ung_tuyen_shopee_link", value: ungTuyenShopeeLink }, { onConflict: "key" }),
      supabase.from("configs").upsert({ key: "ung_tuyen_shopee_delay", value: ungTuyenShopeeDelay }, { onConflict: "key" }),
    ]);
    const err = results.find(r => r.error)?.error;
    if (err) {
      setMsgUngTuyenAffiliate({ type: "err", text: `Lỗi lưu: ${err.message}` });
    } else {
      setMsgUngTuyenAffiliate({ type: "ok", text: "Lưu cài đặt thành công!" });
    }
    setSavingUngTuyenAffiliate(false);
    setTimeout(() => setMsgUngTuyenAffiliate(null), 6000);
  };

  const handleSaveHours = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingHours(true);
    const results = await Promise.all([
      supabase.from("configs").upsert({ key: "attendance_open_time", value: attendanceOpenTime }, { onConflict: "key" }),
      supabase.from("configs").upsert({ key: "attendance_close_time", value: attendanceCloseTime }, { onConflict: "key" }),
      supabase.from("configs").upsert({ key: "attendance_closed_message", value: attendanceClosedMessage }, { onConflict: "key" }),
      supabase.from("configs").upsert({ key: "zalo_admin_link", value: zaloAdminLink }, { onConflict: "key" }),
    ]);
    const err = results.find(r => r.error)?.error;
    if (err) {
      setMsgHours({ type: "err", text: `Lỗi lưu: ${err.message}. Hãy chạy SQL Setup trong Supabase.` });
    } else {
      setMsgHours({ type: "ok", text: "Lưu cài đặt giờ thành công!" });
    }
    setSavingHours(false);
    setTimeout(() => setMsgHours(null), 6000);
  };

  const SQL_SETUP = `-- =============================================
-- CHẠY TOÀN BỘ ĐOẠN NÀY 1 LẦN TRONG SUPABASE SQL EDITOR
-- =============================================

-- =============================================
-- BƯỚC 1: Tạo bảng configs (nếu chưa có)
-- =============================================
CREATE TABLE IF NOT EXISTS configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- BƯỚC 2: Tắt RLS + thêm policy cho phép anon
-- (cần làm cả 2 để đảm bảo hoạt động)
-- =============================================
ALTER TABLE configs DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_configs" ON configs;
CREATE POLICY "allow_all_configs" ON configs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_attendance" ON attendance;
CREATE POLICY "allow_all_attendance" ON attendance FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_shifts" ON shifts;
CREATE POLICY "allow_all_shifts" ON shifts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE reconciliations DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_reconciliations" ON reconciliations;
CREATE POLICY "allow_all_reconciliations" ON reconciliations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE job_applications DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_job_applications" ON job_applications;
CREATE POLICY "allow_all_job_applications" ON job_applications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- =============================================
-- BƯỚC 3: Thêm cột mới vào job_applications
-- =============================================
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS referrer_bank_account TEXT DEFAULT '';
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS referrer_bank_name TEXT DEFAULT '';`;

  return (
    <div className="space-y-5 max-w-lg">
      {/* Hướng dẫn setup tổng quát */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSqlSetup(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-100/60 transition"
        >
          <span className="text-sm font-semibold text-amber-800">⚠️ Setup Supabase (chạy 1 lần)</span>
          <ChevronDown size={16} className={`text-amber-600 transition-transform duration-200 ${showSqlSetup ? "rotate-180" : ""}`} />
        </button>
        {showSqlSetup && (
          <div className="px-4 pb-4 space-y-2">
            <p className="text-xs text-amber-700">
              Nếu không xóa được dữ liệu, popup/banner không hoạt động, hoặc lưu ca/đối soát thất bại — hãy chạy SQL này trong Supabase SQL Editor:
            </p>
            <pre className="bg-white border border-amber-200 rounded-xl p-3 text-xs text-amber-900 overflow-x-auto whitespace-pre-wrap">{SQL_SETUP}</pre>
          </div>
        )}
      </div>

      {/* Đổi mật khẩu */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Lock size={16} className="text-primary" />
          Đổi mật khẩu Admin
        </h3>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Mật khẩu hiện tại</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={adminPassword} onChange={e => setAdminPassword(e.target.value)}
                placeholder="Mật khẩu cũ..."
                className="w-full px-3 py-2.5 pr-9 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Mật khẩu mới</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mật khẩu mới..."
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Xác nhận mật khẩu mới</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Nhập lại..."
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
          </div>
          {msgPw && (
            <p className={`text-xs flex items-center gap-1 ${msgPw.type === "ok" ? "text-green-600" : "text-red-500"}`}>
              {msgPw.type === "ok" ? <CheckCircle size={13} /> : <XCircle size={13} />}
              {msgPw.text}
            </p>
          )}
          <button type="submit" disabled={savingPw || !newPassword || !confirmPassword}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
            <Save size={14} />
            {savingPw ? "Đang lưu..." : "Đổi mật khẩu"}
          </button>
        </form>
      </div>

      {/* Banner quảng cáo */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" />
            Banner quảng cáo
          </h3>
          <button
            type="button"
            onClick={handleToggleBanner}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
              bannerStatus === "on"
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {bannerStatus === "on" ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {bannerStatus === "on" ? "Đang bật" : "Đang tắt"}
          </button>
        </div>
        <form onSubmit={handleSaveBanner} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">URL ảnh banner</label>
            <input type="url" value={bannerUrl} onChange={e => setBannerUrl(e.target.value)} placeholder="https://..."
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
          </div>
          {bannerUrl && (
            <img src={bannerUrl} alt="Preview banner" className="w-full rounded-xl object-cover max-h-32 border border-border" onError={e => (e.currentTarget.style.display = "none")} />
          )}
          {msgBanner && (
            <p className={`text-xs flex items-center gap-1 ${msgBanner.type === "ok" ? "text-green-600" : "text-red-500"}`}>
              {msgBanner.type === "ok" ? <CheckCircle size={13} /> : <XCircle size={13} />}
              {msgBanner.text}
            </p>
          )}
          <button type="submit" disabled={savingBanner}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
            <Save size={14} />
            {savingBanner ? "Đang lưu..." : "Lưu banner"}
          </button>
        </form>
      </div>

      {/* Quản lý Popup tuyển dụng */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Megaphone size={16} className="text-primary" />
            Popup tuyển dụng
          </h3>
          <button
            type="button"
            onClick={handleTogglePopup}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
              popupStatus === "on"
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {popupStatus === "on" ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {popupStatus === "on" ? "Đang bật" : "Đang tắt"}
          </button>
        </div>
        <form onSubmit={handleSavePopup} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Tiêu đề popup</label>
            <input type="text" value={popupTitle} onChange={e => setPopupTitle(e.target.value)}
              placeholder="VD: Cơ hội việc làm"
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nội dung popup</label>
            <textarea value={popupContent} onChange={e => setPopupContent(e.target.value)}
              rows={3} placeholder="Mô tả ngắn về tuyển dụng..."
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Link trang ứng tuyển</label>
            <div className="relative">
              <ExternalLink size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={recruitmentLink} onChange={e => setRecruitmentLink(e.target.value)}
                placeholder="/ung-tuyen hoặc https://..."
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
            </div>
          </div>
          {msgPopup && (
            <p className={`text-xs flex items-center gap-1 ${msgPopup.type === "ok" ? "text-green-600" : "text-red-500"}`}>
              {msgPopup.type === "ok" ? <CheckCircle size={13} /> : <XCircle size={13} />}
              {msgPopup.text}
            </p>
          )}
          <button type="submit" disabled={savingPopup}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
            <Save size={14} />
            {savingPopup ? "Đang lưu..." : "Lưu cài đặt popup"}
          </button>
        </form>
      </div>

      {/* Affiliate - Chuyển hướng sau chấm công */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <ExternalLink size={16} className="text-primary" />
            Affiliate
          </h3>
          <button
            type="button"
            onClick={handleToggleAffiliate}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
              affiliateStatus === "on"
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {affiliateStatus === "on" ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {affiliateStatus === "on" ? "Đang bật" : "Đang tắt"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Tự động chuyển hướng đến link Affiliate sau khi nhân viên chấm công xong.</p>

        {/* Toggle hiện/ẩn popup đếm ngược */}
        <div className="flex items-center justify-between mb-4 p-3 bg-muted/40 rounded-xl">
          <div>
            <p className="text-sm font-medium text-foreground">Hiện popup đếm ngược</p>
            <p className="text-xs text-muted-foreground">Tắt = chuyển hướng âm thầm (không hiện popup)</p>
          </div>
          <button
            type="button"
            onClick={handleToggleAffiliatePopup}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
              affiliateShowPopup === "on"
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {affiliateShowPopup === "on" ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {affiliateShowPopup === "on" ? "Hiện" : "Ẩn"}
          </button>
        </div>

        <form onSubmit={handleSaveAffiliate} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Link Affiliate</label>
            <div className="relative">
              <ExternalLink size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={shopeeLink} onChange={e => setShopeeLink(e.target.value)}
                placeholder="https://shp.ee/... hoặc link bất kỳ"
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Thời gian chờ (giây)</label>
            <input
              type="number" min="1" max="60"
              value={shopeeDelay} onChange={e => setShopeeDelay(e.target.value)}
              placeholder="VD: 5"
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
            />
            <p className="text-xs text-muted-foreground mt-1">Chờ X giây sau khi chấm công xong rồi chuyển.</p>
          </div>
          {msgAffiliate && (
            <p className={`text-xs flex items-center gap-1 ${msgAffiliate.type === "ok" ? "text-green-600" : "text-red-500"}`}>
              {msgAffiliate.type === "ok" ? <CheckCircle size={13} /> : <XCircle size={13} />}
              {msgAffiliate.text}
            </p>
          )}
          <button type="submit" disabled={savingAffiliate}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
            <Save size={14} />
            {savingAffiliate ? "Đang lưu..." : "Lưu cài đặt Affiliate"}
          </button>
        </form>
      </div>

      {/* Affiliate - Chuyển hướng sau ứng tuyển */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <ExternalLink size={16} className="text-primary" />
            Affiliate (trang ứng tuyển)
          </h3>
          <button
            type="button"
            onClick={handleToggleUngTuyenAffiliate}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
              ungTuyenAffiliateStatus === "on"
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {ungTuyenAffiliateStatus === "on" ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {ungTuyenAffiliateStatus === "on" ? "Đang bật" : "Đang tắt"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Tự động chuyển hướng đến link Affiliate sau khi ứng viên nộp đơn xong.</p>

        <div className="flex items-center justify-between mb-4 p-3 bg-muted/40 rounded-xl">
          <div>
            <p className="text-sm font-medium text-foreground">Hiện popup đếm ngược</p>
            <p className="text-xs text-muted-foreground">Tắt = chuyển hướng âm thầm (không hiện popup)</p>
          </div>
          <button
            type="button"
            onClick={handleToggleUngTuyenAffiliatePopup}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
              ungTuyenAffiliateShowPopup === "on"
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {ungTuyenAffiliateShowPopup === "on" ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {ungTuyenAffiliateShowPopup === "on" ? "Hiện" : "Ẩn"}
          </button>
        </div>

        <form onSubmit={handleSaveUngTuyenAffiliate} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Link Affiliate</label>
            <div className="relative">
              <ExternalLink size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={ungTuyenShopeeLink} onChange={e => setUngTuyenShopeeLink(e.target.value)}
                placeholder="https://shp.ee/... hoặc link bất kỳ"
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Thời gian chờ (giây)</label>
            <input
              type="number" min="1" max="60"
              value={ungTuyenShopeeDelay} onChange={e => setUngTuyenShopeeDelay(e.target.value)}
              placeholder="VD: 3"
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
            />
            <p className="text-xs text-muted-foreground mt-1">Chờ X giây sau khi nộp đơn xong rồi chuyển.</p>
          </div>
          {msgUngTuyenAffiliate && (
            <p className={`text-xs flex items-center gap-1 ${msgUngTuyenAffiliate.type === "ok" ? "text-green-600" : "text-red-500"}`}>
              {msgUngTuyenAffiliate.type === "ok" ? <CheckCircle size={13} /> : <XCircle size={13} />}
              {msgUngTuyenAffiliate.text}
            </p>
          )}
          <button type="submit" disabled={savingUngTuyenAffiliate}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
            <Save size={14} />
            {savingUngTuyenAffiliate ? "Đang lưu..." : "Lưu cài đặt Affiliate ứng tuyển"}
          </button>
        </form>
      </div>

      {/* Giờ mở/đóng trang chấm công */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Timer size={16} className="text-primary" />
          Giờ mở / đóng trang chấm công
        </h3>
        <form onSubmit={handleSaveHours} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Giờ mở (từ)</label>
              <input type="time" value={attendanceOpenTime} onChange={e => setAttendanceOpenTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Giờ đóng (đến)</label>
              <input type="time" value={attendanceCloseTime} onChange={e => setAttendanceCloseTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Để trống cả hai để luôn mở. Ngoài khung giờ, trang chấm công sẽ hiển thị thông báo.</p>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nội dung thông báo khi trang đóng</label>
            <textarea value={attendanceClosedMessage} onChange={e => setAttendanceClosedMessage(e.target.value)}
              rows={3}
              placeholder="VD: Bạn không thể truy cập, có thể trang web chưa được mở hoặc đã đóng..."
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Link Zalo quản trị viên</label>
            <div className="relative">
              <MessageCircle size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={zaloAdminLink} onChange={e => setZaloAdminLink(e.target.value)}
                placeholder="https://zalo.me/..."
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Hiển thị nút "Liên hệ" trong popup khi trang đóng.</p>
          </div>
          {msgHours && (
            <p className={`text-xs flex items-center gap-1 ${msgHours.type === "ok" ? "text-green-600" : "text-red-500"}`}>
              {msgHours.type === "ok" ? <CheckCircle size={13} /> : <XCircle size={13} />}
              {msgHours.text}
            </p>
          )}
          <button type="submit" disabled={savingHours}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
            <Save size={14} />
            {savingHours ? "Đang lưu..." : "Lưu cài đặt giờ"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Security helpers
// ──────────────────────────────────────────────────────
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

const SESSION_KEY = "admin_session_v2";
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

function getSession(): { token: string; expiry: number } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { token: string; expiry: number };
    if (!s.token || !s.expiry || Date.now() > s.expiry) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch { return null; }
}

function setSession() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: generateToken(), expiry: Date.now() + SESSION_DURATION }));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem("admin_auth");
}

const RATE_KEY = "admin_rate";
const MAX_ATTEMPTS = 5;
const LOCK_DURATION = 15 * 60 * 1000; // 15 minutes

function getRateLimit(): { attempts: number; lockedUntil: number } {
  try {
    const raw = localStorage.getItem(RATE_KEY);
    return raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: 0 };
  } catch { return { attempts: 0, lockedUntil: 0 }; }
}

function recordFailedAttempt() {
  const r = getRateLimit();
  const attempts = r.attempts + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCK_DURATION : r.lockedUntil;
  localStorage.setItem(RATE_KEY, JSON.stringify({ attempts, lockedUntil }));
  return { attempts, lockedUntil };
}

function resetRateLimit() {
  localStorage.removeItem(RATE_KEY);
}

// ──────────────────────────────────────────────────────
// Admin Login Screen
// ──────────────────────────────────────────────────────
function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(() => getRateLimit().lockedUntil);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) setLockedUntil(0);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    const rate = getRateLimit();
    if (rate.lockedUntil > Date.now()) return;
    setLoading(true);
    setError("");
    const { data } = await supabase.from("configs").select("value").eq("key", "admin_password").single();
    const stored = data?.value ?? "";
    const hashed = await sha256(password.trim());
    const isHashMatch = stored === hashed;
    const isPlainMatch = stored === password.trim() && !isHashMatch;
    if (isHashMatch || isPlainMatch) {
      if (isPlainMatch) {
        await supabase.from("configs").upsert({ key: "admin_password", value: hashed }, { onConflict: "key" });
      }
      resetRateLimit();
      setSession();
      onLogin();
    } else {
      const { attempts, lockedUntil: lu } = recordFailedAttempt();
      if (lu > Date.now()) {
        setLockedUntil(lu);
        setError(`Sai quá ${MAX_ATTEMPTS} lần. Tài khoản bị khóa 15 phút.`);
      } else {
        setError(`Mật khẩu không đúng. Còn ${MAX_ATTEMPTS - attempts} lần thử.`);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 space-y-2">
          <div className="w-16 h-16 bg-primary/20 border border-primary/30 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldCheck size={32} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm">Đăng nhập để quản lý hệ thống</p>
        </div>
        <form onSubmit={handleLogin} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1.5 block">Mật khẩu Admin</label>
            <div className="relative">
              <input
                data-testid="input-admin-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="Nhập mật khẩu..."
                autoFocus
                disabled={lockedUntil > Date.now()}
                className="w-full px-4 py-3 pr-10 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 transition disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {lockedUntil > Date.now() && (
              <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
                <Lock size={12} /> Tạm khóa — thử lại sau {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
              </p>
            )}
            {error && !lockedUntil && <p data-testid="login-error" className="text-red-400 text-xs mt-1.5">{error}</p>}
            {error && lockedUntil > 0 && <p data-testid="login-error" className="text-red-400 text-xs mt-1.5">{error}</p>}
          </div>
          <button type="submit" data-testid="btn-admin-login" disabled={loading || !password.trim() || lockedUntil > Date.now()}
            className="w-full py-3 bg-primary text-white rounded-xl font-semibold text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={14} className="animate-spin" />Đang kiểm tra...</> : "Đăng nhập"}
          </button>
        </form>
        <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          <p className="text-amber-300 text-xs font-medium mb-1">Chưa có mật khẩu?</p>
          <p className="text-slate-400 text-xs">Chạy SQL này trong Supabase SQL Editor:</p>
          <code className="block mt-1 text-xs text-slate-300 bg-black/30 rounded-lg px-3 py-2 font-mono">
            INSERT INTO configs (key, value)<br/>
            VALUES ('admin_password', 'matkhau123');
          </code>
        </div>
        <div className="mt-4 text-center">
          <Link href="/" className="text-slate-500 hover:text-slate-300 text-xs transition">Quay lại trang chấm công</Link>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Admin Dashboard Shell
// ──────────────────────────────────────────────────────
function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("attendance").select("*").order("created_at", { ascending: false });
    setAllRecords((data || []) as AttendanceRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleLogout = () => { clearSession(); onLogout(); };

  const navItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Tổng quan", icon: <LayoutDashboard size={18} /> },
    { id: "records", label: "Dữ liệu chấm công", icon: <ClipboardList size={18} /> },
    { id: "applications", label: "Quản lý ứng tuyển", icon: <UserPlus size={18} /> },
    { id: "settings", label: "Cài đặt", icon: <Settings size={18} /> },
    { id: "shifts", label: "Quản lý ca làm", icon: <Layers size={18} /> },
    { id: "reconciliation", label: "Đối soát", icon: <CalendarCheck size={18} /> },
    { id: "export", label: "Xuất dữ liệu", icon: <FileSpreadsheet size={18} /> },
    { id: "cleanup", label: "Dọn dẹp", icon: <Trash2 size={18} /> },
  ];

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-60 bg-sidebar text-sidebar-foreground z-30 flex flex-col transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:flex`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
            <ShieldCheck size={18} className="text-sidebar-primary" />
          </div>
          <div>
            <p className="font-bold text-sm">Admin Panel</p>
            <p className="text-xs text-sidebar-foreground/50">Hệ thống chấm công</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                activeTab === item.id
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Divider links */}
        <div className="px-3 py-3 border-t border-sidebar-border space-y-1">
          <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition">
            <Camera size={14} />Trang chấm công
          </Link>
          <Link href="/tra-cuu" className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition">
            <Search size={14} />Tra cứu
          </Link>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition">
            <LogOut size={14} />Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white/80 backdrop-blur-md border-b border-border sticky top-0 z-10 px-3 sm:px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(s => !s)} className="p-2 rounded-lg hover:bg-muted transition lg:hidden">
              <Menu size={18} />
            </button>
            <h1 className="font-bold text-foreground">
              {navItems.find(n => n.id === activeTab)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} disabled={loading}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition px-2 py-1.5 rounded-lg hover:bg-muted">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Làm mới
            </button>
            <span className="text-xs text-muted-foreground hidden sm:inline">{allRecords.length} bản ghi</span>
          </div>
        </header>

        {/* Tab content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
              <RefreshCw size={16} className="animate-spin" />Đang tải...
            </div>
          ) : (
            <>
              {activeTab === "overview" && <OverviewTab allRecords={allRecords} />}
              {activeTab === "records" && <RecordsTab allRecords={allRecords} onRefresh={fetchAll} />}
              {activeTab === "applications" && <JobApplicationsTab />}
              {activeTab === "settings" && <SettingsTab />}
              {activeTab === "shifts" && <ShiftsTab />}
              {activeTab === "reconciliation" && <ReconciliationTab allRecords={allRecords} />}
              {activeTab === "export" && <ExportTab />}
              {activeTab === "cleanup" && <CleanupTab />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Root Export
// ──────────────────────────────────────────────────────
export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => getSession() !== null
  );
  if (!isAuthenticated) return <AdminLogin onLogin={() => setIsAuthenticated(true)} />;
  return <AdminDashboard onLogout={() => setIsAuthenticated(false)} />;
}
