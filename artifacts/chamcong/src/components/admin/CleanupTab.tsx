import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Trash2, ChevronLeft, ChevronRight, AlertTriangle,
  RefreshCw, Filter, ShieldAlert, X
} from "lucide-react";

// ──────────────────────────────────────────────────────
// Kiểu dữ liệu cho từng loại bản ghi
// ──────────────────────────────────────────────────────
type DataType = "attendance" | "shifts" | "job_applications";

type DataOption = {
  value: DataType;
  label: string;
  table: string;
  columns: string[];
  renderRow: (row: Record<string, unknown>) => React.ReactNode[];
};

// Cấu hình cho từng loại dữ liệu
const DATA_OPTIONS: DataOption[] = [
  {
    value: "attendance",
    label: "Dữ liệu chấm công",
    table: "attendance",
    columns: ["Mã NV", "Họ tên", "Ngày làm", "Ca", "Loại", "Ngày tạo"],
    renderRow: (r) => [
      r.employee_id as string,
      r.full_name as string,
      r.work_date as string,
      r.shift as string,
      r.action_type as string,
      r.created_at ? new Date(r.created_at as string).toLocaleString("vi-VN") : "-",
    ],
  },
  {
    value: "shifts",
    label: "Quản lý ca làm",
    table: "shifts",
    columns: ["Tên ca", "Giờ bắt đầu", "Giờ kết thúc", "Lương cơ bản", "Ngày tạo"],
    renderRow: (r) => [
      r.name as string,
      r.start_time as string,
      r.end_time as string,
      `${(r.base_wage as number)?.toLocaleString("vi-VN")} ₫`,
      r.created_at ? new Date(r.created_at as string).toLocaleString("vi-VN") : "-",
    ],
  },
  {
    value: "job_applications",
    label: "Đơn tuyển dụng",
    table: "job_applications",
    columns: ["Họ tên", "SĐT", "Người giới thiệu", "Trạng thái", "Ngày gửi"],
    renderRow: (r) => [
      r.full_name as string,
      r.phone as string,
      r.referrer_name as string || "—",
      r.status as string,
      r.created_at ? new Date(r.created_at as string).toLocaleString("vi-VN") : "-",
    ],
  },
];

const ITEMS_PER_PAGE = 15;

