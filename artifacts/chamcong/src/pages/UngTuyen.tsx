import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Link } from "wouter";
import {
  ArrowLeft, Upload, CheckCircle, RefreshCw, Send,
  User, CreditCard, Banknote, Users, ImagePlus, X, Phone
} from "lucide-react";

const SQL_FIX = `-- Chạy trong Supabase SQL Editor để sửa lỗi upload/lưu đơn:

-- 1. Thêm cột mới vào bảng job_applications
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS referrer_bank_account TEXT DEFAULT '';
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS referrer_bank_name TEXT DEFAULT '';

-- 2. Tắt RLS cho bảng job_applications
ALTER TABLE job_applications DISABLE ROW LEVEL SECURITY;

-- 3. Cho phép upload ảnh vào bucket application_docs
-- (Không thể tắt RLS storage, phải tạo policy)
CREATE POLICY "allow_anon_upload" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'application_docs');

CREATE POLICY "allow_anon_select" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'application_docs');`;

function ImageUploadBox({
  label, file, onChange, preview, onClear
}: {
  label: string;
  file: File | null;
  onChange: (f: File) => void;
  preview: string | null;
  onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">{label}</label>
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-border aspect-video bg-muted">
          <img src={preview} alt={label} className="w-full h-full object-contain" />
          <button
            type="button"
            onClick={onClear}
            className="absolute top-2 right-2 w-7 h-7 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition"
          >
            <X size={14} className="text-white" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="w-full aspect-video rounded-xl border-2 border-dashed border-primary/30 hover:border-primary/60 bg-accent/30 hover:bg-accent/50 flex flex-col items-center justify-center gap-2 transition group"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition">
            <ImagePlus size={20} className="text-primary" />
          </div>
          <span className="text-sm text-muted-foreground">Bấm để chọn ảnh</span>
          <span className="text-xs text-muted-foreground/60">JPG, PNG, HEIC</span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
        }}
      />
    </div>
  );
}

