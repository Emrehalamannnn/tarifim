import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ingredients from "../data/ingredients.json";
import { resizeImageFile } from "../lib/resizeImage";
import { getCroppedImageFile } from "../lib/cropImage";
import { ALL_TAGS, tagLabel } from "../lib/tags";
import ImageCropModal from "./ImageCropModal";

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
  const [mediaMode, setMediaMode] = useState("photo");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recipeText, setRecipeText] = useState("");
  const [selectedIngredientIds, setSelectedIngredientIds] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);

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

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function handleCropConfirm(croppedAreaPixels) {
    setBusy(true);
    try {
      const croppedFile = await getCroppedImageFile(cropSrc, croppedAreaPixels);
      const { file: resized, previewUrl } = await resizeImageFile(croppedFile);
      setPhotoFile(resized);
      setPhotoPreviewUrl(previewUrl);
    } finally {
      setBusy(false);
      URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    }
  }

  function toggleIngredient(id) {
    setSelectedIngredientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleTag(tag) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function handleVideoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
  }

  function reset() {
    setMediaMode("photo");
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setTitle("");
    setDescription("");
    setRecipeText("");
    setSelectedIngredientIds([]);
    setSelectedTags([]);
  }

  async function handleSubmit() {
    const mediaFile = mediaMode === "video" ? videoFile : photoFile;
    if (!mediaFile || !title.trim() || selectedIngredientIds.length === 0) return;
    setSubmitting(true);
    try {
      await onSubmit({
        photoFile: mediaMode === "video" ? null : photoFile,
        videoFile: mediaMode === "video" ? videoFile : null,
        title: title.trim(),
        description: description.trim(),
        recipeText: recipeText.trim(),
        ingredientIds: selectedIngredientIds,
        tags: selectedTags,
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

  const canSubmit =
    (mediaMode === "video" ? videoFile : photoFile) &&
    title.trim() &&
    selectedIngredientIds.length > 0 &&
    !submitting;

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
            className="flex max-h-[88vh] w-full max-w-sm flex-col overflow-hidden rounded-t-[28px] bg-[var(--color-surface)] shadow-2xl sm:rounded-[28px]"
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
              <div className="mb-2 flex gap-1 rounded-full bg-[var(--color-cream)] p-1">
                <button
                  onClick={() => setMediaMode("photo")}
                  className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${
                    mediaMode === "photo" ? "bg-[var(--color-surface)] shadow-sm text-[var(--color-ink)]" : "text-[var(--color-ink-soft)]"
                  }`}
                >
                  📷 Fotoğraf
                </button>
                <button
                  onClick={() => setMediaMode("video")}
                  className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${
                    mediaMode === "video" ? "bg-[var(--color-surface)] shadow-sm text-[var(--color-ink)]" : "text-[var(--color-ink-soft)]"
                  }`}
                >
                  🎥 Video
                </button>
              </div>

              {mediaMode === "photo" ? (
                <label className="flex aspect-[4/5] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[var(--color-cream-dark)] bg-[var(--color-cream)]">
                  {photoPreviewUrl ? (
                    <img src={photoPreviewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm text-[var(--color-ink-soft)]">
                      {busy ? "Yükleniyor…" : "📷 Fotoğraf Ekle"}
                    </span>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                </label>
              ) : (
                <label className="flex aspect-[4/5] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[var(--color-cream-dark)] bg-[var(--color-cream)]">
                  {videoPreviewUrl ? (
                    <video src={videoPreviewUrl} className="h-full w-full object-cover" muted autoPlay loop playsInline />
                  ) : (
                    <span className="text-sm text-[var(--color-ink-soft)]">🎥 Video Ekle</span>
                  )}
                  <input type="file" accept="video/*" className="hidden" onChange={handleVideoChange} />
                </label>
              )}

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
                Tarif (opsiyonel)
              </p>
              <textarea
                placeholder="Yapılışını adım adım yaz — boş bırakırsan senin için yapay zekayla oluşturulur"
                value={recipeText}
                onChange={(e) => setRecipeText(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)]"
              />

              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Etiketler (opsiyonel)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        isSelected
                          ? "bg-[var(--color-paprika)] text-[var(--color-cream)]"
                          : "bg-[var(--color-cream)] text-[var(--color-ink-soft)]"
                      }`}
                    >
                      {tagLabel(tag)}
                    </button>
                  );
                })}
              </div>

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
                                ? "bg-[var(--color-olive)] text-[var(--color-cream)]"
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
                className="w-full rounded-full bg-[var(--color-paprika)] px-5 py-3 text-sm font-bold text-[var(--color-cream)] shadow-sm active:scale-95 disabled:opacity-40"
              >
                {submitting ? "Paylaşılıyor…" : "Paylaş"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      <ImageCropModal
        open={cropSrc !== null}
        imageSrc={cropSrc}
        aspect={4 / 5}
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
    </AnimatePresence>
  );
}