// ──────────────────────────────────────────────────────
// Modal xác nhận xóa
// ──────────────────────────────────────────────────────
function ConfirmModal({
  count,
  label,
  onConfirm,
  onCancel,
  deleting,
}: {
  count: number;
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#1e2130] border border-red-500/30 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-700 to-rose-700 px-5 pt-5 pb-4 flex items-start gap-3 relative">
          <button
            onClick={onCancel}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
            disabled={deleting}
          >
            <X size={14} className="text-white" />
          </button>
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShieldAlert size={22} className="text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold text-base leading-tight">Xác nhận xóa dữ liệu</h3>
            <p className="text-red-200 text-xs mt-0.5">Hành động này không thể hoàn tác</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <p className="text-slate-200 text-sm leading-relaxed">
            Bạn có chắc muốn xóa{" "}
            <span className="font-bold text-red-400 text-base">{count}</span>{" "}
            bản ghi thuộc mục{" "}
            <span className="font-semibold text-white">"{label}"</span>?
          </p>
          <div className="bg-red-900/30 border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-red-300 text-xs">
              Dữ liệu sẽ bị xóa vĩnh viễn khỏi Supabase và không thể khôi phục.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 py-2.5 border border-slate-600 rounded-xl text-sm text-slate-300 hover:bg-slate-700 transition font-medium disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {deleting ? (
              <><RefreshCw size={14} className="animate-spin" />Đang xóa...</>
            ) : (
              <><Trash2 size={14} />Xóa {count} bản ghi</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Component chính: CleanupTab
// ──────────────────────────────────────────────────────
export function CleanupTab() {
  const [selectedType, setSelectedType] = useState<DataType | "">("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Hiển thị toast thông báo tạm thời
  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  // Lấy cấu hình option đang chọn
  const currentOption = DATA_OPTIONS.find((o) => o.value === selectedType) ?? null;

  // Tải dữ liệu từ Supabase khi thay đổi bộ lọc
  const fetchData = useCallback(async (type: DataType) => {
    setLoading(true);
    setPage(1);
    const { data, error } = await Promise.resolve(
      supabase.from(type).select("*").order("created_at", { ascending: false })
    );
    if (error) {
      showToast("error", "Lỗi tải dữ liệu: " + error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as Record<string, unknown>[]);
    }
    setLoading(false);
  }, []);

  // Khi thay đổi bộ lọc
  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as DataType | "";
    setSelectedType(val);
    setRows([]);
    if (val) fetchData(val);
  };

  // Reload khi cần
  const handleRefresh = () => {
    if (selectedType) fetchData(selectedType as DataType);
  };

  // Phân trang
  const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  const pagedRows = rows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Xóa toàn bộ dữ liệu đã lọc
  const handleDelete = async () => {
    if (!currentOption) return;
    setDeleting(true);

    // Lấy danh sách id của tất cả bản ghi đã tải về
    const ids = rows.map((r) => r.id as string).filter(Boolean);

    let errorMsg: string | null = null;

    if (ids.length > 0) {
      // Xóa theo id để đảm bảo chỉ xóa đúng các bản ghi đã hiển thị
      const { error } = await Promise.resolve(
        supabase.from(currentOption.table).delete().in("id", ids)
      );
      if (error) errorMsg = error.message;
    }

    setDeleting(false);
    setShowModal(false);

    if (errorMsg) {
      showToast("error", "Lỗi xóa: " + errorMsg);
    } else {
      showToast("success", `Đã xóa ${rows.length} bản ghi thành công.`);
      setRows([]);
      setPage(1);
    }
  };

  // Nút dọn dẹp chỉ active khi có dữ liệu
  const cleanupEnabled = !!selectedType && rows.length > 0 && !loading;

  return (
    <div className="min-h-full bg-[#0f1117] text-slate-200 rounded-2xl p-4 sm:p-6 space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all duration-300 ${
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Trash2 size={20} className="text-red-400" />
            Dọn dẹp dữ liệu
          </h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Xóa vĩnh viễn các bản ghi không cần thiết khỏi hệ thống.
          </p>
        </div>
      </div>

      {/* Toolbar: bộ lọc + nút hành động */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Bộ lọc select */}
        <div className="relative flex-1">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            value={selectedType}
            onChange={handleTypeChange}
            className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-[#1e2130] border border-slate-700 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition appearance-none cursor-pointer"
          >
            <option value="">-- Chọn loại dữ liệu --</option>
            {DATA_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Nút làm mới */}
        {selectedType && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Tải lại
          </button>
        )}

        {/* Nút dọn dẹp */}
        <button
          onClick={() => setShowModal(true)}
          disabled={!cleanupEnabled}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white text-sm font-semibold transition hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
        >
          <Trash2 size={14} />
          Dọn dẹp {rows.length > 0 ? `(${rows.length})` : ""}
        </button>
      </div>

      {/* Bảng dữ liệu */}
      {loading ? (
        <div className="flex items-center justify-center h-48 gap-2 text-slate-400 text-sm">
          <RefreshCw size={16} className="animate-spin" />
          Đang tải dữ liệu...
        </div>
      ) : !selectedType ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-sm gap-2">
          <Filter size={32} className="opacity-30" />
          <p>Chọn loại dữ liệu để xem và quản lý bản ghi.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-sm gap-2">
          <Trash2 size={32} className="opacity-30" />
          <p>Không có bản ghi nào. Dữ liệu đã sạch!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Thông tin tổng */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Hiển thị{" "}
              <span className="text-white font-semibold">{(page - 1) * ITEMS_PER_PAGE + 1}</span>–
              <span className="text-white font-semibold">
                {Math.min(page * ITEMS_PER_PAGE, rows.length)}
              </span>{" "}
              / <span className="text-white font-semibold">{rows.length}</span> bản ghi
            </span>
            <span className="text-slate-500">
              Trang {page}/{totalPages}
            </span>
          </div>

          {/* Bảng */}
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1e2130] border-b border-slate-700">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 w-8">#</th>
                  {currentOption?.columns.map((col) => (
                    <th key={col} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, idx) => {
                  const cells = currentOption?.renderRow(row) ?? [];
                  return (
                    <tr
                      key={String(row.id ?? idx)}
                      className="border-b border-slate-800 hover:bg-slate-800/50 transition"
                    >
                      <td className="px-3 py-2.5 text-slate-500 text-xs">
                        {(page - 1) * ITEMS_PER_PAGE + idx + 1}
                      </td>
                      {cells.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2.5 text-slate-300 whitespace-nowrap text-xs">
                          {cell ?? "—"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition disabled:opacity-30"
              >
                <ChevronLeft size={14} /> Trước
              </button>

              {/* Số trang */}
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "..." ? (
                      <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-slate-500 text-xs">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={`w-7 h-7 rounded-lg text-xs font-medium transition ${
                          page === p
                            ? "bg-primary text-white"
                            : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition disabled:opacity-30"
              >
                Tiếp <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal xác nhận xóa */}
      {showModal && currentOption && (
        <ConfirmModal
          count={rows.length}
          label={currentOption.label}
          onConfirm={handleDelete}
          onCancel={() => setShowModal(false)}
          deleting={deleting}
        />
      )}
    </div>
  );
}
