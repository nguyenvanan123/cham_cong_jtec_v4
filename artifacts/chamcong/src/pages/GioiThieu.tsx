import { useState, useEffect } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";
import type { Config } from "@/lib/supabase";
import {
  Camera, Gift, Users, Star, ArrowRight, CheckCircle,
  Banknote, Phone, ChevronDown
} from "lucide-react";

export default function GioiThieu() {
  const [shopeeLink, setShopeeLink] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("configs")
      .select("key,value")
      .in("key", ["shopee_link", "banner_url"])
      .then(({ data }) => {
        if (!data) return;
        const get = (key: string) => (data as Config[]).find((d) => d.key === key)?.value ?? "";
        setShopeeLink(get("shopee_link"));
        const bUrl = get("banner_url");
        if (bUrl) setBanner(bUrl);
      });
  }, []);

  const benefits = [
    { icon: <Banknote size={20} className="text-green-600" />, title: "Thu nhập hấp dẫn", desc: "Lương cơ bản + thưởng theo hiệu quả kinh doanh hàng tháng" },
    { icon: <Gift size={20} className="text-violet-600" />, title: "Phúc lợi đầy đủ", desc: "BHXH, BHYT, nghỉ phép đầy đủ theo quy định pháp luật" },
    { icon: <Users size={20} className="text-blue-600" />, title: "Môi trường trẻ trung", desc: "Đội ngũ năng động, sáng tạo, cơ hội học hỏi và thăng tiến" },
    { icon: <Star size={20} className="text-amber-500" />, title: "Thưởng giới thiệu", desc: "Nhận thưởng hấp dẫn khi giới thiệu thành công nhân sự mới" },
  ];

  const steps = [
    { num: "1", label: "Điền form ứng tuyển", desc: "Nhập thông tin cá nhân và người giới thiệu" },
    { num: "2", label: "Chờ liên hệ", desc: "Bộ phận tuyển dụng sẽ liên hệ trong 1–2 ngày làm việc" },
    { num: "3", label: "Phỏng vấn & nhận việc", desc: "Tham gia phỏng vấn và bắt đầu công việc" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-purple-50">
      <header className="bg-white/80 backdrop-blur-md border-b border-violet-100 sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <Camera size={16} className="text-white" />
            </div>
            <span className="font-bold text-foreground text-lg">Giới thiệu việc làm</span>
          </div>
          <Link
            href="/"
            className="text-sm px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            ← Chấm công
          </Link>
        </div>
      </header>

      {banner && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <img src={banner} alt="Banner" className="w-full rounded-2xl object-cover max-h-36 shadow-md" />
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 rounded-3xl p-6 text-white shadow-xl">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
            <Users size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-black leading-tight mb-2">
            Giới thiệu bạn bè — Nhận ngay phần thưởng!
          </h1>
          <p className="text-white/80 text-sm leading-relaxed">
            Bạn biết ai đang tìm việc không? Giới thiệu họ và nhận thưởng hấp dẫn khi họ gia nhập đội ngũ!
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-border p-5 space-y-3">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Star size={16} className="text-amber-500" />
            Quyền lợi khi ứng tuyển
          </h2>
          <div className="space-y-3">
            {benefits.map((b, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-muted/30 rounded-xl">
                <div className="w-9 h-9 rounded-xl bg-white border border-border flex items-center justify-center flex-shrink-0">
                  {b.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{b.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-border p-5 space-y-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <CheckCircle size={16} className="text-green-500" />
            Quy trình ứng tuyển
          </h2>
          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {s.num}
                </div>
                <div className="pt-0.5">
                  <p className="text-sm font-semibold text-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
                {i < steps.length - 1 && (
                  <ChevronDown size={14} className="text-muted-foreground ml-auto mt-2 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Link
            href="/ung-tuyen"
            className="w-full py-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-2xl font-bold text-base shadow-md hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Phone size={18} />
            Đăng ký ứng tuyển ngay
            <ArrowRight size={18} />
          </Link>

          {shopeeLink && (
            <a
              href={shopeeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-bold text-sm shadow-md hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Gift size={16} />
              Khám phá ưu đãi Shopee
              <ArrowRight size={16} />
            </a>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Mọi thắc mắc vui lòng liên hệ bộ phận nhân sự để được tư vấn.
        </p>
      </main>
    </div>
  );
}
