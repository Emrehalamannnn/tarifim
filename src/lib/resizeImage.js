// Client-side image resize/re-encode shared by CreatePostModal (post
// photos) and ProfilePage's avatar picker. Produces a File (for Supabase
// Storage upload) plus an object-URL preview, rather than a base64 data URL
// (the old approach, which used to get embedded directly in localStorage).
export function resizeImageFile(file, maxDimension = 800, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Image resize failed"));
              return;
            }
            resolve({
              file: new File([blob], `${Date.now()}.jpg`, { type: "image/jpeg" }),
              previewUrl: URL.createObjectURL(blob),
            });
          },
          "image/jpeg",
          quality
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
