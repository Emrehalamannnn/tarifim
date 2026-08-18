import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ingredients from "../data/ingredients.json";

const MAX_DIMENSION = 800;

// Resizes client-side same as before, but now produces a File (for upload
// to the post-photos Supabase Storage bucket) instead of a base64 data URL
// (which used to get stored directly inside communityPosts in localStorage).
function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
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
          0.78
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const CATEGORY_LABELS_TR = {
  legumes: "Bakliyat",
  grains: "Tahıllar",
  bakery: "Fırın",
  vegetables: "Sebze",
  fruits: "Meyve",
  nuts: "Kuruyemiş",
  dairy: "Süt Ürünleri",
  oils: "Yağlar",
  spices: "Baharat",
  baking: "Pasta Malzemeleri",
  condiments: "Soslar & Ezmeler",
  meat: "Et & Şarküteri",
};

const CATEGORIES = Array.from(new Set(ingredients.map((i) => i.category)));

export default function CreatePostModal({ open, onClose, onSubmit }) {
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIngredientIds, setSelectedIngredientIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const ingredientsByCategory = useMemo(() => {
    const map = new Map();
    for (const category of CATEGORIES) {
      map.set(
        category,
        ingredients.filter((i) => i.category === category)
      );
    }
    return map;
  }, []);

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { file: resized, previewUrl } = await resizeImageFile(file);
      setPhotoFile(resized);
      setPhotoPreviewUrl(previewUrl);
    } finally {
      setBusy(false);
    }
  }

  function toggleIngredient(id) {
    setSelectedIngredientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function reset() {
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setTitle("");
    setDescription("");
    setSelectedIngredientIds([]);
  }

  async function handleSubmit() {
    if (!photoFile || !title.trim() || selectedIngredientIds.length === 0) return;
    setSubmitting(true);
    try {
      await onSubmit({
        photoFile,
        title: title.trim(),
        description: description.trim(),
        ingredientIds: selectedIngredientIds,
      });
      reset();
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  const canSubmit = photoFile && title.trim() && selectedIngredientIds.length > 0 && !submitting;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="flex max-h-[88vh] w-full max-w-sm flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-cream-dark)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--color-ink)]">Tarif Paylaş</h2>
              <button
                onClick={handleClose}
                aria-label="Kapat"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm active:scale-90"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <label className="flex h-36 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[var(--color-cream-dark)] bg-[var(--color-cream)]">
                {photoPreviewUrl ? (
                  <img src={photoPreviewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm text-[var(--color-ink-soft)]">
                    {busy ? "Yükleniyor…" : "📷 Fotoğraf Ekle"}
                  </span>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </label>

              <input
                type="text"
                placeholder="Tarif adı"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-3 w-full rounded-xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)]"
              />
              <textarea
                placeholder="Kısa açıklama (opsiyonel)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="mt-2 w-full resize-none rounded-xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)]"
              />

              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Kullandığın Malzemeler ({selectedIngredientIds.length} seçili)
              </p>
              <div className="flex flex-col gap-3">
                {CATEGORIES.map((category) => (
                  <div key={category}>
                    <p className="mb-1 text-[11px] font-semibold text-[var(--color-ink-soft)]">
                      {CATEGORY_LABELS_TR[category] ?? category}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ingredientsByCategory.get(category).map((ingredient) => {
                        const isSelected = selectedIngredientIds.includes(ingredient.id);
                        return (
                          <button
                            key={ingredient.id}
                            onClick={() => toggleIngredient(ingredient.id)}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                              isSelected
                                ? "bg-[var(--color-olive)] text-white"
                                : "bg-[var(--color-cream)] text-[var(--color-ink-soft)]"
                            }`}
                          >
                            {ingredient.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[var(--color-cream-dark)] px-5 py-4">
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full rounded-full bg-[var(--color-paprika)] px-5 py-3 text-sm font-bold text-white shadow-sm active:scale-95 disabled:opacity-40"
              >
                {submitting ? "Paylaşılıyor…" : "Paylaş"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
