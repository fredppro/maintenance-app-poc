import { EquipmentPageClient } from "./equipment-page-client";
import { PageViewTransition } from "@/components/app-shell/page-view-transition";

export default function EquipmentPage() {
  return (
    <PageViewTransition>
      <EquipmentPageClient />
    </PageViewTransition>
  );
}
