import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { motion, AnimatePresence } from "framer-motion";

// Full-screen crop step inserted between picking a file and
// resizeImageFile()'s existing downscale/re-encode pass — used by both
// CreatePostModal (photo posts, aspect 4/5) and ProfilePage's avatar picker
// (aspect 1/1, round preview). `imageSrc` is an object URL for the
// just-picked raw file; onConfirm receives react-easy-crop's pixel crop
// rect and is responsible for turning it into a File (see cropImage.js).
export default function ImageCropModal({ open, imageSrc, aspect = 1, onCancel, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels || busy) return;
    setBusy(true);
    try {
      await onConfirm(croppedAreaPixels);
    } finally {
      setBusy(false);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex items-center justify-between px-5 py-4">
            <button
              onClick={onCancel}
              className="text-sm font-semibold text-white/80 active:scale-95"
            >
              İptal
            </button>
            <p className="text-sm font-semibold text-white">Kırp</p>
            <button
              onClick={handleConfirm}
              disabled={busy}
              className="text-sm font-bold text-[var(--color-paprika)] active:scale-95 disabled:opacity-50"
            >
              {busy ? "…" : "Bitti"}
            </button>
          </div>

          <div className="relative flex-1">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                cropShape={aspect === 1 ? "round" : "rect"}
                showGrid={aspect !== 1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            )}
          </div>

          <div className="flex items-center gap-3 bg-black px-6 pb-8 pt-4">
            <span className="text-sm text-white/70">🔍</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-[var(--color-paprika)]"
              aria-label="Yakınlaştır"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
