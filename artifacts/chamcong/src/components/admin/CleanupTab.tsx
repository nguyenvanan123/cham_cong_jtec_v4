import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  Trash2, ChevronLeft, ChevronRight, AlertTriangle,
  RefreshCw, Filter, ShieldAlert, X, CalendarRange, Search,
  CheckSquare, Square, MinusSquare
} from "lucide-react";

// ──────────────────────────────────────────────────────
// Kiểu dữ liệu
// ──────────────────────────────────────────────────────
type DataType = "attendance" | "shifts" | "job_applications" | "reconciliations";

type DataOption = {
  value: DataType;
  label: string;
  table: string;
  dateField: string;
  columns: string[];
  renderRow: (row: Record<string, unknown>) => React.ReactNode[];
};

const DATA_OPTIONS: DataOption[] = [
  {
    value: "attendance",
    label: "Dữ liệu chấm công",
    table: "attendance",
    dateField: "created_at",
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
    dateField: "created_at",
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
    label: "Quản lý ứng tuyển",
    table: "job_applications",
    dateField: "created_at",
    columns: ["Họ tên", "SĐT", "Người giới thiệu", "Trạng thái", "Ngày gửi"],
    renderRow: (r) => [
      r.full_name as string,
      r.phone as string,
      (r.referrer_name as string) || "—",
      r.status as string,
      r.created_at ? new Date(r.created_at as string).toLocaleString("vi-VN") : "-",
    ],
  },
  {
    value: "reconciliations",
    label: "Đối soát",
    table: "reconciliations",
    dateField: "created_at",
    columns: ["Mã NV", "Họ tên", "Ngày làm", "Ca", "Tổng lương", "Ngày tạo"],
    renderRow: (r) => [
      r.employee_id as string,
      r.full_name as string,
      r.work_date as string,
      r.shift_name as string,
      `${(r.total_wage as number)?.toLocaleString("vi-VN")} ₫`,
      r.created_at ? new Date(r.created_at as string).toLocaleString("vi-VN") : "-",
    ],
  },
];

const ITEMS_PER_PAGE = 15;

