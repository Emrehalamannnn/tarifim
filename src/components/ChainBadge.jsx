export default function ChainBadge({ chain, className = "" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ${className}`}
      style={{ backgroundColor: chain.color, color: chain.text }}
    >
      {chain.name}
    </span>
  );
}
