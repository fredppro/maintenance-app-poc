export const motionTransitions = {
  enter: { duration: 0.18, ease: "easeOut" },
  exit: { duration: 0.12, ease: "easeOut" },
  indicator: { type: "spring", stiffness: 500, damping: 30 },
} as const;
