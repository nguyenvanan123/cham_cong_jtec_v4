import { useState, useEffect, useCallback, useRef } from "react";
import imageCompression from "browser-image-compression";
import { supabase } from "@/lib/supabase";
import type { AttendanceRecord, Config, Shift } from "@/lib/supabase";
import { Link } from "wouter";
import {
  Camera, Send, CheckCircle, XCircle, AlertCircle,
  Search, Megaphone, X as XIcon,
  Upload, ImagePlus, Loader2, CheckCheck, Phone,
  Video, Play, Clock, CalendarCheck, UserCheck
} from "lucide-react";

const STORAGE_KEY = "chamcong_last_employee";

function getCompressOptions() {
  const conn = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number } }).connection;
  const effectiveType = conn?.effectiveType;
  if (effectiveType === "slow-2g" || effectiveType === "2g") {
    return { maxSizeMB: 0.15, maxWidthOrHeight: 800, useWebWorker: true, fileType: "image/jpeg" as const, initialQuality: 0.65 };
  }
  if (effectiveType === "3g") {
    return { maxSizeMB: 0.2, maxWidthOrHeight: 1024, useWebWorker: true, fileType: "image/jpeg" as const, initialQuality: 0.75 };
  }
  return { maxSizeMB: 0.3, maxWidthOrHeight: 1280, useWebWorker: true, fileType: "image/jpeg" as const, initialQuality: 0.85 };
}

async function retryUpload<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  onRetry?: (attempt: number) => void
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        onRetry?.(attempt);
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** (attempt - 1), 8000)));
      }
    }
  }
  throw lastError;
}

async function compressVideo(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const supported =
      typeof window !== "undefined" &&
      window.MediaRecorder &&
      (MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ||
        MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ||
        MediaRecorder.isTypeSupported("video/webm"));
    if (!supported) { resolve(file); return; }

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const src = URL.createObjectURL(file);
    video.src = src;

    video.onloadedmetadata = () => {
      try {
        const maxDim = 720;
        const vw = video.videoWidth || maxDim;
        const vh = video.videoHeight || maxDim;
        const scale = Math.min(1, maxDim / Math.max(vw, vh));
        const w = Math.max(2, Math.round(vw * scale));
        const h = Math.max(2, Math.round(vh * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        const stream = canvas.captureStream(24);

        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
          ? "video/webm;codecs=vp8"
          : "video/webm";

        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 800_000 });
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

        let animFrame: number;
        const drawFrame = () => {
          if (!video.paused && !video.ended) {
            ctx.drawImage(video, 0, 0, w, h);
            animFrame = requestAnimationFrame(drawFrame);
          }
        };

        const timeout = setTimeout(() => {
          cancelAnimationFrame(animFrame);
          if (recorder.state === "recording") recorder.stop();
        }, (video.duration || 60) * 1000 + 5000);

        recorder.onstop = () => {
          clearTimeout(timeout);
          URL.revokeObjectURL(src);
          const result = new Blob(chunks, { type: "video/webm" });
          resolve(result.size > 0 && result.size < file.size ? result : file);
        };

        recorder.start(100);
        video.play().then(() => { drawFrame(); }).catch(() => { if (recorder.state === "recording") recorder.stop(); });
        video.onended = () => {
          cancelAnimationFrame(animFrame);
          ctx.drawImage(video, 0, 0, w, h);
          if (recorder.state === "recording") recorder.stop();
        };
      } catch {
        URL.revokeObjectURL(src);
        resolve(file);
      }
    };
    video.onerror = () => { URL.revokeObjectURL(src); resolve(file); };
  });
}

function today() {
  return new Date().toISOString().split("T")[0];
}

type UploadStep = 1 | 2 | "done";

type TodayStatus = {
  loading: boolean;
  hasCheckIn: boolean;
  hasCheckOut: boolean;
  checkInTime: string | null;
  checkOutTime: string | null;
  shift: string | null;
} | null;

