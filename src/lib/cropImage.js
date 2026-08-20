// Turns a raw <input type="file"> selection + the pixel crop rect from
// ImageCropModal (react-easy-crop's onCropComplete) into a File, so the
// existing resizeImageFile() pipeline (CreatePostModal photos, ProfilePage
// avatars) can re-encode/downscale it exactly like an uncropped upload.
export function getCroppedImageFile(imageSrc, cropPixels) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = cropPixels.width;
      canvas.height = cropPixels.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        img,
        cropPixels.x,
        cropPixels.y,
        cropPixels.width,
        cropPixels.height,
        0,
        0,
        cropPixels.width,
        cropPixels.height
      );
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Image crop failed"));
            return;
          }
          resolve(new File([blob], `${Date.now()}-cropped.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.92
      );
    };
    img.src = imageSrc;
  });
}
