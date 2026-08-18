// Real recipe photo when recipe.image_url is set (all 25 recipes have one,
// generated via Higgsfield). Falls back to a deterministic gradient + emoji
// block for any recipe that doesn't (e.g. future additions before art exists).
const GRADIENTS = [
  "from-[#f3a712] to-[#e2572b]",
  "from-[#e2572b] to-[#c8451e]",
  "from-[#5c7a3f] to-[#40592b]",
  "from-[#d13b3b] to-[#8a2323]",
  "from-[#f3a712] to-[#5c7a3f]",
  "from-[#c8451e] to-[#40592b]",
];

function gradientFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export default function RecipeArt({ recipe, className = "" }) {
  if (recipe.image_url) {
    return (
      <img
        src={recipe.image_url}
        alt={recipe.name}
        draggable={false}
        className={`block select-none object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`bg-gradient-to-br ${gradientFor(recipe.id)} flex items-center justify-center select-none ${className}`}
    >
      <span className="text-7xl drop-shadow-sm">{recipe.emoji}</span>
    </div>
  );
}