export default function ChamCong() {
  const [employeeId, setEmployeeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [workDate, setWorkDate] = useState(today());
  const [todayStatus, setTodayStatus] = useState<TodayStatus>(null);
  const statusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shift, setShift] = useState("");
  const [dbShifts, setDbShifts] = useState<Shift[]>([]);

  const [checkInBlob, setCheckInBlob] = useState<Blob | null>(null);
  const [checkOutBlob, setCheckOutBlob] = useState<Blob | null>(null);
  const [checkInPreview, setCheckInPreview] = useState<string | null>(null);
  const [checkOutPreview, setCheckOutPreview] = useState<string | null>(null);
  const [checkInVideoBlob, setCheckInVideoBlob] = useState<Blob | null>(null);
  const [checkOutVideoBlob, setCheckOutVideoBlob] = useState<Blob | null>(null);
  const [checkInVideoPreview, setCheckInVideoPreview] = useState<string | null>(null);
  const [checkOutVideoPreview, setCheckOutVideoPreview] = useState<string | null>(null);
  const [uploadMediaTab, setUploadMediaTab] = useState<"photo" | "video">("photo");

  const [uploadPopupOpen, setUploadPopupOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>(1);
  const [compressing, setCompressing] = useState(false);
  const [compressingMsg, setCompressingMsg] = useState("Đang nén ảnh...");

  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  // Cooldown 5 giây để chống spam form
  const [submitCooldown, setSubmitCooldown] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerStatus, setBannerStatus] = useState("off");
  const [showPopup, setShowPopup] = useState(false);
  const [popupTitle, setPopupTitle] = useState("Cơ hội việc làm");
  const [popupContent, setPopupContent] = useState("Chúng tôi đang tuyển dụng! Bấm xem chi tiết.");
  const [recruitmentLink, setRecruitmentLink] = useState("/gioi-thieu");
  const [shopeeLink, setShopeeLink] = useState("");
  const [shopeeDelay, setShopeeDelay] = useState(5);
  const [affiliateStatus, setAffiliateStatus] = useState("off");
  const [affiliateShowPopup, setAffiliateShowPopup] = useState("on");
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [showClosedPopup, setShowClosedPopup] = useState(false);
  const [closedMessage, setClosedMessage] = useState("");
  const [zaloAdminLink, setZaloAdminLink] = useState("");
  const [attendanceOpenTime, setAttendanceOpenTime] = useState("");
  const [attendanceCloseTime, setAttendanceCloseTime] = useState("");

  // Theo dõi trạng thái mạng
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Khôi phục thông tin nhân viên từ lần trước
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { id, name } = JSON.parse(saved);
        if (id) setEmployeeId(id);
        if (name) setFullName(name);
      }
    } catch {
    }
  }, []);

  // Lưu thông tin nhân viên khi thay đổi
  useEffect(() => {
    if (!employeeId && !fullName) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: employeeId, name: fullName }));
    } catch {
    }
  }, [employeeId, fullName]);

  // Tra cứu trạng thái hôm nay theo Mã NV (debounce 600ms)
  useEffect(() => {
    if (statusDebounceRef.current) clearTimeout(statusDebounceRef.current);
    const trimmed = employeeId.trim();
    if (!trimmed) {
      setTodayStatus(null);
      return;
    }
    setTodayStatus({ loading: true, hasCheckIn: false, hasCheckOut: false, checkInTime: null, checkOutTime: null, shift: null });
    statusDebounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("attendance")
        .select("action_type,created_at,shift")
        .eq("employee_id", trimmed)
        .eq("work_date", today())
        .order("created_at");
      const records = (data || []) as { action_type: string; created_at: string; shift: string }[];
      const ci = records.find((r) => r.action_type === "check-in");
      const co = records.find((r) => r.action_type === "check-out");
      const fmt = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      };
      setTodayStatus({
        loading: false,
        hasCheckIn: !!ci,
        hasCheckOut: !!co,
        checkInTime: ci ? fmt(ci.created_at) : null,
        checkOutTime: co ? fmt(co.created_at) : null,
        shift: ci?.shift ?? co?.shift ?? null,
      });
    }, 600);
  }, [employeeId]);

  useEffect(() => {
    supabase
      .from("configs")
      .select("key,value")
      .in("key", ["banner_url", "banner_status", "popup_status", "popup_title", "popup_content", "recruitment_link", "shopee_link", "shopee_delay", "affiliate_status", "affiliate_show_popup", "attendance_open_time", "attendance_close_time", "attendance_closed_message", "zalo_admin_link"])
      .then(({ data }) => {
        if (!data) return;
        const get = (key: string) => (data as Config[]).find((d) => d.key === key)?.value;
        const bUrl = get("banner_url");
        if (bUrl) setBanner(bUrl);
        setBannerStatus(get("banner_status") ?? "off");
        const pTitle = get("popup_title");
        if (pTitle) setPopupTitle(pTitle);
        const pContent = get("popup_content");
        if (pContent) setPopupContent(pContent);
        const rLink = get("recruitment_link");
        if (rLink) setRecruitmentLink(rLink);
        const sLink = get("shopee_link");
        if (sLink) setShopeeLink(sLink);
        const sDelay = get("shopee_delay");
        if (sDelay) setShopeeDelay(parseInt(sDelay, 10) || 5);
        setAffiliateStatus(get("affiliate_status") ?? "off");
        setAffiliateShowPopup(get("affiliate_show_popup") ?? "on");
        if (get("popup_status") === "on") {
          setTimeout(() => setShowPopup(true), 800);
        }
        const openT = get("attendance_open_time") ?? "";
        const closeT = get("attendance_close_time") ?? "";
        const closedMsg = get("attendance_closed_message") ?? "";
        const zalo = get("zalo_admin_link") ?? "";
        setAttendanceOpenTime(openT);
        setAttendanceCloseTime(closeT);
        setClosedMessage(closedMsg);
        setZaloAdminLink(zalo);
      });
  }, []);

  // Tải danh sách ca từ Supabase (Admin quản lý)
  useEffect(() => {
    supabase
      .from("shifts")
      .select("*")
      .order("created_at")
      .then(({ data }) => {
        const shifts = (data ?? []) as Shift[];
        setDbShifts(shifts);
        if (shifts.length > 0) {
          setShift(`${shifts[0].name} (${shifts[0].start_time} - ${shifts[0].end_time})`);
        }
      });
  }, []);

  useEffect(() => {
    if (!attendanceOpenTime || !attendanceCloseTime) return;
    const checkTime = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const [oh, om] = attendanceOpenTime.split(":").map(Number);
      const [ch, cm] = attendanceCloseTime.split(":").map(Number);
      const openMin = oh * 60 + om;
      const closeMin = ch * 60 + cm;
      const isOpen = openMin <= closeMin
        ? nowMin >= openMin && nowMin < closeMin
        : nowMin >= openMin || nowMin < closeMin;
      setShowClosedPopup(!isOpen);
    };
    checkTime();
    const interval = setInterval(checkTime, 30000);
    return () => clearInterval(interval);
  }, [attendanceOpenTime, attendanceCloseTime]);

  const showToast = useCallback((type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const openUploadPopup = () => {
    setUploadStep(1);
    setUploadMediaTab("photo");
    setUploadPopupOpen(true);
  };

  const handleCheckInUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    setCompressingMsg("Đang nén ảnh check-in...");
    try {
      const compressed = await imageCompression(file, getCompressOptions());
      setCheckInBlob(compressed);
      setCheckInPreview(URL.createObjectURL(compressed));
      setUploadStep(2);
    } catch {
      showToast("error", "Lỗi nén ảnh check-in. Vui lòng thử lại.");
    } finally {
      setCompressing(false);
      e.target.value = "";
    }
  };

  const handleCheckOutUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    setCompressingMsg("Đang nén ảnh check-out...");
    try {
      const compressed = await imageCompression(file, getCompressOptions());
      setCheckOutBlob(compressed);
      setCheckOutPreview(URL.createObjectURL(compressed));
      setUploadStep("done");
      setTimeout(() => setUploadPopupOpen(false), 800);
    } catch {
      showToast("error", "Lỗi nén ảnh check-out. Vui lòng thử lại.");
    } finally {
      setCompressing(false);
      e.target.value = "";
    }
  };

  const handleCheckInVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      showToast("error", "Video quá lớn. Vui lòng chọn video dưới 200MB.");
      e.target.value = "";
      return;
    }
    e.target.value = "";
    setCompressingMsg("Đang nén video check-in...");
    setCompressing(true);
    const compressed = await compressVideo(file);
    setCompressing(false);
    setCheckInVideoBlob(compressed);
    setCheckInVideoPreview(URL.createObjectURL(compressed));
    setUploadStep(2);
  };

  const handleCheckOutVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      showToast("error", "Video quá lớn. Vui lòng chọn video dưới 200MB.");
      e.target.value = "";
      return;
    }
    e.target.value = "";
    setCompressingMsg("Đang nén video check-out...");
    setCompressing(true);
    const compressed = await compressVideo(file);
    setCompressing(false);
    setCheckOutVideoBlob(compressed);
    setCheckOutVideoPreview(URL.createObjectURL(compressed));
    setUploadStep("done");
    setTimeout(() => setUploadPopupOpen(false), 800);
  };

  const resetPhotos = () => {
    setCheckInBlob(null);
    setCheckOutBlob(null);
    if (checkInPreview) URL.revokeObjectURL(checkInPreview);
    if (checkOutPreview) URL.revokeObjectURL(checkOutPreview);
    setCheckInPreview(null);
    setCheckOutPreview(null);
    setCheckInVideoBlob(null);
    setCheckOutVideoBlob(null);
    if (checkInVideoPreview) URL.revokeObjectURL(checkInVideoPreview);
    if (checkOutVideoPreview) URL.revokeObjectURL(checkOutVideoPreview);
    setCheckInVideoPreview(null);
    setCheckOutVideoPreview(null);
    setUploadStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Ngăn chặn spam: nếu đang trong cooldown hoặc đang submit thì bỏ qua
    if (submitting || submitCooldown) return;
    if (!employeeId.trim() || !fullName.trim()) {
      showToast("error", "Vui lòng nhập đầy đủ Mã NV và Tên.");
      return;
    }
    if (!checkInBlob && !checkInVideoBlob) {
      showToast("error", "Vui lòng upload ảnh hoặc video check-in.");
      return;
    }
    if (!checkOutBlob && !checkOutVideoBlob) {
      showToast("error", "Vui lòng upload ảnh hoặc video check-out.");
      return;
    }

    setSubmitting(true);

    const { data: todayRecords } = await supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", employeeId.trim())
      .eq("work_date", workDate);

    const records = (todayRecords || []) as AttendanceRecord[];
    const hasCheckIn = records.some((r) => r.action_type === "check-in");
    const hasCheckOut = records.some((r) => r.action_type === "check-out");

    if (hasCheckIn && hasCheckOut) {
      showToast("info", "Bạn đã chấm công đầy đủ hôm nay rồi.");
      setSubmitting(false);
      return;
    }

    const ts = Date.now();
    const eid = employeeId.trim();

    const uploadPhoto = async (blob: Blob, actionType: "check-in" | "check-out") => {
      const fileName = `${eid}_${workDate}_${actionType}_${ts}.jpg`;
      return retryUpload(
        async () => {
          const { error } = await supabase.storage
            .from("checkin_photos")
            .upload(fileName, blob, { contentType: "image/jpeg" });
          if (error) throw new Error(`Lỗi upload ảnh ${actionType}: ` + error.message);
          return supabase.storage.from("checkin_photos").getPublicUrl(fileName).data.publicUrl;
        },
        3,
        (attempt) => setUploadProgress(`Kết nối chậm, thử lại lần ${attempt}...`)
      );
    };

    const uploadVideo = async (blob: Blob, actionType: "check-in" | "check-out") => {
      const ext = blob.type.split("/")[1]?.split(";")[0] || "mp4";
      const fileName = `${eid}_${workDate}_${actionType}_${ts}_video.${ext}`;
      return retryUpload(
        async () => {
          const { error } = await supabase.storage
            .from("checkin_photos")
            .upload(fileName, blob, { contentType: blob.type });
          if (error) throw new Error(`Lỗi upload video ${actionType}: ` + error.message);
          return supabase.storage.from("checkin_photos").getPublicUrl(fileName).data.publicUrl;
        },
        3,
        (attempt) => setUploadProgress(`Kết nối chậm, thử lại lần ${attempt}...`)
      );
    };

    try {
      const inserts: Promise<void>[] = [];

      // Lưu check-in nếu chưa có
      if (!hasCheckIn) {
        setUploadProgress("Đang upload ảnh check-in... (1/2)");
        const ciImageUrl = checkInBlob ? await uploadPhoto(checkInBlob, "check-in") : null;
        const ciVideoUrl = checkInVideoBlob ? (setUploadProgress("Đang upload video check-in... (1/2)"), await uploadVideo(checkInVideoBlob, "check-in")) : null;
        setUploadProgress("Đang lưu dữ liệu check-in...");
        inserts.push(
          Promise.resolve(
            supabase.from("attendance").insert({
              employee_id: eid,
              full_name: fullName.trim(),
              work_date: workDate,
              shift,
              action_type: "check-in",
              image_url: ciImageUrl,
              video_url: ciVideoUrl,
            }).then(({ error }) => {
              if (error) throw new Error("Lỗi lưu check-in: " + error.message);
            })
          )
        );
      }

      // Lưu check-out nếu chưa có
      if (!hasCheckOut) {
        setUploadProgress("Đang upload ảnh check-out... (2/2)");
        const coImageUrl = checkOutBlob ? await uploadPhoto(checkOutBlob, "check-out") : null;
        const coVideoUrl = checkOutVideoBlob ? (setUploadProgress("Đang upload video check-out... (2/2)"), await uploadVideo(checkOutVideoBlob, "check-out")) : null;
        setUploadProgress("Đang lưu dữ liệu check-out...");
        inserts.push(
          Promise.resolve(
            supabase.from("attendance").insert({
              employee_id: eid,
              full_name: fullName.trim(),
              work_date: workDate,
              shift,
              action_type: "check-out",
              image_url: coImageUrl,
              video_url: coVideoUrl,
            }).then(({ error }) => {
              if (error) throw new Error("Lỗi lưu check-out: " + error.message);
            })
          )
        );
      }

      setUploadProgress("Hoàn tất, đang xác nhận...");
      await Promise.all(inserts);
      showToast("success", "Chấm công thành công! Check-in & Check-out đã được lưu.");
      resetPhotos();

      // Cập nhật trạng thái hôm nay sau khi submit thành công
      setTodayStatus((prev) => ({
        loading: false,
        hasCheckIn: true,
        hasCheckOut: true,
        checkInTime: prev?.checkInTime ?? new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        checkOutTime: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        shift: shift,
      }));

      // Kích hoạt cooldown 5 giây chống spam sau khi submit thành công
      setSubmitCooldown(true);
      setTimeout(() => setSubmitCooldown(false), 5000);

      if (shopeeLink && affiliateStatus === "on") {
        if (affiliateShowPopup === "on") {
          let remaining = shopeeDelay;
          setRedirectCountdown(remaining);
          const timer = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
              clearInterval(timer);
              setRedirectCountdown(null);
              window.location.href = shopeeLink;
            } else {
              setRedirectCountdown(remaining);
            }
          }, 1000);
        } else {
          setTimeout(() => { window.location.href = shopeeLink; }, shopeeDelay * 1000);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Có lỗi xảy ra.";
      const isNetErr = msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("network") || !navigator.onLine;
      showToast("error", isNetErr ? "Mất kết nối mạng. Vui lòng kiểm tra internet và thử lại." : msg);
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  const mediaReady = !!(checkInBlob || checkInVideoBlob) && !!(checkOutBlob || checkOutVideoBlob);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <header className="bg-white/80 backdrop-blur-md border-b border-blue-100 sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 flex-shrink-0 bg-primary rounded-lg flex items-center justify-center">
              <Camera size={16} className="text-white" />
            </div>
            <span className="font-bold text-foreground text-base sm:text-lg truncate">Chấm Công</span>
          </div>
          <nav className="flex gap-0.5 sm:gap-1 flex-shrink-0">
            <Link
              href="/tra-cuu"
              className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors whitespace-nowrap"
            >
              <Search size={13} />
              <span className="hidden xs:inline">Tra cứu</span>
              <span className="xs:hidden">Tìm</span>
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

      {!isOnline && (
        <div className="bg-red-600 text-white text-sm font-medium px-4 py-2.5 flex items-center justify-center gap-2">
          <XCircle size={15} />
          Không có kết nối internet — dữ liệu chưa được gửi. Vui lòng kiểm tra mạng rồi thử lại.
        </div>
      )}

      {banner && bannerStatus === "on" && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <img src={banner} alt="Banner" className="w-full rounded-2xl object-cover max-h-36 shadow-md" />
        </div>
      )}

      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all duration-300 ${
            toast.type === "success"
              ? "bg-green-500"
              : toast.type === "error"
              ? "bg-destructive"
              : "bg-amber-500"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle size={16} />
          ) : toast.type === "error" ? (
            <XCircle size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          {toast.message}
        </div>
      )}

      <main className="max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-white rounded-2xl shadow-sm border border-border p-5 space-y-4">
            <h2 className="font-semibold text-foreground text-base">Thông tin nhân viên</h2>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Mã nhân viên *</label>
              <input
                data-testid="input-employee-id"
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="VD: NV001"
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Họ và tên *</label>
              <input
                data-testid="input-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="VD: Nguyễn Văn A"
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Ngày làm việc</label>
              <input
                data-testid="input-work-date"
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Ca làm việc</label>
              <select
                data-testid="select-shift"
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition disabled:opacity-50"
                disabled={dbShifts.length === 0}
              >
                {dbShifts.length === 0 ? (
                  <option value="">Đang tải ca làm việc...</option>
                ) : (
                  dbShifts.map((s) => {
                    const val = `${s.name} (${s.start_time} - ${s.end_time})`;
                    return <option key={s.id} value={val}>{val}</option>;
                  })
                )}
              </select>
            </div>
          </div>

          {todayStatus && (
            <div className={`rounded-2xl border px-4 py-3.5 ${
              todayStatus.loading
                ? "bg-muted/50 border-border"
                : todayStatus.hasCheckIn && todayStatus.hasCheckOut
                ? "bg-green-50 border-green-200"
                : todayStatus.hasCheckIn
                ? "bg-amber-50 border-amber-200"
                : "bg-blue-50 border-blue-200"
            }`}>
              {todayStatus.loading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Đang kiểm tra trạng thái hôm nay...</span>
                </div>
              ) : todayStatus.hasCheckIn && todayStatus.hasCheckOut ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                    <CalendarCheck size={16} />
                    <span>Đã chấm công đầy đủ hôm nay</span>
                  </div>
                  {todayStatus.shift && (
                    <p className="text-xs text-green-600 pl-6">Ca: {todayStatus.shift}</p>
                  )}
                  <div className="flex gap-4 pl-6 text-xs text-green-600">
                    <span className="flex items-center gap-1"><Clock size={11} /> Check-in: {todayStatus.checkInTime}</span>
                    <span className="flex items-center gap-1"><Clock size={11} /> Check-out: {todayStatus.checkOutTime}</span>
                  </div>
                </div>
              ) : todayStatus.hasCheckIn ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                    <UserCheck size={16} />
                    <span>Đã check-in, chưa check-out</span>
                  </div>
                  <div className="pl-6 text-xs text-amber-600 flex items-center gap-1">
                    <Clock size={11} /> Check-in: {todayStatus.checkInTime}
                  </div>
                  <p className="pl-6 text-xs text-amber-600">Bạn cần gửi thêm ảnh/video check-out để hoàn tất.</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-blue-700 text-sm">
                  <Clock size={14} />
                  <span>Chưa chấm công hôm nay — hãy điền đầy đủ và gửi.</span>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-border p-5 space-y-4">
            <h2 className="font-semibold text-foreground text-base">Ảnh / Video chấm công</h2>

            {!mediaReady ? (
              <button
                type="button"
                onClick={openUploadPopup}
                className="w-full py-10 rounded-xl border-2 border-dashed border-primary/40 text-primary flex flex-col items-center gap-2 hover:bg-accent/50 transition"
              >
                <ImagePlus size={28} />
                <span className="text-sm font-medium">Bấm để upload ảnh / video</span>
                <span className="text-xs text-muted-foreground">Check-in &amp; Check-out — ảnh hoặc video</span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground text-center">Check-in</p>
                    {checkInPreview ? (
                      <img src={checkInPreview} alt="Check-in" className="w-full rounded-xl object-cover aspect-square border border-green-200" />
                    ) : checkInVideoPreview ? (
                      <video src={checkInVideoPreview} className="w-full rounded-xl aspect-square object-cover border border-green-200" muted playsInline />
                    ) : null}
                    <div className="flex items-center justify-center gap-1 text-green-600 text-xs">
                      <CheckCircle size={12} />
                      <span>{checkInVideoPreview && !checkInPreview ? "Video sẵn sàng" : "Đã nén"}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground text-center">Check-out</p>
                    {checkOutPreview ? (
                      <img src={checkOutPreview} alt="Check-out" className="w-full rounded-xl object-cover aspect-square border border-blue-200" />
                    ) : checkOutVideoPreview ? (
                      <video src={checkOutVideoPreview} className="w-full rounded-xl aspect-square object-cover border border-blue-200" muted playsInline />
                    ) : null}
                    <div className="flex items-center justify-center gap-1 text-blue-600 text-xs">
                      <CheckCircle size={12} />
                      <span>{checkOutVideoPreview && !checkOutPreview ? "Video sẵn sàng" : "Đã nén"}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openUploadPopup()}
                  className="w-full py-2.5 border border-border rounded-xl text-sm text-muted-foreground flex items-center justify-center gap-2 hover:bg-muted transition"
                >
                  <Upload size={14} />
                  Upload lại
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            data-testid="btn-submit"
            disabled={submitting || submitCooldown || !mediaReady || !isOnline}
            className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-base shadow-md hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 flex flex-col items-center justify-center gap-1"
          >
            {submitting ? (
              <>
                <span className="flex items-center gap-2">
                  <Loader2 size={18} className="animate-spin" />
                  Đang gửi...
                </span>
                {uploadProgress && (
                  <span className="text-xs font-normal opacity-80">{uploadProgress}</span>
                )}
              </>
            ) : submitCooldown ? (
              <span className="flex items-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                Vui lòng chờ...
              </span>
            ) : !isOnline ? (
              <span className="flex items-center gap-2">
                <XCircle size={18} />
                Mất kết nối — không thể gửi
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Send size={18} />
                Gửi chấm công
              </span>
            )}
          </button>
        </form>
      </main>

      {uploadPopupOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 pt-5 pb-4 relative">
              {!compressing && uploadStep !== "done" && (
                <button
                  onClick={() => setUploadPopupOpen(false)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition"
                >
                  <XIcon size={16} className="text-white" />
                </button>
              )}
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                <Upload size={20} className="text-white" />
              </div>
              <h3 className="text-white font-bold text-lg leading-tight">Upload ảnh / video chấm công</h3>
              <div className="flex items-center gap-2 mt-2">
                <div className={`h-1.5 flex-1 rounded-full ${uploadStep === 1 || uploadStep === 2 || uploadStep === "done" ? "bg-white" : "bg-white/30"}`} />
                <div className={`h-1.5 flex-1 rounded-full ${uploadStep === 2 || uploadStep === "done" ? "bg-white" : "bg-white/30"}`} />
              </div>
            </div>

            <div className="px-5 py-5 space-y-4">
              {compressing && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <Loader2 size={32} className="animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground font-medium">{compressingMsg}</p>
                </div>
              )}

              {!compressing && uploadStep === "done" && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCheck size={28} className="text-green-600" />
                  </div>
                  <p className="text-sm font-semibold text-green-700">Hoàn tất! Đang đóng...</p>
                </div>
              )}

              {!compressing && uploadStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Bước 1/2:</span> Upload check-in của bạn.
                  </p>
                  <div className="flex rounded-xl border border-border overflow-hidden">
                    <button type="button" onClick={() => setUploadMediaTab("photo")}
                      className={`flex-1 py-2 text-sm font-semibold flex items-center justify-center gap-1.5 transition ${uploadMediaTab === "photo" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                      <ImagePlus size={14} /> Ảnh
                    </button>
                    <button type="button" onClick={() => setUploadMediaTab("video")}
                      className={`flex-1 py-2 text-sm font-semibold flex items-center justify-center gap-1.5 transition ${uploadMediaTab === "video" ? "bg-violet-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                      <Video size={14} /> Video
                    </button>
                  </div>
                  {uploadMediaTab === "photo" ? (
                    <label className="block cursor-pointer">
                      <input type="file" accept="image/*,image/heic,image/heif" className="hidden" onChange={handleCheckInUpload} />
                      <div className="w-full py-4 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 text-blue-700 flex flex-col items-center gap-2 hover:bg-blue-100 transition">
                        <ImagePlus size={24} />
                        <span className="text-sm font-semibold">Chọn ảnh check-in</span>
                        <span className="text-xs text-blue-500">JPG, PNG, HEIC, WebP… tất cả định dạng ảnh</span>
                      </div>
                    </label>
                  ) : (
                    <label className="block cursor-pointer">
                      <input type="file" accept="video/*" className="hidden" onChange={handleCheckInVideoUpload} />
                      <div className="w-full py-4 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50 text-violet-700 flex flex-col items-center gap-2 hover:bg-violet-100 transition">
                        <Video size={24} />
                        <span className="text-sm font-semibold">Chọn video check-in</span>
                        <span className="text-xs text-violet-500">MP4, MOV, AVI, WebM… tối đa 100MB</span>
                      </div>
                    </label>
                  )}
                </div>
              )}

              {!compressing && uploadStep === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-2 bg-green-50 rounded-xl border border-green-200">
                    {checkInPreview ? (
                      <img src={checkInPreview} alt="Check-in" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : checkInVideoPreview ? (
                      <div className="w-12 h-12 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <Play size={18} className="text-violet-600" />
                      </div>
                    ) : null}
                    <div>
                      <p className="text-xs font-semibold text-green-700">Check-in ✓</p>
                      <p className="text-xs text-green-600">{checkInVideoPreview && !checkInPreview ? "Video đã sẵn sàng" : "Ảnh đã được nén"}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Bước 2/2:</span> Upload check-out của bạn.
                  </p>
                  <div className="flex rounded-xl border border-border overflow-hidden">
                    <button type="button" onClick={() => setUploadMediaTab("photo")}
                      className={`flex-1 py-2 text-sm font-semibold flex items-center justify-center gap-1.5 transition ${uploadMediaTab === "photo" ? "bg-indigo-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                      <ImagePlus size={14} /> Ảnh
                    </button>
                    <button type="button" onClick={() => setUploadMediaTab("video")}
                      className={`flex-1 py-2 text-sm font-semibold flex items-center justify-center gap-1.5 transition ${uploadMediaTab === "video" ? "bg-violet-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                      <Video size={14} /> Video
                    </button>
                  </div>
                  {uploadMediaTab === "photo" ? (
                    <label className="block cursor-pointer">
                      <input type="file" accept="image/*,image/heic,image/heif" className="hidden" onChange={handleCheckOutUpload} />
                      <div className="w-full py-4 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 text-indigo-700 flex flex-col items-center gap-2 hover:bg-indigo-100 transition">
                        <ImagePlus size={24} />
                        <span className="text-sm font-semibold">Chọn ảnh check-out</span>
                        <span className="text-xs text-indigo-500">JPG, PNG, HEIC, WebP… tất cả định dạng ảnh</span>
                      </div>
                    </label>
                  ) : (
                    <label className="block cursor-pointer">
                      <input type="file" accept="video/*" className="hidden" onChange={handleCheckOutVideoUpload} />
                      <div className="w-full py-4 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50 text-violet-700 flex flex-col items-center gap-2 hover:bg-violet-100 transition">
                        <Video size={24} />
                        <span className="text-sm font-semibold">Chọn video check-out</span>
                        <span className="text-xs text-violet-500">MP4, MOV, AVI, WebM… tối đa 100MB</span>
                      </div>
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showClosedPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-rose-600 px-5 pt-6 pb-5 text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <XCircle size={32} className="text-white" />
              </div>
              <h3 className="text-white font-bold text-lg">Không thể truy cập</h3>
              {attendanceOpenTime && attendanceCloseTime && (
                <p className="text-white/70 text-xs mt-1">
                  Giờ chấm công: {attendanceOpenTime} – {attendanceCloseTime}
                </p>
              )}
            </div>
            <div className="px-6 py-5 text-center space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {closedMessage || "Bạn không thể truy cập, có thể trang web chưa được mở hoặc đã đóng. Nếu bạn cho rằng đây là lỗi, vui lòng chụp lại và báo cáo với quản trị viên."}
              </p>
              {zaloAdminLink && (
                <a
                  href={zaloAdminLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 bg-blue-500 text-white rounded-xl font-semibold text-sm hover:bg-blue-600 transition"
                >
                  <Phone size={16} />
                  Liên hệ quản trị viên
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {redirectCountdown !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 bg-white rounded-3xl shadow-2xl overflow-hidden text-center">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 px-5 py-6">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl font-black text-white">{redirectCountdown}</span>
              </div>
              <h3 className="text-white font-bold text-lg">Chấm công thành công!</h3>
              <p className="text-white/80 text-sm mt-1">Đang chuyển hướng sau {redirectCountdown} giây...</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-1000"
                  style={{ width: `${(redirectCountdown / shopeeDelay) * 100}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Bạn sẽ được chuyển sang trang <span className="font-semibold text-orange-600">Shopee</span> để nhận ưu đãi.
              </p>
              <button
                onClick={() => { setRedirectCountdown(null); window.location.href = shopeeLink; }}
                className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition"
              >
                Đi ngay
              </button>
              <button
                onClick={() => setRedirectCountdown(null)}
                className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition"
              >
                Bỏ qua
              </button>
            </div>
          </div>
        </div>
      )}

      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6 duration-400">
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-5 pt-5 pb-4 relative">
              <button
                onClick={() => setShowPopup(false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition"
              >
                <XIcon size={16} className="text-white" />
              </button>
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                <Megaphone size={20} className="text-white" />
              </div>
              <h3 className="text-white font-bold text-lg leading-tight">{popupTitle}</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-muted-foreground text-sm leading-relaxed">{popupContent}</p>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => setShowPopup(false)}
                className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition font-medium"
              >
                Để sau
              </button>
              <Link
                href={recruitmentLink.startsWith("http") ? "#" : recruitmentLink}
                onClick={() => {
                  setShowPopup(false);
                  if (recruitmentLink.startsWith("http")) window.open(recruitmentLink, "_blank");
                }}
                className="flex-1 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl text-sm font-semibold text-center hover:opacity-90 transition"
              >
                Giới thiệu ngay
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
