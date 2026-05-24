const CLOUDINARY_CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD as string;
const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_PRESET as string;

if (!CLOUDINARY_CLOUD || !CLOUDINARY_PRESET) {
  console.warn(
    "[Cloudinary] VITE_CLOUDINARY_CLOUD hoặc VITE_CLOUDINARY_PRESET chưa được cấu hình. Upload video sẽ không hoạt động."
  );
}

export function uploadVideoToCloudinary(
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  if (!CLOUDINARY_CLOUD || !CLOUDINARY_PRESET) {
    return Promise.reject(
      new Error("Cloudinary chưa được cấu hình. Vui lòng kiểm tra biến môi trường.")
    );
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        onProgress(100);
        resolve(data.secure_url as string);
      } else {
        reject(new Error(`Cloudinary lỗi ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Mất kết nối khi upload video lên Cloudinary."));
    xhr.send(formData);
  });
}

export function getOptimizedVideoUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (!url.includes("cloudinary.com")) return url;
  return url.replace("/upload/", "/upload/f_auto,q_auto/");
}

export function getVideoThumbnailUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (!url.includes("cloudinary.com")) return url;
  return url
    .replace("/upload/", "/upload/f_auto,q_auto,so_0/")
    .replace(/\.\w+$/, ".jpg");
}