// ──────────────────────────────────────────────────────
// Checkbox tùy chỉnh
// ──────────────────────────────────────────────────────
function Checkbox({
  checked,
  indeterminate = false,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  if (indeterminate) {
    return (
      <button type="button" onClick={onChange} className="text-primary hover:opacity-70 transition flex-shrink-0">
        <MinusSquare size={16} />
      </button>
    );
  }
  return (
    <button type="button" onClick={onChange} className={`transition flex-shrink-0 ${checked ? "text-primary hover:opacity-70" : "text-muted-foreground hover:text-primary"}`}>
      {checked ? <CheckSquare size={16} /> : <Square size={16} />}
    </button>
  );
}

// ──────────────────────────────────────────────────────
// Modal xác nhận xóa
// ──────────────────────────────────────────────────────
function ConfirmModal({
  count,
  total,
  label,
  dateFrom,
  dateTo,
  isPartial,
  onConfirm,
  onCancel,
  deleting,
}: {
  count: number;
  total: number;
  label: string;
  dateFrom: string;
  dateTo: string;
  isPartial: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-red-600 to-rose-600 px-5 pt-5 pb-4 flex items-start gap-3 relative">
          <button onClick={onCancel} disabled={deleting}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition">
            <X size={14} className="text-white" />
          </button>
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShieldAlert size={22} className="text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold text-base leading-tight">Xác nhận xóa dữ liệu</h3>
            <p className="text-red-100 text-xs mt-0.5">Hành động này không thể hoàn tác</p>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          <p className="text-foreground text-sm leading-relaxed">
            Bạn có chắc muốn xóa{" "}
            <span className="font-bold text-red-600 text-base">{count}</span>{" "}
            {isPartial && <span className="text-muted-foreground">(/{total})</span>}{" "}
            bản ghi đã chọn thuộc mục{" "}
            <span className="font-semibold">"{label}"</span>?
          </p>

          {(dateFrom || dateTo) && (
            <div className="bg-muted border border-border rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarRange size={13} className="flex-shrink-0" />
              <span>
                Khoảng ngày:{" "}
                <span className="text-foreground font-medium">{dateFrom || "đầu"}</span>
                {" → "}
                <span className="text-foreground font-medium">{dateTo || "cuối"}</span>
              </span>
            </div>
          )}

          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-red-600 text-xs">
              Dữ liệu sẽ bị xóa vĩnh viễn khỏi Supabase và không thể khôi phục.
            </p>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onCancel} disabled={deleting}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition font-medium disabled:opacity-50">
            Hủy
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2">
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);

  // Checkbox selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const currentOption = DATA_OPTIONS.find((o) => o.value === selectedType) ?? null;

  // ── Dữ liệu phân trang ──
  const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  const pagedRows = useMemo(
    () => rows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
    [rows, page]
  );

  // Ids của trang hiện tại
  const pageIds = useMemo(
    () => pagedRows.map((r) => r.id as string).filter(Boolean),
    [pagedRows]
  );

  // Trạng thái checkbox header của trang hiện tại
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id)) && !allPageSelected;

  // ── Fetch ──
  const fetchData = useCallback(async (type: DataType, from: string, to: string) => {
    setLoading(true);
    setPage(1);
    setSelectedIds(new Set()); // reset selection khi tìm kiếm mới

    const option = DATA_OPTIONS.find((o) => o.value === type);
    if (!option) { setLoading(false); return; }

    let query = supabase
      .from(option.table)
      .select("*")
      .order(option.dateField, { ascending: false });

    if (from) query = query.gte(option.dateField, `${from}T00:00:00`);
    if (to)   query = query.lte(option.dateField, `${to}T23:59:59`);

    const { data, error } = await Promise.resolve(query);
    if (error) {
      showToast("error", "Lỗi tải dữ liệu: " + error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as Record<string, unknown>[]);
    }
    setSearched(true);
    setLoading(false);
  }, []);

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as DataType | "";
    setSelectedType(val);
    setRows([]);
    setSearched(false);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleSearch = () => {
    if (!selectedType) return;
    fetchData(selectedType as DataType, dateFrom, dateTo);
  };

  const handleClearDates = () => {
    setDateFrom("");
    setDateTo("");
    setRows([]);
    setSearched(false);
    setPage(1);
    setSelectedIds(new Set());
  };

  // ── Toggle checkbox ──
  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle tất cả bản ghi trên trang hiện tại
  const togglePage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Chọn tất cả trong toàn bộ kết quả tìm kiếm
  const selectAll = () => {
    const allIds = rows.map((r) => r.id as string).filter(Boolean);
    setSelectedIds(new Set(allIds));
  };

  // Bỏ chọn tất cả
  const clearSelection = () => setSelectedIds(new Set());

  // ── Xóa ──
  // Nếu có checkbox được chọn → xóa những cái đã chọn; không thì xóa tất cả kết quả
  const targetIds = selectedIds.size > 0
    ? Array.from(selectedIds)
    : rows.map((r) => r.id as string).filter(Boolean);

  const isPartialDelete = selectedIds.size > 0;

  const handleDelete = async () => {
    if (!currentOption || targetIds.length === 0) return;
    setDeleting(true);

    const { error } = await Promise.resolve(
      supabase.from(currentOption.table).delete().in("id", targetIds)
    );

    setDeleting(false);
    setShowModal(false);

    if (error) {
      showToast("error", "Lỗi xóa: " + error.message);
    } else {
      const deletedCount = targetIds.length;
      showToast("success", `Đã xóa ${deletedCount} bản ghi thành công.`);

      // Cập nhật lại danh sách mà không cần fetch lại
      const deletedSet = new Set(targetIds);
      setRows((prev) => prev.filter((r) => !deletedSet.has(r.id as string)));
      setSelectedIds(new Set());
      setPage(1);
    }
  };

  const cleanupEnabled = rows.length > 0 && !loading;
  const hasDateFilter = !!dateFrom || !!dateTo;
  const deleteLabel = isPartialDelete
    ? `Xóa đã chọn (${selectedIds.size})`
    : `Dọn dẹp tất cả (${rows.length})`;

  // Banner "chọn tất cả" — hiện khi toàn bộ trang hiện tại đã tick nhưng còn trang khác
  const showSelectAllBanner =
    allPageSelected && rows.length > ITEMS_PER_PAGE && selectedIds.size < rows.length;

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all duration-300 ${
          toast.type === "success" ? "bg-green-500" : "bg-destructive"
        }`}>
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Trash2 size={18} className="text-destructive" />
          Dọn dẹp dữ liệu
        </h2>
        <p className="text-muted-foreground text-sm mt-0.5">
          Lọc theo loại và khoảng ngày, chọn từng bản ghi hoặc tất cả, sau đó xóa vĩnh viễn.
        </p>
      </div>

      {/* Khung bộ lọc */}
      <div className="bg-white rounded-2xl border border-border p-4 shadow-sm space-y-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Filter size={12} /> Bộ lọc
        </p>

        {/* Chọn loại dữ liệu */}
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <select
            value={selectedType}
            onChange={handleTypeChange}
            className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition appearance-none cursor-pointer"
          >
            <option value="">-- Chọn loại dữ liệu --</option>
            {DATA_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Lọc ngày từ — đến */}
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <CalendarRange size={12} /> Từ ngày
            </label>
            <input type="date" value={dateFrom} max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
          </div>

          <div className="hidden sm:flex items-center pb-2.5 text-muted-foreground text-sm">→</div>

          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <CalendarRange size={12} /> Đến ngày
            </label>
            <input type="date" value={dateTo} min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition" />
          </div>

          {hasDateFilter && (
            <button onClick={handleClearDates}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-muted text-xs transition flex-shrink-0">
              <X size={13} /> Xóa lọc
            </button>
          )}
        </div>

        {/* Nút hành động */}
        <div className="flex gap-3 pt-1">
          <button onClick={handleSearch} disabled={!selectedType || loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed">
            {loading
              ? <><RefreshCw size={14} className="animate-spin" />Đang tải...</>
              : <><Search size={14} />Tìm kiếm</>}
          </button>

          <button onClick={() => setShowModal(true)} disabled={!cleanupEnabled}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:opacity-90 transition disabled:opacity-30 disabled:cursor-not-allowed">
            <Trash2 size={14} />
            {deleteLabel}
          </button>
        </div>
      </div>

      {/* Kết quả */}
      {loading ? (
        <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground text-sm">
          <RefreshCw size={16} className="animate-spin" />Đang tải dữ liệu...
        </div>
      ) : !searched ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
          <Search size={32} className="opacity-20" />
          <p>Chọn bộ lọc rồi bấm <span className="text-foreground font-medium">Tìm kiếm</span> để xem dữ liệu.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
          <Trash2 size={32} className="opacity-20" />
          <p>Không có bản ghi nào phù hợp. Dữ liệu đã sạch!</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          {/* Thanh thông tin + lựa chọn nhanh */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/30 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Hiển thị{" "}
              <span className="text-foreground font-semibold">{(page - 1) * ITEMS_PER_PAGE + 1}</span>–
              <span className="text-foreground font-semibold">{Math.min(page * ITEMS_PER_PAGE, rows.length)}</span>
              {" "}/ <span className="text-foreground font-semibold">{rows.length}</span> bản ghi
              {hasDateFilter && (
                <span className="ml-1.5 text-amber-600">({dateFrom || "đầu"} → {dateTo || "cuối"})</span>
              )}
            </span>

            {/* Nhanh: chọn/bỏ chọn tất cả */}
            <div className="flex items-center gap-2 text-xs">
              {selectedIds.size > 0 ? (
                <>
                  <span className="text-primary font-semibold">{selectedIds.size} đã chọn</span>
                  <span className="text-muted-foreground">·</span>
                  <button onClick={selectAll} className="text-primary hover:underline font-medium">
                    Chọn tất cả {rows.length}
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button onClick={clearSelection} className="text-muted-foreground hover:text-foreground hover:underline">
                    Bỏ chọn
                  </button>
                </>
              ) : (
                <button onClick={selectAll} className="text-primary hover:underline font-medium">
                  Chọn tất cả {rows.length}
                </button>
              )}
            </div>
          </div>

          {/* Banner chọn toàn bộ kết quả (giống Gmail) */}
          {showSelectAllBanner && (
            <div className="bg-primary/5 border-b border-primary/20 px-4 py-2 text-xs text-center text-primary">
              Đã chọn {selectedIds.size} bản ghi trên trang này.{" "}
              <button onClick={selectAll} className="font-semibold underline">
                Chọn tất cả {rows.length} bản ghi trong kết quả
              </button>
            </div>
          )}

          {/* Bảng */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {/* Header checkbox: chọn/bỏ chọn tất cả trang hiện tại */}
                  <th className="px-3 py-2.5 w-10">
                    <Checkbox
                      checked={allPageSelected}
                      indeterminate={somePageSelected}
                      onChange={togglePage}
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-8">#</th>
                  {currentOption?.columns.map((col) => (
                    <th key={col} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, idx) => {
                  const id = row.id as string;
                  const isSelected = selectedIds.has(id);
                  const cells = currentOption?.renderRow(row) ?? [];
                  return (
                    <tr
                      key={id ?? idx}
                      onClick={() => id && toggleRow(id)}
                      className={`border-b border-border last:border-0 cursor-pointer transition ${
                        isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"
                      }`}
                    >
                      {/* Checkbox từng hàng */}
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => id && toggleRow(id)}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">
                        {(page - 1) * ITEMS_PER_PAGE + idx + 1}
                      </td>
                      {cells.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2.5 text-foreground whitespace-nowrap text-xs">
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
            <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-border">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground text-xs transition disabled:opacity-30">
                <ChevronLeft size={14} /> Trước
              </button>

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
                      <span key={`e-${i}`} className="px-2 py-1.5 text-muted-foreground text-xs">…</span>
                    ) : (
                      <button key={p} onClick={() => setPage(p as number)}
                        className={`w-7 h-7 rounded-lg text-xs font-medium transition ${
                          page === p
                            ? "bg-primary text-primary-foreground"
                            : "border border-border hover:bg-muted text-muted-foreground"
                        }`}>
                        {p}
                      </button>
                    )
                  )}
              </div>

              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground text-xs transition disabled:opacity-30">
                Tiếp <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal xác nhận xóa */}
      {showModal && currentOption && (
        <ConfirmModal
          count={targetIds.length}
          total={rows.length}
          label={currentOption.label}
          dateFrom={dateFrom}
          dateTo={dateTo}
          isPartial={isPartialDelete}
          onConfirm={handleDelete}
          onCancel={() => setShowModal(false)}
          deleting={deleting}
        />
      )}
    </div>
  );
}
