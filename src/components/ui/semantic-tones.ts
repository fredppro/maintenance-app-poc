export const semanticTones = {
  info: {
    badge: "border-tone-info/30 bg-tone-info/12 text-tone-info",
    indicator: "bg-tone-info",
    track: "bg-tone-info/15",
  },
  warning: {
    badge: "border-tone-warning/30 bg-tone-warning/12 text-tone-warning",
    indicator: "bg-tone-warning",
    track: "bg-tone-warning/15",
  },
  success: {
    badge: "border-tone-success/30 bg-tone-success/12 text-tone-success",
    indicator: "bg-tone-success",
    track: "bg-tone-success/15",
  },
  danger: {
    badge: "border-tone-danger/30 bg-tone-danger/12 text-tone-danger",
    indicator: "bg-tone-danger",
    track: "bg-tone-danger/15",
  },
  neutral: {
    badge: "border-tone-neutral/30 bg-tone-neutral/12 text-tone-neutral",
    indicator: "bg-tone-neutral",
    track: "bg-tone-neutral/15",
  },
} as const;

export type SemanticTone = keyof typeof semanticTones;
