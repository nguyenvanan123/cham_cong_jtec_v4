import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { AttendanceRecord } from "@/lib/supabase";
import { Link } from "wouter";
import { Search, Camera, CheckCircle, AlertTriangle, XCircle, ArrowLeft, Phone } from "lucide-react";

function today() {
  return new Date().toISOString().split("T")[0];
}

type Status = "complete" | "missing-out" | "missing-in" | "none";

export default function TraCuu() {
  const [employeeId, setEmployeeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: Status; records: AttendanceRecord[] } | null>(null);
  const [zaloAdminLink, setZaloAdminLink] = useState("");

  useEffect(() => {
    supabase.from("configs").select("key,value").eq("key", "zalo_admin_link").single()
      .then(({ data }) => { if (data?.value) setZaloAdminLink(data.value); });
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId.trim() || !fullName.trim()) return;
    setLoading(true);
    setResult(null);

    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", employeeId.trim())
      .eq("work_date", today())
      .order("created_at", { ascending: true });

    const records = (data || []) as AttendanceRecord[];
    const hasIn = records.some(r => r.action_type === "check-in");
    const hasOut = records.some(r => r.action_type === "check-out");

    let status: Status = "none";
    if (hasIn && hasOut) status = "complete";
    else if (hasIn && !hasOut) status = "missing-out";
    else if (!hasIn && hasOut) status = "missing-in";

    setResult({ status, records });
    setLoading(false);
  };

  const statusConfig = {
    complete: {
      bg: "from-green-50 to-emerald-50",
      border: "border-green-200",
      icon: <CheckCircle size={48} className="text-green-500" />,
      title: "Hoàn thành!",
      desc: "Bạn đã chấm công đầy đủ hôm nay.",
      color: "text-green-700",
      badge: "bg-green-100 text-green-700",
    },
    "missing-out": {
      bg: "from-amber-50 to-yellow-50",
      border: "border-amber-200",
      icon: <AlertTriangle size={48} className="text-amber-500" />,
      title: "Thiếu Check-out",
      desc: "Bạn đã Check-in nhưng chưa Check-out.",
      color: "text-amber-700",
      badge: "bg-amber-100 text-amber-700",
    },
    "missing-in": {
      bg: "from-amber-50 to-yellow-50",
      border: "border-amber-200",
      icon: <AlertTriangle size={48} className="text-amber-500" />,
      title: "Thiếu Check-in",
      desc: "Có Check-out nhưng chưa có Check-in.",
      color: "text-amber-700",
      badge: "bg-amber-100 text-amber-700",
    },
    none: {
      bg: "from-red-50 to-rose-50",
      border: "border-red-200",
      icon: <XCircle size={48} className="text-red-500" />,
      title: "Chưa chấm công",
      desc: "Không có dữ liệu chấm công hôm nay.",
      color: "text-red-700",
      badge: "bg-red-100 text-red-700",
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <header className="bg-white/80 backdrop-blur-md border-b border-indigo-100 sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ArrowLeft size={18} className="text-muted-foreground flex-shrink-0" />
            <span className="font-bold text-foreground text-base sm:text-lg truncate">Tra Cứu</span>
          </div>
          <nav className="flex gap-0.5 sm:gap-1 flex-shrink-0">
            <Link
              href="/"
              className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors whitespace-nowrap"
            >
              <Camera size={13} />
              <span>Chấm công</span>
            </Link>
            {zaloAdminLink ? (
              <a
                href={zaloAdminLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-lg text-blue-600 hover:bg-blue-50 font-medium transition-colors whitespace-nowrap"
              >
                <Phone size={13} />
                <span>Liên hệ</span>
              </a>
            ) : (
              <span className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-lg text-muted-foreground/50 cursor-default select-none whitespace-nowrap">
                <Phone size={13} />
                <span className="hidden sm:inline">Liên hệ</span>
              </span>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Tra cứu chấm công</h1>
          <p className="text-muted-foreground text-sm">Kiểm tra trạng thái hôm nay của bạn</p>
        </div>

        <form onSubmit={handleSearch} className="bg-white rounded-2xl shadow-sm border border-border p-5 space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Mã nhân viên</label>
            <input
              data-testid="input-search-id"
              type="text"
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              placeholder="VD: NV001"
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Họ và tên</label>
            <input
              data-testid="input-search-name"
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="VD: Nguyễn Văn A"
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
            />
          </div>
          <button
            type="submit"
            data-testid="btn-search"
            disabled={loading}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60"
          >
            <Search size={16} />
            {loading ? "Đang tìm..." : "Tra cứu"}
          </button>
        </form>

        {result && (
          <div className={`bg-gradient-to-br ${statusConfig[result.status].bg} rounded-2xl border ${statusConfig[result.status].border} p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500`}>
            <div className="flex justify-center mb-4">
              {statusConfig[result.status].icon}
            </div>
            <h3 className={`text-xl font-bold ${statusConfig[result.status].color} mb-1`}>
              {statusConfig[result.status].title}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">{statusConfig[result.status].desc}</p>

            {result.records.length > 0 && (
              <div className="space-y-2 text-left mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chi tiết hôm nay</p>
                {result.records.map((r) => (
                  <div
                    key={r.id}
                    data-testid={`record-${r.id}`}
                    className="flex items-center justify-between bg-white/70 rounded-xl px-3 py-2"
                  >
                    <div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusConfig[result.status].badge}`}>
                        {r.action_type === "check-in" ? "Check-in" : "Check-out"}
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.shift}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
