import { useState, useEffect, useRef, useCallback } from "react";
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { getOptimizedUrl } from "@/utils/cloudinaryUtils";

export interface LightboxImage {
  url: string;
  label: string;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  initialIndex?: number;
  onClose: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

export function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);

  const current = images[index];

  const resetView = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const goTo = useCallback((i: number) => {
    setIndex(i);
    resetView();
  }, [resetView]);

  const prev = useCallback(() => goTo((index - 1 + images.length) % images.length), [index, images.length, goTo]);
  const next = useCallback(() => goTo((index + 1) % images.length), [index, images.length, goTo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (images.length > 1) {
        if (e.key === "ArrowLeft") prev();
        if (e.key === "ArrowRight") next();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, prev, next, images.length]);

  const getContainerCenter = () => {
    const el = containerRef.current;
    if (!el) return { cx: 0, cy: 0 };
    const rect = el.getBoundingClientRect();
    return { cx: rect.width / 2, cy: rect.height / 2 };
  };

  const clampPan = (z: number, px: number, py: number) => {
    if (z <= 1) return { px: 0, py: 0 };
    const el = containerRef.current;
    if (!el) return { px, py };
    const rect = el.getBoundingClientRect();
    const maxX = (rect.width * (z - 1)) / (2 * z) * z;
    const maxY = (rect.height * (z - 1)) / (2 * z) * z;
    return {
      px: Math.max(-maxX, Math.min(maxX, px)),
      py: Math.max(-maxY, Math.min(maxY, py)),
    };
  };

  const applyZoom = useCallback((newZoom: number, cursorX?: number, cursorY?: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    setZoom(prev => {
      const { cx, cy } = getContainerCenter();
      const ox = cursorX !== undefined ? cursorX - cx : 0;
      const oy = cursorY !== undefined ? cursorY - cy : 0;
      setPanX(px => {
        setPanY(py => {
          const imgDx = (ox - px) / prev;
          const imgDy = (oy - py) / prev;
          const newPx = ox - imgDx * clamped;
          const newPy = oy - imgDy * clamped;
          const { px: cpx, py: cpy } = clampPan(clamped, newPx, newPy);
          setPanX(cpx);
          setPanY(cpy);
          return cpy;
        });
        return px;
      });
      return clamped;
    });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = e.clientX - rect.left - rect.width / 2;
    const cursorY = e.clientY - rect.top - rect.height / 2;
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    setZoom(prev => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev * factor));
      const imgDx = (cursorX - panX) / prev;
      const imgDy = (cursorY - panY) / prev;
      const newPx = cursorX - imgDx * newZoom;
      const newPy = cursorY - imgDy * newZoom;
      const { px, py } = clampPan(newZoom, newPx, newPy);
      setPanX(px);
      setPanY(py);
      return newZoom;
    });
  }, [panX, panY]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, panX, panY };
    setIsDragging(true);
  }, [panX, panY]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current || e.pointerType === "touch") return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (zoom <= 1) return;
    const { px, py } = clampPan(zoom, dragStart.current.panX + dx, dragStart.current.panY + dy);
    setPanX(px);
    setPanY(py);
  }, [zoom]);

  const onPointerUp = useCallback(() => {
    dragStart.current = null;
    setIsDragging(false);
  }, []);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = e.clientX - rect.left - rect.width / 2;
    const cursorY = e.clientY - rect.top - rect.height / 2;
    if (zoom > 1) {
      resetView();
    } else {
      applyZoom(2.5, cursorX, cursorY);
    }
  }, [zoom, resetView, applyZoom]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStart.current = { dist: Math.hypot(dx, dy), zoom };
    } else if (e.touches.length === 1) {
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX, panY };
    }
  }, [zoom, panX, panY]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && pinchStart.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStart.current.zoom * (dist / pinchStart.current.dist)));
      setZoom(newZoom);
      if (newZoom <= 1) { setPanX(0); setPanY(0); }
    } else if (e.touches.length === 1 && dragStart.current && zoom > 1) {
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      const { px, py } = clampPan(zoom, dragStart.current.panX + dx, dragStart.current.panY + dy);
      setPanX(px);
      setPanY(py);
    }
  }, [zoom]);

  const onTouchEnd = useCallback(() => {
    pinchStart.current = null;
    dragStart.current = null;
  }, []);

  const cursor = zoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in";

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/95 flex flex-col select-none"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent z-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          {images.length > 1 && (
            <span className="text-white/60 text-xs font-medium bg-white/10 px-2 py-0.5 rounded-full whitespace-nowrap">
              {index + 1} / {images.length}
            </span>
          )}
          <span className="text-white text-sm font-medium truncate">{current.label}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-white/60 text-xs bg-white/10 px-2 py-0.5 rounded-full">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => applyZoom(zoom * 1.3)}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition"
            title="Phóng to"
          >
            <ZoomIn size={15} className="text-white" />
          </button>
          <button
            onClick={() => zoom > 1 ? applyZoom(zoom / 1.3) : undefined}
            disabled={zoom <= 1}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition disabled:opacity-40"
            title="Thu nhỏ"
          >
            <ZoomOut size={15} className="text-white" />
          </button>
          <button
            onClick={resetView}
            disabled={zoom === 1 && panX === 0 && panY === 0}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition disabled:opacity-40"
            title="Đặt lại"
          >
            <RotateCcw size={14} className="text-white" />
          </button>
          <a
            href={current.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition"
            onClick={e => e.stopPropagation()}
          >
            <Download size={13} />
            Tải xuống
          </a>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition"
          >
            <X size={16} className="text-white" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden flex items-center justify-center ${cursor}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={e => e.stopPropagation()}
        style={{ touchAction: "none" }}
      >
        <img
          src={getOptimizedUrl(current.url)}
          alt={current.label}
          draggable={false}
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.15s ease",
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            borderRadius: "12px",
            boxShadow: "0 25px 60px rgba(0,0,0,0.8)",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Prev / Next navigation */}
      {images.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); prev(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center transition backdrop-blur-sm z-20"
            title="Ảnh trước (←)"
          >
            <ChevronLeft size={22} className="text-white" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); next(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center transition backdrop-blur-sm z-20"
            title="Ảnh sau (→)"
          >
            <ChevronRight size={22} className="text-white" />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); goTo(i); }}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"}`}
              />
            ))}
          </div>
        </>
      )}

      {/* Hint */}
      {images.length <= 1 && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-xs whitespace-nowrap">
          Cuộn để zoom • Kéo để di chuyển • Nhấp đôi để phóng to • ESC để đóng
        </p>
      )}
      {images.length > 1 && zoom === 1 && (
        <p className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/40 text-xs whitespace-nowrap">
          Cuộn để zoom • Kéo để di chuyển • ← → để chuyển ảnh • ESC để đóng
        </p>
      )}
    </div>
  );
}
