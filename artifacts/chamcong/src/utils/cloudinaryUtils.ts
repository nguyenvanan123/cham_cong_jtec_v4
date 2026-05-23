/**
 * Tự động thêm f_auto,q_auto vào Cloudinary URL để:
 * - f_auto: chọn định dạng tối ưu (WebP, AVIF…) theo trình duyệt
 * - q_auto: tự chọn chất lượng tối ưu, giảm dung lượng ~30–70%
 * URL không phải Cloudinary sẽ được trả về nguyên vẹn.
 */
export function getOptimizedUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (!url.includes("cloudinary.com")) return url;
  return url.replace("/upload/", "/upload/f_auto,q_auto/");
}

/**
 * Tương tự getOptimizedUrl nhưng dành riêng cho video thumbnail preview
 * (thêm so=0 để lấy frame đầu làm poster, giảm băng thông)
 */
export function getVideoThumbnailUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (!url.includes("cloudinary.com")) return url;
  return url.replace("/upload/", "/upload/f_auto,q_auto,so_0/").replace(/\.\w+$/, ".jpg");
}