export default function UngTuyen() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [referrerName, setReferrerName] = useState("");
  const [referrerId, setReferrerId] = useState("");
  const [referrerBankAccount, setReferrerBankAccount] = useState("");
  const [referrerBankName, setReferrerBankName] = useState("");
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Cooldown 5 giây để chống spam form
  const [submitCooldown, setSubmitCooldown] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [showSql, setShowSql] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [affiliateStatus, setAffiliateStatus] = useState("off");
  const [affiliateShowPopup, setAffiliateShowPopup] = useState("on");
  const [shopeeLink, setShopeeLink] = useState("");
  const [shopeeDelay, setShopeeDelay] = useState(3);

  useEffect(() => {
    supabase.from("configs").select("key,value")
      .in("key", ["ung_tuyen_affiliate_status", "ung_tuyen_affiliate_show_popup", "ung_tuyen_shopee_link", "ung_tuyen_shopee_delay"])
      .then(({ data }) => {
        if (!data) return;
        const get = (key: string) => (data as { key: string; value: string }[]).find(d => d.key === key)?.value ?? "";
        setAffiliateStatus(get("ung_tuyen_affiliate_status") || "off");
        setAffiliateShowPopup(get("ung_tuyen_affiliate_show_popup") || "on");
        setShopeeLink(get("ung_tuyen_shopee_link"));
        setShopeeDelay(parseInt(get("ung_tuyen_shopee_delay") || "3", 10) || 3);
      });
  }, []);

  const handleFront = (f: File) => { setFrontFile(f); setFrontPreview(URL.createObjectURL(f)); };
  const handleBack = (f: File) => { setBackFile(f); setBackPreview(URL.createObjectURL(f)); };
  const clearFront = () => { setFrontFile(null); setFrontPreview(null); };
  const clearBack = () => { setBackFile(null); setBackPreview(null); };

  // Regex kiểm tra số điện thoại Việt Nam (đầu số 03x, 05x, 07x, 08x, 09x)
  const VN_PHONE_REGEX = /^(0[3|5|7|8|9])+([0-9]{8})$/;
  // Regex kiểm tra số tài khoản ngân hàng (chỉ chứa số)
  const BANK_ACCOUNT_REGEX = /^[0-9]+$/;
  // Hàm loại bỏ thẻ HTML để chống XSS
  const sanitize = (str: string) => str.replace(/<[^>]*>/g, "").replace(/[<>"'`]/g, "").trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Ngăn chặn spam: nếu đang trong cooldown hoặc đang submit thì bỏ qua
    if (submitting || submitCooldown) return;
    setError("");
    setShowSql(false);

    // Xác thực + làm sạch dữ liệu đầu vào
    const cleanFullName = sanitize(fullName);
    const cleanPhone = sanitize(phone);
    const cleanReferrerName = sanitize(referrerName);
    const cleanReferrerId = sanitize(referrerId);
    const cleanReferrerBankAccount = sanitize(referrerBankAccount);
    const cleanReferrerBankName = sanitize(referrerBankName);

    if (!cleanFullName) { setError("Vui lòng nhập họ tên."); return; }
    if (!cleanPhone) { setError("Vui lòng nhập số điện thoại."); return; }
    if (!VN_PHONE_REGEX.test(cleanPhone)) {
      setError("Số điện thoại không đúng định dạng Việt Nam (VD: 0901234567).");
      return;
    }
    if (cleanReferrerBankAccount && !BANK_ACCOUNT_REGEX.test(cleanReferrerBankAccount)) {
      setError("Số tài khoản ngân hàng chỉ được chứa chữ số.");
      return;
    }
    if (!frontFile || !backFile) { setError("Vui lòng chọn cả 2 mặt CCCD."); return; }

    setSubmitting(true);

    const frontName = `${Date.now()}_front_${frontFile.name}`;
    const { error: frontErr } = await supabase.storage
      .from("application_docs")
      .upload(frontName, frontFile, { contentType: frontFile.type });
    if (frontErr) {
      setError(`[Storage - ảnh trước] ${frontErr.message}`);
      setShowSql(true);
      setSubmitting(false);
      return;
    }

    const backName = `${Date.now()}_back_${backFile.name}`;
    const { error: backErr } = await supabase.storage
      .from("application_docs")
      .upload(backName, backFile, { contentType: backFile.type });
    if (backErr) {
      setError(`[Storage - ảnh sau] ${backErr.message}`);
      setShowSql(true);
      setSubmitting(false);
      return;
    }

    const { error: insertErr } = await Promise.resolve(
      supabase.from("job_applications").insert({
        full_name: cleanFullName,
        phone: cleanPhone,
        referrer_name: cleanReferrerName,
        referrer_id: cleanReferrerId,
        referrer_bank_account: cleanReferrerBankAccount,
        referrer_bank_name: cleanReferrerBankName,
        bank_account: "",
        cccd_front_url: frontName,
        cccd_back_url: backName,
        status: "pending",
      })
    );

    if (insertErr) {
      setError(`[DB Insert] ${insertErr.message}`);
      setShowSql(true);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSuccess(true);

    // Kích hoạt cooldown 5 giây chống spam sau khi submit thành công
    setSubmitCooldown(true);
    setTimeout(() => setSubmitCooldown(false), 5000);

    if (shopeeLink && affiliateStatus === "on") {
      if (affiliateShowPopup === "on") {
        let remaining = shopeeDelay;
        setRedirectCountdown(remaining);
        const timer = setInterval(() => {
          remaining -= 1;
          setRedirectCountdown(remaining);
          if (remaining <= 0) {
            clearInterval(timer);
            window.location.href = shopeeLink;
          }
        }, 1000);
      } else {
        setTimeout(() => { window.location.href = shopeeLink; }, shopeeDelay * 1000);
      }
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm space-y-5">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto animate-in zoom-in duration-500">
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Gửi thành công!</h2>
            <p className="text-muted-foreground text-sm">
              Hồ sơ ứng tuyển của bạn đã được ghi nhận. Chúng tôi sẽ liên hệ sớm nhất.
            </p>
          </div>
          {redirectCountdown !== null && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
              <p className="text-sm font-semibold text-amber-800">Trong khi chờ đợi...</p>
              <p className="text-xs text-amber-700">
                Chuyển đến trang ưu đãi trong <strong>{redirectCountdown}</strong> giây
              </p>
              <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-1000"
                  style={{ width: `${((shopeeDelay - redirectCountdown) / shopeeDelay) * 100}%` }}
                />
              </div>
              <button
                type="button"
                onClick={() => { setRedirectCountdown(null); window.location.href = shopeeLink; }}
                className="text-xs text-amber-600 underline"
              >
                Chuyển ngay
              </button>
            </div>
          )}
          <Link href="/" className="inline-block px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition">
            Về trang chủ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-purple-50">
      <header className="bg-white/80 backdrop-blur-md border-b border-violet-100 sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3">
          <Link href="/" className="p-2 rounded-xl hover:bg-muted transition text-muted-foreground flex-shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="font-bold text-foreground text-sm sm:text-base leading-tight truncate">Đơn ứng tuyển</h1>
            <p className="text-xs text-muted-foreground truncate">Điền đầy đủ thông tin bên dưới</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 sm:px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Thông tin cá nhân */}
          <div className="bg-white rounded-2xl shadow-sm border border-border p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <User size={16} className="text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Thông tin cá nhân</h2>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Họ và tên *</label>
              <input
                data-testid="input-full-name"
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Số điện thoại *</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  data-testid="input-phone"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="VD: 0901234567"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                />
              </div>
            </div>
          </div>

          {/* Người giới thiệu */}
          <div className="bg-white rounded-2xl shadow-sm border border-border p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Người giới thiệu <span className="text-muted-foreground font-normal">(nếu có)</span></h2>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tên người giới thiệu</label>
              <input
                data-testid="input-referrer-name"
                type="text"
                value={referrerName}
                onChange={e => setReferrerName(e.target.value)}
                placeholder="Tên NV giới thiệu"
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Mã NV người giới thiệu</label>
              <input
                data-testid="input-referrer-id"
                type="text"
                value={referrerId}
                onChange={e => setReferrerId(e.target.value)}
                placeholder="VD: NV001"
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">STK ngân hàng người giới thiệu</label>
              <div className="relative">
                <Banknote size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  data-testid="input-referrer-bank"
                  type="text"
                  value={referrerBankAccount}
                  onChange={e => setReferrerBankAccount(e.target.value)}
                  placeholder="VD: 0123456789"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tên ngân hàng người giới thiệu</label>
              <div className="relative">
                <Banknote size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  data-testid="input-referrer-bank-name"
                  type="text"
                  value={referrerBankName}
                  onChange={e => setReferrerBankName(e.target.value)}
                  placeholder="VD: Vietcombank, Techcombank..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                />
              </div>
            </div>
          </div>

          {/* Upload CCCD */}
          <div className="bg-white rounded-2xl shadow-sm border border-border p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard size={16} className="text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Ảnh CCCD / CMND *</h2>
            </div>
            <ImageUploadBox label="Mặt trước" file={frontFile} onChange={handleFront} preview={frontPreview} onClear={clearFront} />
            <ImageUploadBox label="Mặt sau" file={backFile} onChange={handleBack} preview={backPreview} onClear={clearBack} />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-2">
              <p className="text-red-600 text-sm font-medium">❌ {error}</p>
              {showSql && (
                <>
                  <p className="text-xs text-red-500">Chạy SQL sau trong Supabase SQL Editor để sửa:</p>
                  <pre className="bg-white border border-red-200 rounded-lg p-3 text-xs text-red-900 overflow-x-auto whitespace-pre-wrap">{SQL_FIX}</pre>
                </>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            data-testid="btn-submit"
            disabled={submitting || submitCooldown}
            className="w-full py-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-2xl font-bold text-base shadow-md hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><RefreshCw size={18} className="animate-spin" />Đang gửi hồ sơ...</>
            ) : submitCooldown ? (
              <><RefreshCw size={18} className="animate-spin" />Vui lòng chờ...</>
            ) : (
              <><Send size={18} />Nộp đơn ứng tuyển</>
            )}
          </button>

          <p className="text-center text-xs text-muted-foreground px-4">
            Thông tin của bạn được bảo mật và chỉ dùng cho mục đích tuyển dụng.
          </p>
        </form>
      </main>
    </div>
  );
}
