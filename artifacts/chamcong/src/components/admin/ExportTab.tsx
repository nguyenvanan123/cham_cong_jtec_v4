import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Reconciliation } from "@/lib/supabase";
import { Download, RefreshCw, FileSpreadsheet, X, Trash2, Search } from "lucide-react";

function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}
function todayStr() { return new Date().toISOString().split("T")[0]; }
function fM(n: number) { return n.toLocaleString("vi-VN"); }

type HoursFilter = "all" | "under8" | "full8_overtime" | "full8_no_overtime";

type RowCase = "under8" | "full8_overtime" | "full8_no_overtime";

function getRowCase(r: Reconciliation): RowCase {
  if (r.total_hours > 0 && r.total_hours < 8) return "under8";
  if (r.total_hours >= 8 && r.overtime_hours > 0) return "full8_overtime";
  return "full8_no_overtime";
}

const ROW_STYLES: Record<RowCase, string> = {
  under8:           "bg-red-100/70 hover:bg-red-100",
  full8_overtime:   "bg-green-100/70 hover:bg-green-100",
  full8_no_overtime:"bg-blue-50/80 hover:bg-blue-100",
};

const HOUR_TEXT_STYLES: Record<RowCase, string> = {
  under8:           "text-red-600 font-bold",
  full8_overtime:   "text-green-700 font-bold",
  full8_no_overtime:"text-blue-600 font-bold",
};

