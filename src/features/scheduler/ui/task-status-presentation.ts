import { isTaskStatus, type TaskStatus } from "../task-status";
import type { SemanticTone } from "@/components/ui/semantic-tones";
import { CircleCheck, CircleDot, CircleHelp, CircleX, Clock3, type LucideIcon } from "lucide-react";

type StatusPresentation = {
  Icon: LucideIcon;
  surface: string;
  tone: SemanticTone;
  marker: string;
  toggle: string;
};

const neutral: StatusPresentation = {
  Icon: CircleHelp,
  surface: "border-status-cancelled/30 bg-status-cancelled/12 text-status-cancelled hover:bg-status-cancelled/20 hover:text-status-cancelled",
  tone: "neutral",
  marker: "bg-status-cancelled",
  toggle: "text-status-cancelled hover:bg-status-cancelled/10 data-[state=on]:bg-status-cancelled/15 data-[state=on]:text-status-cancelled",
};

/** Status, rather than maintenance type, determines the semantic work state. */
export const taskStatusPresentation = {
  scheduled: {
    Icon: Clock3,
    surface: "border-status-scheduled/30 bg-status-scheduled/12 text-status-scheduled hover:bg-status-scheduled/20 hover:text-status-scheduled",
    tone: "info",
    marker: "bg-status-scheduled",
    toggle: "text-status-scheduled hover:bg-status-scheduled/10 data-[state=on]:bg-status-scheduled/15 data-[state=on]:text-status-scheduled",
  },
  "in-progress": {
    Icon: CircleDot,
    surface: "border-status-in-progress/30 bg-status-in-progress/12 text-status-in-progress hover:bg-status-in-progress/20 hover:text-status-in-progress",
    tone: "warning",
    marker: "bg-status-in-progress",
    toggle: "text-status-in-progress hover:bg-status-in-progress/10 data-[state=on]:bg-status-in-progress/15 data-[state=on]:text-status-in-progress",
  },
  completed: {
    Icon: CircleCheck,
    surface: "border-status-completed/30 bg-status-completed/12 text-status-completed hover:bg-status-completed/20 hover:text-status-completed",
    tone: "success",
    marker: "bg-status-completed",
    toggle: "text-status-completed hover:bg-status-completed/10 data-[state=on]:bg-status-completed/15 data-[state=on]:text-status-completed",
  },
  cancelled: { ...neutral, Icon: CircleX },
} satisfies Record<TaskStatus, StatusPresentation>;

export function getTaskStatusPresentation(status: string) {
  return isTaskStatus(status) ? taskStatusPresentation[status] : neutral;
}
