import { Box } from "lucide-react";
import { cn } from "@/lib/utils";

interface EquipmentThumbnailProps {
  imageFileId: string | null;
  size: "sm" | "md";
}

const FRAME = { sm: "size-7", md: "size-10" } as const;
const ICON = { sm: "size-4", md: "size-5" } as const;

export function EquipmentThumbnail({ imageFileId, size }: EquipmentThumbnailProps) {
  if (imageFileId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/files/${imageFileId}`}
        alt=""
        className={cn(FRAME[size], "shrink-0 rounded-lg border border-border object-cover")}
      />
    );
  }
  return (
    <div
      className={cn(
        FRAME[size],
        "flex shrink-0 items-center justify-center rounded-lg bg-primary/10",
      )}
    >
      <Box className={cn(ICON[size], "text-primary")} />
    </div>
  );
}