export function ExportTab() {
  const [from, setFrom] = useState(yesterday());
  const [to, setTo] = useState(todayStr());
  const [records, setRecords] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [modalImg, setModalImg] = useState<string | null>(null);
  const [modalImgLabel, setModalImgLabel] = useState<string>("");
  const [modalImgZoomed, setModalImgZoomed] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [hoursFilter, setHoursFilter] = useState<HoursFilter>("all");
  const [showNotes, setShowNotes] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reconciliations")
      .select("*")
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) setDbError(true);
    else { setDbError(false); setRecords((data || []) as Reconciliation[]); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setModalImg(null); setModalImgZoomed(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filtered = records.filter(r => {
    if (hoursFilter === "all") return true;
    return getRowCase(r) === hoursFilter;
  });

  const exportExcel = () => {
    const bgColor: Record<RowCase, string> = {
      under8: "#fecaca",
      full8_overtime: "#bbf7d0",
      full8_no_overtime: "#bfdbfe",
    };
    const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const headers = [
      "Loại NV", "Ngày", "Mã NV", "Họ tên", "Ca làm",
      "Giờ vào", "Giờ ra", "Tổng giờ", "Giờ thường", "Tăng ca",
      "Lương cơ bản", "Lương tăng ca", "Thưởng", "Chuyên cần", "Tổng lương",
      "Số TK", "Tên NH",
      ...(showNotes ? ["Ghi chú"] : []),
    ];
    const headerRow = `<tr style="background:#e2e8f0;font-weight:bold">${headers.map(h => `<td>${esc(h)}</td>`).join("")}</tr>`;
    const dataRows = filtered.map(r => {
      const cas = getRowCase(r);
      const cells = [
        r.employee_type || "", r.work_date, r.employee_id, r.full_name, r.shift_name,
        r.check_in_time, r.check_out_time,
        r.total_hours.toFixed(2), r.normal_hours.toFixed(2), r.overtime_hours.toFixed(2),
        r.base_wage, r.overtime_pay, r.bonus, r.attendance_bonus, r.total_wage,
        r.bank_account, r.bank_name,
        ...(showNotes ? [r.notes || ""] : []),
      ];
      return `<tr style="background:${bgColor[cas]}">${cells.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`;
    });
    const html = `<html><head><meta charset="utf-8"></head><body><table>${headerRow}${dataRows.join("")}</table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `doi-soat_${from}_${to}.xls`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa bản đối soát này?")) return;
    setDeleting(id);
    await supabase.from("reconciliations").delete().eq("id", id);
    setDeleting(null);
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  const totalWage = filtered.reduce((sum, r) => sum + r.total_wage, 0);

  const countUnder8       = records.filter(r => getRowCase(r) === "under8").length;
  const countOvertimeFull = records.filter(r => getRowCase(r) === "full8_overtime").length;
  const countFullOnly     = records.filter(r => getRowCase(r) === "full8_no_overtime").length;

  type FilterDef = { key: HoursFilter; label: string; count: number; dotColor: string; base: string; active: string };
  const filterButtons: FilterDef[] = [
    {
      key: "all", label: "Tất cả", count: records.length,
      dotColor: "bg-foreground",
      base:   "border-border text-foreground hover:bg-muted",
      active: "bg-foreground text-background border-foreground",
    },
    {
      key: "under8", label: "Chưa đủ 8 tiếng", count: countUnder8,
      dotColor: "bg-red-500",
      base:   "border-red-200 text-red-700 hover:bg-red-50",
      active: "bg-red-500 text-white border-red-500",
    },
    {
      key: "full8_overtime", label: "Đủ 8h + tăng ca", count: countOvertimeFull,
      dotColor: "bg-green-500",
      base:   "border-green-200 text-green-700 hover:bg-green-50",
      active: "bg-green-600 text-white border-green-600",
    },
    {
      key: "full8_no_overtime", label: "Đủ 8h, không tăng ca", count: countFullOnly,
      dotColor: "bg-blue-500",
      base:   "border-blue-200 text-blue-700 hover:bg-blue-50",
      active: "bg-blue-500 text-white border-blue-500",
    },
  ];

  return (
    <div className="space-y-4">
      {dbError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          Chưa có bảng <code className="bg-amber-100 px-1 rounded">reconciliations</code>.
          Vui lòng thực hiện đối soát trước trong tab "Đối soát".
        </div>
      )}

      {/* Date filter & export */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {[["Từ ngày", from, setFrom], ["Đến ngày", to, setTo]].map(([label, val, setter]) => (
            <div key={label as string}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{label as string}</label>
              <input type="date" value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)}
                className="px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
          ))}
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-input text-sm text-muted-foreground hover:bg-muted transition">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />Tải lại
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowNotes(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition ${showNotes ? "bg-amber-100 border-amber-300 text-amber-800" : "border-input text-muted-foreground hover:bg-muted"}`}
              title="Hiện/ẩn cột ghi chú"
            >
              {showNotes ? "🗒️ Ẩn ghi chú" : "🗒️ Ghi chú"}
            </button>
            <button onClick={exportExcel} disabled={filtered.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition disabled:opacity-50">
              <Download size={15} />Xuất Excel ({filtered.length})
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-border shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{records.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tổng bản ghi</p>
          </div>
          <div className="bg-blue-50 rounded-2xl border border-blue-100 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{countFullOnly}</p>
            <p className="text-xs text-blue-700 mt-0.5">Đủ 8h, không TC</p>
          </div>
          <div className="bg-green-50 rounded-2xl border border-green-100 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{countOvertimeFull}</p>
            <p className="text-xs text-green-700 mt-0.5">Đủ 8h + tăng ca</p>
          </div>
          <div className="bg-red-50 rounded-2xl border border-red-100 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{countUnder8}</p>
            <p className="text-xs text-red-700 mt-0.5">Chưa đủ 8 tiếng</p>
          </div>
        </div>
      )}

      {/* Filter buttons + legend */}
      {records.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium text-muted-foreground mr-1">Lọc:</span>
          {filterButtons.map(btn => (
            <button
              key={btn.key}
              onClick={() => setHoursFilter(btn.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${hoursFilter === btn.key ? btn.active : btn.base}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hoursFilter === btn.key ? "bg-white/70" : btn.dotColor}`} />
              {btn.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${hoursFilter === btn.key ? "bg-white/20" : "bg-muted"}`}>
                {btn.count}
              </span>
            </button>
          ))}

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mt-1 sm:mt-0 sm:ml-auto">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-200 inline-block flex-shrink-0" />Chưa đủ 8h</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-200 inline-block flex-shrink-0" />Đủ 8h + TC</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 inline-block flex-shrink-0" />Đủ 8h, không TC</span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
            <RefreshCw size={16} className="animate-spin" />Đang tải...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <FileSpreadsheet size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {records.length === 0
                ? "Chưa có dữ liệu đối soát trong khoảng thời gian này."
                : "Không có bản ghi nào khớp với bộ lọc đã chọn."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["L.NV","Ngày","Mã NV","Họ tên","Ca","Vào","Ra","T.Giờ","Thường","TC","Lương CB","Lương TC","Thưởng","Tổng lương","STK","NH",...(showNotes ? ["Ghi chú"] : []),"Ảnh",""].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map(r => {
                  const cas = getRowCase(r);
                  return (
                    <tr key={r.id} className={`transition-colors ${ROW_STYLES[cas]}`}>
                      <td className="px-3 py-3">
                        {r.employee_type === "N" && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-black">N</span>
                        )}
                        {r.employee_type === "O" && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-700 text-white text-xs font-black">O</span>
                        )}
                        {(!r.employee_type) && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground/50 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.work_date}</td>
                      <td className="px-3 py-3 font-mono text-xs font-bold">{r.employee_id}</td>
                      <td className="px-3 py-3 font-medium whitespace-nowrap">{r.full_name}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground max-w-[80px] truncate">{r.shift_name?.split("(")[0]?.trim()}</td>
                      <td className="px-3 py-3 text-xs text-green-700 font-medium">{r.check_in_time || "—"}</td>
                      <td className="px-3 py-3 text-xs text-blue-700 font-medium">{r.check_out_time || "—"}</td>
                      <td className={`px-3 py-3 text-xs whitespace-nowrap ${HOUR_TEXT_STYLES[cas]}`}>
                        {r.total_hours.toFixed(2)}h
                      </td>
                      <td className="px-3 py-3 text-xs text-foreground/70">{r.normal_hours.toFixed(2)}h</td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        {r.overtime_hours > 0
                          ? <span className="font-bold text-green-700">+{r.overtime_hours.toFixed(2)}h</span>
                          : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs font-medium whitespace-nowrap">{fM(r.base_wage)}đ</td>
                      <td className="px-3 py-3 text-xs font-medium whitespace-nowrap text-green-700">{fM(r.overtime_pay)}đ</td>
                      <td className="px-3 py-3 text-xs font-medium whitespace-nowrap text-blue-700">{fM(r.bonus + r.attendance_bonus)}đ</td>
                      <td className="px-3 py-3 text-xs font-black text-primary whitespace-nowrap">{fM(r.total_wage)}đ</td>
                      <td className="px-3 py-3 text-xs font-mono">{r.bank_account || "—"}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.bank_name || "—"}</td>
                      {showNotes && (
                        <td className="px-3 py-3 text-xs text-muted-foreground max-w-[160px]">
                          <span className="line-clamp-2">{r.notes || <span className="opacity-40">—</span>}</span>
                        </td>
                      )}
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          {r.check_in_image && (
                            <button onClick={() => { setModalImg(r.check_in_image); setModalImgLabel(`Check-in — ${r.full_name} (${r.work_date})`); setModalImgZoomed(false); }} className="w-7 h-7 rounded-lg overflow-hidden border border-green-200 hover:ring-2 hover:ring-green-400 transition">
                              <img src={r.check_in_image} className="w-full h-full object-cover" />
                            </button>
                          )}
                          {r.check_out_image && (
                            <button onClick={() => { setModalImg(r.check_out_image); setModalImgLabel(`Check-out — ${r.full_name} (${r.work_date})`); setModalImgZoomed(false); }} className="w-7 h-7 rounded-lg overflow-hidden border border-blue-200 hover:ring-2 hover:ring-blue-400 transition">
                              <img src={r.check_out_image} className="w-full h-full object-cover" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id}
                          className="p-1.5 rounded-lg hover:bg-red-100 text-muted-foreground hover:text-red-500 transition disabled:opacity-50">
                          {deleting === r.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/40 border-t-2 border-border">
                <tr>
                  <td colSpan={13} className="px-3 py-3 text-xs font-bold text-right text-foreground">
                    TỔNG CỘNG ({filtered.length} bản ghi):
                  </td>
                  <td className="px-3 py-3 text-sm font-black text-primary whitespace-nowrap">{fM(totalWage)}đ</td>
                  <td colSpan={showNotes ? 5 : 4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {modalImg && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center" onClick={() => { setModalImg(null); setModalImgZoomed(false); }}>
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10" onClick={e => e.stopPropagation()}>
            <span className="text-white text-sm font-medium truncate">{modalImgLabel}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setModalImgZoomed(z => !z)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition"
              >
                <Search size={13} />
                {modalImgZoomed ? "Thu nhỏ" : "Phóng to 100%"}
              </button>
              <a
                href={modalImg}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition"
                onClick={e => e.stopPropagation()}
              >
                <Download size={13} />
                Tải xuống
              </a>
              <button onClick={() => { setModalImg(null); setModalImgZoomed(false); }} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition">
                <X size={16} className="text-white" />
              </button>
            </div>
          </div>
          <div
            className={`relative flex items-center justify-center w-full h-full p-16 ${modalImgZoomed ? "overflow-auto cursor-zoom-out" : "cursor-zoom-in"}`}
            onClick={e => { e.stopPropagation(); setModalImgZoomed(z => !z); }}
          >
            <img
              src={modalImg}
              alt="Ảnh đối soát"
              className={`rounded-xl shadow-2xl transition-all duration-200 ${modalImgZoomed ? "max-w-none w-auto" : "max-w-full max-h-[80vh] object-contain"}`}
            />
          </div>
          <p className="absolute bottom-4 text-white/50 text-xs">Nhấn ảnh để phóng to • ESC để đóng</p>
        </div>
      )}
    </div>
  );
}
