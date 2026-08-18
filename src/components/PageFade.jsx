import { motion } from "framer-motion";

// Lightweight entrance transition applied to every page's root — makes
// navigation feel immediate rather than an abrupt swap.
export default function PageFade({ className = "flex flex-1 flex-col", children }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
